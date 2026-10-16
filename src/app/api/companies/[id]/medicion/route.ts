import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { valoresActuales, derivadosActuales, nombresProvisionales, fechaDia, COLUMNAS_MEDICION, type Medicion } from "@/lib/medicion";
import { radiografia, type Metrica } from "@/lib/metricas";
import { cargarMediciones } from "@/components/medicion/datos";
import { Fecha, CondicionesZ, validarPeriodo } from "./esquemas";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  tipo: z.enum(["linea_base", "corte"]),
  nota: z.string().trim().max(600).optional(),
  /** Obligatorio al volver a fijar el punto de partida: la versión anterior se conserva y hay que decir por qué nace otra. */
  motivo_version: z.string().trim().max(400).optional(),
  periodo_desde: Fecha.optional(),
  periodo_hasta: Fecha.optional(),
  condiciones: CondicionesZ.optional(),
});

/**
 * CONGELAR UNA MEDICIÓN. La primera es la línea base —el "antes"—; cada corte posterior es un
 * "después" que se compara contra ella. Se congela lo que la empresa tiene HOY en sus números, así
 * que antes de un corte el dueño actualiza sus nueve en /portal/numeros.
 *
 * Lo hace el dueño o el consultor: son los números de la empresa, no del consultor.
 *
 * VERSIONES (13-10-2026). Volver a fijar el punto de partida no borra el anterior: nace la versión
 * siguiente con su motivo, y los cortes ya medidos siguen apuntando a la versión con la que se
 * compararon. Por eso recongelar exige `motivo_version`. Período y condiciones se guardan con la
 * medición; nunca se tocan `valores` ni `derivados` de una medición existente.
 *
 * LO PROVISIONAL SE CONGELA ROTULADO. Si alguno de los números viene de un documento que nadie revisó, la
 * medición lo lleva escrito (dentro de `derivados`, ver `CLAVE_PROVISIONALES` en lib/medicion) y la respuesta
 * lo dice en `provisionales` y en `aviso_provisional`: se puede congelar, pero no se congela como firme.
 *
 * `aviso` ES TODO LO QUE HAY QUE SABER DE LA MEDICIÓN RECIÉN CONGELADA, en una sola línea. Hasta el 13-10-2026
 * lo provisional viajaba solo en `aviso_provisional`, y la pantalla de la consultora (que pinta `aviso` y nada
 * más) decía «Punto de partida fijado», firme. Ahora `aviso` lo incluye. El fallo al guardar período,
 * condiciones o motivo va además aparte, en `aviso_guardado`, para quien necesita distinguirlo.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  // Congelar una medición fija el «antes» o un «después» contra el que se juzgará si funcionó: es una aprobación.
  await exigirAutoridad(perfil, "cerrar_medicion");
  const b = await leerValidado(req, Cuerpo);
  const errorPeriodo = validarPeriodo(b.periodo_desde, b.periodo_hasta);
  if (errorPeriodo) return fallo(errorPeriodo, 400);
  const sb = supabaseAdmin();

  const { data: metricasRaw } = await sb
    .from("company_metricas")
    .select("clave,periodo,valor,estado")
    .eq("company_id", id)
    .limit(300);
  const metricas = (metricasRaw ?? []) as Metrica[];

  const valores = valoresActuales(metricas);
  if (Object.keys(valores).length === 0)
    return fallo("Todavía no hay ningún número que congelar. Completa tus números primero.", 400);

  // Una línea base con dos números no sirve de punto de partida: después no habría contra qué
  // comparar y el "funcionó" sería una opinión otra vez.
  const r = radiografia(metricas);
  if (b.tipo === "linea_base" && r.listos < 5)
    return fallo(`Para fijar el punto de partida hacen falta al menos 5 de los 9 números. Tienes ${r.listos}.`, 400);

  const existentes = await cargarMediciones(sb, id);
  if (b.tipo === "linea_base" && existentes.vigente) {
    const motivo = b.motivo_version ?? "";
    if (motivo.length < 8) {
      const v = existentes.vigente;
      return fallo(
        `Ya hay un punto de partida (versión ${v.version ?? 1}, del ${fechaDia(v.fecha)}). Para volver a fijarlo di por qué en «motivo de la nueva versión»: la anterior se conserva y los cortes ya medidos siguen comparándose con ella.`,
        400
      );
    }
  }
  // 409 y no 400, igual que al registrar el corte desde el plan (/close): la petición está bien formada; lo
  // que choca es el estado de la empresa, que todavía no tiene punto de partida. No se escribe nada.
  if (b.tipo === "corte" && !existentes.vigente)
    return fallo("No hay punto de partida contra el que medir este corte. Fija primero el punto de partida.", 409);

  const derivadosCongelados = derivadosActuales(metricas);
  const { data, error } = await sb.rpc("congelar_medicion", {
    p_company: id,
    p_tipo: b.tipo,
    p_valores: valores,
    p_derivados: derivadosCongelados,
    p_nota: b.nota ?? null,
    p_por: perfil.id,
  });
  if (error) return fallo(error.message, 500);
  let medicion = (Array.isArray(data) ? data[0] : data) as Medicion;

  // Lo que la función de base no recibe (período, condiciones, motivo) se guarda aparte, SOLO en esas
  // columnas: valores y derivados no se tocan jamás después de congelados.
  const meta: Record<string, unknown> = {};
  if (b.tipo === "linea_base" && b.motivo_version) meta.motivo_version = b.motivo_version;
  if (b.periodo_desde && b.periodo_hasta) {
    meta.periodo_desde = b.periodo_desde;
    meta.periodo_hasta = b.periodo_hasta;
  }
  if (b.condiciones) meta.condiciones = b.condiciones;
  let avisoGuardado: string | null = null;
  if (medicion?.id && Object.keys(meta).length) {
    const { data: conMeta, error: e2 } = await sb.from("mediciones").update(meta).eq("id", medicion.id).select(COLUMNAS_MEDICION).single();
    if (e2) avisoGuardado = `La medición quedó congelada, pero no se pudo guardar período, condiciones o motivo: ${e2.message}`;
    else if (conMeta) medicion = conMeta as unknown as Medicion;
  }

  // Qué números se congelaron siendo provisionales, con el nombre que lee el dueño. Se lee de la medición
  // tal como quedó guardada; si la fila devuelta no trae sus cálculos, de lo que se mandó a congelar.
  const provisionales = nombresProvisionales({ derivados: medicion?.derivados ?? derivadosCongelados });
  const avisoProvisional = provisionales.length
    ? `${provisionales.length === 1 ? "Un número de esta medición sale" : `${provisionales.length} números de esta medición salen`} de un documento que falta revisar (${provisionales.join(", ")}): ${provisionales.length === 1 ? "queda guardado como provisional" : "quedan guardados como provisionales"} y no se ${provisionales.length === 1 ? "lee" : "leen"} como resultado hasta que se revise${provisionales.length === 1 ? "" : "n"}.`
    : null;

  void registrar({
    companyId: id, actor: perfil, accion: "crear", entidad: "medicion", entidadId: medicion?.id,
    detalle: { tipo: b.tipo, numero: medicion?.numero, version: medicion?.version ?? null, linea_base_id: medicion?.linea_base_id ?? null, numeros: Object.keys(valores).length, motivo_version: b.motivo_version ?? null, provisionales: provisionales.length },
    ruta: "/api/companies/medicion", ip: ipDe(req),
  });
  const aviso = [avisoGuardado, avisoProvisional].filter((a): a is string => Boolean(a)).join(" ");
  return ok(
    {
      medicion,
      ...(aviso ? { aviso } : {}),
      ...(avisoGuardado ? { aviso_guardado: avisoGuardado } : {}),
      ...(avisoProvisional ? { provisionales, aviso_provisional: avisoProvisional } : {}),
    },
    201
  );
});

/** Las mediciones de la empresa con sus versiones: la vigente, las anteriores y los cortes con la versión contra la que se midieron. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const m = await cargarMediciones(supabaseAdmin(), id);
  return ok({ mediciones: m.mediciones, vigente: m.vigente, versiones: m.versiones, cortes: m.cortes, con_versiones: m.conVersiones });
});

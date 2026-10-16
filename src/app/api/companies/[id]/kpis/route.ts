import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { normalizarClave, type Metrica } from "@/lib/metricas";
import { desdeFila, completitud, listo, alertas, avance, kpisDesdeVitales } from "@/lib/kpis";
import { Crear, COLUMNAS, comprobarCoherencia, comprobarReferencias } from "./_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: los indicadores de la empresa con lo que hace falta para dirigir con ellos: qué les falta,
 * qué alertan y cuánto avanzaron. Y las propuestas que salen de los nueve números, rotuladas
 * «propuesto» y sin crear nada. Lo lee el consultor y también el dueño de la empresa.
 */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const hoy = new Date();

  const [{ data: filas, error }, { data: metricas }, { data: plan }] = await Promise.all([
    sb.from("indicadores").select("*").eq("company_id", id).order("created_at"),
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", id).limit(300),
    // El plan, para que «meta sin plan» no se diga de un indicador que una acción ya persigue.
    sb.from("actions").select("id,estado,indicador_id,accion,verificado_at").eq("company_id", id),
  ]);
  if (error) return fallo(error.message, 500);

  const kpis = ((filas ?? []) as Record<string, unknown>[]).map(desdeFila).map((k) => ({
    ...k,
    completitud: completitud(k),
    listo: listo(k).ok,
    alertas: k.estado === "activo" ? alertas(k, hoy, plan ?? undefined) : [],
    avance: avance(k),
  }));
  const existentes = new Set(kpis.map((k) => k.clave));
  const propuestas = kpisDesdeVitales(id, (metricas ?? []) as Metrica[]).filter((p) => !existentes.has(p.kpi.clave));
  return ok({ kpis, propuestas });
});

/**
 * POST: crear un indicador con los doce atributos. Lo hace la consultora: definir qué se mide y cómo
 * es parte del método. Nace «propuesto» salvo que se diga lo contrario. El valor actual no entra por
 * aquí: se registra con dato en /valor. Y no puede nacer archivado: archivar pide motivo y deja rastro,
 * y eso se hace sobre un indicador que existe (PATCH /kpis/[kid]).
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (perfil.rol !== "consultor") throw new AccesoDenegado("Definir un indicador es tarea de la consultora; tú registras sus valores.", "rol", id);
  const b = await leerValidado(req, Crear);
  if (b.estado === "archivado") return fallo("Un indicador nace propuesto o activo. Para archivarlo, créalo primero y archívalo después diciendo por qué.", 400);
  const sb = supabaseAdmin();

  const clave = normalizarClave(b.clave?.trim() || b.nombre);
  if (!clave) return fallo("No se pudo formar una clave a partir del nombre.", 400);
  const como_se_mide = b.como_se_mide ?? b.formula ?? b.definicion;
  if (!como_se_mide) return fallo("Di al menos qué mide o cómo se calcula.", 400);

  const coherencia = comprobarCoherencia({
    unidad: b.unidad, moneda: b.moneda ?? null, frecuencia: b.frecuencia,
    linea_base_valor: b.linea_base_valor ?? null, linea_base_periodo: b.linea_base_periodo ?? null,
    meta_valor: b.meta_valor ?? null, meta_texto: b.meta_texto ?? null, meta_plazo: b.meta_plazo ?? null,
    umbral_alerta: b.umbral_alerta ?? null, umbral_sentido: b.umbral_sentido ?? null,
  });
  if (!coherencia.ok) return fallo(coherencia.motivo, 400);
  const ajeno = await comprobarReferencias(sb, id, b);
  if (ajeno) return fallo(ajeno, 400);

  const fila: Record<string, unknown> = { company_id: id, clave, como_se_mide, origen: "manual", creado_por: perfil.id, estado: b.estado ?? "propuesto" };
  for (const col of COLUMNAS) if (b[col] !== undefined && col !== "clave" && col !== "como_se_mide" && col !== "estado") fila[col] = b[col];
  fila.moneda = coherencia.moneda;

  const { data, error } = await sb.from("indicadores").insert(fila).select("*").single();
  if (error) {
    if (error.code === "23505") return fallo(`Ya hay un indicador con la clave «${clave}» en esta empresa.`, 409);
    return fallo(error.message, 500);
  }
  const kpi = desdeFila(data as Record<string, unknown>);
  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "indicador", entidadId: kpi.id, detalle: { clave, tipo_indicador: kpi.tipo_indicador, estado: kpi.estado }, ruta: "/api/companies/kpis", ip: ipDe(req) });
  refrescarRuta(id, "ruta");
  return ok({ kpi, completitud: completitud(kpi), listo: listo(kpi).ok }, 201);
});

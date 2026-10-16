import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirLlenado, type Seccion } from "@/lib/solicitudes";
import { CuerpoNegocio, CuerpoNegocioDueno, type BloqueFicha } from "@/lib/esquemas-negocio";
import { leerFichaNegocio, leerTrabajoEmpresa, sembrarEpocaDorada, ErrorDeNegocio, faltaMigracionNegocio, TEXTO_FALTA_MIGRACION, COLUMNAS_FICHA } from "@/lib/negocio-datos";
import { fichaDesdeFila } from "@/lib/rentabilidad";
import { respuestaDeBase, exigirAlgunaSeccion, exigirModulo, textoComprobadoFila } from "./_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/negocio";

/** GET: lo que la empresa respondió una vez (historia, módulos, totales, moneda, crédito, inventario) y su trabajo. */
export const GET = protegido<Ctx>({ entidad: "ficha_negocio" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  try {
    const [ficha, trabajo] = await Promise.all([leerFichaNegocio(id), leerTrabajoEmpresa(id)]);
    return ok({ ficha, trabajo });
  } catch (e) {
    if (e instanceof ErrorDeNegocio && faltaMigracionNegocio(e.codigo)) return fallo(TEXTO_FALTA_MIGRACION, 409);
    throw e;
  }
});

/** Qué sección tiene que estar abierta para que el dueño escriba cada bloque. */
const SECCION_DEL_BLOQUE: Record<BloqueFicha, Seccion[]> = {
  historia: ["historia"],
  totales: ["productos"],
  moneda: ["moneda"],
  credito: ["credito"],
  inventario: ["inventario"],
  modulos: ["productos", "moneda", "credito", "inventario"],
};

// ─── Lo comprobado por la consultora no lo pisa el dueño ─────────────────────────────────────────

type Hoja = { ruta: string[]; valor: unknown };
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Los datos marcados «comprobado» dentro de un valor (él mismo, o un sub-objeto suyo: la venta de la mejor época). */
function hojasComprobadas(v: unknown, ruta: string[] = []): Hoja[] {
  if (!esObjeto(v)) return [];
  if (v.estado === "comprobado") return [{ ruta, valor: v }];
  return Object.entries(v).flatMap(([k, x]) => hojasComprobadas(x, [...ruta, k]));
}
const en = (v: unknown, ruta: string[]): unknown => ruta.reduce<unknown>((x, k) => (esObjeto(x) ? x[k] : undefined), v);
/** JSON con las claves ordenadas: lo que viene de la base (jsonb) no conserva el orden en que se escribió. */
const estable = (v: unknown): string => JSON.stringify(v, (_k, x) => (esObjeto(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const NOMBRE_DEL_DATO: Record<string, string> = {
  anio_inicio: "El año en que empezó el negocio",
  venta_inicial: "Lo que vendía al empezar",
  mejor_epoca: "Lo de tu mejor época",
  dias_al_mes: "Los días que abres en un mes",
  dias_cobro: "Los días que tardan en pagarte",
  operaciones_mes: "Las ventas en otra moneda de un mes",
  monto_tipico: "El monto típico de esas ventas",
  de_cada_10: "Cuántas ventas son al crédito",
  dias: "Los días que tardan en pagarte",
  incobrables_de_cada_10: "Cuántos no te pagan",
  valor: "El dinero en mercadería",
  meses: "Para cuántos meses te alcanza",
  parado: "La mercadería que no se mueve",
};

/**
 * Para el dueño: cada clave que llega se mira contra lo que había. Un dato comprobado que viene con OTRO valor (o en
 * null) es un 409 con qué dato es; uno que no viene se conserva tal cual (la pantalla no puede mandar «comprobado»:
 * al guardar el resto de su tarjeta lo omite, y mezclar() reemplaza la clave entera). Devuelve los datos ya con lo
 * comprobado repuesto, o el nombre del dato que se intentó pisar.
 */
function cuidarComprobado(bloque: BloqueFicha, antes: Record<string, unknown>, datos: Record<string, unknown>): { datos: Record<string, unknown> } | { pisa: string } {
  const salida: Record<string, unknown> = { ...datos };
  const revisar = (previo: unknown, llega: unknown, nombre: string): { valor: unknown } | { pisa: string } => {
    let valor = llega;
    for (const h of hojasComprobadas(previo)) {
      const nuevo = en(valor, h.ruta);
      if (nuevo === undefined && h.ruta.length > 0 && esObjeto(valor)) {
        // Se repone dentro del objeto que llega, en su lugar.
        const copia = structuredClone(valor) as Record<string, unknown>;
        let x: Record<string, unknown> = copia;
        for (const k of h.ruta.slice(0, -1)) {
          if (!esObjeto(x[k])) x[k] = {};
          x = x[k] as Record<string, unknown>;
        }
        x[h.ruta[h.ruta.length - 1]!] = h.valor;
        valor = copia;
        continue;
      }
      if (estable(nuevo) !== estable(h.valor)) return { pisa: nombre };
    }
    return { valor };
  };
  for (const [clave, llega] of Object.entries(datos)) {
    if (bloque === "totales" && clave === "grupos" && esObjeto(llega)) {
      // Los grupos se mezclan uno por uno: se mira cada grupo que llega contra el suyo.
      const previos = esObjeto(antes.grupos) ? antes.grupos : {};
      for (const [g, v] of Object.entries(llega)) {
        const previo = Object.entries(previos).find(([k]) => k.trim() === g.trim())?.[1];
        const r = revisar(previo, v, g.trim() ? `El total de «${g.trim()}»` : "El total de lo que vendes");
        if ("pisa" in r) return r;
      }
      continue;
    }
    const r = revisar(antes[clave], llega, NOMBRE_DEL_DATO[clave] ?? "Este dato");
    if ("pisa" in r) return r;
    salida[clave] = r.valor;
  }
  return { datos: salida };
}

/** Mezcla lo que llega con lo que había: cada clave que llega reemplaza la suya. En los totales por grupo, null quita el grupo. */
function mezclar(bloque: BloqueFicha, antes: Record<string, unknown>, datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...antes, ...datos };
  if (bloque === "totales" && datos.grupos !== undefined) {
    const grupos: Record<string, unknown> = { ...((antes.grupos as Record<string, unknown> | undefined) ?? {}) };
    for (const [k, v] of Object.entries((datos.grupos as Record<string, unknown>) ?? {})) {
      const clave = k.trim();
      if (v === null) delete grupos[clave];
      else grupos[clave] = v;
    }
    salida.grupos = grupos;
  }
  return salida;
}

/**
 * PATCH { bloque, datos }: guardar una parte de la ficha (se mezcla con lo que había: cada tarjeta guarda lo suyo).
 * El dueño escribe cada bloque solo con su sección abierta: la historia con «historia»; los totales para «de cada 10»
 * con «productos»; moneda, crédito e inventario con la suya, o con «productos» abierta si ya respondió «sí» a esa
 * pregunta (exigirModulo); los módulos (las tres preguntas de sí o no) con cualquiera de esas. Un dato que la
 * consultora comprobó con un documento no lo pisa el dueño: 409 con qué dato es. Cómo gana dinero
 * (`modelo_negocio`) lo puede elegir el dueño solo si está vacío y con «productos» abierta; si no, es de la consultora.
 *
 * Si la historia trae cuánto vendía al mes en su mejor época y la empresa no tiene ese número todavía, se siembra en
 * sus 9 números (nunca se pisa uno que ya existe) y la respuesta lo dice: { sembrado }.
 */
export const PATCH = protegido<Ctx>({ entidad: "ficha_negocio" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  const sb = supabaseAdmin();

  // La sección se exige antes de leer el cuerpo: sin permiso no se valida nada. El bloque se mira primero, sin validar.
  const crudo = (await req.clone().json().catch(() => ({}))) as { bloque?: unknown };
  if (!esConsultora) {
    if (crudo.bloque === "modelo_negocio") await exigirLlenado(perfil, id, "productos");
    // Un módulo: su sección, o «productos» abierta y la empresa ya dijo «sí» a esa pregunta (se enciende con ella).
    else if (crudo.bloque === "moneda" || crudo.bloque === "credito" || crudo.bloque === "inventario") await exigirModulo(perfil, id, crudo.bloque);
    else if (typeof crudo.bloque === "string" && crudo.bloque in SECCION_DEL_BLOQUE) await exigirAlgunaSeccion(perfil, id, SECCION_DEL_BLOQUE[crudo.bloque as BloqueFicha]);
  }
  const b = esConsultora ? await leerValidado(req, CuerpoNegocio) : await leerValidado(req, CuerpoNegocioDueno);

  if (b.bloque === "modelo_negocio") {
    const trabajo = await leerTrabajoEmpresa(id);
    if (!esConsultora && trabajo.modelo_negocio.length > 0) throw new AccesoDenegado("Tu consultora ya anotó cómo gana dinero tu negocio. Si cambió, díselo.", "autoridad", id);
    const { error } = await sb.from("companies").update({ modelo_negocio: b.datos }).eq("id", id);
    if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar cómo gana dinero el negocio", perfil, companyId: id });
    void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "ficha_negocio", detalle: { bloque: "modelo_negocio", antes: trabajo.modelo_negocio, despues: b.datos }, ruta: RUTA, ip: ipDe(req) });
    return ok({ modelo_negocio: b.datos });
  }

  const { data: fila, error: errorLeer } = await sb.from("ficha_negocio").select(COLUMNAS_FICHA).eq("company_id", id).maybeSingle();
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "PATCH", que: "leer la ficha del negocio", perfil, companyId: id });
  const antes = ((fila as Record<string, unknown> | null)?.[b.bloque] ?? {}) as Record<string, unknown>;
  let datos = b.datos as Record<string, unknown>;
  // Lo que la consultora comprobó con un documento no lo cambia el dueño (como en costos, ventas en otra moneda y
  // productos): 409 con qué dato es. La pantalla lo bloquea; la que protege es esta ruta.
  if (!esConsultora) {
    const r = cuidarComprobado(b.bloque, antes, datos);
    if ("pisa" in r) return fallo(textoComprobadoFila(r.pisa), 409);
    datos = r.datos;
  }
  const nuevo = mezclar(b.bloque, antes, datos);
  const { data: guardada, error } = await sb
    .from("ficha_negocio")
    .upsert({ company_id: id, [b.bloque]: nuevo, actualizado_por: perfil.id, updated_at: new Date().toISOString() }, { onConflict: "company_id" })
    .select(COLUMNAS_FICHA)
    .single();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar la ficha del negocio", perfil, companyId: id });

  let sembrado = false;
  if (b.bloque === "historia" && b.datos.mejor_epoca?.venta_mes) {
    try {
      sembrado = await sembrarEpocaDorada(id, b.datos.mejor_epoca.venta_mes);
    } catch (e) {
      // La historia ya quedó guardada: que no se haya podido sembrar el número no la deshace, pero no se calla.
      return respuestaDeBase({ message: e instanceof Error ? e.message : String(e), code: e instanceof ErrorDeNegocio ? e.codigo : null }, { ruta: RUTA, metodo: "PATCH", que: "anotar la venta de tu mejor época en tus números (la historia sí quedó guardada)", perfil, companyId: id });
    }
  }
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "ficha_negocio", detalle: { bloque: b.bloque, claves: Object.keys(b.datos), sembrado, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  // La ruta cuenta la ficha (y, si se sembró la mejor época, también los 9 números).
  refrescarRuta(id, sembrado ? "todo" : "negocio");
  return ok({ ficha: fichaDesdeFila(guardada as unknown as Record<string, unknown>), sembrado });
});

/**
 * LO QUE LA CONSULTORA HACE CON UNA VERSIÓN DE LA ESTRATEGIA (spec-estrategia-8x.md §5.4, §7.3 y §8.1). SERVIDOR.
 *
 * Cada acción lee la versión de ESTA empresa (el id solo no basta), comprueba su estado y escribe con el estado de
 * partida en la consulta: si dos personas tocan la misma versión a la vez, una gana y la otra lee «cambió mientras
 * tanto». Las rutas (src/app/api/companies/[id]/estrategia/**) solo exigen la sesión, la empresa y la autoridad, y
 * traducen el resultado.
 *
 *  - corregirVersion: un texto, el rango de una cifra por confirmar, aceptar lo que 8X quitó, volver a lo de 8X, o
 *    elegir el camino. Solo en «lista» o «con_observaciones»: una aprobada ya la ve el cliente (409 con qué hacer).
 *    Cada cambio vuelve a validar y deja su fila en estrategia_ediciones (antes y después).
 *  - descartarVersion: una en curso pasa a «descartada» y libera el «una en curso»; lo ya pagado queda en la fila.
 *  - aprobarVersion: camino elegido, nada sin resolver, la página del dueño se congela con las cifras ya escritas;
 *    la anterior aprobada pasa a «reemplazada» (aprobar_estrategia, en una transacción) y se guarda la copia en la
 *    biblioteca, que es SOLO la página del dueño.
 *  - actualizarNumeros: relee la empresa SIN llamar al modelo, rehace las cuentas y crea una versión nueva que copia
 *    lo que escribió 8X y lo que corrigió la consultora; vuelve a validar y dice qué cambió.
 *  - reintentarEtapa: vuelve a encolar SOLO la etapa fallida, sobre su último trabajo.
 */
import { supabaseAdmin } from "../supabase/admin";
import { tokensUsados } from "../db/queries";
import { reencolarSeguro } from "../jobs/queue";
import { lanzarEquipoRojo } from "../jobs/handlers/estrategia";
import { huellaPaquete } from "./paquete";
import { refsDeEstrategia, reproyectar, type Estrategia, type LetraCamino } from "./armar";
import { proyectarLentes, TOKENS_POR_ESTRATEGIA } from "./motor";
import { congelar } from "./generar";
import { leerEntradasPaquete, ErrorLecturaCritica } from "./paquete-datos";
import { ErrorDeEstrategia, leerEtapasPorId, leerVersionPorId, trabajosDeVersion, estadoDeEtapas, versiones, type EtapaMotor, type EstadoDeEtapas, type ResumenVersion, type VersionEstrategia } from "./datos";
import { aceptarQuitado, editarSupuesto, editarTexto, porResolver, restaurarTexto, revisarVersion, type ResultadoEdicion, type Revision } from "./edicion";
import { contenidoEntregable, PaginaDelDuenoInvalida, vistaParaDueno, type ParaDueno } from "./para-dueno";
import { convieneRegenerar, diferencias, type Diferencias } from "./diferencias";
import { bajarAlPlan, loQueFalta, type YaBajado } from "./al-plan";
import { pedidosDesdeFaltantes } from "./pedidos";
import { proponerPreguntas } from "./preguntas";
import { API, ETAPA, MOTOR } from "./textos";
import { faltaLaMigracion, mensajeDe, no, type Fallo, type Resultado } from "./resultado";

const ahoraIso = () => new Date().toISOString();

// ─── Leer ────────────────────────────────────────────────────────────────────────────────────────

/** Si la tabla todavía no existe en esta base (la migración sin aplicar), el 409 que lo dice; si no, se relanza. */
function sinMigracion(e: unknown): Fallo {
  if (e instanceof ErrorDeEstrategia && faltaLaMigracion(e.codigo)) return no(409, "no_habilitada", API.no_habilitada);
  throw e;
}

/** La versión de esta empresa, o el 404 con su texto. */
async function laVersion(companyId: string, id: string): Promise<VersionEstrategia | Fallo> {
  try {
    const v = await leerVersionPorId(companyId, id);
    return v ?? no(404, "version_no_existe", API.version_no_existe);
  } catch (e) {
    return sinMigracion(e);
  }
}
const esFallo = (x: unknown): x is Fallo => !!x && typeof x === "object" && (x as { ok?: unknown }).ok === false;

/** Lo que no se corrige según el estado, con su texto (§7.3). */
function noSeCorrige(v: Pick<VersionEstrategia, "estado" | "vigente">): Fallo | null {
  if (v.estado === "aprobada") return no(409, "aprobada", API.ya_la_ve_el_cliente);
  if (v.estado === "reemplazada") return no(409, "reemplazada", API.ya_la_vio_el_cliente);
  if (v.estado === "en_curso") return no(409, "en_curso", API.generandose);
  if (v.estado === "descartada") return no(409, "descartada", API.descartada);
  if (!v.vigente) return no(409, "sin_estrategia", API.generandose);
  return null;
}

export type Resumen = {
  versiones: ResumenVersion[];
  en_curso: { id: string; version: number; etapas: EstadoDeEtapas } | null;
  consumo: { usados: number; tope: number; por_estrategia: number; texto: string } | null;
};

/** Las versiones de la empresa, en qué va la que se está generando y cuánto le queda de su tope (§8.1). */
export async function resumenDeEstrategias(companyId: string): Promise<Resultado<Resumen>> {
  let lista: ResumenVersion[];
  try {
    lista = await versiones(companyId);
  } catch (e) {
    return sinMigracion(e);
  }
  const curso = lista.find((v) => v.estado === "en_curso");
  let en_curso: Resumen["en_curso"] = null;
  if (curso) {
    const v = await leerVersionPorId(companyId, curso.id);
    if (v) en_curso = { id: v.id, version: v.version, etapas: estadoDeEtapas(v, await trabajosDeVersion(v)) };
  }
  let consumo: Resumen["consumo"] = null;
  try {
    const { data } = await supabaseAdmin().from("companies").select("tope_tokens").eq("id", companyId).maybeSingle();
    const tope = Number((data as { tope_tokens?: number | null } | null)?.tope_tokens ?? 2_000_000);
    const usados = await tokensUsados(companyId);
    consumo = { usados, tope, por_estrategia: TOKENS_POR_ESTRATEGIA, texto: MOTOR.consumo(usados, tope, TOKENS_POR_ESTRATEGIA) };
  } catch {
    // Sin la cuenta del consumo, la pantalla no inventa una: lo dice al pedir (generar.ts no gasta sin ella).
  }
  return { ok: true, versiones: lista, en_curso, consumo };
}

export type Detalle = {
  version: VersionEstrategia;
  etapas: EstadoDeEtapas | null;
  ediciones: Record<string, unknown>[];
  /** «Qué cambió» respecto de la versión en que se basa (las que vienen de «Actualizar números»). */
  que_cambio: { diferencias: Diferencias; regenerar: { conviene: boolean; motivos: string[] } } | null;
  /** Las respuestas del dueño que llegaron después de esta versión: la franja «Actualizar números». */
  respuestas_nuevas: number | null;
};

/** Una versión entera para la consultora, con en qué va, su rastro y qué cambió. */
export async function detalleDeVersion(companyId: string, id: string): Promise<Resultado<Detalle>> {
  const v = await laVersion(companyId, id);
  if (esFallo(v)) return v;
  const sb = supabaseAdmin();
  const etapas = v.estado === "en_curso" ? estadoDeEtapas(v, await trabajosDeVersion(v)) : null;
  const { data: ed } = await sb.from("estrategia_ediciones").select("id,puntero,tipo,antes,despues,autor,created_at").eq("estrategia_id", v.id).eq("company_id", companyId).order("created_at", { ascending: true }).limit(500);
  let que_cambio: Detalle["que_cambio"] = null;
  if (v.basada_en && v.vigente) {
    const base = await leerVersionPorId(companyId, v.basada_en);
    if (base?.vigente) {
      const d = diferencias({ paquete: base.paquete, estrategia: base.vigente }, { paquete: v.paquete, estrategia: v.vigente });
      que_cambio = { diferencias: d, regenerar: convieneRegenerar(d) };
    }
  }
  const nuevas = await sb.from("estrategia_preguntas").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "respondida").gt("respondida_at", v.created_at);
  return { ok: true, version: v, etapas, ediciones: (ed ?? []) as Record<string, unknown>[], que_cambio, respuestas_nuevas: nuevas.error ? null : (nuevas.count ?? 0) };
}

/** Solo en qué va (para seguir el avance sin traer la versión entera). */
export async function etapasDeVersion(companyId: string, id: string): Promise<Resultado<{ estado: VersionEstrategia["estado"]; etapa: VersionEstrategia["etapa"]; etapas: EstadoDeEtapas }>> {
  let v: Awaited<ReturnType<typeof leerEtapasPorId>>;
  try {
    v = await leerEtapasPorId(companyId, id);
  } catch (e) {
    return sinMigracion(e);
  }
  if (!v) return no(404, "version_no_existe", API.version_no_existe);
  return { ok: true, estado: v.estado, etapa: v.etapa, etapas: estadoDeEtapas(v, await trabajosDeVersion(v)) };
}

// ─── Corregir y elegir ───────────────────────────────────────────────────────────────────────────

export type Correccion =
  | { tipo: "texto"; puntero: string; texto: string }
  | { tipo: "supuesto"; id: string; bajo: number; alto: number }
  | { tipo: "aceptar"; puntero: string }
  | { tipo: "restaurar"; puntero: string }
  | { tipo: "elegir"; camino: LetraCamino; motivo: string | null };

/** El tipo de la fila de estrategia_ediciones de cada corrección. */
const TIPO_EDICION: Record<Correccion["tipo"], "texto" | "supuesto" | "eleccion" | "quitar" | "restaurar"> = {
  texto: "texto",
  supuesto: "supuesto",
  aceptar: "quitar",
  restaurar: "restaurar",
  elegir: "eleccion",
};

export type ResultadoCorreccion = { estado: VersionEstrategia["estado"]; vigente: Estrategia; validacion: Revision["validacion"]; calidad: Revision["calidad"]; camino_elegido: LetraCamino | null; aviso: string | null };

/**
 * Una corrección de la consultora sobre una versión lista o con observaciones: cambia `vigente` (nunca `salida`),
 * vuelve a validar, deja el estado que corresponde y una fila en el rastro.
 */
export async function corregirVersion(x: { companyId: string; id: string; correccion: Correccion; porId: string | null }): Promise<Resultado<ResultadoCorreccion>> {
  const v = await laVersion(x.companyId, x.id);
  if (esFallo(v)) return v;
  const cerrada = noSeCorrige(v);
  if (cerrada) return cerrada;
  const vigente = v.vigente!;
  const c = x.correccion;

  let edicion: ResultadoEdicion;
  if (c.tipo === "texto") edicion = editarTexto(vigente, c.puntero, c.texto, v.paquete);
  else if (c.tipo === "supuesto") edicion = editarSupuesto(vigente, c.id, { bajo: c.bajo, alto: c.alto }, v.paquete, v.calculos);
  else if (c.tipo === "aceptar") edicion = aceptarQuitado(vigente, c.puntero);
  else if (c.tipo === "restaurar") edicion = v.salida ? restaurarTexto(vigente, v.salida, c.puntero) : { ok: false, texto: API.no_editable };
  else edicion = { ok: true, vigente, puntero: "/camino_elegido", antes: v.camino_elegido, despues: c.camino };
  if (!edicion.ok) return no(400, "no_se_corrige", edicion.texto);

  const r = revisarVersion(edicion.vigente, v.salida, v.paquete, v.calculos);
  const cambios: Record<string, unknown> = {
    vigente: edicion.vigente,
    validacion: { ...r.validacion, de: "final" },
    calidad: { items: r.calidad },
    estado: r.estado,
    updated_at: ahoraIso(),
  };
  if (c.tipo === "elegir") Object.assign(cambios, { camino_elegido: c.camino, motivo_eleccion: c.motivo });
  // El estado y la hora de partida van en la consulta: si otra pestaña la cambió, esta no la pisa.
  const guarda = supabaseAdmin()
    .from("estrategias")
    .update(cambios)
    .eq("id", v.id)
    .eq("company_id", x.companyId)
    .in("estado", ["lista", "con_observaciones"]);
  const { data, error } = await (v.updated_at ? guarda.eq("updated_at", v.updated_at) : guarda.is("updated_at", null)).select("id");
  if (error) return no(500, "guardar", mensajeDe(error));
  if (!((data ?? []) as unknown[]).length) return no(409, "cambio_mientras_tanto", API.cambio_mientras_tanto);

  const rastro = await supabaseAdmin().from("estrategia_ediciones").insert({
    estrategia_id: v.id,
    company_id: x.companyId,
    puntero: edicion.puntero,
    tipo: TIPO_EDICION[c.tipo],
    antes: edicion.antes ?? null,
    despues: c.tipo === "elegir" && c.motivo ? { camino: c.camino, motivo: c.motivo } : (edicion.despues ?? null),
    autor: x.porId,
  });
  return {
    ok: true,
    estado: r.estado,
    vigente: edicion.vigente,
    validacion: r.validacion,
    calidad: r.calidad,
    camino_elegido: c.tipo === "elegir" ? c.camino : v.camino_elegido,
    aviso: rastro.error ? API.sin_rastro(mensajeDe(rastro.error)) : null,
  };
}

// ─── Descartar ───────────────────────────────────────────────────────────────────────────────────

/** Una versión que se está generando pasa a «descartada»: libera el «una en curso». Lo pagado queda en la fila. */
export async function descartarVersion(x: { companyId: string; id: string }): Promise<Resultado<{ estado: "descartada" }>> {
  const v = await laVersion(x.companyId, x.id);
  if (esFallo(v)) return v;
  if (v.estado !== "en_curso") return no(409, "no_en_curso", API.solo_se_descarta_en_curso);
  const { data, error } = await supabaseAdmin().from("estrategias").update({ estado: "descartada", updated_at: ahoraIso() }).eq("id", v.id).eq("company_id", x.companyId).eq("estado", "en_curso").select("id");
  if (error) return no(500, "guardar", mensajeDe(error));
  if (!((data ?? []) as unknown[]).length) return no(409, "no_en_curso", API.solo_se_descarta_en_curso);
  return { ok: true, estado: "descartada" };
}

// ─── Aprobar ─────────────────────────────────────────────────────────────────────────────────────

export type ResultadoAprobar = {
  estado: "aprobada";
  para_dueno: ParaDueno;
  entregable_id: string | null;
  /** Cuántas acciones y cuántos números bajaron al plan, y cuántos ya estaban de una aprobación anterior. */
  plan: { acciones: number; indicadores: number; ya_estaban: number };
  aviso: string | null;
};

/**
 * LA ESTRATEGIA APROBADA BAJA AL PLAN. Las victorias de los primeros 14 días y las jugadas del camino elegido se
 * escriben como acciones propuestas, y los números de «medir desde el día 1» como indicadores activos. Cada fila
 * dice de qué estrategia y de qué pieza suya salió, así que aprobar dos veces no duplica nada: lo que ya bajó se
 * queda como está, con las correcciones que la consultora le haya hecho encima. El reparto de campos y por qué
 * nacen propuestas está en al-plan.ts.
 *
 * NO HACE FALLAR LA APROBACIÓN. La estrategia ya está aprobada en la base y el dueño ya la ve: si el plan no se
 * puede escribir, se dice en el aviso y se vuelve a intentar al aprobar la actualización. Lo contrario sería
 * dejar una estrategia sin aprobar por una tabla que no es la suya.
 */
/**
 * LA CADENA DE VERSIONES DE ESTA ESTRATEGIA: ella, de la que salió y las que salieron de ella, siguiendo
 * `basada_en` en los dos sentidos. Es lo que permite reconocer que «la victoria 1» de la versión 2 es la misma
 * pieza que «la victoria 1» de la versión 1 y no bajarla dos veces. Se recorre entero porque una cadena puede
 * tener ramas (dos actualizaciones de la misma versión), y si no se puede leer queda ella sola: entonces manda
 * la segunda red, que es el texto.
 */
function cadenaDeVersiones(filas: readonly { id: string; basada_en: string | null }[], id: string): string[] {
  const hijos = new Map<string, string[]>();
  const padre = new Map<string, string>();
  for (const f of filas) {
    if (!f.basada_en) continue;
    padre.set(f.id, f.basada_en);
    hijos.set(f.basada_en, [...(hijos.get(f.basada_en) ?? []), f.id]);
  }
  const vistos = new Set<string>([id]);
  const porVer = [id];
  while (porVer.length) {
    const actual = porVer.pop() as string;
    for (const vecino of [padre.get(actual), ...(hijos.get(actual) ?? [])]) {
      if (vecino && !vistos.has(vecino)) {
        vistos.add(vecino);
        porVer.push(vecino);
      }
    }
  }
  return [...vistos];
}

async function bajarEstrategiaAlPlan(x: {
  v: VersionEstrategia;
  camino: LetraCamino;
  porId: string;
  companyId: string;
}): Promise<{ acciones: number; indicadores: number; ya_estaban: number; aviso: string | null }> {
  const vacio = { acciones: 0, indicadores: 0, ya_estaban: 0 };
  const sb = supabaseAdmin();
  const e = x.v.vigente;
  if (!e) return { ...vacio, aviso: null };
  try {
    const [{ data: yaAcciones, error: e1 }, { data: yaClaves, error: e2 }, { data: versiones }] = await Promise.all([
      sb.from("actions").select("estrategia_id,estrategia_ref,accion").eq("company_id", x.companyId).not("estrategia_id", "is", null),
      sb.from("indicadores").select("clave").eq("company_id", x.companyId),
      sb.from("estrategias").select("id,basada_en").eq("company_id", x.companyId),
    ]);
    // Si las columnas todavía no existen en esta base, se dice qué migración falta en vez de un mensaje de Postgres.
    if (e1 || e2) return { ...vacio, aviso: API.plan_no_bajado(`falta aplicar supabase/migracion-estrategia-al-plan.sql: ${mensajeDe(e1 ?? e2!)}`) };

    const todo = bajarAlPlan({
      estrategia: e,
      camino: x.camino,
      version: x.v.version,
      refs: refsDeEstrategia(e, x.v.paquete, x.v.calculos),
      personas: x.v.paquete.personas,
      hoy: e.hoy,
    });
    const falta = loQueFalta(
      todo,
      {
        acciones: (yaAcciones ?? []) as YaBajado["acciones"],
        claves: ((yaClaves ?? []) as { clave: string }[]).map((i) => i.clave),
      },
      cadenaDeVersiones((versiones ?? []) as { id: string; basada_en: string | null }[], x.v.id)
    );
    if (!falta.acciones.length && !falta.indicadores.length) return { ...vacio, ya_estaban: falta.ya_estaban, aviso: null };

    const ahora = ahoraIso();
    const base = { company_id: x.companyId, estrategia_id: x.v.id };
    const { data: creadas, error: errorAcciones } = falta.acciones.length
      ? await sb.from("actions").insert(falta.acciones.map((a) => ({ ...a, ...base, updated_at: ahora }))).select("id,accion")
      : { data: [], error: null };
    if (errorAcciones) return { ...vacio, ya_estaban: falta.ya_estaban, aviso: API.plan_no_bajado(mensajeDe(errorAcciones)) };

    // Cada acción nace con su fila de historial: quién la propuso y por qué. Si el historial no entra, la acción
    // NO se deshace (al contrario que un cambio de estado): su procedencia está en la propia fila, en
    // `estrategia_id` y en la nota, y borrarla dejaría el plan vacío otra vez por un rastro que ya está escrito.
    let avisoHistorial: string | null = null;
    if ((creadas ?? []).length) {
      const { error } = await sb.from("accion_historial").insert(
        (creadas as { id: string }[]).map((a) => ({
          action_id: a.id,
          accion: "proponer",
          despues: { estado: "propuesto", estrategia_id: x.v.id },
          motivo: `Bajó de la estrategia aprobada, versión ${x.v.version}, camino ${x.camino.toUpperCase()}.`,
          actor_id: x.porId,
          actor_rol: "consultor",
        }))
      );
      if (error) avisoHistorial = API.plan_sin_historial(mensajeDe(error));
    }

    let avisoNumeros: string | null = null;
    if (falta.indicadores.length) {
      const { error } = await sb.from("indicadores").insert(
        falta.indicadores.map((i) => ({ ...i, ...base, creado_por: x.porId }))
      );
      if (error) avisoNumeros = API.numeros_no_bajados(mensajeDe(error));
    }

    return {
      acciones: (creadas ?? []).length,
      indicadores: avisoNumeros ? 0 : falta.indicadores.length,
      ya_estaban: falta.ya_estaban,
      aviso: [avisoHistorial, avisoNumeros].filter(Boolean).join(" ") || null,
    };
  } catch (err) {
    return { ...vacio, aviso: API.plan_no_bajado(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * Aprueba una versión: con el camino elegido y sin nada por resolver (§6.3), congela la página del dueño con las
 * cifras ya escritas, deja la anterior aprobada como «reemplazada», BAJA SUS ACCIONES Y SUS NÚMEROS AL PLAN y
 * guarda la copia en la biblioteca (deliverables, tipo plan_estrategico), que es SOLO la página del dueño: nunca
 * lo vigente ni los cálculos.
 */
export async function aprobarVersion(x: { companyId: string; id: string; porId: string; motivo: string | null }): Promise<Resultado<ResultadoAprobar>> {
  const sb = supabaseAdmin();
  const v = await laVersion(x.companyId, x.id);
  if (esFallo(v)) return v;
  if (v.estado === "aprobada") return no(409, "aprobada", API.ya_la_ve_el_cliente);
  const cerrada = noSeCorrige(v);
  if (cerrada) return cerrada;
  if (!v.camino_elegido) return no(409, "falta_elegir", API.falta_elegir);

  // Se vuelve a revisar con lo que hay hoy en la fila: el veredicto guardado puede ser de antes de la última corrección.
  const r = revisarVersion(v.vigente!, v.salida, v.paquete, v.calculos);
  const pendientes = porResolver(v.vigente!, r.validacion);
  if (pendientes.length) return no(409, "por_resolver", API.por_resolver(pendientes.length), { pendientes });
  // BLOQUEO OPTIMISTA (revisión del 17-10): la página del dueño se arma con lo vigente que se leyó al empezar. Si otra
  // pestaña guardó una corrección entre medio, se aprobaría una página que ya no es la de lo vigente: cada paso compara
  // la hora de la fila con la que se leyó y cuenta las filas que cambió.
  let marca = v.updated_at;
  if (v.estado !== "lista") {
    // Resuelto lo último, la versión vuelve a «lista»: sin eso, aprobar_estrategia no la aceptaría.
    const nueva = ahoraIso();
    const paso = sb.from("estrategias").update({ estado: "lista", validacion: { ...r.validacion, de: "final" }, calidad: { items: r.calidad }, updated_at: nueva }).eq("id", v.id).eq("company_id", x.companyId).eq("estado", v.estado);
    const { data, error } = await (v.updated_at ? paso.eq("updated_at", v.updated_at) : paso.is("updated_at", null)).select("id");
    if (error) return no(500, "guardar", mensajeDe(error));
    if (!((data ?? []) as unknown[]).length) return no(409, "cambio_mientras_tanto", API.cambio_mientras_tanto);
    marca = nueva;
  }

  let para_dueno: ParaDueno;
  try {
    para_dueno = vistaParaDueno(v.vigente!, v.camino_elegido, refsDeEstrategia(v.vigente!, v.paquete, v.calculos));
  } catch (e) {
    if (e instanceof PaginaDelDuenoInvalida) return no(409, "pagina_del_dueno", API.pagina_del_dueno(e.problemas.join("; ")), { problemas: e.problemas });
    throw e;
  }

  const { error } = await sb.rpc("aprobar_estrategia", { p_id: v.id, p_por: x.porId, p_para_dueno: para_dueno, p_motivo: x.motivo, p_updated_at: marca });
  if (error) {
    if (/cambió mientras tanto/.test(error.message ?? "")) return no(409, "cambio_mientras_tanto", API.cambio_mientras_tanto);
    return /Solo se aprueba|Falta elegir/.test(error.message ?? "") ? no(409, "no_se_aprueba", error.message) : no(500, "aprobar", mensajeDe(error));
  }

  // El plan. Si no se baja, la aprobación vale igual y se dice: la estrategia ya está aprobada y el dueño ya la ve.
  const plan = await bajarEstrategiaAlPlan({ v, camino: v.camino_elegido, porId: x.porId, companyId: x.companyId });

  // La copia en la biblioteca, con su control documental de siempre. Si no se guarda, la aprobación vale igual y se dice.
  let entregable_id: string | null = null;
  // Los avisos se SUMAN, no se pisan: el del plan y el de la copia son dos cosas que pueden fallar aparte, y
  // antes el segundo borraba al primero.
  const avisos: string[] = plan.aviso ? [plan.aviso] : [];
  const { data: prev, error: errorPrev } = await sb.from("deliverables").select("version").eq("company_id", x.companyId).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1);
  if (errorPrev) avisos.push(API.copia_no_guardada(mensajeDe(errorPrev)));
  else {
    const siguiente = Math.max(0, ...((prev ?? []) as { version: number | null }[]).map((d) => Number(d.version ?? 0))) + 1;
    const { data: copia, error: errorCopia } = await sb.from("deliverables").insert({ company_id: x.companyId, tipo: "plan_estrategico", contenido: contenidoEntregable(v.id, v.version, para_dueno), version: siguiente }).select("id").single();
    if (errorCopia) avisos.push(API.copia_no_guardada(mensajeDe(errorCopia)));
    else entregable_id = String((copia as { id: string }).id);
  }
  const aviso = avisos.join(" ") || null;
  return {
    ok: true,
    estado: "aprobada",
    para_dueno,
    entregable_id,
    plan: { acciones: plan.acciones, indicadores: plan.indicadores, ya_estaban: plan.ya_estaban },
    aviso,
  };
}

// ─── Actualizar números (sin IA) ─────────────────────────────────────────────────────────────────

export type ResultadoActualizar = {
  estrategia_id: string;
  version: number;
  estado: "lista" | "con_observaciones";
  diferencias: Diferencias;
  regenerar: { conviene: boolean; motivos: string[] };
  preguntas_nuevas: number;
  aviso: string | null;
};

/**
 * «Actualizar números» (§7.3): relee la empresa, rearma el paquete y las cuentas (las respuestas del dueño entran como
 * hechos), rehace las proyecciones de lo que escribió 8X y de lo que corrigió la consultora, vuelve a validar y a
 * correr la lista de control, y crea una versión NUEVA (origen «actualizacion», basada en esta). No llama al modelo ni
 * cuenta para el tope diario. Si la anterior estaba aprobada, el dueño sigue viéndola hasta que se apruebe la nueva.
 */
export async function actualizarNumeros(x: { companyId: string; id: string; porId: string | null; ahora?: Date }): Promise<Resultado<ResultadoActualizar>> {
  const sb = supabaseAdmin();
  const ahora = x.ahora ?? new Date();
  const base = await laVersion(x.companyId, x.id);
  if (esFallo(base)) return base;
  if (!base.salida || !base.vigente) return no(409, "sin_numeros", API.sin_numeros);
  const { data: curso } = await sb.from("estrategias").select("id").eq("company_id", x.companyId).eq("estado", "en_curso").limit(1).maybeSingle();
  if (curso) return no(409, "en_curso", API.espera_la_que_se_genera);

  let entradas;
  try {
    entradas = await leerEntradasPaquete(x.companyId);
  } catch (e) {
    if (e instanceof ErrorLecturaCritica) return no(500, "lectura_critica", MOTOR.lectura_critica(e.tabla, e.motivo).replace(" No se gastó ninguna consulta.", ""));
    throw e;
  }
  const { paquete, calculos } = congelar(entradas, ahora);
  const huella = huellaPaquete(paquete);
  if (huella === base.paquete_huella) return no(409, "sin_cambios", API.sin_cambios);

  // Lo que escribió 8X y lo que corrigió la consultora, con las cuentas nuevas: lo que era «sin dato» y ya tiene dato
  // pasa a citar el dato; el texto no cambia.
  const conHoy = (e: Estrategia): Estrategia => ({ ...reproyectar(e, paquete, calculos), hoy: paquete.empresa.hoy });
  const salida = conHoy(base.salida);
  const vigente = conHoy(base.vigente);
  const r = revisarVersion(vigente, salida, paquete, calculos);
  const proyecciones = base.lente_dinero && base.lente_terreno ? proyectarLentes(paquete, calculos, base.lente_dinero, base.lente_terreno) : null;

  const fila = {
    company_id: x.companyId,
    estado: r.estado,
    etapa: "terminada",
    origen: "actualizacion",
    paquete,
    paquete_huella: huella,
    calculos,
    lente_dinero: base.lente_dinero,
    lente_terreno: base.lente_terreno,
    proyecciones_lentes: proyecciones,
    equipo_rojo: base.equipo_rojo,
    salida,
    vigente,
    validacion: { ...r.validacion, de: "final" },
    calidad: { items: r.calidad },
    errores: [],
    trabajos: {},
    camino_elegido: base.camino_elegido,
    motivo_eleccion: base.motivo_eleccion,
    basada_en: base.id,
    pedida_por: x.porId,
    updated_at: ahoraIso(),
  };
  // El número siguiente; si dos actualizaciones chocan en (company_id, version), se prueba con el que sigue.
  let creada: { id: string; version: number } | null = null;
  for (let vuelta = 0; vuelta < 4 && !creada; vuelta++) {
    const { data: nums } = await sb.from("estrategias").select("version").eq("company_id", x.companyId).order("version", { ascending: false }).limit(1000);
    const version = Math.max(0, ...((nums ?? []) as { version: number }[]).map((n) => Number(n.version))) + 1;
    const { data, error } = await sb.from("estrategias").insert({ ...fila, version }).select("id,version").single();
    if (!error && data) creada = { id: String((data as { id: string }).id), version: Number((data as { version: number }).version) };
    else if (error?.code !== "23505") return no(500, "guardar", mensajeDe(error));
  }
  if (!creada) return no(503, "guardar", "el número de versión chocó varias veces seguidas: vuelve a intentarlo");

  // Lo que todavía falta saber con los números nuevos, como preguntas propuestas (sin duplicar las abiertas).
  let preguntas_nuevas = 0;
  let aviso: string | null = null;
  try {
    preguntas_nuevas = await proponerPreguntas(x.companyId, creada.id, pedidosDesdeFaltantes(vigente, paquete, creada.version).preguntas);
  } catch (e) {
    aviso = `La versión nueva quedó creada, pero no se pudieron proponer sus preguntas: ${mensajeDe(e)}.`;
  }
  const d = diferencias({ paquete: base.paquete, estrategia: base.vigente }, { paquete, estrategia: vigente });
  return { ok: true, estrategia_id: creada.id, version: creada.version, estado: r.estado, diferencias: d, regenerar: convieneRegenerar(d), preguntas_nuevas, aviso };
}

// ─── Reintentar una etapa ────────────────────────────────────────────────────────────────────────

export type Reintento = { etapa: EtapaMotor; reencolado: boolean; job_id: string | null; motivo: string | null };

/** El nombre de una etapa en palabras, para los textos. */
const nombreDe = (e: EtapaMotor | "revision") => (e === "revision" ? ETAPA.revision.nombre : ETAPA[e].nombre);

/** Anota en `trabajos` el trabajo nuevo de una etapa (lo lee fresco: otra etapa pudo anotar el suyo mientras tanto). */
async function anotarTrabajo(companyId: string, id: string, etapa: EtapaMotor, jobId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("estrategias").select("trabajos").eq("id", id).eq("company_id", companyId).maybeSingle();
  const trabajos = ((data as { trabajos?: Record<string, string> } | null)?.trabajos ?? {}) as Record<string, string>;
  const { error } = await sb.from("estrategias").update({ trabajos: { ...trabajos, [etapa]: jobId }, updated_at: ahoraIso() }).eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(`No se pudo anotar el trabajo nuevo de ${ETAPA[etapa].nombre}: ${error.message}`);
}

/**
 * «Reintentar esta etapa» (§5.4): vuelve a encolar SOLO la etapa fallida con reencolarSeguro sobre su último trabajo
 * (el de `trabajos`) y anota el nuevo; el original no se borra. Si la prueba de los dos caminos nunca se puso en marcha
 * (no hay trabajo que reencolar), se pone en marcha. Sin `etapa`, se reintentan todas las que fallaron.
 */
export async function reintentarEtapa(x: { companyId: string; id: string; etapa?: EtapaMotor | null }): Promise<Resultado<{ reintentos: Reintento[] }>> {
  const v = await laVersion(x.companyId, x.id);
  if (esFallo(v)) return v;
  if (v.estado !== "en_curso") return no(409, "no_en_curso", API.no_se_genera);
  const e = estadoDeEtapas(v, await trabajosDeVersion(v));
  // La revisión de cada cifra es el trabajo de la reparación: se reintenta como la prueba («rojo»).
  const deEtapa = (clave: EtapaMotor | "revision"): EtapaMotor => (clave === "revision" ? "rojo" : clave);
  const fallidas = e.pasos.filter((p) => p.estado === "fallida");
  let elegidas = fallidas.filter((p) => p.reintentable);
  if (x.etapa) {
    const suyas = e.pasos.filter((p) => deEtapa(p.clave) === x.etapa);
    const fallida = suyas.find((p) => p.estado === "fallida");
    if (!fallida) return no(409, "no_fallo", API.etapa_no_fallo(nombreDe(x.etapa)));
    if (!fallida.reintentable) return no(409, "no_reintentable", API.etapa_no_reintentable(nombreDe(x.etapa)));
    elegidas = [fallida];
  } else if (!elegidas.length) {
    return fallidas.length ? no(409, "no_reintentable", API.etapa_no_reintentable(nombreDe(fallidas[0]!.clave))) : no(409, "nada_que_reintentar", API.nada_que_reintentar);
  }

  const reintentos: Reintento[] = [];
  for (const p of elegidas) {
    const etapa = deEtapa(p.clave);
    if (!p.job_id) {
      // Las dos lentes están y la prueba nunca se puso en marcha: no hay trabajo previo; se pone en marcha.
      if (etapa !== "rojo") return no(409, "no_reintentable", API.etapa_no_reintentable(nombreDe(etapa)));
      const job = await lanzarEquipoRojo(x.companyId, v.id);
      reintentos.push({ etapa, reencolado: !!job, job_id: job, motivo: job ? null : API.no_se_genera });
      continue;
    }
    const r = await reencolarSeguro(p.job_id);
    const nuevo = r.reencolado ? r.job_id : r.job_posterior_id;
    if (nuevo && nuevo !== p.job_id) await anotarTrabajo(x.companyId, v.id, etapa, nuevo);
    reintentos.push({ etapa, reencolado: r.reencolado, job_id: nuevo ?? p.job_id, motivo: r.motivo });
  }
  return { ok: true, reintentos };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirAutoridad } from "@/lib/autoridad";
import type { Perfil } from "@/lib/auth";
import { desdeFila as indicadorDesdeFila, diaEnZona, zonaDe } from "@/lib/kpis";
import { numeroEscrito } from "@/lib/numero-escrito";
import {
  ESTADOS_VISIBLES_CLIENTE, SIN_MIGRACION_INICIATIVAS, TRANSICIONES, ReglaDeIniciativa,
  agregarFuente, autoridadNecesaria, conContexto, desdeFila, editar, filaCliente, nueva, transicion, unidadDeLoEscrito, valorParaEvaluar,
  type Actor, type Contexto, type DatosNueva, type Estado, type EvidenciaDecision, type EvidenciaDisponible, type FaltanteLevantamiento, type FilaHistorial,
  type FilaHistorialLeida, type IndicadorDeIniciativa, type Iniciativa, type IniciativaCliente, type NuevaFuente, type PersonaDeLaEmpresa, type Tablero,
} from "@/lib/iniciativas";

/**
 * LAS INICIATIVAS EN LA BASE. La regla vive en src/lib/iniciativas.ts (pura, sin base); aquí se lee lo
 * que la regla necesita, se exige la autoridad y se escribe. Es lo único que las rutas y las páginas
 * llaman. Tres cosas que este archivo garantiza:
 *
 *  · PRIMERO SE COMPRUEBA TODO Y DESPUÉS SE ESCRIBE. Una petición que falla no deja nada a medias.
 *  · UN CAMBIO SIN RASTRO NO SE QUEDA. Se escribe la iniciativa y luego su fila de historial; si el
 *    historial no entra, la iniciativa vuelve a como estaba y se falla en voz alta.
 *  · LO DEL DUEÑO SE FILTRA EN LA CONSULTA. `iniciativasDelCliente` pide solo los estados que él ve y
 *    devuelve solo lo que arma `filaCliente`: una propuesta no viaja a su navegador ni escondida.
 *  · UN HALLAZGO SIN REVISAR O PROVISIONAL NO SUSTENTA NADA (R10.4). Solo se ofrecen para citar los
 *    aprobados o corregidos que no son provisionales; si una iniciativa cita otro, se le dice por qué no vale.
 *  · NADIE PISA A NADIE. La iniciativa solo se escribe si sigue en el estado y en la versión en que se leyó.
 *
 * Si la base todavía no tiene las tablas (migracion-excelencia-y-cartera.sql sin aplicar), se dice: la
 * consultora ve el aviso y las escrituras lanzan `SinTablasDeIniciativas`. No se finge un tablero vacío.
 */

type ErrorBase = { code?: string | null; message?: string | null };

/** ¿El error dice que la tabla o la columna no existe en esa base? Postgres: 42P01 y 42703; PostgREST: PGRST204 y PGRST205. */
export function faltaEnLaBase(error: ErrorBase | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find the (table|column)/i.test(error.message ?? "");
}

export class SinTablasDeIniciativas extends Error {
  constructor() {
    super(SIN_MIGRACION_INICIATIVAS);
    this.name = "SinTablasDeIniciativas";
  }
}

function fallar(que: string, error: ErrorBase): never {
  if (faltaEnLaBase(error)) throw new SinTablasDeIniciativas();
  throw new Error(`${que}: ${error.message ?? "error sin mensaje"}`);
}

/**
 * Los hallazgos se leen con su marca de provisional (supabase/migracion-evidencia-dimensiones.sql). Si esa
 * columna no está, se dice cuál falta: no se confunde con que falten las tablas de iniciativas.
 */
function fallarHallazgos(que: string, error: ErrorBase): never {
  if (faltaEnLaBase(error)) {
    throw new Error(`${que}: a la tabla de hallazgos le falta la columna «provisional» (falta aplicar supabase/migracion-evidencia-dimensiones.sql). Sin ella no se sabe qué hallazgo sirve de sustento.`);
  }
  fallar(que, error);
}

/** El día de calendario que vive la empresa. Si la zona no está o no se puede leer, America/Lima. */
async function relojDeLaEmpresa(sb: SupabaseClient, companyId: string): Promise<{ hoy: string; zona: string }> {
  const { data } = await sb.from("companies").select("zona_horaria").eq("id", companyId).maybeSingle();
  const zona = zonaDe((data as { zona_horaria?: unknown } | null)?.zona_horaria);
  return { hoy: diaEnZona(new Date(), zona), zona };
}

function comoIndicador(f: Record<string, unknown>): IndicadorDeIniciativa {
  const k = indicadorDesdeFila(f);
  return { id: k.id, nombre: k.nombre, unidad: k.unidad, moneda: k.moneda, valor_actual: k.valor_actual, valor_actual_periodo: k.valor_actual_periodo, estado_validacion: k.estado_validacion };
}

function corto(s: unknown, n = 140): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

type Filas = { data: Record<string, unknown>[] | null; error: ErrorBase | null };
const SIN_FILAS: Filas = { data: [], error: null };

// ───────────────────────── LECTURAS ─────────────────────────

export async function leerIniciativa(iid: string): Promise<Iniciativa | null> {
  const { data, error } = await supabaseAdmin().from("iniciativas").select("*").eq("id", iid).maybeSingle();
  if (error) fallar("No se pudo leer la iniciativa", error);
  return data ? desdeFila(data as Record<string, unknown>) : null;
}

const COLUMNAS_HALLAZGO = "id,titulo,estado_revision,provisional";
const HALLAZGO_REVISADO = ["aprobado", "corregido"];

/**
 * Un hallazgo sustenta una iniciativa solo si una persona lo aprobó o lo corrigió Y no es provisional
 * (R10.4, la misma regla que el plan y el rediseño de procesos). Uno que salió de la IA y nadie revisó, o
 * que se formó con afirmaciones sin confirmar, se nombra con su porqué y no cuenta como sustento.
 */
const deHallazgo = (f: Record<string, unknown>): EvidenciaDisponible => ({
  id: String(f.id), clase: "hallazgo", texto: corto(f.titulo),
  falta:
    f.estado_revision === "rechazado" ? "el hallazgo fue rechazado"
    : !HALLAZGO_REVISADO.includes(String(f.estado_revision)) ? "el hallazgo está sin revisar"
    : f.provisional === true ? "el hallazgo es provisional: se formó con afirmaciones sin confirmar"
    : null,
});
const deFuente = (f: Record<string, unknown>): EvidenciaDisponible => ({
  id: String(f.id), clase: "fuente", texto: corto(f.nombre), falta: f.estado === "leido" ? null : "todavía sin leer",
});
const deAfirmacion = (f: Record<string, unknown>): EvidenciaDisponible => ({
  id: String(f.id), clase: "afirmacion", texto: corto(f.texto),
  falta: f.estado === "confirmado" ? null : f.estado === "contradicho" ? "la afirmación está contradicha" : f.estado === "caducado" ? "la afirmación caducó" : "la afirmación está sin confirmar",
});

/**
 * Las evidencias de la empresa que se pueden citar, y por qué alguna todavía no sirve de sustento. Se
 * ofrecen los hallazgos aprobados o corregidos que no son provisionales, las fuentes y las afirmaciones
 * confirmadas más recientes; lo que una iniciativa ya cita y no está en esas listas (un hallazgo sin
 * revisar, por ejemplo) se busca aparte y sale con su porqué, para que nunca aparezca un identificador
 * suelto ni valga de sustento lo que no lo es. `soloCitadas` trae únicamente lo citado (lo que hace falta al aprobar).
 */
async function leerEvidencias(sb: SupabaseClient, companyId: string, citadas: readonly string[], soloCitadas = false): Promise<EvidenciaDisponible[]> {
  const lista: EvidenciaDisponible[] = [];
  if (!soloCitadas) {
    const [hallazgos, fuentes, afirmaciones] = (await Promise.all([
      sb.from("findings").select(COLUMNAS_HALLAZGO).eq("company_id", companyId).in("estado_revision", HALLAZGO_REVISADO).or("provisional.is.null,provisional.eq.false").order("created_at", { ascending: false }).limit(200),
      sb.from("sources").select("id,nombre,estado").eq("company_id", companyId).order("created_at", { ascending: false }).limit(300),
      sb.from("claims").select("id,texto,estado").eq("company_id", companyId).eq("estado", "confirmado").order("created_at", { ascending: false }).limit(150),
    ])) as unknown as Filas[];
    if (hallazgos!.error) fallarHallazgos("No se pudieron leer los hallazgos", hallazgos!.error);
    if (fuentes!.error) fallar("No se pudieron leer las fuentes", fuentes!.error);
    if (afirmaciones!.error) fallar("No se pudieron leer las afirmaciones", afirmaciones!.error);
    lista.push(...(hallazgos!.data ?? []).map(deHallazgo), ...(fuentes!.data ?? []).map(deFuente), ...(afirmaciones!.data ?? []).map(deAfirmacion));
  }

  const conocidas = new Set(lista.map((e) => e.id));
  const sueltas = [...new Set(citadas)].filter((id) => !conocidas.has(id));
  if (sueltas.length) {
    const [h, f, a] = (await Promise.all([
      sb.from("findings").select(COLUMNAS_HALLAZGO).eq("company_id", companyId).in("id", sueltas),
      sb.from("sources").select("id,nombre,estado").eq("company_id", companyId).in("id", sueltas),
      sb.from("claims").select("id,texto,estado").eq("company_id", companyId).in("id", sueltas),
    ])) as unknown as Filas[];
    if (h!.error) fallarHallazgos("No se pudieron leer los hallazgos citados", h!.error);
    if (f!.error) fallar("No se pudieron leer las fuentes citadas", f!.error);
    if (a!.error) fallar("No se pudieron leer las afirmaciones citadas", a!.error);
    lista.push(...(h!.data ?? []).map(deHallazgo), ...(f!.data ?? []).map(deFuente), ...(a!.data ?? []).map(deAfirmacion));
    const halladas = new Set(lista.map((e) => e.id));
    for (const id of sueltas) if (!halladas.has(id)) lista.push({ id, clase: "afirmacion", texto: "Evidencia que ya no está en la empresa", falta: "ya no existe" });
  }
  return lista;
}

/** Lo que al levantamiento le falta, visto desde las evidencias: cada una que todavía no sirve de sustento. */
function faltantesDe(evidencias: readonly EvidenciaDisponible[]): FaltanteLevantamiento[] {
  return evidencias.filter((e) => e.falta).map((e) => ({ id: e.id, que: `«${e.texto}» (${e.falta})` }));
}

/** Todo lo que la pantalla de la consultora y la ruta GET necesitan, en una sola lectura. */
export async function cargarTablero(companyId: string): Promise<Tablero> {
  const sb = supabaseAdmin();
  const leidas = (await sb.from("iniciativas").select("*").eq("company_id", companyId).order("created_at", { ascending: true })) as unknown as Filas;
  if (leidas.error) {
    if (faltaEnLaBase(leidas.error)) return { disponible: false, motivo: SIN_MIGRACION_INICIATIVAS };
    throw new Error(`No se pudieron leer las iniciativas: ${leidas.error.message ?? "error sin mensaje"}`);
  }
  const iniciativas = (leidas.data ?? []).map(desdeFila);
  const ids = iniciativas.map((i) => i.id);

  const [personas, indicadores, historial, evidencias, reloj] = await Promise.all([
    sb.from("participants").select("id,nombre,puesto,rol").eq("company_id", companyId).order("nombre") as unknown as Promise<Filas>,
    sb.from("indicadores").select("*").eq("company_id", companyId).order("nombre") as unknown as Promise<Filas>,
    // El historial es la mitad de una iniciativa (quién decidió qué y con qué). Si no se puede leer, la
    // pantalla no puede decir «sin historial» como si fuera verdad.
    ids.length
      ? (sb.from("iniciativa_historial").select("*, users(nombre)").in("iniciativa_id", ids).order("created_at", { ascending: true }) as unknown as Promise<Filas>)
      : Promise.resolve(SIN_FILAS),
    leerEvidencias(sb, companyId, iniciativas.flatMap((i) => i.evidencia_ids)),
    relojDeLaEmpresa(sb, companyId),
  ]);
  if (personas.error) fallar("No se pudieron leer las personas de la empresa", personas.error);
  if (indicadores.error) fallar("No se pudieron leer los indicadores", indicadores.error);
  if (historial.error) fallar("No se pudo leer el historial de las iniciativas", historial.error);

  const participantes = (personas.data ?? []) as unknown as PersonaDeLaEmpresa[];
  const nombreDe = new Map(participantes.map((p) => [p.id, p.nombre]));
  const filasIndicador = indicadores.data ?? [];
  const indicadorDe = new Map(filasIndicador.map((f) => [String(f.id), comoIndicador(f)]));
  const porIniciativa: Record<string, FilaHistorialLeida[]> = {};
  for (const h of historial.data ?? []) {
    const { users, ...resto } = h as Record<string, unknown> & { users?: { nombre?: string | null } | null };
    const k = String(resto.iniciativa_id);
    (porIniciativa[k] ??= []).push({ ...(resto as unknown as FilaHistorialLeida), actor_nombre: users?.nombre ?? null });
  }
  const levantamiento = { faltantes: faltantesDe(evidencias) };

  return {
    disponible: true,
    hoy: reloj.hoy,
    zona: reloj.zona,
    iniciativas: iniciativas.map((i) =>
      conContexto(i, {
        hoy: reloj.hoy,
        indicador: i.indicador_id ? indicadorDe.get(i.indicador_id) ?? null : null,
        levantamiento,
        responsable_nombre: i.responsable_participant_id ? nombreDe.get(i.responsable_participant_id) ?? null : null,
        historial: porIniciativa[i.id] ?? [],
      })
    ),
    participantes,
    indicadores: filasIndicador.filter((f) => f.estado !== "archivado").map((f) => ({ id: String(f.id), nombre: String(f.nombre ?? ""), unidad: (f.unidad as string | null) ?? null, moneda: (f.moneda as string | null) ?? null })),
    evidencias,
  };
}

/** Las columnas que se piden para el dueño. Ni recursos, ni motivo de las decisiones, ni quién las tomó. */
const COLUMNAS_CLIENTE =
  "id,company_id,dominio,titulo,hipotesis,medida_exito,plazo_inicio,plazo_fin,estado,criterio_continuar,criterio_ajustar,criterio_detener,pendiente_investigacion,fuentes_aportadas,indicador_id,responsable_participant_id";

/**
 * «Lo que estamos probando», para el dueño: SOLO lo aprobado y lo que está en curso, pedido así a la base.
 * Las propuestas, lo detenido y lo cerrado no salen de la consulta. De cada fila viaja lo que arma
 * `filaCliente`: del responsable solo el puesto, de las fuentes solo el nombre.
 */
export async function iniciativasDelCliente(companyId: string): Promise<IniciativaCliente[]> {
  const sb = supabaseAdmin();
  const leidas = (await sb.from("iniciativas").select(COLUMNAS_CLIENTE).eq("company_id", companyId).in("estado", [...ESTADOS_VISIBLES_CLIENTE]).order("plazo_fin", { ascending: true })) as unknown as Filas;
  if (leidas.error) {
    // Sin las tablas no existe ninguna iniciativa aprobada: para el dueño eso es, con verdad, «todavía nada».
    if (faltaEnLaBase(leidas.error)) return [];
    throw new Error(`No se pudieron leer las iniciativas: ${leidas.error.message ?? "error sin mensaje"}`);
  }
  const iniciativas = (leidas.data ?? []).map(desdeFila);
  if (!iniciativas.length) return [];

  const idsIndicador = [...new Set(iniciativas.map((i) => i.indicador_id).filter((x): x is string => !!x))];
  const idsPersona = [...new Set(iniciativas.map((i) => i.responsable_participant_id).filter((x): x is string => !!x))];
  const [indicadores, personas] = await Promise.all([
    idsIndicador.length ? (sb.from("indicadores").select("*").eq("company_id", companyId).in("id", idsIndicador) as unknown as Promise<Filas>) : Promise.resolve(SIN_FILAS),
    idsPersona.length ? (sb.from("participants").select("id,puesto").eq("company_id", companyId).in("id", idsPersona) as unknown as Promise<Filas>) : Promise.resolve(SIN_FILAS),
  ]);
  if (indicadores.error) fallar("No se pudieron leer los indicadores", indicadores.error);
  if (personas.error) fallar("No se pudieron leer los responsables", personas.error);
  const indicadorDe = new Map((indicadores.data ?? []).map((f) => [String(f.id), comoIndicador(f)]));
  const puestoDe = new Map((personas.data ?? []).map((p) => [String(p.id), (p.puesto as string | null) ?? null]));

  return iniciativas
    .map((i) =>
      filaCliente(i, {
        indicador: i.indicador_id ? indicadorDe.get(i.indicador_id) ?? null : null,
        responsable_puesto: i.responsable_participant_id ? puestoDe.get(i.responsable_participant_id) ?? null : null,
      })
    )
    .filter((x): x is IniciativaCliente => x !== null);
}

// ───────────────────────── COMPROBACIONES CONTRA LA BASE ─────────────────────────

/** Lo que una ficha referencia tiene que ser de ESTA empresa: la persona, el indicador y cada evidencia. null si todo es suyo. */
export async function comprobarReferencias(sb: SupabaseClient, companyId: string, campos: Record<string, unknown>): Promise<string | null> {
  const persona = campos.responsable_participant_id;
  if (typeof persona === "string" && persona) {
    const { data } = await sb.from("participants").select("id").eq("id", persona).eq("company_id", companyId).maybeSingle();
    if (!data) return "Esa persona no es de esta empresa.";
  }
  const indicador = campos.indicador_id;
  if (typeof indicador === "string" && indicador) {
    const { data } = await sb.from("indicadores").select("id").eq("id", indicador).eq("company_id", companyId).maybeSingle();
    if (!data) return "Ese indicador no es de esta empresa.";
  }
  const ids = Array.isArray(campos.evidencia_ids) ? (campos.evidencia_ids as string[]) : [];
  if (ids.length) {
    const [h, f, a] = (await Promise.all([
      sb.from("findings").select("id").eq("company_id", companyId).in("id", ids),
      sb.from("sources").select("id").eq("company_id", companyId).in("id", ids),
      sb.from("claims").select("id").eq("company_id", companyId).in("id", ids),
    ])) as unknown as Filas[];
    if (h!.error || f!.error || a!.error) return "No se pudo comprobar que las evidencias sean de esta empresa. Vuelve a intentarlo.";
    const suyas = new Set([...(h!.data ?? []), ...(f!.data ?? []), ...(a!.data ?? [])].map((x) => String(x.id)));
    const ajenas = ids.filter((id) => !suyas.has(id));
    if (ajenas.length) return `${ajenas.length === 1 ? "Una evidencia no es" : `${ajenas.length} evidencias no son`} de esta empresa.`;
  }
  return null;
}

// ───────────────────────── ESCRITURAS ─────────────────────────

/**
 * Escribe el cambio y su historial. La iniciativa solo se toca si sigue en el estado Y en la versión
 * (`updated_at`) en que se leyó: si alguien la cambió entretanto —otra edición, otra fuente, o una
 * aprobación mientras se editaba— no se pisa, y así no se aprueba una ficha que acaba de quedar incompleta.
 * Si el historial no entra, la iniciativa vuelve a como estaba; y si ni eso se puede, se dice.
 */
async function escribir(sb: SupabaseClient, antes: Iniciativa, cambios: Record<string, unknown>, historial: FilaHistorial): Promise<{ historialId: string }> {
  let guardar = sb.from("iniciativas").update(cambios).eq("id", antes.id).eq("estado", antes.estado);
  if (antes.updated_at) guardar = guardar.eq("updated_at", antes.updated_at);
  const { data: tocadas, error: e1 } = await guardar.select("id");
  if (e1) fallar("No se pudo guardar la iniciativa", e1);
  if (!tocadas?.length) throw new ReglaDeIniciativa("Otra persona cambió esta iniciativa hace un momento. Recarga la página y vuelve a intentarlo.");
  const { data, error: e2 } = await sb.from("iniciativa_historial").insert(historial).select("id").single();
  if (e2 || !data) {
    const causa = e2?.message ?? "la base no devolvió la fila";
    const vuelta: Record<string, unknown> = {};
    for (const k of Object.keys(cambios)) vuelta[k] = (antes as Record<string, unknown>)[k] ?? null;
    if (!antes.updated_at) delete vuelta.updated_at;
    const { error: e3 } = await sb.from("iniciativas").update(vuelta).eq("id", antes.id);
    if (e3) {
      throw new Error(`La iniciativa quedó cambiada SIN su fila de historial y no se pudo devolver a como estaba (${e3.message ?? "error sin mensaje"}): hay que revisarla a mano. El historial no se guardó: ${causa}`);
    }
    throw new Error(`La iniciativa no se cambió porque su historial no se pudo guardar: ${causa}`);
  }
  return { historialId: String((data as { id: unknown }).id) };
}

/** Proponer una iniciativa. Nace siempre como propuesta; el dueño no la ve hasta que se apruebe. */
export async function crearIniciativa(companyId: string, perfil: Perfil, datos: DatosNueva): Promise<{ iniciativa: Iniciativa; aviso: string | null }> {
  const sb = supabaseAdmin();
  const { hoy } = await relojDeLaEmpresa(sb, companyId);
  const r = nueva(companyId, datos, { id: perfil.id, rol: perfil.rol }, hoy);
  if (!r.ok) throw new ReglaDeIniciativa(r.error);
  const ajeno = await comprobarReferencias(sb, companyId, r.fila);
  if (ajeno) throw new ReglaDeIniciativa(ajeno);
  const { data, error } = await sb.from("iniciativas").insert(r.fila).select("*").single();
  if (error || !data) {
    if (error?.code === "23503") throw new ReglaDeIniciativa("Esa empresa no existe.");
    fallar("No se pudo guardar la iniciativa", error ?? { message: "la base no devolvió la fila" });
  }
  const iniciativa = desdeFila(data as Record<string, unknown>);
  // La iniciativa ya existe y dice quién la propuso y cuándo. Si esta fila no entra no se borra nada: se avisa.
  const { error: e2 } = await sb.from("iniciativa_historial").insert({ ...r.historial, iniciativa_id: iniciativa.id });
  return { iniciativa, aviso: e2 ? `La iniciativa se guardó, pero no se pudo anotar en el historial que se propuso (${e2.message}).` : null };
}

/**
 * Editar la ficha o añadir una fuente aportada. Una propuesta se completa sin más; una iniciativa ya
 * aprobada pide motivo y la autoridad de aprobar, y no puede quedar incompleta (lo decide `editar`).
 */
export async function modificarIniciativa(
  i: Iniciativa,
  perfil: Perfil,
  pedido: { cambios?: Record<string, unknown>; motivo?: string | null; fuente_aportada?: NuevaFuente | null }
): Promise<{ iniciativa: Iniciativa; historialIds: string[] }> {
  const sb = supabaseAdmin();
  const actor: Actor = { id: perfil.id, rol: perfil.rol };

  // Se comprueba todo antes de escribir nada: la edición y la fuente, las dos.
  const e = pedido.cambios && Object.keys(pedido.cambios).length ? editar(i, pedido.cambios, actor, pedido.motivo) : null;
  if (e && !e.ok) throw new ReglaDeIniciativa(e.error, e.faltan);
  const edicion = e && e.ok && !e.sin_cambios ? e : null;
  if (edicion) {
    if (edicion.autoridad) await exigirAutoridad(perfil, edicion.autoridad);
    const ajeno = await comprobarReferencias(sb, i.company_id, edicion.cambios);
    if (ajeno) throw new ReglaDeIniciativa(ajeno);
  }
  const trasEditar = edicion ? edicion.iniciativa : i;
  let fuente: Extract<ReturnType<typeof agregarFuente>, { ok: true }> | null = null;
  if (pedido.fuente_aportada) {
    const { hoy } = await relojDeLaEmpresa(sb, i.company_id);
    const f = agregarFuente(trasEditar, pedido.fuente_aportada, actor, hoy);
    if (!f.ok) throw new ReglaDeIniciativa(f.error);
    fuente = f;
  }

  const historialIds: string[] = [];
  if (edicion) historialIds.push((await escribir(sb, i, edicion.cambios, edicion.historial)).historialId);
  // La fuente se escribe sobre la versión que la edición acaba de dejar: su marca de tiempo es la de esa edición.
  const versionActual: Iniciativa = edicion ? { ...trasEditar, updated_at: String(edicion.cambios.updated_at) } : trasEditar;
  if (fuente) historialIds.push((await escribir(sb, versionActual, fuente.cambios, fuente.historial)).historialId);
  return { iniciativa: fuente ? fuente.iniciativa : trasEditar, historialIds };
}

export type PedidoTransicion = {
  a_estado: Estado;
  motivo?: string | null;
  /** Qué se observó, al decidir continuar, ajustar o detener. */
  que_se_observo?: string | null;
  /** Un valor escrito a mano, solo cuando la iniciativa no tiene indicador enlazado. */
  valor_observado?: string | null;
  evidencia_ids?: string[];
};

/**
 * UN PASO EN LA TABLA, con todo lo que la regla necesita leído de la base. Quien llama ya comprobó
 * sesión y pertenencia. El orden es el de las preguntas: ¿tiene autoridad? (403 con rastro), ¿lo permite
 * la regla? (400 con su mensaje), y solo entonces se escribe.
 */
export async function aplicarTransicion(i: Iniciativa, perfil: Perfil, pedido: PedidoTransicion): Promise<{ estado: Estado; iniciativa: Iniciativa; historialId: string; aviso: string | null }> {
  const sb = supabaseAdmin();
  const actor: Actor = { id: perfil.id, rol: perfil.rol };
  const enLaTabla = (TRANSICIONES[i.estado] ?? []).includes(pedido.a_estado);
  const autoridad = autoridadNecesaria(pedido.a_estado);
  if (enLaTabla && autoridad && actor.rol === "consultor") await exigirAutoridad(perfil, autoridad);

  const contexto: Contexto = { ahora: new Date() };
  let evidencia: EvidenciaDecision | null = null;

  if (enLaTabla && pedido.a_estado === "en_curso") contexto.zona = (await relojDeLaEmpresa(sb, i.company_id)).zona;
  if (enLaTabla && pedido.a_estado === "aprobada") {
    // Solo lo que la propia iniciativa cita: que a la empresa le falten otros documentos no se mira aquí.
    contexto.levantamiento = { faltantes: i.evidencia_ids.length ? faltantesDe(await leerEvidencias(sb, i.company_id, i.evidencia_ids, true)) : [] };
  }
  if (enLaTabla && (pedido.a_estado === "continuar" || pedido.a_estado === "ajustar" || pedido.a_estado === "detener")) {
    let indicador: IndicadorDeIniciativa | null = null;
    if (i.indicador_id) {
      const { data, error } = await sb.from("indicadores").select("*").eq("id", i.indicador_id).eq("company_id", i.company_id).maybeSingle();
      if (error) fallar("No se pudo leer el indicador de la iniciativa", error);
      indicador = data ? comoIndicador(data as Record<string, unknown>) : null;
    }
    const v = valorParaEvaluar(i, indicador);
    let valor = v.valor;
    let comoSeDice = v.como_se_dice;
    // En qué está el valor: un criterio escrito en otra unidad no se compara con él (lo evalúa una persona).
    let unidad = v.unidad;
    const escrito = (pedido.valor_observado ?? "").trim();
    if (escrito) {
      if (i.indicador_id) throw new ReglaDeIniciativa("Esta iniciativa tiene un indicador enlazado: registra el valor en el indicador, con su periodo, y vuelve a decidir. Así queda en su historia.");
      const n = numeroEscrito(escrito, { negativo: true });
      if (n === "invalido" || n === null) throw new ReglaDeIniciativa("El valor observado no se entiende como número. Si no hay número, déjalo vacío y describe lo que se vio.");
      valor = n;
      unidad = unidadDeLoEscrito(escrito);
      comoSeDice = `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} (valor observado, escrito a mano)`;
    }
    const ajeno = pedido.evidencia_ids?.length ? await comprobarReferencias(sb, i.company_id, { evidencia_ids: pedido.evidencia_ids }) : null;
    if (ajeno) throw new ReglaDeIniciativa(ajeno);
    evidencia = { que_se_observo: pedido.que_se_observo ?? null, valor_indicador: valor, periodo: v.periodo, como_se_dice: comoSeDice, unidad, evidencia_ids: pedido.evidencia_ids ?? [] };
  }

  const r = transicion(i, pedido.a_estado, actor, pedido.motivo, evidencia, contexto);
  if (!r.ok) throw new ReglaDeIniciativa(r.error, r.faltan);
  if (r.autoridad && r.autoridad !== autoridad) await exigirAutoridad(perfil, r.autoridad);
  const { historialId } = await escribir(sb, i, r.cambios, r.historial);
  return { estado: r.estado, iniciativa: { ...i, ...(r.cambios as Partial<Iniciativa>) }, historialId, aviso: r.aviso };
}

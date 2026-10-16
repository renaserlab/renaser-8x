import { supabaseAdmin } from "../supabase/admin";
import { fechaMes } from "../textos";
import { VERSION_PROMPT } from "../ai";
import { CONTRATOS, esAgenteConocido } from "../agentes/contratos";
import type { ClaimEvidencia } from "../rules/evidencia";
import { MIN_CONFIRMADAS_POR_PILAR } from "../rules/suficiencia";

/** La version del contrato que limito esa llamada: sin ella no se sabe con que presupuesto corrio. */
const versionDeContrato = (agente: string) => (esAgenteConocido(agente) ? CONTRATOS[agente].version : null);
import type { CompleteResult } from "../ai/provider";

/**
 * Dimensiones de la fuente que viajan con cada afirmación (migracion-evidencia-dimensiones.sql): quién la
 * produjo, qué período cubre y con qué fidelidad se extrajo. Opcionales: una fila anterior a la migración
 * llega sin ellas y las reglas de evidencia no asumen nada.
 */
export type SourceDeClaim = {
  nombre: string;
  tipo: string;
  fecha_origen: string | null;
  origen?: string | null;
  autor?: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  fidelidad_extraccion?: string | null;
};

export type ClaimRow = {
  id: string;
  company_id: string;
  source_id: string;
  fragment_id: string | null;
  participant_id: string | null;
  response_id: string | null;
  texto: string;
  pilar: string | null;
  tipo: string | null;
  temporalidad: string | null;
  fecha_afirmacion: string | null;
  estado: string;
  contradice_a: string | null;
  explicacion_contradiccion: string | null;
  pregunta_sugerida: string | null;
  prioridad_validacion: boolean;
  validado_por: string | null;
  created_at: string;
  // Dimensiones propias de la afirmación (migracion-evidencia-dimensiones.sql). Opcionales: el `*` las trae
  // cuando la columna existe; una fila sin ellas no es «cero», es «no se sabe».
  comprobacion?: string | null; // el HECHO contra un dato: no_comprobado | comprobado_con_dato | comprobado_por_consultor | refutado
  confianza?: number | null; // 0-1, si alguien la puso
  vigente_hasta?: string | null; // hasta cuándo vale lo afirmado
  sources?: SourceDeClaim | null;
  participants?: { nombre: string; rol: string | null; puesto: string | null } | null;
};

/** Lo que las reglas de evidencia necesitan de una afirmación: la forma mínima, para que valga también para filas anidadas en finding_evidence. */
export type ClaimParaEvidencia = Pick<ClaimRow, "id" | "source_id" | "participant_id" | "estado" | "comprobacion" | "confianza" | "vigente_hasta"> & {
  sources?: Partial<SourceDeClaim> | null;
  participants?: { rol: string | null } | null;
};

/**
 * Una afirmación de la base, con las dimensiones de su fuente, en la forma que leen las reglas de evidencia.
 * Es la ÚNICA traducción: el diagnóstico (al crear el hallazgo) y la revisión (al aprobarlo) pasan por aquí,
 * así los dos calculan la misma confianza sobre la misma evidencia. Lo que la fila no trae queda en null.
 */
export function claimComoEvidencia(c: ClaimParaEvidencia): ClaimEvidencia {
  return {
    id: c.id,
    source_id: c.source_id,
    participant_id: c.participant_id,
    estado: c.estado,
    source_tipo: c.sources?.tipo ?? null,
    source_origen: c.sources?.origen ?? null,
    participant_rol: c.participants?.rol ?? null,
    source_autor: c.sources?.autor ?? null,
    source_periodo_desde: c.sources?.periodo_desde ?? null,
    source_periodo_hasta: c.sources?.periodo_hasta ?? null,
    source_fidelidad: c.sources?.fidelidad_extraccion ?? null,
    comprobacion: c.comprobacion ?? null,
    confianza: c.confianza ?? null,
    vigente_hasta: c.vigente_hasta ?? null,
  };
}

/** Columnas de la fuente que viajan con cada afirmación. Una sola cadena para que el select y el tipo no se separen. */
export const SELECT_SOURCES_DE_CLAIM = "sources(nombre,tipo,fecha_origen,origen,autor,periodo_desde,periodo_hasta,fidelidad_extraccion)";

export async function claimsDeEmpresa(companyId: string, filtros: { pilar?: string; estado?: string; limit?: number; offset?: number } = {}) {
  let q = supabaseAdmin()
    .from("claims")
    .select(`*, ${SELECT_SOURCES_DE_CLAIM}, participants(nombre,rol,puesto)`)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (filtros.pilar) q = q.eq("pilar", filtros.pilar);
  if (filtros.estado) q = q.eq("estado", filtros.estado);
  if (filtros.limit !== undefined) q = q.range(filtros.offset ?? 0, (filtros.offset ?? 0) + filtros.limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClaimRow[];
}

/** "Plan estratégico 2023 (documento, mayo 2023)" / "Compradora (entrevista)". Nunca el nombre de una persona del equipo. */
export function etiquetaFuente(c: Pick<ClaimRow, "sources" | "participants">): string {
  if (c.participants) {
    const quien = c.participants.rol === "dueno" ? "el dueño" : c.participants.rol === "socio" ? "un socio" : `${c.participants.puesto ?? c.participants.rol ?? "equipo"}`;
    return `${quien} (entrevista)`;
  }
  if (c.sources) {
    const f = c.sources.fecha_origen ? `, ${fechaMes(c.sources.fecha_origen)}` : "";
    return `${c.sources.nombre} (${c.sources.tipo}${f})`;
  }
  return "fuente";
}

/** Columna de El Espejo: documentos / dueño / equipo */
export function columnaEspejo(c: ClaimRow): "documentos" | "dueno" | "equipo" {
  if (c.participants) return c.participants.rol === "dueno" || c.participants.rol === "socio" ? "dueno" : "equipo";
  return "documentos";
}

/** Observabilidad (15): cada llamada con agente, modelo, versión del prompt, latencia, tokens y error. Nunca secretos ni contenido. */
export async function registrarLlamada(companyId: string | null, jobId: string | null, agente: string, r: Pick<CompleteResult<unknown>, "tokens_entrada" | "tokens_salida" | "modelo" | "latencia_ms">) {
  await supabaseAdmin().from("token_usage").insert({ company_id: companyId, job_id: jobId, agente, tokens_entrada: r.tokens_entrada, tokens_salida: r.tokens_salida, modelo: r.modelo, version_prompt: VERSION_PROMPT, contrato_version: versionDeContrato(agente), latencia_ms: r.latencia_ms });
  // La huella sobrevive al borrado de la empresa. token_usage no: cuelga de companies con
  // `on delete cascade`, y el 31-08 se fueron 18 empresas con todas sus ejecuciones dentro.
  // Sin esto, «este agente nunca corrio» seguiria siendo una conclusion imposible de sostener.
  void supabaseAdmin().rpc("marcar_agente", { p_agente: agente, p_error: false }).then(() => {}, () => {});
}

export async function registrarErrorLlamada(companyId: string | null, jobId: string | null, agente: string, error: string, latencia_ms: number) {
  void supabaseAdmin().rpc("marcar_agente", { p_agente: agente, p_error: true }).then(() => {}, () => {});
  await supabaseAdmin().from("token_usage").insert({ company_id: companyId, job_id: jobId, agente, tokens_entrada: 0, tokens_salida: 0, version_prompt: VERSION_PROMPT, latencia_ms, error: error.slice(0, 300) });
}

/** Compatibilidad con los handlers: mismo nombre, ahora con observabilidad completa. */
export async function registrarTokens(companyId: string | null, jobId: string | null, agente: string, entrada: number, salida: number, extra?: Partial<Pick<CompleteResult<unknown>, "modelo" | "latencia_ms">>) {
  await registrarLlamada(companyId, jobId, agente, { tokens_entrada: entrada, tokens_salida: salida, modelo: extra?.modelo ?? "", latencia_ms: extra?.latencia_ms ?? 0 });
}

/**
 * LA SUMA SE HACE EN LA BASE, NO EN MEMORIA. Antes traía todas las filas de la empresa y las sumaba
 * en JavaScript. Supabase devuelve como máximo 1.000 filas por petición, así que al cruzar ese número
 * la suma se habría quedado corta EN SILENCIO y `superaTope()` habría dejado de frenar: un cobro
 * sorpresa justo en la empresa que más trabaja. Esa empresa ya tenía cientos de filas cuando se detectó.
 */
export async function tokensUsados(companyId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("tokens_de_empresa", { p_company: companyId });
  // Si la suma no se puede calcular, NO se devuelve 0: eso dejaría pasar cualquier gasto. Se propaga.
  if (error) throw new Error(`No se pudo calcular el consumo de la empresa: ${error.message}`);
  return Number(data ?? 0);
}

export async function superaTope(companyId: string): Promise<boolean> {
  const { data: c } = await supabaseAdmin().from("companies").select("tope_tokens").eq("id", companyId).single();
  const usados = await tokensUsados(companyId);
  return usados > (c?.tope_tokens ?? 2_000_000);
}

/** Texto de afirmaciones para prompts: "[id] (fuente) texto — estado, fecha". */
export function claimsComoTexto(claims: ClaimRow[]): string {
  return claims
    .map((c) => `[${c.id}] (${etiquetaFuente(c)}; fuente_id ${c.source_id}${c.participant_id ? `; persona ${c.participant_id}` : ""}; tipo ${c.tipo ?? "otro"}; ${c.temporalidad ?? "actual"}; ${c.estado}; fecha ${c.fecha_afirmacion ?? "desconocida"}) ${c.texto}`)
    .join("\n");
}

export async function procesoCompleto(processId: string) {
  const sb = supabaseAdmin();
  const [{ data: p }, { data: nodos }, { data: edges }] = await Promise.all([
    sb.from("processes").select("*").eq("id", processId).single(),
    sb.from("process_nodes").select("*").eq("process_id", processId),
    sb.from("process_edges").select("*").eq("process_id", processId),
  ]);
  return { proceso: p, nodos: nodos ?? [], edges: edges ?? [] };
}

export function procesoComoJSON(nodos: Record<string, unknown>[], edges: Record<string, unknown>[]) {
  return JSON.stringify(
    {
      nodos: nodos.map((n) => ({ id: n.id, tipo: n.tipo, etiqueta: n.etiqueta, responsable: n.responsable, rol: n.rol, ejecutor: n.ejecutor, tiempo: n.tiempo, espera: n.espera, herramienta: n.herramienta, entrada: n.entrada, salida: n.salida, evidencia: n.evidencia, estandar: n.estandar, problema: n.problema, veredicto: n.veredicto })),
      conexiones: edges.map((e) => ({ de: e.origen, a: e.destino, etiqueta: e.etiqueta })),
    },
    null,
    1
  );
}

/** El filtro PostgREST que deja fuera lo provisional y deja pasar las filas anteriores a la columna (provisional null). */
export const SIN_PROVISIONALES = "provisional.is.null,provisional.eq.false";

/**
 * EL CANDADO DEL ÁREA, LEÍDO CON LOS HECHOS DE HOY. De una lista de hallazgos ya leída deja fuera los de la IA cuya
 * área tiene hoy menos afirmaciones confirmadas que el mínimo: no son conclusión, diga lo que diga su columna
 * `provisional`. Es la regla de Mi empresa hoy (hoy.ts) y de releerEvidencia, con la cuenta del diagnóstico y de la
 * ruta de revisión: las confirmadas del área y las transversales. Lo que escribió la consultora responde por su propia
 * evidencia y pasa.
 *
 * Por qué hace falta si la columna ya existe: a la columna la pone al día un trabajo (jobs/auto.ts encola la
 * relectura), y entre que la evidencia cambia y ese trabajo corre hay un rato. Si quien decide leyera solo la columna,
 * en ese rato el mismo hallazgo sería «todavía no es conclusión» en /portal/hoy y conclusión en /portal/resultados, en
 * el plan y en los indicadores.
 *
 * Si no se puede contar se lanza: una cuenta que no se pudo hacer no es cero ni es «suficiente».
 */
export async function soloConclusionesDeHoy<T extends { origen?: string | null; pilar?: string | null }>(companyId: string, hallazgos: T[]): Promise<T[]> {
  const sb = supabaseAdmin();
  const areasDeLaIA = [...new Set(hallazgos.filter((f) => f.origen === "ia" && f.pilar).map((f) => f.pilar as string))];
  const areasCortas = new Set<string>();
  await Promise.all(areasDeLaIA.map(async (pilar) => {
    const { count, error } = await sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "confirmado").in("pilar", [pilar, "transversal"]);
    if (error || count == null) throw new Error(`No se pudo contar las afirmaciones confirmadas de ${pilar}, así que no se sabe si sus hallazgos son conclusión: ${error?.message ?? "la base no devolvió la cuenta"}`);
    if (count < MIN_CONFIRMADAS_POR_PILAR) areasCortas.add(pilar);
  }));
  return hallazgos.filter((f) => !(f.origen === "ia" && !!f.pilar && areasCortas.has(f.pilar)));
}

/**
 * Frontera: hallazgos visibles para el cliente como CONCLUSIÓN. Capítulo 34. Solo aprobados/corregidos, con evidencia,
 * sin validación pendiente y NO provisionales.
 *
 * APROBAR NO ES CONFIRMAR (R10.4): un hallazgo aprobado puede seguir provisional (nadie confirmó lo que lo sostiene, o
 * de su área se sabe poco). De esta lista salen el plan de 45 días, los entregables redactados y «Lo que encontramos»
 * del portal: si lo provisional entrara aquí, alimentaría una decisión por la puerta de la aprobación. Lo provisional
 * se ve en Mi empresa hoy, rotulado; aquí no entra.
 *
 * Y el candado del área se lee con los hechos de hoy (soloConclusionesDeHoy): un hallazgo de la IA en un área que hoy
 * no llega al mínimo de confirmadas no sale de aquí, aunque su columna todavía diga provisional = false.
 *
 * Si alguna lectura falla se lanza: una lista vacía por error se leería como «no hay hallazgos aprobados».
 */
export async function hallazgosAprobadosConEvidencia(companyId: string) {
  const { data, error } = await supabaseAdmin()
    .from("findings")
    .select("*, finding_evidence(claim_id, relacion, claims(id,texto,fecha_afirmacion,source_id,fragment_id,sources(nombre,tipo,fecha_origen),participants(nombre,rol,puesto)))")
    .eq("company_id", companyId)
    .in("estado_revision", ["aprobado", "corregido"])
    .eq("requiere_validacion", false)
    .or(SIN_PROVISIONALES);
  if (error) throw new Error(`No se pudo leer los hallazgos aprobados: ${error.message}`);
  const conSustento = (data ?? []).filter((f) => (f.finding_evidence ?? []).some((e: { relacion: string }) => e.relacion === "sustenta"));
  const orden: Record<string, number> = { alto: 0, medio: 1, bajo: 2 };
  return (await soloConclusionesDeHoy(companyId, conSustento)).sort((a, b) => (orden[a.impacto ?? "bajo"] ?? 9) - (orden[b.impacto ?? "bajo"] ?? 9));
}

export async function refrescarStats() {
  await supabaseAdmin().rpc("refresh_company_stats");
}

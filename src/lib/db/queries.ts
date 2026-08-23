import { supabaseAdmin } from "../supabase/admin";
import { fechaMes } from "../textos";
import { VERSION_PROMPT } from "../ai";
import type { CompleteResult } from "../ai/provider";

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
  sources?: { nombre: string; tipo: string; fecha_origen: string | null; origen?: string | null } | null;
  participants?: { nombre: string; rol: string | null; puesto: string | null } | null;
};

export async function claimsDeEmpresa(companyId: string, filtros: { pilar?: string; estado?: string; limit?: number; offset?: number } = {}) {
  let q = supabaseAdmin()
    .from("claims")
    .select("*, sources(nombre,tipo,fecha_origen,origen), participants(nombre,rol,puesto)")
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
  await supabaseAdmin().from("token_usage").insert({ company_id: companyId, job_id: jobId, agente, tokens_entrada: r.tokens_entrada, tokens_salida: r.tokens_salida, modelo: r.modelo, version_prompt: VERSION_PROMPT, latencia_ms: r.latencia_ms });
}

export async function registrarErrorLlamada(companyId: string | null, jobId: string | null, agente: string, error: string, latencia_ms: number) {
  await supabaseAdmin().from("token_usage").insert({ company_id: companyId, job_id: jobId, agente, tokens_entrada: 0, tokens_salida: 0, version_prompt: VERSION_PROMPT, latencia_ms, error: error.slice(0, 300) });
}

/** Compatibilidad con los handlers: mismo nombre, ahora con observabilidad completa. */
export async function registrarTokens(companyId: string | null, jobId: string | null, agente: string, entrada: number, salida: number, extra?: Partial<Pick<CompleteResult<unknown>, "modelo" | "latencia_ms">>) {
  await registrarLlamada(companyId, jobId, agente, { tokens_entrada: entrada, tokens_salida: salida, modelo: extra?.modelo ?? "", latencia_ms: extra?.latencia_ms ?? 0 });
}

export async function tokensUsados(companyId: string): Promise<number> {
  const { data } = await supabaseAdmin().from("token_usage").select("tokens_entrada,tokens_salida").eq("company_id", companyId);
  return (data ?? []).reduce((s, r) => s + (r.tokens_entrada ?? 0) + (r.tokens_salida ?? 0), 0);
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

/** Frontera: hallazgos visibles para el cliente. Capítulo 34. Solo aprobados/corregidos, con evidencia y sin validación pendiente. */
export async function hallazgosAprobadosConEvidencia(companyId: string) {
  const { data } = await supabaseAdmin()
    .from("findings")
    .select("*, finding_evidence(claim_id, relacion, claims(id,texto,fecha_afirmacion,source_id,fragment_id,sources(nombre,tipo,fecha_origen),participants(nombre,rol,puesto)))")
    .eq("company_id", companyId)
    .in("estado_revision", ["aprobado", "corregido"])
    .eq("requiere_validacion", false);
  const orden: Record<string, number> = { alto: 0, medio: 1, bajo: 2 };
  return (data ?? [])
    .filter((f) => (f.finding_evidence ?? []).some((e: { relacion: string }) => e.relacion === "sustenta"))
    .sort((a, b) => (orden[a.impacto ?? "bajo"] ?? 9) - (orden[b.impacto ?? "bajo"] ?? 9));
}

export async function refrescarStats() {
  await supabaseAdmin().rpc("refresh_company_stats");
}

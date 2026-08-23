import { supabaseAdmin } from "../supabase/admin";
import { fechaMes } from "../textos";

export type ClaimRow = {
  id: string;
  company_id: string;
  source_id: string;
  fragment_id: string | null;
  participant_id: string | null;
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
  created_at: string;
  sources?: { nombre: string; tipo: string; fecha_origen: string | null } | null;
  participants?: { nombre: string; rol: string | null; puesto: string | null } | null;
};

export async function claimsDeEmpresa(companyId: string, filtros: { pilar?: string; estado?: string; limit?: number; offset?: number } = {}) {
  let q = supabaseAdmin()
    .from("claims")
    .select("*, sources(nombre,tipo,fecha_origen), participants(nombre,rol,puesto)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (filtros.pilar) q = q.eq("pilar", filtros.pilar);
  if (filtros.estado) q = q.eq("estado", filtros.estado);
  if (filtros.limit !== undefined) q = q.range(filtros.offset ?? 0, (filtros.offset ?? 0) + filtros.limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClaimRow[];
}

/** "Plan estratégico 2023 (documento, mayo 2023)" / "Rosa, Compras (entrevista)" */
export function etiquetaFuente(c: ClaimRow): string {
  if (c.participants) {
    const quien = c.participants.rol === "dueno" ? "el dueño" : `${c.participants.puesto ?? c.participants.rol ?? "equipo"}`;
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

export async function registrarTokens(companyId: string | null, jobId: string | null, agente: string, entrada: number, salida: number) {
  await supabaseAdmin().from("token_usage").insert({ company_id: companyId, job_id: jobId, agente, tokens_entrada: entrada, tokens_salida: salida });
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
    .map((c) => `[${c.id}] (${etiquetaFuente(c)}; tipo ${c.tipo ?? "otro"}; ${c.temporalidad ?? "actual"}; ${c.estado}; fecha ${c.fecha_afirmacion ?? "desconocida"}) ${c.texto}`)
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
      nodos: nodos.map((n) => ({ id: n.id, tipo: n.tipo, etiqueta: n.etiqueta, responsable: n.responsable, ejecutor: n.ejecutor, tiempo: n.tiempo, herramienta: n.herramienta, problema: n.problema, veredicto: n.veredicto })),
      conexiones: edges.map((e) => ({ de: e.origen, a: e.destino, etiqueta: e.etiqueta })),
    },
    null,
    1
  );
}

/** Frontera: hallazgos visibles para el cliente. Capítulo 34. Solo aprobados/corregidos con evidencia. */
export async function hallazgosAprobadosConEvidencia(companyId: string) {
  const { data } = await supabaseAdmin()
    .from("findings")
    .select("*, finding_evidence(claim_id, relacion, claims(id,texto,fecha_afirmacion,sources(nombre,tipo,fecha_origen),participants(nombre,rol,puesto)))")
    .eq("company_id", companyId)
    .in("estado_revision", ["aprobado", "corregido"])
    .order("impacto");
  return (data ?? []).filter((f) => (f.finding_evidence ?? []).some((e: { relacion: string }) => e.relacion === "sustenta"));
}

export async function refrescarStats() {
  await supabaseAdmin().rpc("refresh_company_stats");
}

/**
 * LAS DECISIONES QUE LA CONSULTORA PUEDE CORREGIR (manual §10, §16, §17).
 *
 * 8X producía hallazgos, planes y propuestas, pero no había dónde Kelin dijera «esto no» y quedara
 * constancia. Sin eso, el sistema propone en el vacío: nadie puede saber después si la corrección
 * humana mejoró el resultado o lo empeoró, que es justo lo que el manual quiere medir.
 *
 * TRES REGLAS QUE ESTE MÓDULO NO ROMPE:
 *
 *  1. LA CORRECCIÓN NO PISA LA PROPUESTA. Cada intervención guarda `antes` y `despues`. Si la
 *     corrección sobrescribiera el original, se perdería con qué comparar.
 *  2. LA DECISIÓN CABE EN UNA PANTALLA. El manual lo dice sin rodeos: nada de informes de diez
 *     páginas para decidir. Por eso las alternativas van acotadas y la evidencia por referencia.
 *  3. EL RESULTADO NACE VACÍO. Nadie puede afirmar el día de la decisión si fue acertada. Se rellena
 *     cuando se sabe, y hasta entonces se muestra como pendiente de observación, no como éxito.
 */
import { supabaseAdmin } from "./supabase/admin";

export const ACCIONES = ["aprobar", "modificar", "objetar", "rechazar", "posponer", "pedir_evidencia"] as const;
export type Accion = (typeof ACCIONES)[number];

/** Cómo se le dice a cada acción en pantalla, y qué estado deja. */
export const ACCION: Record<Accion, { verbo: string; deja: EstadoDecision; explica: string }> = {
  aprobar: { verbo: "Aprobar", deja: "aprobada", explica: "Se acepta tal como está y puede ejecutarse." },
  modificar: { verbo: "Modificar", deja: "modificada", explica: "Se acepta con cambios tuyos; queda guardado qué proponía el sistema." },
  objetar: { verbo: "Objetar", deja: "objetada", explica: "Hay algo mal. Vuelve al sistema con tu motivo." },
  rechazar: { verbo: "Rechazar", deja: "rechazada", explica: "No se hace. Queda el motivo para no volver a proponerlo igual." },
  posponer: { verbo: "Posponer", deja: "pospuesta", explica: "No ahora. No es un no." },
  pedir_evidencia: { verbo: "Pedir evidencia", deja: "pide_evidencia", explica: "No hay con qué decidir todavía: falta levantar algo." },
};

export type EstadoDecision = "pendiente" | "aprobada" | "modificada" | "objetada" | "rechazada" | "pospuesta" | "pide_evidencia";

export type RefEvidencia = { tipo: string; id: string | null; texto: string };
export type Alternativa = {
  clave: string;
  titulo: string;
  que_implica: string;
  impacto?: string | null;
  costo?: string | null;
  velocidad?: string | null;
  riesgo?: string | null;
  reversibilidad?: string | null;
};

export type Decision = {
  id: string;
  company_id: string;
  titulo: string;
  por_que_ahora: string;
  evidencia: RefEvidencia[];
  faltantes: string[];
  supuestos: string[];
  alternativas: Alternativa[];
  recomendacion: string | null;
  recomendacion_por_que: string | null;
  impacto_esperado: string | null;
  riesgos: string[];
  confianza: "alta" | "media" | "baja" | null;
  confianza_por_que: string | null;
  que_pasa_si_se_aprueba: string | null;
  origen: "agente" | "consultora";
  agente: string | null;
  agente_version: string | null;
  job_id: string | null;
  estado: EstadoDecision;
  requiere_aprobacion: boolean;
  created_at: string;
};

export type Intervencion = {
  id: string;
  accion: Accion;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string;
  actor_rol: string | null;
  resultado: string | null;
  resultado_at: string | null;
  created_at: string;
};

/** Los campos que la consultora puede corregir al modificar. Nada más es editable. */
export const CAMPOS_CORREGIBLES = ["recomendacion", "recomendacion_por_que", "impacto_esperado", "que_pasa_si_se_aprueba"] as const;
export type CampoCorregible = (typeof CAMPOS_CORREGIBLES)[number];

/**
 * Qué le falta a una decisión para poder decidirse. Se comprueba ANTES de pedirle a nadie que
 * apruebe: una tarjeta sin evidencia ni alternativas no es una decisión, es una opinión con botones.
 */
export function queLeFalta(d: Pick<Decision, "evidencia" | "alternativas" | "recomendacion" | "confianza">): string[] {
  const falta: string[] = [];
  if (d.evidencia.length === 0) falta.push("No tiene evidencia citada: no se puede decidir sobre una afirmación sin respaldo.");
  if (d.alternativas.length < 2) falta.push("Tiene menos de dos alternativas: sin comparación no hay decisión, hay aceptación.");
  if (!d.recomendacion) falta.push("El sistema no recomienda nada: recomendar es su trabajo, decidir es el tuyo.");
  if (!d.confianza) falta.push("No declara su confianza ni por qué.");
  return falta;
}

export async function listarDecisiones(companyId?: string, estado?: EstadoDecision): Promise<Decision[]> {
  let q = supabaseAdmin().from("decisiones").select("*").order("created_at", { ascending: false }).limit(100);
  if (companyId) q = q.eq("company_id", companyId);
  if (estado) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las decisiones: ${error.message}`);
  return (data ?? []) as Decision[];
}

export async function verDecision(id: string): Promise<{ decision: Decision; historial: Intervencion[]; falta: string[] } | null> {
  const sb = supabaseAdmin();
  const { data: d } = await sb.from("decisiones").select("*").eq("id", id).maybeSingle();
  if (!d) return null;
  const { data: h } = await sb.from("decision_historial").select("*").eq("decision_id", id).order("created_at");
  const decision = d as Decision;
  return { decision, historial: (h ?? []) as Intervencion[], falta: queLeFalta(decision) };
}

/**
 * Registra la intervención de la consultora. Guarda el estado ANTERIOR completo de los campos
 * corregibles, aunque no se modifique ninguno: así el historial responde «¿qué proponía el sistema
 * cuando ella decidió?» sin depender de que nadie se acuerde de anotarlo.
 */
export async function decidir(opts: {
  decisionId: string;
  accion: Accion;
  motivo: string;
  correcciones?: Partial<Record<CampoCorregible, string>>;
  actorId: string | null;
  actorRol: string | null;
}): Promise<{ estado: EstadoDecision; intervencion: string }> {
  const sb = supabaseAdmin();
  const { data: d } = await sb.from("decisiones").select("*").eq("id", opts.decisionId).maybeSingle();
  if (!d) throw new Error("Esa decisión no existe.");

  const antes: Record<string, unknown> = {};
  for (const c of CAMPOS_CORREGIBLES) antes[c] = (d as Record<string, unknown>)[c] ?? null;

  const correcciones = opts.correcciones ?? {};
  const cambios = Object.entries(correcciones).filter(([, v]) => typeof v === "string" && v.trim().length > 0);
  if (opts.accion === "modificar" && cambios.length === 0) {
    throw new Error("Para modificar hay que cambiar algo. Si solo quieres aceptarla, usa aprobar.");
  }

  const estado = ACCION[opts.accion].deja;
  const parche: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  const despues: Record<string, unknown> | null = cambios.length ? {} : null;
  for (const [k, v] of cambios) {
    parche[k] = (v as string).trim();
    (despues as Record<string, unknown>)[k] = (v as string).trim();
  }

  const { error: e1 } = await sb.from("decisiones").update(parche).eq("id", opts.decisionId);
  if (e1) throw new Error(`No se pudo guardar la decisión: ${e1.message}`);

  const { data: iv, error: e2 } = await sb
    .from("decision_historial")
    .insert({
      decision_id: opts.decisionId,
      accion: opts.accion,
      antes,
      despues,
      motivo: opts.motivo,
      actor_id: opts.actorId,
      actor_rol: opts.actorRol,
    })
    .select("id")
    .single();
  if (e2) throw new Error(`La decisión se guardó pero su historial no: ${e2.message}`);

  return { estado, intervencion: iv.id };
}

/**
 * Anota qué pasó DESPUÉS. Es lo que permite evaluar si la corrección de la consultora produjo mejor
 * resultado — el manual pide medirlo, no suponer que la IA o el humano tenía razón.
 */
export async function anotarResultado(intervencionId: string, resultado: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("decision_historial")
    .update({ resultado, resultado_at: new Date().toISOString() })
    .eq("id", intervencionId);
  if (error) throw new Error(`No se pudo anotar el resultado: ${error.message}`);
}

/** Cuántas veces la consultora corrigió al sistema, y en cuántas se sabe ya el resultado. */
export async function balanceDeCorrecciones(): Promise<{
  total: number;
  porAccion: Record<string, number>;
  conResultado: number;
  sinResultado: number;
}> {
  const { data } = await supabaseAdmin().from("decision_historial").select("accion,resultado");
  const filas = data ?? [];
  const porAccion: Record<string, number> = {};
  for (const f of filas) porAccion[String(f.accion)] = (porAccion[String(f.accion)] ?? 0) + 1;
  return {
    total: filas.length,
    porAccion,
    conResultado: filas.filter((f) => f.resultado).length,
    sinResultado: filas.filter((f) => !f.resultado).length,
  };
}

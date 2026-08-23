import { createHash } from "crypto";
import { supabaseAdmin } from "../supabase/admin";
import { VERSION_PROMPT } from "../ai";

/** Prioridades. Capítulo 28.3. */
export const PRIORIDAD = {
  entrevista: 1,
  proceso_voz: 2,
  contrastar: 3,
  extraer: 5,
  diagnosticar: 7,
  lote: 9,
} as const;

export type TipoJob =
  | "extraer"
  | "contrastar"
  | "entrevista_siguiente"
  | "transcribir_respuesta"
  | "minar_know_how"
  | "generar_proceso"
  | "generar_tobe"
  | "generar_sop"
  | "diagnosticar"
  | "consolidar"
  | "planificar"
  | "redactar_entregables"
  | "evaluar_admision"
  | "evaluar";

export function claveIdempotente(partes: (string | number | null | undefined)[]): string {
  return createHash("sha256").update([...partes, VERSION_PROMPT].join("::")).digest("hex").slice(0, 40);
}

export async function encolar(opts: {
  company_id: string | null;
  tipo: TipoJob;
  payload: Record<string, unknown>;
  prioridad: number;
  idempotency_key?: string;
}): Promise<{ id: string; duplicado: boolean }> {
  const sb = supabaseAdmin();
  const key = opts.idempotency_key ?? claveIdempotente([opts.tipo, JSON.stringify(opts.payload), Date.now()]);
  const { data, error } = await sb
    .from("jobs")
    .insert({ company_id: opts.company_id, tipo: opts.tipo, payload: opts.payload, prioridad: opts.prioridad, idempotency_key: key })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: ex } = await sb.from("jobs").select("id").eq("idempotency_key", key).single();
      return { id: ex!.id, duplicado: true };
    }
    throw error;
  }
  return { id: data.id, duplicado: false };
}

export async function progreso(jobId: string, texto: string) {
  await supabaseAdmin().from("jobs").update({ progreso: texto }).eq("id", jobId);
}

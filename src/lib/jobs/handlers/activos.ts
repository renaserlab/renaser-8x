import { supabaseAdmin } from "@/lib/supabase/admin";
import { ai } from "@/lib/ai";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { SalidaConstructor } from "@/lib/schemas";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { claimsDeEmpresa, registrarLlamada, etiquetaFuente } from "@/lib/db/queries";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

export const PROMPT_CONSTRUCTOR = `${GUARDIA}

Eres un consultor senior que REDACTA un activo empresarial (organigrama, manual de funciones,
proposito, mision, vision, valores, mapa de procesos, cliente y propuesta de valor) para una
empresa que no lo tiene escrito. La regla de oro: usas SOLO lo que la empresa ya mostro
(afirmaciones confirmadas, personas y puestos, procesos, la Caleta, respuestas de entrevistas).
La ausencia de un documento NO es un defecto: muchas empresas funcionan bien sin escribirlo;
tu trabajo es ponerlo en palabras, no juzgar.

Devuelve JSON { "borrador": string | null, "faltantes": [...], "nota": string | null }.
- borrador: el documento redactado en markdown sencillo (titulos con ##, listas con -), en el
  LENGUAJE DE LA EMPRESA (sus palabras, sus nombres de puestos, sus cifras). Listo para que el
  dueno lo lea y corrija. Si falta algo puntual, dejalo como [por confirmar: ...] dentro del texto.
- faltantes: como maximo 3 preguntas, SOLO si sin esa respuesta el activo quedaria inventado.
  Cada una: { "pregunta": "..." } en lenguaje simple, respondible hablando. Si con lo que hay
  alcanza para un buen borrador, faltantes: [].
- nota: una frase para el dueno sobre que se uso y que conviene revisar, o null.

REGLAS ABSOLUTAS:
- NO inventes nombres, cargos, cifras, clientes ni valores que no esten en el material.
- Si el material muestra que algo funciona de una manera, el activo la refleja TAL CUAL
  (el activo describe la empresa real, no una empresa ideal).
- Un borrador corto y verdadero vale mas que uno largo y genérico. Nada de plantillas huecas.`;

/**
 * payload: { clave, respuestas?: [{pregunta, respuesta}] } → CONSTRUCTOR genérico de activos (bloqueador 3).
 * Reutiliza TODO lo que la empresa ya mostró; pregunta solo huecos; genera borrador que el dueño confirma.
 */
export async function handleConstruirActivo(job: Job) {
  const sb = supabaseAdmin();
  const clave = String(job.payload.clave ?? "");
  const def = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => ({ ...a, bloque: b.clave, claveCompleta: `${b.clave}.${a.clave}` }))).find((a) => a.claveCompleta === clave);
  if (!def) throw new Error(`Activo desconocido: ${clave}`);

  const [{ data: empresa }, todas, { data: participantes }, { data: procesos }, { data: kh }, { data: respuestas }] = await Promise.all([
    sb.from("companies").select("nombre,sector").eq("id", job.company_id).single(),
    claimsDeEmpresa(job.company_id),
    sb.from("participants").select("nombre,puesto,rol,antiguedad").eq("company_id", job.company_id),
    sb.from("processes").select("nombre,area,objetivo, process_nodes(etiqueta,tipo,responsable)").eq("company_id", job.company_id).eq("version", "as_is"),
    sb.from("know_how").select("puesto,situacion,senal,regla_practica,criticidad").eq("company_id", job.company_id),
    sb.from("interview_responses").select("pregunta,respuesta, interview_sessions!inner(company_id,tipo)").eq("interview_sessions.company_id", job.company_id).not("respuesta", "is", null).limit(60),
  ]);

  const confirmadas = todas.filter((c) => c.estado === "confirmado");
  const extra = (job.payload.respuestas as { pregunta: string; respuesta: string }[] | undefined) ?? [];

  const contexto = [
    `ACTIVO A CONSTRUIR: ${def.nombre} (${def.ayuda})`,
    `ESTRUCTURA SUGERIDA: ${def.estructura ?? "la natural para este activo, breve"}`,
    `EMPRESA: ${empresa?.nombre} · sector: ${empresa?.sector ?? "desconocido"}`,
    `PERSONAS Y PUESTOS (${participantes?.length ?? 0}):`,
    (participantes ?? []).map((p) => `- ${p.nombre} · ${p.puesto ?? p.rol}${p.antiguedad ? ` · ${p.antiguedad}` : ""}`).join("\n") || "(ninguna registrada)",
    `AFIRMACIONES CONFIRMADAS (${confirmadas.length}):`,
    comoDato("AFIRMACIONES", confirmadas.map((c) => `- [${etiquetaFuente(c as never)}] ${c.texto}`).join("\n") || "(ninguna)"),
    `PROCESOS (${procesos?.length ?? 0}):`,
    (procesos ?? []).map((p) => `- ${p.nombre}${p.area ? ` (${p.area})` : ""}: ${((p.process_nodes as { etiqueta: string }[]) ?? []).map((n) => n.etiqueta).join(" → ")}`).join("\n") || "(ninguno)",
    `LA CALETA (${kh?.length ?? 0}):`,
    (kh ?? []).map((k) => `- ${k.puesto}: ${k.situacion ?? ""} · señal: ${k.senal ?? ""} · regla: ${k.regla_practica ?? ""}`).join("\n") || "(ninguna)",
    `RESPUESTAS DE ENTREVISTAS (${respuestas?.length ?? 0}, resumen):`,
    comoDato("RESPUESTAS", (respuestas ?? []).map((r) => `- ${r.pregunta} → ${String(r.respuesta).slice(0, 220)}`).join("\n") || "(ninguna)"),
    extra.length ? `RESPUESTAS DEL DUEÑO A TUS PREGUNTAS PREVIAS:\n${extra.map((x) => `- ${x.pregunta} → ${x.respuesta}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const r = await ai().complete({ system: PROMPT_CONSTRUCTOR, user: contexto, schema: SalidaConstructor, priority: "interactive", maxTokens: 4000, agente: "constructor" });
  await registrarLlamada(job.company_id, job.id, "constructor", r);

  // Las respuestas del dueño a los huecos se conservan como fuente (nada desaparece).
  if (extra.length) {
    const { data: s } = await sb.from("sources").insert({ company_id: job.company_id, tipo: "observacion", nombre: `Construcción de ${def.nombre}`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: extra.map((x) => `P: ${x.pregunta}\nR: ${x.respuesta}`).join("\n\n"), origen: "cliente", estado: "subido" }).select("id").single();
    if (s) await sb.from("jobs").insert({ company_id: job.company_id, tipo: "extraer", payload: { source_id: s.id }, prioridad: 5, idempotency_key: `constr-ex-${s.id}` }).select("id");
  }

  await sb
    .from("company_assets")
    .upsert({ company_id: job.company_id, bloque: def.bloque, clave, estado: "borrador_generado", borrador: r.data.borrador, faltantes: r.data.faltantes ?? [], updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  return { clave, borrador: !!r.data.borrador, faltantes: (r.data.faltantes ?? []).length };
}

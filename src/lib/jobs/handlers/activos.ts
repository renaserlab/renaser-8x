import { supabaseAdmin } from "@/lib/supabase/admin";
import { ai } from "@/lib/ai";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { SalidaConstructor, SalidaSistematizador } from "@/lib/schemas";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { ESTANDARES } from "@/lib/rules/estandares";
import { baseSistematizacion } from "@/lib/rules/base-renaser";
import { claimsDeEmpresa, registrarLlamada, etiquetaFuente } from "@/lib/db/queries";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

export const PROMPT_CONSTRUCTOR = `${GUARDIA}

Eres un consultor senior que REDACTA un activo empresarial (organigrama, manual de funciones,
proposito/mision/vision/valores, manual de cultura, reglamento interno, plan de personal,
mapa de procesos, cliente y propuesta de valor) para una empresa que no lo tiene escrito.
La regla de oro: usas SOLO lo que la empresa ya mostro (afirmaciones confirmadas, personas y
puestos, procesos, el saber del equipo, respuestas de entrevistas). La ausencia de un documento NO es un
defecto: muchas empresas funcionan bien sin escribirlo; tu trabajo es ponerlo en palabras, no juzgar.

DOCUMENTOS QUE NACEN DE HISTORIAS (cultura, reglamento, plan de personal): cada valor, regla o
plan se ancla en el CASO REAL que la empresa conto ("cuando falto el repartidor, el dueno salio a
repartir" -> el plan B del reparto). Un valor sin su historia, una regla sin su caso o un plan B
sin nombre propio son plantilla hueca: no los escribas. Si la empresa no conto el caso, va a
faltantes como pregunta.

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

export const PROMPT_SISTEMATIZADOR = `${GUARDIA}

Eres el consultor senior de RENASER en la capa de SISTEMATIZACION: recibes el documento DECLARADO
de una empresa (ya confirmado por el dueno: describe como funciona HOY, con sus nombres y sus palabras)
y produces la VERSION TRABAJADA — el mismo documento, mejorado con criterio de consultor.

Recibes ademas: los ESTANDARES del pilar (la vara de una empresa que crece), los HALLAZGOS del
diagnostico de ESTA empresa, el saber del equipo y la ficha (tamano, tipo, etapa).

Devuelve JSON { "propuesta": string | null, "cambios": [...], "nota": string | null }.
- propuesta: el documento trabajado, en markdown sencillo. PARTE del declarado: mismas personas,
  mismos nombres, mismas palabras de la empresa. No es una plantilla nueva: es SU documento, mejorado.
- cambios: maximo 6 — los que mas muevan la aguja. Cada uno { "cambio": "...", "por_que": "..." }:
  el porque SIEMPRE anclado en un estandar de la lista o en un hallazgo del diagnostico, citandolo
  ("el diagnostico encontro que 7 de 10 decisiones pasan por el dueno"). Un cambio sin ancla no se propone.
- nota: si algo del declarado se conserva a proposito, dilo ("la estructura de X se queda como esta:
  funciona"); o si falta una pieza para trabajar bien, dila.

${baseSistematizacion()}

REGLAS ABSOLUTAS:
- PROPORCIONALIDAD: la propuesta es del tamano de la empresa. A 5 personas no se le proponen comites,
  jefaturas ni burocracia. Cada elemento nuevo debe poder mantenerlo la gente que YA existe.
- Lo que funciona se conserva y se reconoce: sistematizar no es cambiar todo.
- El documento lo leera el dueno EN VOZ ALTA a su equipo: cero lenguaje corporativo hueco.
- No inventes nombres, cifras ni areas que el material no muestre.
- La moneda es SIEMPRE soles (S/), nunca dolares. Los montos concretos (limites de caja, topes de
  decision) se proponen como [por definir: p. ej. S/200] salvo que el material ya diga la cifra.
- Si el declarado no alcanza para trabajar con seriedad, propuesta: null y en nota que falta.`;

/** payload: { clave, comentario? } → SISTEMATIZADOR (capa 3): del documento declarado a la versión trabajada. */
export async function handleSistematizarActivo(job: Job) {
  const sb = supabaseAdmin();
  const clave = String(job.payload.clave ?? "");
  const comentario = job.payload.comentario ? String(job.payload.comentario) : null;
  const def = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => ({ ...a, bloque: b.clave, claveCompleta: `${b.clave}.${a.clave}` }))).find((a) => a.claveCompleta === clave);
  if (!def) throw new Error(`Activo desconocido: ${clave}`);
  const { data: activo } = await sb.from("company_assets").select("borrador,estado").eq("company_id", job.company_id).eq("clave", clave).single();
  if (!activo?.borrador) throw new Error("Primero hay que construir y confirmar el documento.");

  const [{ data: empresa }, { data: findings }, { data: kh }] = await Promise.all([
    sb.from("companies").select("nombre,sector,ficha,etapa_negocio,modelo_operativo").eq("id", job.company_id).single(),
    sb.from("findings").select("titulo,causa_raiz,impacto,pilar,patron").eq("company_id", job.company_id).neq("estado_revision", "rechazado").limit(30),
    sb.from("know_how").select("puesto,situacion,senal,regla_practica").eq("company_id", job.company_id).limit(20),
  ]);
  const pilarEstandar = def.bloque === "personas" ? "personas" : def.bloque === "procesos" ? "procesos" : def.bloque === "producto" ? "producto" : "marketing";
  const ficha = (empresa?.ficha ?? {}) as Record<string, string>;

  const contexto = [
    `DOCUMENTO A TRABAJAR: ${def.nombre}`,
    `EMPRESA: ${empresa?.nombre} · ${empresa?.sector ?? ""} · ${ficha.personas ?? "?"} personas · etapa: ${empresa?.etapa_negocio ?? "?"}`,
    comoDato("DOCUMENTO DECLARADO (confirmado por el dueño — la base)", String(activo.borrador)),
    `ESTANDARES DEL PILAR (la vara):\n${(ESTANDARES[pilarEstandar] ?? []).map((e) => "- " + e).join("\n")}`,
    `HALLAZGOS DEL DIAGNOSTICO (${findings?.length ?? 0}):`,
    (findings ?? []).map((f) => `- [${f.impacto} · ${f.pilar}] ${f.titulo}: ${f.causa_raiz ?? ""}`).join("\n") || "(ninguno todavía)",
    `LA CALETA (${kh?.length ?? 0}):`,
    (kh ?? []).map((k) => `- ${k.puesto}: ${k.situacion ?? ""} · señal: ${k.senal ?? ""} · regla: ${k.regla_practica ?? ""}`).join("\n") || "(ninguna)",
    comentario ? `COMENTARIO DEL DUEÑO SOBRE LA PROPUESTA ANTERIOR (atiéndelo):\n${comentario}` : "",
  ].filter(Boolean).join("\n\n");

  const r = await ai().complete({ system: PROMPT_SISTEMATIZADOR, user: contexto, schema: SalidaSistematizador, priority: "interactive", maxTokens: 4000, agente: "sistematizador" });
  await registrarLlamada(job.company_id, job.id, "sistematizador", r);

  await sb
    .from("company_assets")
    .update({ propuesta: r.data.propuesta, propuesta_cambios: r.data.cambios ?? [], propuesta_estado: r.data.propuesta ? "lista" : null, nota: r.data.nota ?? null, updated_at: new Date().toISOString() })
    .eq("company_id", job.company_id)
    .eq("clave", clave);
  return { clave, propuesta: !!r.data.propuesta, cambios: (r.data.cambios ?? []).length };
}

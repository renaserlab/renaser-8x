import { coberturaSesion } from "@/lib/rules/cobertura";
import { supabaseAdmin } from "./supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "./jobs/queue";
import {
  abrirSiguientePregunta, apartarLoSabido, asegurarParticipante, asegurarSesionEntrada, confirmarSintesis, coberturaEntrada, debeExtraer, esConfirmacion,
  filasDeSesion, planDe, preguntaAbiertaDe, ReglaEntrada, TEXTO_CONFIRMA, TEXTO_DOCUMENTO, TEXTO_NO_LO_SE, tratoDeRespuesta,
  type Certeza, type Correccion, type SesionEntrada,
} from "./entrada";

export type OpcionesRespuesta = {
  session_id: string;
  company_id: string;
  response_id?: string;
  texto?: string;
  audio?: File | Blob;
  mime?: string;
};

/** Lo que solo decide la entrada breve al guardar. Fuera de ella no se pasa nada de esto y ninguna columna nueva se toca. */
type OpcionesGuardado = OpcionesRespuesta & {
  /** Con qué certeza se dio. */
  certeza?: Certeza;
  /** De dónde sale lo respondido cuando la respuesta remite a otra cosa («tu archivo «ventas.xlsx»»). */
  sabida_por?: string;
  /** La pregunta que queda en la fila junto a la respuesta: la del plan, cuando la mostrada traía algo ya sabido. */
  pregunta?: string;
  /** false = no va al extractor (una confirmación, un «lo respondo con un documento»). Un «no lo sé» nunca va. */
  extraer?: boolean;
  /** false = no se encola la siguiente pregunta: quien llama la abre en la misma petición. */
  siguiente?: boolean;
};

/** Manda una respuesta al extractor. La clave dice qué respuesta es, no cuándo se pidió: repetir no duplica. */
export function encolarExtraccion(company_id: string, response_id: string) {
  return encolar({ company_id, tipo: "extraer", payload: { response_id }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer", "resp", response_id]) });
}

/** Lo que se le dice a quien intenta responder la entrada breve por la pantalla de conversación de siempre. */
export const ENTRADA_POR_SU_PUERTA = "Estas preguntas se responden en «Cuéntanos tu negocio», desde el inicio del portal, y las responde el dueño.";

/**
 * Registra una respuesta (texto o audio) y dispara extracción + siguiente pregunta. < 150 ms hasta el acuse.
 *
 * LA ENTRADA BREVE TIENE UNA SOLA PUERTA. Su sesión es una entrevista más, así que también aparece donde se
 * listan las conversaciones (el portal, el panel del consultor, el acceso por enlace), y todas esas pantallas
 * responden por aquí: sin certeza, sin la regla del «no lo sé», y dejando responder al consultor, que en la
 * entrada solo mira. Por eso aquí NO se guarda una respuesta a una sesión de entrada: se rechaza diciendo
 * dónde se responde. Quien la responde es su dueño, por responderEntrada (POST /api/companies/[id]/entrada).
 */
export async function registrarRespuesta(opts: OpcionesRespuesta): Promise<{ response_id: string; modo: "texto" | "audio" }> {
  const { data: ses, error } = await supabaseAdmin().from("interview_sessions").select("tipo").eq("id", opts.session_id).maybeSingle();
  // Si no se puede saber qué sesión es, no se guarda: una entrada no entra por aquí porque falló una lectura.
  if (error) throw new Error("No pudimos guardar tu respuesta. Intenta de nuevo.");
  if (ses?.tipo === "entrada_breve") throw new ReglaEntrada(ENTRADA_POR_SU_PUERTA, 409);
  return guardarRespuesta(opts);
}

/** Guarda la respuesta en su fila (y su audio, si lo hay) y encola lo que corresponde. Lo usan todas las entrevistas. */
async function guardarRespuesta(opts: OpcionesGuardado): Promise<{ response_id: string; modo: "texto" | "audio" }> {
  const sb = supabaseAdmin();
  let responseId = opts.response_id;
  if (!responseId) {
    const { data } = await sb.from("interview_responses").select("id").eq("session_id", opts.session_id).is("respuesta", null).order("orden").limit(1);
    responseId = data?.[0]?.id;
  }
  if (!responseId) throw new Error("No hay pregunta abierta en esta sesión.");
  // Lo propio de la entrada breve. Vacío en cualquier otra entrevista: ahí no se escribe ninguna columna nueva.
  const extra = { ...(opts.certeza ? { certeza: opts.certeza } : {}), ...(opts.sabida_por ? { sabida_por: opts.sabida_por } : {}) };
  // La pregunta solo cambia junto con la respuesta, en la misma escritura: nunca queda una sin la otra.
  const conPregunta = opts.pregunta ? { pregunta: opts.pregunta } : {};

  const textoConfirmado = (opts.texto ?? "").trim();
  if (opts.audio && textoConfirmado) {
    // Audio + texto confirmado por la persona: se guarda el audio original y el texto entra directo (sin re-transcribir).
    const path = `${opts.company_id}/respuestas/${responseId}.webm`;
    await sb.storage.from("fuentes").upload(path, opts.audio, { contentType: opts.mime ?? "audio/webm", upsert: true }).catch(() => {});
    await sb.from("interview_responses").update({ respuesta_audio_path: path }).eq("id", responseId);
    opts = { ...opts, audio: undefined };
  }
  if (opts.audio) {
    const path = `${opts.company_id}/respuestas/${responseId}.webm`;
    const { error } = await sb.storage.from("fuentes").upload(path, opts.audio, { contentType: opts.mime ?? "audio/webm", upsert: true });
    if (error) throw new Error("No pudimos guardar el audio. Intenta de nuevo o escribe la respuesta.");
    await sb.from("interview_responses").update({ respuesta_audio_path: path, ...extra }).eq("id", responseId);
    await encolar({ company_id: opts.company_id, tipo: "transcribir_respuesta", payload: { response_id: responseId }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["transcribir", responseId]) });
    return { response_id: responseId, modo: "audio" as const };
  }

  const texto = (opts.texto ?? "").trim();
  if (!texto) throw new Error("La respuesta está vacía.");
  // Si la respuesta no se guardó, se dice aquí: antes se seguía de largo y se encolaba la extracción de una fila vacía.
  const { error: eGuardar } = await sb.from("interview_responses").update({ respuesta: texto, respondido_at: new Date().toISOString(), ...extra, ...conPregunta }).eq("id", responseId);
  if (eGuardar) throw new Error("No pudimos guardar tu respuesta. Intenta de nuevo.");
  const trabajos: Promise<unknown>[] = [];
  if (debeExtraer(opts.certeza, opts.extraer ?? true)) trabajos.push(encolarExtraccion(opts.company_id, responseId));
  if (opts.siguiente ?? true) {
    trabajos.push(encolar({ company_id: opts.company_id, tipo: "entrevista_siguiente", payload: { session_id: opts.session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", opts.session_id, responseId]) }));
  }
  await Promise.all(trabajos);
  return { response_id: responseId, modo: "texto" as const };
}

export async function pedirSiguiente(session_id: string, company_id: string) {
  const sb = supabaseAdmin();
  // ENTRADA BREVE: la pregunta que sigue la decide el plan fijo de la sesión, no el modelo. No hace falta un
  // trabajo en la cola ni esperar al worker: se abre aquí, en la misma petición. Es idempotente (si ya hay
  // una pregunta abierta, devuelve esa), así que recargar la pantalla no abre dos.
  const { data: tipo } = await sb.from("interview_sessions").select("tipo").eq("id", session_id).maybeSingle();
  if (tipo?.tipo === "entrada_breve") {
    const r = await abrirSiguientePregunta(session_id, sb);
    return { id: null, duplicado: r.motivo !== null, plan: true as const, cerrada: r.cerrada };
  }
  // FUENTE DE LA TRIPLE PREGUNTA: la clave llevaba la hora, así que cada recarga de la pantalla
  // mientras se generaba creaba OTRO trabajo generador, y todos insertaban sus preguntas a la vez.
  // Si ya hay un generador pendiente o corriendo para esta sesión, se reutiliza — jamás dos en paralelo.
  const { data: vivo } = await sb.from("jobs").select("id").eq("tipo", "entrevista_siguiente").in("estado", ["pendiente", "corriendo"]).contains("payload", { session_id }).limit(1).maybeSingle();
  if (vivo) return { id: vivo.id, duplicado: true };
  // La clave dice QUÉ se pide, no cuándo: «la pregunta que sigue a N respuestas contestadas». Dos
  // recargas con las mismas N respuestas son la misma petición y devuelven el mismo trabajo; cuando la
  // persona contesta una más, N cambia y la petición es legítimamente otra.
  const { count } = await sb.from("interview_responses").select("id", { count: "exact", head: true }).eq("session_id", session_id).not("respuesta", "is", null);
  return encolar({ company_id, tipo: "entrevista_siguiente", payload: { session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", session_id, `respondidas:${count ?? 0}`]) });
}

/** Estado de una sesión para la pantalla: pregunta abierta, respondidas, progreso de la máquina. */
export async function estadoSesion(session_id: string) {
  const sb = supabaseAdmin();
  const [{ data: ses }, { data: resp }, { data: job }] = await Promise.all([
    sb.from("interview_sessions").select("*, participants(nombre,puesto,rol)").eq("id", session_id).single(),
    sb.from("interview_responses").select("id,pregunta,respuesta,bloque,orden,respondido_at,origen_claim_id,respuesta_audio_path").eq("session_id", session_id).order("orden"),
    sb.from("jobs").select("id,estado,progreso,error").eq("tipo", "entrevista_siguiente").contains("payload", { session_id }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const abierta = (resp ?? []).find((r) => r.respuesta === null) ?? null;
  const respondidasLista = (resp ?? []).filter((r) => r.respuesta !== null);
  let cobertura = ses ? coberturaSesion(ses.tipo, respondidasLista, ((ses as { bloques_cubiertos?: string[] | null }).bloques_cubiertos ?? []) as string[]) : null;
  // La entrada breve no se mide por bloques del banco sino por su plan: «respondidas de doce», en sus cuatro
  // grupos. Se lee aparte para no pedir columnas nuevas en la consulta de las demás entrevistas.
  if (ses?.tipo === "entrada_breve") cobertura = coberturaEntrada(planDe((ses as { plan?: unknown }).plan), await filasDeSesion(session_id, sb));
  const pendienteTranscripcion = (resp ?? []).find((r) => r.respuesta === null && (r as { respuesta_audio_path?: string }).respuesta_audio_path);
  return { sesion: ses, abierta, respondidas: respondidasLista, cobertura, job, pendienteTranscripcion: !!pendienteTranscripcion };
}

// ---------------------------------------------------------------------------------------------------------------
// LA ENTRADA BREVE (R7.1): empezar, responder y confirmar. Las reglas viven en src/lib/entrada.ts; aquí se
// juntan con lo que ya hacía cualquier entrevista: guardarRespuesta guarda (y guarda el audio) y manda al
// extractor, pedirSiguiente abre la pregunta que sigue. Lo que cambia es quién decide la siguiente (el plan)
// y qué NO se extrae: un «no lo sé», una confirmación y un «lo respondo con un documento». Y que lo que el
// dueño escribe o dice se trata igual que un botón: «No lo sé.» con audio sigue siendo un «no lo sé».
// ---------------------------------------------------------------------------------------------------------------

/** Cómo responde el dueño: con sus palabras (o su voz), con «no lo sé», confirmando lo que ya sabíamos, o remitiendo a un documento. */
export type ModoRespuesta = "texto" | "no_lo_se" | "confirma" | "documento";

/**
 * Empieza la entrada del dueño o la retoma: asegura su participante y la sesión (una por empresa, con el plan
 * vigente) y abre la pregunta que toque. Llamarla dos veces no crea dos sesiones ni dos preguntas.
 */
export async function iniciarEntrada(opts: { company_id: string; perfil: { id: string; nombre: string | null } }): Promise<SesionEntrada> {
  const sb = supabaseAdmin();
  const participantId = await asegurarParticipante(opts.company_id, opts.perfil, sb);
  const sesion = await asegurarSesionEntrada(opts.company_id, participantId, sb);
  if (sesion.participant_id !== participantId) throw new ReglaEntrada("Otra persona de tu empresa ya empezó estas preguntas.", 403);
  await pedirSiguiente(sesion.id, opts.company_id);
  return sesion;
}

/**
 * Una respuesta de la entrada. Solo se responde la pregunta abierta, una vez. Devuelve «audio» cuando lo que
 * se guardó es una grabación que todavía hay que pasar a texto: en ese caso la siguiente pregunta la abre el
 * worker al terminar (rama entrada_breve de jobs/handlers/entrevista.ts).
 */
export async function responderEntrada(opts: {
  session_id: string;
  company_id: string;
  response_id: string;
  modo: ModoRespuesta;
  texto?: string;
  /** El dueño marcó «Es aproximado». */
  aproximado?: boolean;
  audio?: File | Blob;
  mime?: string;
}): Promise<{ modo: "texto" | "audio" }> {
  const sb = supabaseAdmin();
  const { data: ses, error: eSesion } = await sb.from("interview_sessions").select("id,plan,sintesis_confirmada_at").eq("id", opts.session_id).maybeSingle();
  if (eSesion) throw new Error(`No pudimos leer tu entrada: ${eSesion.message}`);
  if (!ses) throw new ReglaEntrada("No encontramos tu entrada.", 404);
  if (ses.sintesis_confirmada_at) throw new ReglaEntrada("Ya confirmaste lo que entendimos. Si algo cambió, cuéntaselo a tu consultor.", 409);
  const plan = planDe(ses.plan);
  const filas = await filasDeSesion(opts.session_id, sb);
  const fila = filas.find((f) => f.id === opts.response_id);
  if (!fila) throw new ReglaEntrada("Esa pregunta no es de tu entrada.", 404);
  if (fila.respuesta !== null) throw new ReglaEntrada("Esa pregunta ya tiene respuesta. Podrás corregirla al final, cuando revises lo que entendimos.", 409);
  if (preguntaAbiertaDe(plan, filas)?.id !== fila.id) throw new ReglaEntrada("Esa ya no es la pregunta abierta. Recarga la página para seguir donde te quedaste.", 409);

  let texto = (opts.texto ?? "").trim();
  let certeza: Certeza | undefined = opts.aproximado ? "aproximada" : "exacta";
  let sabida_por: string | undefined;
  let pregunta: string | undefined;
  let extraer = true;
  let audio = opts.audio;

  // Lo que el dueño escribió —o lo que leyó de su audio y dio por bueno— se mira igual que un botón, haya
  // audio o no. Un audio SIN texto todavía no se sabe qué dice: eso lo resuelve el worker al pasarlo a texto.
  const trato = opts.modo === "texto" && texto ? tratoDeRespuesta(fila, texto) : null;

  if (opts.modo === "no_lo_se" || trato === "no_lo_se") {
    // «No lo sé» es una respuesta completa. Se guarda como texto, con su certeza, y no se extrae nada:
    // ni un número, ni un cero, ni un «sin dato» inventado por el modelo. Si lo dijo hablando, su audio queda.
    texto = TEXTO_NO_LO_SE;
    certeza = "no_lo_se";
    extraer = false;
  } else if (opts.modo === "confirma" || trato === "confirma") {
    if (!fila.sabida_por || !esConfirmacion(fila.pregunta)) throw new ReglaEntrada("Esta pregunta necesita tu respuesta con palabras.");
    // Lo confirmado ya está guardado con su fuente: el «sí» —tocado, escrito o dicho— no crea otro número
    // encima del que salió del documento, ni viaja al extractor junto a la pregunta que trae esas cifras.
    texto = TEXTO_CONFIRMA;
    certeza = "exacta";
    extraer = false;
  } else if (opts.modo === "documento") {
    const { data: fuente, error: eFuente } = await sb
      .from("sources")
      .select("id,nombre,tipo,origen,created_at")
      .eq("company_id", opts.company_id)
      .eq("origen", "cliente")
      .neq("tipo", "entrevista")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eFuente) throw new Error(`No pudimos revisar tus archivos: ${eFuente.message}`);
    // Vale un archivo subido PARA esta pregunta: después de que se abrió. Uno que ya estaba (de ayer, de otro
    // año) no la responde; si era ese, lo que diga ya lo habremos traído a la pregunta como algo sabido.
    if (!fuente || !esPosterior(fuente.created_at, fila.created_at)) {
      throw new ReglaEntrada("Todavía no vemos ningún archivo tuyo subido para esta pregunta. Súbelo aquí mismo o responde con tus palabras.", 409);
    }
    // El documento se lee aparte (y lo que salga de él nace «extraído»): aquí solo queda dicho cuál es.
    texto = TEXTO_DOCUMENTO;
    certeza = undefined;
    sabida_por = `tu archivo «${String(fuente.nombre)}»`;
    extraer = false;
    audio = undefined;
  } else if (!texto && !audio) {
    throw new ReglaEntrada("Escribe o graba tu respuesta. Si no lo sabes, toca «No lo sé».");
  } else if (texto) {
    // Responde con sus palabras. Si la pregunta traía algo que ya sabíamos por otra fuente, eso se aparta: al
    // extractor va la pregunta del plan, para que la cifra de un documento no vuelva como dicha por el dueño.
    pregunta = (await apartarLoSabido(opts.session_id, fila, sb)) ?? undefined;
  }

  const r = await guardarRespuesta({ session_id: opts.session_id, company_id: opts.company_id, response_id: fila.id, texto, audio, mime: opts.mime, certeza, sabida_por, pregunta, extraer, siguiente: false });
  if (r.modo === "texto") await pedirSiguiente(opts.session_id, opts.company_id);
  return { modo: r.modo };
}

/** ¿`a` es posterior a `b`? Si alguna de las dos fechas no se puede leer, no: no se da por bueno lo que no se puede comprobar. */
function esPosterior(a: unknown, b: unknown): boolean {
  const ta = Date.parse(String(a ?? ""));
  const tb = Date.parse(String(b ?? ""));
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

/**
 * El dueño confirma «lo que entendimos». Las correcciones son respuestas suyas: van al extractor como
 * cualquier otra, menos la que sea un «no lo sé» (de ahí no sale ningún número). Confirmar dos veces no repite nada.
 */
export async function confirmarEntrada(opts: { session_id: string; company_id: string; correcciones: Correccion[] }) {
  const r = await confirmarSintesis(opts.session_id, opts.correcciones, supabaseAdmin());
  await Promise.all(r.a_extraer.map((id) => encolarExtraccion(opts.company_id, id)));
  return r;
}

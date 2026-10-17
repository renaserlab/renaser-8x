/**
 * LAS PREGUNTAS PARA EL DUEÑO, EN LA BASE (spec-estrategia-8x.md §7.2 y §7.3). SERVIDOR.
 *
 * Lo que falta saber se volvió, sin que nadie lo escriba, preguntas «propuestas» (el manejador del equipo rojo y
 * «Actualizar números» llaman a `proponerPreguntas`). De ahí en adelante:
 *  - la consultora las retoca o las retira antes de enviarlas (su texto también pasa por revisarPregunta);
 *  - las envía con UN toque (`enviarPreguntas`): pasan a «enviada», se activa —o se le actualiza la nota— el pedido
 *    «Unas preguntas para afinar tu plan» (preguntas_estrategia), y se abren las secciones de lo que falta con destino
 *    de sección, con sus líneas AGREGADAS debajo de lo que la consultora escribió en la nota (nunca lo pisan, y la nota
 *    no pasa de su tope: si no cabe, «…y N cosas más que verás al entrar»);
 *  - el dueño responde cada una (`responderPregunta`): con un número, un rango o «No lo sé» si es una cifra; con texto
 *    si es una pregunta abierta. Solo las enviadas de SU empresa, mientras su pedido esté abierto (la ruta lo exige con
 *    exigirLlenado). Mientras el pedido siga abierto puede corregir lo que ya respondió: guarda al salir de cada tarjeta.
 * Lo que responde entra a la estrategia cuando la consultora pulsa «Actualizar números» (acciones.ts).
 *
 * Nada falla callado: cada escritura que no se puede se devuelve con su texto; enviar dos veces no repite nada.
 */
import { supabaseAdmin } from "../supabase/admin";
import { AVISO_DATO_NO_ENTENDIDO, AVISO_DATO_VACIO, esquemaDatoOral, type DatoOral } from "../dato-oral";
import { SECCION, type Seccion } from "../secciones";
import { leerVersionPorId, versiones, type VersionEstrategia } from "./datos";
import { notaConLineas, pedidosDesdeFaltantes, seccionesPorAbrir, type EsperaPregunta, type PreguntaPropuesta } from "./pedidos";
import { palabrasQueElDuenoNoVe, revisarPregunta } from "./validador";
import { API, PREGUNTAS } from "./textos";
import { faltaLaMigracion, mensajeDe, no, type Resultado } from "./resultado";

export type EstadoPregunta = "propuesta" | "enviada" | "respondida" | "retirada";

/** Lo que ve la consultora de cada pregunta. */
export const COLUMNAS_PREGUNTA = "id,company_id,estrategia_id,clave,texto,por_que,unidad,estado,espera,respuesta,respuesta_texto,enviada_at,respondida_at,created_at,updated_at";
/** Lo que ve el dueño: sin el porqué para la consultora, sin la clave del catálogo y sin las jugadas que espera. */
export const COLUMNAS_PREGUNTA_DUENO = "id,texto,unidad,estado,respuesta,respuesta_texto,respondida_at";

/** Lo que admite la base en el texto de una pregunta (check de estrategia_preguntas.texto). */
const TEXTO_MIN = 8;
const TEXTO_MAX = 200;
const POR_QUE_MAX = 300;
const ahoraIso = () => new Date().toISOString();

// ─── Proponer (al terminar una generación y al actualizar los números) ───────────────────────────

const mismaEspera = (a: EsperaPregunta, b: EsperaPregunta) => a.version === b.version && a.camino === b.camino && a.jugada === b.jugada;
const unirEsperas = (previas: EsperaPregunta[], nuevas: EsperaPregunta[]) => [...previas, ...nuevas.filter((n) => !previas.some((x) => mismaEspera(x, n)))];

/**
 * Crea cada pregunta como «propuesta». Si ya hay una abierta de esa clave (índice «una abierta»), no se duplica: se
 * suman a su `espera` las jugadas de esta versión. Nada se envía: eso es un toque de la consultora.
 */
export async function proponerPreguntas(companyId: string, estrategiaId: string, preguntas: PreguntaPropuesta[]): Promise<number> {
  const sb = supabaseAdmin();
  let nuevas = 0;
  const abierta = async (clave: string) =>
    (await sb.from("estrategia_preguntas").select("id,espera").eq("company_id", companyId).eq("clave", clave).in("estado", ["propuesta", "enviada"]).limit(1).maybeSingle()).data as { id: string; espera: EsperaPregunta[] | null } | null;
  const sumarA = async (fila: { id: string; espera: EsperaPregunta[] | null }, p: PreguntaPropuesta) => {
    const { error } = await sb.from("estrategia_preguntas").update({ espera: unirEsperas(fila.espera ?? [], p.espera), updated_at: ahoraIso() }).eq("id", fila.id).eq("company_id", companyId);
    if (error) throw new Error(`No se pudo actualizar la pregunta «${p.clave}»: ${error.message}`);
  };
  for (const p of preguntas) {
    const previa = await abierta(p.clave);
    if (previa) {
      await sumarA(previa, p);
      continue;
    }
    const { error } = await sb.from("estrategia_preguntas").insert({ company_id: companyId, estrategia_id: estrategiaId, clave: p.clave, texto: p.texto, por_que: p.por_que, unidad: p.unidad, estado: "propuesta", espera: p.espera });
    if (!error) {
      nuevas++;
      continue;
    }
    // Otra versión la abrió justo ahora: se suma a esa.
    const ganadora = error.code === "23505" ? await abierta(p.clave) : null;
    if (!ganadora) throw new Error(`No se pudo proponer la pregunta «${p.clave}»: ${error.message}`);
    await sumarA(ganadora, p);
  }
  return nuevas;
}

// ─── Leer ────────────────────────────────────────────────────────────────────────────────────────

/** Las preguntas de una empresa, las más recientes primero (tope 200). Al dueño, solo las enviadas y respondidas. */
export async function listarPreguntas(companyId: string, o: { paraDueno?: boolean } = {}): Promise<Resultado<{ preguntas: Record<string, unknown>[] }>> {
  let q = supabaseAdmin().from("estrategia_preguntas").select(o.paraDueno ? COLUMNAS_PREGUNTA_DUENO : COLUMNAS_PREGUNTA).eq("company_id", companyId);
  if (o.paraDueno) q = q.in("estado", ["enviada", "respondida"]);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return faltaLaMigracion(error.code) ? no(409, "no_habilitadas", PREGUNTAS.no_habilitadas) : no(500, "lectura", mensajeDe(error));
  return { ok: true, preguntas: (data ?? []) as unknown as Record<string, unknown>[] };
}

/** La versión de la que salen las secciones que se abren: la pedida, o la más nueva que ya tiene su estrategia. */
async function versionParaEnviar(companyId: string, estrategiaId: string | null | undefined): Promise<VersionEstrategia | null | "no_es_de_la_empresa"> {
  if (estrategiaId) return (await leerVersionPorId(companyId, estrategiaId)) ?? "no_es_de_la_empresa";
  const conEstrategia = (await versiones(companyId)).find((v) => v.estado === "lista" || v.estado === "con_observaciones" || v.estado === "aprobada");
  return conEstrategia ? leerVersionPorId(companyId, conEstrategia.id) : null;
}

/** Lo que una versión le abriría al dueño (sección por sección, con sus líneas), para la confirmación y para el envío. */
export function porAbrirDe(v: Pick<VersionEstrategia, "vigente" | "paquete" | "version"> | null): { seccion: Seccion; lineas: string[] }[] {
  if (!v?.vigente) return [];
  return seccionesPorAbrir(pedidosDesdeFaltantes(v.vigente, v.paquete, v.version));
}

/** La confirmación del envío, antes de enviar: las preguntas propuestas y las secciones que se abrirían. */
export async function vistaPreviaDeEnvio(companyId: string, estrategiaId?: string | null): Promise<Resultado<{ estrategia_id: string | null; secciones: { seccion: Seccion; nombre: string; lineas: string[] }[] }>> {
  const v = await versionParaEnviar(companyId, estrategiaId);
  if (v === "no_es_de_la_empresa") return no(404, "version_no_existe", API.version_no_existe);
  return { ok: true, estrategia_id: v?.id ?? null, secciones: porAbrirDe(v).map((s) => ({ ...s, nombre: SECCION[s.seccion].paraDueno })) };
}

// ─── Avisar al dueño y abrir secciones ───────────────────────────────────────────────────────────

/**
 * El pedido «Unas preguntas para afinar tu plan»: con preguntas enviadas sin responder, activo y con la cuenta en la
 * nota; sin ninguna y `retirarSiNoQuedan` (la consultora retiró la última), se retira: el dueño no entra a una página
 * vacía. Devuelve cuántas quedan sin responder.
 */
export async function avisarPreguntas(companyId: string, porId: string | null, o: { retirarSiNoQuedan?: boolean } = {}): Promise<{ sin_responder: number; solicitud_id: string | null }> {
  const sb = supabaseAdmin();
  const { count, error: errorContar } = await sb.from("estrategia_preguntas").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "enviada");
  if (errorContar || count == null) throw new Error(errorContar?.message ?? "no se pudo contar las preguntas enviadas");
  const leerActiva = async () => {
    const { data, error } = await sb.from("solicitudes_cliente").select("id,nota").eq("company_id", companyId).eq("seccion", "preguntas_estrategia").eq("estado", "activa").maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; nota: string | null } | null;
  };
  const activa = await leerActiva();
  if (!count) {
    if (activa && o.retirarSiNoQuedan) {
      const { error } = await sb.from("solicitudes_cliente").update({ estado: "retirada", retirada_at: ahoraIso() }).eq("id", activa.id).eq("company_id", companyId).eq("estado", "activa");
      if (error) throw new Error(error.message);
      return { sin_responder: 0, solicitud_id: null };
    }
    return { sin_responder: 0, solicitud_id: activa?.id ?? null };
  }
  const nota = PREGUNTAS.nota(count);
  const actualizar = async (id: string) => {
    const { error } = await sb.from("solicitudes_cliente").update({ nota }).eq("id", id).eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return id;
  };
  if (activa) return { sin_responder: count, solicitud_id: activa.nota === nota ? activa.id : await actualizar(activa.id) };
  const { data, error } = await sb.from("solicitudes_cliente").insert({ company_id: companyId, seccion: "preguntas_estrategia", nota, estado: "activa", activada_por: porId }).select("id").single();
  if (!error && data) return { sin_responder: count, solicitud_id: String((data as { id: string }).id) };
  // Otra pestaña lo activó en el mismo instante: la base no deja dos activos de la misma sección.
  if (error?.code === "23505") {
    const ganadora = await leerActiva();
    if (ganadora) return { sin_responder: count, solicitud_id: await actualizar(ganadora.id) };
  }
  throw new Error(error?.message ?? "la base no devolvió el pedido");
}

export type SeccionAbierta = { seccion: Seccion; nombre: string; nota: string | null; agregadas: string[]; no_cupieron: string[]; nueva: boolean };

/** Abre una sección para el dueño (o actualiza su nota) con las líneas de la estrategia agregadas debajo de lo que había. */
export async function abrirSeccion(companyId: string, seccion: Seccion, lineas: string[], porId: string | null): Promise<SeccionAbierta> {
  const sb = supabaseAdmin();
  const leerActiva = async () => {
    const { data, error } = await sb.from("solicitudes_cliente").select("id,nota").eq("company_id", companyId).eq("seccion", seccion).eq("estado", "activa").maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; nota: string | null } | null;
  };
  const enNota = async (fila: { id: string; nota: string | null }) => {
    const r = notaConLineas(fila.nota, lineas);
    if (r.nota !== (fila.nota?.trim() || null)) {
      const { error } = await sb.from("solicitudes_cliente").update({ nota: r.nota }).eq("id", fila.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    }
    return { seccion, nombre: SECCION[seccion].paraDueno, ...r, nueva: false };
  };
  const activa = await leerActiva();
  if (activa) return enNota(activa);
  const r = notaConLineas(null, lineas);
  const { error } = await sb.from("solicitudes_cliente").insert({ company_id: companyId, seccion, nota: r.nota, estado: "activa", activada_por: porId }).select("id").single();
  if (!error) return { seccion, nombre: SECCION[seccion].paraDueno, ...r, nueva: true };
  if (error.code === "23505") {
    const ganadora = await leerActiva();
    if (ganadora) return enNota(ganadora);
  }
  throw new Error(error.message);
}

// ─── Enviar (un toque de la consultora) ──────────────────────────────────────────────────────────

/** Los problemas de una pregunta para el dueño, en palabras; vacío = se puede hacer así. */
export function problemasDePregunta(texto: string): string[] {
  const t = texto.trim();
  const problemas = [...revisarPregunta(t)];
  const palabras = palabrasQueElDuenoNoVe(t);
  if (palabras.length) problemas.push(`usa palabras que el dueño no tiene por qué conocer: ${palabras.join(", ")}`);
  if (t.length < TEXTO_MIN) problemas.push("es demasiado corta");
  if (t.length > TEXTO_MAX) problemas.push(`pasa de ${TEXTO_MAX} caracteres`);
  return problemas;
}

export type ResultadoEnvio = {
  enviadas: number;
  ya_enviadas: number;
  sin_responder: number;
  solicitud_id: string | null;
  secciones: SeccionAbierta[];
  resumen: string;
};

/**
 * Envía las preguntas elegidas y abre lo que falta con destino de sección. Lo ya enviado no se repite: volver a
 * enviar después de un fallo termina lo que faltó. `secciones` acota las secciones que se abren (por defecto, todas
 * las que la versión necesita).
 */
export async function enviarPreguntas(x: { companyId: string; ids: string[]; estrategiaId?: string | null; secciones?: Seccion[] | null; porId: string | null }): Promise<Resultado<ResultadoEnvio>> {
  const sb = supabaseAdmin();
  const ids = [...new Set(x.ids)];

  // 1 · Las preguntas: todas de esta empresa, y ninguna respondida ni retirada.
  let filas: { id: string; estado: EstadoPregunta; texto: string }[] = [];
  if (ids.length) {
    const { data, error } = await sb.from("estrategia_preguntas").select("id,estado,texto").eq("company_id", x.companyId).in("id", ids);
    if (error) return faltaLaMigracion(error.code) ? no(409, "no_habilitadas", PREGUNTAS.no_habilitadas) : no(500, "lectura", mensajeDe(error));
    filas = (data ?? []) as unknown as typeof filas;
    if (filas.length < ids.length) return no(404, "no_es_de_la_empresa", PREGUNTAS.no_es_de_la_empresa);
    const cerrada = filas.find((f) => f.estado === "respondida" || f.estado === "retirada");
    if (cerrada) return no(409, "ya_no_se_envia", PREGUNTAS.ya_no_se_envia(cerrada.estado), { pregunta_id: cerrada.id });
    const mal = filas.map((f) => ({ f, p: problemasDePregunta(f.texto) })).find((y) => y.p.length);
    if (mal) return no(409, "pregunta_mal_hecha", PREGUNTAS.mal_hecha(mal.p.join("; ")), { pregunta_id: mal.f.id });
  }

  // 2 · Lo que se abre por sección, de la versión que pidió estas preguntas (o la más nueva con su estrategia).
  const v = await versionParaEnviar(x.companyId, x.estrategiaId);
  if (v === "no_es_de_la_empresa") return no(404, "version_no_existe", API.version_no_existe);
  const porAbrir = porAbrirDe(v).filter((s) => !x.secciones || x.secciones.includes(s.seccion));
  if (!ids.length && !porAbrir.length) return no(400, "nada_que_enviar", PREGUNTAS.nada_que_enviar);

  // 3 · Las propuestas pasan a enviadas (el estado de partida en la consulta: dos envíos a la vez no se pisan).
  const propuestas = filas.filter((f) => f.estado === "propuesta").map((f) => f.id);
  let enviadas = 0;
  if (propuestas.length) {
    const { data, error } = await sb
      .from("estrategia_preguntas")
      .update({ estado: "enviada", enviada_por: x.porId, enviada_at: ahoraIso(), updated_at: ahoraIso() })
      .eq("company_id", x.companyId)
      .in("id", propuestas)
      .eq("estado", "propuesta")
      .select("id");
    if (error) return no(500, "envio", mensajeDe(error));
    enviadas = ((data ?? []) as unknown[]).length;
  }

  // 4 · El aviso al dueño: el pedido de las preguntas, con su cuenta.
  let aviso: { sin_responder: number; solicitud_id: string | null } = { sin_responder: 0, solicitud_id: null };
  if (ids.length) {
    try {
      aviso = await avisarPreguntas(x.companyId, x.porId);
    } catch (e) {
      return no(500, "no_se_aviso", PREGUNTAS.no_se_aviso(mensajeDe(e)), { enviadas });
    }
  }

  // 5 · Las secciones, con su nota agregada.
  const abiertas: SeccionAbierta[] = [];
  for (const s of porAbrir) {
    try {
      abiertas.push(await abrirSeccion(x.companyId, s.seccion, s.lineas, x.porId));
    } catch (e) {
      return no(500, "no_se_abrio", PREGUNTAS.no_se_abrio(SECCION[s.seccion].paraDueno, mensajeDe(e)), { enviadas, secciones: abiertas });
    }
  }
  return {
    ok: true,
    enviadas,
    ya_enviadas: filas.length - propuestas.length,
    sin_responder: aviso.sin_responder,
    solicitud_id: aviso.solicitud_id,
    secciones: abiertas,
    resumen: PREGUNTAS.resumen_envio(filas.length, abiertas.map((a) => a.nombre)),
  };
}

// ─── Retocar y retirar (la consultora) ───────────────────────────────────────────────────────────

async function leerPregunta(companyId: string, id: string): Promise<{ id: string; estado: EstadoPregunta; unidad: string; texto: string } | null | Error> {
  const { data, error } = await supabaseAdmin().from("estrategia_preguntas").select("id,estado,unidad,texto").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) return new Error(faltaLaMigracion(error.code) ? PREGUNTAS.no_habilitadas : error.message);
  return data as { id: string; estado: EstadoPregunta; unidad: string; texto: string } | null;
}

/** La consultora retoca el texto (o el porqué) de una pregunta que todavía no envió. */
export async function retocarPregunta(x: { companyId: string; id: string; texto?: string | null; por_que?: string | null }): Promise<Resultado<{ pregunta: Record<string, unknown> }>> {
  const p = await leerPregunta(x.companyId, x.id);
  if (p instanceof Error) return no(500, "lectura", p.message);
  if (!p) return no(404, "no_es_de_la_empresa", PREGUNTAS.no_es_de_la_empresa);
  if (p.estado !== "propuesta") return no(409, "solo_propuesta", PREGUNTAS.solo_propuesta_se_retoca);
  const cambios: Record<string, unknown> = { updated_at: ahoraIso() };
  if (x.texto != null) {
    const problemas = problemasDePregunta(x.texto);
    if (problemas.length) return no(400, "pregunta_mal_hecha", PREGUNTAS.mal_hecha(problemas.join("; ")));
    cambios.texto = x.texto.trim();
  }
  if (x.por_que !== undefined) cambios.por_que = x.por_que?.trim().slice(0, POR_QUE_MAX) || null;
  const { data, error } = await supabaseAdmin().from("estrategia_preguntas").update(cambios).eq("id", x.id).eq("company_id", x.companyId).eq("estado", "propuesta").select(COLUMNAS_PREGUNTA).maybeSingle();
  if (error) return no(500, "guardar", mensajeDe(error));
  if (!data) return no(409, "solo_propuesta", PREGUNTAS.solo_propuesta_se_retoca);
  return { ok: true, pregunta: data as unknown as Record<string, unknown> };
}

/** La consultora retira una pregunta (propuesta o enviada). Si era la última enviada, el pedido del dueño se retira. */
export async function retirarPregunta(x: { companyId: string; id: string; porId: string | null }): Promise<Resultado<{ pregunta: Record<string, unknown>; sin_responder: number }>> {
  const p = await leerPregunta(x.companyId, x.id);
  if (p instanceof Error) return no(500, "lectura", p.message);
  if (!p) return no(404, "no_es_de_la_empresa", PREGUNTAS.no_es_de_la_empresa);
  if (p.estado === "retirada") return no(409, "ya_retirada", PREGUNTAS.ya_retirada);
  if (p.estado === "respondida") return no(409, "respondida", PREGUNTAS.respondida_no_se_retira);
  const { data, error } = await supabaseAdmin().from("estrategia_preguntas").update({ estado: "retirada", updated_at: ahoraIso() }).eq("id", x.id).eq("company_id", x.companyId).eq("estado", p.estado).select(COLUMNAS_PREGUNTA).maybeSingle();
  if (error) return no(500, "guardar", mensajeDe(error));
  if (!data) return no(409, "cambio", API.cambio_mientras_tanto);
  let sin_responder = 0;
  if (p.estado === "enviada") {
    try {
      sin_responder = (await avisarPreguntas(x.companyId, x.porId, { retirarSiNoQuedan: true })).sin_responder;
    } catch (e) {
      return no(500, "no_se_aviso", PREGUNTAS.no_se_aviso(mensajeDe(e)));
    }
  }
  return { ok: true, pregunta: data as unknown as Record<string, unknown>, sin_responder };
}

// ─── Responder (el dueño) ────────────────────────────────────────────────────────────────────────

const DatoDueno = esquemaDatoOral({ sinComprobado: true });
const DatoDuenoDeCada10 = esquemaDatoOral({ sinComprobado: true, max: 10 });

/**
 * El dueño responde una pregunta enviada a su empresa (o corrige la que ya respondió, mientras su pedido siga abierto).
 * Una cifra va como número, rango o «No lo sé» (nunca «comprobado»: eso lo marca la consultora); una pregunta abierta,
 * como texto. La ruta ya comprobó que es dueño o líder de la empresa y que su pedido está abierto (exigirLlenado).
 */
export async function responderPregunta(x: { companyId: string; id: string; porId: string; respuesta?: unknown; respuesta_texto?: string | null }): Promise<Resultado<{ pregunta: Record<string, unknown>; sin_responder: number }>> {
  const p = await leerPregunta(x.companyId, x.id);
  if (p instanceof Error) return no(500, "lectura", p.message);
  // Una propuesta o una retirada no existe para el dueño: no se le dice cuál es cuál.
  if (!p || (p.estado !== "enviada" && p.estado !== "respondida")) return no(404, "no_esta_para_ti", PREGUNTAS.no_esta_para_ti);
  const texto = x.respuesta_texto?.trim() || null;
  let respuesta: DatoOral | null = null;
  if (p.unidad === "texto") {
    if (!texto) return no(400, "falta_respuesta", PREGUNTAS.falta_texto);
  } else {
    if (x.respuesta == null) return no(400, "falta_respuesta", AVISO_DATO_VACIO);
    const r = (p.unidad === "de_cada_10" ? DatoDuenoDeCada10 : DatoDueno).safeParse(x.respuesta);
    if (!r.success) {
      // Las reglas del dato dicho hablan en castellano; lo demás (un tipo equivocado) se dice como «no entendimos».
      const propio = r.error.issues.find((i) => i.code === "custom" || /no puede/.test(i.message))?.message;
      return no(400, "falta_respuesta", propio ?? AVISO_DATO_NO_ENTENDIDO);
    }
    respuesta = r.data;
  }
  const { data, error } = await supabaseAdmin()
    .from("estrategia_preguntas")
    .update({ estado: "respondida", respuesta, respuesta_texto: texto, respondida_por: x.porId, respondida_at: ahoraIso(), updated_at: ahoraIso() })
    .eq("id", x.id)
    .eq("company_id", x.companyId)
    .in("estado", ["enviada", "respondida"])
    .select(COLUMNAS_PREGUNTA_DUENO)
    .maybeSingle();
  if (error) return no(500, "guardar", mensajeDe(error));
  if (!data) return no(404, "no_esta_para_ti", PREGUNTAS.no_esta_para_ti);
  const { count } = await supabaseAdmin().from("estrategia_preguntas").select("id", { count: "exact", head: true }).eq("company_id", x.companyId).eq("estado", "enviada");
  return { ok: true, pregunta: data as unknown as Record<string, unknown>, sin_responder: count ?? 0 };
}

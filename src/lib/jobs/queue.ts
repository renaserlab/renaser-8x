import { createHash } from "crypto";
import { supabaseAdmin } from "../supabase/admin";
import { trabajoActual } from "./contexto";
import { VERSION_PROMPT } from "../ai";
import { CIRCUITO_CREDITO, PAUSA_CREDITO_SEG, PREFIJOS_ERROR_PAUSA } from "./reglas";

/**
 * Prioridades. Capítulo 28.3. La estrategia (spec-estrategia-8x.md §5.3) va en 6: cuenta como pesada en `take_job`
 * (prioridad ≥ 5), así que una empresa corre a lo sumo dos a la vez —justo las dos lentes— y las entrevistas (1)
 * pasan primero en cuanto se libera un cupo.
 */
export const PRIORIDAD = {
  entrevista: 1,
  proceso_voz: 2,
  contrastar: 3,
  extraer: 5,
  estrategia: 6,
  diagnosticar: 7,
  lote: 9,
} as const;

export type TipoJob =
  | "extraer"
  | "contrastar"
  | "entrevista_siguiente"
  | "transcribir_respuesta"
  | "minar_know_how"
  | "proponer_indicadores"
  | "estudio_organigrama"
  | "modelo_alto_rendimiento"
  | "seleccionar_procesos"
  | "revisar_documento"
  | "generar_proceso"
  | "generar_tobe"
  | "generar_sop"
  | "diagnosticar"
  | "consolidar"
  | "planificar"
  | "redactar_entregables"
  | "evaluar_admision"
  | "construir_activo"
  | "sistematizar_activo"
  | "ficha_direccion"
  | "estrategia_lente"
  | "estrategia_rojo"
  | "evaluar";

export function claveIdempotente(partes: (string | number | null | undefined)[]): string {
  return createHash("sha256").update([...partes, VERSION_PROMPT].join("::")).digest("hex").slice(0, 40);
}

/**
 * JSON canónico: las claves de cada objeto ordenadas, en todos los niveles. Dos peticiones que dicen
 * lo mismo con las claves en distinto orden (`{a,b}` y `{b,a}`) tienen que producir la MISMA clave;
 * `JSON.stringify` a secas no lo garantiza. Los `undefined` desaparecen, como en JSON.
 */
export function canonico(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => ((acc[k] = ordenar(o[k])), acc), {});
    }
    return v;
  };
  return JSON.stringify(ordenar(valor));
}

/**
 * LA CLAVE DE UNA PETICIÓN ES LA PETICIÓN, NO EL MOMENTO. La clave por defecto llevaba la hora
 * (`Date.now()`), así que la misma petición repetida —un doble clic, una recarga, un reintento de
 * red— creaba OTRO trabajo idéntico. Así nació la «triple pregunta» de la entrevista, y así se
 * multiplicó el gasto en modelo sin que nadie lo pidiera. Dos peticiones iguales son UN trabajo:
 * la clave sale solo del tipo, la empresa y el contenido canónico del payload.
 *
 * Quien necesite que una petición igual vuelva a correr más tarde (re-redactar un plan, volver a
 * construir un activo) lo dice en la clave con un dato con significado —la ronda, el número de
 * respuestas contestadas, la versión archivada—, nunca con la hora.
 */
export function claveDePeticion(tipo: string, company_id: string | null, payload: Record<string, unknown>): string {
  return claveIdempotente([tipo, company_id ?? "", canonico(payload)]);
}

/**
 * Despierta el drenaje serverless de la cola (Vercel). Sin await: nunca frena la respuesta al usuario.
 * Guardas: solo con WORKER_DRAIN_SECRET configurado, y nunca desde dentro del propio drenaje o del worker
 * local (los trabajos encadenados ya serán tomados por el bucle en curso).
 */
let drenando = false;
export function marcarDrenando(v: boolean) {
  drenando = v;
}
function despertarWorker() {
  const secreto = process.env.WORKER_DRAIN_SECRET;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!secreto || !base || drenando || process.env.WORKER_LOCAL === "1") return;
  fetch(`${base}/api/worker/drain`, { method: "POST", headers: { "x-worker-secret": secreto } }).catch(() => {});
}

/** Un trabajo en estos estados ya no va a cambiar: la petición que lo creó se cumplió o se perdió. */
const ESTADOS_TERMINALES = new Set(["hecho", "fallido"]);
/**
 * Cuántas claves seguidas puede probar `encolar` cuando la petición ya terminó antes. Normalmente basta
 * una (la ronda siguiente); hacen falta más solo si alguien borró trabajos y la cuenta de rondas bajó.
 */
const VUELTAS_MAX = 6;

/**
 * Encola un trabajo. `idempotency_key` es `unique` en la tabla (schema.sql): si la clave ya existe,
 * Postgres responde 23505 y aquí se devuelve el trabajo EXISTENTE con `duplicado: true`, nunca un
 * error al que encola. Así la idempotencia es una propiedad de la cola y no una cortesía de cada ruta.
 *
 * UNA PETICIÓN IGUAL NO ES UNA PETICIÓN ETERNA. Con la clave por defecto (tipo + empresa + payload),
 * si la primera versión de esta función encontraba un trabajo ya `hecho` con esa clave, devolvía ese
 * trabajo viejo para siempre: no se podía volver a diagnosticar tras subir fuentes nuevas ni regenerar
 * un procedimiento hasta cambiar VERSION_PROMPT. La regla correcta tiene dos mitades:
 *  - mientras la petición está VIVA (pendiente o corriendo), repetirla devuelve ese trabajo: doble clic,
 *    recarga y reintento de red son UN trabajo;
 *  - cuando la petición ya TERMINÓ (hecho o fallido), repetirla abre la ronda siguiente: la clave pasa a
 *    ser [huella, «ronda», N] con N = rondas ya terminadas (`rondaDe`), que es un dato con significado y
 *    no la hora. Dos peticiones iguales durante esa ronda vuelven a ser un solo trabajo.
 * Con clave EXPLÍCITA no se abre ronda: quien la puso decidió qué significa repetir (los tramos de una
 * extracción, por ejemplo, deben seguir «ya hechos» aunque se vuelva a pedir).
 */
export async function encolar(opts: {
  company_id: string | null;
  tipo: TipoJob;
  payload: Record<string, unknown>;
  prioridad: number;
  idempotency_key?: string;
  /** De qué trabajo nace este. Por defecto, el que esté corriendo (contexto ambiental del worker). */
  origen_job_id?: string | null;
}): Promise<{ id: string; duplicado: boolean }> {
  const sb = supabaseAdmin();
  const explicita = opts.idempotency_key !== undefined;
  const huella = claveDePeticion(opts.tipo, opts.company_id, opts.payload);
  let key = opts.idempotency_key ?? huella;
  let ronda: number | null = null;
  for (let vuelta = 0; vuelta < VUELTAS_MAX; vuelta++) {
    const { data, error } = await sb
      .from("jobs")
      .insert({
        company_id: opts.company_id,
        tipo: opts.tipo,
        payload: opts.payload,
        prioridad: opts.prioridad,
        idempotency_key: key,
        origen_job_id: opts.origen_job_id ?? trabajoActual()?.jobId ?? null,
      })
      .select("id")
      .single();
    if (!error) {
      despertarWorker();
      return { id: data.id, duplicado: false };
    }
    if (error.code !== "23505") throw error;
    const { data: ex } = await sb.from("jobs").select("id,estado").eq("idempotency_key", key).maybeSingle();
    // Carrera rarísima: la fila chocó y desapareció antes de leerla. Se dice, no se inventa un id.
    if (!ex) throw new Error(`La cola rechazó el trabajo ${opts.tipo} por clave repetida y el original ya no está.`);
    if (explicita || !ESTADOS_TERMINALES.has(String(ex.estado))) return { id: ex.id, duplicado: true };
    // La petición ya terminó: se abre la ronda siguiente. Si esa clave también choca con un trabajo
    // terminado (alguien borró trabajos y la cuenta bajó), se sigue contando; nunca se mete la hora.
    ronda = ronda === null ? await rondaDe(opts.tipo, opts.company_id, opts.payload) : ronda + 1;
    key = claveIdempotente([huella, "ronda", ronda]);
  }
  throw new Error(`La cola no pudo encolar ${opts.tipo}: ${VUELTAS_MAX} claves seguidas chocaron con trabajos ya terminados.`);
}

/**
 * Cuántas veces este tipo de trabajo ya TERMINÓ (hecho o fallido) para la empresa; con `filtroPayload`
 * se acota (p. ej. a la clave de un activo). Sirve para dar a una petición repetible una clave con
 * significado: «la ronda N». Mientras una ronda está pendiente o corriendo, la misma petición devuelve
 * ese trabajo; cuando termina, la siguiente petición abre la ronda N+1. Sin hora, sin azar.
 * `company_id` nulo cuenta los trabajos sin empresa (`is null`), no los de todas.
 */
export async function rondaDe(tipo: TipoJob, company_id: string | null, filtroPayload?: Record<string, unknown>): Promise<number> {
  let q = supabaseAdmin().from("jobs").select("id", { count: "exact", head: true }).eq("tipo", tipo).in("estado", ["hecho", "fallido"]);
  q = company_id ? q.eq("company_id", company_id) : q.is("company_id", null);
  if (filtroPayload && Object.keys(filtroPayload).length) q = q.contains("payload", filtroPayload);
  const { count, error } = await q;
  if (error) throw new Error(`No se pudo contar las rondas de ${tipo}: ${error.message}`);
  return count ?? 0;
}

export async function progreso(jobId: string, texto: string) {
  await supabaseAdmin().from("jobs").update({ progreso: texto }).eq("id", jobId);
}

// ---- Circuito de crédito: la cola entera espera cuando el proveedor no tiene saldo ----

/**
 * ¿Está abierto el circuito de crédito? Una ida a la base, sin escribir. Si la base no responde se
 * asume cerrado: un 402 real volverá a abrirlo sin gastar intentos. Quién decide cada cuánto preguntar
 * es el worker (lleva el reloj); aquí no hay hora ni memoria.
 */
export async function circuitoCreditoAbierto(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin().rpc("circuito_abierto", { p_clave: CIRCUITO_CREDITO });
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Abre el circuito de crédito por PAUSA_CREDITO_SEG. Umbral 1: con la falta de crédito no hay que
 * «confirmar» nada con tres fallos, el primer 402 ya es la noticia completa. Es el mismo mecanismo
 * compartido (Postgres) del cortacircuitos del modelo: la primera instancia que lo ve protege a todas.
 */
export async function abrirCircuitoCredito(): Promise<void> {
  try {
    await supabaseAdmin().rpc("circuito_fallo", { p_clave: CIRCUITO_CREDITO, p_umbral: 1, p_corte_seg: PAUSA_CREDITO_SEG });
  } catch {
    // Si no se pudo anotar, el siguiente trabajo volverá a encontrarse el 402 y volverá a intentarlo.
  }
}

// ---- Reencolar con cabeza ----

export type ResultadoReencolar = {
  reencolado: boolean;
  /** Por qué NO se reencoló. `null` cuando sí. */
  motivo: string | null;
  /** El trabajo que ahora representa la petición: el nuevo, o el posterior que ya la cumplió. */
  job_id: string | null;
  /** Si existe un trabajo posterior que ya hizo lo mismo, cuál. */
  job_posterior_id: string | null;
};

type JobFila = { id: string; company_id: string | null; tipo: string; payload: Record<string, unknown> | null; prioridad: number; estado: string; created_at: string };

/**
 * Reencola un trabajo SIN perder nada y SIN repetir lo que ya se hizo:
 *  - Si después de él ya corrió y terminó bien otro trabajo con la misma petición (tipo, empresa y
 *    payload canónico), no se reencola: repetirlo sería pagar dos veces el mismo resultado.
 *  - El original NO se borra (el POST anterior lo borraba): sigue siendo la constancia de que falló.
 *    El nuevo lo referencia por `origen_job_id`, y el original anota en `progreso` a qué trabajo dio paso.
 *  - La clave del nuevo es determinista (derivada del id del original): reencolar dos veces el mismo
 *    trabajo devuelve el mismo reencolado, no dos.
 */
export async function reencolarSeguro(jobId: string): Promise<ResultadoReencolar> {
  const sb = supabaseAdmin();
  const { data: jRaw } = await sb.from("jobs").select("id,company_id,tipo,payload,prioridad,estado,created_at").eq("id", jobId).maybeSingle();
  const j = jRaw as JobFila | null;
  if (!j) return { reencolado: false, motivo: "El trabajo no existe.", job_id: null, job_posterior_id: null };
  if (j.estado === "pendiente" || j.estado === "corriendo") {
    return { reencolado: false, motivo: "El trabajo sigue en cola: no hace falta reencolarlo.", job_id: j.id, job_posterior_id: null };
  }
  const payload = j.payload ?? {};
  const huella = claveDePeticion(j.tipo, j.company_id, payload);

  // ¿Hubo una ejecución posterior buena de la MISMA petición? `contains` acota en SQL; la igualdad
  // exacta se decide con el JSON canónico, porque `contains` también acepta payloads más grandes.
  let q = sb.from("jobs").select("id,payload").eq("tipo", j.tipo).eq("estado", "hecho").gt("created_at", j.created_at).neq("id", j.id);
  q = j.company_id ? q.eq("company_id", j.company_id) : q.is("company_id", null);
  if (Object.keys(payload).length) q = q.contains("payload", payload);
  const { data: posteriores } = await q.order("created_at", { ascending: false }).limit(200);
  const bueno = (posteriores ?? []).find((p) => claveDePeticion(j.tipo, j.company_id, (p.payload ?? {}) as Record<string, unknown>) === huella);
  if (bueno) {
    return { reencolado: false, motivo: "Ya hay una ejecución posterior que terminó bien con la misma petición.", job_id: bueno.id, job_posterior_id: bueno.id };
  }

  const nuevo = await encolar({
    company_id: j.company_id,
    tipo: j.tipo as TipoJob,
    payload,
    prioridad: j.prioridad,
    idempotency_key: claveIdempotente(["reencolado", j.id]),
    origen_job_id: j.id,
  });
  if (nuevo.duplicado) {
    return { reencolado: false, motivo: "Este trabajo ya fue reencolado antes.", job_id: nuevo.id, job_posterior_id: nuevo.id };
  }
  await sb.from("jobs").update({ progreso: `Reencolado como trabajo ${nuevo.id}` }).eq("id", j.id);
  return { reencolado: true, motivo: null, job_id: nuevo.id, job_posterior_id: nuevo.id };
}

/** Tope de la lista de fallidos por crédito. Se DECLARA al que la pide; no se recorta en silencio. */
export const TOPE_FALLIDOS_PAUSA = 500;

export type FallidoPorPausa = { id: string; tipo: string; company_id: string | null; error: string | null; created_at: string };

/**
 * Los trabajos que se perdieron por falta de crédito y todavía no se han reencolado: los fallidos
 * cuyo error empieza por «Gemini 402» (histórico) o «Proveedor en pausa» (actual), menos los que ya
 * tienen un reencolado que los referencia por `origen_job_id`.
 */
export async function fallidosPorPausa(): Promise<{ filas: FallidoPorPausa[]; tope: number }> {
  const sb = supabaseAdmin();
  const porPrefijo = await Promise.all(
    PREFIJOS_ERROR_PAUSA.map((p) =>
      sb.from("jobs").select("id,tipo,company_id,error,created_at").eq("estado", "fallido").like("error", `${p}%`).order("created_at").limit(TOPE_FALLIDOS_PAUSA)
    )
  );
  const vistos = new Set<string>();
  const filas: FallidoPorPausa[] = [];
  for (const { data, error } of porPrefijo) {
    if (error) throw new Error(`No se pudieron leer los trabajos fallidos por crédito: ${error.message}`);
    for (const f of (data ?? []) as FallidoPorPausa[]) {
      if (!vistos.has(f.id)) {
        vistos.add(f.id);
        filas.push(f);
      }
    }
  }
  if (!filas.length) return { filas, tope: TOPE_FALLIDOS_PAUSA };
  const { data: hijos } = await sb.from("jobs").select("origen_job_id").in("origen_job_id", filas.map((f) => f.id));
  const yaReencolados = new Set((hijos ?? []).map((h) => String(h.origen_job_id)));
  return { filas: filas.filter((f) => !yaReencolados.has(f.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)), tope: TOPE_FALLIDOS_PAUSA };
}

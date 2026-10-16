/**
 * LA TORRE DE CONTROL — que Kelin pueda abrir 8X y entender cómo está trabajando su consultora.
 *
 * DOS PERSPECTIVAS QUE NO SE MEZCLAN (instrucción maestra §7). Un flujo diseñado no equivale a un
 * flujo ejecutado, y presentarlos juntos es la forma más rápida de creer que algo funciona porque
 * está configurado:
 *
 *   SISTEMA CONFIGURADO — qué agentes existen, qué los dispara, qué leen, qué entregan y con qué
 *                          límites. Sale de CONTRATOS, que es lo que el código IMPONE.
 *   EJECUCIÓN REAL      — qué pasó de verdad. Sale de `jobs` y `token_usage`.
 *
 * CUATRO UNIDADES DISTINTAS, NUNCA UNA POR OTRA:
 *   TRABAJO            una fila de `jobs`. Es la unidad de trabajo que se encola.
 *   LLAMADA AL MODELO  una fila de `token_usage`. Un trabajo puede hacer muchas (el contrastador
 *                      hizo 1.149 llamadas en 52 trabajos).
 *   REINTENTO          `jobs.intentos > 1`. El trabajo se repitió; no es un trabajo nuevo.
 *   AGENTE             la clave del contrato. Sus «ejecuciones» son LLAMADAS, no trabajos.
 *
 * Confundirlas ya costó dos reportes falsos: un LEFT JOIN con count(*) multiplicó los trabajos por
 * sus llamadas y salieron «1.900 ejecuciones» y «269 fallidos» donde había 697 y 11.
 *
 * SE CUENTA EN SQL, NO EN MEMORIA. La versión anterior traía filas con `.limit(20000)` y agregaba en
 * JavaScript. Supabase devuelve como máximo 1.000 filas por petición, así que con 1.583 llamadas la
 * torre mostró 7 agentes donde había 8 y una latencia media de 4,9 s donde era 14,7 s — recortado en
 * silencio, presentado como completo. Ahora agrega la base: exacto y sin tope.
 *
 * LO QUE NO SE REGISTRA SE DICE, NO SE RELLENA.
 */
import { supabaseAdmin } from "./supabase/admin";
import { CONTRATOS, CLAVES_AGENTE, esAgenteConocido, type Contrato } from "./agentes/contratos";

/** Prefijo con el que el worker anota un fallo del TRABAJO, que no pertenece a ningún agente. */
export const PREFIJO_TRABAJO = "trabajo:";

export type MedidoPorAgente = {
  llamadasModelo: number;
  llamadasConError: number;
  tokensEntrada: number;
  tokensSalida: number;
  /** Trabajos DISTINTOS en los que participó. No es lo mismo que llamadas. */
  trabajosDistintos: number;
  latenciaMediaMs: number | null;
  latenciaMaxMs: number | null;
  primera: string | null;
  ultima: string | null;
  modelos: string[];
};

export type AgenteEnTorre = {
  contrato: Contrato;
  /** Lo medido en el registro RECUPERABLE: token_usage, que se borra con la empresa. */
  real: MedidoPorAgente | null;
  /**
   * La huella que SOBREVIVE al borrado de una empresa. Es lo único que puede responder «¿corrió
   * alguna vez?»: `jobs` y `token_usage` cuelgan de companies con `on delete cascade`, y el 31-08
   * se eliminaron 18 empresas de 23 con todas sus ejecuciones dentro. Sin esto, la ausencia de filas
   * no distingue «nunca corrió» de «su empresa ya no existe».
   */
  huella: { llamadas: number; conError: number; primera: string | null; ultima: string | null } | null;
};

/** Filas de token_usage cuyo `agente` no es una clave de contrato: fallos de trabajo o datos sucios. */
export type NoEsAgente = { etiqueta: string; llamadas: number; esFalloDeTrabajo: boolean };

export type Cobertura = {
  desde: string | null;
  hasta: string | null;
  /** Cómo se obtuvieron los números, para que nadie suponga un muestreo. */
  metodo: string;
  /** Si alguna consulta de ESTA pantalla aplica un tope, se nombra aquí. Vacío = ninguna. */
  topes: string[];
};

export type Totales = {
  trabajos: number;
  trabajosHechos: number;
  trabajosFallidos: number;
  trabajosEnCurso: number;
  trabajosConReintento: number;
  reintentos: number;
  llamadasModelo: number;
  llamadasConError: number;
  /** Con ejecuciones en el registro RECUPERABLE. No es lo mismo que «han corrido alguna vez». */
  agentesConRegistroRecuperable: number;
  agentesConContrato: number;
  cobertura: Cobertura;
};

type FilaAgente = {
  agente: string; llamadas_modelo: number; llamadas_con_error: number;
  tokens_entrada: number; tokens_salida: number; latencia_media_ms: number;
  latencia_max_ms: number; trabajos_distintos: number;
  primera: string | null; ultima: string | null; modelos: string[] | null;
};

const n = (v: unknown) => Number(v ?? 0);

async function filasPorAgente(): Promise<FilaAgente[]> {
  const { data, error } = await supabaseAdmin().rpc("torre_por_agente");
  if (error) throw new Error(`La torre no pudo leer el consumo por agente: ${error.message}`);
  return (data ?? []) as FilaAgente[];
}

/** El sistema configurado, cruzado con lo medido. Un agente que nunca corrió devuelve `real: null`. */
export async function agentesEnTorre(): Promise<{ agentes: AgenteEnTorre[]; noSonAgentes: NoEsAgente[] }> {
  const sb = supabaseAdmin();
  const [filas, { data: huellas }] = await Promise.all([
    filasPorAgente(),
    sb.from("agente_huella").select("agente,llamadas,con_error,primera,ultima"),
  ]);
  const por = new Map(filas.map((f) => [f.agente, f]));
  const porHuella = new Map((huellas ?? []).map((h) => [String(h.agente), h]));

  const agentes: AgenteEnTorre[] = CLAVES_AGENTE.map((clave) => {
    const f = por.get(clave);
    const h = porHuella.get(clave);
    return {
      contrato: CONTRATOS[clave],
      huella: h ? { llamadas: n(h.llamadas), conError: n(h.con_error), primera: h.primera, ultima: h.ultima } : null,
      // null, no ceros: «configurado y nunca usado» y «corrió y le fue mal» son cosas distintas.
      real: f
        ? {
            llamadasModelo: n(f.llamadas_modelo),
            llamadasConError: n(f.llamadas_con_error),
            tokensEntrada: n(f.tokens_entrada),
            tokensSalida: n(f.tokens_salida),
            trabajosDistintos: n(f.trabajos_distintos),
            latenciaMediaMs: n(f.latencia_media_ms) || null,
            latenciaMaxMs: n(f.latencia_max_ms) || null,
            primera: f.primera,
            ultima: f.ultima,
            modelos: f.modelos ?? [],
          }
        : null,
    };
  });

  // Lo que hay en la columna `agente` y NO es un agente. Se muestra aparte en vez de colarse.
  const noSonAgentes: NoEsAgente[] = filas
    .filter((f) => !esAgenteConocido(f.agente))
    .map((f) => ({
      etiqueta: f.agente,
      llamadas: n(f.llamadas_modelo),
      esFalloDeTrabajo: f.agente.startsWith(PREFIJO_TRABAJO),
    }))
    .sort((a, b) => b.llamadas - a.llamadas);

  return { agentes, noSonAgentes };
}

export async function totales(): Promise<Totales> {
  const { data, error } = await supabaseAdmin().rpc("torre_totales");
  if (error) throw new Error(`La torre no pudo leer los totales: ${error.message}`);
  const t = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  const filas = await filasPorAgente();
  return {
    trabajos: n(t.trabajos),
    trabajosHechos: n(t.trabajos_hechos),
    trabajosFallidos: n(t.trabajos_fallidos),
    trabajosEnCurso: n(t.trabajos_en_curso),
    trabajosConReintento: n(t.trabajos_con_reintento),
    reintentos: n(t.reintentos),
    llamadasModelo: n(t.llamadas_modelo),
    llamadasConError: n(t.llamadas_con_error),
    // Solo los que tienen contrato: las etiquetas sueltas no cuentan como agentes.
    agentesConRegistroRecuperable: filas.filter((f) => esAgenteConocido(f.agente)).length,
    agentesConContrato: CLAVES_AGENTE.length,
    cobertura: {
      desde: (t.desde as string) ?? null,
      hasta: (t.hasta as string) ?? null,
      metodo: "Agregado en la base de datos, sin muestreo ni tope de filas. NO es todo el histórico: `jobs` y `token_usage` se borran con la empresa, y el 31-08-2026 se eliminaron 18 de 23 empresas con todas sus ejecuciones dentro.",
      topes: [],
    },
  };
}

export type EjecucionResumen = {
  jobId: string;
  companyId: string | null;
  empresa: string | null;
  tipo: string;
  estado: string;
  /** Agentes con contrato que participaron. Las etiquetas de fallo de trabajo no entran aquí. */
  agentes: string[];
  /** Cuántas veces se repitió el trabajo. 0 = ninguna. */
  reintentos: number;
  llamadasModelo: number;
  progreso: string | null;
  error: string | null;
  tomadoAt: string | null;
  terminadoAt: string | null;
  duracionSeg: number | null;
  tokens: number;
};

/** Cuántos trabajos se piden como máximo. Se DECLARA en la pantalla, no se aplica en silencio. */
export const TOPE_LISTA = 80;

export async function ejecuciones(
  limite = TOPE_LISTA,
  filtro?: { companyId?: string; estado?: string; agente?: string }
): Promise<{ filas: EjecucionResumen[]; cobertura: Cobertura }> {
  const sb = supabaseAdmin();
  const pedidos = Math.min(Math.max(limite, 1), 300);
  let q = sb
    .from("jobs")
    .select("id,company_id,tipo,estado,intentos,progreso,error,tomado_at,terminado_at,created_at")
    .order("created_at", { ascending: false })
    .limit(pedidos);
  if (filtro?.companyId) q = q.eq("company_id", filtro.companyId);
  if (filtro?.estado) q = q.eq("estado", filtro.estado);

  const { data: trabajos, error } = await q;
  if (error) throw new Error(`La torre no pudo leer los trabajos: ${error.message}`);
  const ids = (trabajos ?? []).map((j) => j.id);

  const cobertura: Cobertura = {
    desde: (trabajos ?? []).at(-1)?.created_at ?? null,
    hasta: (trabajos ?? [])[0]?.created_at ?? null,
    metodo: "Los trabajos más recientes, ordenados por fecha de creación.",
    topes: [`Máximo ${pedidos} trabajos en esta lista: los anteriores no se muestran.`],
  };
  if (ids.length === 0) return { filas: [], cobertura };

  // Las llamadas de ESTOS trabajos. No se agrega con JOIN: se agrupa aparte y se une por id, que es
  // lo que evita multiplicar cada trabajo por su número de llamadas.
  const [{ data: usos }, { data: empresas }] = await Promise.all([
    sb.from("token_usage").select("job_id,agente,tokens_entrada,tokens_salida").in("job_id", ids),
    sb.from("companies").select("id,nombre"),
  ]);

  const nombreEmpresa = new Map((empresas ?? []).map((e) => [e.id, e.nombre]));
  const porJob = new Map<string, { agentes: Set<string>; tokens: number; llamadas: number }>();
  for (const u of usos ?? []) {
    if (!u.job_id) continue;
    const acc = porJob.get(u.job_id) ?? { agentes: new Set<string>(), tokens: 0, llamadas: 0 };
    if (u.agente && esAgenteConocido(String(u.agente))) acc.agentes.add(String(u.agente));
    acc.tokens += n(u.tokens_entrada) + n(u.tokens_salida);
    acc.llamadas += 1;
    porJob.set(u.job_id, acc);
  }

  const filas = (trabajos ?? []).map((j) => {
    const d = porJob.get(j.id);
    const ini = j.tomado_at ? Date.parse(j.tomado_at) : null;
    const fin = j.terminado_at ? Date.parse(j.terminado_at) : null;
    return {
      jobId: j.id,
      companyId: j.company_id,
      empresa: j.company_id ? (nombreEmpresa.get(j.company_id) ?? null) : null,
      tipo: j.tipo,
      estado: j.estado,
      agentes: [...(d?.agentes ?? [])],
      reintentos: Math.max(n(j.intentos) - 1, 0),
      llamadasModelo: d?.llamadas ?? 0,
      progreso: j.progreso,
      error: j.error,
      tomadoAt: j.tomado_at,
      terminadoAt: j.terminado_at,
      duracionSeg: ini != null && fin != null ? Math.round((fin - ini) / 1000) : null,
      tokens: d?.tokens ?? 0,
    };
  });

  const finales = filtro?.agente ? filas.filter((f) => f.agentes.includes(filtro.agente!)) : filas;
  if (filtro?.agente) {
    cobertura.topes.push(`Filtrado por agente «${filtro.agente}» SOBRE esos ${pedidos} trabajos, no sobre todo el histórico.`);
  }
  return { filas: finales, cobertura };
}

export type LlamadaModelo = {
  agente: string | null;
  esAgenteConContrato: boolean;
  modelo: string | null;
  versionPrompt: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  latenciaMs: number;
  error: string | null;
  cuando: string;
  contrato: Contrato | null;
  /** La version del contrato REGISTRADA al correr. Si difiere de la del contrato actual, cambio. */
  contratoVersion: string | null;
};

/** Un eslabon de la cadena de entrega: de donde vino este trabajo o a que dio lugar. */
export type Eslabon = { id: string; tipo: string; estado: string; direccion: "vino_de" | "entrego_a"; creado: string };

export type Ejecucion = {
  resumen: EjecucionResumen;
  payload: Record<string, unknown> | null;
  resultado: unknown;
  llamadas: LlamadaModelo[];
  /** Las fuentes que leyo, por referencia y version. Nunca el contenido. */
  fuentes: { id: string; nombre: string; version: string | null }[];
  /** La transferencia: de donde vino y a que paso entrego. */
  cadena: Eslabon[];
  /** Si esta ejecucion es anterior a que se registrara la procedencia. */
  anteriorAlRegistro: boolean;
  intervenciones: { accion: string; entidad: string | null; actor: string | null; cuando: string }[];
  noRegistrado: string[];
};

export async function ejecucion(jobId: string): Promise<Ejecucion | null> {
  const sb = supabaseAdmin();
  const { data: j } = await sb
    .from("jobs")
    .select("id,company_id,tipo,estado,payload,resultado,intentos,progreso,error,tomado_at,terminado_at,created_at,fuentes_usadas,origen_job_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!j) return null;

  const [{ data: usos }, { data: empresa }, { data: audit }, { data: cadenaRaw }] = await Promise.all([
    sb.from("token_usage").select("agente,modelo,version_prompt,contrato_version,tokens_entrada,tokens_salida,latencia_ms,error,created_at").eq("job_id", jobId).order("created_at"),
    j.company_id ? sb.from("companies").select("nombre").eq("id", j.company_id).maybeSingle() : Promise.resolve({ data: null }),
    j.company_id
      ? sb.from("audit_log").select("accion,entidad,actor_rol,created_at").eq("company_id", j.company_id).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
    sb.rpc("cadena_de_trabajo", { p_job: jobId }),
  ]);

  const llamadas: LlamadaModelo[] = (usos ?? []).map((u) => {
    const clave = u.agente ? String(u.agente) : null;
    const conContrato = clave != null && esAgenteConocido(clave);
    return {
      agente: clave,
      esAgenteConContrato: conContrato,
      modelo: u.modelo ? String(u.modelo) : null,
      versionPrompt: u.version_prompt ? String(u.version_prompt) : null,
      tokensEntrada: n(u.tokens_entrada),
      tokensSalida: n(u.tokens_salida),
      latenciaMs: n(u.latencia_ms),
      error: u.error ? String(u.error) : null,
      cuando: String(u.created_at),
      contrato: conContrato ? CONTRATOS[clave as keyof typeof CONTRATOS] : null,
      contratoVersion: u.contrato_version ? String(u.contrato_version) : null,
    };
  });

  const fuentes = ((j.fuentes_usadas ?? []) as { id: string; nombre: string; version: string | null }[]);
  const cadena = ((cadenaRaw ?? []) as Eslabon[]);
  // Una ejecucion vieja no tiene procedencia porque ENTONCES no se registraba, no porque no la tenga.
  // Distinguirlo importa: lo contrario es leer un hueco de instrumentacion como un hueco de trabajo.
  const anteriorAlRegistro = fuentes.length === 0 && cadena.length === 0 && llamadas.every((l) => l.contratoVersion == null);

  const ini = j.tomado_at ? Date.parse(j.tomado_at) : null;
  const fin = j.terminado_at ? Date.parse(j.terminado_at) : null;

  return {
    resumen: {
      jobId: j.id,
      companyId: j.company_id,
      empresa: (empresa as { nombre: string } | null)?.nombre ?? null,
      tipo: j.tipo,
      estado: j.estado,
      agentes: [...new Set(llamadas.filter((l) => l.esAgenteConContrato).map((l) => l.agente!))],
      reintentos: Math.max(n(j.intentos) - 1, 0),
      llamadasModelo: llamadas.length,
      progreso: j.progreso,
      error: j.error,
      tomadoAt: j.tomado_at,
      terminadoAt: j.terminado_at,
      duracionSeg: ini != null && fin != null ? Math.round((fin - ini) / 1000) : null,
      tokens: llamadas.reduce((s, l) => s + l.tokensEntrada + l.tokensSalida, 0),
    },
    payload: (j.payload ?? null) as Record<string, unknown> | null,
    resultado: j.resultado ?? null,
    llamadas,
    fuentes,
    cadena,
    anteriorAlRegistro,
    intervenciones: (audit ?? []).map((a) => ({
      accion: String(a.accion),
      entidad: a.entidad ? String(a.entidad) : null,
      actor: a.actor_rol ? String(a.actor_rol) : null,
      cuando: String(a.created_at),
    })),
    noRegistrado: [
      // Este NO se cierra a proposito: guardar el contexto completo duplica el material del cliente
      // y multiplica su superficie de exposicion sin anadir nada que las referencias no den.
      "El contexto exacto que se le envió al modelo. No se guarda a propósito: se conservan las referencias a las fuentes, no una copia del material.",
      ...(fuentes.length === 0
        ? [anteriorAlRegistro
            ? "Las fuentes que usó: esta ejecución es anterior a que se registrara la procedencia. El hueco es de instrumentación, no de trabajo."
            : "Las fuentes que usó: este tipo de trabajo todavía no las anota."]
        : []),
      "La evaluación de la calidad de la salida: nadie la ha puntuado, así que está «sin evaluar».",
      ...(cadena.length === 0
        ? [anteriorAlRegistro
            ? "La entrega al siguiente paso: tampoco se registraba cuando corrió."
            : "La entrega al siguiente paso: no encoló ningún trabajo ni nació de otro."]
        : []),
    ],
  };
}

// ============================================================================
// LA COLA Y EL PROVEEDOR. Lo que la torre no mostraba y costó 81 trabajos el 28-09-2026: si hay
// crédito, cuántos trabajos esperan por él, cuántos se perdieron y pueden recuperarse, y qué
// fuentes llevan más de un día «leyéndose» sin que nadie lo vea.
// ============================================================================
import { CIRCUITO_CREDITO, PREFIJO_PAUSA } from "./jobs/reglas";
import { fallidosPorPausa } from "./jobs/queue";

export type EstadoCola = {
  circuito: { clave: string; abierto: boolean; cortadoHasta: string | null; actualizadoAt: string | null };
  /** Trabajos pendientes. Mientras el circuito esté abierto, TODOS esperan por él. */
  pendientes: number;
  /** De los pendientes, los que el worker devolvió a la cola por la pausa (error con el prefijo). */
  devueltosPorPausa: number;
  /** Fallidos por falta de crédito que todavía no se han reencolado: lo que el botón va a reencolar. */
  fallidosReencolables: number;
  /** Tope de la consulta de fallidos. Se declara: si hay más, no se ven todos de una vez. */
  topeFallidos: number;
};

export async function estadoCola(): Promise<EstadoCola> {
  const sb = supabaseAdmin();
  const [{ data: fila }, { data: abierto }, { count: pendientes }, { count: devueltos }, pausados] = await Promise.all([
    sb.from("circuito").select("cortado_hasta,actualizado_at").eq("clave", CIRCUITO_CREDITO).maybeSingle(),
    // «¿Está abierto?» lo decide la base con su propio reloj, igual que el worker: así la torre y la cola no discrepan.
    sb.rpc("circuito_abierto", { p_clave: CIRCUITO_CREDITO }),
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("estado", "pendiente").like("error", `${PREFIJO_PAUSA}%`),
    fallidosPorPausa(),
  ]);
  return {
    circuito: {
      clave: CIRCUITO_CREDITO,
      abierto: abierto === true,
      cortadoHasta: fila?.cortado_hasta ? String(fila.cortado_hasta) : null,
      actualizadoAt: fila?.actualizado_at ? String(fila.actualizado_at) : null,
    },
    pendientes: n(pendientes),
    devueltosPorPausa: n(devueltos),
    fallidosReencolables: pausados.filas.length,
    topeFallidos: pausados.tope,
  };
}

/** A partir de cuántas horas en «leyendo» una fuente se considera atascada. */
export const HORAS_ATASCADA = 24;

export type FuenteAtascada = { id: string; nombre: string; companyId: string; empresa: string | null; horas: number; desde: string };

type FuenteLeyendo = { id: string; nombre: string; company_id: string; created_at: string };
type TrabajoExtraer = { source_id: string; estado: string; created_at: string };

/**
 * La regla, pura para poder probarla: una fuente está atascada si lleva en «leyendo» más de
 * HORAS_ATASCADA contadas desde su ÚLTIMO intento de extracción (o desde que se subió, si no hubo
 * ninguno) y no tiene un trabajo de extracción vivo más reciente que ese plazo. Un trabajo pendiente
 * de hace una hora es cola, no atasco.
 */
export function clasificarAtascadas(fuentes: FuenteLeyendo[], trabajos: TrabajoExtraer[], ahora: Date, horas = HORAS_ATASCADA): Omit<FuenteAtascada, "empresa">[] {
  const limite = ahora.getTime() - horas * 3600_000;
  const porFuente = new Map<string, TrabajoExtraer[]>();
  for (const t of trabajos) {
    const acc = porFuente.get(t.source_id) ?? [];
    acc.push(t);
    porFuente.set(t.source_id, acc);
  }
  const out: Omit<FuenteAtascada, "empresa">[] = [];
  for (const f of fuentes) {
    const suyos = porFuente.get(f.id) ?? [];
    const ultimo = suyos.reduce<string>((m, t) => (t.created_at > m ? t.created_at : m), f.created_at);
    const desdeMs = Date.parse(ultimo);
    if (!(desdeMs < limite)) continue;
    const vivoReciente = suyos.some((t) => (t.estado === "pendiente" || t.estado === "corriendo") && Date.parse(t.created_at) >= limite);
    if (vivoReciente) continue;
    out.push({ id: f.id, nombre: f.nombre, companyId: f.company_id, horas: Math.floor((ahora.getTime() - desdeMs) / 3600_000), desde: ultimo });
  }
  return out.sort((a, b) => b.horas - a.horas);
}

/** Las fuentes en «leyendo» desde hace más de HORAS_ATASCADA, con su empresa, para que alguien las vea. */
export async function fuentesAtascadas(ahora = new Date()): Promise<FuenteAtascada[]> {
  const sb = supabaseAdmin();
  const { data: fuentes, error } = await sb.from("sources").select("id,nombre,company_id,created_at").eq("estado", "leyendo").order("created_at");
  if (error) throw new Error(`La torre no pudo leer las fuentes en lectura: ${error.message}`);
  if (!fuentes?.length) return [];
  const ids = fuentes.map((f) => String(f.id));
  const [{ data: trabajos }, { data: empresas }] = await Promise.all([
    sb.from("jobs").select("payload,estado,created_at").eq("tipo", "extraer").in("payload->>source_id", ids).order("created_at", { ascending: false }).limit(1000),
    sb.from("companies").select("id,nombre").in("id", [...new Set(fuentes.map((f) => String(f.company_id)))]),
  ]);
  const nombreEmpresa = new Map((empresas ?? []).map((e) => [String(e.id), String(e.nombre)]));
  const extraer: TrabajoExtraer[] = (trabajos ?? []).map((t) => ({ source_id: String((t.payload as { source_id?: string } | null)?.source_id ?? ""), estado: String(t.estado), created_at: String(t.created_at) }));
  return clasificarAtascadas(fuentes as FuenteLeyendo[], extraer, ahora).map((f) => ({ ...f, empresa: nombreEmpresa.get(f.companyId) ?? null }));
}

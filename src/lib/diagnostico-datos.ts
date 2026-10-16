/**
 * LO QUE EL TABLERO DE DIAGNÓSTICO LEE DE LA BASE (16-10-2026). SERVIDOR.
 *
 * `diagnostico-tablero.ts` arma (puro); aquí se lee. Cada lectura va por su lado y ninguna tumba la página: lo que
 * falla queda en null y el tablero lo dice («no se pudo leer»), nunca como «no hay». Una lista vacía es «se leyó y no
 * hay nada». Todo con columnas explícitas y con tope, como las demás lecturas de una empresa.
 *
 * PARA EL DUEÑO se filtra AL LEER, no al pintar (tests/limite-cliente-consultora.test.ts):
 *  - de la ficha de dirección, solo la ACORDADA y solo lo que `vistaCliente` deja ver (nada del borrador, ninguna
 *    dimensión, ninguna nota de trabajo);
 *  - de los hallazgos, solo lo que ya ve en su portal (`empresaHoy`, que excluye rechazados, provisionales y lo que
 *    pide validación);
 *  - de dos respuestas que se contradicen, nunca las palabras de una persona del equipo: «otra persona de tu empresa»;
 *  - nada de puntajes por área, ni de lo que la consultora tiene pendiente.
 */
import { supabaseAdmin } from "./supabase/admin";
import { mapaDe } from "./mapa-empresa";
import { acordadaVigente, borradorVigente, contarProcesosDelDueno, vistaCliente, type FichaGuardada, type NodoFila, type ProcesoFila } from "./ficha-direccion";
import { listarLineas, type LineaProducto } from "./producto";
import { leerFichaNegocio, listarCostos, listarOperacionesMoneda } from "./negocio-datos";
import { FICHA_VACIA, type CostoMes, type FichaNegocio, type OperacionMoneda } from "./rentabilidad";
import { listarSolicitudes } from "./solicitudes";
import { leerHechosRuta } from "./ruta-datos";
import { empresaHoy } from "./hoy";
import { configDe, porDefecto, type ConfigEmpresa } from "./formato";
import { estadoCanonico } from "./plan-reglas";
import { ESTADOS_EN_MARCHA } from "./revision-semanal";
import { porCorroborar } from "./rules/evidencia";
import { declaranteDeRol, type Declarante, type MetricaGuardada } from "./rules/contradiccion-numerica";
import { conteoProcesos, type EntradaPuntajes, type HechosDiagnostico, type HechosDependencia, type HechosResultado, type Para } from "./diagnostico-tablero";
import { incongruenciasDe, type ClaimContradicha, type Correccion, type Eleccion, type HechosIncongruencia, type Incongruencia } from "./incongruencias";

type Respuesta = { data: unknown; error: { message?: string | null; code?: string | null } | null; count?: number | null };

/** Las filas de una lectura, o null si no se pudo leer. */
async function filas<T>(que: string, pedir: () => PromiseLike<Respuesta>): Promise<T[] | null> {
  try {
    const { data, error } = await pedir();
    if (error) {
      console.error(`[diagnostico] no se pudo leer ${que}`, error.message ?? error.code);
      return null;
    }
    return (data ?? []) as T[];
  } catch (e) {
    console.error(`[diagnostico] no se pudo leer ${que}`, e);
    return null;
  }
}

/** Un conteo, o null si no se pudo leer. */
async function contar(que: string, pedir: () => PromiseLike<Respuesta>): Promise<number | null> {
  try {
    const { count, error } = await pedir();
    if (error) {
      console.error(`[diagnostico] no se pudo contar ${que}`, error.message ?? error.code);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error(`[diagnostico] no se pudo contar ${que}`, e);
    return null;
  }
}

/** Una lectura que puede lanzar, como null si lanza. */
async function o<T>(que: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.error(`[diagnostico] no se pudo leer ${que}`, e);
    return null;
  }
}

/** El último mes cerrado (AAAA-MM) en la zona de la empresa. */
export function mesPasadoEn(zona: string, ahora: Date): string {
  let y: number;
  let m: number;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit" }).formatToParts(ahora).map((x) => [x.type, x.value]));
    y = Number(p.year);
    m = Number(p.month);
  } catch {
    y = ahora.getUTCFullYear();
    m = ahora.getUTCMonth() + 1;
  }
  const total = y * 12 + (m - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const COLUMNAS_METRICA = "clave,periodo,valor,valor_texto,estado,origen,nota,response_id,source_id,cifra_desplazada";
const COLUMNAS_METRICA_BASE = "clave,periodo,valor,estado";

/** Los números de la empresa; en una base sin las columnas de evidencia, los de siempre. */
async function leerMetricas(companyId: string): Promise<MetricaGuardada[] | null> {
  const sb = supabaseAdmin();
  const completas = await filas<MetricaGuardada>("los números", () => sb.from("company_metricas").select(COLUMNAS_METRICA).eq("company_id", companyId).limit(300));
  if (completas) return completas;
  return filas<MetricaGuardada>("los números (columnas de siempre)", () => sb.from("company_metricas").select(COLUMNAS_METRICA_BASE).eq("company_id", companyId).limit(300));
}

/** Quién respondió cada respuesta de entrevista y qué se le preguntó: para el eco y para rotular lo declarado. */
async function leerRespuestas(ids: string[]): Promise<{ preguntas: Map<string, string>; declarantes: Map<string, Declarante | null> }> {
  const preguntas = new Map<string, string>();
  const declarantes = new Map<string, Declarante | null>();
  if (!ids.length) return { preguntas, declarantes };
  const sb = supabaseAdmin();
  const resp = await filas<{ id: string; pregunta: string | null; session_id: string | null }>("las preguntas de la entrevista", () => sb.from("interview_responses").select("id,pregunta,session_id").in("id", ids).limit(500));
  if (!resp) return { preguntas, declarantes };
  for (const r of resp) if (r.pregunta?.trim()) preguntas.set(String(r.id), r.pregunta);
  const sesiones = [...new Set(resp.map((r) => r.session_id).filter((x): x is string => !!x))];
  const ses = sesiones.length ? await filas<{ id: string; participant_id: string | null }>("las sesiones", () => sb.from("interview_sessions").select("id,participant_id").in("id", sesiones)) : [];
  const pids = [...new Set((ses ?? []).map((s) => s.participant_id).filter((x): x is string => !!x))];
  const parts = pids.length ? await filas<{ id: string; rol: string | null }>("los participantes", () => sb.from("participants").select("id,rol").in("id", pids)) : [];
  const rolDe = new Map((parts ?? []).map((p) => [String(p.id), p.rol]));
  const participanteDe = new Map((ses ?? []).map((s) => [String(s.id), s.participant_id]));
  for (const r of resp) {
    const pid = r.session_id ? participanteDe.get(String(r.session_id)) : null;
    declarantes.set(String(r.id), pid ? declaranteDeRol(rolDe.get(String(pid))) : null);
  }
  return { preguntas, declarantes };
}

type FilaClaim = { id: string; texto: string; estado: string; contradice_a: string | null; participant_id: string | null; source_id: string | null };

/**
 * Las afirmaciones que se contradicen y su otro lado. De quién es cada una sale del rol de su participante; una
 * afirmación de documento no es «del dueño». Al dueño, las palabras de otra persona del equipo no le llegan.
 */
async function leerContradichas(companyId: string, para: Para): Promise<ClaimContradicha[] | null> {
  const sb = supabaseAdmin();
  const COLS = "id,texto,estado,contradice_a,participant_id,source_id";
  const contradichas = await filas<FilaClaim>("las afirmaciones contradichas", () => sb.from("claims").select(COLS).eq("company_id", companyId).eq("estado", "contradicho").limit(200));
  if (!contradichas) return null;
  const faltan = [...new Set(contradichas.map((c) => c.contradice_a).filter((x): x is string => !!x && !contradichas.some((c) => c.id === x)))];
  const otras = faltan.length ? await filas<FilaClaim>("el otro lado de las contradicciones", () => sb.from("claims").select(COLS).eq("company_id", companyId).in("id", faltan)) : [];
  const todas = [...contradichas, ...(otras ?? [])];
  const pids = [...new Set(todas.map((c) => c.participant_id).filter((x): x is string => !!x))];
  const parts = pids.length ? await filas<{ id: string; rol: string | null; puesto: string | null }>("quién dijo cada afirmación", () => sb.from("participants").select("id,rol,puesto").eq("company_id", companyId).in("id", pids)) : [];
  const fids = [...new Set(todas.map((c) => c.source_id).filter((x): x is string => !!x))];
  const fuentes = fids.length ? await filas<{ id: string; nombre: string | null }>("las fuentes de las afirmaciones", () => sb.from("sources").select("id,nombre").eq("company_id", companyId).in("id", fids)) : [];
  const partDe = new Map((parts ?? []).map((p) => [String(p.id), p]));
  const fuenteDe = new Map((fuentes ?? []).map((f) => [String(f.id), f.nombre]));
  return todas.map((c) => {
    const p = c.participant_id ? partDe.get(String(c.participant_id)) : undefined;
    const deDueno = p?.rol === "dueno" || p?.rol === "socio";
    const fuente = p ? (deDueno ? "el dueño (entrevista)" : `${p.puesto ?? "una persona del equipo"} (entrevista)`) : c.source_id ? (fuenteDe.get(String(c.source_id)) ?? "un documento") : "una fuente";
    // Al dueño: lo de otra persona del equipo no le llega con sus palabras ni con su puesto.
    const ajena = para === "dueno" && !deDueno && !!p;
    return {
      id: c.id,
      texto: ajena ? "Otra persona de tu empresa lo cuenta distinto." : c.texto,
      contradice_a: c.contradice_a,
      deDueno,
      fuente: para === "dueno" ? (deDueno ? "lo dijiste tú" : "otra fuente de tu empresa") : fuente,
      estado: c.estado,
    };
  });
}

/** Lo corregido: las filas de audit_log con entidad «correccion_dato», de la más reciente a la más vieja. */
async function leerCorrecciones(companyId: string): Promise<Correccion[] | null> {
  const r = await filas<{ id: number | string; entidad_id: string | null; detalle: Record<string, unknown> | null; created_at: string; actor?: { nombre: string | null } | null }>(
    "lo corregido",
    () =>
      supabaseAdmin()
        .from("audit_log")
        .select("id,entidad_id,detalle,created_at,actor:users!audit_log_actor_id_fkey(nombre)")
        .eq("company_id", companyId)
        .eq("entidad", "correccion_dato")
        .order("created_at", { ascending: false })
        .limit(100)
  );
  if (!r) return null;
  const ELECCIONES: Eleccion[] = ["izquierda", "derecha", "otra", "no_lo_se"];
  return r.flatMap((f) => {
    const d = f.detalle ?? {};
    const eleccion = ELECCIONES.includes(d.eleccion as Eleccion) ? (d.eleccion as Eleccion) : null;
    if (!f.entidad_id || !eleccion) return [];
    const despues = d.despues === "no_lo_se" ? "no_lo_se" : typeof d.despues === "number" && Number.isFinite(d.despues) ? d.despues : null;
    return [{
      id: String(f.id), incongruencia: f.entidad_id, huella: typeof d.huella === "string" ? d.huella : "", eleccion, antes: d.antes ?? null, despues,
      motivo: typeof d.motivo === "string" ? d.motivo : null, at: f.created_at, quien: f.actor?.nombre ?? null,
    }];
  });
}

/** Lo que se detiene sin el dueño, en texto. Al dueño, solo lo de la ficha acordada y como él lo puede leer. */
function seDetieneDe(ficha: FichaGuardada | null, para: Para): string[] {
  if (!ficha) return [];
  if (para === "dueno") return vistaCliente(ficha).participacion.dijiste.map((f) => f.texto).filter(Boolean).slice(0, 4);
  return (ficha.dependencia.declaraciones ?? []).filter((i) => !i.descartado && !i.aviso).map((i) => i.cita?.trim() || i.texto).filter(Boolean).slice(0, 4);
}

/** La dependencia del dueño: el conteo de la ficha si ya lo trae; si no, contado con los procesos de hoy. */
async function leerDependencia(companyId: string, para: Para): Promise<HechosDependencia | null> {
  const sb = supabaseAdmin();
  // null puede ser «no hay ficha todavía» (lo normal al empezar) o «no se pudo leer»: se distinguen.
  let fichaSinLeer = false;
  const ficha = await (async (): Promise<FichaGuardada | null> => {
    try {
      return para === "dueno" ? await acordadaVigente(companyId, sb) : ((await borradorVigente(companyId, sb)) ?? (await acordadaVigente(companyId, sb)));
    } catch (e) {
      console.error("[diagnostico] no se pudo leer la ficha de dirección", e);
      fichaSinLeer = true;
      return null;
    }
  })();
  let conteo = ficha && ficha.dependencia.procesos.total > 0 ? ficha.dependencia.procesos : null;
  if (!conteo) {
    const [procesos, duenos] = await Promise.all([
      filas<ProcesoFila>("los procesos", () => sb.from("processes").select("id,nombre").eq("company_id", companyId).eq("version", "as_is").limit(200)),
      filas<{ nombre: string }>("los dueños", () => sb.from("participants").select("nombre").eq("company_id", companyId).in("rol", ["dueno", "socio"])),
    ]);
    const nodos = procesos && procesos.length ? await filas<NodoFila>("los pasos de los procesos", () => sb.from("process_nodes").select("process_id,tipo,responsable,rol").in("process_id", procesos.map((p) => p.id)).limit(5000)) : [];
    conteo = procesos && duenos && nodos ? contarProcesosDelDueno({ procesos, nodos, nombresDueno: duenos.map((d) => d.nombre) }) : null;
  }
  // Sin la ficha y sin los procesos no se sabe nada de la dependencia.
  if (!conteo && fichaSinLeer) return null;
  return { conteo, dimensiones: para === "dueno" ? null : (ficha?.dependencia.dimensiones ?? null), seDetiene: seDetieneDe(ficha, para) };
}

type FilaHallazgo = { id: string; titulo: string; pilar: string; impacto: string | null; impacto_potencial: string | null; confianza: number | null; provisional: boolean | null; requiere_validacion: boolean | null; filtros: Record<string, unknown> | null; created_at: string | null };

/** Lo del resultado para la consultora: las áreas y su cuenta, y las restricciones (también las por corroborar). */
async function leerResultadoConsultora(companyId: string, personas: number | null): Promise<HechosResultado> {
  const sb = supabaseAdmin();
  const [diagnosticos, claims, hallazgos, procesos, activos, acciones] = await Promise.all([
    filas<{ pilar: string; estado: string }>("los diagnósticos", () => sb.from("diagnoses").select("pilar,estado").eq("company_id", companyId)),
    filas<{ pilar: string | null; estado: string }>("las afirmaciones por área", () => sb.from("claims").select("pilar,estado").eq("company_id", companyId).limit(10000)),
    filas<FilaHallazgo>("los hallazgos", () =>
      sb.from("findings").select("id,titulo,pilar,impacto,impacto_potencial,confianza,provisional,requiere_validacion,filtros,created_at").eq("company_id", companyId).neq("estado_revision", "rechazado").limit(500)
    ),
    filas<{ confirmacion: string | null }>("los procesos", () => sb.from("processes").select("confirmacion").eq("company_id", companyId).eq("version", "as_is").limit(500)),
    filas<{ clave: string; estado: string | null }>("la biblioteca", () => sb.from("company_assets").select("clave,estado").eq("company_id", companyId).limit(500)),
    leerEnMarcha(companyId),
  ]);
  const puntajes: EntradaPuntajes | null =
    diagnosticos && claims && hallazgos && procesos && activos ? { diagnosticos, claims, hallazgos, procesos, activos, personas } : null;
  // UN RIESGO GRAVE PENDIENTE DE CORROBORACIÓN SE MANTIENE VISIBLE COMO TAL (Dirección 13-10-2026): entra rotulado
  // «por corroborar», después de los críticos confirmados. Esconderlo sería maquillar el tablero de la consultora.
  const restricciones = hallazgos
    ? hallazgos
        .filter((h) => h.impacto === "alto" || h.impacto_potencial === "alto")
        .map((h) => ({ h, porCorroborar: porCorroborar(h) }))
        .filter(({ h, porCorroborar: pc }) => h.impacto === "alto" || pc)
        .sort((a, b) => Number(a.porCorroborar) - Number(b.porCorroborar) || String(b.h.created_at ?? "").localeCompare(String(a.h.created_at ?? "")))
        .slice(0, 4)
        .map(({ h, porCorroborar: pc }) => ({ titulo: h.titulo, monto: typeof h.filtros?.costo_posible === "string" && h.filtros.costo_posible.trim() ? h.filtros.costo_posible : null, porCorroborar: pc }))
    : null;
  return { puntajes, restricciones, publicado: diagnosticos ? diagnosticos.some((d) => d.estado !== "desconocido") : null, enMarcha: acciones };
}

/** Hasta tres acciones del plan en marcha, por prioridad. */
async function leerEnMarcha(companyId: string): Promise<string[] | null> {
  const acciones = await filas<{ accion: string | null; estado: string; verificado_at?: string | null; prioridad: number | null }>("el plan", () =>
    supabaseAdmin().from("actions").select("accion,estado,verificado_at,prioridad").eq("company_id", companyId).order("prioridad").limit(200)
  );
  if (!acciones) return null;
  return acciones
    .filter((a) => ESTADOS_EN_MARCHA.includes(estadoCanonico(a)) && a.accion?.trim())
    .sort((a, b) => (a.prioridad ?? 99) - (b.prioridad ?? 99))
    .slice(0, 3)
    .map((a) => String(a.accion).trim());
}

/** Lo del resultado para el dueño: lo que ya ve en su portal, con la misma regla de Inicio para «publicado». */
async function leerResultadoDueno(companyId: string): Promise<HechosResultado> {
  const [hoy, enMarcha] = await Promise.all([o("lo que ya ve el dueño", () => empresaHoy(companyId)), leerEnMarcha(companyId)]);
  if (!hoy) return { puntajes: null, restricciones: null, publicado: null, enMarcha };
  const hallazgos = [hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter((x): x is NonNullable<typeof x> => !!x);
  const publicado = hoy.nivel >= 3 && hallazgos.filter((x) => !x.provisional).length + hoy.fortalezas.length > 0;
  return {
    puntajes: null,
    restricciones: hoy.restriccion ? [{ titulo: hoy.restriccion.titulo, monto: hoy.restriccion.costo_posible ?? null, porCorroborar: false }] : [],
    publicado,
    enMarcha,
  };
}

/** Lo que la empresa anota de su negocio. Una tabla que todavía no existe en la base deja su parte vacía, con aviso. */
async function leerNegocio(companyId: string, para: Para): Promise<{ lineas: LineaProducto[] | null; costos: CostoMes[] | null; ficha: FichaNegocio | null; operaciones: OperacionMoneda[] | null }> {
  const [lineas, costos, ficha, operaciones] = await Promise.all([
    o("lo que vende", () => listarLineas(companyId, { paraDueno: para === "dueno" })),
    o("los gastos del mes", () => listarCostos(companyId)),
    o("la ficha del negocio", () => leerFichaNegocio(companyId)),
    o("las ventas en otra moneda", () => listarOperacionesMoneda(companyId)),
  ]);
  return { lineas, costos, ficha, operaciones };
}

/**
 * TODO LO QUE EL TABLERO NECESITA, LEÍDO. Nunca lanza: lo que no se pudo leer queda en null. `para` decide qué se lee
 * (el dueño nunca recibe lo de la consultora); `ahora` fija el «mes pasado» (por defecto, hoy).
 */
export async function leerHechosDiagnostico(companyId: string, opciones: { para?: Para; ahora?: Date } = {}): Promise<HechosDiagnostico> {
  const para: Para = opciones.para ?? "consultora";
  try {
    return await leerTodo(companyId, para, opciones.ahora ?? new Date());
  } catch (e) {
    // Cada lectura ya se cuida sola; esto es la red de abajo (p. ej. sin cliente de base): nada se leyó, y se dice.
    console.error("[diagnostico] no se pudo leer nada de la empresa", companyId, e);
    return {
      para, config: porDefecto, admitida: null, procesos: null, dependencia: null, metricas: null, negocio: null, incongruencias: null,
      resultado: null, ruta: null, solicitudes: null, porConfirmar: null,
    };
  }
}

/** La configuración de la empresa (país, moneda, hora) y su ficha. null si no se pudo leer. */
async function leerEmpresa(companyId: string) {
  const sb = supabaseAdmin();
  return filas<{ ficha: Record<string, unknown> | null; estado_admision: string | null; pais: string | null; moneda: string | null; idioma: string | null; zona_horaria: string | null }>(
    "la empresa",
    () => sb.from("companies").select("id,ficha,estado_admision,pais,moneda,idioma,zona_horaria").eq("id", companyId).limit(1)
  );
}

/** Lo que las reglas de lo que no cuadra necesitan, ya leído. null si los números no se pudieron leer. */
async function hechosIncongruencia(
  metricas: MetricaGuardada[] | null,
  negocio: { lineas: LineaProducto[] | null; costos: CostoMes[] | null; ficha: FichaNegocio | null },
  contradichas: ClaimContradicha[] | null,
  correcciones: Correccion[] | null,
  config: ConfigEmpresa,
  ahora: Date
): Promise<HechosIncongruencia | null> {
  if (!metricas) return null;
  const respuestas = await leerRespuestas([...new Set(metricas.map((m) => m.response_id).filter((x): x is string => !!x))]);
  return {
    metricas,
    lineas: negocio.lineas ?? [],
    costos: negocio.costos ?? [],
    ficha: negocio.ficha ?? { ...FICHA_VACIA },
    config,
    claimsContradichas: contradichas ?? [],
    preguntaDeRespuesta: respuestas.preguntas,
    declarantes: respuestas.declarantes,
    correcciones: correcciones ?? [],
    mesPasado: mesPasadoEn(config.zona_horaria, ahora),
  };
}

/**
 * SOLO LO QUE NO CUADRA, para una pantalla que no pinta el tablero entero (Tus números, 16-10-2026): las mismas reglas
 * y las mismas lecturas que «Tu diagnóstico», para que una cifra que allí se pide corregir no salga aquí como un hecho.
 * Nunca lanza: null = no se pudo leer (y la pantalla no marca nada; no inventa una duda).
 */
export async function leerIncongruencias(companyId: string, opciones: { para?: Para; ahora?: Date } = {}): Promise<Incongruencia[] | null> {
  const para: Para = opciones.para ?? "dueno";
  try {
    const fila = (await leerEmpresa(companyId))?.[0] ?? null;
    let config: ConfigEmpresa = porDefecto;
    try {
      config = fila ? configDe(fila) : porDefecto;
    } catch {
      config = porDefecto;
    }
    const [metricas, negocio, contradichas, correcciones] = await Promise.all([leerMetricas(companyId), leerNegocio(companyId, para), leerContradichas(companyId, para), leerCorrecciones(companyId)]);
    const h = await hechosIncongruencia(metricas, negocio, contradichas, correcciones, config, opciones.ahora ?? new Date());
    return h ? incongruenciasDe(h) : null;
  } catch (e) {
    console.error("[diagnostico] no se pudo leer lo que no cuadra", companyId, e);
    return null;
  }
}

async function leerTodo(companyId: string, para: Para, ahora: Date): Promise<HechosDiagnostico> {
  const sb = supabaseAdmin();

  const empresa = await leerEmpresa(companyId);
  const fila = empresa?.[0] ?? null;
  let config: ConfigEmpresa = porDefecto;
  try {
    config = fila ? configDe(fila) : porDefecto;
  } catch {
    config = porDefecto;
  }
  const personasTexto = fila?.ficha?.personas;
  const personas = personasTexto != null && Number.isFinite(parseInt(String(personasTexto), 10)) ? parseInt(String(personasTexto), 10) : null;

  const [mapa, dependencia, metricas, negocio, contradichas, correcciones, resultado, ruta, solicitudes, contradichasN, priorizadasN] = await Promise.all([
    o("el mapa de procesos", () => mapaDe(companyId)),
    o("la dependencia del dueño", () => leerDependencia(companyId, para)),
    leerMetricas(companyId),
    leerNegocio(companyId, para),
    leerContradichas(companyId, para),
    leerCorrecciones(companyId),
    para === "dueno" ? leerResultadoDueno(companyId) : leerResultadoConsultora(companyId, personas),
    o("la ruta", () => leerHechosRuta(companyId)),
    para === "dueno" ? Promise.resolve(null) : o("lo pedido al cliente", () => listarSolicitudes(companyId)),
    para === "dueno" ? Promise.resolve(null) : contar("las contradicciones", () => sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "contradicho")),
    para === "dueno"
      ? Promise.resolve(null)
      : contar("lo marcado para validar", () => sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "sin_verificar").eq("prioridad_validacion", true)),
  ]);

  const incongruencias = await hechosIncongruencia(metricas, negocio, contradichas, correcciones, config, ahora);

  return {
    para,
    config,
    admitida: fila ? fila.estado_admision === "admitida" : null,
    procesos: mapa ? conteoProcesos(mapa) : null,
    dependencia,
    metricas,
    negocio:
      negocio.ficha || negocio.lineas || negocio.costos || negocio.operaciones
        ? { lineas: negocio.lineas ?? [], costos: negocio.costos ?? [], ficha: negocio.ficha ?? { ...FICHA_VACIA }, operaciones: negocio.operaciones ?? [] }
        : null,
    incongruencias,
    resultado,
    ruta: ruta ? { productos: ruta.productos, costos: ruta.costos, historia: ruta.historia, organigrama: ruta.organigrama } : null,
    solicitudes,
    porConfirmar: contradichasN != null && priorizadasN != null ? contradichasN + priorizadasN : null,
  };
}

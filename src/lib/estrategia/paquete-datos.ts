/**
 * LEER LO QUE ENTRA AL PAQUETE DE UNA EMPRESA (spec-estrategia-8x.md §3.3). SERVIDOR: usa la service role y filtra SIEMPRE
 * por la empresa en la consulta, con columnas explícitas y con tope (afirmaciones 600, hallazgos 80, procesos 120).
 *
 * Una lectura por tabla, en paralelo. Lo que decide si se puede generar:
 *  - Si falla una lectura CRÍTICA (la empresa, sus números, sus afirmaciones o sus hallazgos), se lanza
 *    `ErrorLecturaCritica` con la tabla y el motivo: no se genera nada y no se gasta ninguna consulta.
 *  - Si una tabla de otra construcción todavía no existe en esta base (42P01, 42703, PGRST204, PGRST205), no rompe
 *    nada: queda en `lecturas_fallidas` con «esta parte no está habilitada en esta base» y sus datos salen «sin dato».
 *  - Cualquier otro fallo de una lectura no crítica también queda nombrado en `lecturas_fallidas`, con su motivo: nada
 *    falla en silencio y nada se lee como «cero».
 *
 * Las afirmaciones se leen sin incrustar su fuente ni su persona: las fuentes y las personas de la empresa se leen
 * aparte (son pocas) y se cruzan aquí. Así cada consulta es simple y ninguna lleva una lista de cientos de ids.
 */
import { supabaseAdmin } from "../supabase/admin";
import { soloConclusionesDeHoy } from "../db/queries";
import { listarLineas } from "../producto";
import { leerFichaNegocio, listarCostos, listarOperacionesMoneda, faltaMigracionNegocio } from "../negocio-datos";
import { FICHA_VACIA } from "../rentabilidad";
import { desdeFila as fichaDireccionDesdeFila, type Ficha } from "../ficha-direccion";
import { TEXTO_PARTE_NO_HABILITADA } from "./textos";
import type { DatoOral } from "../dato-oral";
import type {
  AfirmacionEntrada, EmpresaEntrada, EntradasPaquete, HallazgoEntrada, MetricaEntrada, ParticipanteEntrada, ProcesoEntrada, RespuestaEntrada, Unidad,
} from "./paquete";

/** Topes de lectura por empresa (§3.3). Lo que no entra queda contado en `totales` y el paquete lo dice. */
export const TOPE_LECTURA = { claims: 600, findings: 80, procesos: 120, metricas: 500, participantes: 300, fuentes: 1000, respuestas: 200 } as const;

/** Las tablas sin las cuales no hay estrategia: si una no se puede leer, no se genera nada. */
export const TABLAS_CRITICAS = ["companies", "company_metricas", "claims", "findings"] as const;

/** Una lectura crítica que falló. La ruta lo dice con la tabla y el motivo, y no gasta ninguna consulta. */
export class ErrorLecturaCritica extends Error {
  constructor(readonly tabla: string, readonly motivo: string) {
    super(`No se pudo leer ${tabla}: ${motivo}`);
    this.name = "ErrorLecturaCritica";
  }
}

type ErrorBase = { code?: string | null; message: string } | null;
type Filas = Record<string, unknown>[];
type Respuesta<T> = { data: T | null; error: ErrorBase; count?: number | null };
/** Cualquier consulta del cliente de Supabase, vista como lo que devuelve. */
const como = <T>(q: unknown) => q as PromiseLike<Respuesta<T>>;

/** Las columnas de cada tabla: explícitas, nunca «*». La versión «base» es la de una base sin las columnas nuevas. */
const COLUMNAS = {
  empresa: "id,sector,ficha,pais,moneda,zona_horaria,modelo_negocio,tipo_trabajo",
  empresaBase: "id,sector,ficha",
  metricas: "id,clave,periodo,valor,estado,updated_at",
  claims: "id,texto,pilar,tipo,temporalidad,estado,comprobacion,fecha_afirmacion,created_at,contradice_a,explicacion_contradiccion,source_id,participant_id",
  claimsBase: "id,texto,pilar,tipo,temporalidad,estado,fecha_afirmacion,created_at,contradice_a,explicacion_contradiccion,source_id,participant_id",
  fuentes: "id,tipo,origen,revision,fidelidad_extraccion,fecha_origen",
  fuentesBase: "id,tipo,origen,fecha_origen",
  findings: "id,titulo,causa_raiz,impacto,pilar,estado_revision,provisional,origen,created_at",
  findingsBase: "id,titulo,causa_raiz,impacto,pilar,estado_revision,origen,created_at",
  evidencia: "finding_id,claim_id,relacion",
  ficha: "id,company_id,version,estado,creada_por,acordada_por,acordada_at,reemplaza_a,created_at,bloques,dependencia",
  procesos: "id,nombre,area,confirmacion",
  participantes: "id,nombre,puesto,rol",
  respuestas: "id,clave,texto,unidad,respuesta,respuesta_texto,respondida_at",
  modelo: "contenido",
} as const;

const faltaColumna = (e: ErrorBase) => !!e && (e.code === "42703" || e.code === "PGRST204");

/** Lee con unas columnas y, si la base todavía no tiene alguna, con las de antes. */
async function conRespaldo<T>(leer: (columnas: string) => PromiseLike<Respuesta<T>>, columnas: string, base: string): Promise<Respuesta<T>> {
  const r = await leer(columnas);
  return faltaColumna(r.error) ? leer(base) : r;
}

/** El modelo de alto rendimiento del rubro, en frases con su clave: contexto, nunca dato de la empresa. */
export function referenciaDesdeModelo(contenido: unknown): { clave: string; texto: string }[] {
  if (!contenido || typeof contenido !== "object") return [];
  const c = contenido as Record<string, unknown>;
  const salida: { clave: string; texto: string }[] = [];
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  if (texto(c.el_rubro_en_su_mejor_version)) salida.push({ clave: "rubro.mejor_version", texto: texto(c.el_rubro_en_su_mejor_version) });
  lista(c.estandares_de_servicio).forEach((e, i) => {
    const t = [texto(e.estandar), texto(e.meta)].filter(Boolean).join(" · meta del rubro: ");
    if (t) salida.push({ clave: `rubro.estandar.${i + 1}`, texto: t });
  });
  lista(c.numeros_de_clase_mundial).forEach((n, i) => {
    const t = [texto(n.nombre), texto(n.meta_referencia)].filter(Boolean).join(": ");
    if (t) salida.push({ clave: `rubro.numero.${i + 1}`, texto: t });
  });
  (Array.isArray(c.las_tres_brechas_mayores) ? (c.las_tres_brechas_mayores as unknown[]) : []).forEach((b, i) => {
    if (texto(b)) salida.push({ clave: `rubro.brecha.${i + 1}`, texto: texto(b) });
  });
  return salida;
}

const UNIDADES_RESPUESTA = ["soles", "de_cada_10", "dias", "unidades_mes", "veces_mes", "horas_semana", "personas", "texto"];
const unidadDeRespuesta = (u: unknown): Unidad => (UNIDADES_RESPUESTA.includes(String(u)) ? (u as Unidad) : "texto");
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Las filas tipadas que necesitan armarPaquete y calcularTodo, de UNA empresa. Lanza ErrorLecturaCritica si falla una
 * lectura crítica; lo demás que no se pudo leer queda nombrado en `lecturas_fallidas`.
 */
export async function leerEntradasPaquete(companyId: string): Promise<EntradasPaquete> {
  const sb = supabaseAdmin();
  const lecturas_fallidas: EntradasPaquete["lecturas_fallidas"] = [];
  const fallo = (tabla: string, e: unknown) => {
    const x = e as { codigo?: string | null; code?: string | null; message?: string } | null;
    const codigo = x?.codigo ?? x?.code ?? null;
    lecturas_fallidas.push({ tabla, motivo: faltaMigracionNegocio(codigo) ? TEXTO_PARTE_NO_HABILITADA : e instanceof Error ? e.message : String(x?.message ?? e) });
  };
  const critica = (tabla: string, e: ErrorBase) => {
    if (e) throw new ErrorLecturaCritica(tabla, e.message);
  };
  /** Una lectura no crítica: si falla, queda nombrada y devuelve lo vacío (que se lee «sin dato», nunca «cero»). */
  const seguro = async <T>(tabla: string, leer: () => Promise<T>, vacio: T): Promise<T> => {
    try {
      return await leer();
    } catch (e) {
      fallo(tabla, e);
      return vacio;
    }
  };
  const filas = async <T>(tabla: string, q: PromiseLike<Respuesta<T>>, vacio: T): Promise<T> => {
    const { data, error } = await q;
    if (error) {
      fallo(tabla, error);
      return vacio;
    }
    return data ?? vacio;
  };
  /** Cuántas filas hay en total (para decir cuántas no entraron por el tope). Si no se puede contar, null: no se inventa. */
  const contar = async (q: unknown): Promise<number | null> => {
    try {
      const { count, error } = await como<null>(q);
      return error ? null : count ?? null;
    } catch {
      return null;
    }
  };
  const cuenta = (tabla: string) => sb.from(tabla).select("id", { count: "exact", head: true }).eq("company_id", companyId);

  const [empresaR, metricasR, claimsR, findingsR, fuentesR, participantesR] = await Promise.all([
    conRespaldo<Record<string, unknown>>((c) => como(sb.from("companies").select(c).eq("id", companyId).maybeSingle()), COLUMNAS.empresa, COLUMNAS.empresaBase),
    como<Filas>(sb.from("company_metricas").select(COLUMNAS.metricas).eq("company_id", companyId).limit(TOPE_LECTURA.metricas)),
    conRespaldo<Filas>((c) => como(sb.from("claims").select(c).eq("company_id", companyId).order("created_at", { ascending: false }).limit(TOPE_LECTURA.claims)), COLUMNAS.claims, COLUMNAS.claimsBase),
    conRespaldo<Filas>((c) => como(sb.from("findings").select(c).eq("company_id", companyId).neq("estado_revision", "rechazado").order("created_at", { ascending: false }).limit(TOPE_LECTURA.findings)), COLUMNAS.findings, COLUMNAS.findingsBase),
    conRespaldo<Filas>((c) => como(sb.from("sources").select(c).eq("company_id", companyId).limit(TOPE_LECTURA.fuentes)), COLUMNAS.fuentes, COLUMNAS.fuentesBase),
    como<Filas>(sb.from("participants").select(COLUMNAS.participantes).eq("company_id", companyId).limit(TOPE_LECTURA.participantes)),
  ]);
  critica("companies", empresaR.error);
  if (!empresaR.data) throw new ErrorLecturaCritica("companies", "la empresa no existe");
  critica("company_metricas", metricasR.error);
  critica("claims", claimsR.error);
  critica("findings", findingsR.error);
  if (fuentesR.error) fallo("sources", fuentesR.error);
  if (participantesR.error) fallo("participants", participantesR.error);

  const findingsFilas = findingsR.data ?? [];
  const [lineas, costos, ficha_negocio, operaciones, fichaFilas, procesosFilas, respuestasFilas, modeloFila, evidencia, totalClaims, totalFindings, totalProcesos] = await Promise.all([
    seguro("lineas_producto", () => listarLineas(companyId), []),
    seguro("costos_mes", () => listarCostos(companyId), []),
    seguro("ficha_negocio", () => leerFichaNegocio(companyId), { ...FICHA_VACIA }),
    seguro("operaciones_moneda", () => listarOperacionesMoneda(companyId), []),
    filas<Filas>("ficha_direccion", como(sb.from("ficha_direccion").select(COLUMNAS.ficha).eq("company_id", companyId).in("estado", ["acordada", "borrador"]).order("version", { ascending: false }).limit(20)), []),
    filas<Filas>("processes", como(sb.from("processes").select(COLUMNAS.procesos).eq("company_id", companyId).eq("version", "as_is").order("created_at").limit(TOPE_LECTURA.procesos)), []),
    // En orden (la más nueva primero): si una clave tiene dos respuestas, el paquete se queda con la última, y la huella
    // no cambia de una lectura a otra por el orden en que llegan las filas.
    filas<Filas>("estrategia_preguntas", como(sb.from("estrategia_preguntas").select(COLUMNAS.respuestas).eq("company_id", companyId).eq("estado", "respondida").order("respondida_at", { ascending: false }).limit(TOPE_LECTURA.respuestas)), []),
    filas<Record<string, unknown> | null>("modelo_alto_rendimiento", como(sb.from("modelo_alto_rendimiento").select(COLUMNAS.modelo).eq("company_id", companyId).maybeSingle()), null),
    findingsFilas.length
      ? filas<Filas>("finding_evidence", como(sb.from("finding_evidence").select(COLUMNAS.evidencia).in("finding_id", findingsFilas.map((f) => String(f.id)))), [])
      : Promise.resolve([] as Filas),
    contar(cuenta("claims")),
    contar(cuenta("findings").neq("estado_revision", "rechazado")),
    contar(cuenta("processes").eq("version", "as_is")),
  ]);

  const fuentes = new Map((fuentesR.data ?? []).map((s) => [String(s.id), s]));
  const participantes = (participantesR.data ?? []).map((p): ParticipanteEntrada => ({ id: String(p.id), nombre: String(p.nombre ?? ""), puesto: texto(p.puesto), rol: texto(p.rol) }));
  const persona = new Map(participantes.map((p) => [p.id, p]));

  const e = empresaR.data;
  const empresa: EmpresaEntrada = {
    sector: texto(e.sector),
    ficha: (e.ficha as Record<string, unknown> | null) ?? null,
    modelo_negocio: e.modelo_negocio ?? null,
    tipo_trabajo: e.tipo_trabajo ?? null,
    pais: texto(e.pais),
    moneda: texto(e.moneda),
    zona_horaria: texto(e.zona_horaria),
  };

  const metricas = (metricasR.data ?? []).map((m) => ({
    id: texto(m.id),
    clave: String(m.clave),
    periodo: texto(m.periodo) ?? "actual",
    valor: m.valor == null ? null : Number(m.valor),
    estado: texto(m.estado),
    updated_at: texto(m.updated_at),
  }) as MetricaEntrada);

  const claims = (claimsR.data ?? []).map((c): AfirmacionEntrada => {
    const s = c.source_id ? fuentes.get(String(c.source_id)) : undefined;
    const p = c.participant_id ? persona.get(String(c.participant_id)) : undefined;
    return {
      id: String(c.id),
      texto: String(c.texto ?? ""),
      pilar: texto(c.pilar),
      tipo: texto(c.tipo),
      temporalidad: texto(c.temporalidad),
      estado: texto(c.estado),
      comprobacion: texto(c.comprobacion),
      fecha_afirmacion: texto(c.fecha_afirmacion),
      created_at: texto(c.created_at),
      contradice_a: texto(c.contradice_a),
      explicacion_contradiccion: texto(c.explicacion_contradiccion),
      fuente: s ? { tipo: texto(s.tipo), origen: texto(s.origen), revision: texto(s.revision), fidelidad_extraccion: texto(s.fidelidad_extraccion), fecha_origen: texto(s.fecha_origen) } : null,
      persona: p ? { rol: p.rol, puesto: p.puesto } : null,
    };
  });

  const claimsDe = new Map<string, string[]>();
  for (const ev of evidencia) {
    if (ev.relacion && ev.relacion !== "sustenta") continue;
    const k = String(ev.finding_id);
    claimsDe.set(k, [...(claimsDe.get(k) ?? []), String(ev.claim_id)]);
  }
  const findingsLeidos = findingsFilas.map((f): HallazgoEntrada => ({
    id: String(f.id),
    titulo: String(f.titulo ?? ""),
    causa_raiz: texto(f.causa_raiz),
    impacto: texto(f.impacto),
    pilar: texto(f.pilar),
    estado_revision: texto(f.estado_revision),
    provisional: f.provisional == null ? null : f.provisional === true,
    origen: texto(f.origen),
    created_at: texto(f.created_at),
    claim_ids: claimsDe.get(String(f.id)) ?? [],
  }));
  // El candado del área se lee con los hechos de hoy, en la base (la misma regla que el resto de 8X). Si no se puede
  // contar, se lanza: un hallazgo del que no se sabe si es conclusión no entra a una estrategia como si lo fuera.
  let findings: HallazgoEntrada[];
  try {
    findings = await soloConclusionesDeHoy(companyId, findingsLeidos);
  } catch (err) {
    throw new ErrorLecturaCritica("findings", err instanceof Error ? err.message : String(err));
  }

  // La ficha de dirección vigente: la acordada más reciente y, si no hay, el borrador más reciente.
  const fichas = fichaFilas.map(fichaDireccionDesdeFila).sort((a, b) => b.version - a.version);
  const ficha_direccion: Ficha | null = fichas.find((f) => f.estado === "acordada") ?? fichas.find((f) => f.estado === "borrador") ?? null;

  const procesos = procesosFilas.map((p): ProcesoEntrada => ({ id: String(p.id), nombre: String(p.nombre ?? ""), area: texto(p.area), confirmacion: texto(p.confirmacion) }));
  const respuestas = respuestasFilas.map((r): RespuestaEntrada => ({
    id: String(r.id),
    clave: String(r.clave),
    texto: String(r.texto ?? ""),
    unidad: unidadDeRespuesta(r.unidad),
    respuesta: (r.respuesta as DatoOral | null) ?? null,
    respuesta_texto: texto(r.respuesta_texto),
    respondida_at: texto(r.respondida_at),
  }));

  return {
    empresa,
    metricas,
    lineas,
    costos,
    ficha_negocio,
    operaciones,
    claims,
    findings,
    ficha_direccion,
    procesos,
    participantes,
    respuestas,
    referencia: referenciaDesdeModelo(modeloFila?.contenido),
    // Nadie anota todavía el costo de reemplazo por hora: sin él, la bolsa de horas se muestra en horas, nunca en soles.
    costo_reemplazo_hora: null,
    totales: {
      ...(totalClaims != null ? { claims: totalClaims } : {}),
      ...(totalFindings != null ? { findings: totalFindings } : {}),
      ...(totalProcesos != null ? { procesos: totalProcesos } : {}),
    },
    lecturas_fallidas,
  };
}

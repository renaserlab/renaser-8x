import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoCanonico, frentesAbiertos, ESTADO_CONSULTOR, type Estado } from "./plan-reglas";
import { COLUMNAS_MEDICION, COLUMNAS_MEDICION_LEGADO, lineaBaseVigente, lecturaDeCorte, ligarAcciones, fechaDia, type Medicion, type AccionLigada } from "./medicion";
import { aceptacionDelDueno } from "./actas";
import { clasificarAtascadas } from "./torre";
import { semanaPorDefecto, sumarDias, nombreDeSemana, esLunes, lunesDe, diaEnZona, ESTADOS_EN_MARCHA } from "./revision-semanal";
import { ENTREGABLE, ETAPA } from "./textos";

/**
 * LA CARTERA: LA VISTA DE DIRECCIÓN DE RENASER (instrucción de Dirección 13-10-2026, sección 16; requisito R16.1).
 *
 * Hasta hoy la consultora veía empresa por empresa (`/bandeja`, `/empresas`, `/torre`) y nadie podía responder de
 * un vistazo: ¿quién lleva cada empresa, qué se le vendió, en qué fase del método está, cuál es la próxima
 * decisión, qué le debemos, qué está trabado y si hay un resultado medido? Esta es esa vista.
 *
 * TRES REGLAS QUE ESTE MÓDULO NO ROMPE:
 *
 *  1. SE CUENTAN COSAS, NO SE INVENTAN PORCENTAJES. No hay «avance 60 %»: hay tres prioridades abiertas, dos
 *     compromisos vencidos, una fuente atascada, un corte. Lo que no se cuenta no se muestra.
 *  2. NO SABER NO ES CERO. Si una tabla o una columna no existe en esa base (migración sin aplicar) o la lectura
 *     falla, el bloque dice `sinDato` con el motivo. «0 bloqueos» y «no pude mirar los bloqueos» no son lo mismo.
 *  3. EL RESULTADO SE LEE EN UN SOLO SITIO. La lectura observado/atribuible sale de `lecturaDeCorte`
 *     (src/lib/medicion.ts), la misma que ven el dueño y el panel de la empresa. Aquí no se calcula otra.
 *
 * Arriba va lo determinista (sin base, sin reloj propio: recibe `hoy`). Abajo, lo que lee de la base: una
 * consulta por tabla para TODAS las empresas, nunca una por empresa, y paginada, porque PostgREST corta en
 * mil filas y un corte en silencio ya nos hizo reportar cifras falsas una vez (ver src/lib/torre.ts).
 */

/** El reloj de Dirección: la cartera cruza empresas, así que los días se cuentan con la zona de la consultora. */
export const ZONA_CARTERA = "America/Lima";

// ───────────────────────── LA FASE DEL MÉTODO ─────────────────────────

export const FASES_METODO = ["comprension", "radiografia", "direccion", "priorizacion", "plan", "implementacion", "medicion", "aprendizaje"] as const;
export type FaseMetodo = (typeof FASES_METODO)[number];

export const NOMBRE_FASE: Record<FaseMetodo, string> = {
  comprension: "Comprensión",
  radiografia: "Radiografía",
  direccion: "Dirección",
  priorizacion: "Priorización",
  plan: "Plan",
  implementacion: "Implementación",
  medicion: "Medición",
  aprendizaje: "Aprendizaje",
};

/**
 * `companies.etapa` tiene ocho valores que NO son las ocho fases del método: Comprensión ocupa dos etapas
 * (admisión y levantamiento), Radiografía otras dos (contraste y diagnóstico), y «El Espejo» cubre tres fases
 * (Dirección, Priorización y Plan) que la etapa sola no distingue. Esas tres se separan con hechos contados del
 * plan, en `faseDeEtapa`.
 */
export const FASE_POR_ETAPA: Record<string, FaseMetodo> = {
  admision: "comprension",
  levantamiento: "comprension",
  contraste: "radiografia",
  diagnostico: "radiografia",
  espejo: "direccion",
  implementacion: "implementacion",
  monitoreo: "medicion",
  cerrado: "aprendizaje",
};

/** Lo que se sabe del plan para afinar la fase dentro de «El Espejo». Son cuentas, no opiniones. */
export type HechosDeFase = { propuestasSinAprobar: number; aprobadas: number };

export type FaseCartera = {
  /** null = la etapa no está registrada o no es una de las conocidas. No se supone ninguna. */
  clave: FaseMetodo | null;
  nombre: string;
  etapa: string | null;
  /** La etapa como la nombra el resto del sistema («El Espejo», «Monitoreo · 45 días»). */
  etapaNombre: string | null;
  /** De dónde sale la fase: se dice siempre, porque la etapa y la fase no son lo mismo. */
  porQue: string;
};

export const SIN_FASE_NOMBRE = "Sin fase registrada";

/**
 * La etapa del sistema traducida a la fase del método. `hechos` solo cambia el resultado en «El Espejo»:
 * con acciones aprobadas ya hay Plan; con propuestas sin aprobar se está en Priorización (eligiendo qué va);
 * sin ninguna de las dos, en Dirección. Sin `hechos` (no se pudo leer el plan) se queda en Dirección y lo dice.
 */
export function faseDeEtapa(etapa: string | null | undefined, hechos?: HechosDeFase | null): FaseCartera {
  const e = etapa?.trim() || null;
  const etapaNombre = e ? (propio(ETAPA, e) ?? e) : null;
  const base = e ? propio(FASE_POR_ETAPA, e) : undefined;
  if (!e) return { clave: null, nombre: SIN_FASE_NOMBRE, etapa: null, etapaNombre: null, porQue: "La empresa no tiene etapa registrada." };
  if (!base) return { clave: null, nombre: SIN_FASE_NOMBRE, etapa: e, etapaNombre, porQue: `La etapa «${e}» no corresponde a ninguna fase del método.` };

  let clave: FaseMetodo = base;
  let porQue = `Etapa «${etapaNombre}».`;
  if (e === "espejo") {
    if (!hechos) porQue = `Etapa «${etapaNombre}». No se pudo leer el plan para saber si ya se priorizó o se aprobó.`;
    else if (hechos.aprobadas > 0) {
      clave = "plan";
      porQue = `Etapa «${etapaNombre}» con ${cuantas(hechos.aprobadas, "acción aprobada", "acciones aprobadas")}.`;
    } else if (hechos.propuestasSinAprobar > 0) {
      clave = "priorizacion";
      porQue = `Etapa «${etapaNombre}» con ${cuantas(hechos.propuestasSinAprobar, "acción propuesta", "acciones propuestas")} sin aprobar.`;
    } else porQue = `Etapa «${etapaNombre}» sin acciones propuestas ni aprobadas todavía.`;
  }
  return { clave, nombre: NOMBRE_FASE[clave], etapa: e, etapaNombre, porQue };
}

// ───────────────────────── LO QUE ENTRA ─────────────────────────

export const NIVELES = ["nivel_1", "nivel_2"] as const;
export type NivelContratado = (typeof NIVELES)[number];
/** Solo el nombre. Qué incluye cada nivel lo define Dirección y se escribe en el alcance de cada empresa: aquí no se inventa. */
export const NOMBRE_NIVEL: Record<NivelContratado, string> = { nivel_1: "Nivel 1", nivel_2: "Nivel 2" };
export const SIN_NIVEL = "Sin definir";
export const SIN_CONSULTOR = "Sin asignar";

export type EmpresaCartera = {
  id: string;
  nombre: string;
  etapa: string | null;
  estado_admision?: string | null;
  consultor_responsable_id?: string | null;
  nivel_contratado?: string | null;
  alcance_contratado?: string | null;
  proxima_decision?: string | null;
  proxima_decision_fecha?: string | null;
  limite_frentes?: number | null;
};

export type ConsultorBreve = { id: string; nombre: string | null; email?: string | null };

export type AccionCartera = {
  id: string;
  accion: string;
  estado: string;
  verificado_at?: string | null;
  es_prioridad?: boolean | null;
  vence_at?: string | null;
  obligaciones_renaser?: string | null;
  obligaciones_cliente?: string | null;
  bloqueo?: string | null;
  bloqueado_at?: string | null;
  /** El único sello de tiempo de `actions`: la tabla no guarda cuándo se creó la fila. */
  updated_at?: string | null;
};

export type EntregableCartera = { id: string; tipo: string; version: number | null; publicado: boolean | null; publicado_at?: string | null; estado?: string | null };
export type FuenteAtascadaCartera = { id: string; nombre: string; horas: number; desde: string };
export type TrabajoFallidoCartera = { id: string; tipo: string; cuando: string | null };
export type RevisionCartera = { semana: string; explicacion: string | null };
export type ActaCartera = { referencia_id: string; aceptado_rol: string | null; aceptado_at: string };

/**
 * Todo lo que se sabe de UNA empresa para pintar su fila. Cada lista puede venir `null`: quiere decir «no se
 * pudo leer» y el bloque correspondiente sale `sinDato`, nunca en cero.
 */
export type DatosCartera = {
  /** Hoy para Dirección, AAAA-MM-DD. Lo pone quien llama: esta parte no mira el reloj. */
  hoy: string;
  /** El lunes de la última semana que ya terminó (la que toca revisar). */
  semanaTerminada: string;
  consultores: readonly ConsultorBreve[];
  acciones: readonly AccionCartera[] | null;
  /** false cuando la base no tiene las columnas del plan (prioridad, obligaciones, bloqueo): se leyó sin ellas. */
  planCompleto: boolean;
  entregables: readonly EntregableCartera[] | null;
  fuentesAtascadas: readonly FuenteAtascadaCartera[] | null;
  trabajosFallidos: readonly TrabajoFallidoCartera[] | null;
  revisiones: readonly RevisionCartera[] | null;
  mediciones: readonly Medicion[] | null;
  actas: readonly ActaCartera[] | null;
  /** Las acciones ligadas a un número, para decidir qué resultado es atribuible. */
  accionesLigadas: readonly AccionLigada[];
  /** false cuando `companies` no tiene las columnas de cartera (migración sin aplicar). */
  conAsignacion: boolean;
};

/** Una empresa de la que todavía no hay nada: todo leído y todo vacío. Sirve de punto de partida al armar los datos. */
export function datosVacios(hoy: string, semanaTerminada: string = sumarDias(lunesDe(hoy), -7)): DatosCartera {
  return {
    hoy, semanaTerminada, consultores: [], acciones: [], planCompleto: true, entregables: [], fuentesAtascadas: [], trabajosFallidos: [],
    revisiones: [], mediciones: [], actas: [], accionesLigadas: [], conAsignacion: true,
  };
}

// ───────────────────────── LO QUE SALE ─────────────────────────

export type PrioridadCartera = { id: string; accion: string; estado: Estado; estadoNombre: string };
export type Prioridades = {
  sinDato: string | null;
  /** Las que están sobre la mesa: abiertas más trabadas. */
  cuantas: number;
  /** Las que cuentan para el límite de frentes (aprobadas, en ejecución o reportadas). */
  abiertas: number;
  trabadas: number;
  /** `companies.limite_frentes`, o null si no se conoce. */
  limite: number | null;
  cuales: PrioridadCartera[];
};

export type OrigenDecision = "escrita" | "accion_propuesta" | "revision_sin_explicar" | "corte_sin_acta" | "ninguna";
export type ProximaDecision = {
  origen: OrigenDecision;
  texto: string;
  /** Escrita: la fecha comprometida. Derivada: desde cuándo espera. null si no se sabe. */
  fecha: string | null;
  /** Solo una decisión escrita con fecha puede estar vencida. */
  vencida: boolean;
  /** Escrita: días que faltan (negativo = días de atraso). Derivada: días que lleva esperando. */
  dias: number | null;
  /** A dónde ir para tomarla. */
  href: string;
  /** De dónde sale: «la escribió Dirección» o cuál de las tres derivaciones. */
  nota: string;
  /** Lo demás que también espera decisión, contado. Una decisión escrita no tapa lo que el sistema ve. */
  tambien: string[];
  /** Lo que no se pudo mirar al derivarla. */
  sinDato: string[];
};

export type Compromiso = {
  id: string;
  accion: string;
  obligacion: string;
  vence_at: string | null;
  vencido: boolean;
  /** Días de atraso si venció; días que faltan (negativo o cero) si no; null sin fecha. */
  diasDeAtraso: number | null;
  estado: Estado;
};
export type Compromisos = {
  sinDato: string | null;
  /** Lo que RENASER se obligó a hacer en acciones aprobadas y todavía no verificadas. */
  cuantos: number;
  vencidos: number;
  /** Vencen de hoy a siete días. */
  vencenPronto: number;
  sinFecha: number;
  /** Vencidos primero (el más atrasado arriba), después por fecha, al final los que no tienen fecha. */
  lista: Compromiso[];
  /** Lo que la empresa se obligó a hacer, con el mismo orden. Informa: no entra en `cuantos`. */
  deLaEmpresa: Compromiso[];
};

export type EntregaCartera = { tipo: string; nombre: string; versionPublicada: number | null; publicadaEl: string | null; versionPendiente: number | null };
export type Entregas = {
  sinDato: string | null;
  /** Documentos distintos con una versión publicada. */
  publicadas: number;
  /** Documentos distintos cuya última versión todavía no se publicó. */
  pendientes: number;
  lista: EntregaCartera[];
};

export type OrigenBloqueo = "accion" | "fuente" | "trabajo";
export type Bloqueos = {
  total: number;
  acciones: number;
  fuentes: number;
  trabajos: number;
  masAntiguo: { origen: OrigenBloqueo; texto: string; desde: string | null; dias: number | null } | null;
  /** Qué fuentes de bloqueo no se pudieron mirar. Con alguna aquí, `total` es un mínimo. */
  sinDato: string[];
};

export const SIN_CORTE = "sin corte";
export type Resultados =
  | { estado: "sin_dato"; texto: string; detalle: string }
  | { estado: "sin_corte"; texto: typeof SIN_CORTE; detalle: string; base: { version: number; fecha: string } | null }
  | {
      estado: "con_corte";
      texto: string;
      detalle: string;
      corte: { id: string; numero: number; fecha: string };
      base: { version: number; fecha: string } | null;
      /** Lo primero que se lee del corte, de `lecturaDeCorte`. */
      titular: string;
      /** true solo con períodos registrados y equivalentes: fuera de eso lo que hay no es un resultado. */
      esResultado: boolean;
      /** De lo que se movió: cuánto es atribuible al trabajo, cuánto en parte y cuánto solo se observó. */
      cuenta: { movidos: number; atribuibles: number; enParte: number; observados: number; sinCambio: number; sinDato: number };
    };

export type AsignacionGuardada = {
  consultor_responsable_id: string | null;
  nivel_contratado: string | null;
  alcance_contratado: string | null;
  proxima_decision: string | null;
  proxima_decision_fecha: string | null;
};

export type FilaCartera = {
  empresa: { id: string; nombre: string; href: string; activa: boolean; admision: string | null };
  /** null = sin asignar. `conocido: false` = hay un identificador guardado que ya no es un consultor. */
  consultor: { id: string; nombre: string; conocido: boolean } | null;
  nivel: { clave: NivelContratado | null; nombre: string };
  alcance: string | null;
  /** Por qué consultor, nivel y alcance no se pueden mostrar ni asignar; null cuando sí. */
  asignacionSinDato: string | null;
  /** Lo que está guardado tal cual, para el formulario de asignar: la decisión ESCRITA, no la deducida. */
  guardado: AsignacionGuardada;
  fase: FaseCartera;
  prioridades: Prioridades;
  proximaDecision: ProximaDecision;
  compromisos: Compromisos;
  entregas: Entregas;
  bloqueos: Bloqueos;
  resultados: Resultados;
  exigeDecision: boolean;
  bloqueada: boolean;
};

// ───────────────────────── PIEZAS ─────────────────────────

const cuantas = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;
/** El valor de una tabla de textos solo si la clave es suya: «constructor» no es una etapa ni un documento. */
function propio<T>(tabla: Record<string, T>, clave: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(tabla, clave) ? tabla[clave] : undefined;
}
const lleno = (s: string | null | undefined): s is string => typeof s === "string" && s.trim().length > 0;
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})/;

/** Días desde la época de un AAAA-MM-DD (o de un instante ISO, por su parte de día), o null si no es una fecha. */
function diaNumero(iso: string | null | undefined): number | null {
  const m = iso ? RE_DIA.exec(iso) : null;
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). null si alguna no es una fecha. */
export function diasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  const a = diaNumero(desde);
  const b = diaNumero(hasta);
  return a == null || b == null ? null : b - a;
}

/** El día de calendario de un instante para Dirección; un día suelto (AAAA-MM-DD) ya es un día. */
function diaDeDireccion(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return diaEnZona(valor, ZONA_CARTERA) ?? (RE_DIA.exec(valor)?.[0] ?? null);
}

/** Una empresa cuenta como carga mientras no esté cerrada ni rechazada. Una candidata cuenta: evaluarla es trabajo. */
export function esActiva(c: Pick<EmpresaCartera, "etapa" | "estado_admision">): boolean {
  return c.etapa !== "cerrado" && c.estado_admision !== "rechazada";
}

/** Estados en los que una obligación ya es un compromiso y todavía no está comprobada. Una propuesta no obliga a nadie. */
const ESTADOS_DE_COMPROMISO: readonly Estado[] = ["aprobado", "en_ejecucion", "reportado", "bloqueado"];
/** Estados que dicen que el plan ya se aprobó, para la fase. */
const ESTADOS_CON_PLAN: readonly Estado[] = ["aprobado", "en_ejecucion", "reportado", "verificado", "bloqueado"];
const SIN_COLUMNAS_DEL_PLAN = "Esta base no tiene las columnas del plan (falta aplicar supabase/migracion-plan-kpi-linea-base.sql).";
const SIN_ACCIONES = "No se pudieron leer las acciones del plan.";

function prioridadesDe(empresa: EmpresaCartera, datos: DatosCartera): Prioridades {
  const limite = typeof empresa.limite_frentes === "number" ? empresa.limite_frentes : null;
  const vacio = (sinDato: string): Prioridades => ({ sinDato, cuantas: 0, abiertas: 0, trabadas: 0, limite, cuales: [] });
  if (!datos.acciones) return vacio(SIN_ACCIONES);
  if (!datos.planCompleto) return vacio(SIN_COLUMNAS_DEL_PLAN);
  const marcadas = datos.acciones.map((a) => ({ ...a, es_prioridad: Boolean(a.es_prioridad) }));
  // La misma regla que el límite de frentes: lo aprobado y lo que sigue hasta que se verifica.
  const abiertas = frentesAbiertos(marcadas);
  const trabadas = marcadas.filter((a) => a.es_prioridad && estadoCanonico(a) === "bloqueado");
  const cuales = [...trabadas, ...abiertas].map((a) => {
    const estado = estadoCanonico(a);
    return { id: a.id, accion: a.accion, estado, estadoNombre: ESTADO_CONSULTOR[estado] };
  });
  return { sinDato: null, cuantas: cuales.length, abiertas: abiertas.length, trabadas: trabadas.length, limite, cuales };
}

function compromisosDe(datos: DatosCartera): Compromisos {
  const vacio = (sinDato: string): Compromisos => ({ sinDato, cuantos: 0, vencidos: 0, vencenPronto: 0, sinFecha: 0, lista: [], deLaEmpresa: [] });
  if (!datos.acciones) return vacio(SIN_ACCIONES);
  if (!datos.planCompleto) return vacio(SIN_COLUMNAS_DEL_PLAN);
  const vivas = datos.acciones.filter((a) => ESTADOS_DE_COMPROMISO.includes(estadoCanonico(a)));
  const armar = (campo: "obligaciones_renaser" | "obligaciones_cliente"): Compromiso[] =>
    vivas
      .filter((a) => lleno(a[campo]))
      .map((a) => {
        const vence = a.vence_at ? a.vence_at.slice(0, 10) : null;
        const atraso = vence ? diasEntre(vence, datos.hoy) : null;
        return { id: a.id, accion: a.accion, obligacion: a[campo]!.trim(), vence_at: vence, vencido: atraso != null && atraso > 0, diasDeAtraso: atraso, estado: estadoCanonico(a) };
      })
      // Vencidos primero y el más atrasado arriba; luego lo que vence antes; sin fecha al final. La acción desempata.
      .sort((x, y) => {
        if (x.vence_at == null || y.vence_at == null) return x.vence_at == null && y.vence_at == null ? x.accion.localeCompare(y.accion, "es") : x.vence_at == null ? 1 : -1;
        return x.vence_at.localeCompare(y.vence_at) || x.accion.localeCompare(y.accion, "es");
      });
  const lista = armar("obligaciones_renaser");
  return {
    sinDato: null,
    cuantos: lista.length,
    vencidos: lista.filter((c) => c.vencido).length,
    vencenPronto: lista.filter((c) => c.diasDeAtraso != null && c.diasDeAtraso <= 0 && c.diasDeAtraso >= -7).length,
    sinFecha: lista.filter((c) => c.vence_at == null).length,
    lista,
    deLaEmpresa: armar("obligaciones_cliente"),
  };
}

function entregasDe(datos: DatosCartera): Entregas {
  if (!datos.entregables) return { sinDato: "No se pudieron leer los documentos de entrega.", publicadas: 0, pendientes: 0, lista: [] };
  // Un documento reemplazado («obsoleto») ya no es ni una entrega hecha ni una pendiente.
  const vivos = datos.entregables.filter((d) => d.estado !== "obsoleto");
  const porTipo = new Map<string, EntregableCartera[]>();
  for (const d of vivos) porTipo.set(d.tipo, [...(porTipo.get(d.tipo) ?? []), d]);
  const lista: EntregaCartera[] = [];
  for (const [tipo, filas] of porTipo) {
    const deMayorAMenor = [...filas].sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
    const publicada = deMayorAMenor.find((d) => d.publicado === true) ?? null;
    const ultima = deMayorAMenor[0]!;
    lista.push({
      tipo,
      nombre: propio(ENTREGABLE, tipo) ?? tipo,
      versionPublicada: publicada ? (publicada.version ?? 1) : null,
      publicadaEl: publicada?.publicado_at ? diaDeDireccion(publicada.publicado_at) : null,
      versionPendiente: ultima.publicado === true ? null : (ultima.version ?? 1),
    });
  }
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { sinDato: null, publicadas: lista.filter((e) => e.versionPublicada != null).length, pendientes: lista.filter((e) => e.versionPendiente != null).length, lista };
}

function bloqueosDe(datos: DatosCartera): Bloqueos {
  const sinDato: string[] = [];
  const candidatos: { origen: OrigenBloqueo; texto: string; desde: string | null }[] = [];

  let acciones = 0;
  if (!datos.acciones) sinDato.push("acciones bloqueadas");
  else {
    const bloqueadas = datos.acciones.filter((a) => estadoCanonico(a) === "bloqueado");
    acciones = bloqueadas.length;
    for (const a of bloqueadas) candidatos.push({ origen: "accion", texto: `Acción bloqueada: «${a.accion}»${lleno(a.bloqueo) ? ` — ${a.bloqueo.trim()}` : ""}`, desde: a.bloqueado_at ?? a.updated_at ?? null });
  }

  let fuentes = 0;
  if (!datos.fuentesAtascadas) sinDato.push("fuentes atascadas");
  else {
    fuentes = datos.fuentesAtascadas.length;
    for (const f of datos.fuentesAtascadas) candidatos.push({ origen: "fuente", texto: `Fuente atascada: «${f.nombre}» lleva ${f.horas} horas leyéndose`, desde: f.desde });
  }

  let trabajos = 0;
  if (!datos.trabajosFallidos) sinDato.push("trabajos fallidos");
  else {
    trabajos = datos.trabajosFallidos.length;
    for (const t of datos.trabajosFallidos) candidatos.push({ origen: "trabajo", texto: `Trabajo fallido: «${t.tipo}»`, desde: t.cuando });
  }

  // El más antiguo es el que tiene la fecha más vieja; uno sin fecha no gana a uno fechado (no se sabe cuándo empezó).
  let masAntiguo: Bloqueos["masAntiguo"] = null;
  for (const c of candidatos) {
    const t = c.desde ? Date.parse(c.desde) : NaN;
    const tActual = masAntiguo?.desde ? Date.parse(masAntiguo.desde) : NaN;
    const gana = !masAntiguo || (Number.isFinite(t) && (!Number.isFinite(tActual) || t < tActual));
    if (gana) masAntiguo = { origen: c.origen, texto: c.texto, desde: c.desde, dias: diasEntre(diaDeDireccion(c.desde), datos.hoy) };
  }
  return { total: acciones + fuentes + trabajos, acciones, fuentes, trabajos, masAntiguo, sinDato };
}

function resultadosDe(datos: DatosCartera): Resultados {
  if (!datos.mediciones) return { estado: "sin_dato", texto: "sin dato", detalle: "No se pudieron leer las mediciones de esta empresa." };
  const vigente = lineaBaseVigente(datos.mediciones);
  const baseDe = (m: Medicion | null) => (m ? { version: m.version ?? 1, fecha: m.fecha } : null);
  const cortes = datos.mediciones.filter((m) => m.tipo === "corte").sort((a, b) => b.numero - a.numero);
  const corte = cortes[0];
  if (!corte) {
    return {
      estado: "sin_corte",
      texto: SIN_CORTE,
      base: baseDe(vigente),
      detalle: vigente
        ? `Hay punto de partida (versión ${vigente.version ?? 1}, del ${fechaDia(vigente.fecha)}) y ningún corte después: todavía no hay resultado que leer.`
        : "No hay punto de partida ni corte: no hay contra qué medir.",
    };
  }
  // La misma lectura que ven el dueño y el panel de la empresa; aquí solo cambia la voz.
  const l = lecturaDeCorte({ corte, mediciones: datos.mediciones, acciones: datos.accionesLigadas, para: "consultor" });
  const cuenta = { movidos: l.cuenta.movidos, atribuibles: l.cuenta.si, enParte: l.cuenta.parcial, observados: l.cuenta.observados, sinCambio: l.cuenta.sinCambio, sinDato: l.cuenta.sinDato };
  let detalle: string;
  if (l.noComparable) detalle = "No hay comparación: nada se observa ni se atribuye.";
  else if (cuenta.movidos === 0) detalle = "Ningún número se movió respecto al punto de partida.";
  else if (!l.esResultado) detalle = `${cuantas(cuenta.movidos, "número se movió", "números se movieron")}; quedan como observados: sin períodos comparables nada se atribuye al trabajo.`;
  else
    detalle = `De ${cuantas(cuenta.movidos, "número que se movió", "números que se movieron")}: ${cuenta.atribuibles} atribuible${cuenta.atribuibles === 1 ? "" : "s"} al trabajo, ${cuenta.enParte} en parte y ${cuenta.observados} solo observado${cuenta.observados === 1 ? "" : "s"}.`;
  return {
    estado: "con_corte",
    texto: `Corte ${corte.numero} · ${fechaDia(corte.fecha)}`,
    detalle,
    corte: { id: corte.id, numero: corte.numero, fecha: corte.fecha },
    base: baseDe(l.base),
    titular: l.titular,
    esResultado: l.esResultado,
    cuenta,
  };
}

function proximaDecisionDe(empresa: EmpresaCartera, datos: DatosCartera): ProximaDecision {
  const base = `/empresa/${empresa.id}`;
  const sinDato: string[] = [];

  // 1 · Las acciones propuestas que nadie aprobó ni descartó, la más antigua primero.
  let propuestas: AccionCartera[] = [];
  if (!datos.acciones) sinDato.push("acciones propuestas sin aprobar");
  else {
    const t = (a: AccionCartera) => (a.updated_at ? Date.parse(a.updated_at) : NaN);
    propuestas = datos.acciones
      .filter((a) => estadoCanonico(a) === "propuesto")
      .sort((x, y) => {
        const tx = t(x);
        const ty = t(y);
        if (Number.isFinite(tx) && Number.isFinite(ty) && tx !== ty) return tx - ty;
        if (Number.isFinite(tx) !== Number.isFinite(ty)) return Number.isFinite(tx) ? -1 : 1;
        return x.accion.localeCompare(y.accion, "es");
      });
  }

  // 2 · Las semanas sin explicar: las guardadas sin explicación que ya terminaron y, si hay plan en marcha, la
  // última semana terminada aunque nadie la haya abierto (una semana que nadie abrió tampoco está explicada).
  let semanas: string[] = [];
  if (!datos.revisiones) sinDato.push("revisiones semanales sin explicar");
  else {
    const terminadas = datos.revisiones.filter((r) => esLunes(r.semana) && r.semana <= datos.semanaTerminada);
    const pendientes = new Set(terminadas.filter((r) => !lleno(r.explicacion)).map((r) => r.semana));
    const enMarcha = (datos.acciones ?? []).some((a) => ESTADOS_EN_MARCHA.includes(estadoCanonico(a)));
    if (enMarcha && esLunes(datos.semanaTerminada) && !terminadas.some((r) => r.semana === datos.semanaTerminada)) pendientes.add(datos.semanaTerminada);
    semanas = [...pendientes].sort((a, b) => b.localeCompare(a));
  }

  // 3 · Los cortes que la empresa todavía no aceptó, el más reciente primero. La aceptación que cuenta es la del dueño.
  let cortes: Medicion[] = [];
  if (!datos.mediciones) sinDato.push("cortes sin aceptación");
  else if (!datos.actas) sinDato.push("actas de aceptación de los cortes");
  else {
    const actas = datos.actas;
    cortes = datos.mediciones.filter((m) => m.tipo === "corte" && !aceptacionDelDueno(actas, m.id)).sort((a, b) => b.numero - a.numero);
  }

  const frasePropuestas = (n: number, mas = false) => cuantas(n, `acción propuesta${mas ? " más" : ""} sin aprobar`, `acciones propuestas${mas ? " más" : ""} sin aprobar`);
  const fraseSemanas = (n: number, mas = false) => cuantas(n, `semana${mas ? " más" : ""} sin explicar`, `semanas${mas ? " más" : ""} sin explicar`);
  const fraseCortes = (n: number, mas = false) => cuantas(n, `corte${mas ? " más" : ""} sin aceptación de la empresa`, `cortes${mas ? " más" : ""} sin aceptación de la empresa`);

  if (lleno(empresa.proxima_decision)) {
    const fecha = empresa.proxima_decision_fecha ? empresa.proxima_decision_fecha.slice(0, 10) : null;
    const faltan = fecha ? diasEntre(datos.hoy, fecha) : null;
    return {
      origen: "escrita",
      texto: empresa.proxima_decision.trim(),
      fecha,
      vencida: faltan != null && faltan < 0,
      dias: faltan,
      href: base,
      nota: "La escribió Dirección.",
      tambien: [propuestas.length ? frasePropuestas(propuestas.length) : "", semanas.length ? fraseSemanas(semanas.length) : "", cortes.length ? fraseCortes(cortes.length) : ""].filter(Boolean),
      sinDato,
    };
  }

  if (propuestas.length) {
    const a = propuestas[0]!;
    const desde = diaDeDireccion(a.updated_at ?? null);
    return {
      origen: "accion_propuesta",
      texto: `Aprobar o descartar: «${a.accion}»`,
      fecha: desde,
      vencida: false,
      dias: diasEntre(desde, datos.hoy),
      href: `${base}/plan`,
      nota: "Derivada: la acción propuesta que más tiempo lleva sin aprobar (por su último movimiento).",
      tambien: [propuestas.length > 1 ? frasePropuestas(propuestas.length - 1, true) : "", semanas.length ? fraseSemanas(semanas.length) : "", cortes.length ? fraseCortes(cortes.length) : ""].filter(Boolean),
      sinDato,
    };
  }

  if (semanas.length) {
    const semana = semanas[0]!;
    const cierre = sumarDias(semana, 6);
    return {
      origen: "revision_sin_explicar",
      texto: `Explicar la ${nombreDeSemana(semana).toLowerCase()}`,
      fecha: cierre,
      vencida: false,
      dias: diasEntre(cierre, datos.hoy),
      href: `${base}/revision?semana=${semana}`,
      nota: "Derivada: la revisión semanal más reciente que nadie explicó.",
      tambien: [semanas.length > 1 ? fraseSemanas(semanas.length - 1, true) : "", cortes.length ? fraseCortes(cortes.length) : ""].filter(Boolean),
      sinDato,
    };
  }

  if (cortes.length) {
    const c = cortes[0]!;
    const desde = c.fecha ? c.fecha.slice(0, 10) : null;
    return {
      origen: "corte_sin_acta",
      texto: `Presentar el corte ${c.numero} y registrar la aceptación de la empresa`,
      fecha: desde,
      vencida: false,
      dias: diasEntre(desde, datos.hoy),
      href: base,
      nota: "Derivada: el corte más reciente que la empresa todavía no aceptó.",
      tambien: [cortes.length > 1 ? fraseCortes(cortes.length - 1, true) : ""].filter(Boolean),
      sinDato,
    };
  }

  return {
    origen: "ninguna",
    texto: sinDato.length ? "No se pudo determinar" : "Ninguna decisión pendiente",
    fecha: null,
    vencida: false,
    dias: null,
    href: base,
    nota: sinDato.length ? "No hay decisión escrita y parte de lo que habría que mirar no se pudo leer." : "No hay decisión escrita ni nada esperando aprobación, explicación o aceptación.",
    tambien: [],
    sinDato,
  };
}

// ───────────────────────── LA FILA ─────────────────────────

export const SIN_MIGRACION_CARTERA =
  "Esta base todavía no tiene las columnas de cartera: falta aplicar supabase/migracion-excelencia-y-cartera.sql. Consultor, nivel, alcance y próxima decisión escrita no se pueden mostrar ni asignar.";

/** La fila de una empresa en la cartera. Determinista: mismos datos, misma fila. */
export function filaCartera(empresa: EmpresaCartera, datos: DatosCartera): FilaCartera {
  const consultorId = datos.conAsignacion ? (empresa.consultor_responsable_id ?? null) : null;
  const encontrado = consultorId ? datos.consultores.find((c) => c.id === consultorId) : undefined;
  const consultor = consultorId
    ? { id: consultorId, nombre: encontrado ? (lleno(encontrado.nombre) ? encontrado.nombre.trim() : (encontrado.email ?? "Consultor sin nombre")) : "Consultor no encontrado", conocido: Boolean(encontrado) }
    : null;

  const nivelCrudo = datos.conAsignacion ? (empresa.nivel_contratado ?? null) : null;
  const esNivel = (x: string | null): x is NivelContratado => x != null && (NIVELES as readonly string[]).includes(x);
  const nivel = esNivel(nivelCrudo) ? { clave: nivelCrudo, nombre: NOMBRE_NIVEL[nivelCrudo] } : { clave: null, nombre: nivelCrudo ? `Valor no reconocido: ${nivelCrudo}` : SIN_NIVEL };

  const hechos: HechosDeFase | null = datos.acciones
    ? {
        propuestasSinAprobar: datos.acciones.filter((a) => estadoCanonico(a) === "propuesto").length,
        aprobadas: datos.acciones.filter((a) => ESTADOS_CON_PLAN.includes(estadoCanonico(a))).length,
      }
    : null;

  const sinAsignacion: EmpresaCartera = datos.conAsignacion ? empresa : { ...empresa, proxima_decision: null, proxima_decision_fecha: null };
  const proximaDecision = proximaDecisionDe(sinAsignacion, datos);
  const bloqueos = bloqueosDe(datos);

  return {
    empresa: { id: empresa.id, nombre: empresa.nombre, href: `/empresa/${empresa.id}`, activa: esActiva(empresa), admision: empresa.estado_admision ?? null },
    consultor,
    nivel,
    alcance: datos.conAsignacion && lleno(empresa.alcance_contratado) ? empresa.alcance_contratado.trim() : null,
    asignacionSinDato: datos.conAsignacion ? null : SIN_MIGRACION_CARTERA,
    guardado: {
      consultor_responsable_id: consultorId,
      nivel_contratado: nivelCrudo,
      alcance_contratado: datos.conAsignacion && lleno(empresa.alcance_contratado) ? empresa.alcance_contratado : null,
      proxima_decision: lleno(sinAsignacion.proxima_decision) ? sinAsignacion.proxima_decision : null,
      proxima_decision_fecha: sinAsignacion.proxima_decision_fecha ? sinAsignacion.proxima_decision_fecha.slice(0, 10) : null,
    },
    fase: faseDeEtapa(empresa.etapa, hechos),
    prioridades: prioridadesDe(empresa, datos),
    proximaDecision,
    compromisos: compromisosDe(datos),
    entregas: entregasDe(datos),
    bloqueos,
    resultados: resultadosDe(datos),
    exigeDecision: proximaDecision.origen !== "ninguna",
    bloqueada: bloqueos.total > 0,
  };
}

// ───────────────────────── ORDEN, FILTRO, CARGA ─────────────────────────

/**
 * Primero las empresas activas; las cerradas y rechazadas, al final. Entre las activas, primero lo que exige una
 * decisión o está bloqueado. Dentro de eso: la decisión escrita ya vencida, lo
 * bloqueado, lo que además tiene compromisos de RENASER vencidos, y lo que lleva más tiempo esperando. Lo que
 * no pide nada va al final, las empresas activas antes que las cerradas, y el nombre desempata: el orden es
 * siempre el mismo con los mismos datos.
 */
export function ordenar(filas: readonly FilaCartera[]): FilaCartera[] {
  const atencion = (f: FilaCartera) => (f.exigeDecision || f.bloqueada ? 1 : 0);
  const peso = (f: FilaCartera) => (f.proximaDecision.vencida ? 4 : 0) + (f.bloqueada ? 2 : 0) + (f.exigeDecision ? 1 : 0);
  const fecha = (f: FilaCartera) => diaNumero(f.proximaDecision.fecha) ?? Number.POSITIVE_INFINITY;
  return [...filas].sort(
    (a, b) =>
      // Lo cerrado o rechazado va siempre al final: un trabajo fallido de hace meses en una empresa cerrada no
      // puede quedar por encima de una empresa activa con una decisión pendiente.
      Number(b.empresa.activa) - Number(a.empresa.activa) ||
      atencion(b) - atencion(a) ||
      peso(b) - peso(a) ||
      b.compromisos.vencidos - a.compromisos.vencidos ||
      fecha(a) - fecha(b) ||
      Number(b.empresa.activa) - Number(a.empresa.activa) ||
      a.empresa.nombre.localeCompare(b.empresa.nombre, "es") ||
      a.empresa.id.localeCompare(b.empresa.id)
  );
}

/** Valores del filtro que no son un identificador ni una fase. */
export const FILTRO_SIN_ASIGNAR = "sin_asignar";
export const FILTRO_SIN_FASE = "sin_fase";
export type FiltroCartera = { consultor?: string | null; fase?: string | null };

/** Deja las filas del consultor y de la fase pedidos. Un filtro vacío no filtra. */
export function filtrar(filas: readonly FilaCartera[], filtro: FiltroCartera): FilaCartera[] {
  return filas.filter((f) => {
    if (filtro.consultor) {
      if (filtro.consultor === FILTRO_SIN_ASIGNAR ? f.consultor != null : f.consultor?.id !== filtro.consultor) return false;
    }
    if (filtro.fase) {
      if (filtro.fase === FILTRO_SIN_FASE ? f.fase.clave != null : f.fase.clave !== filtro.fase) return false;
    }
    return true;
  });
}

const RE_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El filtro tal como llega en la dirección (`?consultor=…&fase=…`), comprobado. Un valor que no es un consultor
 * posible ni una fase del método no se ignora en silencio: se dice cuál es, y quien llama decide qué hacer.
 */
export function filtroDe(crudo: { consultor?: string | null; fase?: string | null }): { ok: true; filtro: FiltroCartera } | { ok: false; error: string } {
  const consultor = crudo.consultor?.trim() || null;
  const fase = crudo.fase?.trim() || null;
  if (consultor && consultor !== FILTRO_SIN_ASIGNAR && !RE_IDENTIFICADOR.test(consultor)) return { ok: false, error: "El consultor del filtro no es válido: elige uno de la lista." };
  if (fase && fase !== FILTRO_SIN_FASE && !(FASES_METODO as readonly string[]).includes(fase)) return { ok: false, error: "Esa fase no es una de las ocho del método: elige una de la lista." };
  return { ok: true, filtro: { consultor, fase } };
}

export type CargaConsultor = {
  /** null = las empresas que nadie tiene asignadas. */
  id: string | null;
  nombre: string;
  /** Empresas activas a su cargo: la carga. */
  activas: number;
  /** Todas las que tiene asignadas, también las cerradas. */
  empresas: number;
  /** De las activas: cuántas esperan una decisión, cuántas tienen algo bloqueado y cuántos compromisos de RENASER vencieron. */
  exigenDecision: number;
  conBloqueo: number;
  compromisosVencidos: number;
  /** Prioridades sobre la mesa en sus empresas activas. */
  prioridades: number;
};

/**
 * Empresas activas por consultor. Salen todos los consultores, también los que no tienen ninguna, y al final
 * las empresas sin asignar. No hay «capacidad» ni «ocupación»: ese dato no existe en la base y no se calcula.
 */
export function cargaPorConsultor(filas: readonly FilaCartera[], consultores: readonly ConsultorBreve[]): CargaConsultor[] {
  const porId = new Map<string, CargaConsultor>();
  const vacia = (id: string | null, nombre: string): CargaConsultor => ({ id, nombre, activas: 0, empresas: 0, exigenDecision: 0, conBloqueo: 0, compromisosVencidos: 0, prioridades: 0 });
  for (const c of consultores) porId.set(c.id, vacia(c.id, lleno(c.nombre) ? c.nombre.trim() : (c.email ?? "Consultor sin nombre")));
  const sinAsignar = vacia(null, SIN_CONSULTOR);
  for (const f of filas) {
    let fila = sinAsignar;
    if (f.consultor) {
      fila = porId.get(f.consultor.id) ?? vacia(f.consultor.id, f.consultor.nombre);
      porId.set(f.consultor.id, fila);
    }
    fila.empresas += 1;
    if (!f.empresa.activa) continue;
    fila.activas += 1;
    if (f.exigeDecision) fila.exigenDecision += 1;
    if (f.bloqueada) fila.conBloqueo += 1;
    fila.compromisosVencidos += f.compromisos.vencidos;
    fila.prioridades += f.prioridades.cuantas;
  }
  const lista = [...porId.values()].sort((a, b) => b.activas - a.activas || a.nombre.localeCompare(b.nombre, "es"));
  return sinAsignar.empresas > 0 ? [...lista, sinAsignar] : lista;
}

export type ResumenCartera = {
  empresas: number;
  activas: number;
  exigenDecision: number;
  conBloqueo: number;
  compromisosVencidos: number;
  compromisosQueVencenPronto: number;
  entregasPendientes: number;
  fuentesAtascadas: number;
  trabajosFallidos: number;
  sinConsultor: number;
};

/** Los totales de la cartera. Suman lo que cada fila ya contó: aquí no se mira nada nuevo. */
export function resumenCartera(filas: readonly FilaCartera[]): ResumenCartera {
  const suma = (de: (f: FilaCartera) => number) => filas.reduce((n, f) => n + de(f), 0);
  return {
    empresas: filas.length,
    activas: suma((f) => Number(f.empresa.activa)),
    exigenDecision: suma((f) => Number(f.exigeDecision)),
    conBloqueo: suma((f) => Number(f.bloqueada)),
    compromisosVencidos: suma((f) => f.compromisos.vencidos),
    compromisosQueVencenPronto: suma((f) => f.compromisos.vencenPronto),
    entregasPendientes: suma((f) => f.entregas.pendientes),
    fuentesAtascadas: suma((f) => f.bloqueos.fuentes),
    trabajosFallidos: suma((f) => f.bloqueos.trabajos),
    sinConsultor: suma((f) => Number(f.empresa.activa && f.consultor == null)),
  };
}

// ───────────────────────── ABAJO: LO QUE LEE DE LA BASE ─────────────────────────

type Lector = Pick<SupabaseClient, "from">;
type ErrorBase = { message?: string | null; code?: string | null };
type Respuesta = { data: unknown[] | null; error: ErrorBase | null };

/** Filas por petición. PostgREST no devuelve más de mil aunque se le pidan. */
export const PAGINA = 1000;
/** Tope de páginas por tabla. Si se alcanza, la cartera lo dice: lo recortado no se presenta como completo. */
export const MAX_PAGINAS = 20;

/** ¿El error dice que la tabla o la columna no existe en esa base? Postgres: 42P01 y 42703; PostgREST: PGRST204 y PGRST205. */
export function faltaEnLaBase(error: ErrorBase | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find the (table|column)/i.test(error.message ?? "");
}

type Lectura<T> = { filas: T[]; error: ErrorBase | null; recortado: boolean };

/** Lee una tabla entera, de mil en mil. `pedir` arma la consulta de una página; el orden tiene que ser estable. */
async function leerTodo<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<Lectura<T>> {
  const filas: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const { data, error } = await pedir(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) return { filas: [], error, recortado: false };
    const trozo = (data ?? []) as T[];
    filas.push(...trozo);
    if (trozo.length < PAGINA) return { filas, error: null, recortado: false };
  }
  return { filas, error: null, recortado: true };
}

const COLUMNAS_EMPRESA_LEGADO = "id,nombre,etapa,estado_admision";
const COLUMNAS_EMPRESA = `${COLUMNAS_EMPRESA_LEGADO},consultor_responsable_id,nivel_contratado,alcance_contratado,proxima_decision,proxima_decision_fecha,limite_frentes`;
const COLUMNAS_ACCION_LEGADO = "id,company_id,accion,estado,vence_at,updated_at";
const COLUMNAS_ACCION = `${COLUMNAS_ACCION_LEGADO},verificado_at,es_prioridad,obligaciones_renaser,obligaciones_cliente,bloqueo,bloqueado_at,indicador_id`;
const COLUMNAS_ENTREGABLE_LEGADO = "id,company_id,tipo,version,publicado,publicado_at";
const COLUMNAS_ENTREGABLE = `${COLUMNAS_ENTREGABLE_LEGADO},estado`;

export type Cartera = {
  /** Hoy para Dirección (AAAA-MM-DD, hora de Lima). */
  hoy: string;
  generadaAt: string;
  /** Ya ordenadas con `ordenar`. */
  filas: FilaCartera[];
  carga: CargaConsultor[];
  resumen: ResumenCartera;
  consultores: ConsultorBreve[];
  /** false cuando falta la migración de cartera: no hay a quién asignar ni dónde guardarlo. */
  conAsignacion: boolean;
  /** Todo lo que no se pudo leer o se leyó a medias, en frases. Vacío = se leyó todo. */
  avisos: string[];
};

type FilaConEmpresa = { company_id: string | null };
/** Por empresa. Una fila sin empresa (un trabajo del sistema, por ejemplo) no es de ninguna cartera: la ve la torre. */
const agrupar = <T extends FilaConEmpresa>(filas: readonly T[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const f of filas) if (f.company_id) m.set(f.company_id, [...(m.get(f.company_id) ?? []), f]);
  return m;
};

/**
 * Lee la cartera completa. No escribe. Si las empresas no se pueden leer, falla en voz alta: una cartera vacía
 * porque no pudo leer sería mentira. Todo lo demás, si falta, deja su bloque `sinDato` y un aviso arriba.
 */
export async function cargarCartera(sb: Lector, ahora: Date = new Date()): Promise<Cartera> {
  const hoy = diaEnZona(ahora, ZONA_CARTERA) ?? ahora.toISOString().slice(0, 10);
  const semanaTerminada = semanaPorDefecto(ahora, ZONA_CARTERA);
  const avisos: string[] = [];
  const recortes: string[] = [];
  const anotar = (que: string, l: { error: ErrorBase | null; recortado: boolean }) => {
    if (l.recortado) recortes.push(que);
    if (l.error) avisos.push(faltaEnLaBase(l.error) ? `${que}: esa tabla o columna todavía no existe en esta base. Se muestra «sin dato», no cero.` : `${que}: no se pudieron leer (${l.error.message ?? "error sin mensaje"}). Se muestra «sin dato», no cero.`);
  };

  // Las empresas, con las columnas de cartera si existen.
  let conAsignacion = true;
  let empresasL = await leerTodo<EmpresaCartera>((d, h) => sb.from("companies").select(COLUMNAS_EMPRESA).order("id").range(d, h));
  if (empresasL.error && faltaEnLaBase(empresasL.error)) {
    conAsignacion = false;
    avisos.push(SIN_MIGRACION_CARTERA);
    empresasL = await leerTodo<EmpresaCartera>((d, h) => sb.from("companies").select(COLUMNAS_EMPRESA_LEGADO).order("id").range(d, h));
  }
  if (empresasL.error) throw new Error(`La cartera no pudo leer las empresas: ${empresasL.error.message ?? "error sin mensaje"}`);
  if (empresasL.recortado) recortes.push("empresas");
  const empresas = empresasL.filas;

  // Las acciones, con las columnas del plan si existen.
  let planCompleto = true;
  type AccionFila = AccionCartera & FilaConEmpresa & { indicador_id?: string | null };
  const leerAcciones = (columnas: string) => leerTodo<AccionFila>((d, h) => sb.from("actions").select(columnas).order("id").range(d, h));

  const [consultoresL, accionesPrimera, entregablesPrimera, leyendoL, fallidosL, revisionesL, medicionesPrimera, actasL, indicadoresL, verificacionesL] = await Promise.all([
    leerTodo<ConsultorBreve>((d, h) => sb.from("users").select("id,nombre,email").eq("rol", "consultor").order("id").range(d, h)),
    leerAcciones(COLUMNAS_ACCION),
    leerTodo<EntregableCartera & FilaConEmpresa>((d, h) => sb.from("deliverables").select(COLUMNAS_ENTREGABLE).order("id").range(d, h)),
    leerTodo<{ id: string; nombre: string; company_id: string; created_at: string }>((d, h) => sb.from("sources").select("id,nombre,company_id,created_at").eq("estado", "leyendo").order("id").range(d, h)),
    leerTodo<{ id: string; company_id: string | null; tipo: string; terminado_at: string | null; created_at: string | null }>((d, h) => sb.from("jobs").select("id,company_id,tipo,terminado_at,created_at").eq("estado", "fallido").order("id").range(d, h)),
    leerTodo<RevisionCartera & FilaConEmpresa>((d, h) => sb.from("revisiones_semanales").select("id,company_id,semana,explicacion").order("id").range(d, h)),
    leerTodo<Medicion & FilaConEmpresa>((d, h) => sb.from("mediciones").select(`company_id,${COLUMNAS_MEDICION}`).order("id").range(d, h)),
    leerTodo<ActaCartera & FilaConEmpresa>((d, h) => sb.from("actas_aceptacion").select("id,company_id,referencia_id,aceptado_rol,aceptado_at").eq("tipo", "corte").order("id").range(d, h)),
    leerTodo<{ id: string; clave: string }>((d, h) => sb.from("indicadores").select("id,clave").order("id").range(d, h)),
    leerTodo<{ action_id: string; created_at: string }>((d, h) => sb.from("accion_historial").select("id,action_id,created_at").eq("accion", "verificar").order("id").range(d, h)),
  ]);

  let accionesL = accionesPrimera;
  if (accionesL.error && faltaEnLaBase(accionesL.error)) {
    planCompleto = false;
    avisos.push(`Acciones del plan: ${SIN_COLUMNAS_DEL_PLAN} Prioridades y compromisos salen «sin dato».`);
    accionesL = await leerAcciones(COLUMNAS_ACCION_LEGADO);
  }
  anotar("Acciones del plan", accionesL);

  let entregablesL = entregablesPrimera;
  if (entregablesL.error && faltaEnLaBase(entregablesL.error)) entregablesL = await leerTodo<EntregableCartera & FilaConEmpresa>((d, h) => sb.from("deliverables").select(COLUMNAS_ENTREGABLE_LEGADO).order("id").range(d, h));
  anotar("Documentos de entrega", entregablesL);

  let medicionesL = medicionesPrimera;
  if (medicionesL.error && faltaEnLaBase(medicionesL.error)) medicionesL = await leerTodo<Medicion & FilaConEmpresa>((d, h) => sb.from("mediciones").select(`company_id,${COLUMNAS_MEDICION_LEGADO}`).order("id").range(d, h));
  anotar("Mediciones", medicionesL);

  anotar("Consultores", consultoresL);
  anotar("Fuentes en lectura", leyendoL);
  anotar("Trabajos fallidos", fallidosL);
  anotar("Revisiones semanales", revisionesL);
  anotar("Actas de aceptación", actasL);
  // Sin indicadores o sin historial la lectura del corte sigue saliendo, pero nada se puede atribuir: se dice.
  if (indicadoresL.error || indicadoresL.recortado) anotar("Indicadores (para decidir qué resultado es atribuible)", indicadoresL);
  if (verificacionesL.error || verificacionesL.recortado) anotar("Historial de verificaciones (para decidir qué resultado es atribuible)", verificacionesL);

  // Fuentes atascadas: la misma regla que la torre, con los trabajos de extracción de esas fuentes.
  let atascadas: (FuenteAtascadaCartera & { companyId: string })[] | null = null;
  if (!leyendoL.error) {
    if (!leyendoL.filas.length) atascadas = [];
    else {
      const ids = leyendoL.filas.map((f) => String(f.id));
      const { data: trabajos, error } = await sb.from("jobs").select("payload,estado,created_at").eq("tipo", "extraer").in("payload->>source_id", ids).order("created_at", { ascending: false }).limit(PAGINA);
      if (error) anotar("Trabajos de lectura de las fuentes", { error, recortado: false });
      else {
        if ((trabajos ?? []).length >= PAGINA) recortes.push("trabajos de lectura de las fuentes");
        const extraer = (trabajos ?? []).map((t) => ({ source_id: String((t.payload as { source_id?: string } | null)?.source_id ?? ""), estado: String(t.estado), created_at: String(t.created_at) }));
        atascadas = clasificarAtascadas(leyendoL.filas, extraer, ahora);
      }
    }
  }
  if (recortes.length) avisos.push(`Hay más filas de las que esta pantalla lee de una vez (${recortes.join(", ")}): las cuentas de esas columnas son un mínimo, no el total.`);

  const consultores = consultoresL.error ? [] : consultoresL.filas;
  const accionesPor = accionesL.error ? null : agrupar(accionesL.filas);
  const entregablesPor = entregablesL.error ? null : agrupar(entregablesL.filas);
  const fallidosPor = fallidosL.error ? null : agrupar(fallidosL.filas);
  const revisionesPor = revisionesL.error ? null : agrupar(revisionesL.filas);
  const medicionesPor = medicionesL.error ? null : agrupar(medicionesL.filas);
  const actasPor = actasL.error ? null : agrupar(actasL.filas);
  const atascadasPor = new Map<string, FuenteAtascadaCartera[]>();
  for (const f of atascadas ?? []) atascadasPor.set(f.companyId, [...(atascadasPor.get(f.companyId) ?? []), { id: f.id, nombre: f.nombre, horas: f.horas, desde: f.desde }]);

  // Cuándo se verificó cada acción: el último «verificar» del historial o, sin historial, la fila ya verificada.
  const verificadoEn = new Map<string, string>();
  for (const h of verificacionesL.error ? [] : verificacionesL.filas) {
    const previo = verificadoEn.get(h.action_id);
    if (!previo || h.created_at > previo) verificadoEn.set(h.action_id, h.created_at);
  }
  const indicadores = indicadoresL.error ? [] : indicadoresL.filas;

  const filas = empresas.map((e) => {
    const acciones = accionesPor ? (accionesPor.get(e.id) ?? []) : null;
    const mediciones = medicionesPor ? (medicionesPor.get(e.id) ?? []).map((m) => ({ ...m, valores: m.valores ?? {}, derivados: m.derivados ?? {} })) : null;
    const accionesLigadas = ligarAcciones(
      (acciones ?? []).map((a) => ({ id: a.id, accion: a.accion, estado: a.estado, indicador_id: a.indicador_id ?? null, fecha_verificacion: verificadoEn.get(a.id) ?? (a.estado === "verificado" ? (a.updated_at ?? null) : null) })),
      indicadores
    );
    return filaCartera(e, {
      hoy,
      semanaTerminada,
      consultores,
      acciones,
      planCompleto,
      entregables: entregablesPor ? (entregablesPor.get(e.id) ?? []) : null,
      fuentesAtascadas: atascadas ? (atascadasPor.get(e.id) ?? []) : null,
      trabajosFallidos: fallidosPor ? (fallidosPor.get(e.id) ?? []).map((t) => ({ id: t.id, tipo: t.tipo, cuando: t.terminado_at ?? t.created_at ?? null })) : null,
      revisiones: revisionesPor ? (revisionesPor.get(e.id) ?? []) : null,
      mediciones,
      actas: actasPor ? (actasPor.get(e.id) ?? []) : null,
      accionesLigadas,
      conAsignacion,
    });
  });

  const ordenadas = ordenar(filas);
  return { hoy, generadaAt: ahora.toISOString(), filas: ordenadas, carga: cargaPorConsultor(ordenadas, consultores), resumen: resumenCartera(ordenadas), consultores, conAsignacion, avisos };
}

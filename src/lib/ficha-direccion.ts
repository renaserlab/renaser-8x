/**
 * LA FICHA DE DIRECCIÓN EMPRESARIAL (R8.1): LO QUE EL DUEÑO QUIERE, EN DIEZ BLOQUES, Y DE QUIÉN DEPENDE LA EMPRESA.
 *
 * Hasta el 13-10-2026 la perspectiva «deseada» vivía como texto libre en `companies.aspiracion` y como
 * respuestas sueltas de entrevista. Aquí se vuelve una ficha estructurada y VERSIONADA (tabla `ficha_direccion`,
 * migracion-entrada-y-direccion.sql) con tres clases de frase que no se confunden:
 *   · declaración: lo dijo el dueño (una afirmación confirmada, una respuesta, su aspiración escrita);
 *   · interpretación: lo leyó la consultora o lo propuso el asistente, siempre con la fuente que lo sostiene;
 *   · acuerdo: lo firmaron los dos.
 *
 * Todo lo de este archivo es DETERMINISTA: con las mismas filas sale la misma ficha. El modelo
 * (jobs/handlers/ficha-direccion.ts) solo propone textos, y aquí entran como interpretación, nunca como
 * declaración, y solo si citan una fuente que existe. Una propuesta del asistente que nadie revisó no llega a
 * una versión acordada: `acordar` la detiene.
 *
 * LA DEPENDENCIA SE DESCRIBE, NO SE PUNTÚA. Contar en cuántos procesos del mapa participa el dueño es un dato
 * («participa en 6 de 8 procesos; en 2 es el único que decide»); convertirlo en un índice o un porcentaje sería
 * inventar una medida que nadie midió. Las ocho dimensiones dicen qué se detiene sin él, qué podría delegarse,
 * qué capacidad falta y dónde su participación aporta valor. Nada aquí patologiza al propietario.
 *
 * NADA SE BORRA. Lo que la consultora saca de la ficha queda marcado «descartado» y se puede recuperar; lo que
 * corrige conserva el texto original; acordar crea una versión nueva y deja la anterior como «reemplazada».
 *
 * «DIJO EL DUEÑO» ES SOLO LO QUE DIJO EL DUEÑO. Una afirmación entra como declaración si es su voz (él o un
 * socio, en una entrevista) o si la dice un documento de la empresa. Lo que quiere otra persona del equipo y lo
 * que la consultora anotó en campo no son palabras suyas: no entran, y la ficha avisa cuántas quedaron fuera.
 *
 * NADIE PISA A NADIE. El borrador lleva un número de revisión y cada guardado comprueba que sigue siendo el que
 * leyó (`guardarFicha`). Si mientras tanto alguien lo cambió, se vuelve a leer y se aplica el cambio encima
 * (`actualizarBorrador`); así lo que la consultora corrige mientras el asistente lee no se pierde.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { comparables, type Cifra } from "./finanzas";
import { configDe, esMonedaValida, esPaisValido, esZonaValida, moneda as escribirMoneda, numero as escribirNumero, porDefecto, type ConfigEmpresa } from "./formato";
import { normalizarMetrica, etiquetaEstado, VITAL_POR_CLAVE } from "./metricas";
import { nombreDePeriodo } from "./temporadas";
import { exigirAutoridad } from "./autoridad";
import { TEXTO_CONFIRMA, TEXTO_DOCUMENTO } from "./entrada";
import type { Perfil } from "./auth";

// ─── Los diez bloques ────────────────────────────────────────────────────────────────────────────

export const BLOQUES_FICHA = [
  "proposito", "empresa_deseada", "clientes_reputacion", "rol_futuro", "resultados_deseados",
  "tiempo", "limites", "fortalezas", "distancia", "decisiones_pendientes",
] as const;
export type BloqueFicha = (typeof BLOQUES_FICHA)[number];

/** Cómo se nombra cada bloque a la consultora. */
export const NOMBRE_BLOQUE: Record<BloqueFicha, string> = {
  proposito: "Propósito",
  empresa_deseada: "Empresa deseada",
  clientes_reputacion: "Clientes y reputación buscados",
  rol_futuro: "Rol futuro del propietario",
  resultados_deseados: "Resultados económicos y personales deseados",
  tiempo: "Tiempo disponible y tiempo que quiere recuperar",
  limites: "Límites y condiciones",
  fortalezas: "Fortalezas aprovechables",
  distancia: "Distancia respecto a la situación actual",
  decisiones_pendientes: "Decisiones pendientes",
};

/** Cómo se nombra cada bloque al dueño: su empresa, sus palabras, sin método expuesto. */
export const NOMBRE_BLOQUE_CLIENTE: Record<BloqueFicha, string> = {
  proposito: "Para qué existe tu empresa",
  empresa_deseada: "La empresa que quieres tener",
  clientes_reputacion: "Los clientes que buscas y cómo quieres que te conozcan",
  rol_futuro: "Lo que harás tú",
  resultados_deseados: "Lo que quieres lograr",
  tiempo: "Tu tiempo",
  limites: "Lo que no se negocia",
  fortalezas: "Lo que ya te sale bien",
  distancia: "Qué tan lejos estás",
  decisiones_pendientes: "Decisiones que tienes pendientes",
};

// ─── Las ocho dimensiones de dependencia ─────────────────────────────────────────────────────────

export const DIMENSIONES_DEPENDENCIA = [
  "comercial", "operativa", "financiera", "decisiones", "conocimiento", "equipo", "relaciones_estrategicas", "continuidad",
] as const;
export type DimensionClave = (typeof DIMENSIONES_DEPENDENCIA)[number];

export const NOMBRE_DIMENSION: Record<DimensionClave, string> = {
  comercial: "Comercial",
  operativa: "Operativa",
  financiera: "Financiera",
  decisiones: "Decisiones",
  conocimiento: "Conocimiento",
  equipo: "Equipo",
  relaciones_estrategicas: "Relaciones estratégicas",
  continuidad: "Continuidad",
};

/** Las mismas ocho, como se le dicen al dueño. */
export const NOMBRE_DIMENSION_CLIENTE: Record<DimensionClave, string> = {
  comercial: "Ventas y clientes",
  operativa: "El trabajo de todos los días",
  financiera: "El dinero",
  decisiones: "Las decisiones",
  conocimiento: "Lo que hoy solo sabes tú",
  equipo: "Tu equipo",
  relaciones_estrategicas: "Tus contactos clave",
  continuidad: "Que la empresa siga cuando no estás",
};

/** Los cuatro campos de cada dimensión, con su nombre para la consultora y para el dueño. */
export const CAMPOS_DIMENSION = ["que_se_detiene", "podria_delegarse", "capacidad_falta", "aporta_valor"] as const;
export type CampoDimension = (typeof CAMPOS_DIMENSION)[number];

export const NOMBRE_CAMPO: Record<CampoDimension, string> = {
  que_se_detiene: "Qué se detiene sin él",
  podria_delegarse: "Qué podría delegarse",
  capacidad_falta: "Qué capacidad falta",
  aporta_valor: "Dónde su participación aporta valor",
};

export const NOMBRE_CAMPO_CLIENTE: Record<CampoDimension, string> = {
  que_se_detiene: "Si no estás, se detiene",
  podria_delegarse: "Podría hacerlo otra persona",
  capacidad_falta: "Lo que falta para poder soltarlo",
  aporta_valor: "Donde tu presencia suma",
};

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_ITEM = ["declaracion", "interpretacion", "acuerdo"] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];
/** Quién escribió el ítem primero: el código al armar el borrador, la consultora a mano o el asistente proponiendo. No cambia al revisarlo. */
export type OrigenItem = "sistema" | "consultor" | "director";
export type Certeza = "exacta" | "aproximada" | "no_lo_se";
export type Momento = "hoy" | "deseado";
/** Por dónde llegó la frase, en grueso: sirve para decírselo al dueño sin enseñarle identificadores. */
export type Medio = "conversacion" | "material" | "numero" | "empresa" | "consultora";

/** Una cifra de la ficha. Es la de finanzas, salvo que la moneda es la que la empresa declaró (cualquier código ISO 4217), no solo soles o dólares. */
export type CifraFicha = Omit<Cifra, "moneda"> & { moneda?: string };

export type Item = {
  /** Estable entre armados: sale del bloque, la fuente y el texto, no de la hora. */
  id: string;
  texto: string;
  /** La misma frase dicha al dueño, en segunda persona y en palabras llanas. Solo la llevan los números y las comparaciones, que escribe el código. */
  texto_cliente?: string | null;
  tipo: TipoItem;
  origen: OrigenItem;
  /** De dónde sale: claim:<id>, respuesta:<id>, metrica:<id>, empresa:aspiracion, empresa:ficha.<clave>, consultor:<id>. */
  fuentes: string[];
  fecha: string | null;
  certeza?: Certeza | null;
  sabida_por?: string | null;
  medio?: Medio | null;
  /** El texto ES lo que el dueño dijo o escribió, palabra por palabra (una respuesta, su aspiración). Solo eso va entre comillas. */
  textual?: boolean;
  /** Las palabras del dueño que sostienen la frase cuando el texto es una afirmación ya resumida por el extractor. */
  cita?: string | null;
  /** Marca un número: lo que hay hoy o la meta. Una frase del dueño no lleva momento. */
  momento?: Momento | null;
  /** Resultado de una comparación o de una cuenta hecha en código (bloque distancia). */
  calculo?: boolean;
  /** El número que la consultora anotó a mano, con su base, para que la distancia lo pueda comparar. */
  cifra?: CifraFicha | null;
  /** Área de la empresa de una comparación en texto. La ve la consultora; al dueño no se le muestra. */
  pilar?: string | null;
  /** Nota de trabajo de la consultora (qué falta para medir): no se le muestra al dueño. */
  interno?: boolean;
  /** Aviso del sistema a la consultora sobre algo que NO entró a la ficha y por qué. No es material para el asistente. */
  aviso?: boolean;
  /** El texto tal como salió de la fuente, cuando la consultora lo corrigió. */
  original?: string | null;
  /** Quién lo editó o lo dio por bueno. Una propuesta del asistente sin esto no entra a una versión acordada. */
  revisado_por?: string | null;
  /** La consultora lo sacó de la ficha. No se borra: se puede recuperar y no pasa a la versión acordada. */
  descartado?: boolean;
};

export type Bloques = Record<BloqueFicha, Item[]>;

export type Dimension = {
  que_se_detiene: string | null;
  podria_delegarse: string | null;
  capacidad_falta: string | null;
  aporta_valor: string | null;
  evidencia: string[];
  nota: string | null;
  origen: OrigenItem | null;
  revisado_por?: string | null;
};

export type ConteoProcesos = {
  total: number;
  con_dueno: number;
  decide_solo: number;
  nombres_con_dueno: string[];
  nombres_decide_solo: string[];
  /** La frase descriptiva. Nunca un porcentaje. */
  texto: string;
};

export type EstadoInterpretaciones = { pendiente: boolean; motivo: string | null; at: string | null };

export type Dependencia = {
  dimensiones: Record<DimensionClave, Dimension>;
  procesos: ConteoProcesos;
  /** Lo que el dueño dijo sobre qué se detiene sin él (bloque «dependencia» del banco y la entrada breve). */
  declaraciones: Item[];
  interpretaciones: EstadoInterpretaciones;
};

export type Ficha = { bloques: Bloques; dependencia: Dependencia };

export type EstadoFicha = "borrador" | "acordada" | "reemplazada";

export type FichaGuardada = Ficha & {
  id: string;
  company_id: string;
  version: number;
  /** Cuántas veces se guardó esta fila. Quien guarda dice qué revisión leyó; si ya es otra, no pisa nada. */
  revision: number;
  estado: EstadoFicha;
  creada_por: string | null;
  acordada_por: string | null;
  acordada_at: string | null;
  reemplaza_a: string | null;
  created_at: string | null;
};

export const TEXTO_ASISTENTE_EN_PAUSA = "interpretaciones pendientes: asistente en pausa";
export const TEXTO_SIN_DATO = "sin dato";
export const TEXTO_SIN_EVIDENCIA = "sin evidencia";

export const ETIQUETA_TIPO: Record<TipoItem, string> = { declaracion: "Dijo el dueño", interpretacion: "Interpretamos", acuerdo: "Acordado" };
/** Lo que dice un papel de la empresa es una declaración, pero no una frase que el dueño dijo: se rotula como lo que es. */
export const ETIQUETA_DOCUMENTO = "Dice un documento de la empresa";
/** Lo que la consultora escribió sobre la empresa deseada (companies.aspiracion): no es una frase del dueño. */
export const ETIQUETA_CONSULTORA = "Anotó la consultora";
export const NOMBRE_ESTADO: Record<EstadoFicha, string> = { borrador: "Borrador", acordada: "Acordada", reemplazada: "Reemplazada" };

/** ¿Es una propuesta del asistente que nadie revisó todavía? */
export function esPropuestaSinRevisar(i: Pick<Item, "origen" | "revisado_por" | "descartado">): boolean {
  return i.origen === "director" && !i.revisado_por && !i.descartado;
}

/**
 * La etiqueta que ve la consultora. Una cuenta hecha en código no es una interpretación de nadie: se dice
 * «Cálculo». Un número registrado o anotado tampoco es una frase del dueño: se dice «Número» y su fuente dice cómo llegó.
 * Y «Dijo el dueño» se reserva para lo que dijo él: lo que salió de un documento de la empresa se rotula así.
 */
export function etiquetaDe(i: Pick<Item, "tipo" | "origen" | "calculo" | "momento" | "revisado_por" | "descartado" | "aviso" | "medio">): string {
  if (i.aviso) return "Aviso";
  if (i.calculo) return "Cálculo";
  if (i.momento) return "Número";
  if (esPropuestaSinRevisar(i)) return `${ETIQUETA_TIPO.interpretacion} · propuesta del asistente, sin revisar`;
  if (i.tipo === "declaracion" && i.medio === "material") return ETIQUETA_DOCUMENTO;
  if (i.tipo === "declaracion" && i.medio === "consultora") return ETIQUETA_CONSULTORA;
  return ETIQUETA_TIPO[i.tipo];
}

const NOMBRE_MEDIO: Record<Medio, string> = {
  conversacion: "lo contaste en una conversación",
  material: "está en lo que nos entregaste",
  numero: "de los números que registraste",
  empresa: "lo escribiste al contar tu empresa",
  consultora: "lo anotó tu consultora al conversar contigo",
};

/** Cómo se le dice al dueño de dónde salió una frase: sin identificadores, y sin llamar «conversación» a lo que salió de un documento. */
export function nombreFuente(i: Pick<Item, "medio">): string {
  return i.medio ? NOMBRE_MEDIO[i.medio] : "de lo que nos has contado";
}

// ─── Utilidades puras ────────────────────────────────────────────────────────────────────────────

/** Huella corta y estable de un texto (djb2). No es criptográfica: sirve para que un ítem conserve su id entre armados. */
export function huella(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function idDeItem(bloque: string, fuentes: string[], texto: string): string {
  return `${bloque}:${huella(`${fuentes.join("|")}::${texto}`)}`;
}

export function bloquesVacios(): Bloques {
  return Object.fromEntries(BLOQUES_FICHA.map((b) => [b, [] as Item[]])) as Bloques;
}

export function dimensionVacia(): Dimension {
  return { que_se_detiene: null, podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: [], nota: null, origen: null, revisado_por: null };
}

export function dimensionesVacias(): Record<DimensionClave, Dimension> {
  return Object.fromEntries(DIMENSIONES_DEPENDENCIA.map((d) => [d, dimensionVacia()])) as Record<DimensionClave, Dimension>;
}

export function fichaVacia(): Ficha {
  return {
    bloques: bloquesVacios(),
    dependencia: {
      dimensiones: dimensionesVacias(),
      procesos: contarProcesosDelDueno({ procesos: [], nodos: [], nombresDueno: [] }),
      declaraciones: [],
      interpretaciones: { pendiente: false, motivo: null, at: null },
    },
  };
}

/** ¿La dimensión dice algo? Con los cuatro campos vacíos no describe nada. */
export function dimensionConTexto(d: Dimension | null | undefined): boolean {
  return !!d && CAMPOS_DIMENSION.some((c) => !!d[c]?.trim());
}

/**
 * Con qué moneda, qué separadores y qué hora se escribe lo de esta empresa: lo que declaró en su configuración
 * (país, moneda, zona horaria), leído por src/lib/formato.ts. Un país o una zona que no son válidos no tumban la
 * ficha: rigen los de Perú. La moneda se conserva tal cual está guardada, y `textoValor` decide cómo escribirla.
 */
export function formatoDeEmpresa(fila: Partial<Record<keyof ConfigEmpresa, unknown>> | null | undefined): ConfigEmpresa {
  const cfg = configDe(fila);
  return {
    ...cfg,
    pais: esPaisValido(cfg.pais) ? cfg.pais : porDefecto.pais,
    zona_horaria: esZonaValida(cfg.zona_horaria) ? cfg.zona_horaria : porDefecto.zona_horaria,
  };
}

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function recorte(texto: string, max = 110): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function item(bloque: string, texto: string, fuentes: string[], extra: Partial<Item> = {}): Item {
  const limpio = texto.trim();
  return { id: idDeItem(bloque, fuentes, limpio), texto: limpio, tipo: "declaracion", origen: "sistema", fuentes, fecha: null, ...extra };
}

/** Los ítems que cuentan: lo descartado sigue guardado, pero no entra en ninguna cuenta ni en ninguna versión acordada. */
export function vigentes(items: Item[] | null | undefined): Item[] {
  return (items ?? []).filter((i) => !i.descartado);
}

// ─── Clasificar lo que YA hay: declaraciones con fuente ─────────────────────────────────────────

export type RespuestaFila = {
  id: string;
  session_id: string;
  bloque: string | null;
  pregunta: string | null;
  respuesta: string | null;
  certeza?: Certeza | null;
  sabida_por?: string | null;
  clave_pregunta?: string | null;
  respondido_at?: string | null;
};

export type ClaimFila = {
  id: string;
  texto: string;
  pilar: string | null;
  temporalidad: string | null;
  fecha_afirmacion: string | null;
  response_id: string | null;
  source_id: string | null;
  fragment_id?: string | null;
  /** La persona entrevistada, cuando la afirmación salió de una conversación. */
  participant_id?: string | null;
  created_at?: string | null;
};

/** A dónde va una frase: a uno de los diez bloques o a la descripción de la dependencia. */
export type Destino = BloqueFicha | "dependencia";

/** Bloque del banco de entrevistas (rules/cobertura.ts) → destino en la ficha. Lo que no está aquí no entra. */
export const BLOQUE_BANCO_A_FICHA: Record<string, Destino> = {
  proposito: "proposito",
  empresa_deseada: "empresa_deseada",
  vida_deseada: "tiempo",
  rol: "rol_futuro",
  exito: "resultados_deseados",
  verdad_dificil: "decisiones_pendientes",
  dependencia: "dependencia",
  brecha: "distancia",
  recursos: "fortalezas",
};

/**
 * Las doce preguntas de la entrada breve (src/lib/entrada.ts), por su clave estable. `null` es una decisión:
 * esa respuesta habla del negocio de hoy o de un número, y no es una frase de dirección (el número entra por
 * `company_metricas`). La prueba comprueba que ninguna clave del plan quede fuera de esta tabla.
 */
export const CLAVE_ENTRADA_A_FICHA: Record<string, Destino | null> = {
  "entrada.negocio_hoy": null,
  "entrada.que_vende_estrella": null,
  "entrada.ventas_y_ganancia": null,
  "entrada.principal_problema": "distancia",
  "entrada.que_se_detiene_sin_mi": "dependencia",
  "entrada.vision_3_anios": "empresa_deseada",
  "entrada.rol_futuro": "rol_futuro",
  "entrada.dinero_tranquilo": "resultados_deseados",
  "entrada.no_sacrifica": "limites",
  "entrada.mejor_resultado_anterior": null,
  "entrada.que_funciona": "fortalezas",
  "entrada.recursos_desaprovechados": "fortalezas",
};

/**
 * Algunas preguntas del banco pertenecen a OTRO bloque de la ficha que el del banco: «¿Qué no estás dispuesto a
 * sacrificar?» vive en el bloque propósito y es un límite. Se decide por el texto de la pregunta, en orden.
 */
export const RUTA_POR_PREGUNTA: { contiene: string; bloque: Destino }[] = [
  { contiene: "sacrificar", bloque: "limites" },
  { contiene: "no quieres que crezca", bloque: "limites" },
  { contiene: "horas a la semana", bloque: "tiempo" },
  { contiene: "fuera del negocio", bloque: "tiempo" },
  { contiene: "que ya no haces", bloque: "rol_futuro" },
  // Desde el 16-10-2026 «qué haces tú… y qué ya no haces» son dos preguntas: la primera también es el rol futuro.
  { contiene: "que haces tu en el negocio", bloque: "rol_futuro" },
  { contiene: "postergando", bloque: "decisiones_pendientes" },
  { contiene: "debe cambiar", bloque: "decisiones_pendientes" },
  { contiene: "miedo soltar", bloque: "decisiones_pendientes" },
  { contiene: "mas te gusta hacer", bloque: "fortalezas" },
  { contiene: "funciona especialmente bien", bloque: "fortalezas" },
  { contiene: "orgulloso", bloque: "fortalezas" },
  { contiene: "nadie mas puede hacerlo", bloque: "dependencia" },
  { contiene: "se detuvo", bloque: "dependencia" },
  { contiene: "podria haber hecho alguien", bloque: "dependencia" },
  { contiene: "quien quisieras que te compre", bloque: "clientes_reputacion" },
  { contiene: "que le prometes", bloque: "clientes_reputacion" },
  { contiene: "dejar construido", bloque: "proposito" },
  { contiene: "mas te preocupa", bloque: "distancia" },
];

/** A qué parte de la ficha va una respuesta: por su clave de la entrada breve, por el texto de la pregunta o por el bloque del banco. */
export function bloqueDeRespuesta(r: Pick<RespuestaFila, "bloque" | "pregunta" | "clave_pregunta">): Destino | null {
  if (r.clave_pregunta && r.clave_pregunta in CLAVE_ENTRADA_A_FICHA) return CLAVE_ENTRADA_A_FICHA[r.clave_pregunta];
  const pregunta = sinAcentos(r.pregunta ?? "");
  for (const ruta of RUTA_POR_PREGUNTA) if (pregunta.includes(ruta.contiene)) return ruta.bloque;
  return r.bloque ? (BLOQUE_BANCO_A_FICHA[r.bloque] ?? null) : null;
}

/** Lo que ponen los botones de la entrada breve («Sí, es así.», «Lo respondo con el documento…»): no es una frase del dueño. */
const TEXTOS_DE_BOTON = new Set([TEXTO_CONFIRMA, TEXTO_DOCUMENTO]);

/** Hasta dónde se guarda la cita textual que acompaña a una afirmación. Una respuesta hablada puede ser muy larga. */
const LARGO_CITA = 400;

// ─── De quién es la voz ──────────────────────────────────────────────────────────────────────────

/**
 * De quién es la voz de una afirmación. A la ficha entra como declaración lo del DUEÑO (él o un socio) y lo que
 * dice un papel de la EMPRESA. Lo que dijo otra persona del equipo, lo que la consultora anotó en campo y lo que
 * no dice quién habla siguen siendo evidencia donde están, pero no son palabras del dueño.
 */
export type Voz = "dueno" | "empresa" | "otra_persona" | "consultora" | "sin_identificar";

export type FuenteFila = { id: string; tipo: string | null; origen: string | null; autor?: string | null };

export type Voces = {
  /** Los participantes que son el dueño o un socio, y quien respondió la entrada breve (que solo responde el dueño). */
  duenos: Set<string>;
  nombresDueno: string[];
  /** Las fuentes de las afirmaciones que no traen persona: su tipo, quién las subió y, si se sabe, su autor. */
  fuentes: Map<string, FuenteFila>;
};

/** Los papeles de la empresa: un documento, su foto o una tabla de datos. Una observación o una entrevista no lo son. */
const PAPELES_DE_LA_EMPRESA = new Set(["documento", "foto", "dato"]);

/**
 * La voz de una afirmación que no vino de una pregunta hecha al dueño. En orden:
 *  1. Si hay persona entrevistada, la voz es ESA persona (la misma regla de rules/evidencia.ts): el dueño o no.
 *  2. Una observación subida por la consultora es su nota de campo, hable de quien hable.
 *  3. Si la fuente dice quién la escribió, la voz es ese autor: el dueño o no.
 *  4. Un papel de la empresa sin autor escrito es voz de la empresa.
 *  5. Lo demás (una nota suelta, un audio sin persona, una fuente que no se pudo leer) no dice quién habla.
 * Ante la duda, no es del dueño.
 */
export function vozDe(c: Pick<ClaimFila, "participant_id" | "source_id">, v: Voces): Voz {
  if (c.participant_id) return v.duenos.has(String(c.participant_id)) ? "dueno" : "otra_persona";
  const f = c.source_id ? v.fuentes.get(String(c.source_id)) : undefined;
  if (!f) return "sin_identificar";
  if (f.tipo === "observacion" && f.origen === "consultor") return "consultora";
  const autor = f.autor?.trim();
  if (autor) return autorEsElDueno(autor, v.nombresDueno) ? "dueno" : "otra_persona";
  return f.tipo && PAPELES_DE_LA_EMPRESA.has(f.tipo) ? "empresa" : "sin_identificar";
}

/** Una afirmación sobre el futuro que NO entró a la ficha porque no es voz del dueño ni de un papel de la empresa. */
export type FueraDeLaFicha = { fuente: string; voz: Exclude<Voz, "dueno" | "empresa"> };

export type Clasificacion = { bloques: Bloques; dependencia_declarada: Item[]; fuentes_validas: Set<string>; fuera: FueraDeLaFicha[] };

/**
 * Las declaraciones: cada afirmación confirmada va al bloque de la pregunta que la originó; cada respuesta sin
 * afirmación todavía va igual, con su certeza. UNA RESPUESTA QUE YA TIENE AFIRMACIÓN NO SE REPITE: la afirmación
 * es la versión extraída y confirmada de lo mismo. Una confirmación de botón tampoco entra: lo que confirma ya
 * está en su fuente original. Un «no lo sé» sí entra, con su certeza, y no se puede citar como evidencia: la
 * falta de dato se ve, no se convierte en dato. La aspiración escrita en la ficha de la empresa es una declaración más.
 *
 * `respuestas` son SOLO las de las sesiones del dueño: quien llama las filtra. Una afirmación aspiracional que no
 * vino de una de esas preguntas entra únicamente si su voz es la del dueño o la de un papel de la empresa
 * (`vozDe`); las demás se devuelven en `fuera`, para avisar, y no entran. Sin `voces` no se sabe de quién es
 * nada: no entra ninguna.
 */
export function clasificarDeclaraciones(e: {
  claims: ClaimFila[];
  respuestas: RespuestaFila[];
  aspiracion: string | null;
  /** El texto de cada fragmento citado por una afirmación que no vino de una pregunta (un documento, por ejemplo). */
  fragmentos?: Map<string, string>;
  voces?: Voces;
}): Clasificacion {
  const bloques = bloquesVacios();
  const dependencia: Item[] = [];
  const validas = new Set<string>();
  const fuera: FueraDeLaFicha[] = [];
  const voces: Voces = e.voces ?? { duenos: new Set(), nombresDueno: [], fuentes: new Map() };
  const respuestaPorId = new Map(e.respuestas.map((r) => [r.id, r]));
  const conClaim = new Set<string>();

  const meter = (destino: Destino, it: Item) => {
    if (destino === "dependencia") dependencia.push(it);
    else bloques[destino].push(it);
  };

  for (const c of e.claims) {
    if (!c.texto?.trim()) continue;
    const r = c.response_id ? respuestaPorId.get(c.response_id) : undefined;
    if (c.response_id) conClaim.add(c.response_id);
    let destino: Destino | null = r ? bloqueDeRespuesta(r) : null;
    // Lo aspiracional que no vino de una pregunta de dirección (un documento, otra parte de la entrevista) también
    // es dirección, pero solo si lo dice el dueño o un papel de la empresa. Lo que quiere una empleada o lo que la
    // consultora anotó en campo no se le atribuye a él.
    if (!destino && c.temporalidad === "aspiracional") {
      const voz: Voz = r ? "dueno" : vozDe(c, voces);
      if (voz !== "dueno" && voz !== "empresa") {
        fuera.push({ fuente: `claim:${c.id}`, voz });
        continue;
      }
      destino = c.pilar === "marketing" ? "clientes_reputacion" : "empresa_deseada";
    }
    if (!destino) continue;
    const fuente = `claim:${c.id}`;
    validas.add(fuente);
    // La afirmación es un resumen del extractor; las palabras del dueño son la respuesta o el fragmento citado.
    const dicho = r?.respuesta?.trim();
    const literal = dicho && !TEXTOS_DE_BOTON.has(dicho) ? dicho : c.fragment_id ? (e.fragmentos?.get(c.fragment_id)?.trim() ?? null) : null;
    meter(
      destino,
      item(destino, c.texto, [fuente], {
        fecha: c.fecha_afirmacion ?? c.created_at ?? null,
        certeza: r?.certeza ?? null,
        sabida_por: r?.sabida_por ?? null,
        // Lo dijo conversando si hay pregunta o persona entrevistada; si no, salió de un papel.
        medio: r || c.participant_id ? "conversacion" : "material",
        cita: literal ? recorte(literal, LARGO_CITA) : null,
      })
    );
  }

  for (const r of e.respuestas) {
    const texto = r.respuesta?.trim();
    if (!texto || conClaim.has(r.id) || TEXTOS_DE_BOTON.has(texto)) continue;
    const destino = bloqueDeRespuesta(r);
    if (!destino) continue;
    const fuente = `respuesta:${r.id}`;
    if (r.certeza !== "no_lo_se") validas.add(fuente);
    meter(destino, item(destino, texto, [fuente], { fecha: r.respondido_at ?? null, certeza: r.certeza ?? null, sabida_por: r.sabida_por ?? null, medio: "conversacion", textual: true }));
  }

  if (e.aspiracion?.trim()) {
    // `companies.aspiracion` solo la escribe la consultora (PATCH /api/companies/[id]/modelo; la pantalla la llama «tu
    // declaración de diseño»). Entraba aquí como declaración textual, es decir, entre comillas y como si la hubiera
    // dicho el dueño. Ahora entra como lo que es: una frase que anotó la consultora, sin comillas, hasta que el dueño la acuerde.
    bloques.empresa_deseada.push(item("empresa_deseada", e.aspiracion, ["empresa:aspiracion"], { medio: "consultora" }));
    validas.add("empresa:aspiracion");
  }
  return { bloques, dependencia_declarada: dependencia, fuentes_validas: validas, fuera };
}

const COMO_SE_DICE_FUERA: Record<FueraDeLaFicha["voz"], [string, string]> = {
  otra_persona: ["de otra persona", "de otras personas"],
  consultora: ["de una nota de campo de la consultora", "de notas de campo de la consultora"],
  sin_identificar: ["de una fuente que no dice quién habla", "de fuentes que no dicen quién habla"],
};

/** Cuántas de las afirmaciones que quedaron fuera se citan en el aviso. Las demás se cuentan. */
const CITAS_DE_AVISO = 3;

/**
 * El aviso a la consultora cuando hay afirmaciones sobre el futuro que no entraron: cuántas y de quién son. Nada
 * falla en silencio: no son palabras del dueño, pero pueden importar para la dirección y ella decide qué hacer.
 * Es una nota de trabajo (el dueño no la ve, no pasa a la versión acordada y no se le manda al asistente).
 */
export function avisoDeFuera(fuera: FueraDeLaFicha[]): Item | null {
  if (!fuera.length) return null;
  const partes = (Object.keys(COMO_SE_DICE_FUERA) as FueraDeLaFicha["voz"][])
    .map((voz) => ({ voz, n: fuera.filter((x) => x.voz === voz).length }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${COMO_SE_DICE_FUERA[p.voz][p.n === 1 ? 0 : 1]}`);
  const una = fuera.length === 1;
  const texto =
    `${una ? "1 afirmación sobre el futuro no entró" : `${fuera.length} afirmaciones sobre el futuro no entraron`} como palabras del dueño: ${partes.join(", ")}. ` +
    `${una ? "Sigue" : "Siguen"} en Afirmaciones; si ${una ? "importa" : "alguna importa"} para la dirección, anótala aquí como interpretación.`;
  const citadas = fuera.slice(0, CITAS_DE_AVISO).map((x) => x.fuente);
  return item("empresa_deseada", texto, citadas, { tipo: "interpretacion", calculo: true, interno: true, aviso: true });
}

// ─── Los números: hoy y deseado ──────────────────────────────────────────────────────────────────

export type MetricaFila = { id: string; clave: string; periodo: string; valor: number | string | null; estado?: string | null; updated_at?: string | null };

/**
 * Una cifra lista para comparar, con de dónde sale. `cifra.periodo` es la BASE (al mes, a la semana, una foto), no
 * el mes del dato. `etiqueta` es como la lee la consultora; `etiqueta_cliente`, como se le dice al dueño (si falta, es la misma).
 */
export type Numero = { cifra: CifraFicha; etiqueta: string; etiqueta_cliente?: string; fuente: string; periodo_dato: string; estado: string | null };

export type ParDeNumeros = { hoy: Numero[]; deseado: Numero[] };

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/**
 * Los números de dirección: los que tiene sentido tener «hoy» y «meta». Cada uno dice en qué bloque se lee y
 * sobre qué base se expresa, que es lo que lo hace comparable. La consultora puede anotar cualquiera de ellos a
 * mano en la ficha (las horas del dueño, por ejemplo, no las registra nadie más). Cada uno tiene dos nombres: el
 * que lee la consultora («del dueño») y el que lee el dueño, que le habla de tú.
 */
export const CIFRAS_DE_DIRECCION: { clave: string; etiqueta: string; etiqueta_cliente: string; base: string; dinero: boolean; bloque: BloqueFicha }[] = [
  { clave: "venta_mes", etiqueta: "Ventas del mes", etiqueta_cliente: "Ventas del mes", base: "mes", dinero: true, bloque: "resultados_deseados" },
  { clave: "ganancia_mes", etiqueta: "Lo que queda libre al mes", etiqueta_cliente: "Lo que te queda libre al mes", base: "mes", dinero: true, bloque: "resultados_deseados" },
  { clave: "horas_semana", etiqueta: "Horas de trabajo del dueño a la semana", etiqueta_cliente: "Tus horas de trabajo a la semana", base: "semana", dinero: false, bloque: "tiempo" },
  { clave: "personas", etiqueta: "Personas en el equipo", etiqueta_cliente: "Personas en tu equipo", base: "puntual", dinero: false, bloque: "empresa_deseada" },
  { clave: "locales", etiqueta: "Locales", etiqueta_cliente: "Tus locales", base: "puntual", dinero: false, bloque: "empresa_deseada" },
];
export const CIFRA_POR_CLAVE = new Map(CIFRAS_DE_DIRECCION.map((c) => [c.clave, c]));

/** Las claves de la ficha de la empresa (`companies.ficha`) que dicen algo de hoy o algo deseado, en número. */
export const CLAVES_FICHA_NUMERICAS: { clave: string; cifra: string; momento: Momento }[] = [
  { clave: "venta_mensual", cifra: "venta_mes", momento: "hoy" },
  { clave: "meta_venta_mensual", cifra: "venta_mes", momento: "deseado" },
  { clave: "meta_ganancia_mensual", cifra: "ganancia_mes", momento: "deseado" },
  { clave: "personas", cifra: "personas", momento: "hoy" },
  { clave: "locales", cifra: "locales", momento: "hoy" },
  { clave: "horas_semana", cifra: "horas_semana", momento: "hoy" },
  { clave: "horas_semana_deseadas", cifra: "horas_semana", momento: "deseado" },
];

function aNumero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** La base temporal de una cifra: los `_mes` se expresan al mes; `caja_hoy` y las deudas son una foto. */
export function baseDe(clave: string): string {
  const propia = CIFRA_POR_CLAVE.get(clave)?.base;
  if (propia) return propia;
  if (clave.endsWith("_mes")) return "mes";
  if (clave.endsWith("_semana")) return "semana";
  return "puntual";
}

function etiquetaDeCifra(clave: string): string {
  return CIFRA_POR_CLAVE.get(clave)?.etiqueta ?? VITAL_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");
}

/** El nombre de la cifra como se le dice al dueño. Los nueve números del portal ya le hablan de tú («Lo que te deben»). */
function etiquetaClienteDeCifra(clave: string): string {
  return CIFRA_POR_CLAVE.get(clave)?.etiqueta_cliente ?? VITAL_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");
}

function esDinero(clave: string): boolean {
  return CIFRA_POR_CLAVE.get(clave)?.dinero ?? VITAL_POR_CLAVE.get(clave)?.unidad === "soles";
}

/** `moneda` es la de la empresa (ISO 4217). Lo que no es dinero (horas, personas) no lleva moneda. */
function cifraDe(clave: string, valor: number, moneda: string): CifraFicha {
  return { clave, valor, periodo: baseDe(clave), ...(esDinero(clave) ? { moneda } : {}) };
}

/**
 * El número más reciente de cada clave con valor, como cifra comparable. Un número descartado al revisar una
 * extracción o declarado «sin dato» no cuenta. El periodo del dato (2026-09) se conserva aparte: la cifra lleva
 * como `periodo` su base, que es lo que la hace comparable con lo deseado.
 */
export function numerosDeHoy(metricas: MetricaFila[], moneda: string = porDefecto.moneda): Numero[] {
  const porClave = new Map<string, { m: MetricaFila; valor: number; periodo: string }>();
  for (const m of metricas) {
    const valor = aNumero(m.valor);
    if (valor == null || m.estado === "descartado" || m.estado === "sin_dato") continue;
    const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
    if (periodo === "epoca_dorada") continue;
    const actual = porClave.get(clave);
    // Un mes concreto gana a «actual»; entre meses, el más reciente.
    const gana = !actual || (ES_MES.test(periodo) && (!ES_MES.test(actual.periodo) || periodo > actual.periodo));
    if (gana) porClave.set(clave, { m, valor, periodo });
  }
  return [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, { m, valor, periodo }]) => ({
      cifra: cifraDe(clave, valor, moneda),
      etiqueta: etiquetaDeCifra(clave),
      etiqueta_cliente: etiquetaClienteDeCifra(clave),
      fuente: `metrica:${m.id}`,
      periodo_dato: periodo,
      estado: m.estado ?? null,
    }));
}

/** Lo que la ficha de la empresa dice en número, hoy o deseado. Lo que no está, no está: no se inventa ni se pone cero. */
export function numerosDeFicha(ficha: Record<string, unknown> | null | undefined, moneda: string = porDefecto.moneda): ParDeNumeros {
  const salida: ParDeNumeros = { hoy: [], deseado: [] };
  for (const def of CLAVES_FICHA_NUMERICAS) {
    const valor = aNumero(ficha?.[def.clave]);
    if (valor == null) continue;
    salida[def.momento].push({
      cifra: cifraDe(def.cifra, valor, moneda),
      etiqueta: etiquetaDeCifra(def.cifra),
      etiqueta_cliente: etiquetaClienteDeCifra(def.cifra),
      fuente: `empresa:ficha.${def.clave}`,
      periodo_dato: def.momento === "hoy" ? "actual" : "deseado",
      estado: "declarado",
    });
  }
  return salida;
}

/** Los números que la consultora anotó a mano en la ficha (ítems con `cifra`), separados en hoy y deseado. */
export function numerosAnotados(bloques: Bloques): ParDeNumeros {
  const salida: ParDeNumeros = { hoy: [], deseado: [] };
  for (const b of BLOQUES_FICHA) {
    for (const i of vigentes(bloques[b])) {
      if (!i.cifra || !i.momento) continue;
      salida[i.momento].push({
        cifra: i.cifra,
        etiqueta: etiquetaDeCifra(i.cifra.clave),
        etiqueta_cliente: etiquetaClienteDeCifra(i.cifra.clave),
        fuente: i.fuentes[0] ?? "consultor:sin_id",
        periodo_dato: i.momento === "hoy" ? "actual" : "deseado",
        estado: "anotado",
      });
    }
  }
  return salida;
}

/**
 * Cuando hay dos números para lo mismo, cuál manda. HOY: el registrado (tiene periodo y estado) gana a lo que la
 * consultora anotó a mano, y eso gana a lo escrito al crear la empresa. DESEADO: lo anotado en la ficha de
 * dirección, que es donde se conversa la meta, gana a lo escrito al crear la empresa.
 */
export function elegirNumeros(e: { metricas: Numero[]; de_ficha: ParDeNumeros; anotados: ParDeNumeros }): ParDeNumeros {
  const primero = (listas: Numero[][]): Numero[] => {
    const por = new Map<string, Numero>();
    for (const lista of listas) for (const n of lista) if (!por.has(n.cifra.clave)) por.set(n.cifra.clave, n);
    return [...por.values()].sort((a, b) => a.cifra.clave.localeCompare(b.cifra.clave));
  };
  return { hoy: primero([e.metricas, e.anotados.hoy, e.de_ficha.hoy]), deseado: primero([e.anotados.deseado, e.de_ficha.deseado]) };
}

/**
 * Cómo se escribe un valor. EL DINERO VA EN LA MONEDA DE LA EMPRESA, con su símbolo y sus separadores
 * (src/lib/formato.ts): «S/ 40,000» en Perú, «$ 40.000.000» en Colombia. Hasta el 13-10-2026 todo lo que no era
 * dólar se escribía «S/», y una empresa en pesos leía sus ventas en soles. Una cifra en una moneda que no es la
 * de la empresa sale con su código («USD 20,000»). Si la base guarda un código que no se reconoce, la ficha no se
 * cae ni inventa un símbolo: lo escribe tal cual está. Lo que no es dinero lleva solo los separadores del país.
 */
function textoValor(cifra: CifraFicha, formato: ConfigEmpresa, valor = cifra.valor): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  if (!cifra.moneda) return escribirNumero(valor, formato, { decimales });
  if (!esMonedaValida(cifra.moneda)) return `${cifra.moneda} ${escribirNumero(valor, formato, { decimales })}`;
  return escribirMoneda(valor, { ...formato, moneda: cifra.moneda }, { decimales });
}

/**
 * La frase de un número en su bloque («Hoy: …», «Meta: …»), como la lee la consultora y, cuando el nombre de la
 * cifra cambia para el dueño («Tus horas de trabajo a la semana»), como la lee él.
 */
function fraseDeNumero(n: Pick<Numero, "etiqueta" | "etiqueta_cliente">, momento: Momento, valor: string): { texto: string; extra: Pick<Item, "texto_cliente"> } {
  const rotulo = momento === "hoy" ? "Hoy" : "Meta";
  const texto = `${rotulo}: ${n.etiqueta} ${valor}`;
  const paraElDueno = `${rotulo}: ${n.etiqueta_cliente ?? n.etiqueta} ${valor}`;
  return { texto, extra: paraElDueno !== texto ? { texto_cliente: paraElDueno } : {} };
}

/** El número con lo que hace falta para leerlo bien: de qué mes es y, si no lo contó el dueño, cómo llegó. */
export function textoCifra(n: Numero, formato: ConfigEmpresa = porDefecto): string {
  const cuando = ES_MES.test(n.periodo_dato) ? ` (${nombreDePeriodo(n.periodo_dato)})` : "";
  const comoLlego = n.estado && !["contado", "declarado", "anotado"].includes(n.estado) ? `, ${etiquetaEstado(n.estado)}` : "";
  return `${textoValor(n.cifra, formato)}${cuando}${comoLlego}`;
}

// ─── Distancia ───────────────────────────────────────────────────────────────────────────────────

export type ComparacionNumerica = {
  clave: string;
  etiqueta: string;
  hoy: Numero | null;
  deseado: Numero | null;
  comparable: boolean;
  /** Por qué se puede o no se puede comparar, como lo dice la regla de finanzas. */
  motivo: string;
  diferencia: number | null;
  /** La comparación como la lee la consultora. */
  texto: string;
  /** La misma comparación dicha al dueño: su cifra en segunda persona y el motivo en palabras llanas. */
  texto_cliente: string;
};

export type FraseCitada = { texto: string; fuente: string };
export type TextoDePilar = { pilar: string; hoy: FraseCitada[]; deseada: FraseCitada[] };
export type ComparacionTexto = TextoDePilar & { comparable: boolean; texto: string };

export type Distancia = { numeros: ComparacionNumerica[]; texto: ComparacionTexto[] };

/** Las áreas de la empresa por las que se agrupan las afirmaciones. Nombre para la consultora. */
export const NOMBRE_PILAR: Record<string, string> = { personas: "Personas", procesos: "Procesos", producto: "Producto", marketing: "Marketing" };

/**
 * Hoy y deseado son LA MISMA cifra en dos momentos: comparten clave y base. `comparables()` de finanzas juzga la
 * base (periodo) y la moneda; que sea la misma clave se exige aquí, porque para finanzas dos claves iguales
 * serían una duplicación al sumar y aquí son un antes y un después.
 */
export function comparablesHoyDeseado(hoy: CifraFicha, deseado: CifraFicha): { ok: boolean; motivo: string } {
  if (hoy.clave !== deseado.clave) return { ok: false, motivo: `no son la misma cifra: hoy «${hoy.clave}», deseada «${deseado.clave}»` };
  // `comparables` solo mira si las dos monedas son la misma: le da igual cuál sea. Su tipo todavía dice «PEN | USD».
  return comparables({ ...hoy, clave: `${hoy.clave}:hoy` } as Cifra, { ...deseado, clave: `${deseado.clave}:deseado` } as Cifra);
}

const NOMBRE_BASE: Record<string, string> = { dia: "por día", semana: "por semana", mes: "por mes", anio: "por año", puntual: "de un solo momento" };

/**
 * Por qué dos cifras no se pueden comparar, dicho al dueño. La decisión ya la tomó la regla de finanzas; aquí solo
 * se pone en palabras llanas: sin códigos de moneda ni nombres de campo. Las monedas se ven en las propias cifras.
 */
function motivoLlano(hoy: CifraFicha, deseado: CifraFicha): string {
  if (hoy.clave === deseado.clave && hoy.periodo !== deseado.periodo) {
    const a = NOMBRE_BASE[hoy.periodo];
    const b = NOMBRE_BASE[deseado.periodo];
    return a && b ? `la cifra de hoy es ${a} y la meta es ${b}` : "no cubren el mismo tiempo";
  }
  if (hoy.clave === deseado.clave && (hoy.moneda ?? null) !== (deseado.moneda ?? null)) return "están en monedas distintas";
  return "no miden lo mismo";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La distancia entre lo que hay y lo que quiere. EN NÚMERO, cuando hay dos cifras comparables (misma cifra,
 * misma base, misma moneda): se dice cuánto falta subir o bajar, en la unidad de la cifra y sin porcentajes.
 * Si falta un lado se dice «sin dato» y no hay diferencia: la falta de dato nunca es cero. Si las dos cifras no
 * son comparables, se dice por qué y tampoco hay diferencia. EN TEXTO, por área: lo que el dueño dijo querer,
 * citado, y cuántas afirmaciones confirmadas hay sobre hoy. Emparejar una frase de hoy con una deseada es
 * interpretar, y eso no lo hace el código.
 */
export function distancia(e: ParDeNumeros & { texto?: TextoDePilar[] }, formato: ConfigEmpresa = porDefecto): Distancia {
  // Solo se compara lo que tiene meta, o lo que es un número de dirección aunque todavía no la tenga.
  const claves = [...new Set([...e.deseado.map((n) => n.cifra.clave), ...e.hoy.map((n) => n.cifra.clave).filter((c) => CIFRA_POR_CLAVE.has(c))])].sort();
  const numeros: ComparacionNumerica[] = claves.map((clave) => {
    const hoy = e.hoy.find((n) => n.cifra.clave === clave) ?? null;
    const deseado = e.deseado.find((n) => n.cifra.clave === clave) ?? null;
    const etiqueta = deseado?.etiqueta ?? hoy?.etiqueta ?? clave;
    const paraElDueno = deseado?.etiqueta_cliente ?? hoy?.etiqueta_cliente ?? etiqueta;
    const base = { clave, etiqueta, hoy, deseado, comparable: false, diferencia: null };
    // Lo que sigue a la etiqueta se escribe una vez y se le antepone el nombre que lee cada uno.
    const dosVoces = (resto: string, restoCliente = resto) => ({ texto: `${etiqueta}: ${resto}`, texto_cliente: `${paraElDueno}: ${restoCliente}` });
    if (!hoy && deseado) return { ...base, motivo: "falta la cifra de hoy", ...dosVoces(`hoy ${TEXTO_SIN_DATO} · meta ${textoCifra(deseado, formato)}`) };
    if (hoy && !deseado) return { ...base, motivo: "falta la cifra deseada", ...dosVoces(`hoy ${textoCifra(hoy, formato)} · meta ${TEXTO_SIN_DATO}`) };
    if (!hoy || !deseado) return { ...base, motivo: "sin cifras", ...dosVoces(TEXTO_SIN_DATO) };
    const lasDos = `hoy ${textoCifra(hoy, formato)} · meta ${textoCifra(deseado, formato)}`;
    const c = comparablesHoyDeseado(hoy.cifra, deseado.cifra);
    if (!c.ok) {
      return { ...base, motivo: c.motivo, ...dosVoces(`${lasDos} · no se pueden comparar: ${c.motivo}`, `${lasDos} · no se pueden comparar: ${motivoLlano(hoy.cifra, deseado.cifra)}`) };
    }
    const diferencia = deseado.cifra.valor - hoy.cifra.valor;
    const cuanto = diferencia === 0 ? "ya está en la meta" : `falta ${diferencia > 0 ? "subir" : "bajar"} ${textoValor(hoy.cifra, formato, Math.abs(diferencia))}`;
    return { ...base, comparable: true, motivo: c.motivo, diferencia, ...dosVoces(`${lasDos} · ${cuanto}`) };
  });

  const texto: ComparacionTexto[] = (e.texto ?? [])
    .filter((t) => t.hoy.length || t.deseada.length)
    .map((t) => {
      const nombre = NOMBRE_PILAR[t.pilar] ?? t.pilar;
      const quiere = t.deseada.length ? `quiere «${recorte(t.deseada[0].texto)}»${t.deseada.length > 1 ? ` (y ${t.deseada.length - 1} más)` : ""}` : "";
      const sobreHoy = plural(t.hoy.length, "afirmación confirmada", "afirmaciones confirmadas");
      if (!t.deseada.length) return { ...t, comparable: false, texto: `${nombre}: hay ${sobreHoy} sobre hoy y ninguna sobre lo que quiere: falta preguntarlo` };
      if (!t.hoy.length) return { ...t, comparable: false, texto: `${nombre}: ${quiere} · sobre hoy no hay afirmaciones confirmadas: no se puede medir la distancia` };
      return { ...t, comparable: true, texto: `${nombre}: ${quiere} · sobre hoy hay ${sobreHoy}` };
    });
  return { numeros, texto };
}

/** Las afirmaciones confirmadas agrupadas por área: lo actual y lo aspiracional, cada una con su fuente. */
export function textoPorPilar(claims: ClaimFila[]): TextoDePilar[] {
  const por = new Map<string, { hoy: FraseCitada[]; deseada: FraseCitada[] }>();
  for (const c of claims) {
    if (!c.pilar || c.pilar === "transversal" || !c.texto?.trim()) continue;
    const g = por.get(c.pilar) ?? { hoy: [], deseada: [] };
    const frase = { texto: c.texto, fuente: `claim:${c.id}` };
    if (c.temporalidad === "aspiracional") g.deseada.push(frase);
    else if (c.temporalidad === "actual") g.hoy.push(frase);
    por.set(c.pilar, g);
  }
  return [...por.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pilar, g]) => ({ pilar, ...g }));
}

/** Cuántas frases se citan como fuente de una cuenta por área. Las demás se cuentan. */
const CITAS_POR_PILAR = 3;

/**
 * Los ítems del bloque distancia que salen de la comparación. Son cálculo del sistema: una comparación en número
 * lleva sus dos fuentes; una cuenta por área lleva las frases deseadas que cita y es nota de trabajo de la
 * consultora (`interno`): al dueño no se le muestra un área de método, se le muestra lo que ella escriba con eso.
 */
export function itemsDeDistancia(d: Distancia): Item[] {
  const numeros = d.numeros.map((n) => {
    const fuentes = [n.hoy?.fuente, n.deseado?.fuente].filter((f): f is string => !!f);
    return item("distancia", n.texto, fuentes, { tipo: "interpretacion", calculo: true, ...(n.texto_cliente !== n.texto ? { texto_cliente: n.texto_cliente } : {}) });
  });
  const texto = d.texto.map((t) => {
    // Se citan las frases deseadas; si no hay ninguna, las de hoy que se contaron. Ningún ítem queda sin fuente.
    const citadas = (t.deseada.length ? t.deseada : t.hoy).slice(0, CITAS_POR_PILAR).map((f) => f.fuente);
    return item("distancia", t.texto, citadas, { tipo: "interpretacion", calculo: true, interno: true, pilar: t.pilar });
  });
  return [...numeros, ...texto];
}

// ─── El dueño en los procesos: se cuenta, no se puntúa ──────────────────────────────────────────

export type ProcesoFila = { id: string; nombre: string };
export type NodoFila = { process_id: string; tipo: string | null; etiqueta?: string | null; responsable: string | null; rol?: string | null };

const PALABRAS_DUENO = ["dueno", "duena", "propietario", "propietaria", "yo mismo", "yo misma", "el jefe", "la jefa", "gerente general"];

/** ¿Este texto nombra al dueño? Por su nombre (completo o primer nombre de 3+ letras) o por cómo lo llama la empresa. */
export function nombraAlDueno(texto: string | null | undefined, nombresDueno: string[]): boolean {
  const t = sinAcentos(texto ?? "").trim();
  if (!t) return false;
  for (const n of nombresDueno) {
    const completo = sinAcentos(n).trim();
    if (!completo) continue;
    if (t.includes(completo)) return true;
    const primero = completo.split(/\s+/)[0];
    if (primero.length >= 3 && new RegExp(`(^|[^a-z])${primero.replace(/[^a-z0-9]/g, "")}([^a-z]|$)`).test(t)) return true;
  }
  return PALABRAS_DUENO.some((p) => new RegExp(`(^|[^a-z])${p}([^a-z]|$)`).test(t));
}

/**
 * ¿El autor escrito en una fuente es el dueño? Mucho más estricto que `nombraAlDueno`, que sirve para leer el
 * responsable de un paso: aquí el autor tiene que SER el dueño, no nombrarlo. Vale su nombre completo, su nombre
 * de pila si es todo lo que se escribió, o cómo lo llama la empresa («el dueño», «gerente general») y nada más.
 * «Carlos Pérez» no es «Carlos Rojas»; «la secretaria de Carlos Rojas» y «el asistente del gerente general»
 * tampoco. Un papel firmado entre varios no se le atribuye a él solo.
 */
function autorEsElDueno(autor: string, nombresDueno: string[]): boolean {
  const a = sinAcentos(autor).replace(/[.,;]/g, " ").replace(/\s+/g, " ").trim();
  if (!a) return false;
  for (const n of nombresDueno) {
    const completo = sinAcentos(n).replace(/\s+/g, " ").trim();
    if (!completo) continue;
    if (a === completo) return true;
    if (a.length >= 3 && a === completo.split(" ")[0]) return true;
  }
  return PALABRAS_DUENO.some((p) => a === p || a === `el ${p}` || a === `la ${p}`);
}

/**
 * Cuántos procesos del mapa tienen al dueño como ejecutor de algún paso, y en cuántos es el ÚNICO que decide
 * (todas las decisiones del proceso son suyas). Es un dato descriptivo: la frase dice «6 de 8», jamás un porcentaje.
 */
export function contarProcesosDelDueno(e: { procesos: ProcesoFila[]; nodos: NodoFila[]; nombresDueno: string[] }): ConteoProcesos {
  const conDueno: string[] = [];
  const decideSolo: string[] = [];
  for (const p of e.procesos) {
    const nodos = e.nodos.filter((n) => n.process_id === p.id);
    const suyos = nodos.filter((n) => nombraAlDueno(n.responsable, e.nombresDueno) || nombraAlDueno(n.rol, e.nombresDueno));
    if (!suyos.length) continue;
    conDueno.push(p.nombre);
    const decisiones = nodos.filter((n) => n.tipo === "decision");
    if (decisiones.length && decisiones.every((n) => suyos.includes(n))) decideSolo.push(p.nombre);
  }
  const total = e.procesos.length;
  const procesos = total === 1 ? "proceso" : "procesos";
  let texto: string;
  if (total === 0) texto = "todavía no hay procesos en el mapa: no se puede contar en cuántos participa el dueño";
  else if (!conDueno.length) texto = `no figura como responsable en ninguno de los ${total} ${procesos} del mapa`;
  else texto = `participa en ${conDueno.length} de ${total} ${procesos} del mapa; en ${decideSolo.length} de ellos es el único que decide`;
  return { total, con_dueno: conDueno.length, decide_solo: decideSolo.length, nombres_con_dueno: conDueno, nombres_decide_solo: decideSolo, texto };
}

/** El mismo conteo, dicho al dueño. Solo cuenta: no califica. */
export function textoProcesosCliente(c: ConteoProcesos): string | null {
  if (!c.total) return null;
  const dibujados = `Hemos dibujado ${plural(c.total, "proceso", "procesos")} de tu empresa.`;
  if (!c.con_dueno) return `${dibujados} En ninguno figuras tú como la persona que hace el trabajo.`;
  const decide = c.decide_solo ? ` y en ${c.decide_solo} eres la única persona que decide` : "";
  return `${dibujados} Tú participas en ${c.con_dueno}${decide}.`;
}

// ─── Armar el borrador desde la base ─────────────────────────────────────────────────────────────

/** Lo que `armarBorrador` leyó, para que el asistente reciba exactamente lo mismo que la ficha, con sus ids. */
export type Evidencia = {
  claims: ClaimFila[];
  respuestas: RespuestaFila[];
  /** Números registrados con valor (company_metricas). */
  metricas: Numero[];
  /** Lo que la ficha de la empresa dice en número. */
  de_ficha: ParDeNumeros;
  texto_por_pilar: TextoDePilar[];
  /** Las únicas fuentes que una interpretación puede citar. */
  fuentes_validas: Set<string>;
};

export type Borrador = { ficha: Ficha; evidencia: Evidencia; empresa: { nombre: string; moneda: string; formato: ConfigEmpresa } };

type Lector = Pick<SupabaseClient, "from">;

function filas<T>(r: { data: unknown; error: { message: string } | null }, que: string): T[] {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? []) as T[];
}

/**
 * Rehace lo que el código calcula en el bloque distancia con los números que hay AHORA: los registrados, los de
 * la ficha de la empresa y los que la consultora anotó a mano en esta ficha. Lo que ella corrigió o descartó de
 * un cálculo anterior se respeta; lo demás se sustituye, porque un cálculo viejo con números nuevos es un error.
 */
function aplicarDistancia(bloques: Bloques, ev: Pick<Evidencia, "metricas" | "de_ficha" | "texto_por_pilar">, formato: ConfigEmpresa): Bloques {
  const numeros = elegirNumeros({ metricas: ev.metricas, de_ficha: ev.de_ficha, anotados: numerosAnotados(bloques) });
  const calculados = itemsDeDistancia(distancia({ ...numeros, texto: ev.texto_por_pilar }, formato));
  const conservados = bloques.distancia.filter((i) => !(i.origen === "sistema" && i.calculo && !i.revisado_por && !i.descartado));
  const ids = new Set(conservados.map((i) => i.id));
  return { ...bloques, distancia: [...calculados.filter((i) => !ids.has(i.id)), ...conservados] };
}

/** Las sesiones que se le hacen al dueño. Que sean suyas lo decide además quién las respondió. */
const SESIONES_DEL_DUENO = ["sueno_dueno", "empresa_dueno", "entrada_breve"];

/**
 * El tipo, el origen y el autor de las fuentes cuya voz hay que decidir. `autor` llega con
 * migracion-evidencia-dimensiones.sql: en una base que todavía no la tiene se lee sin él, y la voz se decide por
 * el tipo y el origen. Si tampoco así se pueden leer, el error se dice: no se arma una ficha sin saber de quién es cada frase.
 */
async function leerFuentes(ids: string[], sb: Lector): Promise<Map<string, FuenteFila>> {
  const mapa = new Map<string, FuenteFila>();
  if (!ids.length) return mapa;
  const conAutor = await sb.from("sources").select("id,tipo,origen,autor").in("id", ids);
  const leidas = conAutor.error
    ? filas<FuenteFila>(await sb.from("sources").select("id,tipo,origen").in("id", ids), "las fuentes")
    : filas<FuenteFila>(conAutor, "las fuentes");
  for (const f of leidas) mapa.set(String(f.id), f);
  return mapa;
}

/**
 * El borrador se arma SOLO con lo que ya hay: afirmaciones confirmadas de los bloques del banco, respuestas de la
 * entrada breve con su certeza, números con valor, la aspiración escrita y los procesos donde el dueño ejecuta.
 * Nada se pregunta de nuevo, nada se inventa. Lo que no hay queda vacío y la pantalla lo dice. Y solo entra como
 * declaración lo que es voz del dueño o de un papel de la empresa: de lo demás queda un aviso con la cuenta.
 */
export async function armarBorrador(companyId: string, sb: Lector): Promise<Borrador> {
  const { data: empresa, error: eEmpresa } = await sb.from("companies").select("id,nombre,aspiracion,ficha,pais,moneda,idioma,zona_horaria").eq("id", companyId).maybeSingle();
  if (eEmpresa) throw new Error(`No se pudo leer la empresa: ${eEmpresa.message}`);
  if (!empresa) throw new Error("La empresa no existe.");
  const formato = formatoDeEmpresa(empresa as Record<string, unknown>);
  const moneda = formato.moneda;

  const [duenosFilas, sesiones] = await Promise.all([
    sb.from("participants").select("id,nombre,rol").eq("company_id", companyId).in("rol", ["dueno", "socio"]).then((r) => filas<{ id: string; nombre: string }>(r, "los dueños")),
    sb.from("interview_sessions").select("id,tipo,participant_id").eq("company_id", companyId).then((r) => filas<{ id: string; tipo: string; participant_id: string | null }>(r, "las sesiones")),
  ]);
  // La entrada breve solo la responde quien es dueño de la empresa (src/lib/entrada.ts): su participante también es su voz.
  const duenos = new Set(duenosFilas.map((p) => String(p.id)));
  for (const s of sesiones) if (s.tipo === "entrada_breve" && s.participant_id) duenos.add(String(s.participant_id));
  // Una sesión «del dueño» que respondió otra persona no es su voz: sus respuestas no entran.
  const sesionIds = sesiones.filter((s) => SESIONES_DEL_DUENO.includes(s.tipo) && !!s.participant_id && duenos.has(String(s.participant_id))).map((s) => s.id);

  const [respuestas, claims, metricasFilas, procesos] = await Promise.all([
    sesionIds.length
      ? sb
          .from("interview_responses")
          .select("id,session_id,bloque,pregunta,respuesta,certeza,sabida_por,clave_pregunta,respondido_at")
          .in("session_id", sesionIds)
          .not("respuesta", "is", null)
          .limit(500)
          .then((r) => filas<RespuestaFila>(r, "las respuestas"))
      : Promise.resolve([] as RespuestaFila[]),
    sb
      .from("claims")
      .select("id,texto,pilar,temporalidad,fecha_afirmacion,response_id,source_id,fragment_id,participant_id,created_at")
      .eq("company_id", companyId)
      .eq("estado", "confirmado")
      .order("created_at", { ascending: true })
      .limit(500)
      .then((r) => filas<ClaimFila>(r, "las afirmaciones")),
    sb.from("company_metricas").select("id,clave,periodo,valor,estado,updated_at").eq("company_id", companyId).not("valor", "is", null).limit(300).then((r) => filas<MetricaFila>(r, "los números")),
    sb.from("processes").select("id,nombre").eq("company_id", companyId).eq("version", "as_is").then((r) => filas<ProcesoFila>(r, "los procesos")),
  ]);
  const nodos = procesos.length
    ? await sb.from("process_nodes").select("process_id,tipo,etiqueta,responsable,rol").in("process_id", procesos.map((p) => p.id)).then((r) => filas<NodoFila>(r, "los pasos de los procesos"))
    : [];

  // Lo que no vino de una pregunta hecha al dueño (un documento, otra entrevista) necesita dos cosas más: sus
  // palabras textuales, que están en el fragmento citado, y de quién es la voz, que lo dice la fuente cuando no
  // hay persona entrevistada. Si el fragmento no se puede leer, la afirmación entra igual, sin cita: la cita
  // acompaña, no decide. La voz sí decide: sin ella no entra.
  const respuestaIds = new Set(respuestas.map((r) => r.id));
  const sinPregunta = claims.filter((c) => !(c.response_id && respuestaIds.has(c.response_id)));
  const fragmentoIds = [...new Set(sinPregunta.filter((c) => c.fragment_id).map((c) => String(c.fragment_id)))];
  const fragmentos = new Map<string, string>();
  if (fragmentoIds.length) {
    const { data: frs, error: eFrs } = await sb.from("source_fragments").select("id,texto").in("id", fragmentoIds);
    if (!eFrs) for (const f of (frs ?? []) as { id: string; texto: string | null }[]) if (f.texto?.trim()) fragmentos.set(String(f.id), f.texto);
  }
  const porSuFuente = sinPregunta.filter((c) => c.temporalidad === "aspiracional" && !c.participant_id && c.source_id);
  const nombresDueno = duenosFilas.map((p) => p.nombre);
  const voces: Voces = { duenos, nombresDueno, fuentes: await leerFuentes([...new Set(porSuFuente.map((c) => String(c.source_id)))], sb) };

  const clasificacion = clasificarDeclaraciones({ claims, respuestas, aspiracion: (empresa.aspiracion as string | null) ?? null, fragmentos, voces });
  const metricas = numerosDeHoy(metricasFilas, moneda);
  const de_ficha = numerosDeFicha((empresa.ficha as Record<string, unknown> | null) ?? null, moneda);
  // Lo que quiere otra persona tampoco se cuenta como «lo que quiere» la empresa en las cuentas por área.
  const ajenas = new Set(clasificacion.fuera.map((x) => x.fuente));
  const texto_por_pilar = textoPorPilar(claims.filter((c) => !ajenas.has(`claim:${c.id}`)));

  const bloques = clasificacion.bloques;
  const aviso = avisoDeFuera(clasificacion.fuera);
  if (aviso) bloques.empresa_deseada.push(aviso);

  // Los números también se leen en su bloque, marcados «Hoy» o «Meta», para no confundir lo que hay con lo que quiere.
  const numeros = elegirNumeros({ metricas, de_ficha, anotados: { hoy: [], deseado: [] } });
  const bloqueDe = (n: Numero): BloqueFicha => CIFRA_POR_CLAVE.get(n.cifra.clave)?.bloque ?? "resultados_deseados";
  const medioDe = (n: Numero): Medio => (n.fuente.startsWith("metrica:") ? "numero" : "empresa");
  const enSuBloque = (n: Numero, momento: Momento): Item => {
    const partes = fraseDeNumero(n, momento, textoCifra(n, formato));
    return item(bloqueDe(n), partes.texto, [n.fuente], { momento, medio: medioDe(n), ...partes.extra });
  };
  for (const n of numeros.hoy) bloques[bloqueDe(n)].push(enSuBloque(n, "hoy"));
  for (const n of numeros.deseado) bloques[bloqueDe(n)].push(enSuBloque(n, "deseado"));

  const fuentes_validas = new Set(clasificacion.fuentes_validas);
  for (const n of [...numeros.hoy, ...numeros.deseado]) fuentes_validas.add(n.fuente);
  const evidencia: Evidencia = { claims, respuestas, metricas, de_ficha, texto_por_pilar, fuentes_validas };

  return {
    ficha: {
      bloques: aplicarDistancia(bloques, evidencia, formato),
      dependencia: {
        dimensiones: dimensionesVacias(),
        procesos: contarProcesosDelDueno({ procesos, nodos, nombresDueno }),
        declaraciones: clasificacion.dependencia_declarada,
        interpretaciones: { pendiente: false, motivo: null, at: null },
      },
    },
    evidencia,
    empresa: { nombre: String(empresa.nombre ?? ""), moneda, formato },
  };
}

// ─── Fusionar: lo del sistema se rehace; lo que la consultora tocó y lo que el asistente propuso se conserva ───

/** Lo que el sistema NO rehace: lo que escribieron la consultora o el asistente, y lo que ella revisó o descartó. */
function seConserva(i: Item): boolean {
  return i.origen !== "sistema" || !!i.revisado_por || !!i.descartado;
}

/**
 * Junta la ficha que ya había (el borrador, o la versión acordada cuando se abre un borrador nuevo) con lo que
 * la base dice hoy. Las declaraciones y los cálculos del sistema se rehacen; lo que la consultora corrigió,
 * anotó o descartó, las propuestas del asistente y las dimensiones ya descritas se quedan como estaban.
 */
export function fusionar(existente: Ficha | null, nuevo: Borrador): Ficha {
  if (!existente) return nuevo.ficha;
  const bloques = bloquesVacios();
  for (const b of BLOQUES_FICHA) {
    const previos = (existente.bloques?.[b] ?? []).filter(seConserva);
    const ids = new Set(previos.map((i) => i.id));
    bloques[b] = [...nuevo.ficha.bloques[b].filter((i) => !ids.has(i.id)), ...previos];
  }
  const dimensiones = dimensionesVacias();
  for (const d of DIMENSIONES_DEPENDENCIA) {
    const previa = existente.dependencia?.dimensiones?.[d];
    dimensiones[d] = previa?.origen ? { ...dimensionVacia(), ...previa } : nuevo.ficha.dependencia.dimensiones[d];
  }
  return {
    bloques: aplicarDistancia(bloques, nuevo.evidencia, nuevo.empresa.formato),
    dependencia: {
      dimensiones,
      procesos: nuevo.ficha.dependencia.procesos,
      declaraciones: nuevo.ficha.dependencia.declaraciones,
      interpretaciones: existente.dependencia?.interpretaciones ?? nuevo.ficha.dependencia.interpretaciones,
    },
  };
}

// ─── Lo que el asistente puede proponer, y cómo entra ───────────────────────────────────────────

const BLOQUES_INTERPRETABLES = BLOQUES_FICHA.filter((b) => b !== "distancia") as [BloqueFicha, ...BloqueFicha[]];

const DimensionSalida = z
  .object({
    que_se_detiene: z.string().trim().max(300).nullable(),
    podria_delegarse: z.string().trim().max(300).nullable(),
    capacidad_falta: z.string().trim().max(300).nullable(),
    aporta_valor: z.string().trim().max(300).nullable(),
    evidencia: z.array(z.string().trim().min(1).max(80)).max(12),
    sin_evidencia: z.boolean(),
  })
  .strict()
  .refine((d) => d.sin_evidencia || d.evidencia.length > 0, { message: "cada dimensión cita evidencia o declara sin_evidencia" })
  .refine((d) => !d.sin_evidencia || d.evidencia.length === 0, { message: "sin_evidencia y evidencia no van juntos" });

/**
 * La salida del DIRECTOR, estricta: una interpretación sin claim_ids no entra; una dimensión sin evidencia tiene
 * que decirlo. Ningún campo numérico: aquí no cabe un porcentaje de dependencia.
 */
export const SalidaDirector = z
  .object({
    interpretaciones: z
      .array(
        z
          .object({
            bloque: z.enum(BLOQUES_INTERPRETABLES),
            texto: z.string().trim().min(5).max(400),
            claim_ids: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
          })
          .strict()
      )
      .max(30),
    dependencia: z.object(Object.fromEntries(DIMENSIONES_DEPENDENCIA.map((d) => [d, DimensionSalida])) as Record<DimensionClave, typeof DimensionSalida>).strict(),
  })
  .strict();

export type SalidaDirectorT = z.infer<typeof SalidaDirector>;

/**
 * ¿El texto convierte la dependencia en una medida? «80 %», «índice de…», «grado de dependencia», «nivel 4 de 5».
 * El conteo «participa en 6 de 8 procesos» no cae aquí: describe, y además no lo escribe el asistente.
 */
export function mideLaDependencia(texto: string): boolean {
  return /\d\s*%|por\s?ciento|porcentaje|indice de|(grado|nivel|puntaje|puntuacion|score) (de )?(dependencia|\d)/.test(sinAcentos(texto));
}

/**
 * ¿El texto califica a la persona en vez de describir a la empresa? Es una red de palabras, no un juez: atrapa
 * lo más común («controlador», «no sabe delegar») y deja el resto a la revisión de la consultora, que es
 * obligatoria antes de acordar.
 */
export function juzgaALaPersona(texto: string): boolean {
  return /controlador|no sabe delegar|incapaz|desconfiad|micromanag|microgestion|soberbi|terc[oa]\b|autoritari|irresponsable|adict[oa] al trabajo|lider ausente|mal (jefe|lider)|obsesiv|su culpa|por culpa de(l)? (dueno|duena|propietari)/.test(
    sinAcentos(texto)
  );
}

/**
 * Un id citado vale si es una fuente que la ficha conoce. Las fuentes válidas llevan prefijo (claim:, respuesta:,
 * metrica:); si el modelo cita el id pelado se busca con cada prefijo, porque un id de afirmación y uno de
 * respuesta son los dos UUID y a simple vista no se distinguen.
 */
function fuenteCitada(id: string, validas: Set<string>): string | null {
  if (validas.has(id)) return id;
  for (const prefijo of ["claim", "respuesta", "metrica"]) if (validas.has(`${prefijo}:${id}`)) return `${prefijo}:${id}`;
  return null;
}

export type Descarte = { donde: string; texto: string; motivo: string };

export const MOTIVO_MIDE_EN_BLOQUE = "trae un porcentaje o un índice: la dependencia se describe, no se puntúa, y los números de la ficha no los pone el asistente";

/**
 * Las propuestas del asistente entran como INTERPRETACIÓN con origen «director», nunca como declaración, y solo
 * si cada fuente citada existe. Lo que cita algo que no está, lo que mide la dependencia con un número y lo que
 * califica a la persona se descarta y se dice por qué: nada se inventa, nada falla en silencio. Una dimensión
 * sin evidencia queda vacía y lo dice («sin evidencia»): un texto que nadie puede sostener no entra.
 * EL FILTRO DE MEDIDA VALE EN TODA LA SALIDA, no solo en las ocho dimensiones: «la empresa depende en un 80 % del
 * dueño» escrito como interpretación de un bloque se descarta igual. Un porcentaje que el dueño sí dijo ya está
 * en su declaración; el asistente no pone números en la ficha.
 * Las propuestas anteriores que nadie revisó se sustituyen; lo que la consultora revisó, escribió o descartó se respeta.
 */
export function incorporarInterpretaciones(
  ficha: Ficha,
  salida: SalidaDirectorT,
  fuentesValidas: Set<string>,
  ahora = new Date()
): { ficha: Ficha; incorporadas: number; descartadas: number; descartes: Descarte[] } {
  const descartes: Descarte[] = [];
  const bloques = bloquesVacios();
  for (const b of BLOQUES_FICHA) bloques[b] = (ficha.bloques[b] ?? []).filter((i) => !esPropuestaSinRevisar(i));
  const presentes = new Set(BLOQUES_FICHA.flatMap((b) => bloques[b].map((i) => i.id)));

  let incorporadas = 0;
  for (const p of salida.interpretaciones) {
    const donde = NOMBRE_BLOQUE[p.bloque];
    const fuentes = [...new Set(p.claim_ids.map((id) => fuenteCitada(id, fuentesValidas)).filter((f): f is string => !!f))];
    if (fuentes.length !== new Set(p.claim_ids).size) {
      descartes.push({ donde, texto: p.texto, motivo: "cita una fuente que no existe en la ficha" });
      continue;
    }
    if (juzgaALaPersona(p.texto)) {
      descartes.push({ donde, texto: p.texto, motivo: "califica a la persona en vez de describir a la empresa" });
      continue;
    }
    if (mideLaDependencia(p.texto)) {
      descartes.push({ donde, texto: p.texto, motivo: MOTIVO_MIDE_EN_BLOQUE });
      continue;
    }
    const propuesta = item(p.bloque, p.texto, fuentes, { tipo: "interpretacion", origen: "director", fecha: ahora.toISOString() });
    // Si la consultora ya revisó o descartó esa misma frase, no vuelve a entrar como propuesta nueva.
    if (presentes.has(propuesta.id)) continue;
    bloques[p.bloque].push(propuesta);
    presentes.add(propuesta.id);
    incorporadas++;
  }

  const dimensiones = { ...ficha.dependencia.dimensiones };
  for (const d of DIMENSIONES_DEPENDENCIA) {
    const actual = dimensiones[d];
    if (actual?.origen === "consultor" || actual?.revisado_por) continue;
    const s = salida.dependencia[d];
    const donde = `Dependencia · ${NOMBRE_DIMENSION[d]}`;
    const evidencia = [...new Set(s.evidencia.map((id) => fuenteCitada(id, fuentesValidas)).filter((f): f is string => !!f))];
    const perdidas = new Set(s.evidencia).size - evidencia.length;
    const campos = { que_se_detiene: null, podria_delegarse: null, capacidad_falta: null, aporta_valor: null } as Record<CampoDimension, string | null>;
    for (const c of CAMPOS_DIMENSION) {
      const texto = s[c]?.trim();
      if (!texto) continue;
      if (!evidencia.length) descartes.push({ donde, texto, motivo: "no cita ninguna fuente que exista" });
      else if (mideLaDependencia(texto)) descartes.push({ donde, texto, motivo: "mide la dependencia con un número: se describe, no se puntúa" });
      else if (juzgaALaPersona(texto)) descartes.push({ donde, texto, motivo: "califica a la persona en vez de describir a la empresa" });
      else campos[c] = texto;
    }
    const dice = CAMPOS_DIMENSION.some((c) => campos[c]);
    dimensiones[d] = dice
      ? { ...campos, evidencia, nota: perdidas ? `${plural(perdidas, "cita descartada", "citas descartadas")} por no existir` : null, origen: "director", revisado_por: null }
      : { ...dimensionVacia(), nota: TEXTO_SIN_EVIDENCIA, origen: "director" };
  }
  return {
    ficha: { bloques, dependencia: { ...ficha.dependencia, dimensiones, interpretaciones: { pendiente: false, motivo: null, at: ahora.toISOString() } } },
    incorporadas,
    descartadas: descartes.length,
    descartes,
  };
}

export function marcarInterpretacionesPendientes(ficha: Ficha, motivo: string, ahora = new Date()): Ficha {
  return { ...ficha, dependencia: { ...ficha.dependencia, interpretaciones: { pendiente: true, motivo, at: ahora.toISOString() } } };
}

/** Lo que falta revisar antes de acordar: propuestas del asistente en los bloques y dimensiones que él describió. */
export function pendientesDeRevision(ficha: Ficha): { items: number; dimensiones: DimensionClave[]; total: number } {
  const items = BLOQUES_FICHA.reduce((n, b) => n + (ficha.bloques[b] ?? []).filter(esPropuestaSinRevisar).length, 0);
  const dimensiones = DIMENSIONES_DEPENDENCIA.filter((d) => {
    const dim = ficha.dependencia.dimensiones[d];
    return dim?.origen === "director" && !dim.revisado_por && dimensionConTexto(dim);
  });
  return { items, dimensiones, total: items + dimensiones.length };
}

// ─── Edición en sitio por la consultora ──────────────────────────────────────────────────────────

/** Una regla de la ficha que la petición no cumple. La ruta la devuelve como 400 con este mismo mensaje. */
export class ReglaDeFicha extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ReglaDeFicha";
  }
}

function cambiarItem(ficha: Ficha, bloque: BloqueFicha, itemId: string, cambio: (actual: Item) => Item): Ficha {
  const lista = ficha.bloques[bloque] ?? [];
  if (!lista.some((x) => x.id === itemId)) throw new ReglaDeFicha("Esa frase ya no está en la ficha. Recarga la página.");
  return { ...ficha, bloques: { ...ficha.bloques, [bloque]: lista.map((x) => (x.id === itemId ? cambio(x) : x)) } };
}

/**
 * Corregir el texto o la clase de una frase. Queda dicho quién la revisó y se conserva el texto original; si la
 * frase eran las palabras textuales del dueño, deja de ir entre comillas y sus palabras quedan como cita.
 * Dos cosas no se pueden: volver «Dijo el dueño» algo que no dijo él (una propuesta del asistente solo puede ser
 * interpretación o acuerdo), y corregir a mano un número o un cálculo (se quita; el número se corrige donde está
 * registrado, o se anota de nuevo).
 */
export function editarItem(ficha: Ficha, bloque: BloqueFicha, itemId: string, cambios: { texto?: string; tipo?: TipoItem }, actorId: string | null): Ficha {
  return cambiarItem(ficha, bloque, itemId, (actual) => {
    const texto = cambios.texto?.trim();
    if (cambios.texto !== undefined && !texto) throw new ReglaDeFicha("El texto no puede quedar vacío.");
    const cambiaTexto = texto !== undefined && texto !== actual.texto;
    if (actual.momento || actual.calculo) {
      throw new ReglaDeFicha("Un número o un cálculo no se corrige a mano: quítalo y, si hace falta, anota el número de nuevo o corrígelo donde está registrado.");
    }
    const tipo = cambios.tipo ?? actual.tipo;
    const loDijoElDueno = actual.tipo === "declaracion" || actual.origen === "consultor";
    if (tipo === "declaracion" && !loDijoElDueno) throw new ReglaDeFicha("Esto no lo dijo el dueño: puede ser una interpretación o, si lo firman, un acuerdo.");
    return {
      ...actual,
      texto: texto ?? actual.texto,
      tipo,
      original: cambiaTexto ? (actual.original ?? actual.texto) : (actual.original ?? null),
      textual: cambiaTexto ? false : actual.textual,
      cita: cambiaTexto && actual.textual ? actual.texto : (actual.cita ?? null),
      revisado_por: actorId ?? "consultor",
    };
  });
}

/** Dar por buena una frase tal como está (sobre todo, una propuesta del asistente): queda dicho quién la revisó. */
export function darPorBueno(ficha: Ficha, bloque: BloqueFicha, itemId: string, actorId: string | null): Ficha {
  return cambiarItem(ficha, bloque, itemId, (actual) => ({ ...actual, revisado_por: actorId ?? "consultor" }));
}

/** Sacar una frase de la ficha sin borrarla: queda guardada como descartada y se puede recuperar. */
export function descartarItem(ficha: Ficha, bloque: BloqueFicha, itemId: string, actorId: string | null): Ficha {
  return cambiarItem(ficha, bloque, itemId, (actual) => ({ ...actual, descartado: true, revisado_por: actorId ?? "consultor" }));
}

export function recuperarItem(ficha: Ficha, bloque: BloqueFicha, itemId: string, actorId: string | null): Ficha {
  return cambiarItem(ficha, bloque, itemId, (actual) => ({ ...actual, descartado: false, revisado_por: actorId ?? "consultor" }));
}

/** Añadir una frase a mano. Lleva como fuente a la propia consultora: queda dicho quién la puso. */
export function agregarItem(ficha: Ficha, bloque: BloqueFicha, nuevo: { texto: string; tipo: TipoItem; actorId: string | null }): Ficha {
  const texto = nuevo.texto.trim();
  if (texto.length < 3) throw new ReglaDeFicha("Escribe la frase completa.");
  const actor = nuevo.actorId ?? "sin_id";
  const it = item(bloque, texto, [`consultor:${actor}`], { tipo: nuevo.tipo, origen: "consultor", revisado_por: actor, medio: "consultora" });
  if ((ficha.bloques[bloque] ?? []).some((x) => x.id === it.id)) throw new ReglaDeFicha("Esa frase ya está en el bloque.");
  return { ...ficha, bloques: { ...ficha.bloques, [bloque]: [...(ficha.bloques[bloque] ?? []), it] } };
}

/**
 * Anotar a mano un número de dirección (la meta de ganancia, las horas que trabaja hoy, las que quiere trabajar).
 * Entra como frase en su bloque y, sobre todo, como cifra con su base: así la distancia lo puede comparar. Uno
 * por cifra y momento: para cambiarlo se quita el anterior, que queda guardado como descartado.
 */
export function anotarCifra(ficha: Ficha, nuevo: { clave: string; momento: Momento; valor: number; actorId: string | null; formato?: ConfigEmpresa }): Ficha {
  const def = CIFRA_POR_CLAVE.get(nuevo.clave);
  if (!def) throw new ReglaDeFicha("Ese número no es de los que lleva la ficha.");
  if (!Number.isFinite(nuevo.valor) || nuevo.valor < 0) throw new ReglaDeFicha("Escribe el número, sin letras ni signos.");
  const repetido = vigentes(ficha.bloques[def.bloque]).some((i) => i.cifra?.clave === def.clave && i.momento === nuevo.momento);
  if (repetido) throw new ReglaDeFicha("Ya hay un número anotado para eso. Quítalo antes de anotar otro.");
  const actor = nuevo.actorId ?? "sin_id";
  // El dinero se anota en la moneda de la empresa y se escribe con sus separadores.
  const formato = nuevo.formato ?? porDefecto;
  const cifra = cifraDe(def.clave, nuevo.valor, formato.moneda);
  const frase = fraseDeNumero(def, nuevo.momento, textoValor(cifra, formato));
  const it = item(def.bloque, frase.texto, [`consultor:${actor}`], { origen: "consultor", revisado_por: actor, momento: nuevo.momento, cifra, medio: "consultora", ...frase.extra });
  const resto = (ficha.bloques[def.bloque] ?? []).filter((x) => x.id !== it.id);
  return { ...ficha, bloques: { ...ficha.bloques, [def.bloque]: [...resto, it] } };
}

/**
 * La consultora describe una dimensión a mano o corrige la que propuso el asistente: queda como revisada y el
 * asistente ya no la pisa. Un campo vacío es «nada que decir», no un texto en blanco. La dependencia se describe,
 * no se mide: un porcentaje o un índice no entra tampoco de su mano.
 */
export function editarDimension(ficha: Ficha, dimension: DimensionClave, cambios: Partial<Record<CampoDimension, string | null>>, actorId: string | null): Ficha {
  const actual = ficha.dependencia.dimensiones[dimension] ?? dimensionVacia();
  const campos = {} as Record<CampoDimension, string | null>;
  for (const c of CAMPOS_DIMENSION) {
    // Un campo que no viene no se toca; uno que viene vacío o en null se borra.
    const texto = cambios[c] !== undefined ? (cambios[c]?.trim() || null) : actual[c];
    if (texto && mideLaDependencia(texto)) throw new ReglaDeFicha("La dependencia se describe, no se mide: quita el porcentaje o el índice.");
    campos[c] = texto;
  }
  const dim: Dimension = { ...actual, ...campos, origen: actual.origen ?? "consultor", revisado_por: actorId ?? "consultor", nota: actual.nota === TEXTO_SIN_EVIDENCIA ? null : actual.nota };
  return { ...ficha, dependencia: { ...ficha.dependencia, dimensiones: { ...ficha.dependencia.dimensiones, [dimension]: dim } } };
}

/** Dar por buena la descripción de una dimensión tal como la propuso el asistente. */
export function darPorBuenaDimension(ficha: Ficha, dimension: DimensionClave, actorId: string | null): Ficha {
  return editarDimension(ficha, dimension, {}, actorId);
}

// ─── Lo que ve el dueño ──────────────────────────────────────────────────────────────────────────

/**
 * Cómo se le presenta cada frase al dueño. «dijiste» son sus palabras textuales y «documento» es un fragmento
 * textual de algo que entregó: las dos van entre comillas, y debajo va cómo quedó anotado. «contaste» es algo
 * que contó y de lo que solo queda el resumen: no son sus palabras exactas, así que va sin comillas.
 */
export type ClaseFrase = "dijiste" | "documento" | "contaste" | "acordamos" | "entendimos" | "numero";
export const ROTULO_CLIENTE: Record<ClaseFrase, string> = {
  dijiste: "Lo dijiste tú",
  documento: "De lo que nos entregaste",
  contaste: "Lo que nos contaste",
  acordamos: "Lo acordamos",
  entendimos: "Así lo entendimos",
  numero: "En números",
};

/** `anotado` es cómo quedó resumido lo que dijo: una misma respuesta puede haber dado varias afirmaciones. */
export type FraseCliente = { texto: string; clase: ClaseFrase; anotado: string[]; de_donde: string | null };
export type AreaCliente = { titulo: string; lineas: { etiqueta: string; texto: string }[] };
export type VistaCliente = {
  version: number;
  acordada_at: string | null;
  /** Solo los bloques que tienen algo que mostrar, con su nombre de empresario. */
  bloques: { clave: BloqueFicha; titulo: string; frases: FraseCliente[] }[];
  participacion: { conteo: string | null; dijiste: FraseCliente[]; areas: AreaCliente[] };
};

function fraseCliente(i: Item): FraseCliente {
  const sola = (clase: ClaseFrase): FraseCliente => ({ texto: i.texto, clase, anotado: [], de_donde: null });
  // Un número o una comparación se le dice como está escrito para él: su cifra en segunda persona, el motivo en llano.
  if (i.calculo || i.cifra || i.momento) return { ...sola("numero"), texto: i.texto_cliente ?? i.texto };
  if (i.tipo === "acuerdo") return sola("acordamos");
  if (i.tipo === "interpretacion") return sola("entendimos");
  // Una declaración. Si se conservan sus palabras (o el fragmento de su documento), eso es lo que se le muestra
  // entre comillas, con el resumen debajo. Si solo queda el resumen, se muestra el resumen, sin comillas.
  if (i.textual) return { ...sola("dijiste"), de_donde: nombreFuente(i) };
  if (!i.cita) return { ...sola("contaste"), de_donde: nombreFuente(i) };
  if (i.medio === "material") return { texto: i.cita, clase: "documento", anotado: [i.texto], de_donde: null };
  return { texto: i.cita, clase: "dijiste", anotado: [i.texto], de_donde: nombreFuente(i) };
}

/** Una misma respuesta suele dar varias afirmaciones: sus palabras se muestran una vez, con todo lo que se anotó de ellas. */
function frasesCliente(items: Item[]): FraseCliente[] {
  const salida: FraseCliente[] = [];
  for (const f of items.filter(visibleParaCliente).map(fraseCliente)) {
    const misma = f.anotado.length ? salida.find((x) => x.clase === f.clase && x.texto === f.texto && x.anotado.length > 0) : undefined;
    if (misma) misma.anotado.push(...f.anotado.filter((a) => !misma.anotado.includes(a)));
    else salida.push(f);
  }
  return salida;
}

/**
 * Lo que se le puede mostrar al dueño de un bloque: ni lo descartado, ni las notas de trabajo, ni un «no lo sé»,
 * ni una propuesta sin revisar. Tampoco un número suelto de hoy: sus números de hoy ya los ve en su portal, y
 * aquí aparecen donde importan, comparados con su meta en «Qué tan lejos estás».
 */
function visibleParaCliente(i: Item): boolean {
  if (i.momento === "hoy" && !i.calculo) return false;
  return !i.descartado && !i.interno && !i.aviso && i.certeza !== "no_lo_se" && !esPropuestaSinRevisar(i);
}

/**
 * LA FICHA COMO LA LEE EL DUEÑO. Se arma en el servidor y es lo único que viaja a su pantalla: sus frases, lo
 * acordado, lo que la consultora entendió y los números, con nombres de empresario. No lleva áreas de método,
 * identificadores de fuentes, notas de trabajo ni nada que la consultora no haya revisado.
 */
export function vistaCliente(f: FichaGuardada): VistaCliente {
  const bloques = BLOQUES_FICHA.map((clave) => ({
    clave,
    titulo: NOMBRE_BLOQUE_CLIENTE[clave],
    frases: frasesCliente(f.bloques[clave] ?? []),
  })).filter((b) => b.frases.length > 0);

  const areas: AreaCliente[] = [];
  for (const d of DIMENSIONES_DEPENDENCIA) {
    const dim = f.dependencia.dimensiones[d];
    const revisada = dim?.origen === "consultor" || !!dim?.revisado_por;
    if (!dim || !revisada || !dimensionConTexto(dim)) continue;
    const lineas = CAMPOS_DIMENSION.filter((c) => dim[c]?.trim()).map((c) => ({ etiqueta: NOMBRE_CAMPO_CLIENTE[c], texto: String(dim[c]).trim() }));
    areas.push({ titulo: NOMBRE_DIMENSION_CLIENTE[d], lineas });
  }
  return {
    version: f.version,
    acordada_at: f.acordada_at,
    bloques,
    participacion: {
      conteo: textoProcesosCliente(f.dependencia.procesos),
      dijiste: frasesCliente(f.dependencia.declaraciones ?? []),
      areas,
    },
  };
}

// ─── La constancia del dueño ─────────────────────────────────────────────────────────────────────

/** Dónde lee el dueño lo que confirmó, en palabras. El acta completa (huella, nota jurídica) sigue en /acta/[id]. */
export function rutaConstancia(actaId: string): string {
  return `/portal/direccion/constancia?acta=${actaId}`;
}

const FraseGuardada = z.object({
  texto: z.string(),
  clase: z.enum(Object.keys(ROTULO_CLIENTE) as [ClaseFrase, ...ClaseFrase[]]),
  anotado: z.array(z.string()),
  de_donde: z.string().nullable(),
});

const VistaGuardada = z.object({
  version: z.number(),
  acordada_at: z.string().nullable(),
  bloques: z.array(z.object({ clave: z.enum(BLOQUES_FICHA), titulo: z.string(), frases: z.array(FraseGuardada) })),
  participacion: z.object({
    conteo: z.string().nullable(),
    dijiste: z.array(FraseGuardada),
    areas: z.array(z.object({ titulo: z.string(), lineas: z.array(z.object({ etiqueta: z.string(), texto: z.string() })) })),
  }),
});

/**
 * El contenido de un acta de la ficha, leído de vuelta como lo que el dueño tuvo delante al confirmar. Al acta
 * se guarda la vista que se le mostró (`vistaCliente`); aquí se comprueba que el jsonb guardado tiene esa forma
 * antes de pintarlo. Si no la tiene (un acta de otro tipo, un contenido antiguo), devuelve null y la pantalla lo dice.
 */
export function leerVistaCliente(contenido: unknown): VistaCliente | null {
  const r = VistaGuardada.safeParse(contenido);
  return r.success ? r.data : null;
}

// ─── Leer y guardar en la base ───────────────────────────────────────────────────────────────────

type Escritor = Pick<SupabaseClient, "from">;

/**
 * LA REVISIÓN DE UN BORRADOR. Cada guardado la sube en uno y solo se hace si la fila sigue en la revisión que se
 * leyó: es lo que impide que dos escrituras (dos consultoras, o la consultora y el trabajo del asistente) se
 * pisen sin enterarse. Vive dentro del jsonb `dependencia` porque la tabla no tiene una columna para ella; el
 * filtro es el de PostgREST sobre un campo json. Una fila sin revisión (creada a mano o antes de esto) vale cero.
 */
const CAMPO_REVISION = "dependencia->>revision";

function revisionDe(dependencia: unknown): number {
  const n = Number((dependencia as { revision?: unknown } | null | undefined)?.revision);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * El borrador ya no es el que se leyó: nada se guardó encima. `revision` = alguien lo cambió en ese instante (se
 * puede volver a leer y reintentar); `reemplazado` = ya no es un borrador, o no es el vigente (se acordó o se abrió otro).
 */
export class BorradorCambio extends Error {
  constructor(mensaje: string, public readonly causa: "revision" | "reemplazado") {
    super(mensaje);
    this.name = "BorradorCambio";
  }
}

const TEXTO_CAMBIO_REVISION = "El borrador cambió justo cuando se iba a guardar: alguien más lo editó en ese instante. No se guardó nada encima. Recarga la página y vuelve a intentarlo.";
const TEXTO_CAMBIO_REEMPLAZADO = "Ese borrador ya no es el de trabajo: se acordó o se abrió otro. Recarga la página antes de continuar.";

/** Cuántas veces se vuelve a leer y a aplicar un cambio cuando otro guardado se adelantó. */
const INTENTOS_DE_GUARDADO = 3;

/** Una fila de ficha_direccion como la usa el código; lo que falte en el jsonb se completa vacío para no romper la pantalla. */
export function desdeFila(f: Record<string, unknown>): FichaGuardada {
  const b = (f.bloques ?? {}) as Partial<Bloques>;
  const d = (f.dependencia ?? {}) as Partial<Dependencia>;
  const vacia = fichaVacia();
  const bloques = bloquesVacios();
  for (const k of BLOQUES_FICHA) bloques[k] = Array.isArray(b[k]) ? (b[k] as Item[]) : [];
  const dimensiones = dimensionesVacias();
  for (const k of DIMENSIONES_DEPENDENCIA) dimensiones[k] = { ...dimensionVacia(), ...((d.dimensiones?.[k] as Partial<Dimension> | undefined) ?? {}) };
  return {
    id: String(f.id),
    company_id: String(f.company_id),
    version: Number(f.version ?? 1),
    revision: revisionDe(f.dependencia),
    estado: (f.estado as EstadoFicha) ?? "borrador",
    creada_por: (f.creada_por as string | null) ?? null,
    acordada_por: (f.acordada_por as string | null) ?? null,
    acordada_at: (f.acordada_at as string | null) ?? null,
    reemplaza_a: (f.reemplaza_a as string | null) ?? null,
    created_at: (f.created_at as string | null) ?? null,
    bloques,
    dependencia: {
      dimensiones,
      procesos: (d.procesos as ConteoProcesos | undefined) ?? vacia.dependencia.procesos,
      declaraciones: Array.isArray(d.declaraciones) ? d.declaraciones : [],
      interpretaciones: (d.interpretaciones as EstadoInterpretaciones | undefined) ?? vacia.dependencia.interpretaciones,
    },
  };
}

async function ultimaEnEstado(companyId: string, estado: EstadoFicha, sb: Escritor): Promise<FichaGuardada | null> {
  const { data, error } = await sb.from("ficha_direccion").select("*").eq("company_id", companyId).eq("estado", estado).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`No se pudo leer la ficha de dirección (${estado}): ${error.message}`);
  return data ? desdeFila(data as Record<string, unknown>) : null;
}

export async function borradorVigente(companyId: string, sb: Escritor): Promise<FichaGuardada | null> {
  return ultimaEnEstado(companyId, "borrador", sb);
}

export async function acordadaVigente(companyId: string, sb: Escritor): Promise<FichaGuardada | null> {
  return ultimaEnEstado(companyId, "acordada", sb);
}

/** Una versión concreta de la empresa, para leerla en el historial. Si el id es de otra empresa, no existe. */
export async function versionDe(companyId: string, fichaId: string, sb: Escritor): Promise<FichaGuardada | null> {
  const { data, error } = await sb.from("ficha_direccion").select("*").eq("id", fichaId).eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(`No se pudo leer esa versión de la ficha: ${error.message}`);
  return data ? desdeFila(data as Record<string, unknown>) : null;
}

export type VersionResumida = Pick<FichaGuardada, "id" | "version" | "estado" | "created_at" | "creada_por" | "acordada_at" | "acordada_por" | "reemplaza_a">;

export async function historial(companyId: string, sb: Escritor): Promise<VersionResumida[]> {
  const { data, error } = await sb
    .from("ficha_direccion")
    .select("id,version,estado,created_at,creada_por,acordada_at,acordada_por,reemplaza_a")
    .eq("company_id", companyId)
    .order("version", { ascending: false })
    .limit(100);
  if (error) throw new Error(`No se pudo leer el historial de la ficha: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    version: Number(f.version),
    estado: f.estado as EstadoFicha,
    created_at: (f.created_at as string | null) ?? null,
    creada_por: (f.creada_por as string | null) ?? null,
    acordada_at: (f.acordada_at as string | null) ?? null,
    acordada_por: (f.acordada_por as string | null) ?? null,
    reemplaza_a: (f.reemplaza_a as string | null) ?? null,
  }));
}

async function versionSiguiente(companyId: string, sb: Escritor): Promise<number> {
  const { data, error } = await sb.from("ficha_direccion").select("version").eq("company_id", companyId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`No se pudo contar las versiones de la ficha: ${error.message}`);
  return Number((data as { version?: number } | null)?.version ?? 0) + 1;
}

/** Nace un borrador: la versión siguiente de la empresa, en su primera revisión. */
async function crearBorrador(companyId: string, ficha: Ficha, sb: Escritor, creadaPor: string | null): Promise<{ id: string; version: number }> {
  const version = await versionSiguiente(companyId, sb);
  const { data, error } = await sb
    .from("ficha_direccion")
    .insert({ company_id: companyId, version, estado: "borrador", bloques: ficha.bloques, dependencia: { ...ficha.dependencia, revision: 1 }, creada_por: creadaPor })
    .select("id,version")
    .single();
  if (error || !data) throw new Error(`No se pudo crear el borrador de la ficha: ${error?.message ?? "sin fila"}`);
  return { id: String((data as { id: string }).id), version: Number((data as { version: number }).version) };
}

/**
 * Guarda el borrador: si ya hay uno, se actualiza en su sitio (es el mismo borrador, más completo); si no, nace
 * la versión siguiente. Nunca toca una versión acordada ni reemplazada.
 */
export async function guardarBorrador(companyId: string, ficha: Ficha, sb: Escritor, opts: { creadaPor?: string | null } = {}): Promise<{ id: string; version: number; creada: boolean }> {
  const existente = await borradorVigente(companyId, sb);
  if (existente) {
    await guardarFicha(existente.id, ficha, sb, { revision: existente.revision });
    return { id: existente.id, version: existente.version, creada: false };
  }
  return { ...(await crearBorrador(companyId, ficha, sb, opts.creadaPor ?? null)), creada: true };
}

/**
 * Guarda el contenido de un borrador y devuelve su revisión nueva. DOS CERCAS: el estado (una versión acordada o
 * reemplazada no se reescribe) y la revisión (si la fila ya no está en la que se leyó, no se pisa). Cuando no se
 * guarda, NO se calla: lanza `BorradorCambio` diciendo cuál de las dos fue. Quien ya leyó la ficha pasa su
 * `revision`; si no se pasa, se lee aquí justo antes de guardar.
 */
export async function guardarFicha(fichaId: string, ficha: Ficha, sb: Escritor, opts: { revision?: number } = {}): Promise<number> {
  let leida = opts.revision;
  if (leida === undefined) {
    const { data, error } = await sb.from("ficha_direccion").select("dependencia").eq("id", fichaId).maybeSingle();
    if (error) throw new Error(`No se pudo leer la ficha antes de guardarla: ${error.message}`);
    leida = revisionDe((data as { dependencia?: unknown } | null)?.dependencia);
  }
  const nueva = leida + 1;
  const cambio = sb
    .from("ficha_direccion")
    .update({ bloques: ficha.bloques, dependencia: { ...ficha.dependencia, revision: nueva } })
    .eq("id", fichaId)
    .eq("estado", "borrador");
  const { data, error } = await (leida === 0 ? cambio.is(CAMPO_REVISION, null) : cambio.eq(CAMPO_REVISION, String(leida))).select("id");
  if (error) throw new Error(`No se pudo guardar la ficha: ${error.message}`);
  if (((data ?? []) as unknown[]).length > 0) return nueva;

  // No se tocó ninguna fila. Se mira por qué, para decirlo bien: ¿dejó de ser borrador, o cambió de revisión?
  const { data: fila } = await sb.from("ficha_direccion").select("estado").eq("id", fichaId).maybeSingle();
  if ((fila as { estado?: string } | null)?.estado !== "borrador") throw new BorradorCambio(TEXTO_CAMBIO_REEMPLAZADO, "reemplazado");
  throw new BorradorCambio(TEXTO_CAMBIO_REVISION, "revision");
}

/**
 * CAMBIAR EL BORRADOR SIN PISAR A NADIE. Lee el borrador vigente, le aplica el cambio y lo guarda solo si sigue
 * en la revisión leída; si otro guardado se adelantó, vuelve a leer y aplica el cambio sobre lo nuevo. Así una
 * corrección de la consultora y las propuestas del asistente caen las dos, en el orden en que lleguen. Si el
 * borrador ya no es el vigente (se acordó, se abrió otro) no hay sobre qué escribir: `BorradorCambio`.
 * `cambio` es una función pura y puede correr más de una vez; si la regla de la ficha no la deja pasar, lanza.
 */
export async function actualizarBorrador(companyId: string, fichaId: string, sb: Escritor, cambio: (actual: FichaGuardada) => Ficha): Promise<{ ficha: Ficha; revision: number }> {
  for (let intento = 1; ; intento++) {
    const actual = await borradorVigente(companyId, sb);
    if (!actual || actual.id !== fichaId) throw new BorradorCambio(TEXTO_CAMBIO_REEMPLAZADO, "reemplazado");
    const ficha = cambio(actual);
    try {
      return { ficha, revision: await guardarFicha(fichaId, ficha, sb, { revision: actual.revision }) };
    } catch (e) {
      if (!(e instanceof BorradorCambio) || e.causa !== "revision" || intento >= INTENTOS_DE_GUARDADO) throw e;
    }
  }
}

/**
 * ARMAR Y GUARDAR, en un paso: lee lo que hay, lo junta con el borrador (o con la versión acordada, si se abre un
 * borrador nuevo después de acordar) y lo guarda. Lo usan la ruta («Armar con lo que ya hay») y el trabajo del
 * asistente, que guarda siempre este borrador ANTES de llamar al modelo. Si alguien edita el borrador mientras
 * se arma, se vuelve a juntar con lo que haya quedado: lo que ella tocó se conserva.
 */
export async function prepararBorrador(companyId: string, sb: Escritor, opts: { creadaPor?: string | null } = {}): Promise<{ id: string; version: number; creada: boolean; ficha: Ficha; borrador: Borrador }> {
  const borrador = await armarBorrador(companyId, sb);
  for (let intento = 1; ; intento++) {
    const enCurso = await borradorVigente(companyId, sb);
    const ficha = fusionar(enCurso ?? (await acordadaVigente(companyId, sb)), borrador);
    try {
      if (enCurso) {
        await guardarFicha(enCurso.id, ficha, sb, { revision: enCurso.revision });
        return { id: enCurso.id, version: enCurso.version, creada: false, ficha, borrador };
      }
      return { ...(await crearBorrador(companyId, ficha, sb, opts.creadaPor ?? null)), creada: true, ficha, borrador };
    } catch (e) {
      if (!(e instanceof BorradorCambio) || intento >= INTENTOS_DE_GUARDADO) throw e;
    }
  }
}

/** ¿Hay algo que acordar? Cuentan las frases vigentes de los bloques; una nota de trabajo o un aviso no son contenido para el dueño. */
export function tieneQueAcordar(f: Ficha): boolean {
  return BLOQUES_FICHA.some((b) => vigentes(f.bloques[b]).some((i) => !i.interno));
}

/**
 * ACORDAR UNA VERSIÓN. Exige la autoridad de aprobar (la misma que un hallazgo): tener acceso a la empresa no es
 * poder comprometerla. No se acuerda una ficha vacía ni una con propuestas del asistente sin revisar. Crea la
 * versión siguiente en estado «acordada» con lo vigente del borrador (lo descartado y las notas de trabajo se
 * quedan en el borrador), y marca el borrador y la acordada anterior como «reemplazada». No se borra nada: cada
 * versión queda como constancia. Son tres escrituras seguidas, no una transacción: si la segunda falla, la nueva
 * versión ya quedó acordada y el error dice qué fila no se pudo marcar.
 */
export async function acordar(fichaId: string, perfil: Perfil, sb: Escritor, ahora = new Date()): Promise<{ id: string; version: number; reemplazo_a: string[] }> {
  await exigirAutoridad(perfil, "aprobar_hallazgo");
  const { data: fila, error } = await sb.from("ficha_direccion").select("*").eq("id", fichaId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la ficha: ${error.message}`);
  if (!fila) throw new ReglaDeFicha("Esa ficha no existe.");
  const borrador = desdeFila(fila as Record<string, unknown>);
  if (borrador.estado !== "borrador") throw new ReglaDeFicha(`Solo se acuerda un borrador; esta versión está «${NOMBRE_ESTADO[borrador.estado].toLowerCase()}».`);
  if (!tieneQueAcordar(borrador)) throw new ReglaDeFicha("La ficha está vacía: no hay nada que acordar.");
  const pendientes = pendientesDeRevision(borrador);
  if (pendientes.total > 0) {
    throw new ReglaDeFicha(`Quedan ${plural(pendientes.total, "propuesta del asistente", "propuestas del asistente")} sin revisar. Dalas por buenas, corrígelas o quítalas antes de acordar.`);
  }

  // A la versión acordada pasa lo que se acuerda. Lo descartado y las notas de trabajo se quedan en el borrador,
  // que no se borra: sigue ahí, reemplazado, para quien quiera ver cómo se llegó a esta versión.
  const bloques = bloquesVacios();
  for (const b of BLOQUES_FICHA) bloques[b] = vigentes(borrador.bloques[b]).filter((i) => !i.interno);
  const dependencia: Dependencia = { ...borrador.dependencia, declaraciones: vigentes(borrador.dependencia.declaraciones) };

  const anterior = await acordadaVigente(borrador.company_id, sb);
  const version = await versionSiguiente(borrador.company_id, sb);
  const { data: nueva, error: eIns } = await sb
    .from("ficha_direccion")
    .insert({
      company_id: borrador.company_id,
      version,
      estado: "acordada",
      bloques,
      dependencia,
      creada_por: borrador.creada_por,
      acordada_por: perfil.id,
      acordada_at: ahora.toISOString(),
      reemplaza_a: borrador.id,
    })
    .select("id,version")
    .single();
  if (eIns || !nueva) throw new Error(`No se pudo crear la versión acordada: ${eIns?.message ?? "sin fila"}`);
  const nuevoId = String((nueva as { id: string }).id);

  const reemplazadas: string[] = [];
  for (const id of [borrador.id, anterior?.id].filter((x): x is string => !!x && x !== nuevoId)) {
    const { error: eUp } = await sb.from("ficha_direccion").update({ estado: "reemplazada" }).eq("id", id);
    if (eUp) throw new Error(`La versión ${version} quedó acordada pero no se pudo marcar la anterior como reemplazada: ${eUp.message}`);
    reemplazadas.push(id);
  }
  return { id: nuevoId, version: Number((nueva as { version: number }).version), reemplazo_a: reemplazadas };
}

// ─── El contexto que recibe el asistente ─────────────────────────────────────────────────────────

/** Las fuentes de las frases vigentes de la ficha que el asistente puede citar: lo que salió de la base y lo que la consultora anotó. */
export function fuentesCitables(ficha: Ficha, deLaBase: Set<string>): Set<string> {
  const validas = new Set(deLaBase);
  const declaradas = [...BLOQUES_FICHA.flatMap((b) => vigentes(ficha.bloques[b])), ...vigentes(ficha.dependencia.declaraciones)];
  for (const i of declaradas) if (i.tipo === "declaracion" && i.origen === "consultor") for (const f of i.fuentes) validas.add(f);
  return validas;
}

/**
 * El material para el DIRECTOR: cada declaración con su id citable, los números con su fuente y el conteo de
 * procesos. Es texto plano y determinista; el manejador lo acota con comoDato() antes de mandarlo. Un «no lo sé»
 * va marcado como tal y no se puede citar.
 */
export function contextoParaDirector(e: { ficha: Ficha; empresa: { nombre: string; moneda: string }; fuentes_validas: Set<string> }): string {
  const linea = (i: Item) =>
    `- [${i.fuentes.join(", ") || "sin fuente"}] ${i.calculo ? "(cálculo) " : ""}«${i.texto}»${i.cita ? ` · en sus palabras: «${i.cita}»` : ""}${i.certeza ? ` (certeza: ${i.certeza})` : ""}${i.momento ? ` (${i.momento})` : ""}`;
  const partes: string[] = [`EMPRESA: ${e.empresa.nombre} · moneda ${e.empresa.moneda}`];
  for (const k of BLOQUES_FICHA) {
    // Un aviso habla de lo que NO entró: no es material para leer ni trae nada que citar.
    const material = vigentes(e.ficha.bloques[k]).filter((i) => (i.tipo === "declaracion" || i.calculo) && !i.aviso);
    if (material.length) partes.push(`BLOQUE ${k} (${NOMBRE_BLOQUE[k]}):\n${material.map(linea).join("\n")}`);
  }
  const dichas = vigentes(e.ficha.dependencia.declaraciones);
  if (dichas.length) partes.push(`LO QUE EL DUEÑO DIJO SOBRE QUÉ SE DETIENE SIN ÉL:\n${dichas.map(linea).join("\n")}`);
  const p = e.ficha.dependencia.procesos;
  partes.push(
    `PROCESOS (conteo hecho en código, es dato y no índice): ${p.texto}.` +
      (p.nombres_con_dueno.length ? ` Con el dueño: ${p.nombres_con_dueno.join(", ")}.` : "") +
      (p.nombres_decide_solo.length ? ` Solo él decide en: ${p.nombres_decide_solo.join(", ")}.` : "")
  );
  partes.push(`IDS CITABLES (los únicos que puedes poner en claim_ids o evidencia): ${[...e.fuentes_validas].join(", ") || "ninguno"}`);
  return partes.join("\n\n");
}

/**
 * ¿Hay material para pedirle interpretaciones al asistente? Hace falta al menos una frase del dueño: un número
 * suelto («Hoy: Ventas del mes…») o un «no lo sé» no son algo que interpretar, y no se gasta modelo en ellos.
 */
export function hayMaterialParaInterpretar(f: Ficha): boolean {
  const dijoAlgo = (i: Item) => i.tipo === "declaracion" && !i.momento && i.certeza !== "no_lo_se";
  return BLOQUES_FICHA.some((b) => vigentes(f.bloques[b]).some(dijoAlgo)) || vigentes(f.dependencia.declaraciones).some(dijoAlgo);
}

// ─── De dónde salió cada frase, en palabras ──────────────────────────────────────────────────────

const NOMBRE_TIPO_FUENTE: Record<string, string> = { documento: "Documento", dato: "Datos", foto: "Foto", audio: "Audio", observacion: "Observación", entrevista: "Entrevista" };

/** Todas las fuentes que aparecen en una ficha: las de sus frases y las de la evidencia de cada dimensión. */
export function fuentesDe(f: Ficha): string[] {
  const todas = new Set<string>();
  for (const b of BLOQUES_FICHA) for (const i of f.bloques[b] ?? []) for (const x of i.fuentes) todas.add(x);
  for (const i of f.dependencia.declaraciones ?? []) for (const x of i.fuentes) todas.add(x);
  for (const d of DIMENSIONES_DEPENDENCIA) for (const x of f.dependencia.dimensiones[d]?.evidencia ?? []) todas.add(x);
  return [...todas];
}

/**
 * Para la consultora: cada fuente de la ficha con su nombre legible («Entrevista · «¿Qué no estás dispuesto a
 * sacrificar…?»», «Documento «Plan 2026.docx»», «Número registrado · Ventas del mes, Setiembre 2026»). Si una
 * lectura falla o la fila ya no está, la fuente conserva un nombre genérico y verdadero: la pantalla no se cae.
 */
export async function describirFuentes(fuentes: string[], sb: Lector): Promise<Record<string, string>> {
  const salida: Record<string, string> = {};
  const idsDe = (prefijo: string) => [...new Set(fuentes.filter((f) => f.startsWith(`${prefijo}:`)).map((f) => f.slice(prefijo.length + 1)))];
  const suave = async <T,>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await consulta;
      return error ? [] : ((data ?? []) as T[]);
    } catch {
      return [];
    }
  };

  const claimIds = idsDe("claim");
  const metricaIds = idsDe("metrica");
  const [claims, metricas] = await Promise.all([
    claimIds.length ? suave<{ id: string; source_id: string | null; response_id: string | null }>(sb.from("claims").select("id,source_id,response_id").in("id", claimIds)) : [],
    metricaIds.length ? suave<MetricaFila>(sb.from("company_metricas").select("id,clave,periodo,valor,estado").in("id", metricaIds)) : [],
  ]);
  const respuestaIds = [...new Set([...idsDe("respuesta"), ...claims.map((c) => c.response_id).filter((x): x is string => !!x)])];
  const sourceIds = [...new Set(claims.map((c) => c.source_id).filter((x): x is string => !!x))];
  const [respuestas, sources] = await Promise.all([
    respuestaIds.length ? suave<{ id: string; pregunta: string | null }>(sb.from("interview_responses").select("id,pregunta").in("id", respuestaIds)) : [],
    sourceIds.length ? suave<{ id: string; nombre: string | null; tipo: string | null }>(sb.from("sources").select("id,nombre,tipo").in("id", sourceIds)) : [],
  ]);
  const preguntaDe = new Map(respuestas.map((r) => [r.id, r.pregunta]));
  const sourceDe = new Map(sources.map((s) => [s.id, s]));
  const claimDe = new Map(claims.map((c) => [c.id, c]));
  const metricaDe = new Map(metricas.map((m) => [m.id, m]));

  for (const f of fuentes) {
    const [prefijo, ...resto] = f.split(":");
    const id = resto.join(":");
    if (prefijo === "claim") {
      const c = claimDe.get(id);
      const pregunta = c?.response_id ? preguntaDe.get(c.response_id) : null;
      const s = c?.source_id ? sourceDe.get(c.source_id) : null;
      if (pregunta) salida[f] = `Entrevista · «${recorte(pregunta, 90)}»`;
      else if (s?.nombre) salida[f] = `${NOMBRE_TIPO_FUENTE[s.tipo ?? ""] ?? "Fuente"} «${s.nombre}»`;
      else salida[f] = "Afirmación confirmada";
    } else if (prefijo === "respuesta") {
      const pregunta = preguntaDe.get(id);
      salida[f] = pregunta ? `Respuesta a «${recorte(pregunta, 90)}»` : "Respuesta del dueño";
    } else if (prefijo === "metrica") {
      const m = metricaDe.get(id);
      if (!m) salida[f] = "Número registrado";
      else {
        const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
        salida[f] = `Número registrado · ${etiquetaDeCifra(clave)}${ES_MES.test(periodo) ? `, ${nombreDePeriodo(periodo)}` : ""} · ${etiquetaEstado(m.estado)}`;
      }
    } else if (f === "empresa:aspiracion") salida[f] = "Aspiración escrita en los datos de la empresa";
    else if (prefijo === "empresa") salida[f] = `Datos de la empresa · ${id.replace(/^ficha\./, "").replace(/_/g, " ")}`;
    else if (prefijo === "consultor") salida[f] = "Anotado por la consultora";
    else salida[f] = f;
  }
  return salida;
}

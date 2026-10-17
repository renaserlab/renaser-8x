/**
 * LO QUE DEVUELVE CADA LLAMADA AL MODELO (spec-estrategia-8x.md §6.1).
 *
 * Tres salidas: la del camino del dinero (`SalidaLenteDinero`), la del camino de la operación y el terreno
 * (`SalidaLenteTerreno`) y la del equipo que ataca a los dos y deja lo final (`SalidaEquipoRojo`). «Lente» y «equipo
 * rojo» son nombres del código: en pantalla no aparecen.
 *
 * Reglas que viven aquí:
 *  - Los textos libres son `Texto(max)`. Zod no puede ver si un texto trae una cifra: eso lo hace validador.ts. Los
 *    números estructurales (días, rangos de los supuestos) sí son números, con sus límites.
 *  - Toda cifra se escribe `{{id}}` con un id del paquete, de los cálculos, de un supuesto o de una proyección. El id
 *    (`Ref`) tiene su forma aquí; si existe, lo dice el validador.
 *  - La IA solo supone CUÁNTO CAMBIA algo (un `SupuestoIA` con una clave `cambio` del catálogo); lo que es «cuánto es
 *    hoy» va a `faltan` y sale como pregunta para el dueño.
 *  - Sin `z.tuple` (sale como `prefixItems`, que el esquema nativo del proveedor puede no aceptar): los pares son
 *    `z.array(…).length(2)`.
 *  - EL PRESUPUESTO CUBRE AL ESQUEMA, NO AL REVÉS (§5.1): `caracteresMaximos(esquema) ÷ 3,3` no pasa del presupuesto de
 *    salida de su llamada. Si no cabe, se recortan los topes de aquí; nunca se sube el presupuesto a ciegas. Los topes
 *    que difieren de la especificación están anotados donde se recortaron (tests/estrategia-esquemas.test.ts).
 *
 * Puro: sin base, sin red, sin IA.
 */
import { z } from "zod";
import type { Efecto as EfectoProyeccion } from "./proyeccion";

// ─── Piezas ──────────────────────────────────────────────────────────────────────────────────────

/** Un texto libre: sin espacios sobrantes, de 3 caracteres a `max`. */
export const Texto = (max: number) => z.string().trim().min(3).max(max);

/** Los prefijos de los ids que el modelo puede citar (§3.4). */
export const PREFIJOS_REF = ["N", "L", "G", "B", "K", "F", "P", "D", "Q", "T", "Z", "X", "C", "S", "R"] as const;
// La especificación dejaba hasta 80 caracteres después del prefijo; ningún id del paquete pasa de 60 (el más largo es
// el de una dimensión de la dependencia del dueño, unos 53) y cada carácter de tope se paga en cada ref de la salida.
export const PATRON_REF = /^(N|L|G|B|K|F|P|D|Q|T|Z|X|C|S|R):[A-Za-z0-9_.:@-]{1,62}$/;
/** Un id citado: prefijo, dos puntos y la clave. Que exista lo dice el validador. */
export const Ref = z.string().max(64).regex(PATRON_REF);

/** El id de un supuesto, sin «S:» (en los textos se cita `{{S:SA1}}`). SA del camino del dinero, SB del de la operación, SR del equipo rojo. */
export const PATRON_SUPUESTO = /^S[ABR][1-9][0-9]?$/;
const IdSupuesto = z.string().max(4).regex(PATRON_SUPUESTO);

/** Una clave del catálogo (supuestos.ts). Que sea de la clase correcta lo dice el validador. */
const Clave = z.string().max(61).regex(/^[a-z][a-z0-9_.]{2,60}$/);

/** Un ítem del FODA dentro de una lente: F1, D2, O1, A3 (o con su lente delante: A.F1). */
export const PATRON_ITEM_FODA = /^([AB]\.)?[FDOA][1-9]$/;
/** Una jugada: J1…J9 (o con su lente delante: A.J2). */
export const PATRON_JUGADA = /^([AB]\.)?J[1-9]$/;

// Solo supuestos de CAMBIO (cuánto se mueve algo con una jugada). Lo que es «cuánto es hoy» no se supone: va a `faltan`.
export const SupuestoIA = z.object({
  id: IdSupuesto,
  /** Una clave `cambio` de CLAVES_SUPUESTO (§7.1); otra cosa es error del validador. */
  clave: Clave,
  que_se_supone: Texto(160),
  unidad: z.enum(["de_cada_10", "dias", "veces_mes", "pct"]),
  /** Dentro de los límites del catálogo (lo comprueba el validador). */
  rango: z.object({ bajo: z.number().finite(), alto: z.number().finite() }),
  /** El dato de hoy del que parte; obligatorio si la clave lo pide (validador). Nunca Z: ni T:. */
  ancla: Ref.nullable(),
  por_que: Texto(200),
});

/** En qué se responde una pregunta «otra» que pide un número: con su casilla de número, y la respuesta entra en las cuentas. */
export const UNIDADES_DE_OTRA = ["soles", "de_cada_10", "dias", "unidades_mes", "veces_mes", "horas_semana", "personas"] as const;

/**
 * Lo que falta saber: una clave `estado_actual` del catálogo u «otra», con su pregunta redactada (que revisa
 * revisarPregunta). Una «otra» que pide un número dice en qué se mide (`unidad_si_otra`): sin eso se respondía en texto
 * libre y nunca entraba en las cuentas (revisión del 17-10).
 */
export const Falta = z.object({
  clave: Clave,
  por_que_importa: Texto(160),
  pregunta_si_otra: Texto(200).nullable(),
  unidad_si_otra: z.enum(UNIDADES_DE_OTRA).nullable(),
});

const S = IdSupuesto;
export const Efecto = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("precio_linea"), linea: Ref, pct: S }),
  z.object({ tipo: z.literal("costo_parte"), linea: Ref, parte: Texto(60), pct: S }),
  z.object({ tipo: z.literal("volumen_linea"), linea: Ref, pct: S }),
  z.object({ tipo: z.literal("precio_general"), pct: S }),
  z.object({ tipo: z.literal("conversion"), interesados: Ref, de_cada_10_nuevo: S }),
  // clientes y veces_mes son el estado de hoy: refs a datos (N:, Q:, L:, X:), nunca un S:.
  z.object({ tipo: z.literal("recompra"), clientes: Ref, de_cada_10: S, veces_mes: Ref.nullable() }),
  z.object({ tipo: z.literal("cierre_fuga"), fuga: Ref, de_cada_10: S }),
  z.object({ tipo: z.literal("gasto_fijo"), pct: S }),
  z.object({ tipo: z.literal("dias_cobro"), menos_dias: S }),
  z.object({ tipo: z.literal("inventario_liberado"), de_cada_10: S }),
  // El id de la jugada que abre.
  z.object({ tipo: z.literal("habilitador"), abre: z.string().max(5).regex(PATRON_JUGADA) }),
]);

/** El efecto de una victoria de los primeros 14 días: solo lo que mueve caja enseguida (cobrar, cerrar una fuga, liberar lo parado). */
export const EfectoVictoria = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("cierre_fuga"), fuga: Ref, de_cada_10: S }),
  z.object({ tipo: z.literal("dias_cobro"), menos_dias: S }),
  z.object({ tipo: z.literal("inventario_liberado"), de_cada_10: S }),
]);

export const PILARES_JUGADA = ["orden", "excelencia", "servicio", "crecimiento"] as const;
export const ESLABONES = ["atraer", "vender", "abastecer", "entregar", "cobrar", "cuidar_caja", "retener", "gobernar"] as const;

export const Jugada = z.object({
  que_se_mueve: Texto(200),
  por_que: Texto(200),
  // Recortado de 5 a 4 refs para que la salida quepa en su presupuesto (§5.1).
  refs: z.array(Ref).min(1).max(4),
  /** Qué hacen clientes y competidores ante la jugada. Recortado de 160 a 140 (§5.1) para pagar la respuesta de abajo. */
  respuesta_del_mercado: Texto(140),
  /** El ajedrez entero: si el mercado responde distinto de lo esperado, qué hacemos (revisión del 17-10). */
  si_responde_distinto: Texto(120),
  /** La siguiente jugada que habilita. Recortado de 120 a 100 (§5.1). */
  que_abre: Texto(100),
  efecto: Efecto,
  desde_dia: z.number().int().min(1).max(90),
  responsable: Texto(80),
  pilar: z.enum(PILARES_JUGADA),
  eslabon: z.enum(ESLABONES),
  reduce_dependencia_del_dueno: z.boolean(),
});

export const Caso = z.object({
  caso: Texto(160),
  por_que_puede_pasar: Texto(160),
  refs: z.array(Ref).max(3),
  solucion: Texto(200),
  senal: Texto(120),
});
export const PuntoDecision = z.object({ dia: z.number().int().min(7).max(90), que_mirar: Texto(160), si_va_bien: Texto(160), si_no: Texto(200) });
export const ParaElDueno = z.object({ titulo: Texto(80), por_que: Texto(240), pasos: z.array(Texto(160)).min(3).max(5), te_pedimos: z.array(Texto(140)).max(3) });

/** El camino de una lente: sin la página del dueño (la escribe el equipo rojo, que es la voz final). */
export const CaminoLente = z.object({
  nombre: Texto(60),
  filosofia: Texto(200),
  jugadas: z.array(Jugada).min(3).max(5),
  que_pide: z.object({ dinero: Texto(160), horas_del_dueno: Texto(120), personas: Texto(120), herramientas: Texto(120) }),
  casos: z.array(Caso).min(2).max(3),
  // Recortado de 3 a 2 eventos (§5.1).
  anticipar: z.array(z.object({ evento: Texto(160), cuando: z.string().max(7).regex(/^\d{4}-(0[1-9]|1[0-2])$/), refs: z.array(Ref).max(2), que_hacemos_antes: Texto(200) })).max(2),
  senales_tempranas: z.array(z.object({ senal: Texto(160), indicador: Texto(100), mirar_el_dia: z.number().int().min(1).max(90) })).min(1).max(3),
  punto_de_decision: PuntoDecision,
});

// Recortado de 4 a 3 refs y de 200 a 180 caracteres por ítem (§5.1).
export const ItemFoda = z.object({ texto: Texto(180), refs: z.array(Ref).max(3), sin_fuente_externa: z.boolean().optional() });
export const Foda = z.object({ f: z.array(ItemFoda).max(3), d: z.array(ItemFoda).max(3), o: z.array(ItemFoda).max(3), a: z.array(ItemFoda).max(3) });

export const CUADRANTES_TOWS = ["FO", "FA", "DO", "DA"] as const;
export const CruceTows = z.object({
  cuadrante: z.enum(CUADRANTES_TOWS),
  /** Los dos ítems del FODA de esta lente que se cruzan (F1, O2…). No z.tuple (§5.1). */
  cruza: z.array(z.string().max(4).regex(PATRON_ITEM_FODA)).length(2),
  estrategia: Texto(280),
  efecto: Efecto.nullable(),
  pregunta_si_no_hay_cuenta: Texto(200).nullable(),
  recursos: Texto(160),
  cambio_de_estructura: Texto(160),
  plazo_dias: z.union([z.literal(14), z.literal(30), z.literal(90)]),
  indicador: Texto(100),
});

export const Oferta = z.object({
  para_quien: Texto(160),
  resultado_sonado: ItemFoda,
  probabilidad_percibida: ItemFoda,
  tiempo: ItemFoda,
  esfuerzo: ItemFoda,
  nombre: Texto(60),
  promesa: Texto(200),
  garantia: Texto(200),
  bonos: z.array(Texto(160)).max(3),
  urgencia_real: Texto(160),
  precio: Ref.nullable(),
  // Recortado de 700 a 600 caracteres (§5.1).
  oferta_escrita: Texto(600),
});

// Recortados de 6 a 5 supuestos, de 6 a 5 faltantes y de 4 a 3 cruces (§5.1).
export const SalidaLenteDinero = z.object({
  lectura: Texto(600),
  modelo_de_dinero: z.object({ como_entra_hoy: Texto(400), que_falta: z.array(Texto(200)).max(3) }),
  caja: Texto(400),
  foda: Foda,
  tows: z.array(CruceTows).min(2).max(3),
  oferta: Oferta,
  supuestos: z.array(SupuestoIA).max(5),
  faltan: z.array(Falta).max(5),
  camino: CaminoLente,
});

export const BLOQUES_CANVAS = ["segmentos", "propuesta", "canales", "relacion", "ingresos", "recursos", "actividades", "socios", "costos"] as const;
// Esta salida es la más larga de las tres: los topes de sus anexos (personas, procesos, árboles, terreno, canvas) se
// recortaron respecto de la especificación para que quepa en su presupuesto (§5.1), y un poco más el 17-10 para pagar
// «si responde distinto» en cada jugada y la unidad de las preguntas «otra». Lo que decide la elección (el
// camino, el FODA y los cruces) conserva los topes de la especificación.
export const SalidaLenteTerreno = z.object({
  lectura: Texto(450),
  restriccion: z.object({ cual: Texto(200), refs: z.array(Ref).min(1).max(4), por_que_manda: Texto(240) }),
  personas: Texto(190),
  procesos: Texto(190),
  producto: Texto(190),
  dependencia_del_dueno: Texto(190),
  tiempo_del_dueno: Texto(190),
  arbol: z.object({
    problemas: z.array(z.object({ efecto: Texto(160), refs: z.array(Ref).max(2), causas: z.array(z.object({ causa: Texto(160), refs: z.array(Ref).max(1) })).min(1).max(2) })).max(2),
    soluciones: z.array(z.object({ causa: Texto(120), medio: Texto(140), aterriza_en: z.enum(["proceso", "puesto", "politica", "palanca"]), que: Texto(100) })).max(3),
  }),
  terreno: z.object({
    eliminar: z.array(Texto(110)).max(2),
    reducir: z.array(Texto(110)).max(2),
    incrementar: z.array(Texto(110)).max(2),
    crear: z.array(Texto(110)).max(2),
    donde_ganar_sin_pelear: Texto(240),
  }),
  // En Zod 4, z.record(z.enum(…)) exige las nueve claves: es lo que se quiere (§5.1).
  canvas: z.record(z.enum(BLOQUES_CANVAS), z.object({ texto: Texto(95), refs: z.array(Ref).max(1), estado: z.enum(["comprobado", "por_validar", "contradicho"]) })),
  foda: Foda,
  tows: z.array(CruceTows).min(2).max(3),
  supuestos: z.array(SupuestoIA).max(4),
  faltan: z.array(Falta).max(4),
  camino: CaminoLente,
});

/**
 * Lo que el equipo rojo cambia de un camino. El código lo aplica sobre el camino de la lente (armar.ts); el resultado
 * sigue teniendo de tres a cinco jugadas y al menos dos casos, o es error del validador.
 */
export const CambioCamino = z.object({
  /** Jugadas que se quitan, por su número en el camino de la lente. */
  quitar: z.array(z.number().int().min(1).max(5)).max(2),
  reemplazar: z.array(z.object({ n: z.number().int().min(1).max(5), jugada: Jugada })).max(2),
  agregar: z.array(Jugada).max(1),
  casos_nuevos: z.array(Caso).max(1),
  /** null = se queda el de la lente. */
  punto_de_decision: PuntoDecision.nullable(),
  /** En qué caso conviene este camino: lo que tendría que verse para elegirlo (o para cambiarse a él en el punto de decisión). */
  conviene_si: Texto(160),
  /** Siempre: es la voz final. */
  para_el_dueno: ParaElDueno,
});

/** Lo que el equipo rojo elige del FODA de las lentes: «A.F1», «B.O2»; con `texto` si lo reescribe. */
const Elegidos = z.array(z.object({ de: z.string().max(4).regex(/^[AB]\.[FDOA][1-9]$/), texto: Texto(200).nullable() })).min(1).max(3);

export const SalidaEquipoRojo = z.object({
  objeciones: z.array(z.object({ a: z.enum(["a", "b", "general"]), objecion: Texto(180), gravedad: z.enum(["cambia_el_camino", "ajuste"]), arreglo: Texto(180) })).max(4),
  /** Dónde está · qué la frena · cuánto cuesta seguir igual · la apuesta · cómo sabremos. */
  lectura: z.array(Texto(160)).length(5),
  gran_apuesta: z.object({ frase: Texto(200), por_que: Texto(300), refs: z.array(Ref).min(1).max(4), camino: z.enum(["a", "b", "ambos"]) }),
  foda: z.object({ f: Elegidos, d: Elegidos, o: Elegidos, a: Elegidos }),
  /** Los cuatro cuadrantes cubiertos (lo comprueba calidad.ts). */
  tows: z.array(z.object({ de: z.string().max(4).regex(/^[AB]\.T[1-9]$/), estrategia: Texto(280).nullable() })).min(4).max(8),
  cambios: z.object({ a: CambioCamino, b: CambioCamino }),
  recomendado: z.object({ camino: z.enum(["a", "b"]), por_que: Texto(400), por_que_no_el_otro: Texto(300) }),
  // Una victoria se ve en la caja: lo que entra (cobrar antes, liberar mercadería) o lo que deja de salir (cerrar una
  // fuga), con su efecto; la cuenta la hace 8X. Sin efecto, es un número que se cuenta, no dinero (revisión del 17-10).
  victorias_14_dias: z.array(z.object({ que: Texto(180), responsable: Texto(80), desde_dia: z.number().int().min(1).max(7), refs: z.array(Ref).max(2), efecto: EfectoVictoria.nullable() })).min(2).max(4),
  oferta: z.object({ de: z.literal("a"), reescrita: Oferta.nullable() }),
  medir_desde_el_dia_1: z.array(z.object({ nombre: Texto(80), como_se_mide: Texto(160), quien_anota: Texto(80), frecuencia: z.enum(["diaria", "semanal", "mensual"]), base: Ref.nullable(), meta_30: Ref.nullable(), meta_90: Ref.nullable() })).min(2).max(4),
  supuestos: z.array(SupuestoIA).max(4),
  /** De aquí y de las lentes salen las preguntas para el dueño (§7.2); el texto lo pone el catálogo. */
  faltan: z.array(Falta).max(4),
  /** Obligatorio si el camino recomendado no llega a ×2 en su rango alto (§9.2). */
  por_que_no_llega: Texto(300).nullable(),
});

export type SalidaLenteDinero = z.infer<typeof SalidaLenteDinero>;
export type SalidaLenteTerreno = z.infer<typeof SalidaLenteTerreno>;
export type SalidaEquipoRojo = z.infer<typeof SalidaEquipoRojo>;
export type SupuestoIA = z.infer<typeof SupuestoIA>;
export type Falta = z.infer<typeof Falta>;
export type Jugada = z.infer<typeof Jugada>;
export type Caso = z.infer<typeof Caso>;
export type PuntoDecision = z.infer<typeof PuntoDecision>;
export type ParaElDueno = z.infer<typeof ParaElDueno>;
export type CaminoLente = z.infer<typeof CaminoLente>;
export type ItemFoda = z.infer<typeof ItemFoda>;
export type Foda = z.infer<typeof Foda>;
export type CruceTows = z.infer<typeof CruceTows>;
export type Oferta = z.infer<typeof Oferta>;
export type CambioCamino = z.infer<typeof CambioCamino>;
export type EfectoVictoria = z.infer<typeof EfectoVictoria>;

// El efecto del esquema y el de las cuentas (proyeccion.ts) son el mismo tipo: si uno cambia y el otro no, tsc falla aquí.
type EfectoEsquema = z.infer<typeof Efecto>;
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const efectosIguales: Igual<EfectoEsquema, EfectoProyeccion> = true;
void efectosIguales;

// ─── El tamaño de una salida ─────────────────────────────────────────────────────────────────────

/** El presupuesto de salida de cada llamada, en tokens (§5.1). El contrato de cada agente usa estos mismos números. */
export const PRESUPUESTO_TOKENS = { lente_dinero: 11_000, lente_terreno: 11_000, equipo_rojo: 12_000 } as const;
/** Cuántos caracteres de JSON caben, de forma conservadora, en un token de salida. */
export const CARACTERES_POR_TOKEN = 3.3;

export const ESQUEMA_DE = { lente_dinero: SalidaLenteDinero, lente_terreno: SalidaLenteTerreno, equipo_rojo: SalidaEquipoRojo } as const;

type Js = {
  type?: string | string[];
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, Js>;
  items?: Js;
  anyOf?: Js[];
  oneOf?: Js[];
  propertyNames?: Js;
  additionalProperties?: Js | boolean;
};

/** Un número escrito en JSON: los enteros acotados ocupan sus cifras; los demás, como mucho doce caracteres. */
function caracteresNumero(s: Js): number {
  if (s.type === "integer" && s.minimum != null && s.maximum != null) return Math.max(String(s.minimum).length, String(s.maximum).length);
  return 12;
}

function medir(s: Js, donde: string): number {
  if (s.anyOf || s.oneOf) return Math.max(...(s.anyOf ?? s.oneOf)!.map((x, i) => medir(x, `${donde}|${i}`)));
  if (s.const !== undefined) return JSON.stringify(s.const).length;
  if (s.enum) return Math.max(...s.enum.map((v) => JSON.stringify(v).length));
  switch (s.type) {
    case "string":
      if (s.maxLength == null) throw new Error(`Un texto sin tope en ${donde}: el tamaño de la salida no se puede acotar.`);
      return s.maxLength + 2;
    case "number":
    case "integer":
      return caracteresNumero(s);
    case "boolean":
      return 5;
    case "null":
      return 4;
    case "array": {
      if (s.maxItems == null || !s.items) throw new Error(`Una lista sin tope en ${donde}: el tamaño de la salida no se puede acotar.`);
      return 2 + s.maxItems * (medir(s.items, `${donde}[]`) + 1);
    }
    case "object": {
      const campos: [string, Js][] = Object.entries(s.properties ?? {});
      // Un registro con claves fijas (el canvas): cada clave de su enum, con su valor.
      if (s.propertyNames?.enum && typeof s.additionalProperties === "object") {
        for (const k of s.propertyNames.enum) campos.push([String(k), s.additionalProperties]);
      }
      return 2 + campos.reduce((suma, [k, v]) => suma + k.length + 3 + medir(v, `${donde}.${k}`) + 1, 0);
    }
    default:
      throw new Error(`Un tipo que no se sabe medir en ${donde}: ${JSON.stringify(s.type)}`);
  }
}

/**
 * El tamaño máximo en caracteres de una salida que cumple el esquema: la suma de los topes de cada texto por el tope de
 * cada lista, más las claves, las comillas y la puntuación del JSON. Un texto o una lista sin tope es un error: una
 * salida sin techo no se puede presupuestar.
 */
export function caracteresMaximos(esquema: z.ZodType): number {
  return medir(z.toJSONSchema(esquema, { unrepresentable: "any" }) as Js, "salida");
}

/** Los tokens que puede ocupar como mucho la salida de un esquema (§5.1). */
export const tokensMaximos = (esquema: z.ZodType): number => Math.ceil(caracteresMaximos(esquema) / CARACTERES_POR_TOKEN);

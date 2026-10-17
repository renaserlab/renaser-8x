import type { ZodType } from "zod";

export type Adjunto =
  | { tipo: "imagen"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }
  | { tipo: "pdf"; base64: string };

export interface CompleteParams<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  priority: "interactive" | "batch";
  adjuntos?: Adjunto[];
  maxTokens?: number;
  agente?: string;
  /**
   * UNA LLAMADA LARGA (spec-estrategia-8x.md §5.2): una salida de miles de tokens que no termina en el plazo corto del
   * modelo principal. En Gemini va directo al modelo de respaldo con el plazo completo, sin pasar por el principal y
   * sin anotarle un fallo (si no hay respaldo, o es el mismo modelo, va al principal con el plazo completo). Sin esto,
   * cada llamada larga esperaba el plazo corto, salía por el respaldo y tres seguidas abrían el cortacircuitos del
   * principal para todo 8X. El proveedor de Anthropic lo ignora. Lo usan solo los agentes de la estrategia.
   */
  largo?: true;
  /**
   * HASTA CUÁNDO PUEDE DURAR (ms desde 1970). Un trabajo largo dentro del drenaje de Vercel tiene un reloj: si la llamada
   * no cabe en lo que le queda, no se empieza (`AISinTiempoError`) y el trabajo vuelve a la cola sin gastar el intento.
   * Cada petición se acota a lo que queda, y una espera por 503 o 429 que no cabe tampoco se hace.
   */
  hasta?: number;
}

/**
 * LO QUE SE LE PERMITE A UNA LLAMADA LARGA (revisión del 17-10). Antes una sola llamada podía pasar de 300 s: dos
 * intentos de 120 s, cinco reintentos por 503 y una espera por 429. Ahora: un solo intento (una salida que no valida no
 * se repite: lo decide la consultora con un botón), dos reintentos por 503 con esperas cortas y ninguna espera por 429
 * (la reintenta el worker, si le alcanza el reloj). El margen del drenaje para los trabajos largos sale de aquí.
 */
export const LLAMADA_LARGA = {
  intentos: 1,
  esperas503Ms: [3_000, 6_000] as readonly number[],
  plazoMs: Number(process.env.AI_TIMEOUT_MS ?? 120_000),
} as const;

export interface CompleteResult<T> {
  data: T;
  tokens_entrada: number;
  tokens_salida: number;
  modelo: string;
  latencia_ms: number;
  intentos: number;
  /**
   * Por qué terminó la respuesta que validó, dicho por el proveedor (Gemini: `finishReason`; Anthropic: `stop_reason`).
   * Solo informa: lo imprime el ensayo vivo de la estrategia (scripts/estrategia/ensayo-vivo.mts) para medir. Ninguna
   * decisión depende de él; una salida cortada por tamaño ya llega como AIValidationError con `[finishReason=MAX_TOKENS]`.
   */
  fin?: string;
}

export type Segmento = { desde: number; hasta: number; texto: string };
export type Transcripcion = { texto: string; segmentos: Segmento[] };

export interface AIProvider {
  /** Salida estructurada obligatoria. Valida contra Zod; reintenta una vez; luego lanza. */
  complete<T>(params: CompleteParams<T>): Promise<CompleteResult<T>>;
  /** Transcripción con marcas de tiempo cuando el servicio las da (1.10). */
  transcribe(audio: Blob, mime: string, segundos?: number): Promise<Transcripcion>;
  /** ¿Hay transcriptor configurado? Sin él, el navegador no debe ofrecer grabar audio (P1-11). */
  puedeTranscribir(): boolean;
}

export class AIValidationError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "AIValidationError";
  }
}

export class AIRateLimitError extends Error {
  /**
   * `porDia`: la cuota del DÍA se acabó (el proveedor la nombra con «PerDay» en el detalle de su respuesta, no en el
   * mensaje). Esperar segundos no sirve: se repone al día siguiente, y reintentar solo gasta.
   */
  constructor(message: string, public readonly porDia: boolean = false) {
    super(message);
    this.name = "AIRateLimitError";
  }
}

export class AIProviderDownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderDownError";
  }
}

/**
 * NO QUEDA TIEMPO PARA ESTA LLAMADA en el reloj del trabajo (`hasta`). No es un fallo del proveedor ni del trabajo: el
 * worker lo devuelve a la cola sin gastar el intento y la continuación del drenaje lo toma con el reloj entero.
 */
export class AISinTiempoError extends AIProviderDownError {
  constructor(message: string) {
    super(message);
    this.name = "AISinTiempoError";
  }
}

/**
 * EL PROVEEDOR NO ESTÁ CAÍDO: ESTÁ SIN CRÉDITO. El 28-09-2026 Gemini devolvió 402 «prepayment
 * credits depleted» y el código lo trató como un error cualquiera: cada trabajo gastó sus tres
 * intentos en segundos y 81 trabajos (76 preguntas de entrevista ya pagadas) acabaron en «fallido».
 * Sin crédito no hay nada que reintentar: la respuesta correcta es ESPERAR sin consumir intentos.
 * Este error existe para que el worker distinga «espera» de «falla». Vive junto a sus hermanos
 * (AIRateLimitError, AIProviderDownError) en el contrato de proveedor; se reexporta desde ./index.
 */
export class AIProviderPausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderPausedError";
  }

  /**
   * ¿Este fallo del proveedor es «sin crédito»? El 402 siempre; y cualquier otro estado cuyo texto
   * hable de prepago, créditos, facturación o saldo insuficiente (Anthropic devuelve 400 con
   * «credit balance is too low»). NUNCA un 429/529: el mensaje de cuota de Google también menciona
   * «billing details» y es un límite por ventana, no falta de crédito.
   */
  static detecta(status: number | undefined, texto: string): boolean {
    if (status === 429 || status === 529) return false;
    if (status === 402) return true;
    return /prepayment|credit balance|\bcredits?\b|billing|insufficient (balance|funds)|saldo insuficiente/i.test(texto);
  }
}

import type { AIProvider, CompleteParams, CompleteResult, Transcripcion } from "./provider";
import { AIProviderPausedError } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

let _ai: AIProvider | null = null;

/** Con qué se anuncian en consola los avisos de este módulo, como «[estrategia]» y «[diagnostico]» en los suyos. */
const PREFIJO = "[ia]";

/** Los proveedores que existen. `AI_PROVIDER` y `AI_PROVIDER_RESPALDO` no aceptan otra cosa. */
export type NombreProveedor = "anthropic" | "gemini";

/**
 * CON QUÉ MODELO SE CONSTRUYE CADA PROVEEDOR.
 *
 * `AI_MODEL` es del proveedor PRINCIPAL, y eso no es un detalle: los dos proveedores lo leían, así
 * que un sistema con Gemini principal (`AI_MODEL=gemini-…`) y Anthropic de respaldo le habría pedido
 * a Anthropic el modelo «gemini-…». Eso no es un «sin crédito»: es un 404 de modelo inexistente, que
 * el worker cobra como fallo del TRABAJO, gasta los tres intentos y lo deja fallido — peor que no
 * tener respaldo. Cada proveedor tiene por eso su propia variable, y `AI_MODEL` solo alcanza al
 * principal.
 */
const VARIABLE_DE_MODELO: Record<NombreProveedor, string> = {
  anthropic: "AI_MODEL_ANTHROPIC",
  gemini: "AI_MODEL_GEMINI",
};

function modeloDe(nombre: NombreProveedor, esPrincipal: boolean): string | undefined {
  const propio = process.env[VARIABLE_DE_MODELO[nombre]]?.trim();
  if (propio) return propio;
  if (esPrincipal) return process.env.AI_MODEL?.trim() || undefined;
  return undefined; // el respaldo usa el modelo por defecto de su propio proveedor
}

function construir(nombre: NombreProveedor, esPrincipal: boolean): AIProvider {
  const modelo = modeloDe(nombre, esPrincipal);
  return nombre === "gemini" ? new GeminiProvider() : new AnthropicProvider(modelo);
}

/** El principal: «gemini» solo si `AI_PROVIDER` lo dice exactamente; cualquier otra cosa, Anthropic (como siempre). */
function principalDelEntorno(): NombreProveedor {
  return process.env.AI_PROVIDER === "gemini" ? "gemini" : "anthropic";
}

/**
 * EL RESPALDO, SOLO SI SE PIDIÓ (`AI_PROVIDER_RESPALDO=anthropic|gemini`). Sin la variable devuelve null y todo queda
 * exactamente como antes de que esto existiera. Dos valores se rechazan, y se dicen en voz alta en vez de callarse:
 *  - un nombre que no es de este sistema, porque un respaldo mal escrito que no respalda nada es peor que ninguno;
 *  - el MISMO proveedor que el principal: el 28-09-2026 no se cayó un modelo, se agotó la CUENTA, y dos modelos del
 *    mismo proveedor cobran de la misma cartera. Ese respaldo no respalda.
 */
function respaldoDelEntorno(principal: NombreProveedor): NombreProveedor | null {
  const pedido = (process.env.AI_PROVIDER_RESPALDO ?? "").trim().toLowerCase();
  if (pedido === "") return null;
  if (pedido !== "anthropic" && pedido !== "gemini") {
    console.warn(`${PREFIJO} AI_PROVIDER_RESPALDO=«${pedido}» no es un proveedor de este sistema (anthropic|gemini): se sigue SIN respaldo.`);
    return null;
  }
  if (pedido === principal) {
    console.warn(`${PREFIJO} AI_PROVIDER_RESPALDO=«${pedido}» es el mismo proveedor principal: misma cuenta y mismo crédito, no respalda nada. Se sigue SIN respaldo.`);
    return null;
  }
  // GEMINI COMO RESPALDO, solo si no necesita que le impongan el modelo: su nombre de modelo es una
  // constante del módulo y de ella cuelga además la clave de su cortacircuitos, así que no se le
  // puede pasar uno por instancia sin rehacer eso. Si `AI_MODEL` está puesto, es del principal
  // —Anthropic— y Gemini lo leería como suyo: pediría un modelo «claude-…» y fallaría con un 404
  // que parece un fallo del trabajo. Antes de dejar pasar ese respaldo roto, se dice qué falta.
  if (pedido === "gemini" && process.env.AI_MODEL?.trim() && !process.env.AI_MODEL_GEMINI?.trim()) {
    console.warn(
      `${PREFIJO} AI_PROVIDER_RESPALDO=«gemini» no se activa: AI_MODEL=«${process.env.AI_MODEL.trim()}» es del proveedor principal y Gemini lo leería como suyo. ` +
        `Pon AI_MODEL_ANTHROPIC con el modelo del principal y deja AI_MODEL sin poner, o quita el respaldo. Se sigue SIN respaldo.`,
    );
    return null;
  }
  return pedido;
}

/**
 * EL PRINCIPAL, Y EL RESPALDO SOLO SI SE QUEDÓ SIN CRÉDITO.
 *
 * El 28-09-2026 Gemini devolvió «402 · prepayment credits are depleted» y los 16 agentes de 8X quedaron detenidos por
 * una cuenta sin saldo: el sistema elegía un proveedor al arrancar y no tenía a dónde ir. Esto es ese «a dónde ir», y
 * nada más que eso:
 *  - SOLO ante «sin crédito» (`AIProviderPausedError`, que lo distingue en provider.ts). Un 429 o un 503 es un límite
 *    por ventana: se espera, no se cambia de proveedor. Cambiar ante un 429 duplicaría el gasto por una espera de
 *    segundos.
 *  - QUEDA DICHO: por consola y en el resultado (`respaldo`). Que un trabajo se haya hecho con otro modelo es un hecho
 *    que la consultora tiene que poder ver; `registrarLlamada` (lib/db/queries.ts) ya guarda `modelo` en token_usage,
 *    así que en la torre se verá el modelo del respaldo sin tocar la base.
 *  - SI EL RESPALDO NO ESTÁ, sube el error ORIGINAL del principal con una frase que dice por qué no estaba. Un «sin
 *    crédito» cuando lo que faltaba era la clave hace perder una hora.
 */
class ProveedorConRespaldo implements AIProvider {
  /**
   * El respaldo se construye TARDE y una sola vez, con el fallo guardado en vez de lanzado: `new AnthropicProvider()`
   * lanza si falta `ANTHROPIC_API_KEY`, y `ai()` se llama una vez y se cachea. Construirlo por adelantado dejaría a 8X
   * entero sin arrancar en cuanto alguien configurara un respaldo sin clave — justo lo contrario de lo que esto es.
   */
  private construido: { ok: true; proveedor: AIProvider } | { ok: false; porque: string } | null = null;

  constructor(
    private readonly principal: AIProvider,
    /** Los nombres son para lo que se DICE: la línea de consola y el `respaldo` del resultado. */
    private readonly nombres: { principal: NombreProveedor; respaldo: NombreProveedor },
  ) {}

  async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
    try {
      return await this.principal.complete(p);
    } catch (e) {
      // Todo lo que no es «sin crédito» sube tal cual: el límite por ventana (429/529), el proveedor caído (503), la
      // salida que no validó y la falta de tiempo en el reloj del trabajo se resuelven donde ya se resolvían.
      if (!(e instanceof AIProviderPausedError)) throw e;
      const r = this.traerRespaldo();
      if (!r.ok) throw this.conFraseDeRespaldo(e, r.porque);
      const quien = p.agente ? ` de «${p.agente}»` : "";
      console.warn(
        `${PREFIJO} el proveedor principal «${this.nombres.principal}» está sin crédito: la llamada${quien} la contesta el respaldo «${this.nombres.respaldo}». El principal dijo: ${e.message}`,
      );
      try {
        const res = await r.proveedor.complete(p);
        return { ...res, respaldo: { proveedor: this.nombres.respaldo, porque: e.message } };
      } catch (eR) {
        // El respaldo TAMBIÉN sin crédito: sube el del principal, que es la cuenta que hay que recargar primero.
        if (eR instanceof AIProviderPausedError) {
          throw this.conFraseDeRespaldo(e, `el respaldo «${this.nombres.respaldo}» también está sin crédito: ${eR.message}`);
        }
        // Cualquier otro fallo del respaldo es el fallo de la llamada que de verdad se hizo, así que sube ese y no el
        // 402 del principal. Pero no en silencio: sin esta línea nadie sabría que ese 429 vino del respaldo.
        console.warn(`${PREFIJO} el respaldo «${this.nombres.respaldo}» tampoco pudo con la llamada${quien}: ${String((eR as Error).message ?? eR)}`);
        throw eR;
      }
    }
  }

  /**
   * Sube el error ORIGINAL del principal —el mismo objeto, con su tipo y su rastro— con una frase al final que dice que
   * el respaldo no estaba y por qué. Se conserva el objeto porque el worker decide por `instanceof AIProviderPausedError`
   * (devolver el intento y pausar la cola) y porque el mensaje empieza con «Gemini 402», que la torre y el reencolado
   * buscan por prefijo (`PREFIJOS_ERROR_PAUSA` en jobs/reglas.ts).
   */
  private conFraseDeRespaldo(original: AIProviderPausedError, porque: string): AIProviderPausedError {
    const frase = ` · RESPALDO NO DISPONIBLE: ${porque}`;
    // Un mismo objeto de error reaprovechado (pasa en pruebas) no debe acumular la frase dos veces.
    if (!original.message.includes(frase)) original.message += frase;
    return original;
  }

  private traerRespaldo(): { ok: true; proveedor: AIProvider } | { ok: false; porque: string } {
    if (this.construido) return this.construido;
    try {
      this.construido = { ok: true, proveedor: construir(this.nombres.respaldo, false) };
    } catch (e) {
      // Falta la clave, casi siempre. Se guarda el POR QUÉ —y no se reintenta en este proceso, porque el entorno no
      // cambia a mitad de ejecución— para que viaje dentro del error que acaba leyendo la consultora.
      this.construido = { ok: false, porque: `no se pudo construir el proveedor de respaldo «${this.nombres.respaldo}»: ${String((e as Error).message ?? e)}` };
    }
    return this.construido;
  }

  /**
   * La transcripción NO tiene respaldo, y queda dicho aquí para que no se descubra tarde: Gemini transcribe
   * nativamente y Anthropic necesita `OPENAI_API_KEY` (Whisper), así que respaldar el audio depende de una tercera
   * llave que `hayTranscriptor()` no consulta. Mientras eso no se resuelva, un audio con el principal sin crédito
   * sigue parado: se transcribe con el principal o no se transcribe.
   */
  async transcribe(audio: Blob, mime: string, segundos?: number): Promise<Transcripcion> {
    return this.principal.transcribe(audio, mime, segundos);
  }

  puedeTranscribir(): boolean {
    return this.principal.puedeTranscribir();
  }
}

/** El proveedor se cambia aquí y en ningún otro lugar (AI_PROVIDER=anthropic|gemini, AI_PROVIDER_RESPALDO igual). */
export function ai(): AIProvider {
  if (!_ai) {
    const principal = principalDelEntorno();
    const base = construir(principal, true);
    const respaldo = respaldoDelEntorno(principal);
    // Sin respaldo configurado se devuelve el proveedor pelado: ni una capa de más respecto de como estaba.
    _ai = respaldo ? new ProveedorConRespaldo(base, { principal, respaldo }) : base;
  }
  return _ai;
}

/**
 * Permite inyectar un proveedor falso en tests y en la simulación de carga. Un proveedor inyectado NO lleva respaldo:
 * una prueba que se fuera a la nube sin querer es un gasto invisible.
 */
export function usarProveedor(p: AIProvider | null) {
  _ai = p;
}

/** ¿Hay transcriptor? Gemini transcribe nativamente; con Anthropic se usa Whisper (OPENAI_API_KEY). */
export function hayTranscriptor(): boolean {
  if (process.env.AI_PROVIDER === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

/** Versión de los prompts. Cambia cuando cambia cualquier prompt: entra en idempotencia y en token_usage. */
export const VERSION_PROMPT = "v4.3";

export { AIProviderPausedError } from "./provider";

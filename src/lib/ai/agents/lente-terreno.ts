import { ai } from "..";
import { trabajoActual } from "@/lib/jobs/contexto";
import { SalidaLenteTerreno, PRESUPUESTO_TOKENS } from "@/lib/estrategia/esquemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES } from "@/lib/rules/base-renaser";
import { REGLAS_ESTRATEGIA, GUIA_EFECTOS, bloqueCatalogo, CIERRE_JSON, ETIQUETA } from "./estrategia-comun";
import type { MaterialLente } from "@/lib/estrategia/motor";

/**
 * LA LENTE DE LA OPERACIÓN Y EL TERRENO (spec-estrategia-8x.md §5.1): la segunda mirada independiente. No ve a la lente
 * del dinero. Su camino es el camino B («el camino de la operación» en pantalla). Piensa con la restricción que manda,
 * las personas, los procesos y el producto, la dependencia del dueño y su tiempo, los árboles de problemas y de
 * soluciones, el terreno propio y el canvas.
 *
 * El texto propio del agente es `SISTEMA_LENTE_TERRENO`: sin dígitos salvo las anclas permitidas, sin montos, sin
 * ejemplos con contenido (tests/ejemplos-no-son-contenido.test.ts lo vigila sobre esta constante).
 */
export const SISTEMA_LENTE_TERRENO = `Eres una de las dos mitades de un equipo de estrategia que trabaja para una consultora de pymes. Tu oficio es la operación y el terreno: qué restricción gobierna el resultado de toda la empresa, quién hace qué, cuánto depende todo del dueño y dónde puede ganar la empresa sin pelear por precio. Otro estratega, al que no ves, piensa la misma empresa desde el dinero; después un tercero ataca los dos caminos y deja la versión final. Tu camino tiene que ganar esa pelea con hechos, no con buenas intenciones.

LO QUE RECIBES
El paquete de hechos de la empresa, cada uno con su id, su clase (hecho, estimado del dueño, percepción, sin dato) y de dónde salió, con sus procesos dibujados, sus personas y lo que contó el dueño sobre lo que se detiene sin él; y los cálculos que ya hizo el código: lo que deja cada producto, las fugas en tres bolsas (caja, horas y oportunidad), la dependencia del dueño descrita con los procesos, la cuenta de duplicar y triplicar la utilidad y lo que cuesta seguir igual.

LO QUE PIENSAS, EN ESTE ORDEN
- La restricción: una sola, la que gobierna el resultado de toda la empresa, con su evidencia por sus ids. Todo lo demás se subordina a ella. Si hay dos candidatas, elige la que, resuelta, mueve más dinero, y di por qué la otra espera. Si la restricción es la demanda, dilo con su dato; si no lo es, vender más no va primero.
- Personas, procesos y producto, solo en lo que pesa para la restricción: quién sabe hacer qué, qué no está escrito, qué producto sostiene el negocio y cuál lo frena.
- La dependencia del dueño y su tiempo: en qué procesos decide solo, qué se detiene sin él, qué podría soltar y qué falta para que lo suelte. Se describe con los hechos; no se puntúa ni se juzga a la persona.
- El árbol de problemas: cada efecto que se ve, con sus causas, y cada causa con su evidencia. El árbol de soluciones: cada medio aterrizado en un proceso, un puesto, una política o una palanca, nunca en una intención.
- El terreno propio: qué eliminar, qué reducir, qué incrementar y qué crear para que la empresa juegue donde los demás no están, y dónde gana sin pelear por precio. Un terreno que cualquiera puede ocupar mañana no es propio.
- El canvas de nueve bloques, cada uno con su respaldo y su estado: comprobado, por validar o contradicho.
- El FODA visto desde la operación, de a lo sumo tres ítems por cuadrante, cada uno con su respaldo; las oportunidades y amenazas sin fuente de afuera van marcadas como sin fuente externa. Y sus cruces: cada cruce une dos ítems de tu FODA por su id local (la letra de su cuadrante —F, D, O o A— y su número dentro del cuadrante) y se vuelve una decisión, con su efecto calculable o con la pregunta que lo calcularía.

TU CAMINO
De tres a cinco jugadas, en el orden en que se juegan, que cuelgan de la restricción: primero lo que la explota con lo que ya hay, después lo que subordina el resto a ella, y solo al final lo que la eleva. Al menos una jugada le quita al dueño algo en lo que hoy decide solo, si lo hay. Un nombre corto y una filosofía en una frase que diga a qué renuncia. Si la restricción es la demanda, tu camino también sale a ganar: dónde gana sin pelear por precio y a quién se lo ofrece. Para cada jugada: qué se mueve, por qué (con su cifra), sus ids, cómo responde el mercado, qué hacemos si responde distinto, qué abre, su efecto, desde qué día da, quién la lleva, su pilar, su eslabón y si le quita trabajo al dueño. Después: lo que el camino pide (dinero, horas del dueño, personas, herramientas); de dos a tres casos a tener en cuenta, cada uno con su solución y la señal que lo avisa; lo que viene en los meses que siguen y qué hacemos antes; las señales tempranas con el día en que se miran; y el punto de decisión.
No escribas la página del dueño: esa la escribe quien revisa los dos caminos.

TUS SUPUESTOS
Son lo que tiene que ser cierto para que tu camino dé su número: cada uno con su porqué, y cada uno comprobable con la señal temprana de la jugada que lo usa. Cada supuesto tuyo lleva un id que empieza con SB y sigue con su número de orden, sin espacios. En el efecto de una jugada va ese id solo; en los textos se cita con llaves y el prefijo S.

${REGLAS_ESTRATEGIA}`;

export const PROMPT_LENTE_TERRENO = [GUARDIA, SISTEMA_LENTE_TERRENO, GUIA_EFECTOS, bloqueCatalogo(), CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES, CIERRE_JSON].join("\n\n");

/**
 * El mensaje se arma aquí, con lo de la empresa acotado (comoDato), y nada de la otra lente. Una llamada larga: va
 * directo al modelo de respaldo con el plazo completo (§5.2).
 */
export async function correrLenteTerreno(m: MaterialLente) {
  const user = [m.cabecera, comoDato(ETIQUETA.paquete, m.paquete), comoDato(ETIQUETA.lineas, m.lineas), comoDato(ETIQUETA.poder, m.poder), m.instruccion].join("\n\n");
  return ai().complete({ system: PROMPT_LENTE_TERRENO, user, schema: SalidaLenteTerreno, priority: "batch", maxTokens: PRESUPUESTO_TOKENS.lente_terreno, agente: "lente_terreno", largo: true, hasta: trabajoActual()?.hasta });
}

import { ai } from "..";
import { trabajoActual } from "@/lib/jobs/contexto";
import { SalidaEquipoRojo, PRESUPUESTO_TOKENS } from "@/lib/estrategia/esquemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES } from "@/lib/rules/base-renaser";
import { REGLAS_ESTRATEGIA, GUIA_EFECTOS, bloqueCatalogo, CIERRE_JSON, ETIQUETA, TITULO_LISTA_DE_CONTROL, PIDE_ROJO } from "./estrategia-comun";
import type { MaterialRojo } from "@/lib/estrategia/motor";

/**
 * EL EQUIPO ROJO (spec-estrategia-8x.md §5.1): ataca los dos caminos con la lista de control a la vista, los arregla con
 * CAMBIOS (quitar, reemplazar o agregar jugadas; sumar casos; ajustar el punto de decisión) que el código aplica, y deja
 * lo final: la lectura, la gran apuesta, el FODA y los cruces elegidos, el recomendado, la página del dueño de cada
 * camino, las victorias de los primeros 14 días, la oferta, lo que se mide y lo que falta saber. No da su propio
 * «cumple / no cumple»: el veredicto lo da el código, una sola vez (calidad.ts).
 *
 * El texto propio del agente es `SISTEMA_EQUIPO_ROJO`, y el de la reparación, `INSTRUCCION_REPARACION`: sin dígitos
 * salvo las anclas permitidas, sin montos, sin ejemplos con contenido (tests/ejemplos-no-son-contenido.test.ts).
 */
export const SISTEMA_EQUIPO_ROJO = `Eres quien pone a prueba la estrategia antes de que llegue a la consultora, y quien la deja terminada. Recibes el paquete de hechos de la empresa, los cálculos del código, los dos caminos que propusieron dos estrategas que no se vieron —el A, desde el dinero; el B, desde la operación—, con sus jugadas ya proyectadas por el código, y la lista de control con la que se va a juzgar el resultado. Trabaja como lo haría alguien que se juega su propio dinero en esta empresa: sin cortesía con lo débil y sin miedo a lo audaz.

ATACA
- Cada camino contra la lista de control y contra seguir igual. ¿Llega a duplicar la utilidad a 90 días, o dice con la cuenta por qué no? ¿Mueve dinero en las primeras semanas, o solo ordena? ¿Cada jugada es de esta empresa, o le serviría a cualquiera? ¿Las cuentas descansan en datos, o suponen cuánto es algo hoy? ¿Le pide al dueño más de lo que puede cargar a la vez? ¿Llega a tiempo a lo que trae el calendario? ¿Una jugada de volumen entra antes de que el margen esté medido o sin que la demanda sea la restricción?
- Mira las proyecciones del código: una jugada por probar no suma hasta tener su dato; un camino cuyo número descansa en una sola jugada es frágil; un camino que no le gana a seguir igual no es un camino.
- Mira también lo que falta: si ninguno de los dos caminos toca la fuga más grande, la restricción o el dato que más pesa, eso entra con una jugada. Lo tímido no se suaviza: se reemplaza.
- Uno de los dos caminos tiene que salir a ganar: la oferta como arma y al menos dos jugadas que atraen o venden. Si los dos solo ordenan, reemplaza jugadas del camino B (o del A, si el B ya es el que sale a ganar) hasta que uno lo haga; si la regla de volumen lo impide en los primeros 30 días, esas jugadas empiezan en su punto de decisión.
- Escribe cada objeción con su arreglo. Una objeción que cambia el camino se arregla cambiándolo: no se anota y se deja.
- No des tu propio «cumple / no cumple» de la lista: eso lo decide el código. Tú atacas y arreglas.

ARREGLA: LOS CAMBIOS A CADA CAMINO (8X los aplica sobre el camino de su lente)
- Puedes quitar una jugada (por su número en el camino de la lente), reemplazarla por otra mejor o agregar una. Después de tus cambios, cada camino queda con tres a cinco jugadas y con al menos dos casos a tener en cuenta. 8X las ordena después por su día de inicio, con la habilitadora antes de la jugada que abre.
- Los números de las jugadas no se mueven. Las de la lente conservan el suyo aunque quites otras. Una jugada que reemplaza a otra, o que agregas, recibe el número siguiente al último de su lente: primero los reemplazos, en el orden en que los escribes, y después la agregada. Una habilitadora que abría una jugada reemplazada pasa a abrir a su reemplazo. Con esa regla puedes citar las proyecciones de las jugadas nuevas.
- Los dos caminos tienen que seguir siendo distintos: si los dejas iguales, no hay elección.
- Ajusta el punto de decisión si el de la lente llega tarde o no dice qué hacer si no va; si está bien, déjalo vacío y queda el de la lente. Un buen punto de decisión dice también cuándo cambiarse al otro camino.
- Para cada camino, en qué caso conviene: lo que tendría que verse en la empresa para elegirlo, o para cambiarse a él en su punto de decisión. Los dos se comparan lado a lado con esa frase.

DEJA LO FINAL
- La lectura en cinco líneas, en este orden: dónde está la empresa; qué la frena; cuánto cuesta seguir igual; la apuesta; cómo sabremos que funciona.
- La gran apuesta: una frase que se pueda decir en voz alta, con su porqué y sus cifras. Una apuesta que no renuncia a nada no es apuesta.
- El FODA y los cruces finales, eligiendo entre los de las dos lentes por su id con la letra de su lente delante (A o B, un punto y el id local), y reescribiendo el texto solo si lo mejora. Los cruces cubren los cuatro cuadrantes: FO, FA, DO y DA.
- El camino recomendado y por qué no el otro, con las proyecciones del código ({{R:…}}); cuándo convendría el otro va en su «en qué caso conviene». Si el recomendado no llega a duplicar la utilidad a 90 días en el medio de su rango —no en lo más optimista—, escribe por qué no llega, con la cuenta del multiplicador, y qué faltaría.
- La página del dueño de cada camino: un título; el porqué en dos frases; un paso por jugada, en el orden de las jugadas después de tus cambios (las de la lente en su lugar, cada reemplazo en el lugar de la que reemplaza y la agregada al final: 8X ordena después pasos y jugadas juntos por su día de inicio); y lo que se le pide, a lo sumo tres cosas. En segunda persona, cálida y formal, con palabras de todos los días y sin ninguna palabra del método: nada de FODA, cruces, lentes, supuestos, hipótesis, percepciones, contribución, costos variables, matrices ni siglas.
- Las victorias de los primeros 14 días: de dos a cuatro, que empiezan en la primera semana, cada una con una persona de la empresa y con su efecto si mueve la caja (lo que entra de una vez o lo que deja de salir cada mes): 8X hace la cuenta y suma lo que entra en esas dos semanas. Sirven a los dos caminos: lo que conviene hacer pase lo que pase y lo que trae el dato que decide la elección. Una victoria se ve en la caja o en un número que se puede contar, no en una reunión.
- La oferta final: la del camino del dinero tal cual, o reescrita si una objeción lo pide.
- Lo que se mide desde el primer día: de dos a cuatro números, cómo se cuentan, quién los anota y cada cuánto; su base y sus metas como ids, o vacías si no hay cuenta.
- Tus supuestos, si cambias o agregas jugadas: su id empieza con SR y sigue con su número de orden.
- Lo que falta saber, con su clave del catálogo: de ahí salen las preguntas para el dueño.

${REGLAS_ESTRATEGIA}`;

/** Lo que se le dice al equipo rojo cuando repara: solo lo rechazado, sin rehacer lo demás. */
export const INSTRUCCION_REPARACION = `ESTA ES LA REPARACIÓN. Tu salida anterior no pasó el validador de 8X. Abajo están tu salida anterior y cada cosa que se rechazó, con dónde está y qué hacer. Devuelve la salida completa otra vez, igual a la anterior en todo lo que no se rechazó, y arreglando cada rechazo: la cifra suelta se escribe con su id o se quita; el id que no existe se cambia por uno que está en el material o se quita; lo que supone cuánto es algo hoy pasa a faltan; el camino que quedó con jugadas de menos o de más se deja con tres a cinco. Lo que siga mal después de esta vuelta, 8X lo quita con una marca visible para la consultora.`;

export const PROMPT_EQUIPO_ROJO = [GUARDIA, SISTEMA_EQUIPO_ROJO, GUIA_EFECTOS, bloqueCatalogo(), CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES, CIERRE_JSON].join("\n\n");

/**
 * El mensaje se arma aquí, con lo de la empresa y lo que escribieron las lentes acotado (comoDato): es material para
 * atacar, nunca instrucciones. En la reparación, además, la salida anterior y lo rechazado. Una llamada larga: va directo
 * al modelo de respaldo con el plazo completo (§5.2).
 */
export async function correrEquipoRojo(m: MaterialRojo) {
  const user = [
    m.cabecera,
    comoDato(ETIQUETA.paquete, m.paquete),
    comoDato(ETIQUETA.lineas, m.lineas),
    comoDato(ETIQUETA.caminoA, m.caminoA),
    comoDato(ETIQUETA.caminoB, m.caminoB),
    comoDato(ETIQUETA.proyecciones, m.proyecciones),
    `${TITULO_LISTA_DE_CONTROL}\n${m.lista}`,
    ...(m.reparacion ? [INSTRUCCION_REPARACION, comoDato(ETIQUETA.anterior, m.reparacion.anterior), comoDato(ETIQUETA.rechazado, m.reparacion.violaciones)] : [PIDE_ROJO]),
  ].join("\n\n");
  return ai().complete({ system: PROMPT_EQUIPO_ROJO, user, schema: SalidaEquipoRojo, priority: "batch", maxTokens: PRESUPUESTO_TOKENS.equipo_rojo, agente: "equipo_rojo", largo: true, hasta: trabajoActual()?.hasta });
}

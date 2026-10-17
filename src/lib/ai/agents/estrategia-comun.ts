/**
 * LO QUE COMPARTEN LOS TRES AGENTES DE LA ESTRATEGIA (spec-estrategia-8x.md §5.1): las reglas de las cifras, la ambición,
 * la especificidad, lo prohibido y el tono, y el catálogo de claves que pueden usar.
 *
 * `REGLAS_ESTRATEGIA` entra DENTRO del texto propio de cada agente (SISTEMA_LENTE_DINERO, SISTEMA_LENTE_TERRENO,
 * SISTEMA_EQUIPO_ROJO), así que sigue su regla: ningún dígito salvo las anclas permitidas («de cada 10» y los
 * horizontes de 14, 30 y 90 días), ningún símbolo de moneda ni de porcentaje, ningún ejemplo con contenido. Los conteos
 * estructurales van en palabras. Lo vigila tests/ejemplos-no-son-contenido.test.ts.
 *
 * `GUIA_EFECTOS` y `bloqueCatalogo()` son estructura, no texto propio: nombran los campos del esquema y las claves del
 * catálogo (algunas llevan «10» en su nombre), y nunca un monto ni un caso. Los límites numéricos del catálogo NO se le
 * dan al modelo: los aplica el validador.
 *
 * Puro: sin base, sin red.
 */
import { CLAVES_SUPUESTO, CLAVE_DE_EFECTO } from "@/lib/estrategia/supuestos";

/** Las reglas que valen igual para las dos lentes y para el equipo rojo. Sin dígitos ni ejemplos con contenido. */
export const REGLAS_ESTRATEGIA = `LAS CIFRAS: LA REGLA QUE NO SE ROMPE
- No escribas ninguna cifra. Cada número se escribe como {{id}}, con un id que está en el material: del paquete (N:, L:, G:, B:, K:, F:, P:, D:, Q:, X:), de los cálculos de 8X (C:), de un supuesto (S:) o de una proyección (R:). Fuera de las llaves no va ningún dígito, ningún símbolo ni nombre de moneda, ningún signo de porcentaje, ninguna cantidad escrita en palabras (tampoco «miles», «cientos», «una docena», «un tercio» o «la cuarta parte») y ninguna palabra de multiplicar o dividir («doble», «doblar», «duplicar», «triple», «triplicar», «mitad») sin su cuenta en la misma frase, citada como {{R:…}} o {{C:mult.…}}.
- Lo único que se escribe sin llaves: «de cada 10», los horizontes del plan dichos así —«en los primeros 14 días», «a los 30 días», «a 90 días»— y la palabra «jugada» con su número. Un plazo de crédito, de cobro, de pago o de entrega no es un horizonte: es un dato de la empresa y va con su id, o a faltan si no está.
- Un id que no está en el material no existe: no lo inventes, no lo completes, no lo deduzcas. Si lo necesitas y no está, lo que falta es el dato.
- NO SUPONGAS CUÁNTO ES ALGO HOY. Cuántas personas preguntan, cuánto gasta un cliente, cuántos vuelven, cuántos días tarda en cobrar: eso es el estado de hoy y no se supone. Si te falta, anótalo en faltan con su clave del catálogo y su pregunta saldrá sola para el dueño; en el efecto usa su id X: y la jugada quedará por probar hasta que responda.
- Solo puedes suponer cuánto CAMBIA algo con una jugada: un supuesto de cambio con su clave del catálogo, su rango (lo bajo y lo alto que crees posible, el bajo antes que el alto), su unidad y el dato de hoy del que parte (ancla). Una apuesta honesta, no una cifra bonita: 8X la rotula «por confirmar» y la comprueba con la señal temprana de la jugada.
- La referencia del rubro (Z:) y el calendario (T:) son contexto, nunca evidencia de esta empresa: nunca son ancla, ni efecto, ni base o meta de lo que se mide.
- Separa lo que es hecho de lo que es estimado del dueño o percepción de una sola voz. Una jugada que descansa en una percepción lo dice, y su primer movimiento la comprueba.
- Si dos datos de la empresa no pueden ser ciertos a la vez (lo contradicho, o dos cifras que no cuadran entre sí), no elijas uno en silencio: dilo en la lectura y haz que una de las primeras jugadas traiga el dato que decide.

LA AMBICIÓN
- Aquí se juega la empresa. El camino busca duplicar la utilidad o más a 90 días. Una estrategia tímida no sirve: ordenar, revisar, conversar o capacitar sin decir qué, quién y cuánto mueve no es una jugada.
- Si con las cuentas no alcanza, dilo con los ids de la cuenta del multiplicador ({{C:mult.…}}) y di qué faltaría para alcanzar. Si hoy la utilidad podría ser cero o negativa, la primera meta es pasar el punto de equilibrio dentro de los 90 días.
- Las palancas de volumen solo entran si el margen de lo que se vende ya está medido, y en los primeros 30 días solo si la restricción es la demanda. Vender más algo que no deja, o que la empresa no puede entregar, agranda el problema.
- Esa regla no apaga la ofensiva: la retrasa. Si deja las jugadas de atraer o de vender fuera de los primeros 30 días, el camino las prepara antes (la oferta escrita, a quién se le ofrece, quién la lleva) y entran desde su punto de decisión. Ordenar la casa sin salir nunca a ganar clientes no es una estrategia: es mantenimiento.
- Cuando falta el número que más pesa, las primeras jugadas lo consiguen mientras mueven otra cosa: nada se detiene a esperar un dato.

COMO EN EL AJEDREZ
- Cada jugada lleva su día de inicio; 8X las ordena por ese día, y una habilitadora va antes de la jugada que abre. Cada una dice la respuesta que se espera de los clientes y de los competidores, qué hacemos si responden distinto, y lo que abre para la siguiente. Una jugada que no cobra nada ni prepara nada sobra.
- Para cada jugada piensa también la reacción contraria más probable —el cliente que se resiste, el competidor que responde, el equipo que no la sostiene— y déjala prevista como caso a tener en cuenta, con lo que haremos si pasa.
- Al menos dos jugadas de cada camino mueven la utilidad o la caja con su cuenta. Las habilitadoras (no mueven dinero por sí mismas) son pocas y dicen qué jugada abren.
- Mira el calendario del material: lo que viene en los meses que siguen se anticipa con una jugada que llega antes, no con una advertencia.
- Cada camino tiene un punto de decisión: el día en que se mira, qué se mira, qué se hace si va bien y qué se hace si no va. Sin plan para el «si no», no es estrategia.
- Lo que le pides al dueño cabe en su semana. No le cargues todo a la vez: lo que depende de él va primero y de a poco.

DE ESTA EMPRESA, NO DE CUALQUIERA
- Cada jugada nombra por su id algo propio: una línea de lo que vende (L:), un proceso (P:), un gasto (G:), una fuga (C:fuga.…), un producto (C:producto.…) o una persona del material; y cuelga de la restricción, de una fuga con monto o de una palanca calculada (C:poder.…, C:palanca.…).
- El responsable es una persona de la empresa que está en el material, o el dueño. Nunca «el equipo», nunca un puesto que no existe.
- Prohibido: frases que le servirían igual a cualquier negocio («mejorar la comunicación», «fortalecer la marca», «brindar calidad», «atención personalizada», «optimizar procesos», «redes sociales» sin canal ni cuenta); nombres de autores, de libros, de métodos con nombre propio o de otras empresas (se dice la idea, nunca de quién es); prometer resultados (nunca «vas a ganar»: lo que se espera se dice con «si…» y con su cuenta).

EL TONO
- Directo y sereno. Los casos a tener en cuenta se escriben con calma y con su solución: qué puede pasar, por qué, qué haremos y qué señal lo avisa. Nada de «grave», «crisis», «quiebra», «peligro», «urgente» ni signos de exclamación: asustar no da salida.
- Frases cortas, en castellano de todos los días. «Dinero», no «plata».`;

/**
 * Cómo se escribe el efecto de una jugada o de un cruce: qué ids van en cada campo. La cuenta la hace 8X
 * (proyeccion.ts). Es estructura: nombra campos del esquema, nunca un monto.
 */
export const GUIA_EFECTOS = `CÓMO SE ESCRIBE EL EFECTO (la cuenta la hace 8X; tú solo nombras qué se mueve y con qué supuesto)
- precio_linea · linea: el id corto de una línea de lo que vende (L: y su clave, sin el campo) · pct: el id de tu supuesto de «precio.pct».
- costo_parte · linea · parte: el nombre exacto de una de las partes del costo de esa línea (están en el material) · pct: supuesto de «costo_parte.pct» (negativo: la parte baja).
- volumen_linea · linea · pct: supuesto de «volumen.pct».
- precio_general · pct: supuesto de «precio.pct» sobre toda la venta, si se vende lo mismo.
- conversion · interesados: el id del dato de hoy (N:, Q: o su X: si falta) · de_cada_10_nuevo: supuesto de «conversion.de_cada_10_nuevo», con ancla N:conversion_de_cada_10.
- recompra · clientes: el id del dato de hoy · veces_mes: el id del dato de hoy, o null · de_cada_10: supuesto de «recompra.de_cada_10_nuevo», con ancla Q:clientes_que_vuelven_de_cada_10. Cuenta solo lo que se suma, no la recompra que ya existe.
- cierre_fuga · fuga: un id C:fuga.… (una fuga del mes; el dinero parado C:parado.… no es una fuga) · de_cada_10: supuesto de «cierre_fuga.de_cada_10».
- gasto_fijo · pct: supuesto de «gasto_fijo.pct» (negativo: el gasto baja y la utilidad sube).
- dias_cobro · menos_dias: supuesto de «dias_cobro.menos_dias», con ancla C:poder.dias_cobro_hoy.
- inventario_liberado · de_cada_10: supuesto de «inventario.de_cada_10» sobre la mercadería parada.
- habilitador · abre: el id de la jugada que abre (J y su número).
En el efecto, el supuesto va por su id solo (sin «S:»); en los textos se cita con llaves y su prefijo: {{S:…}}. Un dato de hoy nunca es un supuesto: si falta, va su X: y la jugada queda por probar. Un supuesto que no usa ninguna jugada, ningún cruce ni ninguna victoria sobra.
- Una victoria de los primeros 14 días lleva efecto si mueve la caja: cierre_fuga (deja de salir cada mes), dias_cobro o inventario_liberado (entra una vez), con un supuesto de su clave. Si no mueve dinero, su efecto va vacío.`;

/** Una línea por clave del catálogo, sin sus límites: los de cambio (se suponen) y los de estado actual (se preguntan). */
export function bloqueCatalogo(): string {
  const usanCambio = (clave: string) => Object.entries(CLAVE_DE_EFECTO).filter(([, c]) => c === clave).map(([t]) => t);
  const cambio = Object.values(CLAVES_SUPUESTO).filter((d) => d.tipo === "cambio");
  const hoy = Object.values(CLAVES_SUPUESTO).filter((d) => d.tipo === "estado_actual" && d.clave !== "otra");
  return [
    "CATÁLOGO DE CLAVES (los límites de cada una los aplica 8X)",
    "Lo único que se supone — cuánto CAMBIA algo con una jugada (va en supuestos):",
    ...cambio.map((d) => `- ${d.clave} · ${d.nombre} · unidad ${d.unidad}${d.ancla ? ` · parte del dato de hoy ${d.ancla}` : ""}${usanCambio(d.clave).length ? ` · lo usa el efecto ${usanCambio(d.clave).join(", ")}` : ""}`),
    "Lo que NO se supone — cuánto ES algo hoy (va en faltan; su pregunta la escribe 8X):",
    ...hoy.map((d) => `- ${d.clave} · ${d.que_falta}`),
    "- otra · algo que el catálogo no nombra: escribe la pregunta en pregunta_si_otra (una sola pregunta, corta, por la última vez que pasó, sin cifras, sin ejemplos, sin promedios y sin palabras técnicas) y, si la respuesta es un número, en qué se mide en unidad_si_otra (soles, de_cada_10, dias, unidades_mes, veces_mes, horas_semana o personas): así se responde con su casilla de número y entra en las cuentas. Si no es un número, unidad_si_otra va vacía; en las demás claves, también.",
  ].join("\n");
}

/** Los rótulos con que cada agente acota (comoDato) lo que viene de la empresa o del modelo. */
export const ETIQUETA = {
  paquete: "PAQUETE DE HECHOS Y CÁLCULOS DE LA EMPRESA",
  lineas: "LO QUE VENDE Y LAS PARTES DE SU COSTO",
  poder: "EL PODER DEL UNO, DE LO QUE MÁS MUEVE A LO QUE MENOS",
  caminoA: "CAMINO A · LO QUE PROPUSO LA LENTE DEL DINERO (sus ids locales: A.F1, A.T1, A.J1…; en «ids», qué es cada uno)",
  caminoB: "CAMINO B · LO QUE PROPUSO LA LENTE DE LA OPERACIÓN Y EL TERRENO (sus ids locales: B.F1, B.T1, B.J1…)",
  proyecciones: "LO QUE CALCULÓ 8X PARA CADA CAMINO (ids R: que puedes citar; cada jugada tiene además su ritmo al mes a los 14, 30 y 90 días: R:<camino>.<jugada>.d14, .d30 y .d90)",
  anterior: "TU SALIDA ANTERIOR",
  rechazado: "LO QUE RECHAZÓ EL VALIDADOR (dónde, qué y qué hacer)",
} as const;
export const TITULO_LISTA_DE_CONTROL = "LA LISTA DE CONTROL CON LA QUE 8X VA A JUZGAR EL RESULTADO (ataca con ella; el veredicto lo da 8X)";
export const PIDE_ROJO = "Ataca los dos caminos, arréglalos con tus cambios y deja la versión final. Cita solo ids que aparecen arriba.";

/** Lo que va al final de cada mensaje de sistema: el formato de salida. */
export const CIERRE_JSON = "Devuelve SOLO el JSON del esquema pedido, completo, sin texto antes ni después.";

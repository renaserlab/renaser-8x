import { ai } from "..";
import { SalidaMedidor } from "@/lib/schemas";
import { GUARDIA } from "@/lib/rules/patrones";

/**
 * EL MEDIDOR. En el catálogo estaba escrito que "las incidencias son la mina de KPIs" y no había una
 * sola línea que las extrajera. Este agente lee lo que la empresa contó que sale mal seguido, y sus
 * acciones del plan, y propone los números concretos que avisan si el problema vuelve.
 *
 * La regla que lo hace útil y no un generador de tableros: un indicador que el dueño no pueda contar
 * él mismo, con lo que ya tiene, no sirve — es una tarea más, no una medición.
 */
export const PROMPT_MEDIDOR = `${GUARDIA}

Conviertes los problemas repetidos de una empresa pequena peruana en NUMEROS que se pueden
vigilar. No inventas un tablero: eliges los pocos que avisan si el problema vuelve.

Devuelve JSON { "indicadores": [...] }. Como maximo SEIS. Mejor tres buenos que seis flojos.

Cada indicador:
- clave: snake_case corto y estable (devoluciones_mes, descuadres_caja_mes, entregas_tarde_de_cada_10)
- nombre: como se lo dirias al dueno, sin jerga y sin siglas. Nunca "KPI", "tasa" ni "ratio".
- como_se_mide: la cuenta concreta, en UNA frase que alguien pueda ejecutar manana sin sistemas
  nuevos. Di de donde sale el dato ("del cuaderno de caja", "contando los reclamos de WhatsApp").
- unidad: soles | de_cada_10 | dias | personas | numero | porcentaje
- mejor_si: sube | baja | neutro — hacia donde es mejorar
- meta_valor: el numero al que hay que llegar, si la empresa dio con que comparar; si no, null
- meta_texto: la meta dicha en palabras ("de 4 descuadres al mes a maximo 1")
- frecuencia: diaria | semanal | mensual — la que el negocio pueda sostener, no la ideal
- origen_texto: el problema del que sale, con las palabras de la empresa. Es lo que le da sentido.

REGLAS QUE NO SE ROMPEN:
- Solo indicadores que salgan de lo que la empresa CONTO. Si no hay incidencias descritas,
  devuelve indicadores: [] en vez de inventar los tipicos del rubro.
- El dueno tiene que poder contarlo el mismo con lo que YA tiene: un cuaderno, el WhatsApp, la caja.
  Si medirlo exige un sistema que no tiene, no sirve — es una tarea mas, no una medicion.
- Nada de indicadores de vanidad (seguidores, visitas). Solo lo que toca el dinero, el cliente
  o el trabajo que se rehace.
- Preferir contar HECHOS sobre estimar porcentajes: "cuantas veces de cada 10" antes que "% de
  eficiencia". El dueno cuenta, no calcula.
- Si dos incidencias se vigilan con el mismo numero, es UN indicador, no dos.
- meta_valor solo si la empresa dio una base real. Nunca inventes una meta redonda porque suena bien.

Devuelve solo el JSON.`;

export async function correrMedidor(contexto: string) {
  return ai().complete({
    system: PROMPT_MEDIDOR,
    user: contexto,
    schema: SalidaMedidor,
    priority: "batch",
    maxTokens: 1600,
    agente: "medidor",
  });
}

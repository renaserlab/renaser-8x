import { ai } from "..";
import { SalidaPlanificador, SalidaRedactor, SalidaAdmision } from "@/lib/schemas";

export const PROMPT_PLANIFICADOR = `Recibes los hallazgos aprobados de las cuatro P y los procesos TO-BE.

Devuelve el plan de implementacion de 45 dias (7 semanas, la ultima corta) en JSON:
{ "frentes": [{ prioridad, semana_inicio, semana_cierre, accion,
             responsable, kpi, evidencia, impacto, finding_id }] }

REGLAS:
- Maximo 3 frentes abiertos en cualquier semana.
- Las dos primeras semanas solo llevan restricciones criticas:
  lo que desbloquea todo lo demas.
- Todo frente tiene semana de cierre definida (1 a 7).
- Todo frente tiene un KPI medible y un responsable con nombre de
  puesto. "El equipo" no es un responsable.
- Todo frente se vincula a un hallazgo (finding_id de los recibidos). Ninguno huerfano.
- Ordena por lo que produce mayor multiplicacion, no por lo mas facil.
- Redacta cada accion en lenguaje simple, como una instruccion que el
  dueno pueda repetirle a su equipo sin traducir.
- evidencia: que prueba fisica o digital demuestra que el frente cerro.`;

export async function correrPlanificador(contexto: string) {
  return ai().complete({ system: PROMPT_PLANIFICADOR, user: contexto, schema: SalidaPlanificador, priority: "batch", maxTokens: 5000 });
}

export const PROMPT_REDACTOR = `Recibes los hallazgos aprobados, los procesos y el plan de una empresa.
Redactas UN documento de entrega del tipo que se te indica.

Devuelve JSON { "titulo", "secciones": [{ "titulo", "parrafos": [...], "fuentes": [...] }] }.

REGLAS:
- Lenguaje llano. Frases cortas. Cero jerga de consultoria.
  Nunca escribas "afirmacion", "pilar", "hallazgo", "AS-IS", "TO-BE", "KPI", "SOP":
  di "lo que dice tu empresa", "lo que encontramos", "como funciona hoy",
  "como deberia funcionar", "indicador", "como se hace".
- Toda afirmacion que hagas debe citar su fuente: el documento y
  la fecha, o "segun lo que nos contaste el [fecha]". Pon las citas en "fuentes".
- Si un dato no tiene fuente, NO entra en el documento.
- No uses superlativos ni lenguaje de venta. Este documento no vende:
  informa.
- Estructura: que encontramos, en que nos basamos, que significa,
  que hacer.`;

export async function correrRedactor(contexto: string) {
  return ai().complete({ system: PROMPT_REDACTOR, user: contexto, schema: SalidaRedactor, priority: "batch", maxTokens: 8000 });
}

export const PROMPT_ADMISION = `Evaluas si una empresa es admisible al programa 8X a partir de su cuestionario de admision.

Admisible: facturacion validada y sostenida · producto con validacion de mercado ·
dueno comprometido con su propio cambio · disposicion a invertir y transformar ·
valora su tiempo, su salud y su vision.

No admisible: emprendedores sin negocio en marcha · negocios sin validacion de mercado ·
empresas en quiebra buscando salvavidas · quien busca soluciones rapidas sin implicarse ·
duenos que no estan dispuestos a cambiar ellos primero.

La respuesta a "que no esta dispuesto a cambiar bajo ninguna circunstancia" predice el
resultado mejor que cualquier cifra.

Devuelve JSON { "admisible": boolean, "motivo": "dos frases para el consultor", "senales": ["..."] }.
Es una recomendacion: el consultor decide.`;

export async function correrAdmision(cuestionario: string) {
  return ai().complete({ system: PROMPT_ADMISION, user: cuestionario, schema: SalidaAdmision, priority: "batch", maxTokens: 800 });
}

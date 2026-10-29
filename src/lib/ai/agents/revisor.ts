import { ai } from "..";
import { SalidaRevisionDocumental } from "@/lib/schemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";
import { vara, type Vara } from "@/lib/metodo/varas";

/**
 * EL REVISOR: mide un documento del cliente contra la vara de su tipo.
 *
 * LA REGLA QUE LO GOBIERNA (Kelin, 18-10-2026): lo que el cliente nos entrega es MATERIA PRIMA, no
 * producto terminado. No se archiva tal cual: entra, se mide, y sale una versión mejorada según
 * nuestro sistema, nuestros referentes y nuestra metodología.
 *
 * Y NO REESCRIBE NADA. Devuelve qué conservar, qué falla y qué proponer. Sustituir un documento
 * que la empresa aprobó es una decisión de quien tiene autoridad, no del agente que lo leyó.
 */
export const PROMPT_REVISOR = `${GUARDIA}

Eres un consultor senior de RENASER revisando un documento que una empresa ya tenía.

LO PRIMERO, Y NO SE NEGOCIA: ese documento es MATERIA PRIMA, no basura. Alguien lo escribió, le
costó tiempo y seguramente tiene partes que sirven. Tu trabajo NO es rehacerlo: es decir qué se
conserva, qué falla contra la vara y qué conviene mejorar. Un revisor que solo encuentra defectos
obliga a rehacer todo y tira a la basura el trabajo del cliente.

CÓMO SE REVISA. Recibes la VARA de ese tipo de documento: una lista numerada de exigencias, cada
una con cómo se comprueba. Devuelves UN VEREDICTO POR CADA EXIGENCIA, por su número, sin saltarte
ninguna. Para cada una:
- cumple: "si" | "no" | "no_aplica"
- evidencia: QUÉ ENCONTRASTE en el documento —citando el texto o el dato— o qué buscaste y no
  estaba. Sin esto, un «no cumple» es una opinión tuya y no sirve para corregir nada.
- que_falta: solo cuando no cumple. Qué habría que agregar o cambiar, concreto.
Usa "no_aplica" con cuidado y solo cuando la exigencia de verdad no corresponde a este documento;
si dudas, es "no".

EL RESTO DE LO QUE DEVUELVES:

- tipo_detectado y es_el_tipo_esperado: qué documento es en realidad. Si te dijeron que era un
  manual de procesos y es un reglamento, dilo: revisar contra la vara equivocada no sirve.
- veredicto: sale de los veredictos, no al revés. Si alguna exigencia obligatoria no se cumple, el
  documento no puede salir "cumple".
- que_se_conserva: lo que YA SIRVE y no hay que tocar. Al menos una cosa: si de verdad no hay
  nada, dilo explícitamente ahí. Esto va primero en el informe, antes que los defectos.
- contradicciones_con_lo_vigente: dónde este documento dice lo contrario de algo que la empresa ya
  aprobó o decidió. Es lo más grave que puedes encontrar, porque significa que hoy hay dos reglas.
- relleno_encontrado: repeticiones, secciones que no dicen nada, texto que no cambia nada si se
  borra. Sé concreto: número de función, nombre de sección.
- mejoras_propuestas: entre 1 y 12, cada una con su porqué y cuánto cuesta (minutos, horas o días).
  Ordénalas por lo que más duele. No propongas doce si tres resuelven el problema.
- para_asesor_legal: lo que huela a obligación legal. NO lo resuelvas, NO inventes plazos, montos
  ni artículos: solo dilo para que lo vea el asesor.
- no_se_pudo_comprobar: exigencias que no pudiste verificar porque el documento venía incompleto,
  mal extraído o te falta otro documento. Decirlo es parte del trabajo; adivinar no lo es.

REGLAS QUE NO SE ROMPEN:
- NO REESCRIBAS EL DOCUMENTO. Propones; no entregas la versión nueva.
- CITA O NO LO DIGAS. Cada veredicto se apoya en lo que está escrito en el documento.
- NO INVENTES OBLIGACIONES LEGALES. Van a para_asesor_legal, sin cifras.
- LO VIGENTE MANDA. Si la empresa tiene un manual aprobado, este documento se mide contra él, no
  contra lo que a ti te parezca mejor.
- Español de Perú, llano. Lo lee un consultor y después un dueño.

Devuelve solo el JSON.`;

/** Redacta la vara para el prompt: numerada, con su comprobación y si es obligatoria. */
export function varaComoTexto(v: Vara): string {
  return [
    `VARA DE «${v.tipo}»`,
    `Para quién es el documento: ${v.para_quien_es}`,
    "",
    "EXIGENCIAS — devuelve un veredicto por cada número:",
    ...v.exigencias.map(
      (e, i) =>
        `${i + 1}. [${e.obligatoria ? "OBLIGATORIA" : "deseable"}] ${e.exigencia}\n` +
        `   cómo se comprueba: ${e.como_se_comprueba}\n` +
        `   si no se cumple: ${e.por_que}`
    ),
    "",
    `LO QUE NORMALMENTE SE CONSERVA de estos documentos: ${v.que_se_conserva_casi_siempre}`,
    v.senales_de_relleno.length ? `SEÑALES DE RELLENO EN ESTE TIPO:\n- ${v.senales_de_relleno.join("\n- ")}` : "",
    v.errores_tipicos.length ? `ERRORES TÍPICOS:\n- ${v.errores_tipicos.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function correrRevisor(params: {
  /** La clave de la vara: mof, procesos, atencion, seleccion, reglamento, estrategia. */
  claveVara: string;
  /** El texto del documento que se revisa. */
  documento: string;
  /** Lo que la empresa ya aprobó y que este documento no puede contradecir. */
  loVigente: string;
  /** Contexto de la empresa: puestos, decisiones, números con su estado. */
  contexto: string;
}) {
  const v = vara(params.claveVara);
  const user = [
    varaComoTexto(v),
    "",
    comoDato("EL DOCUMENTO QUE SE REVISA", params.documento),
    "",
    params.loVigente
      ? comoDato("LO QUE LA EMPRESA YA APROBÓ Y RIGE — este documento no puede contradecirlo", params.loVigente)
      : "LO VIGENTE: la empresa todavía no tiene documentación aprobada contra la que contrastar.",
    "",
    params.contexto ? comoDato("LA EMPRESA", params.contexto) : "",
    "",
    `Devuelve exactamente ${v.exigencias.length} veredictos, uno por cada exigencia, del 1 al ${v.exigencias.length}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return ai().complete({
    system: PROMPT_REVISOR,
    user,
    schema: SalidaRevisionDocumental,
    priority: "batch",
    maxTokens: 6000,
    agente: "revisor",
  });
}

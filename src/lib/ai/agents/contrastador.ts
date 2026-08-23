import { ai } from "..";
import { SalidaContrastador } from "@/lib/schemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";

export const PROMPT_CONTRASTADOR = `${GUARDIA}

Recibes dos afirmaciones del mismo tipo sobre la misma empresa.
Determina qué relación tienen.

Devuelve JSON:
- se_contradicen: true | false
- relacion: contradicts | updates | supports | explains | depends_on | ninguna
    contradicts: ambas no pueden ser verdad a la vez
    updates: la misma fuente o persona revisa su propio dato y la nueva version reemplaza a la anterior
    (si dos FUENTES DISTINTAS afirman valores distintos como vigentes — dos metas, dos precios, dos clientes
    objetivo — es contradicts: no pueden ser ambas la verdad actual; indica en cual_parece_vigente la probable)
    supports: dicen lo mismo o una respalda a la otra
    explains: una explica la causa o el contexto de la otra
    depends_on: una solo puede ser verdad si la otra lo es
    ninguna: no tienen relación útil
- explicacion: una frase
- cual_parece_vigente: id o null
- pregunta_sugerida: la pregunta que haria un consultor, o null

REGLAS:
- Dos afirmaciones distintas NO son necesariamente contradictorias.
  Pueden ser complementarias o de niveles distintos.
- Marca contradiccion solo si ambas no pueden ser verdad a la vez.
- Una afirmacion aspiracional no contradice a una actual:
  es una brecha, no una contradiccion.
- Ante la duda, devuelve false en se_contradicen. Un falso positivo hace perder tiempo
  del dueno y destruye la credibilidad del sistema.
- REGLA DE VIGENCIA DEL SISTEMA: la antiguedad de una fuente NO la invalida ni la convierte en
  "superada". Un documento sigue afirmando lo que dice hasta que el dueno lo confirme o lo retire.
  Si dos fuentes distintas presentan valores distintos como actuales (las dos con temporalidad
  "actual"), devuelve contradicts y senala en cual_parece_vigente la que parece valer hoy: el
  sistema se lo preguntara al dueno. "updates" queda reservado a la misma fuente o persona
  revisando su propio dato.
- Un OBJETIVO declarado como vigente y una REALIDAD medida del mismo asunto (el cliente objetivo vs el
  cliente que factura, el canal previsto vs el canal real) tambien es contradicts: la empresa no puede
  sostener ambos como su verdad actual sin decidir. No es la brecha aspiracional (esa es futura y declarada
  como deseo); aqui ambas se presentan como la situacion actual.`;

type LadoContraste = { id: string; texto: string; fuente: string; fecha: string | null; temporalidad?: string | null };
export async function correrContrastador(a: LadoContraste, b: LadoContraste) {
  const temp = (t: string | null | undefined) => (t ? `, temporalidad: ${t}` : "");
  const user = comoDato("AFIRMACIONES", `A (id ${a.id}) — fuente: ${a.fuente}, fecha: ${a.fecha ?? "desconocida"}${temp(a.temporalidad)}\n"${a.texto}"\n\nB (id ${b.id}) — fuente: ${b.fuente}, fecha: ${b.fecha ?? "desconocida"}${temp(b.temporalidad)}\n"${b.texto}"`);
  return ai().complete({ system: PROMPT_CONTRASTADOR, user, schema: SalidaContrastador, priority: "batch", maxTokens: 600, agente: "contrastador" });
}

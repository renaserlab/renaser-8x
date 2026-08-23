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
    updates: la más reciente reemplaza a la anterior sin negarla (un precio nuevo, una meta revisada)
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
  del dueno y destruye la credibilidad del sistema.`;

export async function correrContrastador(a: { id: string; texto: string; fuente: string; fecha: string | null }, b: { id: string; texto: string; fuente: string; fecha: string | null }) {
  const user = comoDato("AFIRMACIONES", `A (id ${a.id}) — fuente: ${a.fuente}, fecha: ${a.fecha ?? "desconocida"}\n"${a.texto}"\n\nB (id ${b.id}) — fuente: ${b.fuente}, fecha: ${b.fecha ?? "desconocida"}\n"${b.texto}"`);
  return ai().complete({ system: PROMPT_CONTRASTADOR, user, schema: SalidaContrastador, priority: "batch", maxTokens: 600, agente: "contrastador" });
}

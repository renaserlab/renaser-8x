import { ai } from "..";
import { SalidaContrastador } from "@/lib/schemas";

export const PROMPT_CONTRASTADOR = `Recibes dos afirmaciones del mismo tipo sobre la misma empresa.
Determina si se contradicen.

Devuelve JSON:
- se_contradicen: true | false
- explicacion: una frase
- cual_parece_vigente: id o null
- pregunta_sugerida: la pregunta que haria un consultor, o null

REGLAS:
- Dos afirmaciones distintas NO son necesariamente contradictorias.
  Pueden ser complementarias o de niveles distintos.
- Marca contradiccion solo si ambas no pueden ser verdad a la vez.
- Una afirmacion aspiracional no contradice a una actual:
  es una brecha, no una contradiccion.
- Ante la duda, devuelve false. Un falso positivo hace perder tiempo
  del dueno y destruye la credibilidad del sistema.`;

export async function correrContrastador(a: { id: string; texto: string; fuente: string; fecha: string | null }, b: { id: string; texto: string; fuente: string; fecha: string | null }) {
  const user = `AFIRMACIÓN A (id ${a.id}) — fuente: ${a.fuente}, fecha: ${a.fecha ?? "desconocida"}\n"${a.texto}"\n\nAFIRMACIÓN B (id ${b.id}) — fuente: ${b.fuente}, fecha: ${b.fecha ?? "desconocida"}\n"${b.texto}"`;
  return ai().complete({ system: PROMPT_CONTRASTADOR, user, schema: SalidaContrastador, priority: "batch", maxTokens: 600 });
}

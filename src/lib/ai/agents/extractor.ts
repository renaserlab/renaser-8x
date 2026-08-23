import { ai } from "..";
import type { Adjunto } from "../provider";
import { SalidaExtractor } from "@/lib/schemas";

export const PROMPT_EXTRACTOR = `Eres un extractor de afirmaciones. NO interpretas, NO concluyes, NO resumes.

Recibes el texto de un documento empresarial, la transcripción de una
nota de voz, o el texto leído de una foto. Devuelve un objeto JSON con
la clave "afirmaciones": un array.
Una afirmación es una declaración concreta sobre cómo es o cómo debería
ser la empresa.

Para cada una:
- texto: la afirmación en una frase, cercana al original
- pilar: personas | procesos | producto | marketing | transversal
- tipo: vision | proposito | meta | proceso | rol | kpi | precio |
        politica | cliente | producto | canal | otro
- temporalidad: actual | historica | aspiracional
- fecha_afirmacion: YYYY-MM-DD o null
- fragmento: el trozo literal del original del que sale (para resaltarlo), o null
- pagina: número de página si se conoce, o null
- seccion: título de sección o celda (ej. "Ventas!F17") si se conoce, o null

REGLAS:
- Si el documento no indica fecha, devuelve null. NUNCA la estimes.
- Intención futura o meta -> temporalidad = aspiracional.
- No inventes afirmaciones que el texto no contiene.
- Si una frase es vaga ("somos los mejores", "cultura de excelencia"),
  extraela igual: la vaguedad es en si misma un hallazgo.
- Una frase larga puede contener varias afirmaciones. Separalas.
- Si el texto viene de una foto o transcripcion y hay partes ilegibles,
  no las completes. Omitelas.

Devuelve solo el JSON.`;

export async function correrExtractor(opts: {
  texto?: string;
  adjuntos?: Adjunto[];
  contexto: string; // "Documento: Plan estratégico 2023, páginas 1-12"
}) {
  const user = `${opts.contexto}\n\n${opts.texto ? `TEXTO:\n${opts.texto}` : "El contenido viene adjunto (imagen o PDF). Lee lo que dice y extrae."}`;
  return ai().complete({ system: PROMPT_EXTRACTOR, user, schema: SalidaExtractor, priority: "batch", adjuntos: opts.adjuntos, maxTokens: 12000 });
}

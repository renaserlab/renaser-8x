/** Aísla qué parte del esquema del plan rechaza Gemini (error completo, luego bisección). */
import { z } from "zod";
import { SalidaPlanEstrategico } from "../../src/lib/schemas";

const llamar = async (schema: unknown) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Devuelve un ejemplo mínimo." }] }],
      generationConfig: { maxOutputTokens: 2000, responseMimeType: "application/json", responseJsonSchema: schema },
    }),
  });
  return { status: r.status, text: (await r.text()).slice(0, 800) };
};

const completo = z.toJSONSchema(SalidaPlanEstrategico, { unrepresentable: "any" });
const r1 = await llamar(completo);
console.log("COMPLETO:", r1.status, r1.status !== 200 ? r1.text : "OK");
if (r1.status !== 200) {
  // bisección por propiedad de primer nivel
  const props = (completo as { properties: Record<string, unknown>; required?: string[] }).properties;
  for (const [k, v] of Object.entries(props)) {
    const sub = { type: "object", properties: { [k]: v }, required: [k] };
    const r = await llamar(sub);
    if (r.status !== 200) console.log(`FALLA en "${k}":`, r.text.slice(0, 250));
    else console.log(`ok ${k}`);
  }
}

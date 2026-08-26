import { protegido, ok, fallo } from "@/lib/api";
import { ai, hayTranscriptor } from "@/lib/ai";

/**
 * Transcripción para usuarios con sesión (dueño en el portal, consultor): recibe el audio real del
 * MediaRecorder y devuelve el texto para que la persona lo confirme ANTES de guardarlo.
 */
// Audios largos (5+ minutos reales de un dueño contando) necesitan aire: el corte a 120s perdía la grabación.
export const maxDuration = 300;

export const POST = protegido({}, async (_perfil, req) => {
  if (!hayTranscriptor()) return fallo("Por ahora no podemos escuchar audios.", 400);
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return fallo("Falta el audio.");
  if (audio.size > 25 * 1024 * 1024) return fallo("El audio es muy largo. Graba en partes más cortas.");
  const t = await ai().transcribe(audio, audio.type || "audio/webm");
  return ok({ texto: t.texto });
});

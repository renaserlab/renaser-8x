/** Transcripción desde el navegador (sesión iniciada): audio real → texto que la persona confirma. */
export async function transcribirAudio(b: Blob): Promise<string> {
  const form = new FormData();
  form.set("audio", b, "respuesta.webm");
  const r = await fetch("/api/transcribir", { method: "POST", body: form });
  const j = (await r.json()) as { texto?: string; error?: string };
  if (!r.ok || !j.texto) throw new Error(j.error ?? "No pudimos entender el audio.");
  return j.texto;
}

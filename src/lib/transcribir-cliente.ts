/** Transcripción desde el navegador (sesión iniciada): audio real → texto que la persona confirma. */
export async function transcribirAudio(b: Blob): Promise<string> {
  const form = new FormData();
  form.set("audio", b, "respuesta.webm");
  const r = await fetch("/api/transcribir", { method: "POST", body: form });
  // Un timeout del servidor devuelve texto plano, no JSON: jamás reventar por eso.
  let j: { texto?: string; error?: string } = {};
  try {
    j = (await r.json()) as { texto?: string; error?: string };
  } catch {
    j = {};
  }
  if (!r.ok || !j.texto) throw new Error(j.error ?? "No pudimos convertir el audio a texto en este momento.");
  return j.texto;
}

import { NextResponse, type NextRequest } from "next/server";
import { participantePorToken } from "@/lib/participar";
import { ai, hayTranscriptor } from "@/lib/ai";

/**
 * Transcripción para el participante (token de sesión en cabecera): audio real del MediaRecorder →
 * texto que la persona confirma antes de guardar. Mismo contrato que /api/transcribir.
 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-participante-token") ?? "";
  const p = await participantePorToken(token);
  if (!p) return NextResponse.json({ error: "Esta sesión ya no es válida." }, { status: 404 });
  if (!hayTranscriptor()) return NextResponse.json({ error: "Por ahora no podemos escuchar audios." }, { status: 400 });
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "Falta el audio." }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "El audio es muy largo. Graba en partes más cortas." }, { status: 400 });
  try {
    const t = await ai().transcribe(audio, audio.type || "audio/webm");
    return NextResponse.json({ texto: t.texto });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No pudimos entender el audio." }, { status: 400 });
  }
}

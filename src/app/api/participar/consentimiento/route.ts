import { consentirParticipante, INVALIDO } from "@/lib/participar";

/** LEY 29733: la persona entrevistada acepta antes de la primera pregunta. Token en cabecera. */
export async function POST(req: Request) {
  const token = req.headers.get("x-participante-token") ?? "";
  if (!token) return INVALIDO();
  return consentirParticipante(token);
}

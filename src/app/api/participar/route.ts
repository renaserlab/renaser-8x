import { estadoParticipante, responderParticipante, INVALIDO } from "@/lib/participar";

/** Token en cabecera `x-participante-token` (P2-17): no queda en URLs ni en logs de acceso. */
export async function GET(req: Request) {
  const token = req.headers.get("x-participante-token") ?? "";
  if (!token) return INVALIDO();
  return estadoParticipante(token);
}

export async function POST(req: Request) {
  const token = req.headers.get("x-participante-token") ?? "";
  if (!token) return INVALIDO();
  return responderParticipante(token, await req.formData());
}

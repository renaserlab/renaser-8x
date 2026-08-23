import { canjearParticipante, INVALIDO } from "@/lib/participar";

/** Canje único del enlace de participante: token del enlace (cabecera) → token de sesión. El enlace queda inutilizado. */
export async function POST(req: Request) {
  const token = req.headers.get("x-participante-token") ?? "";
  if (!token) return INVALIDO();
  return canjearParticipante(token);
}

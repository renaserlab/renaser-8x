import { protegido, ok, fallo } from "@/lib/api";
import { puedeAcceder } from "@/lib/auth";
import { autorizarSesion } from "@/lib/sesiones";
import { registrarRespuesta } from "@/lib/entrevista";

type Ctx = { params: Promise<{ sesion: string }> };

/** multipart: texto | audio (File), response_id?  ·  P0-05: solo la sesión propia, o consultor. */
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, req, ctx) => {
  const { sesion } = await ctx.params;
  const { decision, sesion: ses } = await autorizarSesion(perfil, sesion, (c) => puedeAcceder(perfil, c));
  if (!decision.permitido) return fallo(decision.motivo, decision.status);
  const form = await req.formData();
  const audio = form.get("audio");
  const r = await registrarRespuesta({
    session_id: sesion,
    company_id: ses!.company_id,
    response_id: String(form.get("response_id") ?? "") || undefined,
    texto: String(form.get("texto") ?? ""),
    audio: audio instanceof File ? audio : undefined,
    mime: audio instanceof File ? audio.type : undefined,
  });
  return ok(r);
});

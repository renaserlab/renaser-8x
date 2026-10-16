import { protegido, ok, fallo } from "@/lib/api";
import { puedeAcceder } from "@/lib/auth";
import { autorizarSesion } from "@/lib/sesiones";
import { registrarRespuesta } from "@/lib/entrevista";
import { ReglaEntrada } from "@/lib/entrada";

type Ctx = { params: Promise<{ sesion: string }> };

/** multipart: texto | audio (File), response_id?  ·  P0-05: solo la sesión propia, o consultor. */
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, req, ctx) => {
  const { sesion } = await ctx.params;
  const { decision, sesion: ses } = await autorizarSesion(perfil, sesion, (c) => puedeAcceder(perfil, c));
  if (!decision.permitido) return fallo(decision.motivo, decision.status);
  const form = await req.formData();
  const audio = form.get("audio");
  // La entrada breve se responde por su propia ruta: aquí se rechaza con su mensaje y su código, no como error del servidor.
  let r;
  try {
    r = await registrarRespuesta({
      session_id: sesion,
      company_id: ses!.company_id,
      response_id: String(form.get("response_id") ?? "") || undefined,
      texto: String(form.get("texto") ?? ""),
      audio: audio instanceof File ? audio : undefined,
      mime: audio instanceof File ? audio.type : undefined,
    });
  } catch (e) {
    if (e instanceof ReglaEntrada) return fallo(e.message, e.status);
    throw e;
  }
  return ok(r);
});

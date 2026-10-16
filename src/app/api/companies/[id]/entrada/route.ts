import { z } from "zod";
import { protegido, ok, fallo, exigirAcceso, leerJSON, uuid, AccesoDenegado, EntradaInvalida } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { entradaDeUsuario, estadoEntrada, sesionEntradaDeEmpresa, ESTADO_SIN_SESION, ReglaEntrada } from "@/lib/entrada";
import { iniciarEntrada, responderEntrada, confirmarEntrada } from "@/lib/entrevista";

type Ctx = { params: Promise<{ id: string }> };

const MAX_AUDIO_MB = 25;

/**
 * LA ENTRADA BREVE DEL DUEÑO (R7.1). Tres acciones, todas del dueño de la empresa:
 *  · iniciar   → crea la sesión (una por empresa, con el plan de doce preguntas) y abre la primera; sirve
 *                también para retomar si la sesión quedó sin pregunta abierta.
 *  · responder → guarda la respuesta a la pregunta abierta y abre la siguiente. `modo` dice cómo responde:
 *                texto (o un audio, en multipart), no_lo_se, confirma (lo que ya sabíamos) o documento.
 *  · confirmar → el dueño da por bueno «lo que entendimos», con sus correcciones.
 * Las reglas viven en src/lib/entrada.ts y src/lib/entrevista.ts; aquí solo se comprueba quién pregunta y se
 * valida lo que llega. La siguiente pregunta la decide el plan, no el modelo: por eso responde al instante.
 */
const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("iniciar") }),
  z.object({
    accion: z.literal("responder"),
    response_id: uuid,
    modo: z.enum(["texto", "no_lo_se", "confirma", "documento"]),
    texto: z.string().trim().max(4000).optional(),
    aproximado: z.boolean().optional(),
  }),
  z.object({
    accion: z.literal("confirmar"),
    correcciones: z.array(z.object({ clave: z.string().max(80), texto: z.string().trim().min(1).max(4000) })).max(12),
  }),
]);

/** JSON para casi todo; multipart solo cuando la respuesta trae un audio grabado. */
async function leerCuerpo(req: Request): Promise<{ cuerpo: z.infer<typeof Cuerpo>; audio: File | null }> {
  let crudo: Record<string, unknown>;
  let audio: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const archivo = form.get("audio");
    audio = archivo instanceof File && archivo.size > 0 ? archivo : null;
    crudo = {
      accion: "responder",
      response_id: String(form.get("response_id") ?? ""),
      modo: "texto",
      texto: String(form.get("texto") ?? ""),
      aproximado: form.get("aproximado") === "1",
    };
  } else {
    crudo = await leerJSON(req);
  }
  const r = Cuerpo.safeParse(crudo);
  if (!r.success) throw new EntradaInvalida([...new Set(r.error.issues.map((i) => i.path.join(".") || "cuerpo"))]);
  return { cuerpo: r.data, audio };
}

/** El estado de la entrada para la pantalla. El consultor (modo «ver como el empresario») mira y no escribe. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const vista = await entradaDeUsuario(id, perfil, supabaseAdmin());
  return ok(vista.estado);
});

export const POST = protegido<Ctx>({ cupo: "ia", entidad: "entrada" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  // Tener acceso a la empresa no basta: la entrada la responde su dueño, y el intento de otro deja rastro.
  const vista = await entradaDeUsuario(id, perfil, sb);
  if (!vista.puedeResponder) throw new AccesoDenegado(vista.motivoSoloLectura ?? "Estas preguntas las responde el dueño de la empresa.", "rol", id);

  const { cuerpo, audio } = await leerCuerpo(req);
  if (audio && audio.size > MAX_AUDIO_MB * 1024 * 1024) return fallo("El audio es muy largo. Graba en partes más cortas.");

  try {
    if (cuerpo.accion === "iniciar") {
      await iniciarEntrada({ company_id: id, perfil });
    } else {
      const sesion = await sesionEntradaDeEmpresa(id, sb);
      if (!sesion) return fallo("Todavía no empezaste. Toca «Empezar».", 409);
      if (cuerpo.accion === "responder") {
        await responderEntrada({
          session_id: sesion.id,
          company_id: id,
          response_id: cuerpo.response_id,
          modo: cuerpo.modo,
          texto: cuerpo.texto,
          aproximado: cuerpo.aproximado,
          audio: audio ?? undefined,
          mime: audio?.type || undefined,
        });
      } else {
        await confirmarEntrada({ session_id: sesion.id, company_id: id, correcciones: cuerpo.correcciones });
      }
    }
  } catch (e) {
    // Una regla de la entrada que no se cumple se le dice a la persona con su mensaje; no es un error del sistema.
    if (e instanceof ReglaEntrada) return fallo(e.message, e.status);
    throw e;
  }
  const sesion = await sesionEntradaDeEmpresa(id, sb);
  return ok(sesion ? await estadoEntrada(sesion.id, sb) : ESTADO_SIN_SESION);
});

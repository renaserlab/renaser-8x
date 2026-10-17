import { protegido, ok, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { nivelEnEmpresa } from "@/lib/solicitudes";
import { enviarPreguntas, listarPreguntas, vistaPreviaDeEnvio } from "@/lib/estrategia/preguntas";
import { CuerpoEnviarPreguntas } from "@/lib/estrategia/cuerpos";
import { PREGUNTAS } from "@/lib/estrategia/textos";
import { esId, respuesta, rastro } from "../estrategia/_comun";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: las preguntas de la estrategia. La consultora ve todas (también las propuestas, con su porqué y las jugadas que
 * esperan cada respuesta) y lo que se le abriría al dueño al enviarlas (`?estrategia_id=` para una versión; si no, la
 * más nueva con su estrategia). El dueño (o un líder), solo las enviadas y las respondidas de su empresa, sin lo de la
 * consultora: se filtra en la consulta. Una persona del equipo no las lee.
 */
export const GET = protegido<Ctx>({ entidad: "estrategia_pregunta" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) {
    // Las preguntas de su plan son de quien dirige: una persona del equipo no las lee.
    const nivel = await nivelEnEmpresa(perfil.id, id);
    if (nivel !== "dueno" && nivel !== "lider") throw new AccesoDenegado(PREGUNTAS.solo_quien_dirige, "autoridad", id);
  }
  const r = await listarPreguntas(id, { paraDueno: !esConsultora });
  if (!r.ok || !esConsultora) return respuesta(r);
  const eid = new URL(req.url).searchParams.get("estrategia_id");
  const previa = await vistaPreviaDeEnvio(id, eid && esId(eid) ? eid : null);
  if (!previa.ok) return respuesta(previa);
  const propuestas = r.preguntas.filter((p) => p.estado === "propuesta").length;
  return ok({ preguntas: r.preguntas, por_abrir: { estrategia_id: previa.estrategia_id, secciones: previa.secciones, resumen: PREGUNTAS.resumen_envio(propuestas, previa.secciones.map((s) => s.nombre)) } });
});

/**
 * POST (consultora): «Enviar las N preguntas» (spec-estrategia-8x.md §7.2), un solo toque. Las elegidas pasan a
 * «enviada», se activa —o se le actualiza la nota— el pedido «Unas preguntas para afinar tu plan», y se abren las
 * secciones de lo que falta con sus líneas agregadas a la nota. Lo ya enviado no se repite.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "estrategia_pregunta" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, CuerpoEnviarPreguntas);
  const r = await enviarPreguntas({ companyId: id, ids: b.enviar, estrategiaId: b.estrategia_id ?? null, secciones: b.secciones ?? null, porId: perfil.id });
  if (r.ok) rastro(req, perfil, id, "publicar", r.solicitud_id, { enviadas: r.enviadas, ya_enviadas: r.ya_enviadas, secciones: r.secciones.map((s) => s.seccion) }, "estrategia_pregunta");
  return respuesta(r);
});

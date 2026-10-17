import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { exigirLlenado } from "@/lib/solicitudes";
import { responderPregunta, retirarPregunta, retocarPregunta } from "@/lib/estrategia/preguntas";
import { CuerpoPreguntaConsultora, CuerpoRespuestaDueno } from "@/lib/estrategia/cuerpos";
import { PREGUNTAS } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { esId, respuesta, rastro } from "../../estrategia/_comun";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/**
 * PATCH: cada uno lo suyo.
 *  - La consultora retoca una pregunta antes de enviarla (su texto pasa por las mismas reglas que las del catálogo:
 *    una sola pregunta, corta, sin cifras ni jerga) o la retira. Si retira la última enviada, el pedido del dueño se
 *    retira también: no entra a una página vacía.
 *  - El dueño (o un líder de la empresa) responde una pregunta ENVIADA a su empresa, mientras su pedido esté abierto
 *    (exigirLlenado): con un número, de cuánto a cuánto o «No lo sé», o con texto si la pregunta es abierta. Nunca
 *    «comprobado»: eso lo marca la consultora. Guarda al salir de cada tarjeta; mientras el pedido siga abierto puede
 *    corregir lo que ya respondió.
 */
export const PATCH = protegido<Ctx>({ entidad: "estrategia_pregunta" }, async (perfil, req, ctx) => {
  const { id, pid } = await ctx.params;
  await exigirAcceso(perfil, id);

  if (perfil.rol === "consultor") {
    if (!esId(pid)) return respuesta(no(404, "no_es_de_la_empresa", PREGUNTAS.no_es_de_la_empresa));
    const b = await leerValidado(req, CuerpoPreguntaConsultora);
    const r = "retirar" in b ? await retirarPregunta({ companyId: id, id: pid, porId: perfil.id }) : await retocarPregunta({ companyId: id, id: pid, texto: b.texto ?? null, por_que: b.por_que });
    if (r.ok) rastro(req, perfil, id, "editar", pid, { retirada: "retirar" in b }, "estrategia_pregunta");
    return respuesta(r);
  }

  await exigirLlenado(perfil, id, "preguntas_estrategia");
  if (!esId(pid)) return respuesta(no(404, "no_esta_para_ti", PREGUNTAS.no_esta_para_ti));
  const b = await leerValidado(req, CuerpoRespuestaDueno);
  const r = await responderPregunta({ companyId: id, id: pid, porId: perfil.id, respuesta: b.respuesta, respuesta_texto: b.respuesta_texto ?? null });
  if (r.ok) rastro(req, perfil, id, "editar", pid, { respondida: true }, "estrategia_pregunta");
  return respuesta(r);
});

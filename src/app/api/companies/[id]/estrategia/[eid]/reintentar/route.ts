import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { reintentarEtapa } from "@/lib/estrategia/acciones";
import { CuerpoReintentar } from "@/lib/estrategia/cuerpos";
import { API } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { esId, respuesta, rastro } from "../../_comun";

type Ctx = { params: Promise<{ id: string; eid: string }> };

/**
 * POST (consultora): «Reintentar esta etapa» (spec-estrategia-8x.md §5.4). Vuelve a encolar SOLO la etapa que falló,
 * sobre su último trabajo (reencolarSeguro; el original no se borra) y anota el nuevo en la versión. Lo ya pagado no
 * se repite: una lente guardada no vuelve a llamar al modelo. Gasta consultas: lleva el cupo de la IA.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia", entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  const b = await leerValidado(req, CuerpoReintentar);
  const r = await reintentarEtapa({ companyId: id, id: eid, etapa: b.etapa ?? null });
  if (r.ok) rastro(req, perfil, id, "editar", eid, { reintentos: r.reintentos });
  return respuesta(r);
});

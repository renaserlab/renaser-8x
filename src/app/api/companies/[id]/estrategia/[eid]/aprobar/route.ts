import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { aprobarVersion } from "@/lib/estrategia/acciones";
import { CuerpoAprobar } from "@/lib/estrategia/cuerpos";
import { API } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { esId, respuesta, rastro } from "../../_comun";

type Ctx = { params: Promise<{ id: string; eid: string }> };

/**
 * POST: aprobar la estrategia (spec-estrategia-8x.md §2.1 y §8.1). Las dos cosas: el rol de consultora Y la autoridad
 * de aprobar planes. El dueño también tiene `aprobar_plan` por defecto (autoridad.ts), así que la autoridad sola le
 * dejaría aprobar su propia estrategia. Exige el camino elegido y nada sin resolver; congela la página del dueño con las
 * cifras ya escritas, deja la aprobada anterior como reemplazada y guarda la copia en la biblioteca.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  await exigirAutoridad(perfil, "aprobar_plan");
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  const b = await leerValidado(req, CuerpoAprobar);
  const r = await aprobarVersion({ companyId: id, id: eid, porId: perfil.id, motivo: b.motivo ?? null });
  if (r.ok) rastro(req, perfil, id, "aprobar", eid, { entregable_id: r.entregable_id, copia_guardada: !r.aviso });
  return respuesta(r);
});

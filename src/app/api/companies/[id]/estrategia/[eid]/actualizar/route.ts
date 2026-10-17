import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { actualizarNumeros } from "@/lib/estrategia/acciones";
import { CuerpoActualizar } from "@/lib/estrategia/cuerpos";
import { API } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { esId, respuesta, rastro } from "../../_comun";

type Ctx = { params: Promise<{ id: string; eid: string }> };

/**
 * POST (consultora): «Actualizar números» (spec-estrategia-8x.md §7.3). Sin IA y al instante: relee la empresa (lo que
 * respondió el dueño entra como hecho), rehace las cuentas y crea una versión nueva que conserva lo que escribió 8X y lo
 * que corrigió la consultora; dice qué cambió y si conviene volver a pensarla. No cuenta para el tope diario y no se
 * ofrece mientras otra se está generando.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  await leerValidado(req, CuerpoActualizar);
  const r = await actualizarNumeros({ companyId: id, id: eid, porId: perfil.id });
  if (r.ok) rastro(req, perfil, id, "crear", r.estrategia_id, { basada_en: eid, version: r.version, origen: "actualizacion" });
  return respuesta(r, 201);
});

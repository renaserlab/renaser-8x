import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nivelEnEmpresa, solicitudDesdeFila, TEXTO_SECCION_CERRADA, TEXTO_YA_LISTO } from "@/lib/solicitudes";
import { CuerpoSolicitud } from "@/lib/esquemas-negocio";
import { respuestaDeBase } from "../../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; sid: string }> };
const RUTA = "/api/companies/solicitudes";
const COLUMNAS = "id,company_id,seccion,nota,estado,activada_at,completada_at";

/**
 * PATCH: la consultora RETIRA un pedido (el dueño deja de verlo); el dueño o un líder de la empresa lo marca como
 * COMPLETADO («Listo, ya lo llené»), solo si está activo. Cada uno lo suyo: el dueño no retira y la consultora no
 * marca como listo por él.
 */
export const PATCH = protegido<Ctx>({ entidad: "solicitud_cliente" }, async (perfil, req, ctx) => {
  const { id, sid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, CuerpoSolicitud);
  const esConsultora = perfil.rol === "consultor";
  const sb = supabaseAdmin();

  if (!esConsultora) {
    const nivel = await nivelEnEmpresa(perfil.id, id);
    if (nivel !== "dueno" && nivel !== "lider") throw new AccesoDenegado(TEXTO_SECCION_CERRADA, "autoridad", id);
    if (b.estado !== "completada") throw new AccesoDenegado("Retirar un pedido lo hace tu consultora.", "rol", id);
  } else if (b.estado !== "retirada") {
    return fallo("Lo marca como listo el dueño, desde su portal. Desde aquí se puede retirar.", 400);
  }

  const { data: previa, error: errorLeer } = await sb.from("solicitudes_cliente").select(COLUMNAS).eq("id", sid).eq("company_id", id).maybeSingle();
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "PATCH", que: "leer el pedido", perfil, companyId: id });
  const fila = previa as { estado?: string } | null;
  if (!fila) return fallo("Ese pedido no es de esta empresa.", 404);

  const ahora = new Date().toISOString();
  if (!esConsultora) {
    // Lo retirado no existe para el dueño; lo completado ya está.
    if (fila.estado === "retirada") throw new AccesoDenegado(TEXTO_SECCION_CERRADA, "autoridad", id);
    if (fila.estado === "completada") return fallo(TEXTO_YA_LISTO, 409);
  } else if (fila.estado === "retirada") {
    return fallo("Ese pedido ya estaba retirado.", 409);
  }

  const cambios = esConsultora ? { estado: "retirada", retirada_at: ahora } : { estado: "completada", completada_at: ahora, completada_por: perfil.id };
  // El estado de partida va en la consulta: si dos personas tocan el mismo pedido a la vez, solo una lo cambia.
  const { data, error } = await sb.from("solicitudes_cliente").update(cambios).eq("id", sid).eq("company_id", id).eq("estado", fila.estado as string).select(COLUMNAS).maybeSingle();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar el pedido", perfil, companyId: id });
  if (!data) return fallo(esConsultora ? "Ese pedido cambió mientras tanto: vuelve a cargar la página." : TEXTO_YA_LISTO, 409);
  const solicitud = solicitudDesdeFila(data as unknown as Record<string, unknown>, id);
  void registrar({
    companyId: id, actor: perfil, accion: "editar", entidad: "solicitud_cliente", entidadId: sid,
    detalle: { seccion: solicitud?.seccion ?? null, antes: fila.estado, despues: cambios.estado }, ruta: RUTA, ip: ipDe(req),
  });
  refrescarRuta(id, "ruta");
  return ok({ solicitud });
});

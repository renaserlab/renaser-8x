import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { registrarCondicion, COLUMNAS_MEDICION, type Medicion } from "@/lib/medicion";
import { CambioCondicionZ } from "../../esquemas";

type Ctx = { params: Promise<{ id: string; mid: string }> };

/**
 * REGISTRAR UN CAMBIO DE CONDICIONES sobre una medición ya congelada: temporada, local nuevo, cambio de
 * precio… Se AÑADE a `condiciones` sin pisar lo anterior y es la única columna que se toca. Los valores y
 * derivados congelados no se modifican: lo que cambia es lo que se sabe del contexto, no la foto.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id, mid } = await ctx.params;
  await exigirAcceso(perfil, id);
  await exigirAutoridad(perfil, "cerrar_medicion");
  const b = await leerValidado(req, CambioCondicionZ);
  const sb = supabaseAdmin();

  const { data: med, error } = await sb.from("mediciones").select(COLUMNAS_MEDICION).eq("id", mid).eq("company_id", id).maybeSingle();
  if (error) return fallo(error.message, 500);
  if (!med) return fallo("Esa medición no existe o no es de esta empresa.", 404);

  let condiciones;
  try {
    condiciones = registrarCondicion(med as unknown as Medicion, { ...b, registrado_por: perfil.id });
  } catch (e) {
    return fallo(e instanceof Error ? e.message : "No se pudo registrar el cambio.", 400);
  }

  const { error: e2 } = await sb.from("mediciones").update({ condiciones }).eq("id", mid);
  if (e2) return fallo(e2.message, 500);

  void registrar({
    companyId: id, actor: perfil, accion: "editar", entidad: "medicion", entidadId: mid,
    detalle: { condicion: { que_cambio: b.que_cambio, desde: b.desde } },
    ruta: "/api/companies/medicion/condicion", ip: ipDe(req),
  });
  return ok({ condiciones });
});

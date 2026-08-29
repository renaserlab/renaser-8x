import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { aprobarDocumento } from "@/lib/documental";
import { registrar, ipDe } from "@/lib/auditoria";

type Ctx = { params: Promise<{ id: string }> };

/**
 * APROBAR UN DOCUMENTO (ISO 9001 7.5): lo pone vigente, deja obsoleta la versión anterior y guarda
 * quién aprobó, cuándo y por qué. Lo aprueba el dueño: es su empresa la que se compromete.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ deliverable_id?: string; motivo?: string }>(req);
  if (!b.deliverable_id) return fallo("Falta el documento a aprobar.");

  const r = await aprobarDocumento(b.deliverable_id, perfil.id, perfil.nombre ?? perfil.email ?? "Sin nombre", b.motivo ?? "");
  void registrar({
    companyId: id, actor: perfil, accion: "aprobar", entidad: "deliverables", entidadId: b.deliverable_id,
    detalle: { version: r.version, motivo: b.motivo ?? null }, ruta: "/api/companies/deliverables/aprobar", ip: ipDe(req),
  });
  return ok(r);
});

import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { z } from "zod";
import { registrar, ipDe } from "@/lib/auditoria";
import { decidir, anotarResultado, verDecision, ACCIONES, CAMPOS_CORREGIBLES } from "@/lib/decisiones";
import { exigirAutoridad } from "@/lib/autoridad";

type Ctx = { params: Promise<{ id: string }> };

const Decidir = z.object({
  accion: z.enum(ACCIONES as unknown as [string, ...string[]]),
  motivo: z.string().trim().min(8, "Di por qué, aunque sea en una línea: el motivo es lo que sirve después.").max(2000),
  correcciones: z.record(z.enum(CAMPOS_CORREGIBLES as unknown as [string, ...string[]]), z.string().trim().max(4000)).optional(),
});

/** La intervención de la consultora sobre una decisión. Queda en el historial, nunca pisa el original. */
export const POST = protegido<Ctx>({ consultor: true, entidad: "decision" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerValidado(req, Decidir);
  if (b.accion === "aprobar") await exigirAutoridad(perfil, "aprobar_hallazgo");

  try {
    const r = await decidir({
      decisionId: id,
      accion: b.accion as never,
      motivo: b.motivo,
      correcciones: b.correcciones as never,
      actorId: perfil.id,
      actorRol: perfil.rol,
    });
    void registrar({
      actor: perfil, accion: b.accion === "aprobar" ? "aprobar" : "editar", entidad: "decision", entidadId: id,
      detalle: { accion: b.accion, estado: r.estado }, ruta: "/api/decisiones", ip: ipDe(req),
    });
    return ok(r);
  } catch (e) {
    return fallo(e instanceof Error ? e.message : "No se pudo registrar la decisión.");
  }
});

/** Anotar qué pasó después de una intervención: es lo que permite evaluar si corregir sirvió. */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "decision" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerValidado(req, z.object({ intervencion_id: z.string().uuid(), resultado: z.string().trim().min(3).max(2000) }));
  const d = await verDecision(id);
  if (!d) return fallo("Esa decisión no existe.", 404);
  if (!d.historial.some((h) => h.id === b.intervencion_id)) return fallo("Esa intervención no es de esta decisión.", 404);

  await anotarResultado(b.intervencion_id, b.resultado);
  void registrar({ actor: perfil, accion: "editar", entidad: "decision_resultado", entidadId: id, ruta: "/api/decisiones", ip: ipDe(req) });
  return ok({ anotado: true });
});

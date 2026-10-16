import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { completitud } from "@/lib/iniciativas";
import { cargarTablero, iniciativasDelCliente, crearIniciativa } from "./_datos";
import { Crear } from "./_esquemas";
import { respuestaDeRegla } from "./_respuesta";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: las iniciativas de la empresa. La consultora recibe el tablero entero: cada iniciativa con lo que
 * le falta para aprobarse, lo que dicen sus criterios con el dato disponible, su historial, y las
 * evidencias, personas e indicadores que se pueden enlazar. El dueño recibe solo lo aprobado y lo que
 * está en curso, con las columnas que le corresponden: las propuestas no salen de la consulta.
 */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (perfil.rol !== "consultor") return ok({ iniciativas: await iniciativasDelCliente(id) });
  const tablero = await cargarTablero(id);
  if (!tablero.disponible) return fallo(tablero.motivo, 503);
  return ok(tablero);
});

/**
 * POST: proponer una iniciativa. La propone la consultora y nace siempre como propuesta. Exige dominio,
 * título, hipótesis y medida de éxito; si es de mercado y competencia, además una fuente aportada o lo
 * que queda pendiente de investigar. Lo demás se completa después y se exige antes de aprobar.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "iniciativa" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Crear);
  try {
    const r = await crearIniciativa(id, perfil, b);
    void registrar({
      companyId: id, actor: perfil, accion: "crear", entidad: "iniciativa", entidadId: r.iniciativa.id,
      detalle: { dominio: r.iniciativa.dominio, estado: r.iniciativa.estado }, ruta: "/api/companies/iniciativas", ip: ipDe(req),
    });
    return ok({ iniciativa: r.iniciativa, falta: completitud(r.iniciativa), aviso: r.aviso }, 201);
  } catch (e) {
    return respuestaDeRegla(e);
  }
});

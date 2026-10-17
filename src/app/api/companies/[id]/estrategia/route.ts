import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { pedirEstrategia } from "@/lib/estrategia/generar";
import { resumenDeEstrategias } from "@/lib/estrategia/acciones";
import { CuerpoGenerar } from "@/lib/estrategia/cuerpos";
import { pedidoPorMinimo } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { respuesta, rastro } from "./_comun";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET (consultora): las versiones de la estrategia de la empresa, en qué va la que se está generando y cuánto le queda
 * de su tope de consumo. El dueño no lee la estrategia por aquí: su página la arma el servidor con lo aprobado.
 */
export const GET = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  return respuesta(await resumenDeEstrategias(id));
});

/**
 * POST (consultora): «Generar la estrategia» (spec-estrategia-8x.md §5.3). Antes de gastar una sola consulta comprueba
 * el mínimo, el tope de la empresa, la que está en curso, el tope diario y el de «a la vez»; crea la versión con lo
 * congelado y encola las dos lentes con una clave sin hora ni azar (src/lib/estrategia/generar.ts). Si no alcanza el
 * mínimo, devuelve lo que falta y el pedido que 8X le haría al dueño («Pedírselo al cliente»).
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia", entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  await leerValidado(req, CuerpoGenerar);
  const r = await pedirEstrategia({ companyId: id, pedidaPor: perfil.id });
  if (!r.ok) {
    const extra = r.codigo === "minimo" ? { faltan: r.faltan ?? [], pedir_al_cliente: pedidoPorMinimo(r.faltan ?? []) } : undefined;
    return respuesta(no(r.status, r.codigo, r.texto, extra));
  }
  rastro(req, perfil, id, "crear", r.estrategia_id, { version: r.version, trabajos: r.trabajos });
  return respuesta(r, 201);
});

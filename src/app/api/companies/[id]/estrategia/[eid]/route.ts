import { protegido, leerValidado, exigirAcceso } from "@/lib/api";
import { corregirVersion, descartarVersion, detalleDeVersion, etapasDeVersion, type Correccion } from "@/lib/estrategia/acciones";
import { CuerpoCorregir, CuerpoDescartar } from "@/lib/estrategia/cuerpos";
import { API } from "@/lib/estrategia/textos";
import { no } from "@/lib/estrategia/resultado";
import { esId, respuesta, rastro } from "../_comun";

type Ctx = { params: Promise<{ id: string; eid: string }> };

/**
 * GET (consultora): una versión entera —lo que escribió 8X, lo vigente, la validación, la lista de control—, en qué
 * va si se está generando, su rastro de correcciones y «qué cambió» si viene de «Actualizar números». Con
 * `?solo=etapas`, solo en qué va (para seguir el avance sin traer todo).
 */
export const GET = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  const solo = new URL(req.url).searchParams.get("solo");
  return respuesta(solo === "etapas" ? await etapasDeVersion(id, eid) : await detalleDeVersion(id, eid));
});

/** El cuerpo validado, como corrección de la acción. */
function correccionDe(b: CuerpoCorregir): Correccion {
  if ("texto" in b) return { tipo: "texto", puntero: b.texto.puntero, texto: b.texto.texto };
  if ("supuesto" in b) return { tipo: "supuesto", id: b.supuesto.id, bajo: b.supuesto.bajo, alto: b.supuesto.alto };
  if ("aceptar" in b) return { tipo: "aceptar", puntero: b.aceptar.puntero };
  if ("restaurar" in b) return { tipo: "restaurar", puntero: b.restaurar.puntero };
  return { tipo: "elegir", camino: b.elegir.camino, motivo: b.elegir.motivo ?? null };
}

/**
 * PATCH (consultora): corregir en el lugar (§8.1, punto 4) —un texto, el rango de una cifra por confirmar, aceptar que
 * se quite lo que 8X quitó, volver a lo que escribió 8X— o elegir el camino. Solo en versiones «lista» o
 * «con_observaciones»: una aprobada ya la ve el cliente (409 con qué hacer). Cada cambio vuelve a validar y deja su
 * fila en el rastro de correcciones.
 */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  const correccion = correccionDe(await leerValidado(req, CuerpoCorregir));
  const r = await corregirVersion({ companyId: id, id: eid, correccion, porId: perfil.id });
  if (r.ok) rastro(req, perfil, id, "editar", eid, { correccion: correccion.tipo, ...("puntero" in correccion ? { puntero: correccion.puntero } : {}), estado: r.estado });
  return respuesta(r);
});

/** POST (consultora) con `{ descartar: true }`: una versión que se está generando pasa a «descartada» (§5.4). */
export const POST = protegido<Ctx>({ consultor: true, entidad: "estrategia" }, async (perfil, req, ctx) => {
  const { id, eid } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (!esId(eid)) return respuesta(no(404, "version_no_existe", API.version_no_existe));
  await leerValidado(req, CuerpoDescartar);
  const r = await descartarVersion({ companyId: id, id: eid });
  if (r.ok) rastro(req, perfil, id, "editar", eid, { descartada: true });
  return respuesta(r);
});

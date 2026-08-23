import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { procesoCompleto } from "@/lib/db/queries";
import { validarEntrada, type NodoEntrada, type EdgeEntrada } from "@/lib/canvas-guardar";

type Ctx = { params: Promise<{ id: string }> };

/** GET: nodos + conexiones en dos consultas. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const r = await procesoCompleto(id);
  if (!r.proceso) return fallo("Proceso no encontrado", 404);
  await exigirAcceso(perfil, r.proceso.company_id);
  return ok(r);
});

/**
 * PUT: guarda el canvas completo (estructura, no dibujo).
 * P0-05: los ids temporales (`_tmp`) se resuelven dentro de la función SQL `guardar_proceso`, en UNA transacción.
 * Si una conexión apunta a un nodo inexistente, Postgres lanza excepción y no queda nada a medias.
 */
export const PUT = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("processes").select("id,company_id").eq("id", id).single();
  if (!p) return fallo("Proceso no encontrado", 404);
  await exigirAcceso(perfil, p.company_id);
  const b = await leerJSON<{ nombre?: string; area?: string; nodos: NodoEntrada[]; edges: EdgeEntrada[] }>(req);
  if (!Array.isArray(b.nodos) || !Array.isArray(b.edges)) return fallo("Faltan nodos o conexiones");

  // Validación previa: solo ids de ESTE proceso cuentan como existentes; cualquier otro se trata como nuevo.
  const { data: existentes } = await sb.from("process_nodes").select("id").eq("process_id", id);
  const setExistentes = new Set((existentes ?? []).map((n) => n.id));
  const nodos = b.nodos.map((n) => ({ ...n, id: n.id && setExistentes.has(n.id) ? n.id : undefined, _tmp: n._tmp ?? n.id }));
  const errores = validarEntrada(nodos, b.edges, setExistentes);
  if (errores.length) return fallo(`No se guardó nada: ${errores.join("; ")}`, 400);

  const { data: mapa, error } = await sb.rpc("guardar_proceso", {
    p_process_id: id,
    p_nombre: b.nombre ?? null,
    p_area: b.area ?? null,
    p_nodos: nodos.map((n) => ({ id: n.id ?? null, _tmp: n._tmp ?? null, tipo: n.tipo, etiqueta: n.etiqueta || "…", responsable: n.responsable ?? null, ejecutor: n.ejecutor ?? null, tiempo: n.tiempo ?? null, herramienta: n.herramienta ?? null, problema: n.problema ?? null, veredicto: n.veredicto ?? null, pos_x: Math.round(n.pos_x ?? 0), pos_y: Math.round(n.pos_y ?? 0) })),
    p_edges: b.edges.map((e) => ({ origen: e.origen, destino: e.destino, etiqueta: e.etiqueta ?? null })),
  });
  if (error) return fallo(error.message.includes("conexion_invalida") ? "No se guardó nada: una conexión apunta a un paso que no existe." : `No se guardó nada: ${error.message}`, 400);
  return ok({ guardado: true, mapa: mapa ?? {} });
});

export const DELETE = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("processes").select("id,company_id").eq("id", id).single();
  if (!p) return fallo("Proceso no encontrado", 404);
  await exigirAcceso(perfil, p.company_id);
  await sb.from("processes").delete().eq("id", id);
  return ok({ eliminado: true });
});

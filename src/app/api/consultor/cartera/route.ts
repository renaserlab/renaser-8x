import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cargarCartera, filtrar, filtroDe, resumenCartera } from "@/lib/cartera";

/**
 * LA CARTERA DE RENASER, COMO DATOS (R16.1). Solo la consultora: es la vista de Dirección sobre todas las empresas.
 * `?consultor=<id>|sin_asignar` y `?fase=<fase del método>|sin_fase` filtran las filas; la carga por consultor y el
 * resumen general son siempre de la cartera entera, para que un filtro no esconda cómo está repartido el trabajo.
 * No escribe nada: lee y cuenta.
 */
export const GET = protegido({ consultor: true, entidad: "cartera" }, async (_perfil, req) => {
  const url = new URL(req.url);
  const f = filtroDe({ consultor: url.searchParams.get("consultor"), fase: url.searchParams.get("fase") });
  if (!f.ok) return fallo(f.error, 400);

  const cartera = await cargarCartera(supabaseAdmin());
  const filas = filtrar(cartera.filas, f.filtro);
  return ok({
    hoy: cartera.hoy,
    generada_at: cartera.generadaAt,
    filtro: f.filtro,
    // Cuántas empresas hay en total, se filtre o no.
    total: cartera.filas.length,
    filas,
    // De las filas que pasan el filtro.
    resumen_filtrado: resumenCartera(filas),
    // De toda la cartera.
    resumen: cartera.resumen,
    carga: cartera.carga,
    consultores: cartera.consultores.map((c) => ({ id: c.id, nombre: c.nombre })),
    con_asignacion: cartera.conAsignacion,
    avisos: cartera.avisos,
  });
});

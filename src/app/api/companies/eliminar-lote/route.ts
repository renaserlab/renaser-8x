import { z } from "zod";
import { protegido, ok, fallo, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";

/**
 * LIMPIEZA EN LOTE (solo consultora). Después de semanas de pruebas quedan una docena de empresas
 * de mentira estorbando entre las reales. Borrarlas de una en una, escribiendo cada nombre, es una
 * penitencia — y con nombres que llevan "·" era además imposible.
 *
 * Sigue siendo destructivo e irreversible, así que: el tope es 30 de una vez, cada borrado deja su
 * rastro con lo que contenía, y si una falla se sigue con las demás y se dice cuál falló — nada de
 * abortar a medias sin explicar qué quedó.
 */
const Cuerpo = z.object({ ids: z.array(uuid).min(1).max(30) });

export const POST = protegido({ consultor: true }, async (perfil, req) => {
  const { ids } = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  const { data: empresas } = await sb.from("companies").select("id,nombre").in("id", ids);
  if (!empresas?.length) return fallo("No se encontró ninguna de esas empresas.", 404);

  const eliminadas: { id: string; nombre: string; archivos: number }[] = [];
  const fallidas: { nombre: string; motivo: string }[] = [];

  for (const e of empresas) {
    // Lo que se pierde se cuenta ANTES de borrarlo: después ya no hay a quién preguntarle.
    const [{ count: fuentes }, { count: definiciones }, { count: hallazgos }] = await Promise.all([
      sb.from("sources").select("id", { count: "exact", head: true }).eq("company_id", e.id),
      sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", e.id),
      sb.from("findings").select("id", { count: "exact", head: true }).eq("company_id", e.id),
    ]);

    // El cascade de SQL no toca Storage: los archivos se borran a mano o quedan huérfanos pagando.
    const { data: archivos } = await sb.rpc("archivos_de_empresa", { p_company_id: e.id });
    const rutas = (archivos as string[] | null) ?? [];
    for (let i = 0; i < rutas.length; i += 100) await sb.storage.from("fuentes").remove(rutas.slice(i, i + 100));

    const { error } = await sb.from("companies").delete().eq("id", e.id);
    if (error) {
      fallidas.push({ nombre: e.nombre, motivo: error.message });
      continue;
    }

    eliminadas.push({ id: e.id, nombre: e.nombre, archivos: rutas.length });
    // El rastro sobrevive a la empresa: audit_log.company_id queda en null, pero el detalle guarda
    // qué se borró y cuánto contenía. Es la única memoria que va a quedar de esto.
    await registrar({
      companyId: null, actor: perfil, accion: "eliminar", entidad: "empresa", entidadId: e.id,
      detalle: { nombre: e.nombre, fuentes: fuentes ?? 0, definiciones: definiciones ?? 0, hallazgos: hallazgos ?? 0, archivos: rutas.length },
      ruta: "/api/companies/eliminar-lote", ip: ipDe(req),
    });
  }

  return ok({ eliminadas, fallidas, total: eliminadas.length });
});

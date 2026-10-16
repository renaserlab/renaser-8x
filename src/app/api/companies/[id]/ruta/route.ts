import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CuerpoRuta, TEXTO_VEREDICTO_SIN_MOTIVO } from "@/lib/esquemas-negocio";
import { avanceDeEmpresa, leerHechosRutaCon, refrescarRuta } from "@/lib/ruta-datos";
import { avanceRuta, vistaDueno, esClaveDeMarca } from "@/lib/ruta";
import { letrasDe } from "@/lib/kpis";
import { TEXTO_FALTA_MIGRACION } from "@/lib/negocio-datos";
import { respuestaDeBase } from "../negocio/_comun";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/ruta";

/**
 * GET: el avance de la ruta. La consultora recibe todo (criterios con su detalle, sugerencias, veredictos y lo que
 * falta para la compuerta); el dueño, solo las etapas con su nombre, su estado y el % (vistaDueno): ni criterios,
 * ni notas, ni veredictos. null si la base todavía no tiene las columnas de la ruta.
 */
export const GET = protegido<Ctx>({ entidad: "ruta" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const avance = await avanceDeEmpresa(id);
  if (!avance) return ok({ avance: null, motivo: TEXTO_FALTA_MIGRACION });
  return ok({ avance: perfil.rol === "consultor" ? avance : vistaDueno(avance) });
});

/**
 * PATCH (consultora): la ficha de trabajo de la empresa (tipo de trabajo, inicio de la ruta, hora de cierre, cómo gana
 * dinero), una marca de criterio («cumple» / «no cumple», con nota) o el veredicto de una compuerta (verde, ámbar o
 * rojo, SIEMPRE con su motivo). Marcas y veredictos van a ruta_marcas, que el dueño no lee.
 */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "ruta" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, CuerpoRuta);
  if (Object.keys(b).length === 0) return fallo("No hay nada que cambiar.");
  if (b.veredicto && letrasDe(b.veredicto.nota) < 3) return fallo(TEXTO_VEREDICTO_SIN_MOTIVO);
  if (b.marca && !esClaveDeMarca(b.marca.clave)) return fallo("Esa marca no es de ningún criterio de la ruta que marque la consultora.");
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();

  const empresa: Record<string, unknown> = {};
  for (const k of ["tipo_trabajo", "ruta_inicio", "hora_cierre", "modelo_negocio"] as const) if (b[k] !== undefined) empresa[k] = b[k];
  if (Object.keys(empresa).length) {
    const { error } = await sb.from("companies").update(empresa).eq("id", id);
    if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar la ficha de trabajo", perfil, companyId: id });
  }
  const marcas: { clave: string; valor: string; nota?: string | null }[] = [];
  // Una marca sin nota no borra la nota que ya tenía: el upsert solo escribe las columnas que lleva.
  if (b.marca) marcas.push({ clave: b.marca.clave, valor: b.marca.valor, ...(b.marca.nota !== undefined ? { nota: b.marca.nota } : {}) });
  if (b.veredicto) marcas.push({ clave: `${b.veredicto.etapa}.compuerta`, valor: b.veredicto.valor, nota: b.veredicto.nota!.trim() });
  for (const m of marcas) {
    const { error } = await sb.from("ruta_marcas").upsert({ company_id: id, ...m, marcado_por: perfil.id, marcado_at: ahora }, { onConflict: "company_id,clave" });
    if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar la marca", perfil, companyId: id });
  }
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "ruta", detalle: { empresa, marcas }, ruta: RUTA, ip: ipDe(req) });

  // La barra de avance de la empresa (las dos, la de la consultora y la del dueño) se lee de la caché: se vence ya.
  // El tipo de trabajo y la fecha de inicio son de la parte «ruta»; el modelo de negocio, no la cambia.
  refrescarRuta(id, "ruta");
  // Se vuelve a leer (no de la memoria de la petición): lo que se responde es lo que quedó.
  const hechos = await leerHechosRutaCon(sb, id);
  return ok({ avance: hechos ? avanceRuta(hechos, new Date()) : null });
});

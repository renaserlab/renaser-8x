import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { valoresActuales, derivadosActuales, type Medicion } from "@/lib/medicion";
import { radiografia, type Metrica } from "@/lib/metricas";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  tipo: z.enum(["linea_base", "corte"]),
  nota: z.string().trim().max(600).optional(),
});

/**
 * CONGELAR UNA MEDICIÓN. La primera es la línea base —el "antes"—; cada corte posterior es un
 * "después" que se compara contra ella. Se congela lo que la empresa tiene HOY en sus números, así
 * que antes de un corte el dueño actualiza sus nueve en /portal/numeros.
 *
 * Lo hace el dueño o el consultor: son los números de la empresa, no del consultor.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  const { data: metricasRaw } = await sb
    .from("company_metricas")
    .select("clave,periodo,valor,estado")
    .eq("company_id", id)
    .limit(300);
  const metricas = (metricasRaw ?? []) as Metrica[];

  const valores = valoresActuales(metricas);
  if (Object.keys(valores).length === 0)
    return fallo("Todavía no hay ningún número que congelar. Completa tus números primero.", 400);

  // Una línea base con dos números no sirve de punto de partida: después no habría contra qué
  // comparar y el "funcionó" sería una opinión otra vez.
  const r = radiografia(metricas);
  if (b.tipo === "linea_base" && r.listos < 5)
    return fallo(`Para fijar el punto de partida hacen falta al menos 5 de los 9 números. Tienes ${r.listos}.`, 400);

  const { data, error } = await sb.rpc("congelar_medicion", {
    p_company: id,
    p_tipo: b.tipo,
    p_valores: valores,
    p_derivados: derivadosActuales(metricas),
    p_nota: b.nota ?? null,
    p_por: perfil.id,
  });
  if (error) return fallo(error.message, 500);
  const medicion = (Array.isArray(data) ? data[0] : data) as Medicion;

  void registrar({
    companyId: id, actor: perfil, accion: "crear", entidad: "medicion", entidadId: medicion?.id,
    detalle: { tipo: b.tipo, numero: medicion?.numero, numeros: Object.keys(valores).length },
    ruta: "/api/companies/medicion", ip: ipDe(req),
  });
  return ok({ medicion }, 201);
});

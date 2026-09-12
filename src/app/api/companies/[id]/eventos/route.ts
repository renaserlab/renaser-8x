import { protegido, ok, fallo, exigirAcceso, leerValidado } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { TIPO_EVENTO, CLAVES_EVENTO, DIAS_VENTANA, faltantes, resumen, type Evento } from "@/lib/eventos";

type Ctx = { params: Promise<{ id: string }> };

/** La fecha del hecho. Nunca futura: no se anota lo que todavía no pasó. */
const ES_FECHA = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

const Entrada = z.object({
  tipo: z.enum(CLAVES_EVENTO as [string, ...string[]]),
  fecha: z.string().regex(ES_FECHA, "La fecha va como 2026-09-12.").optional(),
  monto: z.number().nonnegative().max(100_000_000).nullable().optional(),
  minutos: z.number().int().nonnegative().max(1440).nullable().optional(),
  persona_id: z.string().uuid().nullable().optional(),
  cliente: z.string().trim().max(160).optional(),
  proyecto: z.string().trim().max(160).optional(),
  puesto: z.string().trim().max(160).optional(),
  nota: z.string().trim().max(800).optional(),
});

/**
 * ANOTAR LO QUE PASÓ HOY. La pieza que le faltaba a 8X para operar una empresa y no solo
 * diagnosticarla: tardanzas, facturación, proyectos trabados, incidencias.
 *
 * Kelin (12-09-2026): hoy en RENASER no registran nada de esto en ninguna parte, está en la cabeza.
 * Por eso anotar tiene que costar segundos — un dato que cuesta un formulario no se anota nunca.
 */
export const POST = protegido<Ctx>({ cupo: "escritura", entidad: "evento" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Entrada);
  const def = TIPO_EVENTO.get(b.tipo)!;

  // Lo obligatorio lo dice el catálogo, no esta ruta: así un tipo nuevo no se olvida de validar.
  const faltan = faltantes(b.tipo, b as unknown as Record<string, unknown>);
  if (faltan.length) return fallo(`Falta ${faltan.join(" y ")}.`);

  const hoyLima = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const fecha = b.fecha ?? hoyLima;
  if (fecha > hoyLima) return fallo("No se puede anotar algo que todavía no pasó.");

  const sb = supabaseAdmin();
  // La persona tiene que ser de ESTA empresa: si no, se podría colgar una tardanza en otra.
  if (b.persona_id) {
    const { data: p } = await sb.from("participants").select("company_id").eq("id", b.persona_id).maybeSingle();
    if (!p || p.company_id !== id) return fallo("Esa persona no es de esta empresa.", 404);
  }

  // En `datos` solo entran los campos que el tipo declara. Nada suelto.
  const permitidos = new Set(def.campos.map((c) => c.clave));
  const datos: Record<string, string> = {};
  for (const k of ["cliente", "proyecto", "puesto", "nota"] as const) {
    const v = b[k];
    if (permitidos.has(k) && v) datos[k] = v;
  }

  const { data, error } = await sb
    .from("eventos")
    .insert({
      company_id: id, tipo: b.tipo, fecha,
      monto: permitidos.has("monto") ? (b.monto ?? null) : null,
      minutos: permitidos.has("minutos") ? (b.minutos ?? null) : null,
      persona_id: permitidos.has("persona") ? (b.persona_id ?? null) : null,
      datos, creado_por: perfil.id,
    })
    .select("id,tipo,fecha,monto,minutos,persona_id,datos")
    .single();
  if (error) return fallo(error.message, 500);

  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "evento", entidadId: data.id, detalle: { tipo: b.tipo, fecha }, ruta: "/api/companies/eventos", ip: ipDe(req) });
  return ok({ evento: data }, 201);
});

/** Lo anotado en un periodo, con su resumen. Por defecto los últimos 30 días. */
export const GET = protegido<Ctx>({ cupo: "ninguno" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const url = new URL(req.url);
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias") ?? DIAS_VENTANA), 1), 365);

  // La ventana la recorta Postgres: la hora de Lima vive en la base y no se repite en JavaScript.
  const { data } = await supabaseAdmin().rpc("eventos_recientes", { p_company: id, p_dias: dias });
  const eventos = (data ?? []) as unknown as Evento[];
  return ok({ dias, eventos, resumen: resumen(eventos) });
});

/** Borrar una anotación equivocada. Queda en la auditoría: se corrige, no se esconde. */
export const DELETE = protegido<Ctx>({ entidad: "evento" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, z.object({ evento_id: z.string().uuid() }));
  const sb = supabaseAdmin();

  const { data: e } = await sb.from("eventos").select("company_id,tipo").eq("id", b.evento_id).maybeSingle();
  if (!e || e.company_id !== id) return fallo("Esa anotación no es de esta empresa.", 404);

  await sb.from("eventos").delete().eq("id", b.evento_id);
  void registrar({ companyId: id, actor: perfil, accion: "eliminar", entidad: "evento", entidadId: b.evento_id, detalle: { tipo: e.tipo }, ruta: "/api/companies/eventos", ip: ipDe(req) });
  return ok({ borrado: true });
});

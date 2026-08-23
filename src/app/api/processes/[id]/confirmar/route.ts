import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/**
 * El cliente confirma su realidad (fase 18) y dice qué querría cambiar (fase 19).
 * body: { accion: "confirmado" | "corregir", deseo?: string }
 * - confirmado: "Así funciona hoy" queda confirmado por quien lo vive.
 * - corregir: vuelve a borrador (el cliente edita el canvas y vuelve a confirmar).
 * - deseo: lo que le gustaría que funcionara diferente. NO se convierte en TO-BE directo:
 *   se guarda como fuente (observación) para que entre al contraste como cualquier evidencia.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("processes").select("id,company_id,nombre,version").eq("id", id).single();
  if (!p) return fallo("No encontramos ese proceso", 404);
  await exigirAcceso(perfil, p.company_id);
  if (p.version !== "as_is") return fallo("Solo se confirma el proceso actual (AS-IS).");
  const b = await leerJSON<{ accion?: "confirmado" | "corregir"; deseo?: string }>(req);

  if (b.deseo?.trim()) {
    await sb.from("processes").update({ deseo: b.deseo.trim() }).eq("id", id);
    const { data: s } = await sb
      .from("sources")
      .insert({ company_id: p.company_id, tipo: "observacion", nombre: `Lo que quisiera cambiar · ${p.nombre}`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: `Sobre el proceso "${p.nombre}", la empresa quisiera que funcionara diferente (deseo, no hecho actual): ${b.deseo.trim()}`, origen: perfil.rol === "consultor" ? "consultor" : "cliente", estado: "subido" })
      .select("id")
      .single();
    if (s) await encolar({ company_id: p.company_id, tipo: "extraer", payload: { source_id: s.id }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer-deseo", s.id]) });
  }

  if (b.accion === "confirmado") await sb.from("processes").update({ confirmacion: "confirmado" }).eq("id", id);
  else if (b.accion === "corregir") await sb.from("processes").update({ confirmacion: "borrador" }).eq("id", id);

  const { data: fin } = await sb.from("processes").select("confirmacion,deseo").eq("id", id).single();
  return ok({ id, ...fin });
});

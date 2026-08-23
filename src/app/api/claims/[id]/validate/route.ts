import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { visibleParaCliente } from "@/lib/frontera";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** body: { respuesta: 'si' | 'ya_no' | 'nunca', seguimiento?: string } — los tres botones. P1-21: el cliente solo valida lo que puede ver. */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ respuesta?: "si" | "ya_no" | "nunca"; seguimiento?: string; estado?: string }>(req);
  const sb = supabaseAdmin();
  const { data: c } = await sb.from("claims").select("id,company_id,contradice_a,texto,estado,participant_id,fecha_afirmacion,prioridad_validacion").eq("id", id).single();
  if (!c) return fallo("No encontramos esa definición", 404);
  await exigirAcceso(perfil, c.company_id);
  if (perfil.rol !== "consultor") {
    const { data: mios } = await sb.from("participants").select("id").eq("company_id", c.company_id).eq("user_id", perfil.id);
    if (!visibleParaCliente(c, new Set((mios ?? []).map((p) => p.id)))) return fallo("No encontramos esa definición", 404);
  }

  let estado: string | null = null;
  if (b.respuesta === "si") estado = "confirmado";
  else if (b.respuesta === "ya_no") estado = "caducado";
  else if (b.respuesta === "nunca") estado = "contradicho";
  else if (perfil.rol === "consultor" && b.estado) estado = b.estado;
  if (!estado) return fallo("Respuesta inválida");

  await sb.from("claims").update({ estado, validado_por: perfil.id, validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", id);
  if (estado === "confirmado" && c.contradice_a) {
    await sb.from("claims").update({ estado: "caducado", validado_por: perfil.id, validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", c.contradice_a).eq("estado", "contradicho");
    await sb.from("claim_relations").upsert({ company_id: c.company_id, claim_id: id, related_id: c.contradice_a, tipo: "updates", explicacion: "Resuelto por validación del dueño", origen: "consultor" }, { onConflict: "claim_id,related_id,tipo" });
  }
  // El seguimiento ("¿qué cambió?") es una fuente nueva y se extrae (P2-12).
  if (b.seguimiento?.trim()) {
    const { data: s } = await sb.from("sources").insert({ company_id: c.company_id, tipo: "observacion", nombre: `Seguimiento de validación`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: `Sobre "${c.texto}": ${b.seguimiento.trim()}`, origen: perfil.rol === "consultor" ? "consultor" : "cliente", estado: "subido" }).select("id").single();
    if (s) await encolar({ company_id: c.company_id, tipo: "extraer", payload: { source_id: s.id }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer-raiz", s.id]) });
  }
  return ok({ id, estado });
});

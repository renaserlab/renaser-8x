import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** body: { respuesta: 'si' | 'ya_no' | 'nunca', seguimiento?: string } — los tres botones. */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ respuesta?: "si" | "ya_no" | "nunca"; seguimiento?: string; estado?: string }>(req);
  const sb = supabaseAdmin();
  const { data: c } = await sb.from("claims").select("id,company_id,contradice_a,texto").eq("id", id).single();
  if (!c) return fallo("No encontramos esa definición", 404);
  await exigirAcceso(perfil, c.company_id);

  let estado: string | null = null;
  if (b.respuesta === "si") estado = "confirmado";
  else if (b.respuesta === "ya_no") estado = "caducado";
  else if (b.respuesta === "nunca") estado = "contradicho";
  else if (perfil.rol === "consultor" && b.estado) estado = b.estado;
  if (!estado) return fallo("Respuesta inválida");

  await sb.from("claims").update({ estado, validado_por: perfil.id, validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", id);

  // Si confirmó esta y tenía una contraparte contradicha, la contraparte queda caducada (el dueño resolvió).
  if (estado === "confirmado" && c.contradice_a) {
    await sb.from("claims").update({ estado: "caducado", validado_por: perfil.id, validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", c.contradice_a).eq("estado", "contradicho");
  }
  // Seguimiento ("¿qué cambió?") se guarda como fuente de observación del dueño.
  if (b.seguimiento?.trim()) {
    await sb.from("sources").insert({ company_id: c.company_id, tipo: "observacion", nombre: `Seguimiento de validación`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: `Sobre "${c.texto}": ${b.seguimiento.trim()}`, origen: perfil.rol === "consultor" ? "consultor" : "cliente", estado: "leido" });
  }
  return ok({ id, estado });
});

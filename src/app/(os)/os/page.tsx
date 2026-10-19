import { redirect } from "next/navigation";
import { contextoOS } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn } from "@/lib/os/calculos";

export const dynamic = "force-dynamic";

/** La entrada de RENASER OS: quien todavía no abrió su día va a abrirlo; quien ya lo abrió, a su trabajo; la consultora, al equipo. */
export default async function InicioOS() {
  const c = await contextoOS();
  if (!c.persona) redirect("/os/equipo");
  const { data } = await supabaseAdmin().from("os_aperturas").select("id").eq("persona_id", c.persona.id).eq("fecha", hoyEn(c.zona)).maybeSingle();
  redirect(data ? "/os/mi-trabajo" : "/os/apertura");
}

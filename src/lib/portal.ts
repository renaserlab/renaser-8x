import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requerirCliente, empresaDelCliente } from "./auth";
import { supabaseAdmin } from "./supabase/admin";

/** Contexto del portal: usuario, empresa y "qué falta ahora" (una sola frase, siempre arriba). Capítulo 19.4 y 32.
 *  El consultor puede entrar en modo "ver como el empresario" (cookie ver_como) para una empresa suya. */
export async function contextoPortal() {
  const u = await requerirCliente();
  let companyId: string | null;
  if (u.rol === "consultor") {
    companyId = (await cookies()).get("ver_como")?.value || null;
    if (!companyId) redirect("/bandeja");
  } else {
    companyId = await empresaDelCliente(u.id);
  }
  if (!companyId) return { u, companyId: null, empresa: null, queFalta: "Cuéntanos de tu empresa para empezar.", paso: 0 as const, stats: null };
  const sb = supabaseAdmin();
  // P0-05: el dueño opera solo SU participante. Si el consultor creó al dueño sin cuenta, se enlaza aquí una sola vez.
  // En modo "ver como el empresario" NO se enlaza nada: el consultor mira, no se vuelve participante.
  const { data: propio } = u.rol === "consultor" ? { data: { id: "vista" } } : await sb.from("participants").select("id").eq("company_id", companyId).eq("user_id", u.id).maybeSingle();
  if (!propio) {
    const { data: m } = await sb.from("memberships").select("nivel").eq("user_id", u.id).eq("company_id", companyId).maybeSingle();
    if (m?.nivel === "dueno") {
      const { data: libre } = await sb.from("participants").select("id").eq("company_id", companyId).in("rol", ["dueno", "socio"]).is("user_id", null).order("created_at").limit(1).maybeSingle();
      if (libre) await sb.from("participants").update({ user_id: u.id }).eq("id", libre.id);
    }
  }
  const [{ data: empresa }, { data: stats }, { data: sesiones }, { data: publicados }, { data: acciones }] = await Promise.all([
    sb.from("companies").select("id,nombre,etapa").eq("id", companyId).single(),
    sb.from("company_stats").select("*").eq("company_id", companyId).maybeSingle(),
    sb.from("interview_sessions").select("id,tipo,estado, participants!inner(rol)").eq("company_id", companyId).in("participants.rol", ["dueno", "socio"]),
    sb.from("deliverables").select("id").eq("company_id", companyId).eq("publicado", true),
    sb.from("actions").select("id,estado").eq("company_id", companyId),
  ]);
  const { count: porValidar } = await sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", companyId).or("estado.eq.contradicho,and(estado.eq.sin_verificar,prioridad_validacion.eq.true)");

  const fuentes = Number(stats?.fuentes ?? 0);
  const sesionesPend = (sesiones ?? []).filter((s) => s.estado !== "completa").length;
  const hayPlan = (acciones ?? []).length > 0;
  const hayResultados = (publicados ?? []).length > 0;

  // Orden por valor: conversar (lo que más afina) > confirmar > subir > afinándose.
  // (Antes "sube algo" podía aparecer con la comprensión al 100% — incoherente para el dueño.)
  let queFalta: string, paso: number;
  if (hayPlan && hayResultados) { queFalta = "Tu plan está en marcha. Marca lo que vas cerrando."; paso = 8; }
  else if (hayResultados) { queFalta = "Tus resultados están listos."; paso = 7; }
  else if (sesionesPend > 0) { queFalta = "Conversemos. Una pregunta a la vez, hablando o escribiendo."; paso = 3; }
  else if ((porValidar ?? 0) > 0) { queFalta = `Hay ${porValidar} cosa${(porValidar ?? 0) === 1 ? "" : "s"} que encontramos y necesitamos que confirmes.`; paso = 4; }
  else if (fuentes === 0) { queFalta = "Sube lo que tengas: una foto del cuaderno sirve."; paso = 2; }
  else { queFalta = "Tu diagnóstico se está afinando con lo que ya contaste. Mientras tanto, cada cosa que agregues en Tu información lo hace más preciso."; paso = 6; }

  return { u, companyId, empresa, queFalta, paso, stats, porValidar: porValidar ?? 0, fuentes, sesionesPend };
}

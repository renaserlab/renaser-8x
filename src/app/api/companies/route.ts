import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const GET = protegido({ consultor: true }, async () => {
  const sb = supabaseAdmin();
  const [{ data }, { data: stats }] = await Promise.all([sb.from("companies").select("*").order("created_at", { ascending: false }), sb.from("company_stats").select("*")]);
  const por = new Map((stats ?? []).map((s) => [s.company_id, s]));
  return ok((data ?? []).map((c) => ({ ...c, stats: por.get(c.id) ?? null })));
});

export const POST = protegido({ consultor: true }, async (_p, req) => {
  const b = await leerJSON<{ nombre?: string; sector?: string; dueno_email?: string; dueno_nombre?: string; admision?: Record<string, string> }>(req);
  if (!b.nombre?.trim()) return fallo("Falta el nombre de la empresa.");
  const sb = supabaseAdmin();
  const { data: c, error } = await sb.from("companies").insert({ nombre: b.nombre.trim(), sector: b.sector ?? null, admision: b.admision ?? null }).select("*").single();
  if (error) return fallo(error.message, 500);

  // Participante dueño (persona de la empresa, con o sin usuario)
  const { data: dueno } = await sb.from("participants").insert({ company_id: c.id, nombre: b.dueno_nombre ?? "Dueño", puesto: "Dueño", rol: "dueno" }).select("id").single();
  if (dueno) {
    await sb.from("interview_sessions").insert([
      { company_id: c.id, participant_id: dueno.id, tipo: "sueno_dueno" },
      { company_id: c.id, participant_id: dueno.id, tipo: "empresa_dueno" },
    ]);
  }
  // Si el dueño ya tiene cuenta, se enlaza; si no, queda invitado y se enlaza al registrarse (P1-16).
  if (b.dueno_email) {
    const email = b.dueno_email.trim().toLowerCase();
    const { data: u } = await sb.from("users").select("id").eq("email", email).maybeSingle();
    if (u) {
      await sb.from("memberships").upsert({ user_id: u.id, company_id: c.id, nivel: "dueno" });
      if (dueno) await sb.from("participants").update({ user_id: u.id }).eq("id", dueno.id);
    } else {
      await sb.from("invitations").upsert({ company_id: c.id, email, nivel: "dueno" }, { onConflict: "company_id,email" });
    }
  }
  // La bandeja lee de company_stats: se refresca para que la empresa nueva aparezca sin esperar al worker (P1-12).
  await sb.rpc("refresh_company_stats").then(() => {}, () => {});
  return ok(c, 201);
});

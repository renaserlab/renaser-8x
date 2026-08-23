import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ConversacionCliente } from "@/components/cliente/ConversacionCliente";

export const dynamic = "force-dynamic";

export default async function Conversacion() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  // Sesiones del dueño: las del participante enlazado a este usuario o, si no hay, las del rol dueño.
  const { data: propio } = await sb.from("participants").select("id").eq("company_id", c.companyId).eq("user_id", c.u.id).maybeSingle();
  let q = sb.from("interview_sessions").select("id,tipo,estado, participants!inner(id,rol,user_id)").eq("company_id", c.companyId).order("created_at");
  q = propio ? q.eq("participant_id", propio.id) : q.in("participants.rol", ["dueno", "socio"]);
  const { data: sesiones } = await q;
  return (
    <>
      <p className="t-etiqueta">Conversar</p>
      <h1 className="t-titulo mt-2 mb-2">Una pregunta a la vez</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>Puedes responder hablando. Vas a ver lo que entendimos antes de guardarlo.</p>
      <ConversacionCliente companyId={c.companyId} sesiones={(sesiones ?? []).map((s) => ({ id: s.id, tipo: s.tipo, estado: s.estado }))} />
    </>
  );
}

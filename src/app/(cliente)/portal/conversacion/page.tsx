import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ConversacionCliente } from "@/components/cliente/ConversacionCliente";
import { hayTranscriptor } from "@/lib/ai";

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
      <h1 className="t-titulo mb-6">Una pregunta a la vez</h1>
      <ConversacionCliente companyId={c.companyId} sesiones={(sesiones ?? []).map((s) => ({ id: s.id, tipo: s.tipo, estado: s.estado }))} transcriptor={hayTranscriptor()} />
    </>
  );
}

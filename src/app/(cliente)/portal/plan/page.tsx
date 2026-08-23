import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Plan } from "@/components/Plan";

export const dynamic = "force-dynamic";

/** Tu implementación: los 45 días, frente por frente, con avance. Visible cuando el plan está publicado. */
export default async function PlanCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const { data: pub } = await sb.from("deliverables").select("id").eq("company_id", c.companyId).eq("tipo", "plan_90").eq("publicado", true).limit(1);
  if (!pub?.length)
    return (
      <>
        <p className="t-etiqueta">Tu implementación</p>
        <h1 className="t-titulo mt-2 mb-6">Todavía no hay plan</h1>
        <p className="t-cuerpo medida">El plan aparece aquí cuando tu consultor lo publique, después de que lo aprueben juntos en la sesión.</p>
      </>
    );
  const [{ data: acciones }, { data: cortes }] = await Promise.all([
    sb.from("actions").select("*").eq("company_id", c.companyId).order("semana_inicio").order("prioridad"),
    sb.from("checkpoints").select("*").eq("company_id", c.companyId).order("numero"),
  ]);
  return (
    <>
      <p className="t-etiqueta">Tu implementación</p>
      <h1 className="t-titulo mt-2 mb-2">45 días, frente por frente</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>Máximo tres frentes abiertos a la vez. Marca cada uno cuando lo cierres.</p>
      <Plan companyId={c.companyId} acciones={acciones ?? []} cortes={cortes ?? []} modo="cliente" />
    </>
  );
}

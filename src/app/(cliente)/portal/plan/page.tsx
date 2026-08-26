import Link from "next/link";
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
        <h1 className="t-titulo mt-2 mb-6">Tu plan se está armando</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          El punto de partida ya vive en <strong>Mi empresa</strong> (la sección «Por dónde empezaría»). Cuando lo convirtamos
          juntos en un plan con fechas y responsables, aparece aquí para que marques lo que vas cerrando.
        </p>
        <Link href="/portal/hoy" className="boton">Ver por dónde empezar</Link>
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

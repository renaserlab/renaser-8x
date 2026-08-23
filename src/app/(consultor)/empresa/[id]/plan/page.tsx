import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Plan } from "@/components/Plan";
import { BotonJob } from "@/components/consultor/BotonJob";
import { CerrarCaso } from "@/components/consultor/CerrarCaso";
import { VACIO } from "@/lib/textos";

export const dynamic = "force-dynamic";

export default async function PlanPag({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: acciones }, { data: cortes }, { data: c }] = await Promise.all([
    sb.from("actions").select("*, findings(titulo)").eq("company_id", id).order("semana_inicio").order("prioridad"),
    sb.from("checkpoints").select("*").eq("company_id", id).order("numero"),
    sb.from("companies").select("etapa").eq("id", id).single(),
  ]);
  return (
    <>
      <Encabezado
        titulo="Plan de implementación 45 + 45"
        sub="Frentes semanales, máximo 3 abiertos. Cada frente con dueño, indicador y semana de cierre."
        acciones={
          <>
            <BotonJob url={`/api/companies/${id}/plan`} texto={acciones?.length ? "Regenerar plan" : "Generar plan"} confirmar={acciones?.length ? "Se reemplazan los frentes pendientes. Los en curso o hechos se conservan. ¿Continuar?" : undefined} />
            <CerrarCaso companyId={id} etapa={c?.etapa ?? ""} />
          </>
        }
      />
      {!acciones?.length ? <Vacio texto={VACIO.plan} accion="Ir al diagnóstico" href={`/empresa/${id}/diagnostico`} /> : <Plan companyId={id} acciones={acciones} cortes={cortes ?? []} modo="consultor" />}
    </>
  );
}

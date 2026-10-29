import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { BotonJob } from "@/components/consultor/BotonJob";
import { CerrarCaso } from "@/components/consultor/CerrarCaso";
import { PlanConsultor } from "@/components/plan/PlanConsultor";
import { EscribirAccion } from "@/components/plan/EscribirAccion";
import { CortesPlan, type Corte } from "@/components/plan/CortesPlan";
import { cargarPlan } from "@/lib/plan-intervencion";
import { VACIO } from "@/lib/textos";

export const dynamic = "force-dynamic";

/**
 * EL PLAN DE INTERVENCIÓN DE LA CONSULTORA. Cada acción se propone, se aprueba (con los 14 campos llenos y
 * dentro del límite de frentes), se ejecuta, se reporta y se comprueba con prueba. Lo que se decide queda
 * en el historial con quién, por qué y qué implica.
 */
export default async function PlanPag({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [plan, { data: cortes }, { data: c }] = await Promise.all([
    cargarPlan(id),
    sb.from("checkpoints").select("*").eq("company_id", id).order("numero"),
    sb.from("companies").select("etapa").eq("id", id).single(),
  ]);
  const hay = plan.acciones.length > 0;
  return (
    <>
      <Encabezado
        titulo="Plan de intervención"
        sub={`Propuesta → aprobada → en ejecución → reportada → verificada. Hasta ${plan.limiteFrentes} prioridades abiertas a la vez. Verificar exige prueba; el resultado se lee en el corte.`}
        acciones={
          <>
            <BotonJob
              url={`/api/companies/${id}/plan`}
              texto={hay ? "Pedir otra propuesta" : "Generar propuesta"}
              confirmar={hay ? "Las propuestas que ya no aparezcan pasan a pospuestas con su motivo; lo aprobado, en ejecución o verificado no se toca. Nada se borra. ¿Continuar?" : undefined}
            />
            <CerrarCaso companyId={id} etapa={c?.etapa ?? ""} />
          </>
        }
      />
      {/* El plan es de la consultora: tiene que poder escribirlo ella, no solo pedírselo al modelo. Va aquí
          arriba, visible con la tabla vacía y con la tabla llena, porque un frente se abre cualquier día. */}
      <EscribirAccion companyId={id} participantes={plan.participantes} indicadores={plan.indicadores} />
      {!hay ? <Vacio texto={VACIO.plan} accion="Ir al diagnóstico" href={`/empresa/${id}/diagnostico`} /> : <PlanConsultor companyId={id} plan={plan} />}
      <CortesPlan companyId={id} cortes={(cortes ?? []) as Corte[]} puedeRegistrar />
    </>
  );
}

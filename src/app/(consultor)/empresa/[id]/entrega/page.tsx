import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { Entrega } from "@/components/consultor/Entrega";
import { BotonJob } from "@/components/consultor/BotonJob";

export const dynamic = "force-dynamic";

export default async function EntregaPag({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: entregables }, { count }] = await Promise.all([
    sb.from("deliverables").select("id,tipo,version,publicado,publicado_at,created_at").eq("company_id", id).order("created_at", { ascending: false }),
    sb.from("findings").select("id", { count: "exact", head: true }).eq("company_id", id).eq("estado_revision", "pendiente"),
  ]);
  return (
    <>
      <Encabezado
        titulo="Entrega"
        sub="Siete documentos. Todo vive en línea, no solo en PDF. Ningún documento contiene una afirmación sin su fuente."
        acciones={<BotonJob url={`/api/companies/${id}/publish`} json={{ generar: true }} texto="Generar paquete" confirmar="Redacta una versión nueva de los siete documentos a partir de los hallazgos aprobados. ¿Continuar?" />}
      />
      <Entrega companyId={id} entregables={entregables ?? []} pendientes={count ?? 0} />
    </>
  );
}

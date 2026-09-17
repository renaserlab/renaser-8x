import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { Organigrama } from "@/components/consultor/Organigrama";
import { estudioOrganigrama, type Puesto } from "@/lib/rules/organigrama";

export const dynamic = "force-dynamic";

/** El organigrama como ESTUDIO: estructura + el porqué con reglas. De aquí: manual de funciones y cierre de procesos. */
export default async function PaginaOrganigrama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabaseAdmin().from("org_puestos").select("*").eq("company_id", id).order("orden").order("created_at");
  const puestos = (data ?? []) as Puesto[];
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Organigrama" sub="No es un dibujo: es un estudio. Cada puesto con su misión, su decisión y su respaldo — y las reglas que dicen por qué la estructura aguanta o no." />
      </div>
      <Organigrama companyId={id} puestos={puestos} estudio={estudioOrganigrama(puestos)} />
    </>
  );
}

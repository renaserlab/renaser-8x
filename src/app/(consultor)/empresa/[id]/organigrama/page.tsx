import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { Organigrama } from "@/components/consultor/Organigrama";
import { estudioOrganigrama, type Puesto } from "@/lib/rules/organigrama";
import type { EstudioIA } from "@/components/consultor/EstudioOrganigrama";

export const dynamic = "force-dynamic";

/**
 * El organigrama como ESTUDIO (pedido de Kelin): la estructura actual con sus reglas, y el estudio
 * del motor — qué quiere lograr esta empresa y qué puestos necesita construir para lograrlo.
 * De aquí: manual de funciones y cierre de procesos.
 */
export default async function PaginaOrganigrama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data }, { data: est }] = await Promise.all([
    sb.from("org_puestos").select("*").eq("company_id", id).order("orden").order("created_at"),
    sb.from("org_estudio").select("contenido,updated_at").eq("company_id", id).maybeSingle(),
  ]);
  const puestos = (data ?? []) as Puesto[];
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Organigrama" sub="No es un dibujo: es un estudio. Qué quiere lograr esta empresa, qué estructura tiene, y qué necesita construir para lograrlo." />
      </div>
      <Organigrama
        companyId={id}
        puestos={puestos}
        estudio={estudioOrganigrama(puestos)}
        estudioIA={(est?.contenido as EstudioIA) ?? null}
        estudioFecha={est?.updated_at ?? null}
      />
    </>
  );
}

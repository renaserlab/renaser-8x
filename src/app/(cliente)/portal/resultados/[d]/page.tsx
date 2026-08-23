import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VistaEntregable } from "@/components/VistaEntregable";
import { Imprimir } from "@/components/base/Imprimir";

export const dynamic = "force-dynamic";

export default async function VerResultado({ params }: { params: Promise<{ d: string }> }) {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const { d } = await params;
  // Frontera: solo publicados y solo de su empresa.
  const { data } = await supabaseAdmin().from("deliverables").select("*").eq("id", d).eq("company_id", c.companyId).eq("publicado", true).single();
  if (!data) notFound();
  return (
    <>
      <div className="no-imprimir flex justify-between items-center mb-8">
        <Link href="/portal/resultados" className="t-dato">← Tus resultados</Link>
        <Imprimir texto="Guardar como PDF" />
      </div>
      <VistaEntregable d={data} paraCliente marca={process.env.MARCA_CONSULTORIA || c.empresa?.nombre} />
    </>
  );
}

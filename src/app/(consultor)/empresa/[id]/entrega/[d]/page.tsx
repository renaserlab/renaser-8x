import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VistaEntregable } from "@/components/VistaEntregable";
import { Imprimir } from "@/components/base/Imprimir";
import { ENTREGABLE } from "@/lib/textos";

export const dynamic = "force-dynamic";

export default async function VerEntregable({ params }: { params: Promise<{ id: string; d: string }> }) {
  const { id, d } = await params;
  const { data } = await supabaseAdmin().from("deliverables").select("*").eq("id", d).eq("company_id", id).single();
  if (!data) notFound();
  return (
    <>
      <div className="no-imprimir flex items-center justify-between mb-8">
        <Link href={`/empresa/${id}/entrega`} className="t-dato">← Entrega</Link>
        <div className="flex items-center gap-3">
          <span className="t-etiqueta">{ENTREGABLE[data.tipo]} · v{data.version} · {data.publicado ? "publicado" : "borrador"}</span>
          <Imprimir />
        </div>
      </div>
      <VistaEntregable d={data} />
    </>
  );
}

import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { DebeSer, type ModeloAR } from "@/components/consultor/DebeSer";

export const dynamic = "force-dynamic";

/** LA TERCERA VISTA: cómo ES (diagnóstico) → cómo la QUIEREN (dueño + consultoría) → cómo DEBE SER (la vara del rubro). */
export default async function PaginaDebeSer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: c }, { data: modelo }, { data: claims }] = await Promise.all([
    sb.from("companies").select("aspiracion").eq("id", id).single(),
    sb.from("modelo_alto_rendimiento").select("contenido,updated_at").eq("company_id", id).maybeSingle(),
    sb.from("claims").select("texto").eq("company_id", id).in("estado", ["confirmado", "sin_verificar"]).order("created_at", { ascending: false }).limit(120),
  ]);
  const sueno = (claims ?? [])
    .filter((x) => /suen|meta|quiere llegar|aspir|vision|local(es)? nuevos|crecer/i.test(x.texto))
    .slice(0, 2)
    .map((x) => `«${x.texto}»`)
    .join(" ");
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Debe ser" sub="Las tres vistas: cómo es, cómo la queremos, y cómo debe ser una empresa de alto rendimiento de su rubro. Contra esta vara se diseña todo." />
      </div>
      <DebeSer companyId={id} sueno={sueno || null} aspiracion={c?.aspiracion ?? null} modelo={(modelo?.contenido as ModeloAR) ?? null} fecha={modelo?.updated_at ?? null} />
    </>
  );
}

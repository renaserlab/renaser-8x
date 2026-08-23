import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { InventarioActivos } from "@/components/cliente/InventarioActivos";

export const dynamic = "force-dynamic";

/** Datos empresariales guiados: qué existe hoy, por bloques. Nada de "sube lo que tengas" a secas. */
export default async function Activos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const { data } = await supabaseAdmin().from("company_assets").select("clave,estado,nota").eq("company_id", c.companyId);
  return (
    <>
      <p className="t-etiqueta">Tu información</p>
      <h1 className="t-titulo mt-2 mb-3 medida">Veamos qué información existe hoy en tu empresa</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>
        Bloque por bloque, dinos qué tienes y qué no. No es un examen: lo que no exista escrito, lo construimos juntos. Lo que exista, súbelo como esté.
      </p>
      <InventarioActivos companyId={c.companyId} guardados={(data ?? []).map((d) => ({ clave: d.clave, estado: d.estado, nota: d.nota }))} />
    </>
  );
}

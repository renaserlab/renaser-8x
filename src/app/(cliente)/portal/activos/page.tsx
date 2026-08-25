import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { InventarioActivos } from "@/components/cliente/InventarioActivos";
import { bibliotecaRecomendada, type FindingLite } from "@/lib/biblioteca";

export const dynamic = "force-dynamic";

/** Datos empresariales guiados: qué existe hoy, por bloques. El diagnóstico dicta qué construir primero. */
export default async function Activos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [{ data }, { data: findings }, { data: emp }] = await Promise.all([
    sb.from("company_assets").select("clave,estado,nota,borrador,faltantes,implementacion").eq("company_id", c.companyId),
    sb.from("findings").select("patron,pilar,titulo,impacto,estado_revision").eq("company_id", c.companyId).neq("estado_revision", "rechazado").eq("requiere_validacion", false).limit(40),
    sb.from("companies").select("etapa_negocio").eq("id", c.companyId).single(),
  ]);
  const recomendados = (findings ?? []).length ? bibliotecaRecomendada((findings ?? []) as FindingLite[], emp?.etapa_negocio) : [];
  return (
    <>
      <p className="t-etiqueta">Tu información</p>
      <h1 className="t-titulo mt-2 mb-3 medida">Ayúdanos a entender cómo funciona tu empresa</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>
        Área por área: lo que exista —un documento, una foto del cuaderno, un audio— súbelo aquí mismo.
        Y lo que nunca se escribió, cuéntanoslo con tus palabras. Con esto levantamos la foto real de tu
        empresa; ordenarla y ponerla por escrito viene después, con nuestra ayuda.
      </p>
      <InventarioActivos
        companyId={c.companyId}
        guardados={(data ?? []).map((d) => ({ clave: d.clave, estado: d.estado, nota: d.nota, borrador: (d as { borrador?: string | null }).borrador ?? null, faltantes: ((d as { faltantes?: { pregunta: string }[] | null }).faltantes ?? null), implementacion: ((d as { implementacion?: { responsable?: string; desde?: string } | null }).implementacion ?? null) }))}
        prioridades={recomendados}
      />
    </>
  );
}

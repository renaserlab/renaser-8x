import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { DocMd } from "@/components/base/DocMd";
import { BotonImprimir } from "@/components/base/BotonImprimir";

export const dynamic = "force-dynamic";

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : null;

/**
 * EL DOCUMENTO EN LIMPIO: hoja imprimible con membrete — el logo del cliente, el nombre del
 * documento y la firma de origen. Para pegarlo en la pared, no para dejarlo en una pantalla.
 * Vive fuera del portal (sin navegación): la hoja sale limpia tal como se ve.
 */
export default async function ImprimirDocumento({ params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo p-8">Tu sesión terminó. Vuelve a entrar para ver tu documento.</p>;
  const sb = supabaseAdmin();
  const [{ data: a }, { data: emp }] = await Promise.all([
    sb.from("company_assets").select("clave,estado,borrador,propuesta,propuesta_estado,confirmado_at,updated_at").eq("company_id", c.companyId).eq("clave", clave).maybeSingle(),
    sb.from("companies").select("nombre,ficha").eq("id", c.companyId).single(),
  ]);
  const texto = (a?.propuesta_estado === "confirmada" && a.propuesta) || a?.borrador || null;
  if (!texto) return <p className="t-cuerpo p-8">Este documento todavía no está construido. Vuelve a tu información y constrúyelo primero.</p>;
  const def = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((x) => ({ ...x, clave: `${b.clave}.${x.clave}` }))).find((x) => x.clave === clave);
  const ficha = (emp?.ficha ?? {}) as { logo_url?: string; ciudad?: string };
  const cuando = fecha(a?.confirmado_at) ?? fecha(a?.updated_at);

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "40px 24px 64px", background: "var(--papel)" }}>
      {/* MEMBRETE: la empresa del cliente primero — es SU documento. */}
      <header className="flex items-center justify-between gap-4" style={{ borderBottom: "2px solid var(--tinta)", paddingBottom: 16 }}>
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          {ficha.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ficha.logo_url} alt="" style={{ maxHeight: 48, maxWidth: 120 }} />
          )}
          <div>
            <p className="t-seccion" style={{ fontSize: 17 }}>{emp?.nombre}</p>
            {ficha.ciudad && <p className="t-dato" style={{ color: "var(--grafito)" }}>{ficha.ciudad}</p>}
          </div>
        </div>
        <BotonImprimir />
      </header>

      <h1 className="t-titulo" style={{ marginTop: 28, marginBottom: 4 }}>{def?.nombre ?? clave}</h1>
      {cuando && <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 24 }}>{a?.propuesta_estado === "confirmada" || a?.estado === "construido" || a?.estado === "en_uso" ? `Confirmado el ${cuando}` : `Borrador del ${cuando}`}</p>}

      <DocMd texto={texto} />

      {/* LA FIRMA DE ORIGEN: nuestra regla convertida en sello visible. */}
      <footer style={{ marginTop: 40, borderTop: "1px solid var(--linea)", paddingTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Construido con lo que nos contaste{cuando ? ` · ${cuando}` : ""} — nada es inventado.</p>
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Sistema de Alto Rendimiento Renaser</p>
      </footer>

      <style>{`@media print { .no-imprimir { display: none !important; } @page { margin: 16mm; } }`}</style>
    </main>
  );
}

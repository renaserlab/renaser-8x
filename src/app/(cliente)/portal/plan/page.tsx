import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Plan } from "@/components/Plan";
import { brechaMercado } from "@/lib/mercado";

export const dynamic = "force-dynamic";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/** Lo que falta trabajar y lo que costaría con consultoría tradicional — el valor del acompañamiento, en números. */
function BrechaAfuera({ personas, assets }: { personas: number | null; assets: { clave: string; estado: string | null }[] }) {
  const b = brechaMercado(personas, assets);
  if (!b.items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="t-seccion mb-1">Lo que le falta trabajar a tu empresa</h2>
      <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>
        Y lo que costaría hacerlo afuera, pieza por pieza, con una consultora tradicional.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {b.items.map((i) => (
          <div key={i.clave} className="panel p-4 flex items-start justify-between gap-3">
            <div style={{ minWidth: 0 }}>
              <p className="t-dato" style={{ fontWeight: 600 }}>{i.nombre}</p>
              <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 13 }}>{i.medio ? "a medio camino — ya empezaste" : "aún sin trabajar"}</p>
            </div>
            <div style={{ flex: "none", textAlign: "right" }}>
              <p className="t-dato" style={{ fontWeight: 700 }}>{soles(i.soles[0])}–{soles(i.soles[1])}</p>
              <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 12 }}>{i.semanas[0] === i.semanas[1] ? `${i.semanas[0]} sem` : `${i.semanas[0]}–${i.semanas[1]} sem`}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="panel p-5 mt-4" style={{ background: "var(--marca)", border: "none" }}>
        <p className="t-etiqueta mb-1" style={{ color: "color-mix(in srgb, var(--papel) 70%, transparent)" }}>Todo junto, afuera</p>
        <p className="num-grande" style={{ color: "var(--papel)", fontSize: 28 }}>{soles(b.totalSoles[0])} – {soles(b.totalSoles[1])}</p>
        <p className="t-dato" style={{ color: "color-mix(in srgb, var(--papel) 80%, transparent)" }}>
          y entre {b.totalSemanas[0]} y {b.totalSemanas[1]} semanas haciéndolo por partes. Aquí este trabajo está dentro de tu acompañamiento: se construye contigo, pieza por pieza, en <Link href="/portal/activos" style={{ color: "var(--papel)", textDecoration: "underline" }}>Tu información</Link>.
        </p>
      </div>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)", fontSize: 12.5 }}>Rangos referenciales del mercado peruano de consultoría para pymes; el precio real varía por sector y alcance.</p>
    </section>
  );
}

/** Tu implementación: los 45 días, frente por frente, con avance. Visible cuando el plan está publicado. */
export default async function PlanCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [{ data: pub }, { data: empresa }, { data: assets }] = await Promise.all([
    sb.from("deliverables").select("id").eq("company_id", c.companyId).eq("tipo", "plan_90").eq("publicado", true).limit(1),
    sb.from("companies").select("ficha").eq("id", c.companyId).single(),
    sb.from("company_assets").select("clave,estado").eq("company_id", c.companyId),
  ]);
  const personas = Number((empresa?.ficha as { personas?: string } | null)?.personas) || null;

  if (!pub?.length)
    return (
      <>
        <p className="t-etiqueta">Tu implementación</p>
        <h1 className="t-titulo mt-2 mb-6">Tu plan se está armando</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          El punto de partida ya vive en <strong>Mi empresa</strong> (la sección «Por dónde empezaría»). Cuando lo convirtamos
          juntos en un plan con fechas y responsables, aparece aquí para que marques lo que vas cerrando.
        </p>
        <Link href="/portal/hoy" className="boton">Ver por dónde empezar</Link>
        <BrechaAfuera personas={personas} assets={assets ?? []} />
      </>
    );
  const [{ data: acciones }, { data: cortes }] = await Promise.all([
    sb.from("actions").select("*").eq("company_id", c.companyId).order("semana_inicio").order("prioridad"),
    sb.from("checkpoints").select("*").eq("company_id", c.companyId).order("numero"),
  ]);
  return (
    <>
      <p className="t-etiqueta">Tu implementación</p>
      <h1 className="t-titulo mt-2 mb-2">45 días, frente por frente</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>Máximo tres frentes abiertos a la vez. Marca cada uno cuando lo cierres.</p>
      <Plan companyId={c.companyId} acciones={acciones ?? []} cortes={cortes ?? []} modo="cliente" />
      <BrechaAfuera personas={personas} assets={assets ?? []} />
    </>
  );
}

import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hallazgosAprobadosConEvidencia } from "@/lib/db/queries";
import { Hallazgo, type HallazgoRow } from "@/components/diagnostico/Hallazgo";
import { ENTREGABLE, VACIO, fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

/** Tus resultados: el paquete publicado. Solo hallazgos aprobados con evidencia, solo documentos publicados. Capítulo 34. */
export default async function Resultados() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const { data: docs } = await sb.from("deliverables").select("id,tipo,version,publicado_at").eq("company_id", c.companyId).eq("publicado", true).order("publicado_at", { ascending: false });
  if (!docs?.length)
    return (
      <>
        <p className="t-etiqueta">Tus resultados</p>
        <h1 className="t-titulo mt-2 mb-6">Tu diagnóstico ya está vivo</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          No tienes que esperar a nadie: todo lo que vamos entendiendo de tu empresa está en <strong>Mi empresa</strong>,
          y se afina con cada cosa que cuentas. Los informes finales para descargar aparecerán aquí.
        </p>
        <Link href="/portal/hoy" className="boton">Ver mi empresa hoy</Link>
      </>
    );
  // P0-03: hacia el cliente nunca viaja el nombre de quien dijo algo; solo puesto/rol.
  const hallazgos = ((await hallazgosAprobadosConEvidencia(c.companyId)) as unknown as HallazgoRow[]).map((h) => ({
    ...h,
    finding_evidence: h.finding_evidence.map((e) => ({ ...e, claims: { ...e.claims, participants: e.claims.participants ? { nombre: "", rol: e.claims.participants.rol, puesto: e.claims.participants.puesto } : null } })),
  }));
  const ultimos = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (!ultimos.has(d.tipo)) ultimos.set(d.tipo, d);
  return (
    <>
      <p className="t-etiqueta">Tus resultados</p>
      <h1 className="t-titulo mt-2 mb-8">Lo que encontramos</h1>
      <ul className="flex flex-col gap-2 mb-10">
        {[...ultimos.values()].map((d) => (
          <li key={d.id}>
            <Link href={`/portal/resultados/${d.id}`} className="panel p-4 flex justify-between items-center">
              <span className="t-seccion" style={{ fontSize: 18 }}>{ENTREGABLE[d.tipo]}</span>
              <span className="t-dato" style={{ color: "var(--grafito)" }}>{fechaCorta(d.publicado_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hallazgos.length > 0 && (
        <>
          <h2 className="t-seccion mb-4">Punto por punto</h2>
          <div className="flex flex-col gap-5">
            {hallazgos.map((h) => (
              <Hallazgo key={h.id} h={h} modo="cliente" />
            ))}
          </div>
        </>
      )}
    </>
  );
}

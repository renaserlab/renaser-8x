import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Subir } from "@/components/Subir";
import { AccionesFuente, ReintentarJob } from "@/components/consultor/FuentesAcciones";
import { VACIO, fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

export default async function Fuentes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: fuentes }, { data: jobs }] = await Promise.all([
    sb.from("sources").select("id,tipo,nombre,fecha_origen,origen,estado,error,created_at, claims(count)").eq("company_id", id).order("created_at", { ascending: false }),
    sb.from("jobs").select("id,tipo,estado,progreso,error,created_at").eq("company_id", id).in("estado", ["pendiente", "corriendo", "fallido"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const fallidos = (jobs ?? []).filter((j) => j.estado === "fallido");
  const activos = (jobs ?? []).filter((j) => j.estado !== "fallido");

  return (
    <>
      <Encabezado titulo="Fuentes" sub="Documentos, fotos, notas de voz y datos. Lo que subes aquí queda con origen: consultor." />

      {fallidos.length > 0 && (
        <section className="panel p-5 mb-8" style={{ borderColor: "var(--contradicho)" }}>
          <h2 className="t-seccion" style={{ color: "var(--contradicho)" }}>{fallidos.length} trabajo(s) fallido(s)</h2>
          <p className="t-dato mt-1 mb-4" style={{ color: "var(--grafito)" }}>Nunca desaparecen en silencio.</p>
          <table className="tabla">
            <tbody>
              {fallidos.map((j) => (
                <tr key={j.id}>
                  <td className="t-dato">{j.tipo}</td>
                  <td>{j.error}</td>
                  <td><ReintentarJob jobId={j.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activos.length > 0 && (
        <section className="mb-8">
          <h2 className="t-etiqueta mb-2">En curso</h2>
          <ul className="flex flex-col gap-1">
            {activos.map((j) => (
              <li key={j.id} className="t-dato" style={{ color: "var(--grafito)" }}>
                {j.tipo} · {j.progreso ?? j.estado}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="t-seccion mb-4">Subir</h2>
          <Subir companyId={id} />
        </div>
        <div>
          <h2 className="t-seccion mb-4">Cargadas</h2>
          {!fuentes?.length ? (
            <Vacio texto={VACIO.fuentesConsultor} />
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Definiciones</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fuentes.map((f) => (
                  <tr key={f.id}>
                    <td className="t-dato">
                      {f.nombre}
                      <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{f.origen}</div>
                    </td>
                    <td>{f.tipo}</td>
                    <td className="t-dato">{f.fecha_origen ? fechaCorta(f.fecha_origen) : <span style={{ color: "var(--caducado)" }}>sin fecha</span>}</td>
                    <td>
                      {f.estado === "error" ? <span style={{ color: "var(--contradicho)" }}>{f.error ?? "error"}</span> : f.estado}
                    </td>
                    <td className="t-dato">{(f.claims as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                    <td><AccionesFuente sourceId={f.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

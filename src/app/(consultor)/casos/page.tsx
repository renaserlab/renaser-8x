import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { MOTIVO_CORRECCION, fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

/** Biblioteca de casos + registro de correcciones: en qué falla el sistema sistemáticamente. Capítulo 38. */
export default async function Casos() {
  const sb = supabaseAdmin();
  const [{ data: casos }, { data: corr }, { data: evals }] = await Promise.all([
    sb.from("cases").select("id,cerrado_at,perfil,resultado_90d, companies(nombre)").order("cerrado_at", { ascending: false }),
    sb.from("corrections").select("accion,motivo"),
    sb.from("eval_runs").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const motivos: Record<string, number> = {};
  let aprobados = 0, total = 0;
  for (const c of corr ?? []) {
    total++;
    if (c.accion === "aprobado") aprobados++;
    if (c.motivo) motivos[c.motivo] = (motivos[c.motivo] ?? 0) + 1;
  }
  return (
    <>
      <Encabezado titulo="Casos y aprendizaje" sub="Cada empresa que pasa por el sistema lo deja mejor que la anterior." />

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="t-seccion mb-4">Qué corrige el consultor</h2>
          <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>
            {total} revisiones · {total ? Math.round((aprobados / total) * 100) : 0}% aprobadas directo
          </p>
          {Object.keys(motivos).length === 0 ? (
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Sin correcciones todavía.</p>
          ) : (
            <table className="tabla">
              <tbody>
                {Object.entries(motivos)
                  .sort((a, b) => b[1] - a[1])
                  .map(([m, n]) => (
                    <tr key={m}>
                      <td>{MOTIVO_CORRECCION[m] ?? m}</td>
                      <td className="t-dato text-right">{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="t-seccion mb-4">Evaluaciones</h2>
          {!evals?.length ? (
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Ninguna corrida. Se corre desde la ficha de una empresa al cerrar.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Prompt</th>
                  <th>Precisión</th>
                  <th>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {evals.map((e) => (
                  <tr key={e.id}>
                    <td className="t-dato">{fechaCorta(e.created_at)}</td>
                    <td>{e.version_prompt}</td>
                    <td className="t-dato">{e.precision != null ? `${Math.round(e.precision * 100)}%` : "—"}</td>
                    <td className="t-dato">{e.cobertura != null ? `${Math.round(e.cobertura * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <h2 className="t-seccion mt-12 mb-4">Biblioteca de casos</h2>
      {!casos?.length ? (
        <Vacio texto="Ningún caso cerrado todavía. Un caso se guarda al terminar los 45 días de monitoreo." />
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Sector</th>
              <th>Cerrado</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id}>
                <td className="t-dato">{(c.companies as unknown as { nombre: string } | null)?.nombre}</td>
                <td>{(c.perfil as { sector?: string })?.sector ?? "—"}</td>
                <td className="t-dato">{fechaCorta(c.cerrado_at)}</td>
                <td>{c.resultado_90d ? JSON.stringify(c.resultado_90d).slice(0, 120) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

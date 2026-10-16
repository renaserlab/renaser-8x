import Link from "next/link";
import { Encabezado } from "@/components/base/Vacio";
import { listarDecisiones, queLeFalta, balanceDeCorrecciones } from "@/lib/decisiones";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = {
  pendiente: "var(--medida)", aprobada: "var(--confirmado)", modificada: "var(--marca)",
  objetada: "var(--caducado)", rechazada: "var(--contradicho)", pospuesta: "var(--grafito)", pide_evidencia: "var(--caducado)",
};

/** LA COLA DE DECISIONES (manual §72): lo que espera a la consultora, no informes largos. */
export default async function Decisiones({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  const [filas, balance, { data: empresas }] = await Promise.all([
    listarDecisiones(undefined, sp.estado as never),
    balanceDeCorrecciones(),
    supabaseAdmin().from("companies").select("id,nombre"),
  ]);
  const nombre = new Map((empresas ?? []).map((e) => [e.id, e.nombre]));
  const pendientes = filas.filter((d) => d.estado === "pendiente");

  return (
    <>
      <Encabezado
        titulo="Decisiones"
        sub="Lo que el sistema propone y espera tu criterio. Cada una cabe en una pantalla: evidencia, alternativas y una recomendación con su porqué."
      />

      <section className="fila-numeros" style={{ marginBottom: 24 }}>
        <div>
          <div className="t-etiqueta">Esperan tu decisión</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{pendientes.length}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>de {filas.length} registradas</div>
        </div>
        <div>
          <div className="t-etiqueta">Veces que corregiste al sistema</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{balance.total}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>
            {Object.entries(balance.porAccion).map(([a, n]) => `${a}: ${n}`).join(" · ") || "ninguna todavía"}
          </div>
        </div>
        <div>
          <div className="t-etiqueta">Con resultado ya observado</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{balance.conResultado}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>
            {balance.sinResultado} sin observar: no se puede saber todavía si corregir sirvió
          </div>
        </div>
      </section>

      {filas.length === 0 ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Todavía no hay decisiones registradas. Aparecen aquí cuando un agente propone algo que necesita tu criterio —
          no cuando hace su trabajo rutinario ya autorizado.
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Estado</th><th>Qué se decide</th><th>Empresa</th><th>Quién la produjo</th><th>Lista</th><th aria-label="Abrir"></th></tr>
          </thead>
          <tbody>
            {filas.map((d) => {
              const falta = queLeFalta(d);
              return (
                <tr key={d.id}>
                  <td style={{ color: COLOR[d.estado] ?? "var(--grafito)" }}>{d.estado.replace("_", " ")}</td>
                  <td>{d.titulo}</td>
                  <td>{nombre.get(d.company_id) ?? "—"}</td>
                  <td className="t-dato">{d.origen === "agente" ? `${d.agente ?? "agente"}${d.agente_version ? ` v${d.agente_version}` : ""}` : "la consultora"}</td>
                  <td className="t-dato" style={{ color: falta.length ? "var(--caducado)" : "var(--confirmado)" }}>
                    {falta.length ? `le falta ${falta.length}` : "sí"}
                  </td>
                  <td><Link href={`/decisiones/${d.id}`} className="t-dato">Abrir</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

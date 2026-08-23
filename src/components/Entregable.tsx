import { fechaCorta } from "@/lib/textos";

export type Redactado = { titulo: string; secciones: { titulo: string; parrafos: string[]; fuentes: string[] }[] };

/** Documento redactado: serif, peso de informe, cada sección con sus fuentes. Capítulo 16 y 35. */
export function Documento({ contenido, marca }: { contenido: Redactado; marca?: string }) {
  return (
    <article className="t-doc medida" style={{ margin: "0 auto" }}>
      {marca && <p className="t-etiqueta mb-6">{marca}</p>}
      <h1 style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.2, marginBottom: 32 }}>{contenido.titulo}</h1>
      {contenido.secciones.map((s, i) => (
        <section key={i} style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>{s.titulo}</h2>
          {s.parrafos.map((p, j) => (
            <p key={j} style={{ marginBottom: 14 }}>{p}</p>
          ))}
          {s.fuentes?.length > 0 && (
            <ul style={{ fontSize: 14, color: "var(--grafito)", borderLeft: "2px solid var(--linea)", paddingLeft: 12, marginTop: 8 }}>
              {s.fuentes.map((f, k) => (
                <li key={k}>{f}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

export type SopRow = { objetivo: string | null; disparador: string | null; responsable: string | null; pasos: { n: number; que: string; quien?: string | null; estandar?: string | null }[] | null; entradas: string[] | null; salidas: string[] | null; estandar: string | null; indicador: string | null; excepciones: { situacion: string; que_hacer: string }[] | null };

/** "Cómo se hace": el documento que más se usa después. */
export function Sop({ sop, titulo }: { sop: SopRow; titulo?: string }) {
  return (
    <article className="t-doc">
      {titulo && <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>{titulo}</h2>}
      <dl className="grid gap-3" style={{ gridTemplateColumns: "140px 1fr", fontSize: 16 }}>
        <dt className="t-etiqueta">Para qué</dt><dd>{sop.objetivo}</dd>
        <dt className="t-etiqueta">Cuándo empieza</dt><dd>{sop.disparador}</dd>
        <dt className="t-etiqueta">Responsable</dt><dd>{sop.responsable}</dd>
        {sop.entradas?.length ? (<><dt className="t-etiqueta">Necesita</dt><dd>{sop.entradas.join(" · ")}</dd></>) : null}
        {sop.salidas?.length ? (<><dt className="t-etiqueta">Produce</dt><dd>{sop.salidas.join(" · ")}</dd></>) : null}
      </dl>
      <h3 style={{ fontSize: 18, fontWeight: 600, margin: "20px 0 8px" }}>Pasos</h3>
      <ol style={{ paddingLeft: 24 }}>
        {(sop.pasos ?? []).map((p) => (
          <li key={p.n} style={{ marginBottom: 8 }}>
            {p.que}
            {p.quien && <span style={{ color: "var(--grafito)" }}> — {p.quien}</span>}
            {p.estandar && <div style={{ fontSize: 14, color: "var(--grafito)" }}>Bien hecho significa: {p.estandar}</div>}
          </li>
        ))}
      </ol>
      <h3 style={{ fontSize: 18, fontWeight: 600, margin: "20px 0 8px" }}>Estándar</h3>
      <p>{sop.estandar}</p>
      <h3 style={{ fontSize: 18, fontWeight: 600, margin: "20px 0 8px" }}>Indicador</h3>
      <p>{sop.indicador}</p>
      {sop.excepciones?.length ? (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "20px 0 8px" }}>Cuando algo no encaja</h3>
          <ul style={{ paddingLeft: 24 }}>
            {sop.excepciones.map((e, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <strong>{e.situacion}:</strong> {e.que_hacer}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

export type Accion = { id: string; accion: string; responsable: string | null; kpi: string | null; evidencia: string | null; impacto: string | null; semana_inicio: number | null; semana_cierre: number | null; estado: string; nota: string | null; vence_at: string | null; fase: string; findings?: { titulo: string } | null };

export function PlanTabla({ acciones, paraCliente = false }: { acciones: Accion[]; paraCliente?: boolean }) {
  const ESTADO: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho", descartado: "Descartado" };
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Semana</th>
          <th>Qué hacer</th>
          <th>Responsable</th>
          <th>Indicador</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {acciones.map((a) => (
          <tr key={a.id} style={a.estado === "hecho" ? { opacity: 0.6 } : undefined}>
            <td className="t-dato">{a.semana_inicio}–{a.semana_cierre}</td>
            <td>
              <div className="t-cuerpo">{a.accion}</div>
              {!paraCliente && a.findings?.titulo && <div className="t-dato" style={{ color: "var(--grafito)" }}>{a.findings.titulo}</div>}
              {a.evidencia && <div className="t-dato" style={{ color: "var(--grafito)" }}>Prueba: {a.evidencia}</div>}
            </td>
            <td>{a.responsable}</td>
            <td>{a.kpi}</td>
            <td>
              <div className="t-dato" style={{ color: a.estado === "hecho" ? "var(--confirmado)" : a.vence_at && a.vence_at < new Date().toISOString().slice(0, 10) && a.estado !== "hecho" ? "var(--contradicho)" : "var(--tinta)" }}>{ESTADO[a.estado]}</div>
              <div className="t-dato" style={{ color: "var(--grafito)" }}>vence {fechaCorta(a.vence_at)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

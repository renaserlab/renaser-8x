/**
 * FRANJA DE INSTRUMENTOS — el idioma híbrido de 8X (elegido por la dueña, 2026-08-27):
 * lecturas vitales entre líneas finas, numerales tabulares, SIN tarjetas. La franja es el instrumento.
 * Se usa igual en el inicio del empresario, la bandeja del consultor y el panorama de empresa.
 */

export function Franja({ children, columnas }: { children: React.ReactNode; columnas: number }) {
  return (
    <section
      aria-label="Lecturas"
      className="grid"
      style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, borderTop: "2px solid var(--tinta)", borderBottom: "1px solid var(--linea)" }}
    >
      {children}
    </section>
  );
}

export function Lectura({ valor, unidad, etiqueta, color, divisor = true, extra }: { valor: string; unidad?: string; etiqueta: string; color?: string; divisor?: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", minWidth: 0, borderLeft: divisor ? "1px solid var(--linea)" : "none" }}>
      <p style={{ fontSize: "clamp(19px, 3.2vw, 26px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: color ?? "var(--tinta)", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {valor}
        {unidad && <span style={{ fontSize: 13, fontWeight: 500, color: "var(--grafito)", marginLeft: 4 }}>{unidad}</span>}
      </p>
      <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 13, marginTop: 2 }}>{etiqueta}</p>
      {extra}
    </div>
  );
}

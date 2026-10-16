/**
 * PIEZAS DE TABLERO (estilo del 13-10-2026). Cada una se dibuja desde sus datos: nada es una imagen pegada.
 * Regla de la casa que no cambió con el estilo: lo que no hay se dibuja rayado y se nombra, nunca como cero
 * ni como una altura cualquiera. Un cero contado sí es cero: una raya en la base.
 */

const DE = [0xb9, 0xcf, 0xf7];
const A = [0x2f, 0x6f, 0xe4];
const mezcla = (t: number) => `rgb(${DE.map((d, i) => Math.round(d + (A[i] - d) * t)).join(",")})`;

/** Medidor semicircular de catorce cápsulas. `pct` null = sin dato: todas vacías y lo dice. */
export function Medidor({ pct, etiqueta }: { pct: number | null; etiqueta: string }) {
  const n = 14, cx = 130, cy = 128, r1 = 84, r2 = 116;
  const llenas = pct == null ? 0 : Math.round((Math.max(0, Math.min(100, pct)) / 100) * n);
  return (
    <svg viewBox="0 0 260 140" role="img" aria-label={pct == null ? `${etiqueta}: sin dato` : `${etiqueta}: ${pct}%`}>
      {Array.from({ length: n }, (_, i) => {
        const a = Math.PI - (i * Math.PI) / (n - 1);
        const t = llenas > 1 ? i / (llenas - 1) : 1;
        return (
          <line
            key={i}
            x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)}
            x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)}
            stroke={i < llenas ? mezcla(0.35 + 0.65 * t) : "var(--azul-velo)"}
            strokeWidth={15} strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export type Barra = { valor: number | null; dicho?: boolean };

/**
 * Barritas finas, una por periodo. Las tres últimas con dato van en azul fuerte. Sin dato: carril rayado entero.
 * Cero contado: raya en la base. Dicho pero sin confirmar: solo el contorno.
 */
export function Barritas({ barras, etiqueta }: { barras: Barra[]; etiqueta: string }) {
  const max = Math.max(...barras.map((b) => b.valor ?? 0), 1);
  const ultima = barras.map((b) => b.valor != null).lastIndexOf(true);
  return (
    <div className="barritas" role="img" aria-label={etiqueta}>
      {barras.map((b, i) => {
        if (b.valor == null) return <span key={i} className="vacia" />;
        if (b.valor === 0) return <span key={i} className="cero" />;
        const clase = b.dicho ? "dicho" : i >= ultima - 2 ? "fuerte" : undefined;
        return <span key={i} className={clase} style={{ height: `${Math.max(8, (b.valor / max) * 100)}%` }} />;
      })}
    </div>
  );
}

/** Barra segmentada con leyenda: oscuro, gris, gris claro y rayado (el rayado siempre es lo que falta). */
export function Segmentos({ partes, etiqueta }: { partes: { n: number; texto: string; tipo: "s1" | "s2" | "s3" | "s4" }[]; etiqueta: string }) {
  const visibles = partes.filter((p) => p.n > 0);
  return (
    <>
      <div className="segmentos" role="img" aria-label={etiqueta}>
        {visibles.map((p) => <span key={p.texto} className={p.tipo} style={{ flex: p.n }} />)}
      </div>
      <div className="leyenda">
        {partes.map((p) => (
          <span key={p.texto}><i className={p.tipo === "s3" ? "rayita" : p.tipo.replace("s", "l")} />{p.n} {p.texto}</span>
        ))}
      </div>
    </>
  );
}

/** Franja por fases: cuántas empresas hay en cada tramo del recorrido; el tramo sin datos va rayado. */
export function FranjaFases({ tramos, etiqueta }: { tramos: { n: number; texto: string; tipo: "r1" | "r2" | "r3" | "r4" }[]; etiqueta: string }) {
  const visibles = tramos.filter((t) => t.n > 0);
  if (!visibles.length) return null;
  return (
    <div className="franja" role="img" aria-label={etiqueta}>
      <div className="barra-rayas">{visibles.map((t) => <span key={t.texto} className={t.tipo} style={{ flex: t.n }} />)}</div>
      <div className="marcas">{visibles.map((t) => <span key={t.texto}><i className={t.tipo} />{t.texto} {t.n}</span>)}</div>
    </div>
  );
}

/** Pista horizontal: lo lleno es lo confirmado, el resto rayado es lo que espera confirmación. */
export function Pista({ lleno, resto, escala }: { lleno: number; resto: number; escala: number }) {
  const e = Math.max(escala, 1);
  return (
    <div className="pista" aria-hidden="true">
      {lleno > 0 && <span className="lleno" style={{ width: `${(100 * lleno) / e}%` }} />}
      {resto > 0 && <span className="resto" style={{ width: `${(100 * resto) / e}%` }} />}
    </div>
  );
}

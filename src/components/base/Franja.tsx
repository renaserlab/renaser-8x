/**
 * FRANJA DE INSTRUMENTOS — lecturas vitales entre líneas finas, SIN tarjetas: la franja es el instrumento (elegida por
 * la dueña, 2026-08-27). Se usa en la cartera y en la salud del sistema. Noche y perla (17-10-2026): cada lectura es
 * una cifra protagonista suelta, en la letra de las cifras; la unidad y la etiqueta, en la de la interfaz. El estilo
 * vive en src/design/portal.css (.franja-lecturas, .lectura-franja).
 */

export function Franja({ children, columnas }: { children: React.ReactNode; columnas: number }) {
  return (
    <section aria-label="Lecturas" className="franja-lecturas" style={{ "--columnas": columnas } as React.CSSProperties}>
      {children}
    </section>
  );
}

export function Lectura({ valor, unidad, etiqueta, color, divisor = true, extra }: { valor: string; unidad?: string; etiqueta: string; color?: string; divisor?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="lectura-franja" data-divisor={divisor ? "" : undefined}>
      <p className="lectura-franja__valor" style={color ? { color } : undefined}>
        {valor}
        {unidad && <span className="lectura-franja__unidad">{unidad}</span>}
      </p>
      <p className="lectura-franja__etiqueta">{etiqueta}</p>
      {extra}
    </div>
  );
}

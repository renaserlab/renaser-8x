/**
 * LA REJILLA DE LA CARTERA. Una sola lista sirve de tabla en escritorio y de ficha en celular: en pantalla ancha
 * las nueve columnas van en una fila bajo sus rótulos; en un celular cada dato lleva su rótulo encima y se
 * acomoda de dos en dos. Así la fila se lee sin deslizar hacia los lados y se puede abrir con un toque.
 */

/** Las nueve columnas en escritorio; dos en celular. El orden es el de `ROTULOS`. Quien la usa pone `grid` (o `hidden lg:grid`). */
export const REJILLA_FILA =
  "grid-cols-2 gap-x-4 gap-y-3 lg:gap-x-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]";

export const ROTULOS = ["Empresa", "Consultor y nivel", "Fase", "Próxima decisión", "Prioridades", "Compromisos", "Entregas", "Bloqueos", "Resultados"] as const;

/** La carga por consultor: el nombre y cinco cuentas. */
export const REJILLA_CARGA = "grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:gap-x-3 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]";

export const ROTULOS_CARGA = ["Consultor", "Empresas activas", "Esperan decisión", "Con algo bloqueado", "Compromisos vencidos", "Prioridades abiertas"] as const;

/** Una celda que en celular ocupa el ancho entero de la ficha (la empresa, la próxima decisión, los resultados). */
export const ANCHA_FILA = "col-span-2 lg:col-span-1";
/** Lo mismo en la carga por consultor, que en pantallas medianas va de tres en tres. */
export const ANCHA_CARGA = "col-span-2 sm:col-span-3 lg:col-span-1";

/**
 * Un dato con su rótulo. En celular el rótulo se ve; en escritorio lo da la fila de encabezados, y aquí queda
 * solo para quien usa lector de pantalla.
 */
export function Celda({ rotulo, clase, children }: { rotulo: string; clase?: string; children: React.ReactNode }) {
  return (
    <div className={clase} style={{ minWidth: 0 }}>
      <span className="t-etiqueta block lg:sr-only">{rotulo}</span>
      {children}
    </div>
  );
}

/** La fila de rótulos de escritorio. En celular no se pinta: cada celda lleva el suyo. */
export function Encabezados({ rejilla, rotulos }: { rejilla: string; rotulos: readonly string[] }) {
  return (
    <div className={`hidden lg:grid ${rejilla}`} aria-hidden="true" style={{ padding: "10px 0", borderBottom: "1px solid var(--linea)" }}>
      {rotulos.map((r) => (
        <span key={r} className="t-etiqueta">{r}</span>
      ))}
    </div>
  );
}

/** «1 vencido», «3 vencidos». */
export function contar(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

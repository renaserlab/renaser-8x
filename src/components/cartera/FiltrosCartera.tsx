import Link from "next/link";
import { FASES_METODO, NOMBRE_FASE, FILTRO_SIN_ASIGNAR, FILTRO_SIN_FASE, SIN_CONSULTOR, SIN_FASE_NOMBRE, type ConsultorBreve, type FiltroCartera } from "@/lib/cartera";

/**
 * LOS FILTROS DE LA CARTERA: por consultor y por fase del método. Es un formulario que solo consulta: el
 * filtro viaja en la dirección, así que se puede guardar o compartir la vista filtrada y funciona igual en
 * un celular. No guarda nada.
 */
export function FiltrosCartera({ consultores, filtro, visibles, total }: { consultores: readonly ConsultorBreve[]; filtro: FiltroCartera; visibles: number; total: number }) {
  const hayFiltro = Boolean(filtro.consultor || filtro.fase);
  // Si el filtro trae un consultor que ya no está en la lista, la opción se muestra igual: el selector no cambia solo.
  const fueraDeLista = filtro.consultor && filtro.consultor !== FILTRO_SIN_ASIGNAR && !consultores.some((c) => c.id === filtro.consultor);
  return (
    <form method="get" action="/cartera" className="no-imprimir flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1" style={{ flex: "1 1 200px", maxWidth: 320 }}>
        <span className="t-etiqueta">Consultor</span>
        <select aria-label="Filtrar por consultor" name="consultor" className="campo" defaultValue={filtro.consultor ?? ""}>
          <option value="">Todos</option>
          {consultores.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre?.trim() || c.email || "Consultor sin nombre"}</option>
          ))}
          {fueraDeLista && <option value={filtro.consultor ?? ""}>Consultor no encontrado</option>}
          <option value={FILTRO_SIN_ASIGNAR}>{SIN_CONSULTOR}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1" style={{ flex: "1 1 200px", maxWidth: 320 }}>
        <span className="t-etiqueta">Fase del método</span>
        <select aria-label="Filtrar por fase del método" name="fase" className="campo" defaultValue={filtro.fase ?? ""}>
          <option value="">Todas</option>
          {FASES_METODO.map((f) => (
            <option key={f} value={f}>{NOMBRE_FASE[f]}</option>
          ))}
          <option value={FILTRO_SIN_FASE}>{SIN_FASE_NOMBRE}</option>
        </select>
      </label>
      <button type="submit" className="boton boton--secundario">Filtrar</button>
      {hayFiltro && (
        <Link href="/cartera" className="t-dato" style={{ color: "var(--marca)", padding: "12px 4px" }}>Quitar filtros</Link>
      )}
      <p className="t-dato" style={{ color: "var(--grafito)", flexBasis: "100%" }} aria-live="polite">
        {hayFiltro ? `Se muestran ${visibles} de ${total} empresas.` : `${total} ${total === 1 ? "empresa" : "empresas"} en la cartera.`}
      </p>
    </form>
  );
}

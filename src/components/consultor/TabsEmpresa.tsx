"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Una capa del recorrido de la consultora: su rótulo y las pestañas que viven en ella. */
export type Capa = { rotulo: string; tabs: [string, string][] };

/**
 * Secciones de la empresa en CAPAS con rótulo visible (Resumen → Evidencia → Intervención): el orden en que
 * la consultora lee una empresa.
 * — Escritorio ancho: una COLUMNA LATERAL de la empresa, a la izquierda de la pantalla, con el rótulo de cada
 *   capa y sus secciones una debajo de otra; se queda a la vista al bajar (sticky).
 * — Celular y pantallas medianas: cada capa es una fila que se desliza en horizontal y la sección activa se trae
 *   a la vista. Ninguna sección queda escondida.
 * Los estilos viven en src/design/tablero.css (.tabs-empresa).
 */
export function TabsEmpresa({ base, capas }: { base: string; capas: Capa[] }) {
  const ruta = usePathname();
  const activa = useRef<HTMLAnchorElement | null>(null);
  const esActiva = (h: string) => (h === "" ? ruta === base : ruta === `${base}${h}` || ruta.startsWith(`${base}${h}/`));

  // Solo se mueve la fila, nunca la página: en un celular la pestaña activa no puede quedar fuera de la vista.
  // En la columna de escritorio la fila no desborda en horizontal y esto no hace nada.
  useEffect(() => {
    const el = activa.current;
    const fila = el?.parentElement;
    if (!el || !fila || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft += el.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - el.clientWidth) / 2;
  }, [ruta]);

  return (
    <nav className="tabs-empresa no-imprimir" aria-label="Secciones de la empresa">
      {capas.map((capa) => {
        const aqui = capa.tabs.some(([h]) => esActiva(h));
        return (
          <div key={capa.rotulo} className="capa-empresa" data-aqui={aqui ? "si" : undefined}>
            <p className="capa-empresa__rotulo">{capa.rotulo}</p>
            <div className="capa-empresa__secciones overflow-x-auto">
              {capa.tabs.map(([h, n]) => {
                const activo = esActiva(h);
                return (
                  <Link key={h} ref={activo ? activa : undefined} href={`${base}${h}`} aria-current={activo ? "page" : undefined}>
                    {n}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

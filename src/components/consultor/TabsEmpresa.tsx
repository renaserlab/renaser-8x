"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Una capa del recorrido de la consultora: su rótulo y las pestañas que viven en ella. */
export type Capa = { rotulo: string; tabs: [string, string][] };

/**
 * Pestañas de la empresa en CAPAS con rótulo visible (Resumen → Evidencia → Intervención): el orden en
 * que la consultora lee una empresa. Cada capa es una fila con estado activo real (línea firme).
 * En pantallas chicas la fila se desliza en horizontal y la pestaña activa se trae a la vista; en
 * escritorio las pestañas se acomodan en más de un renglón, para que ninguna quede escondida.
 */
export function TabsEmpresa({ base, capas }: { base: string; capas: Capa[] }) {
  const ruta = usePathname();
  const activa = useRef<HTMLAnchorElement | null>(null);
  const esActiva = (h: string) => (h === "" ? ruta === base : ruta === `${base}${h}` || ruta.startsWith(`${base}${h}/`));

  // Solo se mueve la fila, nunca la página: en un celular la pestaña activa no puede quedar fuera de la vista.
  useEffect(() => {
    const el = activa.current;
    const fila = el?.parentElement;
    if (!el || !fila || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft += el.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - el.clientWidth) / 2;
  }, [ruta]);

  return (
    <nav className="mt-4" aria-label="Secciones de la empresa" style={{ borderTop: "1px solid var(--linea)" }}>
      {capas.map((capa) => {
        const aqui = capa.tabs.some(([h]) => esActiva(h));
        return (
          <div key={capa.rotulo} className="lg:flex lg:items-baseline lg:gap-2" style={{ borderBottom: "1px solid var(--linea)" }}>
            <p
              className="t-etiqueta"
              style={{ flex: "none", width: 116, paddingTop: 8, textTransform: "uppercase", letterSpacing: "0.08em", color: aqui ? "var(--tinta)" : "var(--grafito)" }}
            >
              {capa.rotulo}
            </p>
            <div className="flex gap-1 overflow-x-auto lg:flex-wrap lg:overflow-visible" style={{ flex: 1, minWidth: 0, scrollbarWidth: "none" }}>
              {capa.tabs.map(([h, n]) => {
                const activo = esActiva(h);
                return (
                  <Link
                    key={h}
                    ref={activo ? activa : undefined}
                    href={`${base}${h}`}
                    aria-current={activo ? "page" : undefined}
                    className="t-dato px-3 py-2"
                    style={{ whiteSpace: "nowrap", color: activo ? "var(--tinta)" : "var(--grafito)", fontWeight: activo ? 600 : 500, borderBottom: activo ? "2px solid var(--marca)" : "2px solid transparent", marginBottom: -1, textDecoration: "none" }}
                  >
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

"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { subActiva, subrutaDe, vistaDe, vistaPorClave } from "@/lib/vistas-empresa";

/**
 * «EN ESTA VISTA»: las pantallas que viven dentro de la vista abierta de la empresa, como píldoras claras sobre el cielo
 * (la misma pieza que «En esta sección» del portal, clase .en-seccion). Se monta UNA vez, en el layout de
 * /empresa/[id]; ninguna página necesita saber que existe. Una vista con una sola pantalla no pinta la fila.
 * Nombres y orden salen de src/lib/vistas-empresa.ts: si una pantalla nace, se anota allí y aparece aquí sola.
 */
export function EnEstaVista({ base }: { base: string }) {
  const ruta = usePathname();
  const activo = useRef<HTMLAnchorElement | null>(null);
  const sub = subrutaDe(ruta, base);
  const clave = sub === null ? null : vistaDe(sub);
  const actual = sub === null ? null : subActiva(sub);
  const pantallas = clave ? vistaPorClave(clave).sub : [];

  // Solo se mueve la fila, nunca la página: en un celular el enlace activo no puede quedar fuera de la vista.
  useEffect(() => {
    const el = activo.current;
    const fila = el?.parentElement;
    if (!el || !fila || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft += el.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - el.clientWidth) / 2;
  }, [ruta]);

  if (pantallas.length < 2) return null;
  return (
    <nav className="no-imprimir en-seccion overflow-x-auto" aria-label="En esta vista">
      {pantallas.map(([h, nombre]) => {
        const aqui = h === actual;
        return (
          <Link key={h || "resumen"} ref={aqui ? activo : undefined} href={`${base}${h}`} aria-current={aqui ? "page" : undefined} style={{ whiteSpace: "nowrap" }}>
            {nombre}
          </Link>
        );
      })}
    </nav>
  );
}

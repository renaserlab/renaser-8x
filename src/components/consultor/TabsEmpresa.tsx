"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/base/Icono";
import { subrutaDe, vistaDe, type Vista } from "@/lib/vistas-empresa";

/**
 * LAS VISTAS DE LA EMPRESA (16-10-2026, pedido de Kelin: «son muchas pestañas que deberían estar en una sola»).
 * Antes: 20 pestañas en tres capas. Ahora: cinco vistas (Diagnóstico, Números, Indicadores, Estructura, Avance) y, al
 * final y aparte, el Expediente. Las pantallas de cada vista se enlazan en la fila «En esta vista» (EnEstaVista).
 * En todos los anchos es una barra horizontal bajo el nombre de la empresa, como la del portal (revisión del
 * 16-10-2026: la columna fija junto a la barra lateral era una columna de más). Desde el 17-10-2026 es un control
 * segmentado: una pista suave y la vista activa como pulgar blanco (src/design/marco.css). En un celular la pista se
 * desliza y la activa se trae a la vista.
 * Qué vista está activa lo decide vistaDe() de src/lib/vistas-empresa.ts: /procesos/abc es Estructura, /entrega/x es
 * Avance. Los estilos viven en src/design/marco.css (.vistas-empresa).
 */
export function TabsEmpresa({ base, vistas, expediente }: { base: string; vistas: Vista[]; expediente: Vista }) {
  const ruta = usePathname();
  const sub = subrutaDe(ruta, base);
  const activa = sub === null ? null : vistaDe(sub);
  const enlaceActivo = useRef<HTMLAnchorElement | null>(null);

  // Solo se mueve la fila, nunca la página: en un celular la vista activa no puede quedar fuera de la vista.
  // En escritorio la barra no desborda y esto no hace nada.
  useEffect(() => {
    const el = enlaceActivo.current;
    const fila = el?.closest<HTMLElement>(".vistas-empresa");
    if (!el || !fila || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft += el.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - el.clientWidth) / 2;
  }, [ruta]);

  const enlace = (v: Vista, discreto = false) => {
    const aqui = v.clave === activa;
    return (
      <Link
        key={v.clave}
        ref={aqui ? enlaceActivo : undefined}
        href={`${base}${v.href}`}
        aria-current={aqui ? "page" : undefined}
        data-discreto={discreto ? "" : undefined}
      >
        <Icono nombre={v.icono} />
        <span>{v.nombre}</span>
      </Link>
    );
  };

  return (
    <nav className="vistas-empresa no-imprimir" aria-label="Vistas de la empresa">
      {vistas.map((v) => enlace(v))}
      <div className="vistas-empresa__expediente">{enlace(expediente, true)}</div>
    </nav>
  );
}

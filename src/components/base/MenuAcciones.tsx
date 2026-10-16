"use client";
import { useEffect, useRef } from "react";
import { Icono } from "@/components/base/Icono";

/**
 * EL MENÚ DE ACCIONES DE UNA TARJETA (revisión del 16-10-2026). «Quitar» subrayado en cada tarjeta, con el mismo peso
 * que «Verlo», era ruido y era un riesgo: un toque de más y se pedía borrar. Las acciones secundarias de una tarjeta
 * (editar, quitar) van aquí, detrás de los tres puntos; la principal sigue a la vista.
 *
 * Es un <details> nativo, como «Administrar»: abre y cierra sin JavaScript. Aquí solo se le agrega cerrarse al tocar
 * fuera, con Escape y al elegir una acción. Las acciones son los hijos (botones), cada uno con su propio onClick.
 */
export function MenuAcciones({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const alTocar = (e: PointerEvent) => {
      const d = ref.current;
      if (!d?.open || (e.target instanceof Node && d.contains(e.target))) return;
      d.open = false;
    };
    const alTeclear = (e: KeyboardEvent) => {
      const d = ref.current;
      if (e.key !== "Escape" || !d?.open) return;
      d.open = false;
      d.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", alTocar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("pointerdown", alTocar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, []);

  return (
    <details ref={ref} className="menu-acciones no-imprimir">
      <summary aria-label={etiqueta} title={etiqueta}>
        <Icono nombre="mas" />
      </summary>
      <div
        className="menu-acciones__panel"
        role="group"
        aria-label={etiqueta}
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

"use client";
import { useEffect, useRef } from "react";
import { Icono } from "@/components/base/Icono";

/**
 * «ADMINISTRAR» EN LA CABECERA DE LA EMPRESA (16-10-2026). Lo que antes eran cinco botones sueltos arriba del Panorama
 * (datos de la empresa, país y moneda, fase del expediente, WhatsApp del dueño) se guarda en un solo menú: la cabecera
 * queda con el nombre de la empresa, «Ver como el empresario» y esto. Las piezas de adentro no cambian; las pone el
 * layout de /empresa/[id] como hijos, cada una en su `.menu-administrar__fila`.
 *
 * Es un <details> nativo (abre y cierra sin JavaScript); aquí solo se le agrega cerrarse al tocar fuera y con Escape.
 * Escape no lo cierra mientras un panel abierto desde adentro (aria-modal) está a la vista: ese panel se cierra primero.
 */
export function MenuAdministrar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const alTocar = (e: PointerEvent) => {
      const d = ref.current;
      if (!d?.open || (e.target instanceof Node && d.contains(e.target))) return;
      d.open = false;
    };
    const alTeclear = (e: KeyboardEvent) => {
      const d = ref.current;
      if (e.key !== "Escape" || !d?.open || d.querySelector('[aria-modal="true"]')) return;
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
    <details ref={ref} className="menu-administrar no-imprimir">
      <summary className="boton boton--secundario">
        Administrar
        <Icono nombre="abajo" />
      </summary>
      <div className="menu-administrar__panel" role="group" aria-label="Administrar la empresa">
        {children}
      </div>
    </details>
  );
}

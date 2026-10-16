"use client";
import { useState } from "react";
import { VerFuente } from "@/components/realidad/VerFuente";

/**
 * Abre el archivo subido en el panel de siempre (VerFuente: la foto, el PDF o el audio con un enlace firmado y temporal,
 * y el texto leído). Lo mismo para el dueño y para la consultora: la ruta de la fuente ya decide quién puede abrirla.
 */
export function AbrirArchivo({ sourceId, nombre }: { sourceId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="enlace-azul"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: 44, font: "inherit", fontWeight: 650, fontSize: 13.5, color: "var(--marca)" }}
        onClick={() => setAbierto(true)}
        aria-label={`Abrir «${nombre}»`}
      >
        Abrir el archivo
      </button>
      {abierto && <VerFuente sourceId={sourceId} fragmentId={null} cerrar={() => setAbierto(false)} />}
    </>
  );
}

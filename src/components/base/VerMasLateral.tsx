"use client";
import { useEffect, useState } from "react";

/**
 * "Ver más" genérico que despliega AL COSTADO (PC) o desde abajo (celular) — regla de la casa:
 * el contenido de la página nunca se empuja. El contenido llega renderizado del servidor (children).
 */
export function VerMasLateral({ titulo, etiqueta = "Ver más", children }: { titulo: string; etiqueta?: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abierto]);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "var(--marca)", textDecoration: "underline" }}>
        {etiqueta}
      </button>
      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar el detalle" onClick={() => setAbierto(false)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-hero" style={{ fontSize: 20, minWidth: 0 }}>{titulo}</h3>
              <button type="button" onClick={() => setAbierto(false)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)", flex: "none" }}>Cerrar</button>
            </div>
            {children}
          </aside>
        </>
      )}
    </>
  );
}

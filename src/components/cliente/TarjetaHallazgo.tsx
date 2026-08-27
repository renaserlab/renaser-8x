"use client";
import { useEffect, useState } from "react";
import type { HallazgoHoy } from "@/lib/hoy";

/**
 * Tarjeta de hallazgo del empresario: titular + chip + UNA línea.
 * "Ver más" despliega el expediente AL COSTADO (PC) o desde abajo (celular) — pedido de Kelin:
 * el contenido de la página nunca se empuja; el detalle llega y se va sin mover nada.
 */
export function TarjetaHallazgo({ h }: { h: HallazgoHoy }) {
  const [abierto, setAbierto] = useState(false);
  const linea = h.costo_posible ?? h.causa ?? null;
  const acento = h.preserva ? "var(--confirmado)" : h.impacto === "alto" ? "var(--contradicho)" : "var(--caducado)";
  const chip = h.preserva ? "Fortaleza" : h.impacto === "alto" ? "Crítico" : "Atención";

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
      <article className="panel p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-hero" style={{ fontSize: 18, minWidth: 0 }}>{h.titulo}</h3>
          <span className="t-dato" style={{ flex: "none", fontSize: 12, fontWeight: 700, color: acento, border: `1px solid ${acento}`, borderRadius: "var(--radio)", padding: "2px 10px" }}>{chip}</span>
        </div>
        {linea && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{linea}</p>}
        <button type="button" onClick={() => setAbierto(true)} className="t-dato mt-2" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "var(--marca)", textDecoration: "underline" }}>
          Ver más
        </button>
      </article>

      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar el detalle" onClick={() => setAbierto(false)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label={h.titulo}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <span className="t-dato" style={{ fontSize: 12, fontWeight: 700, color: acento, border: `1px solid ${acento}`, borderRadius: "var(--radio)", padding: "2px 10px" }}>{chip}</span>
              <button type="button" onClick={() => setAbierto(false)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <h3 className="t-hero" style={{ fontSize: 22 }}>{h.titulo}</h3>
            <div className="mt-4 flex flex-col gap-3">
              {h.causa && <p className="t-cuerpo"><span style={{ color: "var(--grafito)" }}>Qué vemos: </span>{h.causa}</p>}
              {h.costo_posible && <p className="t-cuerpo"><span style={{ color: "var(--grafito)" }}>Qué puede estar costando: </span>{h.costo_posible}</p>}
              {h.recomendacion && <p className="t-cuerpo"><span style={{ color: "var(--grafito)" }}>{h.preserva ? "Cómo protegerla: " : "Por dónde tomarlo: "}</span>{h.recomendacion}</p>}
              {h.evidencia.length > 0 && (
                <p className="t-dato" style={{ color: "var(--grafito)" }}>Según {h.evidencia.map((e) => e.fuente).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</p>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

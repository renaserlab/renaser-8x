"use client";
import { useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";

/**
 * ADMINISTRAR EMPRESA (consultor): corregir nombre y sector, y eliminarla con la confirmación
 * seria de las buenas plataformas — escribir el nombre exacto. Nada de borrados por accidente.
 */
export function AdministrarEmpresa({ companyId, nombre, sector }: { companyId: string; nombre: string; sector: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [n, setN] = useState(nombre);
  const [s, setS] = useState(sector ?? "");
  const [confirmacion, setConfirmacion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}`, { method: "PATCH", json: { nombre: n.trim(), sector: s.trim() || null } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}`, { method: "DELETE" });
      window.location.assign("/bandeja");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminarla.");
      setOcupado(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>
        Administrar
      </button>
      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar" onClick={() => setAbierto(false)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="Administrar empresa">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-seccion">Administrar empresa</h3>
              <button type="button" onClick={() => setAbierto(false)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Nombre</span>
                <input className="campo" value={n} onChange={(e) => setN(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Sector o actividad</span>
                <input className="campo" value={s} onChange={(e) => setS(e.target.value)} />
              </label>
              <button type="button" className="boton" disabled={ocupado || n.trim().length < 2} onClick={guardar}>
                {ocupado ? "Guardando" : "Guardar cambios"}
              </button>

              <div style={{ borderTop: "1px solid var(--linea)", paddingTop: 16, marginTop: 8 }}>
                <p className="t-etiqueta mb-1" style={{ color: "var(--contradicho)" }}>Eliminar esta empresa</p>
                <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
                  Se borra TODO: conversaciones, hallazgos, documentos y archivos. No hay vuelta atrás.
                  Para confirmar, escribe el nombre exacto: <strong style={{ color: "var(--tinta)" }}>{nombre}</strong>
                </p>
                <input className="campo" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder="Escribe el nombre exacto" aria-label="Confirmación del nombre" style={{ width: "100%" }} />
                <button
                  type="button"
                  className="boton mt-3"
                  style={{ background: confirmacion === nombre ? "var(--contradicho)" : "var(--suave)", borderColor: confirmacion === nombre ? "var(--contradicho)" : "var(--linea)", color: confirmacion === nombre ? "var(--papel)" : "var(--grafito)", width: "100%" }}
                  disabled={ocupado || confirmacion !== nombre}
                  onClick={eliminar}
                >
                  {ocupado ? "Eliminando" : "Eliminar definitivamente"}
                </button>
              </div>
              {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";

/**
 * La lista de empresas del dueño y un botón por cada una. Al elegir, la ruta protegida comprueba la
 * membresía y fija la cookie; después se recarga el portal entero.
 */
export function ElegirEmpresa({ empresas, activa }: { empresas: { id: string; nombre: string }[]; activa: string | null }) {
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegir = async (id: string) => {
    setError(null);
    setCargando(id);
    try {
      await pedir("/api/cliente/empresa-activa", { json: { company_id: id } });
      // Recarga COMPLETA, igual que al crear empresa: router.refresh() fallaba en silencio en celulares
      // y la cookie recién fijada tiene que llegar al servidor en la siguiente petición.
      window.location.assign(new URL("/portal", window.location.origin).toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cambiar de empresa.");
      setCargando(null);
    }
  };

  if (!empresas.length) return <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>Todavía no tienes ninguna empresa en 8X.</p>;

  return (
    <div className="flex flex-col gap-3 medida">
      {empresas.map((e) => (
        <button
          key={e.id}
          type="button"
          className="fila-eleccion"
          onClick={() => elegir(e.id)}
          disabled={cargando !== null || activa === e.id}
          aria-current={activa === e.id ? "true" : undefined}
        >
          <span className="t-cuerpo fuerte" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{e.nombre}</span>
          <span className="t-dato fuerte" style={{ color: activa === e.id ? "var(--confirmado)" : "var(--acero-fuerte)", whiteSpace: "nowrap" }}>
            {activa === e.id ? "Estás aquí" : cargando === e.id ? "Entrando…" : "Entrar"}
          </span>
        </button>
      ))}
      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>
      )}
    </div>
  );
}

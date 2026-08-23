"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/** Implementación → monitoreo → cierre. Al cerrar se guarda el resultado real en cases. Capítulo 37. */
export function CerrarCaso({ companyId, etapa }: { companyId: string; etapa: string }) {
  const router = useRouter();
  const [resultado, setResultado] = useState("");
  const [abierto, setAbierto] = useState(false);
  if (etapa === "cerrado") return <span className="t-dato" style={{ color: "var(--confirmado)" }}>Caso cerrado</span>;
  if (etapa === "implementacion")
    return (
      <button className="boton boton--secundario" onClick={async () => { await pedir(`/api/companies/${companyId}/close`, { json: { monitoreo: true } }); router.refresh(); }}>
        Pasar a monitoreo
      </button>
    );
  if (etapa !== "monitoreo") return null;
  if (!abierto) return <button className="boton boton--secundario" onClick={() => setAbierto(true)}>Cerrar caso</button>;
  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 320 }}>
      <textarea className="campo" rows={3} placeholder="Resultado real a los 90 días: qué indicador se movió, cuánto, qué se sostuvo." value={resultado} onChange={(e) => setResultado(e.target.value)} />
      <div className="flex gap-2">
        <button className="boton" disabled={!resultado.trim()} onClick={async () => { await pedir(`/api/companies/${companyId}/close`, { json: { cerrar: true, resultado_90d: { texto: resultado } } }); router.push("/casos"); }}>
          Guardar y cerrar
        </button>
        <button className="boton boton--secundario" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

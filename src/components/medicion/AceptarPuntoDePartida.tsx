"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/**
 * EL DUEÑO ACEPTA SU PUNTO DE PARTIDA (O UN CORTE). Queda guardado qué aceptó, en qué versión, cuándo y
 * con qué contenido exacto; después puede verlo e imprimirlo. Se le dice en una frase qué significa y
 * qué no, antes de que pulse.
 */
export function AceptarPuntoDePartida({ companyId, referenciaId, tipo, etiqueta }: { companyId: string; referenciaId: string; tipo: "linea_base" | "corte"; etiqueta: string }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruta, setRuta] = useState<string | null>(null);

  const aceptar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await pedir<{ ruta: string }>(`/api/companies/${companyId}/actas`, { json: { tipo, referencia_id: referenciaId } });
      setRuta(r.ruta);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu aceptación.");
    } finally {
      setTrabajando(false);
    }
  };

  if (ruta)
    return (
      <p className="t-dato" style={{ color: "var(--confirmado)" }}>
        Aceptado. <a href={ruta} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Ver mi acta</a>
      </p>
    );

  return (
    <div>
      <button type="button" className="boton boton--secundario" style={{ minHeight: 40 }} disabled={trabajando} onClick={aceptar}>
        {trabajando ? "Guardando" : etiqueta}
      </button>
      <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>
        Al aceptar queda guardado qué números viste, en qué versión y cuándo. No es un contrato ni una auditoría: es el registro de lo que acordamos tomar como referencia.
      </p>
      {error && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

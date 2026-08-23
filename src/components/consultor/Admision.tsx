"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

type Eval = { admisible: boolean; motivo: string; senales: string[] } | undefined;

export function Admision({ companyId, estado, evaluacion, respuestas }: { companyId: string; estado: string; evaluacion: Eval; respuestas: Record<string, string> | null }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decidir = async (decision: "admitida" | "rechazada") => {
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/admission`, { json: { decision, motivo_rechazo: decision === "rechazada" ? motivo : undefined } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };
  if (estado === "admitida") return null;
  return (
    <section className="panel p-6 mb-8 medida">
      <h2 className="t-seccion">Admisión</h2>
      {respuestas && (
        <dl className="mt-4 flex flex-col gap-3">
          {Object.entries(respuestas)
            .filter(([k]) => k !== "evaluacion")
            .map(([k, v]) => (
              <div key={k}>
                <dt className="t-etiqueta">{k.replace(/_/g, " ")}</dt>
                <dd className="t-cuerpo">{v || "—"}</dd>
              </div>
            ))}
        </dl>
      )}
      {evaluacion && (
        <div className="mt-4 p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
          <p className="t-etiqueta">Recomendación del sistema</p>
          <p className="t-cuerpo mt-1">
            <strong>{evaluacion.admisible ? "Admisible." : "No admisible."}</strong> {evaluacion.motivo}
          </p>
          {evaluacion.senales?.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {evaluacion.senales.map((s, i) => (
                <li key={i} className="t-dato">{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {estado === "rechazada" ? (
        <p className="t-cuerpo mt-4" style={{ color: "var(--contradicho)" }}>Rechazada.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <input className="campo" placeholder="Motivo si se rechaza" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de rechazo" />
          {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}
          <div className="flex gap-3">
            <button className="boton" onClick={() => decidir("admitida")}>Admitir</button>
            <button className="boton boton--peligro" onClick={() => decidir("rechazada")} disabled={!motivo.trim()}>Rechazar</button>
          </div>
        </div>
      )}
    </section>
  );
}

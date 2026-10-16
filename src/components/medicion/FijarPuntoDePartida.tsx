"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaDia } from "@/lib/medicion";

/** Lo mínimo del punto de partida vigente para decidir si hace falta un motivo. */
export type VigenteResumen = { version: number | null | undefined; fecha: string };

/** Mínimo de letras del motivo de una versión nueva: la misma vara que exige la ruta. */
export const MINIMO_MOTIVO = 8;

/**
 * FIJAR —O VOLVER A FIJAR— EL PUNTO DE PARTIDA, DESDE LA PANTALLA DEL CONSULTOR. La primera vez basta con
 * pulsar; si ya hay una versión vigente, volver a fijarlo exige decir por qué (la anterior se conserva y los
 * cortes ya medidos siguen comparándose con ella). El período de lo medido es opcional pero, si va, va entero.
 * Nunca toca valores ni derivados de una medición existente: siempre nace una fila nueva.
 */
export function FijarPuntoDePartida({ companyId, vigente, numerosListos }: { companyId: string; vigente: VigenteResumen | null; numerosListos: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const recongela = vigente != null;
  const motivoListo = !recongela || motivo.trim().length >= MINIMO_MOTIVO;
  const periodoListo = (!desde && !hasta) || (Boolean(desde) && Boolean(hasta) && desde <= hasta);
  const puede = numerosListos >= 5;

  const fijar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await pedir<{ medicion?: { version?: number | null }; aviso?: string }>(`/api/companies/${companyId}/medicion`, {
        json: {
          tipo: "linea_base",
          ...(recongela ? { motivo_version: motivo.trim() } : {}),
          ...(desde && hasta ? { periodo_desde: desde, periodo_hasta: hasta } : {}),
        },
      });
      setHecho(`Punto de partida fijado (versión ${r.medicion?.version ?? 1}).${r.aviso ? ` ${r.aviso}` : ""}`);
      setMotivo("");
      setDesde("");
      setHasta("");
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fijar el punto de partida.");
    } finally {
      setTrabajando(false);
    }
  };

  if (!puede)
    return (
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
        Con {numerosListos} de 9 números no se puede fijar el punto de partida: hacen falta al menos 5.
      </p>
    );

  return (
    <div className="mt-2">
      <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 13.5 }} disabled={trabajando} onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cancelar" : recongela ? "Volver a fijar el punto de partida (versión nueva)" : "Fijar el punto de partida"}
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 mt-3" style={{ maxWidth: 520 }}>
          {recongela && (
            <>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                Hoy rige la versión {vigente.version ?? 1}, del {fechaDia(vigente.fecha)}. Se conserva: nace la versión {(vigente.version ?? 1) + 1} y los cortes ya medidos
                siguen comparándose con la suya. Di por qué (al menos {MINIMO_MOTIVO} letras).
              </p>
              <textarea
                className="campo"
                aria-label="Motivo de la nueva versión"
                placeholder="Por qué nace otra versión (p. ej. costos completos tras conciliar con el banco)"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </>
          )}
          <div className="flex gap-2 flex-wrap">
            <label className="t-dato" style={{ color: "var(--grafito)" }}>
              Período medido, desde
              <input className="campo" type="date" aria-label="Período desde" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ display: "block" }} />
            </label>
            <label className="t-dato" style={{ color: "var(--grafito)" }}>
              hasta
              <input className="campo" type="date" aria-label="Período hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ display: "block" }} />
            </label>
          </div>
          {!periodoListo && <p className="t-dato" style={{ color: "var(--contradicho)" }}>El período va con sus dos fechas y en orden, o no va.</p>}
          <button type="button" className="boton" style={{ minHeight: 40, alignSelf: "flex-start" }} disabled={trabajando || !motivoListo || !periodoListo} onClick={fijar}>
            {trabajando ? "Congelando" : recongela ? `Fijar la versión ${(vigente.version ?? 1) + 1}` : "Fijar ahora"}
          </button>
        </div>
      )}
      {hecho && <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }}>{hecho}</p>}
      {error && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

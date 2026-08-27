"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";
import type { Accion } from "./Entregable";

export type Corte = { id: string; numero: number; fecha: string; que_se_hizo: string | null; que_se_trabo: string | null; indicadores: unknown; regresiones: unknown };

const ESTADOS = [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["hecho", "Hecho"], ["descartado", "Descartado"]];

/** El plan vive en línea: cada frente con responsable, indicador, semana de cierre y estado. Máx. 3 abiertos por semana. Capítulo 37. */
export function Plan({ companyId, acciones, cortes, modo }: { companyId: string; acciones: Accion[]; cortes: Corte[]; modo: "consultor" | "cliente" }) {
  const router = useRouter();
  const [corte, setCorte] = useState({ que_se_hizo: "", que_se_trabo: "", indicadores: "" });
  const [error, setError] = useState<string | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const semanas = [1, 2, 3, 4, 5, 6, 7];

  const cambiar = async (a: Accion, cambios: Record<string, unknown>) => {
    setError(null);
    try {
      await pedir(`/api/actions/${a.id}`, { method: "PATCH", json: cambios });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };
  const registrarCorte = async () => {
    await pedir(`/api/companies/${companyId}/close`, { json: { corte: { ...corte, indicadores: corte.indicadores ? { texto: corte.indicadores } : null } } });
    setCorte({ que_se_hizo: "", que_se_trabo: "", indicadores: "" });
    router.refresh();
  };

  const abiertosPorSemana = semanas.map((w) => acciones.filter((a) => a.estado !== "hecho" && a.estado !== "descartado" && (a.semana_inicio ?? 0) <= w && (a.semana_cierre ?? 0) >= w).length);
  const trabados = acciones.filter((a) => a.estado !== "hecho" && a.estado !== "descartado" && a.vence_at && a.vence_at < hoy);

  return (
    <div className="flex flex-col gap-8">
      {modo === "consultor" && trabados.length > 0 && (
        <div className="panel p-4" style={{ borderColor: "var(--contradicho)" }}>
          <p className="t-dato" style={{ color: "var(--contradicho)" }}>{trabados.length} frente(s) vencido(s) sin cerrar. Lo que se traba dos semanas seguidas escala al consultor.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {semanas.map((w, i) => (
          <div key={w} className="panel p-3" style={{ minWidth: 96, borderColor: abiertosPorSemana[i] > 3 ? "var(--contradicho)" : "var(--linea)" }}>
            <div className="t-etiqueta">Semana {w}</div>
            <div className="t-dato">{abiertosPorSemana[i]} abiertos</div>
          </div>
        ))}
      </div>

      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}

      <div className="flex flex-col gap-4">
        {acciones.map((a) => {
          const vencido = a.vence_at && a.vence_at < hoy && a.estado !== "hecho" && a.estado !== "descartado";
          return (
            <article key={a.id} className="panel p-4 grid gap-3 md:grid-cols-[80px_1fr_220px]" style={vencido ? { borderColor: "var(--contradicho)" } : a.estado === "hecho" ? { borderColor: "var(--confirmado)" } : undefined}>
              <div>
                <div className="t-etiqueta">Semana</div>
                <div className="t-seccion">{a.semana_inicio}–{a.semana_cierre}</div>
              </div>
              <div>
                <p className="t-cuerpo">{a.accion}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                  {a.responsable} · indicador: {a.kpi}{a.evidencia ? ` · prueba: ${a.evidencia}` : ""}
                </p>
                {modo === "consultor" && a.findings?.titulo && <p className="t-dato" style={{ color: "var(--grafito)" }}>Hallazgo: {a.findings.titulo}</p>}
                <textarea className="campo mt-2" rows={1} placeholder={modo === "cliente" ? "Cómo va (opcional)" : "Nota"} defaultValue={a.nota ?? ""} onBlur={(e) => e.target.value !== (a.nota ?? "") && cambiar(a, { nota: e.target.value })} aria-label="Nota" />
              </div>
              <div className="flex flex-col gap-2">
                <select className="campo" value={a.estado} onChange={(e) => cambiar(a, { estado: e.target.value })} aria-label="Estado">
                  {ESTADOS.map(([v, n]) => (
                    <option key={v} value={v}>{n}</option>
                  ))}
                </select>
                <span className="t-dato" style={{ color: vencido ? "var(--contradicho)" : "var(--grafito)" }}>vence {fechaCorta(a.vence_at)}</span>
              </div>
            </article>
          );
        })}
      </div>

      <section>
        <h2 className="t-seccion mb-3">Cortes quincenales</h2>
        {cortes.length === 0 ? <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Ningún corte registrado.</p> : (
          <ul className="flex flex-col gap-3 mb-4">
            {cortes.map((c) => (
              <li key={c.id} className="panel p-4">
                <div className="t-etiqueta">Corte {c.numero} · {fechaCorta(c.fecha)}</div>
                {c.que_se_hizo && <p className="t-cuerpo mt-1"><strong>Se hizo:</strong> {c.que_se_hizo}</p>}
                {c.que_se_trabo && <p className="t-cuerpo"><strong>Se trabó:</strong> {c.que_se_trabo}</p>}
                {c.indicadores ? <p className="t-dato" style={{ color: "var(--grafito)" }}>Indicadores: {(c.indicadores as { texto?: string }).texto ?? JSON.stringify(c.indicadores)}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {modo === "consultor" && (
          <div className="panel p-4 flex flex-col gap-3">
            <input className="campo" placeholder="Qué se hizo" aria-label="Qué se hizo" value={corte.que_se_hizo} onChange={(e) => setCorte({ ...corte, que_se_hizo: e.target.value })} />
            <input className="campo" placeholder="Qué se trabó" aria-label="Qué se trabó" value={corte.que_se_trabo} onChange={(e) => setCorte({ ...corte, que_se_trabo: e.target.value })} />
            <input className="campo" placeholder="Qué indicador se movió (y cuánto)" aria-label="Qué indicador se movió (y cuánto)" value={corte.indicadores} onChange={(e) => setCorte({ ...corte, indicadores: e.target.value })} />
            <button className="boton boton--secundario" onClick={registrarCorte} disabled={!corte.que_se_hizo && !corte.que_se_trabo}>Registrar corte</button>
          </div>
        )}
      </section>
    </div>
  );
}

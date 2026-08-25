"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { PILAR, VEREDICTO } from "@/lib/textos";
import type { Fila } from "@/components/realidad/MatrizRealidad";

/** El consultor crea un hallazgo a mano. Sin evidencia no se guarda. */
export function NuevoHallazgo({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [claims, setClaims] = useState<Fila[]>([]);
  const [f, setF] = useState({ pilar: "personas", titulo: "", causa_raiz: "", impacto: "medio", veredicto: "", recomendacion: "" });
  const [sel, setSel] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) pedir<{ filas: Fila[] }>(`/api/companies/${companyId}/reality?limit=500`).then((r) => setClaims(r.filas));
  }, [abierto, companyId]);

  if (!abierto) return <button className="boton boton--secundario" onClick={() => setAbierto(true)}>Agregar hallazgo a mano</button>;

  const guardar = async () => {
    setError(null);
    try {
      await pedir("/api/findings", { json: { company_id: companyId, ...f, veredicto: f.veredicto || null, claim_ids: sel } });
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    }
  };
  const visibles = claims.filter((c) => !busca || c.texto.toLowerCase().includes(busca.toLowerCase())).slice(0, 40);

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <h3 className="t-seccion">Nuevo hallazgo</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="campo" value={f.pilar} onChange={(e) => setF({ ...f, pilar: e.target.value })} aria-label="Pilar">
          {Object.entries(PILAR).map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
        <select className="campo" value={f.impacto} onChange={(e) => setF({ ...f, impacto: e.target.value })} aria-label="Impacto">
          <option value="alto">alto</option><option value="medio">medio</option><option value="bajo">bajo</option>
        </select>
        <select className="campo" value={f.veredicto} onChange={(e) => setF({ ...f, veredicto: e.target.value })} aria-label="Veredicto">
          <option value="">veredicto —</option>
          {Object.entries(VEREDICTO).map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
      </div>
      <label className="flex flex-col gap-1">
        <span className="t-dato" style={{ color: "var(--grafito)" }}>El problema, como se lo dirías al dueño</span>
        <input className="campo" placeholder="Ej.: Nadie vuelve a buscar a los interesados que no compraron" aria-label="Título" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-dato" style={{ color: "var(--grafito)" }}>La causa de fondo — qué falta o falla (no el síntoma)</span>
        <textarea className="campo" rows={2} placeholder="Ej.: No existe registro de interesados ni un responsable de hacer seguimiento" aria-label="Causa raíz" value={f.causa_raiz} onChange={(e) => setF({ ...f, causa_raiz: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-dato" style={{ color: "var(--grafito)" }}>Qué construir o corregir</span>
        <textarea className="campo" rows={2} placeholder="Ej.: Registro simple de interesados (cuaderno o Excel) con responsable y revisión semanal" aria-label="Recomendación" value={f.recomendacion} onChange={(e) => setF({ ...f, recomendacion: e.target.value })} />
      </label>
      <div>
        <p className="t-etiqueta mb-2">Evidencia ({sel.length} elegidas)</p>
        <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>
          La evidencia son afirmaciones que la empresa ya dio. ¿Tu evidencia es un documento, PDF o foto?{" "}
          <a href={`/empresa/${companyId}/fuentes`} style={{ textDecoration: "underline", color: "var(--marca)" }}>Súbelo primero en Fuentes</a>: sus afirmaciones se extraen solas y aparecen aquí para elegirlas.
        </p>
        <input className="campo mb-2" placeholder="Buscar entre lo que la empresa dijo o mostró" aria-label="Buscar definición" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="flex flex-col gap-1" style={{ maxHeight: 260, overflow: "auto" }}>
          {visibles.map((c) => (
            <li key={c.id}>
              <label className="flex gap-2 items-start t-dato" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} style={{ marginTop: 4 }} />
                <span>{c.texto} <span style={{ color: "var(--grafito)" }}>— {c.fuente}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}
      <div className="flex gap-3">
        <button className="boton" onClick={guardar} disabled={!f.titulo.trim() || !sel.length}>Guardar hallazgo</button>
        <button className="boton boton--secundario" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

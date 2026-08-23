"use client";
import { useCallback, useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";
import { MarcaEstado, LeyendaEstados } from "@/components/base/MarcaEstado";
import { VerFuente } from "./VerFuente";
import { PILAR, fechaCorta } from "@/lib/textos";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Fila = {
  id: string;
  texto: string;
  tipo: string | null;
  temporalidad: string | null;
  fecha: string | null;
  fuente: string;
  source_id: string;
  fragment_id: string | null;
  columna: "documentos" | "dueno" | "equipo";
  prioridad_validacion: boolean;
  pilar?: string;
  estado?: string;
  contradice_a?: string | null;
  explicacion?: string | null;
  pregunta?: string | null;
};

const ESTADOS = ["sin_verificar", "confirmado", "caducado", "contradicho"];
const COLUMNA: Record<string, string> = { documentos: "Lo que dicen tus documentos", dueno: "Lo que tú nos dijiste", equipo: "Lo que tu equipo nos dijo" };

/** La Matriz de Realidad. Tema · La empresa dice · Evidencia · Estado. Nada más en esta pantalla. Capítulo 14. */
export function MatrizRealidad({ companyId, modo, filtroInicial }: { companyId: string; modo: "consultor" | "espejo"; filtroInicial?: { pilar?: string; estado?: string } }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [pilar, setPilar] = useState(filtroInicial?.pilar ?? "");
  const [estado, setEstado] = useState(filtroInicial?.estado ?? "");
  const [abierta, setAbierta] = useState<{ s: string; f: string | null } | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const q = new URLSearchParams();
    if (pilar) q.set("pilar", pilar);
    if (estado) q.set("estado", estado);
    q.set("limit", "500");
    const r = await pedir<{ filas: Fila[] }>(`/api/companies/${companyId}/reality?${q}`);
    setFilas(r.filas);
    setCargando(false);
  }, [companyId, pilar, estado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Las afirmaciones aparecen conforme llegan (Realtime).
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`claims-${companyId}`).on("postgres_changes", { event: "*", schema: "public", table: "claims", filter: `company_id=eq.${companyId}` }, () => cargar()).subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [companyId, cargar]);

  const cambiarEstado = async (id: string, nuevo: string) => {
    await pedir(`/api/claims/${id}/validate`, { json: { estado: nuevo } });
    cargar();
  };

  if (modo === "espejo") {
    const cols: Fila["columna"][] = ["documentos", "dueno", "equipo"];
    const porTipo = new Map<string, Fila[]>();
    for (const f of filas) {
      const k = f.tipo ?? "otro";
      porTipo.set(k, [...(porTipo.get(k) ?? []), f]);
    }
    // Primero lo confirmado (baja la guardia), después las brechas, ordenadas por prioridad.
    const orden = [...porTipo.entries()].sort((a, b) => {
      const brecha = (l: Fila[]) => l.filter((x) => x.estado === "contradicho" || x.estado === "caducado").length;
      return brecha(a[1]) - brecha(b[1]);
    });
    return (
      <div className="flex flex-col gap-6">
        <LeyendaEstados />
        <div className="overflow-x-auto">
          <table className="tabla" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Tema</th>
                {cols.map((c) => (
                  <th key={c}>{COLUMNA[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orden.map(([tipo, lista]) => (
                <tr key={tipo}>
                  <td className="t-dato" style={{ textTransform: "capitalize" }}>{tipo}</td>
                  {cols.map((c) => (
                    <td key={c}>
                      <ul className="flex flex-col gap-3">
                        {lista
                          .filter((f) => f.columna === c)
                          .map((f) => (
                            <li key={f.id}>
                              <button className="text-left" onClick={() => setAbierta({ s: f.source_id, f: f.fragment_id })} style={{ font: "inherit" }}>
                                <span className="t-cuerpo">“{f.texto}”</span>
                              </button>
                              <div className="flex flex-wrap gap-3 mt-1 items-center">
                                <MarcaEstado estado={f.estado ?? "sin_verificar"} />
                                <span className="t-dato" style={{ color: "var(--grafito)" }}>{f.fuente} · {fechaCorta(f.fecha)}</span>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {abierta && <VerFuente sourceId={abierta.s} fragmentId={abierta.f} cerrar={() => setAbierta(null)} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select className="campo" style={{ width: "auto" }} value={pilar} onChange={(e) => setPilar(e.target.value)} aria-label="Filtrar por pilar">
          <option value="">Todos los pilares</option>
          {Object.entries(PILAR).map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
        <select className="campo" style={{ width: "auto" }} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e.replace("_", " ")}</option>
          ))}
        </select>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{filas.length} definiciones</span>
        <div className="ml-auto"><LeyendaEstados /></div>
      </div>

      {cargando ? (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Cargando</p>
      ) : filas.length === 0 ? (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Nada con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th>Tema</th>
                <th>La empresa dice</th>
                <th>Evidencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="aparece">
                  <td>
                    <div className="t-dato" style={{ textTransform: "capitalize" }}>{f.tipo ?? "otro"}</div>
                    <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{PILAR[f.pilar ?? ""] ?? ""} · {f.temporalidad}</div>
                  </td>
                  <td>
                    <span className="t-cuerpo">{f.texto}</span>
                    {f.explicacion && <div className="t-dato mt-1" style={{ color: "var(--contradicho)" }}>{f.explicacion}</div>}
                    {f.pregunta && <div className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Pregunta: {f.pregunta}</div>}
                  </td>
                  <td>
                    <button className="text-left underline t-dato" onClick={() => setAbierta({ s: f.source_id, f: f.fragment_id })} style={{ font: "inherit" }}>
                      {f.fuente}
                    </button>
                    <div className="t-dato" style={{ color: f.fecha ? "var(--grafito)" : "var(--caducado)" }}>{fechaCorta(f.fecha)}{f.prioridad_validacion ? " · validar" : ""}</div>
                  </td>
                  <td>
                    <MarcaEstado estado={f.estado ?? "sin_verificar"} />
                    <select className="campo mt-2" style={{ minHeight: 36, padding: "4px 8px", fontSize: 14 }} value={f.estado} onChange={(e) => cambiarEstado(f.id, e.target.value)} aria-label="Cambiar estado">
                      {ESTADOS.map((e) => (
                        <option key={e} value={e}>{e.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierta && <VerFuente sourceId={abierta.s} fragmentId={abierta.f} cerrar={() => setAbierta(null)} />}
    </div>
  );
}

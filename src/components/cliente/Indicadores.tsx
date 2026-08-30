"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { nombreDePeriodo } from "@/lib/temporadas";

export type Indicador = {
  id: string;
  clave: string;
  nombre: string;
  como_se_mide: string;
  unidad: string;
  mejor_si: "sube" | "baja" | "neutro";
  meta_valor: number | null;
  meta_texto: string | null;
  frecuencia: string;
  origen_texto: string | null;
  estado: "propuesto" | "activo" | "archivado";
};

export type ValorIndicador = { clave: string; periodo: string; valor: number };

const FRECUENCIA: Record<string, string> = { diaria: "cada día", semanal: "cada semana", mensual: "cada mes" };

function comoTexto(unidad: string, n: number): string {
  if (unidad === "soles") return `S/${Math.round(n).toLocaleString("es-PE")}`;
  if (unidad === "de_cada_10") return `${n} de cada 10`;
  if (unidad === "porcentaje") return `${n}%`;
  if (unidad === "dias") return `${n} días`;
  return String(n);
}

/**
 * LO QUE SE REPITE SE MIDE. En el catálogo estaba escrito que "las incidencias son la mina de KPIs"
 * y no había una sola línea que las extrajera: lo que salía mal seguido se quedaba en un párrafo.
 *
 * Nacen PROPUESTOS y el dueño decide cuáles adopta. Un número que él no eligió no lo va a contar, y
 * un indicador que nadie cuenta es peor que ninguno: aparenta control sin darlo.
 */
export function Indicadores({
  companyId,
  indicadores,
  valores,
  periodoActual,
}: {
  companyId: string;
  indicadores: Indicador[];
  valores: ValorIndicador[];
  periodoActual: string;
}) {
  const [anotando, setAnotando] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propuestos = indicadores.filter((i) => i.estado === "propuesto");
  const activos = indicadores.filter((i) => i.estado === "activo");

  const cambiar = async (id: string, cuerpo: Record<string, unknown>) => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/indicadores`, { method: "PATCH", json: { indicador_id: id, ...cuerpo } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo.");
      setTrabajando(false);
    }
  };

  const pedirPropuesta = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/indicadores`, { method: "POST", json: {} });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos pedirlo.");
      setTrabajando(false);
    }
  };

  const serieDe = (clave: string) =>
    valores.filter((v) => v.clave === clave).sort((a, b) => b.periodo.localeCompare(a.periodo)).slice(0, 4);

  if (indicadores.length === 0)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Los números que hay que vigilar</h2>
        <p className="t-cuerpo medida mb-4">
          Lo que sale mal una y otra vez es lo que hay que medir. Cuando nos cuentes qué se repite en tu día a día,
          sacamos de ahí los pocos números que avisan si el problema vuelve.
        </p>
        {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={pedirPropuesta}>
          {trabajando ? "Buscando" : "Sacar los números de lo que ya contamos"}
        </button>
      </section>
    );

  return (
    <section className="flex flex-col gap-6">
      {propuestos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Números que te proponemos vigilar</h2>
          <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
            Salen de lo que tú mismo contaste que sale mal. Quédate solo con los que de verdad vayas a contar:
            un número que nadie cuenta es peor que ninguno.
          </p>
          <ul className="flex flex-col gap-3">
            {propuestos.map((i) => (
              <li key={i.id} className="panel p-4">
                <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                {i.origen_texto && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Sale de: {i.origen_texto}</p>}
                <p className="t-dato mt-2">Cómo se mide: {i.como_se_mide}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                  Se anota {FRECUENCIA[i.frecuencia] ?? i.frecuencia}
                  {i.meta_texto ? ` · Meta: ${i.meta_texto}` : i.meta_valor != null ? ` · Meta: ${comoTexto(i.unidad, i.meta_valor)}` : ""}
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando} onClick={() => cambiar(i.id, { estado: "activo" })}>
                    Vigilar este
                  </button>
                  <button
                    type="button" className="t-dato" disabled={trabajando}
                    style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }}
                    onClick={() => cambiar(i.id, { estado: "archivado" })}
                  >
                    Este no me sirve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Los que estás vigilando</h2>
          <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
            Anota cada uno cuando toque. Entran en tus cortes junto a los nueve números, y ahí se ve si mejoraron.
          </p>
          <ul className="flex flex-col gap-3">
            {activos.map((i) => {
              const serie = serieDe(i.clave);
              const ultimo = serie[0];
              const anterior = serie[1];
              const delta = ultimo && anterior ? ultimo.valor - anterior.valor : null;
              const mejoro = delta == null || delta === 0 || i.mejor_si === "neutro" ? null : i.mejor_si === "sube" ? delta > 0 : delta < 0;
              return (
                <li key={i.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div style={{ minWidth: 0 }}>
                      <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{i.como_se_mide}</p>
                    </div>
                    {ultimo && (
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <p style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: mejoro === true ? "var(--confirmado)" : mejoro === false ? "var(--contradicho)" : "var(--tinta)", lineHeight: 1.1 }}>
                          {comoTexto(i.unidad, ultimo.valor)}
                        </p>
                        <p className="t-dato" style={{ color: "var(--grafito)" }}>{nombreDePeriodo(ultimo.periodo)}</p>
                      </div>
                    )}
                  </div>

                  {serie.length > 1 && (
                    <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                      Antes: {serie.slice(1).map((v) => `${nombreDePeriodo(v.periodo)} ${comoTexto(i.unidad, v.valor)}`).join(" · ")}
                    </p>
                  )}
                  {(i.meta_texto || i.meta_valor != null) && (
                    <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                      Meta: {i.meta_texto ?? comoTexto(i.unidad, i.meta_valor!)}
                    </p>
                  )}

                  {anotando === i.id ? (
                    <div className="flex gap-2 mt-3 flex-wrap items-center">
                      <input
                        className="campo" style={{ maxWidth: 160 }} inputMode="decimal" autoFocus
                        placeholder={`¿Cuánto en ${nombreDePeriodo(periodoActual)}?`}
                        value={monto} onChange={(e) => setMonto(e.target.value)}
                        aria-label={`Valor de ${i.nombre}`}
                      />
                      <button
                        type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando || !monto.trim()}
                        onClick={() => {
                          const n = parseFloat(monto.replace(/,/g, ""));
                          if (!Number.isFinite(n)) { setError("Escribe solo el número."); return; }
                          cambiar(i.id, { valor: n, periodo: periodoActual });
                        }}
                      >
                        Guardar
                      </button>
                      <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => setAnotando(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button" className="boton boton--secundario mt-3" style={{ minHeight: 34, fontSize: 13 }}
                      onClick={() => { setAnotando(i.id); setMonto(""); setError(null); }}
                    >
                      Anotar el de {nombreDePeriodo(periodoActual)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {propuestos.length === 0 && (
        <div>
          <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 14 }} disabled={trabajando} onClick={pedirPropuesta}>
            {trabajando ? "Buscando" : "Buscar más números en lo que contamos"}
          </button>
        </div>
      )}
    </section>
  );
}

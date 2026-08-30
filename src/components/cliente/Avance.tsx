"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { nombreMedicion, type Medicion, type Movimiento, type Veredicto } from "@/lib/medicion";
import { fechaCorta } from "@/lib/textos";

/**
 * ¿FUNCIONÓ LO QUE HICIMOS? La pregunta que hasta hoy era incontestable: el diagnóstico era una foto
 * única y los cortes guardaban texto libre. Aquí el dueño fija su punto de partida y, cada cierto
 * tiempo, registra un corte que se compara solo contra él.
 */
export function Avance({
  companyId,
  base,
  ultimoCorte,
  movimientos,
  veredicto: v,
  cortes,
  numerosListos,
}: {
  companyId: string;
  base: Medicion | null;
  ultimoCorte: Medicion | null;
  movimientos: Movimiento[];
  veredicto: Veredicto;
  cortes: Medicion[];
  numerosListos: number;
}) {
  const [trabajando, setTrabajando] = useState<null | "linea_base" | "corte">(null);
  const [error, setError] = useState<string | null>(null);

  const congelar = async (tipo: "linea_base" | "corte") => {
    setTrabajando(tipo);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/medicion`, { method: "POST", json: { tipo } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la medición.");
      setTrabajando(null);
    }
  };

  // SIN PUNTO DE PARTIDA: no se puede medir nada todavía, y se dice por qué.
  if (!base)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Tu punto de partida</h2>
        <p className="t-cuerpo medida mb-4">
          Para poder decirte más adelante si el negocio mejoró, primero hay que dejar guardado cómo está hoy.
          Es una foto de tus números con la fecha de hoy: el «antes» contra el que vamos a comparar todo.
        </p>
        {numerosListos < 5 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
            Todavía no. Con {numerosListos} de 9 números la foto saldría en blanco. Completa al menos 5 y vuelve aquí.
          </p>
        ) : (
          <>
            {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            <button type="button" className="boton" disabled={trabajando !== null} onClick={() => congelar("linea_base")}>
              {trabajando === "linea_base" ? "Guardando" : "Fijar mi punto de partida"}
            </button>
          </>
        )}
      </section>
    );

  // CON PUNTO DE PARTIDA PERO SIN CORTE: se explica qué sigue.
  if (!ultimoCorte)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Tu punto de partida</h2>
        <p className="t-cuerpo medida mb-2">
          Quedó fijado el <strong>{fechaCorta(base.fecha)}</strong> con {Object.keys(base.valores).length} números.
          A partir de aquí, todo lo que hagamos se mide contra esa foto.
        </p>
        <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
          Cuando pase un mes, actualiza tus números arriba y registra un corte: ahí vas a ver, en soles, qué se movió.
        </p>
        {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <button type="button" className="boton boton--secundario" disabled={trabajando !== null} onClick={() => congelar("corte")}>
          {trabajando === "corte" ? "Guardando" : "Registrar un corte ahora"}
        </button>
      </section>
    );

  // CON COMPARACIÓN: el titular primero, el detalle después.
  return (
    <section className="flex flex-col gap-5">
      <div className="panel p-5">
        <p className="t-etiqueta">Tu avance</p>
        <p className="t-hero mt-2" style={{ fontSize: "clamp(19px, 3.2vw, 26px)", maxWidth: "26ch" }}>{v.titular}</p>
        <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
          {nombreMedicion(ultimoCorte)} del {fechaCorta(ultimoCorte.fecha)} contra tu punto de partida del {fechaCorta(base.fecha)}
          {v.dias != null && v.dias > 0 && ` · ${v.dias} días`}
        </p>
        <div className="flex gap-5 mt-4 flex-wrap">
          {[
            { n: v.mejoraron, t: "mejoraron", c: "var(--confirmado)" },
            { n: v.empeoraron, t: "empeoraron", c: "var(--contradicho)" },
            { n: v.sinCambio, t: "sin cambio", c: "var(--grafito)" },
          ].map((x) => (
            <div key={x.t}>
              <p style={{ fontSize: 22, fontWeight: 700, color: x.c, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{x.n}</p>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>{x.t}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="t-seccion mb-1">Qué se movió</h2>
        <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>Primero lo que necesita atención.</p>
        <ul className="lista-editorial">
          {movimientos.map((m) => (
            <li key={m.vital.clave} style={{ padding: "11px 0" }}>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none", width: 8, height: 8, borderRadius: 4,
                    background: m.mejoro === true ? "var(--confirmado)" : m.mejoro === false ? "var(--contradicho)" : "var(--linea)",
                  }}
                />
                <span className="t-cuerpo" style={{ fontWeight: 550 }}>{m.vital.nombre}</span>
              </div>
              <p className="t-dato mt-1" style={{ color: "var(--grafito)", paddingLeft: 20 }}>{m.frase}</p>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <div>
        <button type="button" className="boton boton--secundario" disabled={trabajando !== null} onClick={() => congelar("corte")}>
          {trabajando === "corte" ? "Guardando" : "Registrar un corte nuevo"}
        </button>
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          Actualiza primero tus números arriba: el corte guarda lo que haya en ese momento.
        </p>
      </div>

      {cortes.length > 1 && (
        <details>
          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Cortes anteriores ({cortes.length - 1})</summary>
          <ul className="lista-editorial mt-2">
            {cortes.slice(1).map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3" style={{ padding: "7px 0" }}>
                <span className="t-dato">{nombreMedicion(c)}</span>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>{fechaCorta(c.fecha)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

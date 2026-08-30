"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { VITALES, type Radiografia, type Vital } from "@/lib/metricas";
import { MESES, ultimosMeses, nombreDePeriodo } from "@/lib/temporadas";

type Serie = { periodo: string; valor: number }[];

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/** Acepta "8 mil", "8,500", "S/ 8500". El dueño escribe como habla. */
function aNumero(t: string): number | null {
  const limpio = t.trim().toLowerCase().replace(/s\/|soles|\s/g, "");
  if (!limpio) return null;
  const mil = /^([0-9]+(?:[.,][0-9]+)?)mil$/.exec(limpio);
  if (mil) return Math.round(parseFloat(mil[1]!.replace(",", ".")) * 1000);
  const n = parseFloat(limpio.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function MisNumeros({
  radiografia,
  serieVenta,
  temporadasAltas,
  mesesDisponibles,
}: {
  radiografia: Radiografia;
  serieVenta: Serie;
  temporadasAltas: string[];
  mesesDisponibles: { periodo: string; etiqueta: string }[];
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [sinDato, setSinDato] = useState<Set<string>>(new Set());
  const [meses, setMeses] = useState<Record<string, string>>({});
  const [mejor, setMejor] = useState({ periodo: "", monto: "" });
  const [peor, setPeor] = useState({ periodo: "", monto: "" });
  const [altas, setAltas] = useState<Set<string>>(new Set(temporadasAltas));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mesPasado = mesesDisponibles[0];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const vitales: Record<string, number | null> = {};
      for (const [clave, texto] of Object.entries(valores)) {
        const n = aNumero(texto);
        if (n != null) vitales[clave] = n;
      }
      const filasMes: { periodo: string; venta: number | null }[] = [];
      for (const [periodo, texto] of Object.entries(meses)) {
        const n = aNumero(texto);
        if (n != null) filasMes.push({ periodo, venta: n });
      }
      for (const p of [mejor, peor]) {
        const n = aNumero(p.monto);
        if (p.periodo && n != null && !filasMes.some((f) => f.periodo === p.periodo)) filasMes.push({ periodo: p.periodo, venta: n });
      }
      await pedir("/api/portal/numeros", {
        method: "POST",
        json: {
          vitales,
          meses: filasMes,
          sin_dato: [...sinDato],
          temporadas: { altas: [...altas], bajas: [] },
        },
      });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  };

  const campoVital = (v: Vital) => (
    <div key={v.clave} className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
      <p className="t-cuerpo" style={{ fontWeight: 550 }}>{v.pregunta}</p>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <input
          className="campo"
          style={{ maxWidth: 200 }}
          inputMode="decimal"
          placeholder={v.unidad === "de_cada_10" ? "p. ej. 3" : "p. ej. 8 mil"}
          value={valores[v.clave] ?? ""}
          disabled={sinDato.has(v.clave)}
          onChange={(e) => setValores((x) => ({ ...x, [v.clave]: e.target.value }))}
          aria-label={v.nombre}
        />
        <button
          type="button"
          className="t-dato"
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: sinDato.has(v.clave) ? "var(--marca)" : "var(--grafito)" }}
          onClick={() =>
            setSinDato((s) => {
              const n = new Set(s);
              if (n.has(v.clave)) n.delete(v.clave);
              else { n.add(v.clave); setValores((x) => ({ ...x, [v.clave]: "" })); }
              return n;
            })
          }
        >
          {sinDato.has(v.clave) ? "Marcado: no lo sé" : "No lo sé"}
        </button>
      </div>
    </div>
  );

  const puestos = VITALES.filter((v) => !radiografia.faltan.some((f) => f.clave === v.clave));

  return (
    <div className="flex flex-col gap-8">
      {/* DÓNDE VA: una sola cifra, sin adornos. */}
      <section className="panel p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="t-etiqueta">La radiografía de tu negocio</p>
            <p style={{ fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {radiografia.listos} <span style={{ color: "var(--grafito)", fontWeight: 500 }}>de {radiografia.total}</span>
            </p>
          </div>
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)", flex: "1 1 260px" }}>
            {radiografia.completa
              ? "Están los nueve. Con esto se calcula tu margen real, tu punto de equilibrio y cuánto aguantas si mañana no entra nada."
              : `Con estos nueve números se calcula tu margen real y tu punto de equilibrio. Sin ellos, cualquier diagnóstico es opinión. Te faltan ${radiografia.faltan.length}.`}
          </p>
        </div>
        <div className="flex gap-1 mt-4" aria-hidden="true">
          {VITALES.map((v) => (
            <span
              key={v.clave}
              style={{
                flex: 1, height: 6, borderRadius: 3,
                background: radiografia.faltan.some((f) => f.clave === v.clave) ? "var(--linea)" : "var(--confirmado)",
              }}
            />
          ))}
        </div>
      </section>

      {radiografia.faltan.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Lo que falta</h2>
          <p className="t-dato mb-1" style={{ color: "var(--grafito)" }}>
            Contesta de memoria, como si te lo preguntaran hablando. No busques papeles: si no lo sabes, dilo — eso también nos dice algo.
          </p>
          {radiografia.faltan.map(campoVital)}
        </section>
      )}

      {/* TU AÑO EN TRES PREGUNTAS: la serie mensual que hoy no existe en ninguna empresa. */}
      <section>
        <h2 className="t-seccion mb-1">Tu año en tres preguntas</h2>
        <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
          Con tres meses ya se ve tu curva: si vienes subiendo o bajando, y cuánto pesa la temporada. No hace falta el año entero.
        </p>

        {mesPasado && (
          <div className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
            <p className="t-cuerpo" style={{ fontWeight: 550 }}>¿Cuánto vendiste en {mesPasado.etiqueta}?</p>
            <input
              className="campo mt-2" style={{ maxWidth: 200 }} inputMode="decimal" placeholder="p. ej. 40 mil"
              value={meses[mesPasado.periodo] ?? ""}
              onChange={(e) => setMeses((x) => ({ ...x, [mesPasado.periodo]: e.target.value }))}
              aria-label={`Ventas de ${mesPasado.etiqueta}`}
            />
          </div>
        )}

        {[
          { t: "De los últimos 12 meses, ¿cuál fue tu MEJOR mes y cuánto vendiste?", v: mejor, set: setMejor, id: "mejor" },
          { t: "¿Y cuál fue el PEOR?", v: peor, set: setPeor, id: "peor" },
        ].map((f) => (
          <div key={f.id} className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
            <p className="t-cuerpo" style={{ fontWeight: 550 }}>{f.t}</p>
            <div className="flex gap-2 flex-wrap mt-2">
              <select
                className="campo" style={{ maxWidth: 200 }} value={f.v.periodo}
                onChange={(e) => f.set({ ...f.v, periodo: e.target.value })}
                aria-label={`Mes ${f.id}`}
              >
                <option value="">Elige el mes</option>
                {mesesDisponibles.map((m) => <option key={m.periodo} value={m.periodo}>{m.etiqueta}</option>)}
              </select>
              <input
                className="campo" style={{ maxWidth: 180 }} inputMode="decimal" placeholder="cuánto vendiste"
                value={f.v.monto} onChange={(e) => f.set({ ...f.v, monto: e.target.value })}
                aria-label={`Ventas del mes ${f.id}`}
              />
            </div>
          </div>
        ))}
      </section>

      {/* TEMPORADAS: sin esto, un agosto bajo se lee como problema cuando es el bajón normal. */}
      <section>
        <h2 className="t-seccion mb-1">¿En qué meses vendes más?</h2>
        <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
          Marca los tuyos. Sirve para no confundir una temporada baja con un problema del negocio.
        </p>
        <div className="flex flex-wrap gap-2">
          {MESES.map((m) => {
            const activo = altas.has(m.nombre);
            return (
              <button
                key={m.clave} type="button" title={m.nota}
                onClick={() => setAltas((s) => { const n = new Set(s); if (n.has(m.nombre)) n.delete(m.nombre); else n.add(m.nombre); return n; })}
                className="t-dato"
                style={{
                  padding: "7px 13px", borderRadius: "var(--radio)", cursor: "pointer", font: "inherit", fontSize: 14,
                  border: `1px solid ${activo ? "var(--marca)" : "var(--linea)"}`,
                  background: activo ? "var(--marca)" : "var(--papel)",
                  color: activo ? "#fff" : "var(--tinta)",
                }}
                aria-pressed={activo}
              >
                {m.nombre}
              </button>
            );
          })}
        </div>
      </section>

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <div>
        <button type="button" className="boton boton--grande" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando" : "Guardar mis números"}
        </button>
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Puedes corregirlos cuando quieras. Nada se pierde.</p>
      </div>

      {/* LO QUE YA ESTÁ: para que vea que su esfuerzo quedó guardado. */}
      {(puestos.length > 0 || serieVenta.length > 0) && (
        <section style={{ borderTop: "1px solid var(--linea)", paddingTop: 20 }}>
          <h2 className="t-seccion mb-3">Lo que ya nos contaste</h2>
          {serieVenta.length > 0 && (
            <div className="mb-4">
              <p className="t-etiqueta mb-2">Tus ventas mes a mes</p>
              <ul className="lista-editorial">
                {serieVenta.map((s) => (
                  <li key={s.periodo} className="flex items-baseline justify-between gap-3" style={{ padding: "7px 0" }}>
                    <span className="t-dato">{nombreDePeriodo(s.periodo)}</span>
                    <span className="t-dato" style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{soles(s.valor)}</span>
                  </li>
                ))}
              </ul>
              {serieVenta.length < 3 && (
                <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                  Con {serieVenta.length === 1 ? "un solo mes" : "dos meses"} todavía no se ve una curva. Con tres ya podemos decirte si vienes subiendo o bajando.
                </p>
              )}
            </div>
          )}
          {puestos.length > 0 && (
            <ul className="lista-editorial">
              {puestos.map((v) => (
                <li key={v.clave} style={{ padding: "6px 0" }}>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>{v.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

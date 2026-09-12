"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { TIPOS_EVENTO, FAMILIAS, TIPO_EVENTO, type LineaResumen } from "@/lib/eventos";

/**
 * ANOTAR EL DÍA EN SEGUNDOS.
 *
 * Kelin (12-09-2026): en RENASER hoy no registran tardanzas, facturación ni el estado de los
 * proyectos en ninguna parte — está en la cabeza. El riesgo de esta pantalla no es que falte un
 * campo: es que anotar cueste trabajo y nadie anote. Entonces: se elige qué pasó, salen SOLO los
 * campos que ese tipo necesita, y se guarda.
 *
 * Los ejemplos van como marca de agua, nunca como contenido en la caja. Regla de la casa desde el
 * día en que un ejemplo escrito dentro del campo hizo creer a una dueña que el sistema había
 * inventado datos de su empresa.
 */

export type Persona = { id: string; nombre: string; puesto: string | null };
export type EventoFila = {
  id: string; tipo: string; fecha: string; monto: number | null; minutos: number | null;
  datos: Record<string, string> | null; participants: { nombre: string } | null;
};

const SOLES = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

const MARCA_AGUA: Record<string, string> = {
  cliente: "Qori Home",
  proyecto: "Implementación Qori",
  puesto: "Asistente de cobranzas",
  nota: "Lo que pasó, en tus palabras",
};

function textoTotal(l: LineaResumen): string {
  if (l.unidad === "soles") return SOLES(l.total);
  if (l.unidad === "minutos") return `${l.total} min`;
  return `${l.total} ${l.total === 1 ? "vez" : "veces"}`;
}

export function Eventos({ companyId, personas, iniciales, resumenInicial }: { companyId: string; personas: Persona[]; iniciales: EventoFila[]; resumenInicial: LineaResumen[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const def = tipo ? TIPO_EVENTO.get(tipo) : null;

  const elegir = (t: string) => {
    setTipo(t === tipo ? "" : t);
    setValores({});
    setError(null);
    setListo(false);
  };

  const guardar = async () => {
    if (!def) return;
    setGuardando(true);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = { tipo };
      if (fecha) cuerpo.fecha = fecha;
      for (const c of def.campos) {
        const v = (valores[c.clave] ?? "").trim();
        if (!v) continue;
        if (c.clave === "monto") cuerpo.monto = Number(v.replace(",", "."));
        else if (c.clave === "minutos") cuerpo.minutos = Number(v);
        else if (c.clave === "persona") cuerpo.persona_id = v;
        else cuerpo[c.clave] = v;
      }
      await pedir(`/api/companies/${companyId}/eventos`, { json: cuerpo });
      setValores({});
      setListo(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await pedir(`/api/companies/${companyId}/eventos`, { method: "DELETE", json: { evento_id: id } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  };

  return (
    <>
      {/* QUÉ PASÓ. Los tipos agrupados por familia: el equipo, el dinero, los proyectos, lo que salió mal. */}
      <section className="panel" style={{ marginBottom: 28 }}>
        <h2 className="t-seccion mb-1">¿Qué pasó?</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 14 }}>
          Toca lo que quieras anotar. Solo pedimos lo que ese caso necesita.
        </p>
        {FAMILIAS.map((f) => {
          const tipos = TIPOS_EVENTO.filter((t) => t.familia === f.clave);
          return (
            <div key={f.clave} style={{ marginBottom: 14 }}>
              <div className="t-etiqueta" style={{ marginBottom: 6 }}>{f.nombre}</div>
              <div className="flex flex-wrap gap-2">
                {tipos.map((t) => (
                  <button key={t.clave} type="button" className={`boton ${tipo === t.clave ? "" : "boton--secundario"}`} onClick={() => elegir(t.clave)}>
                    {t.nombre}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {def && (
          <div className="aparece" style={{ marginTop: 20, borderTop: "1px solid var(--linea)", paddingTop: 18 }}>
            <p className="t-cuerpo" style={{ marginBottom: 12 }}>{def.pregunta}</p>
            <div className="flex flex-wrap gap-3">
              {def.campos.map((c) => (
                <label key={c.clave} style={{ flex: c.clave === "nota" ? "1 1 100%" : "1 1 180px" }}>
                  <span className="t-etiqueta">{c.etiqueta}{!c.obligatorio && " (opcional)"}</span>
                  {c.clave === "persona" ? (
                    <select className="campo" aria-label={c.etiqueta} value={valores.persona ?? ""} onChange={(e) => setValores((v) => ({ ...v, persona: e.target.value }))}>
                      <option value="">Elige a la persona</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ""}</option>
                      ))}
                    </select>
                  ) : c.clave === "nota" ? (
                    <textarea
                      className="campo" rows={3} aria-label={c.etiqueta} placeholder={MARCA_AGUA.nota}
                      value={valores.nota ?? ""} onChange={(e) => setValores((v) => ({ ...v, nota: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="campo"
                      aria-label={c.etiqueta}
                      type={c.clave === "monto" || c.clave === "minutos" ? "number" : "text"}
                      inputMode={c.clave === "monto" ? "decimal" : c.clave === "minutos" ? "numeric" : undefined}
                      min={0}
                      placeholder={MARCA_AGUA[c.clave] ?? ""}
                      value={valores[c.clave] ?? ""}
                      onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
              <label style={{ flex: "1 1 180px" }}>
                <span className="t-etiqueta">Cuándo pasó (si no fue hoy)</span>
                <input className="campo" aria-label="Cuándo pasó" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </label>
            </div>
            {personas.length === 0 && def.campos.some((c) => c.clave === "persona") && (
              <p className="t-dato" style={{ color: "var(--caducado)", marginTop: 8 }}>
                Todavía no hay personas registradas en esta empresa, así que no se puede decir de quién fue.
              </p>
            )}
            <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
              <button className="boton" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Anotar"}</button>
              {listo && <span className="t-dato" style={{ color: "var(--confirmado)" }}>anotado</span>}
              {error && <span className="t-dato" style={{ color: "var(--caducado)" }}>{error}</span>}
            </div>
          </div>
        )}
      </section>

      {/* EL RESUMEN. Solo lo que de verdad se anotó: un tablero de ceros hace creer que se midió. */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="t-seccion mb-1">Lo que va en los últimos 30 días</h2>
        {resumenInicial.length === 0 ? (
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
            Todavía no hay nada anotado. En cuanto anotes la primera tardanza o la primera factura, aquí sale el acumulado.
            Lo que no aparece no es cero: es que nadie lo anotó.
          </p>
        ) : (
          <div className="fila-numeros">
            {resumenInicial.map((l) => (
              <div key={l.tipo}>
                <div className="t-etiqueta">{l.nombre}</div>
                <div className="t-dato" style={{ fontSize: 22, fontWeight: 600 }}>{textoTotal(l)}</div>
                <div className="t-dato" style={{ color: "var(--grafito)" }}>
                  {l.veces} {l.veces === 1 ? "anotación" : "anotaciones"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* EL DETALLE, para corregir lo que se anotó mal. */}
      {iniciales.length > 0 && (
        <section>
          <h2 className="t-seccion mb-3">Lo anotado</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Qué</th>
                <th>Detalle</th>
                <th aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {iniciales.map((e) => {
                const d = TIPO_EVENTO.get(e.tipo);
                const partes = [
                  e.participants?.nombre,
                  e.monto != null ? SOLES(Number(e.monto)) : null,
                  e.minutos != null ? `${e.minutos} min` : null,
                  e.datos?.cliente, e.datos?.proyecto, e.datos?.puesto, e.datos?.nota,
                ].filter(Boolean);
                return (
                  <tr key={e.id}>
                    <td>{e.fecha}</td>
                    <td>{d?.nombre ?? e.tipo}</td>
                    <td>{partes.join(" · ") || "—"}</td>
                    <td>
                      <button
                        className="t-dato"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", textDecoration: "underline", padding: 0, font: "inherit" }}
                        onClick={() => borrar(e.id)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

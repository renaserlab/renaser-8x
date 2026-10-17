"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";
import { CAMPOS_PLAN, CONDICIONES_PLAN, type AccionConContexto, type Participante, type IndicadorBreve, type LineaBase } from "@/lib/plan-reglas";

type Valor = string | string[] | boolean | number | null;

/**
 * LA FICHA EDITABLE: los 14 campos y las cuatro condiciones. Cada campo se guarda al salir de él (PATCH).
 * Si la acción ya no es una propuesta, antes de guardar pide por qué y qué implica: cambiar lo aprobado es
 * volver a decidir, y queda en el historial con el antes y el después.
 */
export function FichaAccion({ accion: a, participantes, indicadores, lineasBase, otras, onGuardado }: {
  accion: AccionConContexto;
  participantes: Participante[];
  indicadores: IndicadorBreve[];
  lineasBase: LineaBase[];
  otras: { id: string; accion: string }[];
  onGuardado: () => void;
}) {
  const decidida = a.estado_canonico !== "propuesto";
  const [pendiente, setPendiente] = useState<Record<string, Valor>>({});
  const [motivo, setMotivo] = useState("");
  const [implica, setImplica] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const valor = (k: string): Valor => (k in pendiente ? pendiente[k] : ((a as unknown as Record<string, Valor>)[k] ?? null));
  const cambiar = (k: string, v: Valor) => setPendiente((p) => ({ ...p, [k]: v }));

  const guardar = async (cambios: Record<string, Valor>) => {
    if (!Object.keys(cambios).length) return;
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/actions/${a.id}`, { method: "PATCH", json: decidida ? { ...cambios, motivo, implica } : cambios });
      setPendiente({});
      setMotivo("");
      setImplica("");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  // Propuesta: cada campo se guarda solo al salir. Decidida: se acumulan y se guardan con motivo e implicación.
  const alSalir = (k: string) => {
    if (decidida) return;
    const v = valor(k);
    const original = (a as unknown as Record<string, Valor>)[k] ?? null;
    if (JSON.stringify(v ?? null) !== JSON.stringify(original)) void guardar({ [k]: v });
  };

  const texto = (k: string, largo = false, placeholder?: string) =>
    largo ? (
      <textarea className="campo" rows={2} value={(valor(k) as string | null) ?? ""} placeholder={placeholder} aria-label={k} onChange={(e) => cambiar(k, e.target.value || null)} onBlur={() => alSalir(k)} />
    ) : (
      <input className="campo" value={(valor(k) as string | null) ?? ""} placeholder={placeholder} aria-label={k} onChange={(e) => cambiar(k, e.target.value || null)} onBlur={() => alSalir(k)} />
    );

  const seleccion = (k: string, opciones: { id: string; texto: string }[], vacio: string) => (
    <select className="campo" value={(valor(k) as string | null) ?? ""} aria-label={k} onChange={(e) => { cambiar(k, e.target.value || null); if (!decidida) void guardar({ [k]: e.target.value || null }); }}>
      <option value="">{vacio}</option>
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
    </select>
  );

  const campo = (c: (typeof CAMPOS_PLAN)[number]) => {
    switch (c.tipo) {
      case "texto": return texto(c.clave);
      case "texto_largo": return texto(c.clave, true);
      case "participante": return seleccion(c.clave, participantes.map((p) => ({ id: p.id, texto: `${p.nombre}${p.puesto ? ` · ${p.puesto}` : ""}` })), a.responsable ? `Sin identificar («${a.responsable}»)` : "Sin responsable identificado");
      case "indicador": return (
        <div className="flex flex-col gap-2">
          {seleccion(c.clave, indicadores.map((i) => ({ id: i.id, texto: `${i.nombre}${i.unidad ? ` (${i.unidad})` : ""}` })), indicadores.length ? "Sin indicador formal" : "Todavía no hay indicadores formales")}
          {texto("kpi", false, "indicador (texto) o motivo de no tenerlo")}
        </div>
      );
      case "linea_base": return seleccion(c.clave, lineasBase.map((m) => ({ id: m.id, texto: `Versión ${m.version}${m.vigente ? " (vigente)" : ""}${m.fecha ? ` · ${fechaCorta(m.fecha)}` : ""}` })), lineasBase.length ? "Sin punto de partida enlazado" : "La empresa aún no tiene línea base");
      case "solo_lectura": return <p className="t-dato" style={{ color: "var(--grafito)" }}>{a.aprobado_at ? `Aprobada el ${fechaCorta(a.aprobado_at)}` : "Todavía no aprobada"}</p>;
      case "plazo": return (
        <div className="flex gap-2 flex-wrap">
          <input className="campo" type="date" style={{ maxWidth: 190 }} aria-label="fecha_inicio" value={(valor("fecha_inicio") as string | null) ?? ""} onChange={(e) => cambiar("fecha_inicio", e.target.value || null)} onBlur={() => alSalir("fecha_inicio")} />
          <input className="campo" type="date" style={{ maxWidth: 190 }} aria-label="vence_at" value={(valor("vence_at") as string | null) ?? ""} onChange={(e) => cambiar("vence_at", e.target.value || null)} onBlur={() => alSalir("vence_at")} />
        </div>
      );
      case "acciones": {
        const ids = (valor("depende_de") as string[] | null) ?? [];
        return (
          <div className="flex flex-col gap-1">
            {otras.filter((o) => o.id !== a.id).map((o) => (
              <label key={o.id} className="t-dato flex gap-2 items-start">
                <input type="checkbox" checked={ids.includes(o.id)} onChange={(e) => { const nuevo = e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id); cambiar("depende_de", nuevo); if (!decidida) void guardar({ depende_de: nuevo }); }} />
                <span>{o.accion}</span>
              </label>
            ))}
            {otras.length <= 1 && <p className="t-dato" style={{ color: "var(--grafito)" }}>No hay otras acciones de las que depender.</p>}
          </div>
        );
      }
      case "uuids": {
        const ids = (valor("evidencia_ids") as string[] | null) ?? [];
        return <p className="t-dato" style={{ color: "var(--grafito)" }}>{ids.length ? `${ids.length} evidencia(s) enlazada(s)` : "Sin evidencias enlazadas"}{a.finding_titulo ? ` · nace del hallazgo «${a.finding_titulo}»` : ""}</p>;
      }
    }
  };

  const haySinGuardar = Object.keys(pendiente).length > 0;

  return (
    <div className="flex flex-col gap-3">
      {decidida && (
        <p className="t-dato" style={{ color: "var(--caducado)" }}>
          Esta acción ya está {a.estado_canonico === "aprobado" ? "aprobada" : "decidida"}: cualquier cambio pide por qué y qué implica, y queda en el historial.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {CAMPOS_PLAN.map((c) => (
          <div key={c.clave} style={c.tipo === "texto_largo" ? { gridColumn: "1 / -1" } : undefined}>
            <div className="t-etiqueta mb-1">{c.titulo}</div>
            {campo(c)}
            {c.ayuda && <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>{c.ayuda}</p>}
          </div>
        ))}
      </div>
      <details>
        <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Condiciones: riesgos, supuestos y compromisos de cada parte</summary>
        <div className="grid gap-3 md:grid-cols-2 mt-2">
          {CONDICIONES_PLAN.map((c) => (
            <div key={c.clave}>
              <div className="t-etiqueta mb-1">{c.titulo}</div>
              {texto(c.clave, true)}
            </div>
          ))}
        </div>
      </details>
      <div className="flex gap-3 flex-wrap items-center">
        <label className="t-dato flex gap-2 items-center">
          <input type="checkbox" checked={Boolean(valor("es_prioridad"))} onChange={(e) => { cambiar("es_prioridad", e.target.checked); if (!decidida) void guardar({ es_prioridad: e.target.checked }); }} />
          Cuenta como prioridad (ocupa un frente)
        </label>
      </div>
      {decidida && haySinGuardar && (
        <div className="flex flex-col gap-2" style={{ borderLeft: "1px solid var(--caducado)", paddingLeft: 12 }}>
          <input className="campo" placeholder="Por qué se cambia (al menos 8 letras)" aria-label="Por qué se cambia" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <input className="campo" placeholder="Qué implica (plazo, recursos, otra acción)" aria-label="Qué implica" value={implica} onChange={(e) => setImplica(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} disabled={guardando || motivo.trim().length < 8 || !implica.trim()} onClick={() => guardar(pendiente)}>
              {guardando ? "Guardando" : "Guardar cambios con su motivo"}
            </button>
            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => setPendiente({})}>Descartar</button>
          </div>
        </div>
      )}
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

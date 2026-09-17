"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import type { Puesto, ReglaEstudio } from "@/lib/rules/organigrama";
import { nivelesDelArbol } from "@/lib/rules/organigrama";

/**
 * EL ORGANIGRAMA COMO ESTUDIO (pedido de Kelin): no es un dibujo libre — cada puesto lleva misión,
 * la decisión que le pertenece, quién lo ocupa y quién lo respalda; y las reglas del estudio dicen
 * el PORQUÉ la estructura está bien o mal armada. De aquí salen el manual de funciones y el cierre
 * de los procesos. Edición en panel lateral, como todo en la casa.
 */
export function Organigrama({ companyId, puestos, estudio }: { companyId: string; puestos: Puesto[]; estudio: ReglaEstudio[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Partial<Puesto> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abierto = editando != null;

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setEditando(null);
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  const guardar = async () => {
    if (!editando?.nombre?.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = {
        nombre: editando.nombre.trim(),
        mision: editando.mision?.trim() || null,
        decide: editando.decide?.trim() || null,
        persona: editando.persona?.trim() || null,
        respaldo: editando.respaldo?.trim() || null,
        reporta_a: editando.reporta_a || null,
        por_que: editando.por_que?.trim() || null,
      };
      if (editando.id) await pedir(`/api/companies/${companyId}/organigrama/${editando.id}`, { method: "PATCH", json: cuerpo });
      else await pedir(`/api/companies/${companyId}/organigrama`, { json: cuerpo });
      setEditando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: string) => {
    setGuardando(true);
    try {
      await pedir(`/api/companies/${companyId}/organigrama/${id}`, { method: "DELETE" });
      setBorrando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar.");
    } finally {
      setGuardando(false);
    }
  };

  const sembrar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/organigrama/semilla`, { json: {} });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setGuardando(false);
    }
  };

  const niveles = nivelesDelArbol(puestos);
  const nombreDe = (id?: string | null) => puestos.find((p) => p.id === id)?.nombre ?? null;
  const campo = (etiqueta: string, k: keyof Puesto, placeholder = "", filas = 0) => (
    <label className="flex flex-col gap-1">
      <span className="t-etiqueta">{etiqueta}</span>
      {filas ? (
        <textarea className="campo" rows={filas} aria-label={etiqueta} value={(editando?.[k] as string) ?? ""} onChange={(e) => setEditando((x) => ({ ...x, [k]: e.target.value }))} placeholder={placeholder} />
      ) : (
        <input className="campo" aria-label={etiqueta} value={(editando?.[k] as string) ?? ""} onChange={(e) => setEditando((x) => ({ ...x, [k]: e.target.value }))} placeholder={placeholder} />
      )}
    </label>
  );

  return (
    <>
      {puestos.length === 0 ? (
        <section className="panel p-6 mb-8" style={{ maxWidth: 560 }}>
          <p className="t-cuerpo mb-4">El organigrama nace de lo real: las personas y puestos que la empresa ya contó. Siembra el primer borrador y acomódalo con tu criterio.</p>
          <div className="flex flex-wrap gap-3">
            <button className="boton" onClick={sembrar} disabled={guardando}>{guardando ? "Sembrando…" : "Sembrar con lo levantado"}</button>
            <button className="boton boton--secundario" onClick={() => setEditando({})}>Empezar en blanco</button>
          </div>
        </section>
      ) : (
        <>
          {/* EL ÁRBOL: niveles de arriba hacia abajo, tarjetas sobrias, imprimible tal cual. */}
          <section className="mb-8">
            {niveles.map((nivel, i) => (
              <div key={i}>
                {i > 0 && <div style={{ width: 2, height: 18, background: "var(--linea)", margin: "0 auto" }} />}
                <div className="flex flex-wrap justify-center gap-3">
                  {nivel.map((p) => {
                    const vacante = !p.persona?.trim();
                    return (
                      <article key={p.id} className="panel p-4" style={{ width: 250, borderTop: `2.5px solid ${vacante ? "var(--caducado)" : "var(--marca)"}` }}>
                        <p className="t-seccion" style={{ fontSize: 15 }}>{p.nombre}</p>
                        <p className="t-dato" style={{ color: vacante ? "var(--caducado)" : "var(--tinta)", fontWeight: 600 }}>{p.persona?.trim() || "Vacante"}</p>
                        {p.mision && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{p.mision}</p>}
                        {p.decide && <p className="t-dato mt-1" style={{ color: "var(--marca)" }}>Decide: {p.decide}</p>}
                        <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>
                          {i > 0 && nombreDe(p.reporta_a) ? `Reporta a ${nombreDe(p.reporta_a)}` : i > 0 ? "Sin jefe asignado" : "Cabeza de la estructura"}
                          {p.respaldo ? ` · lo cubre ${p.respaldo}` : ""}
                        </p>
                        <div className="no-imprimir mt-2 flex gap-3">
                          <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--marca)", padding: 0 }} onClick={() => setEditando(p)}>Editar</button>
                          {borrando === p.id ? (
                            <span className="t-dato">
                              ¿Seguro?{" "}
                              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--contradicho)", textDecoration: "underline", padding: 0 }} disabled={guardando} onClick={() => quitar(p.id)}>Sí, quitarlo</button>{" "}
                              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", padding: 0 }} onClick={() => setBorrando(null)}>No</button>
                            </span>
                          ) : (
                            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }} onClick={() => setBorrando(p.id)}>Quitar</button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="no-imprimir mt-5 flex flex-wrap gap-3 justify-center">
              <button className="boton boton--secundario" onClick={() => setEditando({})}>Agregar puesto</button>
              <button className="boton boton--secundario" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
            </div>
          </section>

          {/* EL ESTUDIO: el porqué, con reglas y nombres — no con opinión. */}
          <section className="mb-10">
            <h2 className="t-seccion mb-3">El estudio: por qué está bien (o mal) armado</h2>
            <div className="flex flex-col gap-2">
              {estudio.map((r) => (
                <div key={r.clave} className="flex gap-3 items-baseline" style={{ borderBottom: "1px solid var(--linea)", paddingBottom: 8 }}>
                  <span className="t-etiqueta" style={{ color: r.cumple ? "var(--confirmado)" : "var(--contradicho)", flex: "none", width: 64 }}>{r.cumple ? "Cumple" : "No cumple"}</span>
                  <div>
                    <p className="t-dato" style={{ fontWeight: 600 }}>{r.nombre}</p>
                    <p className="t-dato" style={{ color: "var(--grafito)" }}>{r.detalle}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {error && <p className="t-cuerpo mb-4" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar" onClick={() => setEditando(null)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="Puesto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-seccion">{editando?.id ? "Editar puesto" : "Nuevo puesto"}</h3>
              <button type="button" onClick={() => setEditando(null)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <div className="flex flex-col gap-4">
              {campo("Nombre del puesto", "nombre", "p. ej. Encargado de Local — Paruro")}
              {campo("Quién lo ocupa hoy", "persona", "nombre y apellido — o vacío si es vacante")}
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Reporta a</span>
                <select className="campo" aria-label="Reporta a" value={editando?.reporta_a ?? ""} onChange={(e) => setEditando((x) => ({ ...x, reporta_a: e.target.value || null }))}>
                  <option value="">— nadie (cabeza de la estructura) —</option>
                  {puestos.filter((p) => p.id !== editando?.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.persona ? ` (${p.persona})` : ""}</option>
                  ))}
                </select>
              </label>
              {campo("Misión en una línea", "mision", "qué entrega este puesto para decir que cumplió", 2)}
              {campo("La decisión que le pertenece", "decide", "qué resuelve SOLO, sin preguntar", 2)}
              {campo("Quién lo cubre si falta", "respaldo", "nombre del respaldo")}
              {campo("Por qué existe / por qué ahí", "por_que", "la razón de diseño: se lee en el estudio y alimenta el manual de funciones", 3)}
              <div className="flex gap-3">
                <button className="boton" onClick={guardar} disabled={guardando || !editando?.nombre?.trim()}>{guardando ? "Guardando…" : "Guardar"}</button>
                <button className="boton boton--secundario" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

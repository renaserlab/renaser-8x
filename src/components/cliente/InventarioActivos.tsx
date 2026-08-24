"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BLOQUES_ACTIVOS, ESTADOS_ACTIVO, type ActivoDef } from "@/lib/activos";
import { BotonGrabar } from "@/components/voz/BotonGrabar";

type EstadoGuardado = { clave: string; estado: string; nota: string | null; borrador?: string | null; faltantes?: { pregunta: string }[] | null };

/**
 * LEVANTAMIENTO GUIADO — la mirada de un consultor conociendo la empresa (no un formulario).
 * Por cada área: si el documento existe, se sube AQUÍ MISMO (archivo, foto o audio). Si no está
 * escrito, se pregunta CÓMO FUNCIONA HOY (respondible hablando). Nada se pide dos veces.
 * Construirlo por escrito es un paso posterior, ofrecido solo cuando ya contaron cómo funciona.
 */
export function InventarioActivos({ companyId, guardados }: { companyId: string; guardados: EstadoGuardado[] }) {
  const router = useRouter();
  const [estados, setEstados] = useState<Record<string, EstadoGuardado>>(Object.fromEntries(guardados.map((g) => [g.clave, g])));
  const [bloqueAbierto, setBloqueAbierto] = useState(BLOQUES_ACTIVOS[0].clave);
  const [respuestas, setRespuestas] = useState<Record<string, Record<number, string>>>({});
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gracias, setGracias] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  const hayConstruyendo = Object.values(estados).some((e) => e.estado === "construyendo");
  useEffect(() => {
    if (sondeo.current) clearInterval(sondeo.current);
    if (!hayConstruyendo) return;
    sondeo.current = setInterval(async () => {
      try {
        const r = await pedir<{ activos: EstadoGuardado[] }>(`/api/companies/${companyId}/assets`);
        setEstados(Object.fromEntries(r.activos.map((g) => [g.clave, g])));
      } catch {
        /* siguiente vuelta */
      }
    }, 3500);
    return () => {
      if (sondeo.current) clearInterval(sondeo.current);
    };
  }, [hayConstruyendo, companyId]);

  const marcar = async (clave: string, estado: string) => {
    setError(null);
    setGracias(null);
    const previo = estados[clave];
    setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado } }));
    try {
      await pedir(`/api/companies/${companyId}/assets`, { json: { clave, estado } });
    } catch (e) {
      setEstados((s) => ({ ...s, [clave]: previo }));
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };

  /** Subida en el lugar: el documento de ESTA área, ligado a ella. */
  const subirArchivos = async (clave: string, a: ActivoDef, files: FileList | null) => {
    if (!files?.length) return;
    setOcupado(clave);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.set("company_id", companyId);
        form.set("archivo", f);
        form.set("asset_clave", clave);
        form.set("asset_estado", estados[clave]?.estado === "incompleto" ? "incompleto" : "lo_tengo");
        const r = await fetch("/api/sources", { method: "POST", body: form });
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos subir ese archivo.");
      }
      setGracias(clave);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir ese archivo.");
    } finally {
      setOcupado(null);
      const el = inputs.current[clave];
      if (el) el.value = "";
    }
  };

  /** Levantamiento: las respuestas de "cómo funciona hoy" se vuelven una fuente de ESTA área. */
  const contarComoFunciona = async (clave: string, a: ActivoDef) => {
    const pares = a.preguntas.map((p, i) => ({ pregunta: p, respuesta: (respuestas[clave]?.[i] ?? "").trim() })).filter((x) => x.respuesta);
    if (!pares.length) return;
    setOcupado(clave);
    setError(null);
    try {
      const form = new FormData();
      form.set("company_id", companyId);
      form.set("nombre", `Cómo funciona · ${a.nombre}`);
      form.set("texto", pares.map((x) => `P: ${x.pregunta}\nR: ${x.respuesta}`).join("\n\n"));
      form.set("asset_clave", clave);
      form.set("asset_estado", "contado");
      const r = await fetch("/api/sources", { method: "POST", body: form });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos guardar.");
      setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado: "contado" } }));
      setRespuestas((r2) => ({ ...r2, [clave]: {} }));
      setGracias(clave);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setOcupado(null);
    }
  };

  const construir = async (clave: string) => {
    setError(null);
    setOcupado(clave);
    try {
      await pedir(`/api/companies/${companyId}/assets/construir`, { json: { clave } });
      setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado: "construyendo" } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setOcupado(null);
    }
  };

  const confirmar = async (clave: string) => {
    setError(null);
    setOcupado(clave);
    try {
      const texto = editando[clave] ?? estados[clave]?.borrador ?? "";
      await pedir(`/api/companies/${companyId}/assets/confirmar`, { json: { clave, borrador: texto } });
      setEstados((e) => ({ ...e, [clave]: { ...e[clave], estado: "construido", borrador: texto } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar.");
    } finally {
      setOcupado(null);
    }
  };

  const avanceBloque = (bloque: string) => {
    const b = BLOQUES_ACTIVOS.find((x) => x.clave === bloque)!;
    const listos = b.activos.filter((a) => ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo"].includes(estados[`${b.clave}.${a.clave}`]?.estado ?? "")).length;
    return { listos, total: b.activos.length };
  };

  const zonaSubida = (clave: string, a: ActivoDef, texto: string) => (
    <div
      className="mt-3 p-5"
      style={{ border: "1.5px dashed var(--linea)", borderRadius: "var(--radio)", background: "var(--suave)", textAlign: "center", cursor: "pointer" }}
      role="button"
      tabIndex={0}
      aria-label={`Subir ${a.nombre}`}
      onClick={() => inputs.current[clave]?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputs.current[clave]?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        subirArchivos(clave, a, e.dataTransfer.files);
      }}
    >
      <input ref={(el) => { inputs.current[clave] = el; }} type="file" multiple style={{ display: "none" }} aria-label={`Archivo de ${a.nombre}`} tabIndex={-1} onChange={(e) => subirArchivos(clave, a, e.target.files)} />
      <p className="t-cuerpo" style={{ fontWeight: 500 }}>{ocupado === clave ? "Recibiendo…" : texto}</p>
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Documento, foto del cuaderno o audio — tal como esté. Toca aquí o arrástralo.</p>
    </div>
  );

  const preguntasLevantamiento = (clave: string, a: ActivoDef, intro: string) => (
    <div className="mt-3 flex flex-col gap-4 p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
      <p className="t-cuerpo medida">{intro}</p>
      {a.preguntas.map((p, i) => (
        <div key={i} className="flex flex-col gap-2">
          <label className="t-cuerpo" style={{ fontWeight: 500 }} htmlFor={`${clave}-p${i}`}>{p}</label>
          <div className="flex flex-col gap-2">
            <BotonGrabar grande={false} alTexto={(t) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), [i]: (((r[clave]?.[i] ?? "") + " " + t)).trim() } }))} />
            <textarea id={`${clave}-p${i}`} className="campo" rows={2} value={respuestas[clave]?.[i] ?? ""} onChange={(e) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), [i]: e.target.value } }))} placeholder="Cuéntalo como se lo contarías a alguien de confianza" />
          </div>
        </div>
      ))}
      <button className="boton" style={{ alignSelf: "flex-start" }} disabled={ocupado === clave || !a.preguntas.some((_, i) => (respuestas[clave]?.[i] ?? "").trim())} onClick={() => contarComoFunciona(clave, a)}>
        {ocupado === clave ? "Guardando…" : "Guardar lo contado"}
      </button>
    </div>
  );

  const totales = BLOQUES_ACTIVOS.reduce((acc, b) => acc + b.activos.length, 0);
  const levantados = BLOQUES_ACTIVOS.reduce((acc, b) => acc + b.activos.filter((a) => ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo"].includes(estados[`${b.clave}.${a.clave}`]?.estado ?? "")).length, 0);
  const pct = Math.round((levantados / totales) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4" aria-label="Avance del levantamiento">
        <div style={{ flex: 1, height: 4, borderRadius: 3, background: "var(--linea)", overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: "var(--marca)", transition: "width 300ms ease" }} />
        </div>
        <span className="t-dato" style={{ color: "var(--grafito)", flex: "none" }}>{pct === 100 ? "Levantamiento completo" : `Entendido ${pct}%`}</span>
      </div>
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {BLOQUES_ACTIVOS.map((b) => {
        const abierto = b.clave === bloqueAbierto;
        const av = avanceBloque(b.clave);
        return (
          <section key={b.clave} className="panel" style={{ overflow: "hidden" }}>
            <button className="w-full p-5 flex items-center justify-between gap-4" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => setBloqueAbierto(abierto ? "" : b.clave)} aria-expanded={abierto}>
              <span style={{ minWidth: 0 }}>
                <span className="t-seccion" style={{ fontSize: 19 }}>{b.nombre}</span>
                <span className="block t-dato mt-1" style={{ color: "var(--grafito)" }}>{b.intro}</span>
              </span>
              <span style={{ flex: "none", textAlign: "right" }}>
                <span className="t-dato" style={{ color: av.listos === av.total ? "var(--confirmado)" : "var(--grafito)" }}>{av.listos} de {av.total}</span>
                <span aria-hidden="true" style={{ display: "flex", gap: 3, marginTop: 6, width: 72 }}>
                  {b.activos.map((a) => {
                    const e = estados[`${b.clave}.${a.clave}`]?.estado;
                    const listo = ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo"].includes(e ?? "");
                    return <span key={a.clave} style={{ flex: 1, height: 3, borderRadius: 2, background: listo ? "var(--marca)" : "var(--linea)" }} />;
                  })}
                </span>
              </span>
            </button>
            {abierto && (
              <div className="px-5 pb-5 flex flex-col gap-6">
                {b.activos.map((a) => {
                  const clave = `${b.clave}.${a.clave}`;
                  const g = estados[clave];
                  const estado = g?.estado;
                  return (
                    <div key={a.clave} style={{ borderTop: "1px solid var(--linea)", paddingTop: 18 }}>
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <p className="t-cuerpo" style={{ fontWeight: 550, fontSize: 18 }}>{a.nombre}</p>
                        {estado === "contado" && <span className="t-dato" style={{ color: "var(--confirmado)" }}>nos contaste cómo funciona</span>}
                        {(estado === "lo_tengo" || estado === "incompleto") && gracias !== clave && <span className="t-dato" style={{ color: "var(--confirmado)" }}>recibido</span>}
                        {estado === "construido" && <span className="t-dato" style={{ color: "var(--confirmado)" }}>escrito y confirmado</span>}
                      </div>
                      <p className="t-dato mt-1 mb-3" style={{ color: "var(--grafito)" }}>{a.ayuda}</p>

                      {!estado && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label={a.nombre}>
                          {ESTADOS_ACTIVO.map((e) => (
                            <button key={e.clave} className="boton boton--secundario" style={{ minHeight: 40, fontSize: 15 }} onClick={() => marcar(clave, e.clave)}>
                              {e.nombre}
                            </button>
                          ))}
                        </div>
                      )}

                      {(estado === "lo_tengo" || estado === "incompleto") && (
                        <>
                          {zonaSubida(clave, a, gracias === clave ? "Recibido. ¿Tienes algo más de esto?" : "Suéltalo aquí")}
                          {estado === "incompleto" && preguntasLevantamiento(clave, a, "Y lo que no está en el documento, cuéntanoslo:")}
                        </>
                      )}

                      {estado === "no_lo_tengo" && preguntasLevantamiento(clave, a, "No pasa nada — muchas empresas funcionan sin esto escrito. Cuéntanos cómo funciona hoy:")}

                      {estado === "no_se" && (
                        <>
                          <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>En simple: {a.ayuda.toLowerCase()} Si nunca lo han usado, no es un problema — cuéntanos cómo se maneja hoy:</p>
                          {preguntasLevantamiento(clave, a, "Con tus palabras:")}
                        </>
                      )}

                      {estado === "contado" && a.estructura && (
                        <div className="mt-2">
                          {gracias === clave && <p className="t-cuerpo mb-2" style={{ color: "var(--confirmado)" }}>Gracias — con esto ya entendemos cómo funciona.</p>}
                          <button className="boton boton--secundario" style={{ minHeight: 40, fontSize: 15 }} disabled={ocupado === clave} onClick={() => construir(clave)}>
                            Cuando quieras, lo dejamos por escrito contigo
                          </button>
                        </div>
                      )}
                      {estado === "contado" && !a.estructura && gracias === clave && (
                        <p className="t-cuerpo mt-2" style={{ color: "var(--confirmado)" }}>Gracias — con esto ya entendemos cómo funciona.</p>
                      )}

                      {estado === "construyendo" && (
                        <p className="t-cuerpo mt-2 aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>Redactando con todo lo que nos contaste…</p>
                      )}

                      {estado === "borrador_generado" && g?.borrador && (
                        <div className="mt-3 flex flex-col gap-3 aparece">
                          <label className="flex flex-col gap-2">
                            <span className="t-dato" style={{ color: "var(--grafito)" }}>Escrito solo con lo que tu empresa mostró. Corrige lo que quieras:</span>
                            <textarea className="campo" rows={12} style={{ fontFamily: "var(--font-doc)", fontSize: 16, lineHeight: 1.55 }} value={editando[clave] ?? g.borrador} onChange={(e) => setEditando((x) => ({ ...x, [clave]: e.target.value }))} aria-label={`Borrador de ${a.nombre}`} />
                          </label>
                          <div className="flex flex-wrap gap-3">
                            <button className="boton" disabled={ocupado === clave} onClick={() => confirmar(clave)}>Está correcto</button>
                            <button className="boton boton--secundario" disabled={ocupado === clave} onClick={() => construir(clave)}>Rehacerlo</button>
                          </div>
                        </div>
                      )}
                      {estado === "borrador_generado" && !g?.borrador && (g?.faltantes?.length ?? 0) > 0 && preguntasLevantamiento(clave, { ...a, preguntas: (g!.faltantes ?? []).map((f) => f.pregunta) }, "Para no inventar nada, cuéntanos esto:")}

                      {estado === "construido" && g?.borrador && (
                        <details className="mt-2">
                          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)" }}>Ver el documento confirmado</summary>
                          <pre className="t-doc mt-2" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-doc)" }}>{g.borrador}</pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

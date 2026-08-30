"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BLOQUES_ACTIVOS, ESTADOS_ACTIVO, EJEMPLOS, type ActivoDef } from "@/lib/activos";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { DocMd } from "@/components/base/DocMd";

type EstadoGuardado = { clave: string; estado: string; nota: string | null; borrador?: string | null; faltantes?: { pregunta: string }[] | null; implementacion?: { responsable?: string; desde?: string } | null; propuesta?: string | null; propuesta_cambios?: { cambio: string; por_que: string }[] | null; propuesta_estado?: string | null };

const LISTOS = ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo", "en_uso"];

/**
 * LEVANTAMIENTO GUIADO — la mirada de un consultor conociendo la empresa (no un formulario).
 * Por cada área: si el documento existe, se sube AQUÍ MISMO (archivo, foto o audio). Si no está
 * escrito, se pregunta CÓMO FUNCIONA HOY (respondible hablando). Nada se pide dos veces.
 * Construirlo por escrito es un paso posterior, ofrecido solo cuando ya contaron cómo funciona.
 */
export function InventarioActivos({ companyId, guardados, prioridades = [], docDestacado }: { companyId: string; guardados: EstadoGuardado[]; prioridades?: { clave: string; razon: string }[]; docDestacado?: string }) {
  const router = useRouter();
  const [estados, setEstados] = useState<Record<string, EstadoGuardado>>(Object.fromEntries(guardados.map((g) => [g.clave, g])));
  // Si llegó desde un hallazgo ("Construirlo ahora"), se abre su bloque y el documento se resalta.
  const bloqueDeDestacado = docDestacado?.split(".")[0];
  const [bloqueAbierto, setBloqueAbierto] = useState(bloqueDeDestacado ?? BLOQUES_ACTIVOS[0].clave);
  const [respuestas, setRespuestas] = useState<Record<string, Record<number, string>>>({});
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gracias, setGracias] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => {
    if (!docDestacado) return;
    const el = document.getElementById(`doc-${docDestacado}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [docDestacado]);
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  const hayConstruyendo = Object.values(estados).some((e) => e.estado === "construyendo" || e.propuesta_estado === "trabajando");
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
    const listos = b.activos.filter((a) => LISTOS.includes(estados[`${b.clave}.${a.clave}`]?.estado ?? "")).length;
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
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Puede ser un documento, una foto del cuaderno o un audio, tal como esté. Toca aquí para elegirlo.</p>
    </div>
  );

  const preguntasLevantamiento = (clave: string, a: ActivoDef, intro: string) => (
    <div className="mt-3 flex flex-col gap-3 p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
      <p className="t-cuerpo medida">{intro}</p>
      {a.preguntas.map((p, i) => (
        <div key={i} className="flex flex-col gap-2 p-4" style={{ background: "var(--papel)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
          <label className="t-cuerpo" style={{ fontWeight: 500 }} htmlFor={`${clave}-p${i}`}>{p}</label>
          <div className="flex flex-col gap-2">
            <BotonGrabar grande={false} alTexto={(t) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), [i]: (((r[clave]?.[i] ?? "") + " " + t)).trim() } }))} />
            {/* EL EJEMPLO VA COMO PLACEHOLDER, NUNCA COMO CONTENIDO (30-08-2026). La dueña de Qori
                creyó que el ejemplo eran datos suyos —de otro rubro— metidos en su caja, y tuvo que
                borrarlos letra por letra. En tenue y dentro de la caja se entiende que es una guía, y
                se va solo al escribir o al dictar. Regla del producto: un ejemplo jamás es `value`. */}
            <textarea id={`${clave}-p${i}`} aria-label={p} className="campo" rows={2} value={respuestas[clave]?.[i] ?? ""} onChange={(e) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), [i]: e.target.value } }))} placeholder={EJEMPLOS[p] ? `Por ejemplo: ${EJEMPLOS[p]}` : "Con tus palabras — no hay respuestas malas"} />
          </div>
        </div>
      ))}
      <button className="boton" style={{ alignSelf: "flex-start" }} disabled={ocupado === clave || !a.preguntas.some((_, i) => (respuestas[clave]?.[i] ?? "").trim())} onClick={() => contarComoFunciona(clave, a)}>
        {ocupado === clave ? "Guardando…" : "Guardar lo contado"}
      </button>
      <p className="t-dato" style={{ color: "var(--grafito)" }}>Puedes responder una sola pregunta y guardar — lo demás se puede completar después.</p>
    </div>
  );

  const totales = BLOQUES_ACTIVOS.reduce((acc, b) => acc + b.activos.length, 0);
  const levantados = BLOQUES_ACTIVOS.reduce((acc, b) => acc + b.activos.filter((a) => LISTOS.includes(estados[`${b.clave}.${a.clave}`]?.estado ?? "")).length, 0);
  const pct = Math.round((levantados / totales) * 100);

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4" aria-label="Avance del levantamiento">
        <div style={{ flex: 1, height: 4, borderRadius: 3, background: "var(--linea)", overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: "var(--marca)", transition: "width 300ms ease" }} />
        </div>
        <span className="t-dato" style={{ color: "var(--grafito)", flex: "none" }}>{pct === 100 ? "Levantamiento completo" : `Entendido ${pct}%`}</span>
      </div>
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {prioridades.length > 0 && (
        <div className="panel p-4" style={{ borderColor: "var(--marca)" }}>
          <p className="t-cuerpo" style={{ fontWeight: 550 }}>Según tu diagnóstico, estos documentos primero:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {prioridades.map((p) => {
              const def = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => ({ clave: `${b.clave}.${a.clave}`, nombre: a.nombre, bloque: b.clave }))).find((x) => x.clave === p.clave);
              if (!def) return null;
              return (
                <li key={p.clave} className="t-dato">
                  <button className="text-left" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "var(--marca)", textDecoration: "underline" }} onClick={() => setBloqueAbierto(def.bloque)}>
                    {def.nombre}
                  </button>
                  <span style={{ color: "var(--grafito)" }}> — por: {p.razon}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
                    const listo = LISTOS.includes(e ?? "");
                    return <span key={a.clave} style={{ flex: 1, height: 3, borderRadius: 2, background: listo ? "var(--marca)" : "var(--linea)" }} />;
                  })}
                </span>
              </span>
            </button>
            <AnimatePresence initial={false}>
            {abierto && (
              <motion.div key="contenido" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }} style={{ overflow: "hidden" }}>
              <div className="px-5 pb-5 flex flex-col gap-6">
                {b.activos.map((a) => {
                  const clave = `${b.clave}.${a.clave}`;
                  const g = estados[clave];
                  const estado = g?.estado;
                  const esDestacado = clave === docDestacado;
                  return (
                    <div
                      key={a.clave}
                      id={`doc-${clave}`}
                      style={
                        esDestacado
                          ? { borderTop: "1px solid var(--linea)", paddingTop: 18, marginLeft: -12, marginRight: -12, paddingLeft: 12, paddingRight: 12, paddingBottom: 12, borderRadius: "var(--radio)", background: "color-mix(in srgb, var(--marca) 5%, transparent)" }
                          : { borderTop: "1px solid var(--linea)", paddingTop: 18 }
                      }
                    >
                      {esDestacado && <p className="t-etiqueta mb-1" style={{ color: "var(--marca)" }}>Este es el que resuelve tu hallazgo</p>}
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <p className="t-cuerpo" style={{ fontWeight: 550, fontSize: 18 }}>{a.nombre}</p>
                        <span className="flex items-baseline gap-3">
                          {estado === "contado" && <span className="t-dato" style={{ color: "var(--confirmado)" }}>nos contaste cómo funciona</span>}
                          {(estado === "lo_tengo" || estado === "incompleto") && gracias !== clave && <span className="t-dato" style={{ color: "var(--confirmado)" }}>recibido</span>}
                          {estado === "construido" && <span className="t-dato" style={{ color: "var(--confirmado)" }}>escrito y confirmado</span>}
                          {estado === "en_uso" && <span className="t-dato" style={{ color: "var(--confirmado)" }}>en uso</span>}
                          {["lo_tengo", "incompleto", "no_lo_tengo", "no_se", "contado"].includes(estado ?? "") && (
                            <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", textDecoration: "underline", padding: 0, font: "inherit" }} onClick={() => setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado: "" } }))}>
                              cambiar opción
                            </button>
                          )}
                        </span>
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
                          {zonaSubida(clave, a, gracias === clave ? "Recibido. ¿Tienes algo más de esto?" : "Súbelo aquí")}
                          {estado === "incompleto" && preguntasLevantamiento(clave, a, "Y lo que no está en el documento, cuéntanoslo:")}
                        </>
                      )}

                      {estado === "no_lo_tengo" && preguntasLevantamiento(clave, a, "Está bien — muchas empresas funcionan sin esto por escrito. Cuéntanos cómo funciona hoy:")}

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

                      {(estado === "construido" || estado === "en_uso") && g?.borrador && g?.propuesta_estado !== "lista" && (
                        <details className="mt-2">
                          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)" }}>{g?.propuesta_estado === "confirmada" ? "Ver lo que nos contaste originalmente" : "Ver el documento confirmado"}</summary>
                          <div className="mt-2"><DocMd texto={g.borrador} /></div>
                        </details>
                      )}

                      {/* CAPA 3 · Sistematización: de lo declarado a lo trabajado, lado a lado. */}
                      {(estado === "construido" || estado === "en_uso") && g?.borrador && !g?.propuesta_estado && (
                        <button className="boton boton--secundario mt-3" style={{ minHeight: 40, fontSize: 15 }} disabled={ocupado === clave} onClick={async () => {
                          setOcupado(clave);
                          setError(null);
                          try {
                            await pedir(`/api/companies/${companyId}/assets/sistematizar`, { json: { clave } });
                            setEstados((e) => ({ ...e, [clave]: { ...e[clave], propuesta_estado: "trabajando" } }));
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "No se pudo.");
                          } finally {
                            setOcupado(null);
                          }
                        }}>
                          Trabajarlo con RENASER — la versión mejorada
                        </button>
                      )}
                      {g?.propuesta_estado === "trabajando" && (
                        <p className="t-cuerpo mt-3 aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>Trabajando la versión mejorada con tu diagnóstico…</p>
                      )}
                      {g?.propuesta_estado === "lista" && g.propuesta && (
                        <div className="mt-3 flex flex-col gap-3 aparece">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <details className="p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
                              <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Lo que nos contaste — ver</summary>
                              <div className="mt-2"><DocMd texto={g.borrador ?? ""} /></div>
                            </details>
                            <details className="p-4" open style={{ border: "1.5px solid var(--marca)", borderRadius: "var(--radio)" }}>
                              <summary className="t-etiqueta" style={{ cursor: "pointer", color: "var(--marca)" }}>La versión trabajada</summary>
                              <div className="mt-2"><DocMd texto={g.propuesta} /></div>
                            </details>
                          </div>
                          {(g.propuesta_cambios?.length ?? 0) > 0 && (
                            <div className="p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
                              <p className="t-etiqueta mb-2">Qué cambiamos y por qué</p>
                              {(g.propuesta_cambios ?? []).map((c, i) => (
                                <p key={i} className="t-cuerpo" style={{ marginBottom: 8 }}>
                                  <span style={{ fontWeight: 550 }}>{i + 1}. {c.cambio}</span>
                                  <span className="block t-dato" style={{ color: "var(--grafito)" }}>Por qué: {c.por_que}</span>
                                </p>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 items-center">
                            <button className="boton" disabled={ocupado === clave} onClick={async () => {
                              setOcupado(clave);
                              setError(null);
                              try {
                                await pedir(`/api/companies/${companyId}/assets/sistematizar`, { json: { clave, accion: "confirmar" } });
                                setEstados((e) => ({ ...e, [clave]: { ...e[clave], propuesta_estado: "confirmada" } }));
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "No se pudo.");
                              } finally {
                                setOcupado(null);
                              }
                            }}>Así lo queremos</button>
                            <div className="flex gap-2 items-center" style={{ flex: 1, minWidth: 260 }}>
                              <input className="campo" style={{ flex: 1 }} placeholder="O dinos qué ajustar y lo rehacemos" value={editando[`sist-${clave}`] ?? ""} onChange={(e) => setEditando((x) => ({ ...x, [`sist-${clave}`]: e.target.value }))} aria-label={`Ajuste a la propuesta de ${a.nombre}`} />
                              <button className="boton boton--secundario" disabled={ocupado === clave || !(editando[`sist-${clave}`] ?? "").trim()} onClick={async () => {
                                setOcupado(clave);
                                setError(null);
                                try {
                                  await pedir(`/api/companies/${companyId}/assets/sistematizar`, { json: { clave, comentario: (editando[`sist-${clave}`] ?? "").trim() } });
                                  setEstados((e) => ({ ...e, [clave]: { ...e[clave], propuesta_estado: "trabajando" } }));
                                  setEditando((x) => ({ ...x, [`sist-${clave}`]: "" }));
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "No se pudo.");
                                } finally {
                                  setOcupado(null);
                                }
                              }}>Rehacer</button>
                            </div>
                          </div>
                        </div>
                      )}
                      {g?.propuesta_estado === "confirmada" && g.propuesta && (
                        <details className="mt-2">
                          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--confirmado)" }}>La versión trabajada — confirmada por ti · ver documento</summary>
                          <div className="mt-2"><DocMd texto={g.propuesta} /></div>
                        </details>
                      )}
                      {estado === "construido" && (
                        <div className="mt-3 flex flex-col gap-2 p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
                          <p className="t-cuerpo" style={{ fontWeight: 500 }}>Un documento confirmado todavía no cambia nada: hay que usarlo.</p>
                          <label className="flex flex-col gap-1">
                            <span className="t-dato" style={{ color: "var(--grafito)" }}>¿Quién responde por que se use? (una persona, con nombre)</span>
                            <input className="campo" value={editando[`impl-${clave}`] ?? ""} onChange={(e) => setEditando((x) => ({ ...x, [`impl-${clave}`]: e.target.value }))} placeholder="Ej.: Marta — lo repasa con el equipo el lunes" aria-label={`Responsable de usar ${a.nombre}`} />
                          </label>
                          <button
                            className="boton"
                            style={{ alignSelf: "flex-start" }}
                            disabled={ocupado === clave || !(editando[`impl-${clave}`] ?? "").trim()}
                            onClick={async () => {
                              setOcupado(clave);
                              setError(null);
                              try {
                                await pedir(`/api/companies/${companyId}/assets`, { json: { clave, estado: "en_uso", implementacion: { responsable: (editando[`impl-${clave}`] ?? "").trim() } } });
                                setEstados((e) => ({ ...e, [clave]: { ...e[clave], estado: "en_uso", implementacion: { responsable: (editando[`impl-${clave}`] ?? "").trim(), desde: new Date().toISOString().slice(0, 10) } } }));
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "No se pudo.");
                              } finally {
                                setOcupado(null);
                              }
                            }}
                          >
                            Ponerlo en práctica
                          </button>
                        </div>
                      )}
                      {estado === "en_uso" && g?.implementacion?.responsable && (
                        <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }}>En uso desde {g.implementacion.desde ?? "hoy"} — responde {g.implementacion.responsable}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
    </MotionConfig>
  );
}

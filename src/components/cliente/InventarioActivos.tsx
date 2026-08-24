"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { BLOQUES_ACTIVOS, ESTADOS_ACTIVO } from "@/lib/activos";
import { BotonGrabar } from "@/components/voz/BotonGrabar";

type EstadoGuardado = { clave: string; estado: string; nota: string | null; borrador?: string | null; faltantes?: { pregunta: string }[] | null };

/**
 * "Veamos qué información existe hoy en tu empresa" (fases 10-12) + el CONSTRUCTOR (bloqueador 3):
 * "no lo tengo" nunca es un callejón — 8X redacta un borrador con todo lo que ya sabe, pregunta solo
 * huecos, y el dueño corrige y confirma. Lo confirmado se vuelve fuente válida.
 */
export function InventarioActivos({ companyId, guardados }: { companyId: string; guardados: EstadoGuardado[] }) {
  const [estados, setEstados] = useState<Record<string, EstadoGuardado>>(Object.fromEntries(guardados.map((g) => [g.clave, g])));
  const [bloqueAbierto, setBloqueAbierto] = useState(BLOQUES_ACTIVOS[0].clave);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [respuestas, setRespuestas] = useState<Record<string, Record<number, string>>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mientras un activo se construye, sondeamos su estado.
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
    const previo = estados[clave];
    setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado } }));
    try {
      await pedir(`/api/companies/${companyId}/assets`, { json: { clave, estado } });
    } catch (e) {
      setEstados((s) => ({ ...s, [clave]: previo }));
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };

  const construir = async (clave: string, conRespuestas = false) => {
    setError(null);
    setOcupado(clave);
    try {
      const lista = conRespuestas
        ? (estados[clave]?.faltantes ?? []).map((f, i) => ({ pregunta: f.pregunta, respuesta: (respuestas[clave]?.[i] ?? "").trim() })).filter((x) => x.respuesta)
        : [];
      await pedir(`/api/companies/${companyId}/assets/construir`, { json: { clave, respuestas: lista } });
      setEstados((e) => ({ ...e, [clave]: { ...(e[clave] ?? { clave, nota: null }), clave, estado: "construyendo" } }));
      setRespuestas((r) => ({ ...r, [clave]: {} }));
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
      setEditando((x) => {
        const y = { ...x };
        delete y[clave];
        return y;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar.");
    } finally {
      setOcupado(null);
    }
  };

  const progreso = (bloque: string) => {
    const b = BLOQUES_ACTIVOS.find((x) => x.clave === bloque)!;
    return b.activos.filter((a) => estados[`${b.clave}.${a.clave}`]?.estado).length + " de " + b.activos.length;
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {BLOQUES_ACTIVOS.map((b) => {
        const abierto = b.clave === bloqueAbierto;
        return (
          <section key={b.clave} className="panel">
            <button className="w-full p-4 flex items-center justify-between gap-3" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => setBloqueAbierto(abierto ? "" : b.clave)} aria-expanded={abierto}>
              <span>
                <span className="t-seccion" style={{ fontSize: 18 }}>{b.nombre}</span>
                <span className="block t-dato" style={{ color: "var(--grafito)" }}>{b.intro}</span>
              </span>
              <span className="t-dato" style={{ color: "var(--grafito)", flex: "none" }}>{progreso(b.clave)}</span>
            </button>
            {abierto && (
              <div className="px-4 pb-4 flex flex-col gap-5">
                {b.activos.map((a) => {
                  const clave = `${b.clave}.${a.clave}`;
                  const g = estados[clave];
                  const estado = g?.estado;
                  const construible = !!a.estructura;
                  return (
                    <div key={a.clave} style={{ borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
                      <p className="t-cuerpo" style={{ fontWeight: 500 }}>{a.nombre}{estado === "construido" && <span className="t-dato" style={{ color: "var(--confirmado)" }}> · construido contigo</span>}</p>
                      <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>{a.ayuda}</p>

                      {estado !== "construyendo" && estado !== "borrador_generado" && estado !== "construido" && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label={a.nombre}>
                          {ESTADOS_ACTIVO.map((e) => (
                            <button key={e.clave} className={`boton ${estado === e.clave ? "" : "boton--secundario"}`} style={{ minHeight: 40, fontSize: 15 }} onClick={() => marcar(clave, e.clave)}>
                              {e.nombre}
                            </button>
                          ))}
                        </div>
                      )}

                      {estado === "lo_tengo" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Perfecto: <Link href="/portal/documentos" style={{ textDecoration: "underline" }}>súbelo aquí</Link> — foto, audio o archivo, como lo tengas.
                        </p>
                      )}
                      {estado === "incompleto" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Sube lo que exista en <Link href="/portal/documentos" style={{ textDecoration: "underline" }}>documentos</Link>{construible ? " y, si quieres, lo completamos contigo:" : "; lo que falte lo completamos conversando."}
                        </p>
                      )}
                      {estado === "no_se" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Tranquilo: {a.ayuda.toLowerCase()} Si nunca lo han usado, márcalo y sigue — no es un examen.
                        </p>
                      )}
                      {(estado === "no_lo_tengo" || estado === "incompleto") && construible && (
                        <div className="mt-3">
                          {estado === "no_lo_tengo" && <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>No pasa nada — lo podemos construir contigo, con lo que ya nos contaste.</p>}
                          <button className="boton" style={{ minHeight: 40, fontSize: 15 }} disabled={ocupado === clave} onClick={() => construir(clave)}>
                            {ocupado === clave ? "Un momento…" : "Construirlo conmigo"}
                          </button>
                        </div>
                      )}
                      {estado === "no_lo_tengo" && !construible && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          No pasa nada. Cuéntanos cómo funciona eso hoy <Link href="/portal/conversacion" style={{ textDecoration: "underline" }}>conversando</Link> y quedará registrado.
                        </p>
                      )}

                      {estado === "construyendo" && (
                        <p className="t-cuerpo mt-2 aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>
                          Redactando con lo que ya sabemos de tu empresa…
                        </p>
                      )}

                      {estado === "borrador_generado" && (
                        <div className="mt-3 flex flex-col gap-3 aparece">
                          {(g?.faltantes?.length ?? 0) > 0 && (
                            <div className="panel p-4" style={{ background: "var(--suave)", border: "none" }}>
                              <p className="t-cuerpo mb-3">Para no inventar nada, cuéntanos esto:</p>
                              {(g!.faltantes ?? []).map((f, i) => (
                                <label key={i} className="flex flex-col gap-1 mb-3">
                                  <span className="t-cuerpo">{f.pregunta}</span>
                                  <textarea className="campo" rows={2} value={respuestas[clave]?.[i] ?? ""} onChange={(e) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), [i]: e.target.value } }))} aria-label={f.pregunta} />
                                </label>
                              ))}
                              <BotonGrabar grande={false} alTexto={(t) => setRespuestas((r) => ({ ...r, [clave]: { ...(r[clave] ?? {}), 0: ((r[clave]?.[0] ?? "") + " " + t).trim() } }))} />
                              <button className="boton mt-3" style={{ minHeight: 40, fontSize: 15 }} disabled={ocupado === clave} onClick={() => construir(clave, true)}>
                                Rehacer el borrador con esto
                              </button>
                            </div>
                          )}
                          {g?.borrador && (
                            <>
                              <label className="flex flex-col gap-2">
                                <span className="t-dato" style={{ color: "var(--grafito)" }}>Este es el borrador, escrito solo con lo que tu empresa mostró. Corrige lo que quieras:</span>
                                <textarea className="campo" rows={12} style={{ fontFamily: "var(--font-doc)", fontSize: 16, lineHeight: 1.55 }} value={editando[clave] ?? g.borrador} onChange={(e) => setEditando((x) => ({ ...x, [clave]: e.target.value }))} aria-label={`Borrador de ${a.nombre}`} />
                              </label>
                              <div className="flex flex-wrap gap-3">
                                <button className="boton" disabled={ocupado === clave} onClick={() => confirmar(clave)}>Está correcto</button>
                                <button className="boton boton--secundario" disabled={ocupado === clave} onClick={() => construir(clave, true)}>Rehacerlo</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

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

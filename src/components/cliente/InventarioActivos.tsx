"use client";
import { useState } from "react";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { BLOQUES_ACTIVOS, ESTADOS_ACTIVO } from "@/lib/activos";

type EstadoGuardado = { clave: string; estado: string; nota: string | null };

/**
 * "Veamos qué información existe hoy en tu empresa" (fases 10-12).
 * Un bloque a la vez; cada activo con sus cuatro respuestas. La ausencia nunca suena a condena.
 */
export function InventarioActivos({ companyId, guardados }: { companyId: string; guardados: EstadoGuardado[] }) {
  const [estados, setEstados] = useState<Record<string, string>>(Object.fromEntries(guardados.map((g) => [g.clave, g.estado])));
  const [bloqueAbierto, setBloqueAbierto] = useState(BLOQUES_ACTIVOS[0].clave);
  const [error, setError] = useState<string | null>(null);

  const marcar = async (clave: string, estado: string) => {
    setError(null);
    const previo = estados[clave];
    setEstados((e) => ({ ...e, [clave]: estado }));
    try {
      await pedir(`/api/companies/${companyId}/assets`, { json: { clave, estado } });
    } catch (e) {
      setEstados((s) => ({ ...s, [clave]: previo }));
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  };

  const progreso = (bloque: string) => {
    const b = BLOQUES_ACTIVOS.find((x) => x.clave === bloque)!;
    return b.activos.filter((a) => estados[`${b.clave}.${a.clave}`]).length + " de " + b.activos.length;
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
                  const estado = estados[clave];
                  return (
                    <div key={a.clave} style={{ borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
                      <p className="t-cuerpo" style={{ fontWeight: 500 }}>{a.nombre}</p>
                      <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>{a.ayuda}</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label={a.nombre}>
                        {ESTADOS_ACTIVO.map((e) => (
                          <button key={e.clave} className={`boton ${estado === e.clave ? "" : "boton--secundario"}`} style={{ minHeight: 40, fontSize: 15 }} onClick={() => marcar(clave, e.clave)}>
                            {e.nombre}
                          </button>
                        ))}
                      </div>
                      {estado === "lo_tengo" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Perfecto: <Link href="/portal/documentos" style={{ textDecoration: "underline" }}>súbelo aquí</Link> — foto, audio o archivo, como lo tengas.
                        </p>
                      )}
                      {estado === "incompleto" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Sube lo que exista en <Link href="/portal/documentos" style={{ textDecoration: "underline" }}>documentos</Link>; lo que falte lo completamos conversando.
                        </p>
                      )}
                      {estado === "no_lo_tengo" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          No pasa nada — muchas empresas no lo tienen escrito. Si el trabajo sale bien igual, eso también nos dice algo. Podemos ayudarte a construirlo <Link href="/portal/conversacion" style={{ textDecoration: "underline" }}>conversando</Link>.
                        </p>
                      )}
                      {estado === "no_se" && (
                        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                          Tranquilo: {a.ayuda.toLowerCase()} Si nunca lo han usado, márcalo y sigue — no es un examen.
                        </p>
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

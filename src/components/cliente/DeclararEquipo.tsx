"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

type PuestoCliente = { id: string; nombre: string; mision: string | null; persona: string | null; reporta_a: string | null; origen: string };

/**
 * "ASÍ NOS ORGANIZAMOS HOY" — el dueño declara sus puestos desde su cuenta (pedido de Kelin):
 * cómo se llama el puesto, quién lo hace, qué hace, y a quién le responde. Con esto el estudio
 * de organigrama diseña las dos opciones de estructura. Sin jerga, panel al costado, todo corregible.
 */
export function DeclararEquipo({ puestos }: { puestos: PuestoCliente[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<Partial<PuestoCliente> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(null);
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  const guardar = async (eliminar = false) => {
    if (!eliminar && !abierto?.nombre?.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await pedir("/api/portal/organigrama", {
        json: eliminar
          ? { id: abierto?.id, nombre: abierto?.nombre ?? "x", eliminar: true }
          : { id: abierto?.id, nombre: abierto!.nombre!.trim(), persona: abierto?.persona?.trim() || null, mision: abierto?.mision?.trim() || null, reporta_a: abierto?.reporta_a || null },
      });
      setAbierto(null);
      setBorrando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const propios = puestos.filter((p) => p.origen === "cliente");
  const nombreDe = (id: string | null) => puestos.find((p) => p.id === id)?.nombre ?? null;

  return (
    <section className="mb-10">
      <h2 className="t-seccion mb-2">Así nos organizamos hoy</h2>
      <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
        Cuéntanos los puestos de tu empresa: cómo se llama cada uno, quién lo hace y a quién le responde.
        Con esto diseñamos, junto a tu consultor, la organización que tu meta necesita.
      </p>
      {propios.length > 0 && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {propios.map((p) => (
            <article key={p.id} className="panel p-4" style={{ borderTop: "2.5px solid var(--marca)" }}>
              <p className="t-seccion" style={{ fontSize: 15 }}>{p.nombre}</p>
              <p className="t-dato" style={{ fontWeight: 600 }}>{p.persona || "Sin nombre aún"}</p>
              {p.mision && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{p.mision}</p>}
              <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>{nombreDe(p.reporta_a) ? `Le responde a ${nombreDe(p.reporta_a)}` : "No le responde a nadie (es la cabeza)"}</p>
              <div className="mt-2 flex gap-3">
                <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--marca)", padding: 0 }} onClick={() => setAbierto(p)}>Corregir</button>
                {borrando === p.id ? (
                  <span className="t-dato">
                    ¿Quitarlo?{" "}
                    <button type="button" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--contradicho)", textDecoration: "underline", padding: 0 }} disabled={guardando} onClick={() => { setAbierto(p); void guardar(true); }}>Sí</button>{" "}
                    <button type="button" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", padding: 0 }} onClick={() => setBorrando(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }} onClick={() => setBorrando(p.id)}>Quitar</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p className="t-cuerpo mb-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}
      <button className="boton" onClick={() => setAbierto({})}>
        {propios.length ? "Agregar otro puesto" : "Contar nuestro primer puesto"}
      </button>
      {propios.length > 0 && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Llevas {propios.length} puesto{propios.length === 1 ? "" : "s"} declarado{propios.length === 1 ? "" : "s"}. Tu consultor los revisa contigo.</p>}

      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar" onClick={() => setAbierto(null)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="Puesto de tu empresa">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-seccion">{abierto.id ? "Corregir puesto" : "Un puesto de tu empresa"}</h3>
              <button type="button" onClick={() => setAbierto(null)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">¿Cómo se llama el puesto?</span>
                <input className="campo" aria-label="Nombre del puesto" value={abierto.nombre ?? ""} onChange={(e) => setAbierto((x) => ({ ...x, nombre: e.target.value }))} placeholder="cajera, repartidor, el que hace los pedidos…" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">¿Quién lo hace hoy?</span>
                <input className="campo" aria-label="Quién lo hace" value={abierto.persona ?? ""} onChange={(e) => setAbierto((x) => ({ ...x, persona: e.target.value }))} placeholder="nombre de la persona" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">¿Qué hace, en una frase?</span>
                <textarea className="campo" rows={2} aria-label="Qué hace" value={abierto.mision ?? ""} onChange={(e) => setAbierto((x) => ({ ...x, mision: e.target.value }))} placeholder="atiende la caja y cuadra al cierre" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">¿A quién le responde?</span>
                <select className="campo" aria-label="A quién le responde" value={abierto.reporta_a ?? ""} onChange={(e) => setAbierto((x) => ({ ...x, reporta_a: e.target.value || null }))}>
                  <option value="">— a nadie (es la cabeza) —</option>
                  {puestos.filter((p) => p.id !== abierto.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.persona ? ` (${p.persona})` : ""}</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-3">
                <button className="boton" onClick={() => guardar()} disabled={guardando || !abierto.nombre?.trim()}>{guardando ? "Guardando…" : "Guardar"}</button>
                <button className="boton boton--secundario" onClick={() => setAbierto(null)} disabled={guardando}>Cancelar</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}

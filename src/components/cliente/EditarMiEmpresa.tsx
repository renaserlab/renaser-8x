"use client";
import { useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";

type Ficha = Record<string, string>;

/**
 * CORREGIR MIS DATOS: el dueño edita nombre y ficha en un panel al costado — sin páginas nuevas,
 * sin perderse. Pedido de Kelin: "imagina que me equivoqué; todo debe ser fácil de corregir".
 */
export function EditarMiEmpresa({ nombre, ficha }: { nombre: string; ficha: Ficha }) {
  const [abierto, setAbierto] = useState(false);
  const [n, setN] = useState(nombre);
  const [f, setF] = useState<Ficha>(ficha);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pon = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await pedir("/api/portal/empresa", { method: "PATCH", json: { nombre: n, ficha: f } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  };

  const subirLogo = async (file: File | null) => {
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("archivo", file);
      const r = await fetch("/api/portal/logo", { method: "POST", body: form });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? "No pudimos subir el logo.");
      setF((x) => ({ ...x, logo_url: j.url! }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir el logo.");
    } finally {
      setSubiendo(false);
    }
  };

  const campo = (etiqueta: string, k: string, placeholder = "") => (
    <label className="flex flex-col gap-1">
      <span className="t-etiqueta">{etiqueta}</span>
      <input className="campo" value={f[k] ?? ""} onChange={pon(k)} placeholder={placeholder} />
    </label>
  );

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>
        Corregir mis datos
      </button>
      {abierto && (
        <>
          <button type="button" className="telon" aria-label="Cerrar" onClick={() => setAbierto(false)} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="Corregir los datos de tu empresa">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-seccion">Corregir mis datos</h3>
              <button type="button" onClick={() => setAbierto(false)} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Nombre de tu empresa</span>
                <input className="campo" value={n} onChange={(e) => setN(e.target.value)} />
              </label>
              {/* EL LOGO: aparece en los documentos que descargas (pedido de Kelin). */}
              <div className="flex flex-col gap-2">
                <span className="t-etiqueta">Logo de tu empresa</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {f.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.logo_url} alt="Logo de tu empresa" style={{ maxHeight: 44, border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 4 }} />
                  )}
                  <label className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14, cursor: "pointer" }}>
                    {subiendo ? "Subiendo" : f.logo_url ? "Cambiar logo" : "Subir logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => subirLogo(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>Sale en tu informe y en los documentos que descargues.</span>
              </div>
              {campo("¿Qué hace tu negocio?", "actividad", "restaurante, ferretería, terapias…")}
              <div className="grid grid-cols-2 gap-3">
                {campo("Años del negocio", "antiguedad", "p. ej. 5")}
                {campo("Personas que trabajan", "personas", "p. ej. 8")}
                {campo("Ciudad", "ciudad", "p. ej. Lima")}
                {campo("Tu WhatsApp", "whatsapp", "")}
              </div>
              {campo("Lo principal que vendes", "productos", "")}
              {campo("Por dónde llegan tus clientes", "canales", "")}
              {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
              <button type="button" className="boton" disabled={guardando || n.trim().length < 2} onClick={guardar}>
                {guardando ? "Guardando" : "Guardar cambios"}
              </button>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Nada se pierde: solo se corrige lo que cambies aquí.</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

"use client";
import { useState } from "react";

export type PruebaSubida = { id: string; tipo: string; nombre?: string | null; nota?: string | null; created_at: string };

/**
 * LA PRUEBA DE QUE SE HIZO: una foto, un archivo o una nota. Usa la ruta de evidencias que ya existe
 * (/api/companies/[id]/evidencia) y devuelve la evidencia creada para que quien la pidió la enlace al
 * reporte. No marca nada como hecho: eso lo decide el flujo del plan, no la subida.
 */
export function SubirPrueba({ companyId, actionId, onSubida, onCancelar, titulo = "¿Qué se hizo?" }: { companyId: string; actionId: string; onSubida: (p: PruebaSubida) => void | Promise<void>; onCancelar?: () => void; titulo?: string }) {
  const [nota, setNota] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (file: File | null) => {
    if (!file && !nota.trim()) {
      setError("Sube una foto o un archivo, o escribe qué se hizo.");
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      if (file) form.set("archivo", file);
      form.set("action_id", actionId);
      if (nota.trim()) form.set("nota", nota.trim());
      const r = await fetch(`/api/companies/${companyId}/evidencia`, { method: "POST", body: form });
      const j = (await r.json()) as { error?: string; evidencia?: PruebaSubida };
      if (!r.ok || !j.evidencia) throw new Error(j.error ?? "No pudimos guardar la prueba.");
      await onSubida(j.evidencia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la prueba.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ borderLeft: "1px solid var(--linea)", paddingLeft: 12 }}>
      <p className="t-dato" style={{ color: "var(--grafito)" }}>Una foto de lo que quedó hecho vale más que un informe: el cuaderno lleno, el cartel puesto, la lista firmada.</p>
      <input className="campo" placeholder={`${titulo} (opcional si subes foto)`} value={nota} onChange={(e) => setNota(e.target.value)} aria-label={titulo} />
      <div className="flex gap-2 flex-wrap items-center">
        <label className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13, cursor: subiendo ? "wait" : "pointer" }}>
          {subiendo ? "Subiendo" : "Elegir foto o PDF"}
          <input type="file" accept="image/*,application/pdf" hidden disabled={subiendo} onChange={(e) => subir(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }} disabled={subiendo} onClick={() => subir(null)}>
          Guardar solo la nota
        </button>
        {onCancelar && (
          <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

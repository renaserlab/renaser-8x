"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";

export type EvidenciaFila = { id: string; tipo: string; nombre: string | null; nota: string | null; created_at: string };

/**
 * LA PRUEBA DE QUE SE HIZO. Las acciones del plan traían escrito qué evidencia haría falta pero no
 * guardaban nada, y las nueve que existían estaban todas en pendiente. Una foto del celular basta:
 * eso es lo que un dueño puede dar de verdad, y sin ella "se implementó" es una afirmación, no un
 * hecho verificado.
 */
export function Evidencia({
  companyId,
  actionId,
  pruebas,
  verificada,
  verificadaEl,
}: {
  companyId: string;
  actionId: string;
  pruebas: EvidenciaFila[];
  verificada: boolean;
  verificadaEl: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (file: File | null) => {
    if (!file && !nota.trim()) {
      setError("Sube una foto o escribe qué se hizo.");
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
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No pudimos guardar la prueba.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la prueba.");
      setSubiendo(false);
    }
  };

  const darPorHecha = async () => {
    setCerrando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/evidencia`, { method: "PATCH", json: { action_id: actionId } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cerrarla.");
      setCerrando(false);
    }
  };

  if (verificada)
    return (
      <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }}>
        Verificada con {pruebas.length} {pruebas.length === 1 ? "prueba" : "pruebas"}
        {verificadaEl ? ` el ${fechaCorta(verificadaEl)}` : ""}.
      </p>
    );

  return (
    <div className="mt-2">
      {pruebas.length > 0 && (
        <ul className="mb-2">
          {pruebas.map((p) => (
            <li key={p.id} className="t-dato" style={{ color: "var(--grafito)", padding: "2px 0" }}>
              {p.tipo === "foto" ? "Foto" : p.tipo === "archivo" ? "Archivo" : "Nota"}
              {p.nombre ? `: ${p.nombre}` : ""} · {fechaCorta(p.created_at)}
              {p.nota ? ` — ${p.nota}` : ""}
            </li>
          ))}
        </ul>
      )}

      {!abierto ? (
        <div className="flex gap-3 flex-wrap items-center">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="t-dato"
            style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--marca)", padding: 0 }}
          >
            {pruebas.length ? "Agregar otra prueba" : "Subir la prueba de que se hizo"}
          </button>
          {pruebas.length > 0 && (
            <button type="button" className="boton boton--secundario" style={{ minHeight: 32, fontSize: 13 }} disabled={cerrando} onClick={darPorHecha}>
              {cerrando ? "Cerrando" : "Darla por hecha"}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2" style={{ borderLeft: "2px solid var(--linea)", paddingLeft: 12 }}>
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            Una foto de lo que quedó hecho vale más que un informe: el cuaderno lleno, el cartel puesto, la lista firmada.
          </p>
          <input
            className="campo"
            placeholder="¿Qué se hizo? (opcional si subes foto)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            aria-label="Qué se hizo"
          />
          <div className="flex gap-2 flex-wrap items-center">
            <label className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13, cursor: subiendo ? "wait" : "pointer" }}>
              {subiendo ? "Subiendo" : "Elegir foto o PDF"}
              <input type="file" accept="image/*,application/pdf" hidden disabled={subiendo} onChange={(e) => subir(e.target.files?.[0] ?? null)} />
            </label>
            <button
              type="button"
              className="t-dato"
              style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }}
              disabled={subiendo}
              onClick={() => subir(null)}
            >
              Guardar solo la nota
            </button>
            <button
              type="button"
              className="t-dato"
              style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }}
              onClick={() => { setAbierto(false); setError(null); }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p className="t-dato mt-1" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

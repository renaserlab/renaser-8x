"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

type Ficha = { responsable: string | null; objetivo: string | null; inicio: string | null; resultado: string | null; tiempo: string | null; herramientas: string | null; sale_mal: string | null; como_bien: string | null; comentario: string | null; descripcion_original: string | null; indicador: string | null; meta: string | null; medicion_donde: string | null };
type Adjunto = { id: string; nombre: string; tipo: string; created_at: string };
type Caleta = { puesto: string | null; situacion: string | null; senal: string | null; regla_practica: string | null };

const CAMPOS: { k: keyof Ficha; etiqueta: string; placeholder: string }[] = [
  { k: "responsable", etiqueta: "Quién responde por este proceso", placeholder: "una persona, no un área" },
  { k: "objetivo", etiqueta: "Para qué existe", placeholder: "qué logra cuando sale bien" },
  { k: "inicio", etiqueta: "Qué lo inicia", placeholder: "un pedido, una llamada, una fecha…" },
  { k: "resultado", etiqueta: "Con qué termina", placeholder: "el resultado esperado" },
  { k: "tiempo", etiqueta: "Cuánto toma normalmente", placeholder: "de inicio a fin" },
  { k: "herramientas", etiqueta: "Con qué se hace", placeholder: "WhatsApp, Excel, cuaderno…" },
  { k: "sale_mal", etiqueta: "Qué suele salir mal", placeholder: "y cada cuánto pasa" },
  { k: "como_bien", etiqueta: "Cómo saben que quedó bien", placeholder: "la señal de que está correcto" },
  // Medición del proceso: el número que dice si va bien, la meta, y dónde se mira. Sin esto no se puede mejorar.
  { k: "indicador", etiqueta: "El número que dice si va bien", placeholder: "ej.: pedidos entregados a tiempo por semana" },
  { k: "meta", etiqueta: "La meta de ese número", placeholder: "ej.: 9 de cada 10 a tiempo" },
  { k: "medicion_donde", etiqueta: "Dónde se ve y quién lo mira", placeholder: "ej.: en el cuaderno de pedidos, lo revisa Marta los viernes" },
  { k: "comentario", etiqueta: "Comentario del proceso", placeholder: "cualquier cosa que haya que saber" },
];

/**
 * La ficha del proceso (bloqueador 4): lo que ya sabemos aparece lleno; la persona completa SOLO huecos.
 * Nada desaparece: lo contado originalmente queda visible; archivos y Caleta viven junto al mapa.
 */
export function FichaProceso({ processId, companyId, ficha, adjuntos, caleta }: { processId: string; companyId: string; ficha: Ficha; adjuntos: Adjunto[]; caleta: Caleta[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Ficha>(ficha);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/processes/${processId}/ficha`, { json: valores as unknown as Record<string, unknown> });
      setSucio(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.set("company_id", companyId);
        form.set("archivo", f);
        form.set("process_id", processId);
        const r = await fetch("/api/sources", { method: "POST", body: form });
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos subir ese archivo.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir ese archivo.");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };

  const vacios = CAMPOS.filter((c) => !(valores[c.k] ?? "").toString().trim());

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div className="panel p-5">
        <h2 className="t-seccion" style={{ fontSize: 18 }}>La ficha de este proceso</h2>
        {vacios.length > 0 && (
          <p className="t-dato mt-1 mb-3" style={{ color: "var(--grafito)" }}>
            Lo que ya nos contaste está lleno. {vacios.length === CAMPOS.length ? "Completa lo que sepas —" : `Faltan ${vacios.length} —`} con una frase basta.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 mt-3">
          {CAMPOS.map((c) => (
            <label key={c.k} className="flex flex-col gap-1">
              <span className="t-etiqueta">{c.etiqueta}</span>
              <input className="campo" value={(valores[c.k] as string) ?? ""} placeholder={c.placeholder} onChange={(e) => { setValores((v) => ({ ...v, [c.k]: e.target.value })); setSucio(true); }} />
            </label>
          ))}
        </div>
        {sucio && (
          <button className="boton mt-4" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando" : "Guardar ficha"}
          </button>
        )}
        {error && <p className="t-cuerpo mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      </div>

      <div className="panel p-5">
        <h2 className="t-seccion" style={{ fontSize: 18 }}>Archivos de este proceso</h2>
        <p className="t-dato mt-1 mb-3" style={{ color: "var(--grafito)" }}>Manual, checklist, plantilla, foto, audio o cualquier documento que se use aquí.</p>
        {adjuntos.length > 0 && (
          <ul className="flex flex-col mb-3">
            {adjuntos.map((a) => (
              <li key={a.id} className="py-2 flex justify-between gap-2" style={{ borderBottom: "1px solid var(--linea)" }}>
                <span className="t-cuerpo">{a.nombre}</span>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>{a.tipo}</span>
              </li>
            ))}
          </ul>
        )}
        <input ref={input} type="file" multiple style={{ display: "none" }} aria-label="Adjuntar archivo al proceso" onChange={(e) => subir(e.target.files)} />
        <button className="boton boton--secundario" disabled={subiendo} onClick={() => input.current?.click()}>
          {subiendo ? "Subiendo…" : "Adjuntar archivo"}
        </button>
      </div>

      {caleta.length > 0 && (
        <div className="panel p-5">
          <h2 className="t-seccion" style={{ fontSize: 18 }}>La Caleta de este proceso</h2>
          <p className="t-dato mt-1 mb-3" style={{ color: "var(--grafito)" }}>Lo que alguien sabe hacer o detectar aquí y no estaba escrito.</p>
          <ul className="flex flex-col gap-2">
            {caleta.map((k, i) => (
              <li key={i} className="t-cuerpo">
                <span style={{ color: "var(--grafito)" }}>{k.puesto ?? "Alguien del equipo"}: </span>
                {k.situacion ?? k.regla_practica}{k.senal ? ` · la señal: ${k.senal}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ficha.descripcion_original && (
        <details className="panel p-5">
          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)" }}>Lo que contaste originalmente (se conserva siempre)</summary>
          <p className="t-doc mt-3" style={{ whiteSpace: "pre-wrap" }}>{ficha.descripcion_original}</p>
        </details>
      )}
    </section>
  );
}

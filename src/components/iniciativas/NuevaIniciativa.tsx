"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { DOMINIO_MERCADO, MIN_LETRAS, type DefDominio } from "@/lib/iniciativas";

/**
 * PROPONER UNA INICIATIVA en un tema. Pide lo mínimo para que sea una apuesta y no un título: qué se cree
 * que va a pasar y cómo se sabrá si funcionó. Lo demás (evidencia, recursos, plazo, criterios y
 * responsable) se completa en la ficha y se exige antes de aprobar. Si es de mercado y competencia, hay
 * que dejar dicho qué queda pendiente de investigar: aquí no se inventa mercado ni competidores.
 * Nace como propuesta; el dueño no la ve hasta que se apruebe.
 */
export function NuevaIniciativa({ companyId, dominio, onCreada, onCancelar }: {
  companyId: string;
  dominio: DefDominio;
  onCreada: (id: string) => void;
  onCancelar: () => void;
}) {
  const esMercado = dominio.clave === DOMINIO_MERCADO;
  const [titulo, setTitulo] = useState("");
  const [hipotesis, setHipotesis] = useState("");
  const [medida, setMedida] = useState("");
  const [pendiente, setPendiente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = titulo.trim().length >= 3 && hipotesis.trim().length >= MIN_LETRAS && medida.trim().length >= MIN_LETRAS && (!esMercado || pendiente.trim().length >= MIN_LETRAS);

  const proponer = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await pedir<{ iniciativa: { id: string } }>(`/api/companies/${companyId}/iniciativas`, {
        json: { dominio: dominio.clave, titulo, hipotesis, medida_exito: medida, pendiente_investigacion: esMercado ? pendiente : undefined },
      });
      onCreada(r.iniciativa.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo proponer.");
      setEnviando(false);
    }
  };

  return (
    <div className="panel p-4 flex flex-col gap-2" style={{ background: "var(--suave)" }}>
      <p className="t-etiqueta">Proponer una iniciativa en «{dominio.nombre}»</p>
      <input className="campo" aria-label="Título" placeholder="Título: qué se va a probar, en pocas palabras" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <textarea className="campo" rows={2} aria-label="Hipótesis" placeholder="Hipótesis: qué creemos que va a pasar y por qué" value={hipotesis} onChange={(e) => setHipotesis(e.target.value)} />
      <textarea className="campo" rows={2} aria-label="Medida de éxito" placeholder="Medida de éxito: cómo sabremos que funcionó" value={medida} onChange={(e) => setMedida(e.target.value)} />
      {esMercado && (
        <>
          <textarea className="campo" rows={2} aria-label="Pendiente de investigar" placeholder="Qué queda pendiente de investigar" value={pendiente} onChange={(e) => setPendiente(e.target.value)} />
          <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 12 }}>
            Es de mercado y competencia: deja dicho qué no se pudo investigar. Si alguien aportó una fuente (una lista de precios, una conversación, un registro), la registras en la ficha con quién la aportó, de cuándo es y qué dice. No se escribe lo que se supone.
          </p>
        </>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={!listo || enviando} onClick={proponer}>
          {enviando ? "Guardando" : "Proponer"}
        </button>
        <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

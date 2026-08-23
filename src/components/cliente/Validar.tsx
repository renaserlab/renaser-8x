"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { BotonEscuchar } from "@/components/voz/BotonEscuchar";
import { fechaMes } from "@/lib/textos";

export type PorValidar = { id: string; texto: string; fuente: string; fecha: string | null; contradiccion?: { texto: string; fuente: string } | null };

/** La pantalla de validación: una a la vez, tres botones grandes. Capítulo 19.5. */
export function Validar({ items }: { items: PorValidar[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [seguimiento, setSeguimiento] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actual = items[i];

  if (!actual)
    return (
      <div className="panel p-6 aparece">
        <p className="t-seccion">Listo. No hay nada más que confirmar por ahora.</p>
        <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>Si encontramos algo nuevo, te lo mostramos aquí.</p>
      </div>
    );

  const responder = async (respuesta: "si" | "ya_no" | "nunca") => {
    setError(null);
    if (respuesta !== "si" && seguimiento === null) {
      setSeguimiento(respuesta);
      return;
    }
    try {
      await pedir(`/api/claims/${actual.id}/validate`, { json: { respuesta: seguimiento ?? respuesta, seguimiento: texto || undefined } });
      setSeguimiento(null);
      setTexto("");
      setI(i + 1);
      if (i + 1 >= items.length) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo.");
    }
  };

  const lectura = `Esto encontramos en ${actual.fuente}${actual.fecha ? `, de ${fechaMes(actual.fecha)}` : ""}: ${actual.texto}`;

  return (
    <div className="flex flex-col gap-6 aparece" key={actual.id}>
      <div className="flex justify-between items-center">
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{i + 1} de {items.length}</span>
        <BotonEscuchar texto={lectura} />
      </div>
      <p className="t-cuerpo">
        <strong>Esto encontramos en {actual.fuente}{actual.fecha ? `, de ${fechaMes(actual.fecha)}` : ""}:</strong>
      </p>
      <blockquote className="t-doc" style={{ fontSize: 24, lineHeight: 1.35, borderLeft: "3px solid var(--marca)", paddingLeft: 16 }}>“{actual.texto}”</blockquote>
      {actual.contradiccion && (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
          Pero en {actual.contradiccion.fuente} dice otra cosa: “{actual.contradiccion.texto}”. ¿Cuál refleja la dirección actual?
        </p>
      )}

      {seguimiento === null ? (
        <div className="flex flex-col gap-3">
          <button className="boton boton--grande" onClick={() => responder("si")} style={{ background: "var(--confirmado)", borderColor: "var(--confirmado)" }}>Sigue siendo verdad</button>
          <button className="boton boton--grande boton--secundario" onClick={() => responder("ya_no")}>Ya no</button>
          <button className="boton boton--grande boton--secundario" onClick={() => responder("nunca")}>Nunca fue así</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="t-seccion">{seguimiento === "ya_no" ? "¿Qué cambió?" : "¿Cómo es en realidad?"}</p>
          <BotonGrabar alTexto={(t) => setTexto((p) => (p ? p + " " + t : t))} />
          <textarea className="campo" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Tu respuesta" />
          <div className="flex gap-3">
            <button className="boton boton--grande" onClick={() => responder(seguimiento as "ya_no")}>Guardar</button>
          </div>
          <button className="t-dato underline" style={{ color: "var(--grafito)", background: "none", border: 0, textAlign: "left" }} onClick={() => responder(seguimiento as "ya_no")}>Prefiero no explicar ahora</button>
        </div>
      )}
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

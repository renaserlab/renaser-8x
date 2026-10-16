"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { MODELO, MODELOS_NEGOCIO, type ModeloNegocio } from "@/lib/negocio";
import { mensajeDe } from "./dato";

/**
 * «¿CÓMO GANA DINERO TU NEGOCIO?» Antes de la tabla de lo que vende, porque las preguntas cambian: a quien vende
 * casos no se le pregunta como a quien fabrica pantalones. Se elige uno o dos. El dueño lo elige solo si nadie lo
 * eligió antes (si cambió, se lo dice a su consultora).
 */
export function ElegirModelo({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<ModeloNegocio[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (m: ModeloNegocio) =>
    setElegidos((x) => (x.includes(m) ? x.filter((y) => y !== m) : x.length >= 2 ? [x[1]!, m] : [...x, m]));

  const seguir = async () => {
    if (!elegidos.length) {
      setError("Elige al menos uno.");
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/negocio`, { method: "PATCH", json: { bloque: "modelo_negocio", datos: elegidos } });
      router.refresh();
    } catch (e) {
      setError(mensajeDe(e));
      setTrabajando(false);
    }
  };

  return (
    <section className="panel p-5 medida flex flex-col gap-4" aria-labelledby="elegir-modelo">
      <div>
        <h2 id="elegir-modelo" className="t-seccion">¿Cómo gana dinero tu negocio?</h2>
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Elige uno. Si haces dos cosas distintas, elige las dos.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Cómo gana dinero tu negocio">
        {MODELOS_NEGOCIO.map((m) => {
          const si = elegidos.includes(m);
          return (
            <button key={m} type="button" className={si ? "boton" : "boton boton--secundario"} style={{ justifyContent: "flex-start" }} aria-pressed={si} onClick={() => alternar(m)}>
              {MODELO[m].paraDueno}
            </button>
          );
        })}
      </div>
      <div>
        <button type="button" className="boton" disabled={trabajando} onClick={() => void seguir()}>
          {trabajando ? "Guardando…" : "Seguir"}
        </button>
      </div>
      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

"use client";
import { useState } from "react";
import { MIN_LETRAS_MOTIVO, letrasDe, motivoSuficiente } from "@/lib/kpis";

/**
 * POR QUÉ NO SE VA A VIGILAR UN INDICADOR. Nadie archiva un número sin decir por qué: el botón no se
 * enciende hasta que el motivo tiene al menos ocho letras, y el servidor lo vuelve a exigir. La caja nace
 * vacía: aquí no va ningún ejemplo, lo que se escribe es de quien lo escribe.
 */
export function MotivoArchivo({
  nombre, trabajando, alConfirmar, alCancelar,
}: {
  nombre: string;
  trabajando: boolean;
  alConfirmar: (motivo: string) => void;
  alCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const faltan = Math.max(0, MIN_LETRAS_MOTIVO - letrasDe(motivo));

  return (
    <div className="panel p-3 mt-3" style={{ background: "var(--suave)" }}>
      <label className="flex flex-col gap-1">
        <span className="t-dato" style={{ fontWeight: 600 }}>¿Por qué no te sirve «{nombre}»?</span>
        <textarea
          className="campo" rows={2} maxLength={400} autoFocus
          value={motivo} onChange={(e) => setMotivo(e.target.value)}
          aria-label={`Motivo para no vigilar ${nombre}`}
        />
      </label>
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
        Dilo en una frase: queda anotado junto a tu decisión.{faltan > 0 ? ` ${faltan === 1 ? "Falta 1 letra" : `Faltan ${faltan} letras`}.` : ""}
      </p>
      <div className="flex gap-2 mt-2 flex-wrap items-center">
        <button
          type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }}
          disabled={trabajando || !motivoSuficiente(motivo)}
          onClick={() => alConfirmar(motivo.trim())}
        >
          {trabajando ? "Guardando" : "No vigilarlo"}
        </button>
        <button type="button" className="t-dato" disabled={trabajando} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

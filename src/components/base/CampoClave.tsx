"use client";
import { useState } from "react";

/** Campo de contraseña con "Mostrar/Ocultar" — sin íconos: texto claro, como todo lo demás. */
export function CampoClave({ value, onChange, autoComplete, minLength }: { value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="campo"
        style={{ width: "100%", paddingRight: 86 }}
        aria-label="Contraseña"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="t-dato"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", fontWeight: 600, padding: "4px 2px", font: "inherit", fontSize: 13 }}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}

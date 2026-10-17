"use client";
import { ESTADO_DATO_TEXTO, type EstadoDato as Estado } from "@/lib/dato-oral";
import type { Modo } from "./dato";

/**
 * CÓMO SE SABE UN NÚMERO. El dueño elige entre «Lo calculo a ojo» y «Lo tengo anotado o lo conté»; «Comprobado con
 * un documento» solo lo pone la consultora (si el dueño tiene el papel, lo sube y ella lo marca). A un dueño que mira
 * un dato ya comprobado se le muestra así, sin poder cambiarlo.
 */
export function EstadoDato({ estado, modo, alCambiar, etiqueta, deshabilitado = false }: { estado: Estado; modo: Modo; alCambiar: (e: Estado) => void; etiqueta: string; deshabilitado?: boolean }) {
  if (estado === "no_lo_se") return null;
  const bloqueado = deshabilitado || (modo === "dueno" && estado === "comprobado");
  const opciones: Estado[] = modo === "consultora" || estado === "comprobado" ? ["estimado", "contado", "comprobado"] : ["estimado", "contado"];
  return (
    <select
      aria-label={`Cómo lo sabes: ${etiqueta}`}
      className="campo campo--auto"
      value={estado}
      disabled={bloqueado}
      onChange={(e) => alCambiar(e.target.value as Estado)}
    >
      {opciones.map((o) => (
        <option key={o} value={o} disabled={modo === "dueno" && o === "comprobado"}>
          {ESTADO_DATO_TEXTO[o]}
        </option>
      ))}
    </select>
  );
}

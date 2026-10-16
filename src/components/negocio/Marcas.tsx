import type { EstadoDato } from "@/lib/dato-oral";
import { ESTADO_CLASE, ESTADO_CORTO } from "./dato";

/**
 * Piezas de lectura que comparten el dueño y la consultora: el chip del estado de un dato y el «sin dato» rayado.
 * Sin estado ni efectos: sirven igual en un componente de servidor y en uno de cliente.
 */

/** El estado de un dato en una palabra («a ojo», «anotado», «comprobado»). Sin estado, nada. */
export function ChipEstado({ estado }: { estado: EstadoDato | null | undefined }) {
  if (!estado) return null;
  return (
    <span className={`estado ${ESTADO_CLASE[estado]}`} title={`Cómo se sabe: ${ESTADO_CORTO[estado]}`}>
      {ESTADO_CORTO[estado]}
    </span>
  );
}

/** Lo que falta se dibuja rayado y se nombra: nunca un cero. */
export function SinDato({ texto = "sin dato" }: { texto?: string }) {
  return <span className="sin-dato">{texto}</span>;
}

/** Un aviso de guardado o de error, debajo de lo que se guardó. Se lee en voz alta para quien usa lector de pantalla. */
export function AvisoGuardado({ estado }: { estado: { tipo: "ok" | "error"; texto: string } | null }) {
  if (!estado) return null;
  return (
    <p className="t-dato mt-2" role={estado.tipo === "error" ? "alert" : "status"} style={{ color: estado.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>
      {estado.texto}
    </p>
  );
}

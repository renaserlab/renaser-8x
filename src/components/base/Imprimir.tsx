"use client";

export function Imprimir({ texto = "Imprimir / PDF" }: { texto?: string }) {
  return (
    <button className="boton boton--secundario boton--chico no-imprimir" onClick={() => window.print()}>
      {texto}
    </button>
  );
}

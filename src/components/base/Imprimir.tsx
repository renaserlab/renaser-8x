"use client";

export function Imprimir({ texto = "Imprimir / PDF" }: { texto?: string }) {
  return (
    <button className="boton boton--secundario no-imprimir" style={{ minHeight: 36 }} onClick={() => window.print()}>
      {texto}
    </button>
  );
}

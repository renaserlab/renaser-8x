"use client";

/** Un solo botón: el navegador imprime o guarda como PDF — sin librerías, sin servidores. */
export function BotonImprimir({ texto = "Imprimir / Guardar PDF" }: { texto?: string }) {
  return (
    <button className="boton no-imprimir" onClick={() => window.print()}>
      {texto}
    </button>
  );
}

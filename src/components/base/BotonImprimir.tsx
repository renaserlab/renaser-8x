"use client";

/** Imprime la página (los elementos .no-imprimir quedan fuera). Para SOPs y documentos pegables en la pared. */
export function BotonImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return (
    <button className="boton boton--secundario no-imprimir" style={{ minHeight: 40 }} onClick={() => window.print()}>
      {texto}
    </button>
  );
}

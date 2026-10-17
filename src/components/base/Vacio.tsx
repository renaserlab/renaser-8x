import Link from "next/link";

/**
 * Una pantalla vacía es una invitación a actuar. Capítulo 20. Noche y perla (17-10-2026): un pozo perla dentro de la
 * hoja (blanco con su sombra si cae sobre el lienzo), el texto en grafito y la acción como botón claro. Llega quieto:
 * no es algo que la persona hizo aparecer. El estilo vive en src/design/portal.css (.vacio).
 */
export function Vacio({ texto, accion, href, children }: { texto: string; accion?: string; href?: string; children?: React.ReactNode }) {
  return (
    <div className="vacio">
      <p className="vacio__texto">{texto}</p>
      {accion && href && (
        <Link href={href} className="boton boton--secundario">
          {accion}
        </Link>
      )}
      {children}
    </div>
  );
}

export function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="t-etiqueta">{children}</span>;
}

export function Encabezado({ titulo, sub, acciones }: { titulo: string; sub?: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <header className="encabezado">
      <div className="encabezado__texto">
        <h1 className="t-titulo">{titulo}</h1>
        {sub && <p className="encabezado__sub">{sub}</p>}
      </div>
      {acciones && <div className="encabezado__acciones no-imprimir">{acciones}</div>}
    </header>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="dato">
      <div className="t-rotulo">{etiqueta}</div>
      <div className="t-dato">{valor}</div>
    </div>
  );
}

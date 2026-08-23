import Link from "next/link";

/** Una pantalla vacía es una invitación a actuar. Capítulo 20. */
export function Vacio({ texto, accion, href, children }: { texto: string; accion?: string; href?: string; children?: React.ReactNode }) {
  return (
    <div className="panel medida p-6 aparece" style={{ background: "var(--suave)" }}>
      <p className="t-cuerpo">{texto}</p>
      {accion && href && (
        <Link href={href} className="boton boton--secundario mt-4">
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
    <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="t-titulo">{titulo}</h1>
        {sub && <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>{sub}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-3 no-imprimir">{acciones}</div>}
    </header>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="t-etiqueta">{etiqueta}</div>
      <div className="t-dato mt-1">{valor}</div>
    </div>
  );
}

import React from "react";

/**
 * Presenta un documento (markdown sencillo del constructor) como DOCUMENTO, no como texto crudo.
 * Queja real: el cliente veía "##" y "**" en pantalla. Sin librerías: títulos, listas y negritas. La letra es la de
 * los documentos; el estilo vive en src/design/portal.css (.doc-md).
 */
function conNegritas(s: string): React.ReactNode[] {
  return s.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte));
}

export function DocMd({ texto }: { texto: string }) {
  const bloques: React.ReactNode[] = [];
  let lista: string[] = [];
  const cerrarLista = (k: string) => {
    if (!lista.length) return;
    bloques.push(
      <ul key={k} className="doc-md__lista">
        {lista.map((li, i) => (
          <li key={i}>{conNegritas(li)}</li>
        ))}
      </ul>
    );
    lista = [];
  };
  const lineas = texto.split(/\r?\n/);
  lineas.forEach((cruda, i) => {
    const l = cruda.trim();
    if (/^[-*]\s+/.test(l)) {
      lista.push(l.replace(/^[-*]\s+/, ""));
      return;
    }
    cerrarLista("l" + i);
    if (!l || /^-{3,}$/.test(l)) return;
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const nivel = h[1].length;
      bloques.push(
        <p key={i} className={nivel <= 2 ? "doc-md__titulo" : "doc-md__subtitulo"}>
          {conNegritas(h[2])}
        </p>
      );
      return;
    }
    bloques.push(
      <p key={i} className="doc-md__parrafo">
        {conNegritas(l)}
      </p>
    );
  });
  cerrarLista("fin");
  return <div className="t-doc doc-md">{bloques}</div>;
}

import React from "react";

/**
 * Presenta un documento (markdown sencillo del constructor) como DOCUMENTO, no como texto crudo.
 * Queja real: el cliente veía "##" y "**" en pantalla. Sin librerías: títulos, listas y negritas.
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
      <ul key={k} style={{ paddingLeft: 20, margin: "6px 0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
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
        <p key={i} style={{ fontWeight: 600, fontSize: nivel <= 2 ? 19 : 17, margin: "16px 0 6px" }}>
          {conNegritas(h[2])}
        </p>
      );
      return;
    }
    bloques.push(
      <p key={i} style={{ margin: "0 0 10px" }}>
        {conNegritas(l)}
      </p>
    );
  });
  cerrarLista("fin");
  return <div className="t-doc" style={{ fontSize: 16.5, lineHeight: 1.6 }}>{bloques}</div>;
}

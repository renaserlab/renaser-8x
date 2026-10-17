import { useId } from "react";

/**
 * EL 8X (17-10-2026). Mientras no llegue el archivo oficial, el logo se dibuja aquí: un 8 de un solo trazo que se abre
 * en la X, con grosor de pluma de punta ancha (el trazo se repite a lo largo de la punta: ancho donde baja, fino donde
 * sube). «luz» va sobre azul noche (cinta fría que se calienta en el cruce); «tinta» va sobre perla y toma el color del
 * texto. Para usar el archivo oficial se cambia solo este componente: la firma queda igual.
 * Los degradados de abajo son el dibujo del logo, no estilo de la app (los del estilo viven en src/design).
 */
export const GEOMETRIA_8X = {
  trazo8:
    "M132 8C110 24 84 50 62 72C52 82 44 96 32 98C19 99 11 90 12 78C13 65 25 55 35 48C44 42 51 33 49 21C47 11 40 8 34 8C27 8 22 14 23 22C24 31 32 38 39 44C47 51 55 58 57 66",
  trazoX: "M50 10C54 5 60 4 64 9C76 24 88 44 100 62C110 77 118 90 128 95C134 98 140 96 145 91",
  caja: { x: 2, y: 0, ancho: 150, alto: 106 },
  /** La pluma: largo de la punta (más largo = cinta más ancha) y su ángulo en grados. */
  punta: { largo: 10, angulo: 22 },
  /** La cinta «luz»: de azul plata a champán en el cruce y de vuelta a perla. */
  cinta: [
    [0, "#7f9cc7"],
    [0.32, "#c9d6ea"],
    [0.52, "#f7e8c4"],
    [0.62, "#fff6e2"],
    [0.78, "#d9e1ee"],
    [1, "#9fb4d4"],
  ] as const,
} as const;

export const LEMA_8X = "Propósito · Creación · Escala";

/** Dónde va cada copia del trazo a lo largo de la punta de la pluma. */
export function pasosPluma(copias: number): [number, number][] {
  const { largo, angulo } = GEOMETRIA_8X.punta;
  const a = (angulo * Math.PI) / 180;
  return Array.from({ length: copias }, (_, i) => {
    const t = i / (copias - 1) - 0.5;
    return [Number((t * largo * Math.cos(a)).toFixed(2)), Number((-t * largo * Math.sin(a)).toFixed(2))];
  });
}

/** Grosor de cada copia en unidades del dibujo: la línea más fina nunca baja de 1 px en pantalla. */
export const grosorPelo = (alto: number) => Math.max(1.3, GEOMETRIA_8X.caja.alto / alto);

export function Logo8X({
  variante = "tinta",
  alto = 32,
  lema = false,
  decorativo = false,
  className,
}: {
  variante?: "luz" | "tinta";
  /** Alto en px del dibujo, sin el lema. El CSS puede cambiarlo (height del svg); el grosor se calcula con este. */
  alto?: number;
  /** Debajo, «PROPÓSITO · CREACIÓN · ESCALA» en mayúsculas espaciadas (las pone el CSS). */
  lema?: boolean;
  /** true cuando el enlace o el texto de al lado ya dicen «8X». */
  decorativo?: boolean;
  className?: string;
}) {
  // Un id propio por instancia: la marca se pinta dos veces (barra y franja del celular) y una de las dos está oculta;
  // un degradado dentro de un SVG con display:none no pinta en Chrome si otro lo referencia por el mismo id.
  const id = "l8x" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { caja, cinta, trazo8, trazoX } = GEOMETRIA_8X;
  const luz = variante === "luz";
  const pasos = pasosPluma(alto < 28 ? 10 : 16);
  return (
    <span className={`logo8x logo8x--${variante}${className ? ` ${className}` : ""}`}>
      <svg
        viewBox={`${caja.x} ${caja.y} ${caja.ancho} ${caja.alto}`}
        height={alto}
        width={Math.round((alto * caja.ancho) / caja.alto)}
        role={decorativo ? undefined : "img"}
        aria-label={decorativo ? undefined : "8X"}
        aria-hidden={decorativo || undefined}
        focusable="false"
      >
        <defs>
          {luz && (
            <>
              <linearGradient id={`${id}-cinta`} gradientUnits="userSpaceOnUse" x1="10" y1="30" x2="150" y2="70">
                {cinta.map(([o, c]) => (
                  <stop key={o} offset={o} stopColor={c} />
                ))}
              </linearGradient>
              <radialGradient
                id={`${id}-halo`}
                gradientUnits="userSpaceOnUse"
                cx="88"
                cy="48"
                r="46"
                gradientTransform="translate(88 48) scale(1.25 0.85) translate(-88 -48)"
              >
                <stop offset="0" stopColor="#f1d9a4" stopOpacity="0.42" />
                <stop offset="0.45" stopColor="#d8bd86" stopOpacity="0.16" />
                <stop offset="1" stopColor="#d8bd86" stopOpacity="0" />
              </radialGradient>
            </>
          )}
          <path id={`${id}-8`} d={trazo8} />
          <path id={`${id}-x`} d={trazoX} />
        </defs>
        {luz && alto >= 28 && (
          <rect className="logo8x__halo" x={caja.x} y={caja.y} width={caja.ancho} height={caja.alto} fill={`url(#${id}-halo)`} />
        )}
        <g
          className="logo8x__trazo"
          fill="none"
          stroke={luz ? `url(#${id}-cinta)` : "currentColor"}
          strokeWidth={grosorPelo(alto)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {pasos.map(([x, y], i) => (
            <g key={i}>
              <use href={`#${id}-8`} x={x} y={y} />
              <use href={`#${id}-x`} x={x} y={y} />
            </g>
          ))}
        </g>
      </svg>
      {lema && <span className="logo8x__lema">{LEMA_8X}</span>}
    </span>
  );
}

/**
 * El 8X «luz» para los íconos de app (src/app/icon.tsx y apple-icon.tsx). ImageResponse no ejecuta hooks y su
 * dibujante no resuelve <use>: aquí cada copia de la pluma es un <path> con su desplazamiento, con ids fijos (cada
 * ícono es su propia imagen). Misma geometría, mismo degradado de la cinta y el mismo halo que el componente.
 */
export function Logo8XImagen({ ancho }: { ancho: number }) {
  const { caja, cinta, trazo8, trazoX } = GEOMETRIA_8X;
  const alto = Math.round((ancho * caja.alto) / caja.ancho);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={ancho} height={alto} viewBox={`${caja.x} ${caja.y} ${caja.ancho} ${caja.alto}`}>
      <defs>
        <linearGradient id="cinta" gradientUnits="userSpaceOnUse" x1="10" y1="30" x2="150" y2="70">
          {cinta.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="88" cy="48" r="46" gradientTransform="translate(88 48) scale(1.25 0.85) translate(-88 -48)">
          <stop offset="0" stopColor="#f1d9a4" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#d8bd86" stopOpacity="0.16" />
          <stop offset="1" stopColor="#d8bd86" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={caja.x} y={caja.y} width={caja.ancho} height={caja.alto} fill="url(#halo)" />
      <g fill="none" stroke="url(#cinta)" strokeWidth={grosorPelo(alto)} strokeLinecap="round" strokeLinejoin="round">
        {pasosPluma(16).map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d={trazo8} />
            <path d={trazoX} />
          </g>
        ))}
      </g>
    </svg>
  );
}

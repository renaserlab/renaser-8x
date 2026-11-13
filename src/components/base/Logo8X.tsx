import { useId } from "react";
import { TRAZO_8X } from "./logo-8x-trazo";

/**
 * EL 8X. El logo es el que Kelin entregó: un monograma de una sola cinta, donde el 8 se tuerce y sigue hacia la X,
 * con los dos brazos acabados en punta. El contorno está calcado de su imagen y vive en ./logo-8x-trazo.ts; aquí
 * solo se decide cómo se pinta.
 *
 * DOS VARIANTES. «luz» va sobre azul noche: la cinta fría de plata que se calienta a champán en el cruce de la X,
 * igual que en la imagen. «tinta» va sobre perla y toma el color del texto (`currentColor`), que es como aparece en
 * la tarjeta, en la camiseta y en el letrero del moodboard.
 *
 * POR QUÉ ENGORDA EN CHICO. La cinta tiene partes de un pelo —donde se tuerce y se pone de canto— y por debajo de
 * unos 56 px esas partes caen por debajo del píxel y el trazo se corta: el 8 se abre y la X pierde un brazo. En vez
 * de dibujar otro logo para los tamaños chicos, se le suma al contorno un filo del mismo color, de medio píxel
 * escaso, que sostiene el pelo sin engordar lo grueso. Es lo que hace una fuente con su talla óptica.
 */

/** La cinta de «luz»: plata azulada que se calienta en el cruce y vuelve a enfriarse. Sale de la imagen del logo. */
export const CINTA_8X = [
  [0, "#7f9cc7"],
  [0.32, "#c9d6ea"],
  [0.52, "#f7e8c4"],
  [0.62, "#fff6e2"],
  [0.78, "#d9e1ee"],
  [1, "#9fb4d4"],
] as const;

export const LEMA_8X = "Propósito · Creación · Escala";

/** Desde este alto en px el contorno se pinta tal cual; por debajo se le suma el filo que sostiene el pelo. */
const SIN_FILO = 56;
/** Lo más que engorda, en px de pantalla repartidos entre los dos lados del contorno. */
const FILO_MAX = 1.1;

/** El filo, en unidades del dibujo (la caja mide 1000 de alto). 0 cuando el logo es grande. */
export function filoDelPelo(alto: number): number {
  if (alto >= SIN_FILO) return 0;
  const px = Math.min(FILO_MAX, (SIN_FILO - alto) / 30);
  return Number(((px * TRAZO_8X.alto) / alto).toFixed(1));
}

export function Logo8X({
  variante = "tinta",
  alto = 32,
  lema = false,
  decorativo = false,
  className,
}: {
  variante?: "luz" | "tinta";
  /** Alto del monograma en px, sin contar el lema. */
  alto?: number;
  /** Debajo, «PROPÓSITO · CREACIÓN · ESCALA» en mayúsculas espaciadas (las pone el CSS). */
  lema?: boolean;
  /** true cuando el enlace o el texto de al lado ya dicen «8X». */
  decorativo?: boolean;
  className?: string;
}) {
  // Un id propio por instancia: la marca se pinta dos veces (barra y franja del celular) y una de las dos está
  // oculta; un degradado dentro de un SVG con display:none no pinta en Chrome si otro lo referencia por el mismo id.
  const id = "l8x" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const luz = variante === "luz";
  const pintura = luz ? `url(#${id}-cinta)` : "currentColor";
  const filo = filoDelPelo(alto);
  return (
    <span className={`logo8x logo8x--${variante}${className ? ` ${className}` : ""}`}>
      <svg
        viewBox={`0 0 ${TRAZO_8X.ancho} ${TRAZO_8X.alto}`}
        height={alto}
        width={Math.round((alto * TRAZO_8X.ancho) / TRAZO_8X.alto)}
        role={decorativo ? undefined : "img"}
        aria-label={decorativo ? undefined : "8X"}
        aria-hidden={decorativo || undefined}
        focusable="false"
      >
        {luz && (
          <defs>
            {/* El degradado corre por la diagonal del monograma, así la parte cálida cae en el cruce de la X. */}
            <linearGradient id={`${id}-cinta`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={TRAZO_8X.ancho} y2={TRAZO_8X.alto}>
              {CINTA_8X.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
        )}
        {/* Tres contornos en un solo camino —el de fuera y los dos ojos del 8—: sin evenodd, los ojos se rellenan. */}
        <path
          className="logo8x__cinta"
          d={TRAZO_8X.d}
          fill={pintura}
          fillRule="evenodd"
          {...(filo ? { stroke: pintura, strokeWidth: filo, strokeLinejoin: "round" as const } : {})}
        />
      </svg>
      {lema && <span className="logo8x__lema">{LEMA_8X}</span>}
    </span>
  );
}

/**
 * EL MISMO MONOGRAMA PARA EL ÍCONO DE LA APP (src/app/icon.tsx y apple-icon.tsx). ImageResponse compone la imagen
 * sin navegador: no hay React en el cliente ni useId, así que el degradado lleva un id fijo. Antes aquí había una
 * geometría aparte, dibujada a mano, que no se parecía al logo; ya no hace falta: es el mismo contorno calcado.
 */
export function Logo8XImagen({ ancho }: { ancho: number }) {
  const alto = Math.round((ancho * TRAZO_8X.alto) / TRAZO_8X.ancho);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={ancho} height={alto} viewBox={`0 0 ${TRAZO_8X.ancho} ${TRAZO_8X.alto}`}>
      <defs>
        <linearGradient id="cinta8x" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={TRAZO_8X.ancho} y2={TRAZO_8X.alto}>
          {CINTA_8X.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <path d={TRAZO_8X.d} fill="url(#cinta8x)" fillRule="evenodd" />
    </svg>
  );
}

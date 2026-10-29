import { useId } from "react";

/**
 * EL 8X, ESCRITO CON SU PROPIA LETRA.
 *
 * POR QUÉ SE VUELVE A HACER (29-10-2026). Hasta hoy el 8 y la X estaban DIBUJADOS a mano, camino por camino. El 8
 * pasaba; la X no: dos husos terminados en punta no son una letra, son un destello. Kelin lo dijo mirando la pantalla
 * de entrar —«mira el logo, las letras»— y la prueba estaba a la vista: los títulos de toda la aplicación ya se
 * componen en Bodoni Moda, una didone de verdad y variable, y el logo era lo único que la imitaba de lejos.
 *
 * QUÉ ES AHORA. El logo es texto: «8X» compuesto en la MISMA Bodoni Moda de los títulos. El contraste entre el grueso
 * y el pelo, el eje inclinado y los remates ya no se imitan: son la letra. Y cuando la marca crece, crece la letra,
 * no un dibujo estirado.
 *
 * LA TALLA ÓPTICA HACE EL TRABAJO. Bodoni Moda varía en «opsz», que es exactamente para esto: el mismo diseño afina
 * los pelos cuando la letra es grande y los engorda cuando es chica. De ahí los tres cortes de abajo. Sin ellos, el
 * logo de 24 px de la barra se deshilacha y el de 120 px de la portada se ve basto. (Antes esto se parcheaba
 * poniéndole un borde al dibujo en el celular: eso es engordar una letra con un marcador.)
 *
 * LAS MEDIDAS SON MEDIDAS, NO CUENTAS. Los anchos salieron de medir la fuente ya cargada en el navegador
 * (getComputedTextLength a 1000 px con esa misma talla, peso y espaciado). Se guardan aquí por dos razones: para que
 * la caja encaje al pelo con la letra, y para que, si la fuente todavía no cargó, lo que entre de reemplazo ocupe
 * exactamente el mismo sitio en vez de empujar la barra.
 *
 * EL DIBUJO SIGUE VIVO, PERO SOLO PARA EL ÍCONO DE LA APP: ImageResponse compone la imagen sin navegador y no tiene
 * los bytes de la fuente, así que ahí no hay letra que valga. Está abajo, en GEOMETRIA_8X.
 */

/** La cinta de la marca: entra fría —azul acero—, se calienta a champán donde le pega la luz y vuelve a salir fría. */
export const CINTA_8X = [
  [0, "#6f90c0"],
  [0.26, "#b9cbe4"],
  [0.46, "#f2e2bd"],
  [0.56, "#fff7e6"],
  [0.68, "#dbe4f0"],
  [1, "#8da8cc"],
] as const;

export const LEMA_8X = "Propósito · Creación · Escala";

/**
 * Los tres cortes de talla óptica. `avance` es el ancho medido de «8X» a 1000 px con ese peso y ese espaciado;
 * `desde` es el alto de letra a partir del cual manda ese corte.
 */
const CORTES = [
  { desde: 64, opsz: 96, peso: 400, espaciado: -0.04, avance: 1199 },
  { desde: 36, opsz: 48, peso: 500, espaciado: -0.02, avance: 1273 },
  { desde: 0, opsz: 20, peso: 700, espaciado: 0, avance: 1399 },
] as const;

/** Alto de la cifra (altura de capital) en unidades de em: es lo que promete la prop `alto`. */
const CAPITAL = 700;
/** Aire arriba y abajo para que ningún remate se corte al redondear. */
const AIRE = 26;

export function Logo8X({
  variante = "tinta",
  alto = 32,
  lema = false,
  decorativo = false,
  className,
}: {
  variante?: "luz" | "tinta";
  /** Alto de la letra en px (altura de capital), sin contar el lema. */
  alto?: number;
  /** Debajo, «PROPÓSITO · CREACIÓN · ESCALA» en mayúsculas espaciadas. */
  lema?: boolean;
  /** true cuando el enlace o el texto de al lado ya dicen «8X». */
  decorativo?: boolean;
  className?: string;
}) {
  // Un id propio por instancia: la marca se pinta dos veces (barra y franja del celular) y una de las dos está
  // oculta; un degradado dentro de un SVG con display:none no pinta en Chrome si otro lo referencia por el mismo id.
  const id = "l8x" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const corte = CORTES.find((c) => alto >= c.desde) ?? CORTES[CORTES.length - 1];
  // El espaciado se aplica también DESPUÉS de la última letra, así que el avance no es el ancho de la marca. Se le
  // descuenta —a la caja, no al texto— y la X vuelve a quedar con el mismo flanco que el 8 tiene a la izquierda: la
  // marca queda centrada de verdad en su ancho, con tracking positivo o negativo.
  const anchoCaja = corte.avance - corte.espaciado * 1000;
  const altoCaja = CAPITAL + AIRE * 2;
  const luz = variante === "luz";
  return (
    <span className={`logo8x logo8x--${variante}${className ? ` ${className}` : ""}`}>
      <svg
        viewBox={`0 ${-AIRE} ${anchoCaja} ${altoCaja}`}
        height={Math.round((alto * altoCaja) / CAPITAL)}
        width={Math.round((alto * anchoCaja) / CAPITAL)}
        role={decorativo ? undefined : "img"}
        aria-label={decorativo ? undefined : "8X"}
        aria-hidden={decorativo || undefined}
        focusable="false"
      >
        {luz && (
          <defs>
            <linearGradient id={`${id}-cinta`} gradientUnits="userSpaceOnUse" x1="0" y1={-AIRE} x2={anchoCaja} y2={CAPITAL}>
              {CINTA_8X.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
        )}
        {/* textLength con el ancho medido: con la Bodoni puesta no cambia nada, y sin ella impide que el reemplazo se
            salga de la caja. La familia la pone el CSS (.logo8x__letras). */}
        <text
          className="logo8x__letras"
          x="0"
          y={CAPITAL}
          textLength={corte.avance}
          lengthAdjust="spacingAndGlyphs"
          fill={luz ? `url(#${id}-cinta)` : "currentColor"}
          style={{
            fontSize: 1000,
            fontWeight: corte.peso,
            fontVariationSettings: `"opsz" ${corte.opsz}`,
            letterSpacing: `${corte.espaciado}em`,
          }}
        >
          8X
        </text>
      </svg>
      {lema && <span className="logo8x__lema">{LEMA_8X}</span>}
    </span>
  );
}

/**
 * EL 8X DIBUJADO, SOLO PARA EL ÍCONO DE LA APP (src/app/icon.tsx y apple-icon.tsx). ImageResponse compone la imagen
 * sin navegador y no resuelve fuentes web: ahí no hay letra, hay caminos. Las formas son cerradas y rellenas, como se
 * construye de verdad una didone: el 8 son dos anillos (elipse de fuera menos elipse de dentro, la de dentro girada,
 * que es de donde sale el eje inclinado), y la X son dos brazos, uno grueso y uno pelo. A 32 px cumple; de cerca no
 * sustituye a la letra, y por eso ya no se usa en pantalla.
 */

/** Una elipse como camino, con su eje girado. Dos arcos: la mitad de ida y la mitad de vuelta. */
function elipse(cx: number, cy: number, rx: number, ry: number, giro = 0): string {
  const a = (giro * Math.PI) / 180;
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  const n = (v: number) => Number(v.toFixed(2));
  return `M${n(cx + dx)},${n(cy + dy)}A${rx},${ry} ${giro} 1 1 ${n(cx - dx)},${n(cy - dy)}A${rx},${ry} ${giro} 1 1 ${n(cx + dx)},${n(cy + dy)}Z`;
}

/** El eje de la letra: el mismo para los dos anillos, o el 8 se parte. */
const EJE = -20;

export const GEOMETRIA_8X = {
  caja: { x: 0, y: 0, ancho: 200, alto: 132 },
  anilloAlto: elipse(54, 42, 23, 30) + elipse(54, 42, 9, 26.5, EJE),
  anilloBajo: elipse(54, 90, 28, 34) + elipse(54, 90, 12, 30, EJE),
  brazoGrueso:
    "M73.3,6.7 C90.2,28.6 107.2,50.6 124.1,72.5 C145.1,90.6 166.2,108.6 187.3,126.7 L188.7,125.3 C171.8,103.4 154.8,81.4 137.9,59.5 C116.9,41.4 95.8,23.4 74.7,5.3 Z",
  brazoPelo:
    "M189.5,5.5 C170,26.5 150,46 130.5,65.5 C110.5,85.5 91,105.5 71.5,124.5 L73.5,127.5 C93,108.5 113,88.5 132.5,68 C152,48.5 172,27 191.5,7.5 Z",
} as const;

/** Las cuatro formas, en el orden en que se pintan. Todas con el mismo relleno: la luz corre de una a otra. */
function formas() {
  const g = GEOMETRIA_8X;
  return [g.anilloAlto, g.anilloBajo, g.brazoGrueso, g.brazoPelo];
}

export function Logo8XImagen({ ancho }: { ancho: number }) {
  const { caja } = GEOMETRIA_8X;
  const alto = Math.round((ancho * caja.alto) / caja.ancho);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={ancho} height={alto} viewBox={`${caja.x} ${caja.y} ${caja.ancho} ${caja.alto}`}>
      <defs>
        <linearGradient id="cinta" gradientUnits="userSpaceOnUse" x1="18" y1="18" x2="186" y2="118">
          {CINTA_8X.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <g fill="url(#cinta)" fillRule="evenodd">
        {formas().map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

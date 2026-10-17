import type { Trozo } from "@/lib/estrategia/texto";
import { PANTALLA } from "@/lib/estrategia/textos";

/**
 * UN TEXTO DE LA ESTRATEGIA CON SUS CIFRAS PINTADAS (spec-estrategia-8x.md §6.2).
 *
 * Recibe los trozos que ya armó `pintar` en el servidor (nunca un id): el texto se lee tal cual; cada cifra lleva su
 * valor con la moneda de la empresa y su chip de origen («Hecho», «Estimado del dueño», «Supuesto · por confirmar»,
 * «Cálculo», «Escrito por la consultora»). Al tocar la cifra se abre, encima de la página, qué es y cómo se calcula
 * (un `popover` nativo: sin JavaScript y con Escape para cerrar). Lo que no tiene valor se pinta «sin dato», rayado,
 * nunca «S/ 0».
 *
 * Sirve en el servidor y en el cliente (no usa estado). `id` hace únicos los paneles de detalle de esta frase.
 * `modo="documento"` es la vista para imprimir: la cifra y su origen, sin botones.
 */

/** La clase visual de cada origen: el chip dice el estado y nada más. */
const CLASE: Record<string, string> = { hecho: "ok", estimado: "espera", supuesto: "espera", sin_dato: "neutro", consultora: "neutro" };

/** Un id de HTML a partir de un puntero o un nombre: solo letras, números y guiones. */
export const idHtml = (base: string): string => `c-${String(base).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "x"}`;

export function Frase({ trozos, id, modo = "pantalla" }: { trozos: readonly Trozo[]; id: string; modo?: "pantalla" | "documento" }) {
  return (
    <>
      {trozos.map((t, i) => {
        if (t.t === "texto") return <span key={i}>{t.texto}</span>;
        if (t.t === "falta") return <span key={i} className="falta-dato">{t.texto}</span>;
        if (t.t === "mencion") return <span key={i} className="mencion">{t.texto}</span>;
        // Una cifra.
        if (t.rayado) {
          const panel = `${idHtml(id)}-${i}`;
          const conDetalle = modo === "pantalla" && t.detalle.length > 0;
          return (
            <span key={i} className="cifra-e cifra-e--sin-dato">
              {conDetalle ? (
                <button type="button" className="cifra-e__valor" popoverTarget={panel} aria-label={`${t.texto}: ${PANTALLA.por_que_sin_cifra}`}>
                  <span className="sin-dato">{t.texto}</span>
                </button>
              ) : (
                <span className="sin-dato">{t.texto}</span>
              )}
              {conDetalle && <Detalle id={panel} titulo={t.texto} detalle={t.detalle} etiqueta={PANTALLA.por_que_sin_cifra} />}
            </span>
          );
        }
        const clase = CLASE[t.clase] ?? "neutro";
        if (modo === "documento") {
          return (
            <span key={i} className="cifra-e cifra-e--documento">
              <b>{t.texto}</b> <small>({t.chip.toLowerCase()})</small>
            </span>
          );
        }
        const panel = `${idHtml(id)}-${i}`;
        return (
          <span key={i} className="cifra-e" data-clase={t.clase}>
            {t.detalle.length > 0 ? (
              <button type="button" className="cifra-e__valor" popoverTarget={panel} aria-label={`${t.texto}: ${t.chip}. ${PANTALLA.ver_de_donde}`}>
                {t.texto}
              </button>
            ) : (
              <b className="cifra-e__valor">{t.texto}</b>
            )}
            <span className={`cifra-e__chip estado ${clase}`}>{t.chip}</span>
            {t.provisional && <span className="cifra-e__chip estado espera">{PANTALLA.provisional}</span>}
            {t.detalle.length > 0 && <Detalle id={panel} titulo={t.texto} detalle={t.detalle} />}
          </span>
        );
      })}
    </>
  );
}

/** El panel de una cifra: qué es, de dónde sale o cómo se calcula, y qué tan firme es. */
function Detalle({ id, titulo, detalle, etiqueta = PANTALLA.de_donde_sale }: { id: string; titulo: string; detalle: { etiqueta: string; texto: string }[]; etiqueta?: string }) {
  return (
    <span id={id} popover="auto" className="cifra-detalle" role="dialog" aria-label={etiqueta}>
      <span className="cifra-detalle__titulo">{titulo}</span>
      {detalle.map((d) => (
        <span key={d.etiqueta} className="cifra-detalle__fila">
          <span className="t-etiqueta">{d.etiqueta}</span>
          <span>{d.texto}</span>
        </span>
      ))}
      <button type="button" className="enlace-azul cifra-detalle__cerrar" popoverTarget={id} popoverTargetAction="hide">
        {PANTALLA.cerrar}
      </button>
    </span>
  );
}

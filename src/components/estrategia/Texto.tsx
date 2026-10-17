import { pintar } from "@/lib/estrategia/texto";
import { esEditable, textoEn } from "@/lib/estrategia/edicion";
import { aEditable, lugarDe, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { TextoEditable } from "./TextoEditable";
import { Frase } from "./Frase";

/**
 * LOS TEXTOS DE UNA VERSIÓN, POR SU LUGAR (servidor).
 *
 *  - `T`: el texto que vive en un puntero de lo vigente, pintado y, si la versión se corrige, con su lápiz. Si la
 *    consultora lo corrigió, deja ver lo que escribió 8X. Un texto vacío no se pinta (salvo que se pueda escribir).
 *  - `Cifra`: una sola cifra por su id, con su chip y su detalle.
 * El pintado se hace aquí, en el servidor: al navegador llegan los trozos, nunca los ids de la versión.
 */

type Como = "span" | "p" | "h2" | "h3" | "h4" | "strong";

export function T({ x, p, como = "span", clase, largo = false, donde }: { x: VistaEstrategia; p: string; como?: Como; clase?: string; largo?: boolean; donde?: string }) {
  const texto = textoEn(x.e, p);
  if (texto == null || (!texto.trim() && !x.editable)) return null;
  const editado = x.editados.has(p);
  const trozos = pintar(texto, x.refs, "consultora", { escritoPorConsultora: editado });
  const deOcho = editado && x.salida ? textoEn(x.salida, p) : null;
  const original = deOcho != null ? pintar(deOcho, x.refs, "consultora") : null;
  const { visible, marcas } = aEditable(texto, (id) => x.refs.get(id)?.texto);
  return (
    <TextoEditable
      companyId={x.companyId}
      eid={x.v.id}
      puntero={p}
      trozos={trozos}
      original={original}
      editable={x.editable && esEditable(p)}
      visible={visible}
      marcas={marcas}
      lugar={lugarDe(p, x.e)}
      como={como}
      clase={clase}
      largo={largo}
      donde={donde}
    />
  );
}

/** Una cifra por su id: el valor con su chip, o «sin dato» rayado con su motivo. `donde` la hace única en la página. */
export function Cifra({ x, id, donde }: { x: VistaEstrategia; id: string | null | undefined; donde: string }) {
  if (!id) return null;
  return <Frase trozos={pintar(`{{${id}}}`, x.refs, "consultora")} id={`${donde}-${id}`} />;
}

/** El nombre de una cifra por su id (sin el id): «La venta del mes». */
export const nombreDe = (x: VistaEstrategia, id: string): string | null => x.refs.get(id)?.nombre ?? null;

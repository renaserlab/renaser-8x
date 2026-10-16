import mammoth from "mammoth";

/**
 * LEER UN WORD TAL COMO ES, SIN PEDIRLE AL DUEÑO QUE LO EXPORTE.
 *
 * Hasta el 13-10-2026 un .docx se rechazaba con «expórtalo a PDF». Eso le pasaba trabajo al dueño y
 * perdía la estructura del documento: en un PDF los títulos y las viñetas son dibujo; aquí son datos.
 * Se conserva el ORDEN y el ESTILO de cada párrafo (título, viñeta, párrafo) para que la extracción
 * pueda citar «párrafo 14 · Vendedora — Carmen Huamán» y para que lo que falta se vea: un puesto cuyo
 * título no tiene viñetas debajo es un puesto sin funciones.
 *
 * Fidelidad: mammoth avisa cuando no sabe traducir algo (un estilo que no reconoce, una imagen, una
 * nota al pie). Si no avisa de nada, el texto salió entero → «alta». Si avisa, algo pudo perderse →
 * «media», y los avisos se guardan tal cual para que el consultor sepa qué.
 */

export type EstiloParrafo = "titulo" | "lista" | "parrafo";

export type Parrafo = {
  /** Posición en el documento, empezando en 1. Es la cita mínima: «párrafo 14». */
  indice: number;
  estilo: EstiloParrafo;
  texto: string;
};

export type FidelidadWord = "alta" | "media";

export type LecturaWord = {
  /** Todo el texto, un párrafo por línea. Es lo que se guarda como `contenido` de la fuente. */
  texto: string;
  parrafos: Parrafo[];
  /** Los mensajes de mammoth, sin traducir ni resumir. Vacío = nada se perdió que la librería sepa. */
  avisos: string[];
  fidelidad: FidelidadWord;
};

/**
 * Los estilos «Title» y «Subtitle» de Word (y sus nombres en castellano) no están en el mapa por
 * defecto de mammoth, que los deja como párrafo normal y avisa «Unrecognised paragraph style». Son
 * títulos: se mapean para no perder la jerarquía ni rebajar la fidelidad por algo que sí sabemos leer.
 */
const ESTILOS_ADICIONALES = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Título'] => h1:fresh",
  "p[style-name='Subtítulo'] => h2:fresh",
];

function aBuffer(entrada: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(entrada)) return entrada;
  if (entrada instanceof ArrayBuffer) return Buffer.from(entrada);
  return Buffer.from(entrada.buffer, entrada.byteOffset, entrada.byteLength);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Deshace lo que mammoth escapó para HTML. Solo las entidades que mammoth emite; nada más. */
export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (todo, cuerpo: string) => {
    if (cuerpo[0] === "#") {
      const n = cuerpo[1].toLowerCase() === "x" ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[cuerpo.toLowerCase()] ?? todo;
  });
}

function textoPlano(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+\|\s+$/, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Del HTML de mammoth a párrafos ordenados. Mammoth emite bloques planos y regulares (h1–h6, p, ul/ol>li,
 * table>tr>td>p); una fila de tabla se toma entera como un párrafo con sus celdas separadas por «|», así
 * un cuadro de funciones no se deshace en celdas sueltas.
 */
export function parrafosDeHtml(html: string): Parrafo[] {
  const parrafos: Parrafo[] = [];
  const bloque = /<(h[1-6]|li|tr|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = bloque.exec(html))) {
    const etiqueta = m[1].toLowerCase();
    const texto = textoPlano(m[2]);
    if (!texto) continue;
    const estilo: EstiloParrafo = etiqueta[0] === "h" ? "titulo" : etiqueta === "li" ? "lista" : "parrafo";
    parrafos.push({ indice: parrafos.length + 1, estilo, texto });
  }
  return parrafos;
}

export async function leerWord(entrada: Buffer | ArrayBuffer | Uint8Array): Promise<LecturaWord> {
  const r = await mammoth.convertToHtml({ buffer: aBuffer(entrada) }, { styleMap: ESTILOS_ADICIONALES, ignoreEmptyParagraphs: true });
  const parrafos = parrafosDeHtml(r.value);
  const avisos = r.messages.map((x) => `${x.type}: ${x.message}`);
  return {
    texto: parrafos.map((p) => p.texto).join("\n"),
    parrafos,
    avisos,
    fidelidad: avisos.length ? "media" : "alta",
  };
}

/**
 * Los avisos de mammoth llegan en inglés y uno por caso («warning: Unrecognised paragraph style: 'Cita'
 * (Style ID: Quote)»). El consultor no tiene por qué leer eso: aquí se agrupan por clase y se dicen en
 * castellano, con los nombres de estilo o elemento entre paréntesis para que el detalle no se pierda.
 * Los avisos crudos siguen en `LecturaWord.avisos`; esto es solo para el texto visible (fidelidad_nota).
 */
export function resumirAvisos(avisos: string[]): string {
  if (!avisos.length) return "";
  const estilosParrafo: string[] = [];
  const estilosTexto: string[] = [];
  const elementos: string[] = [];
  let imagenes = 0;
  let notas = 0;
  let otros = 0;
  for (const a of avisos) {
    const m = a.match(/Unrecognised (paragraph|run|table) style: '([^']*)'/i);
    if (m) {
      (m[1].toLowerCase() === "paragraph" || m[1].toLowerCase() === "table" ? estilosParrafo : estilosTexto).push(m[2]);
      continue;
    }
    const e = a.match(/unrecognised element was ignored: (\S+)/i);
    if (e) {
      elementos.push(e[1]);
      continue;
    }
    if (/image|imagedata|picture/i.test(a)) {
      imagenes++;
      continue;
    }
    if (/footnote|endnote|comment/i.test(a)) {
      notas++;
      continue;
    }
    otros++;
  }
  const unicos = (xs: string[]) => [...new Set(xs)].slice(0, 5).join(", ") + (new Set(xs).size > 5 ? "…" : "");
  const partes: string[] = [];
  if (estilosParrafo.length) partes.push(`${estilosParrafo.length} párrafo(s) con un estilo que no reconocemos (${unicos(estilosParrafo)}): se leyeron como texto normal, sin saber si eran títulos o viñetas`);
  if (estilosTexto.length) partes.push(`${estilosTexto.length} trozo(s) de texto con formato que no reconocemos (${unicos(estilosTexto)}): el texto se conservó, el formato no`);
  if (elementos.length) partes.push(`${elementos.length} elemento(s) del Word que no sabemos leer se omitieron (${unicos(elementos)})`);
  if (imagenes) partes.push(`${imagenes} imagen(es) omitida(s): si traen texto, súbelas como fotos`);
  if (notas) partes.push(`${notas} nota(s) al pie o comentario(s) que no se leyeron`);
  if (otros) partes.push(`${otros} aviso(s) técnico(s) más de la lectura`);
  return partes.join(" · ");
}

/** Qué título manda sobre un párrafo: el último «titulo» que lo precede, o ninguno. */
export function tituloDe(parrafos: Parrafo[], indice: number): Parrafo | null {
  let titulo: Parrafo | null = null;
  for (const p of parrafos) {
    if (p.indice > indice) break;
    if (p.estilo === "titulo") titulo = p;
  }
  return titulo;
}

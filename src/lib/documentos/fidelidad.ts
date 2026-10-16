/**
 * CÓMO SE ROTULA LA FIDELIDAD DE UNA LECTURA Y CÓMO SE CITA UN FRAGMENTO.
 *
 * Este módulo NO lleva "use client" a propósito. Lo usan a la vez la página de fuentes del consultor
 * (componente de servidor) y RevisarExtraccion.tsx (componente de cliente). Hasta el 13-10-2026 este
 * mapa vivía dentro del componente de cliente y la página lo importaba de ahí: en la compilación de
 * servidor de Next, cada export de un módulo "use client" se sustituye por una referencia opaca, así que
 * `FIDELIDAD_TEXTO["alta"]` era `undefined` y la columna «Lectura» mostraba «—» para todas las fuentes.
 * Lo que comparten servidor y cliente va en un módulo plano como este.
 */

export type FragmentoCitado = { texto: string | null; pagina: number | null; seccion: string | null; celda: string | null };

/** Lo que el consultor lee junto a cada fuente: en palabras, no en el código de la base. */
export const FIDELIDAD_TEXTO: Record<string, { texto: string; color: string }> = {
  alta: { texto: "Lectura fiel", color: "var(--confirmado)" },
  media: { texto: "Lectura con avisos", color: "var(--caducado)" },
  baja: { texto: "Lectura dudosa", color: "var(--contradicho)" },
  no_analizado: { texto: "No analizado", color: "var(--grafito)" },
};

/** El rótulo de una fidelidad guardada, o null si la fuente no tiene ninguna (entrevistas, audio, fotos). */
export function rotuloFidelidad(fidelidad: string | null | undefined): { texto: string; color: string } | null {
  if (!fidelidad) return null;
  return FIDELIDAD_TEXTO[fidelidad] ?? { texto: "Fidelidad sin registrar", color: "var(--grafito)" };
}

/** «página 3 · párrafo 14 · Vendedora — Carmen Huamán · Inventario!F3», solo con lo que haya. */
export function citaDe(f: FragmentoCitado | null): string {
  if (!f) return "sin fragmento citado";
  const partes = [f.pagina ? `página ${f.pagina}` : null, f.seccion, f.celda].filter(Boolean);
  return partes.length ? partes.join(" · ") : "sin ubicación en el documento";
}

/**
 * LO QUE EL CONSULTOR LEE CUANDO LA LECTURA DEJÓ AVISOS. Las librerías (mammoth para Word, exceljs, pdf-lib)
 * hablan en inglés y por caso: «warning: Unrecognised paragraph style: 'Cita' (Style ID: Quote)». Eso no va a
 * la pantalla: aquí cada clase de aviso se vuelve una frase corta en castellano, sin repetir, y los mensajes
 * crudos se quedan donde estaban (LecturaWord.avisos, detalle del trabajo) para quien tenga que depurar.
 */
export const AVISO_LECTURA = {
  estilos: "algunos estilos del Word no se reconocieron; el texto se leyó igual",
  imagenes: "las imágenes del Word no se leen; si traen texto, súbelas como fotos",
  notas: "las notas al pie o comentarios del Word no se leyeron",
  elementos: "algunos elementos del Word (campos, cuadros o símbolos) se omitieron; el texto se leyó igual",
  otro: "la lectura dejó un aviso técnico; el texto se leyó igual",
} as const;

export function traducirAvisosLectura(avisos: string[]): string[] {
  const frases = new Set<string>();
  for (const a of avisos) {
    if (/unrecognised (paragraph|run|table) style|style with id .* was referenced but not defined/i.test(a)) frases.add(AVISO_LECTURA.estilos);
    else if (/image|imagedata|picture/i.test(a)) frases.add(AVISO_LECTURA.imagenes);
    else if (/footnote|endnote|comment/i.test(a)) frases.add(AVISO_LECTURA.notas);
    else if (/unrecognised element|was ignored|unsupported/i.test(a)) frases.add(AVISO_LECTURA.elementos);
    else frases.add(AVISO_LECTURA.otro);
  }
  return [...frases];
}

/**
 * QUÉ FILA DE UNA REVISIÓN YA TIENE DECISIÓN. Lo comparten la ruta que consolida (servidor) y la pantalla de
 * revisión (cliente), y por eso vive aquí: si cada una lo decidiera a su manera, la pantalla pediría decidir
 * otra vez lo ya decidido, o la ruta daría por revisado lo que la pantalla nunca mostró.
 *
 * Una afirmación está decidida cuando alguien la confirmó o la descartó (queda «caducado», con su motivo).
 * «Sin verificar» y «contradicho» siguen abiertas.
 */
export function afirmacionYaDecidida(estado: string | null | undefined): boolean {
  return estado === "confirmado" || estado === "caducado";
}

/**
 * QUÉ FUENTES PASAN POR LA REVISIÓN DEL CONSULTOR (R10.2): los documentos y las tablas de datos. Entrevistas, notas
 * de voz, fotos y observaciones no: sus afirmaciones se validan una por una. Es la misma regla que aplica la
 * extracción al terminar de leer (jobs/handlers/extraer.ts · requiereRevision); una prueba comprueba que coinciden.
 * Vive aquí para que la ruta que consolida no tenga que cargar el módulo de extracción para saberlo.
 */
export function pasaPorRevision(tipo: string | null | undefined): boolean {
  return tipo === "documento" || tipo === "dato";
}

/** Así empieza la nota que la ruta le deja a un número descartado; el rastro de lo que decía la lectura va detrás. */
export const NOTA_NUMERO_DESCARTADO = "Descartado al revisar la extracción";

/**
 * Un número leído de un documento está decidido cuando dejó de ser «extraido» (aceptado o corregido: pasa a
 * conciliado) o cuando se descartó (conserva el origen, cambia de estado y pierde el valor). La última línea es
 * para quien recibe el número sin su estado: un descartado se reconoce por no tener valor y por la nota que la
 * ruta le dejó. Un número sin valor y sin esa nota NO está decidido: es un «sin dato» leído, que alguien tiene que mirar.
 */
export function numeroYaDecidido(m: { estado?: string | null; origen?: string | null; valor?: number | null; nota?: string | null }): boolean {
  if (m.estado === "descartado") return true;
  if (m.origen != null && m.origen !== "extraido") return true;
  return m.estado == null && m.valor === null && (m.nota ?? "").startsWith(NOTA_NUMERO_DESCARTADO);
}

/**
 * UNA LECTURA EN PARTE SE RECONOCE POR CÓMO EMPIEZA SU NOTA. Cuando un tramo de la fuente falla del todo, la
 * extracción deja la fuente «leída» con una nota que empieza así (jobs/handlers/extraer.ts · lecturaEnParte). La
 * pantalla de revisión lo pone arriba y la ruta que consolida lo deja escrito: quien revisa media fuente tiene que
 * saber que es media. La frase vive aquí porque la comparten servidor y cliente; una prueba comprueba que la nota
 * que escribe la extracción sigue empezando así.
 */
export const LEIDA_EN_PARTE = "Se leyó en parte";

export function esLecturaEnParte(nota: string | null | undefined): boolean {
  return (nota ?? "").trimStart().startsWith(LEIDA_EN_PARTE);
}

/** «Se leyó en parte: falló el tramo 2 de 3», sin el resto de la nota; null si la lectura no quedó en parte. Es lo que la pantalla pone arriba. */
export function resumenLecturaEnParte(nota: string | null | undefined): string | null {
  if (!esLecturaEnParte(nota)) return null;
  const texto = (nota ?? "").trim();
  const fin = texto.indexOf(". ");
  return (fin > 0 ? texto.slice(0, fin) : texto).replace(/\.$/, "");
}

/** Así empieza lo que la consolidación añade a la nota de una fuente que se dio por revisada con la lectura en parte. */
export const NOTA_CONSOLIDADA_EN_PARTE = "Consolidada con la lectura en parte";

/**
 * Así empieza la nota que la reextracción le deja a un número leído en la lectura ANTERIOR mientras la nueva no lo
 * vuelva a traer (api/sources/[id]/extract). Si la nueva lectura lo trae, lo reescribe con su nota y la marca
 * desaparece; si no lo trae, la marca se queda y quien revisa sabe que esa cifra no salió de la lectura que tiene delante.
 */
export const NOTA_LECTURA_ANTERIOR = "De la lectura anterior";

/** Lo que delata un mensaje crudo de librería en un texto que el consultor va a leer. Sirve de guardia en las pruebas. */
export const PATRON_MENSAJE_CRUDO = /Unrecognised|was ignored|warning:|error:|Exception|undefined|Style ID|\bat \S+\.js/i;

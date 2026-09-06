/**
 * LA CADENA DE VALOR (Porter), montada sobre el mapa que ya tenemos.
 *
 * Porter parte una empresa en actividades PRIMARIAS —las que tocan al cliente y le agregan valor a
 * lo que compra— y de APOYO —las que sostienen a las primeras—. Esa es exactamente la división que
 * ya vive en `pcf.ts` (seis de operación, siete de soporte), así que aquí NO se duplica el mapa: se
 * lee el que hay y se le agrega lo que Porter aporta y el PCF no.
 *
 * LO QUE APORTA: la cadena tiene ESLABONES, y el valor se pierde entre uno y otro, no dentro de
 * ellos. Un negocio rara vez falla porque «vender» esté mal hecho; falla porque lo que vende
 * ventas no es lo que entrega operaciones. Por eso cada eslabón se lee junto al que sigue, y por
 * eso el arquitecto captura proveedor y cliente_proceso (SIPOC) en cada proceso: sin eso, la cadena
 * es una lista de cajas sueltas.
 *
 * EL CLIENTE NUNCA ESCUCHA "cadena de valor" ni "Porter". Se le habla de por dónde pasa su negocio
 * y dónde se le cae algo entre una parte y la siguiente.
 */
import { CATEGORIAS, type ClaveCategoria } from "../pcf";

export type Eslabon = {
  clave: ClaveCategoria;
  nombre: string;
  /** El orden real del recorrido de un cliente por el negocio. */
  orden: number;
  /** Qué entrega este eslabón al siguiente. Es lo que se rompe cuando se rompe. */
  entrega: string;
  /** La pregunta que destapa la fuga en el traspaso hacia el siguiente eslabón. */
  preguntaDeTraspaso: string;
};

/**
 * LOS ESLABONES PRIMARIOS, en el orden en que un cliente atraviesa el negocio. No son las 13
 * categorías: son las que tocan al cliente. Las otras siete sostienen a estas.
 */
export const ESLABONES: Eslabon[] = [
  { clave: "oferta", nombre: "Lo que vendemos", orden: 1, entrega: "una promesa concreta: qué se ofrece, a qué precio y qué incluye", preguntaDeTraspaso: "¿Quien vende sabe exactamente qué se prometió, o cada uno promete distinto?" },
  { clave: "venta", nombre: "Conseguir al cliente y venderle", orden: 2, entrega: "un cliente que compró, y lo que se le prometió al comprar", preguntaDeTraspaso: "¿Lo que ventas prometió llega escrito a quien tiene que cumplirlo, o llega de boca?" },
  { clave: "entrega_producto", nombre: "Entregar el producto", orden: 3, entrega: "el producto en manos del cliente, completo y a tiempo", preguntaDeTraspaso: "¿Quien entrega se entera de lo que se prometió, o entrega lo estándar?" },
  { clave: "entrega_servicio", nombre: "Prestar el servicio", orden: 3, entrega: "el servicio hecho, igual lo haga quien lo haga", preguntaDeTraspaso: "¿El que atiende sabe qué se le prometió a ese cliente en particular?" },
  { clave: "postventa", nombre: "Cuidar al cliente después", orden: 4, entrega: "un cliente que vuelve, y lo aprendido de lo que salió mal", preguntaDeTraspaso: "¿Lo que el cliente reclama llega a quien puede corregir la causa, o muere en quien lo atendió?" },
];

const CLAVES_PRIMARIAS = new Set<string>(ESLABONES.map((e) => e.clave));

/** Las que sostienen la cadena. Salen del mismo mapa: lo de soporte, menos el rumbo y la mejora. */
export const APOYOS = CATEGORIAS.filter((c) => c.familia === "soporte").map((c) => ({ clave: c.clave as ClaveCategoria, nombre: c.nombre, pregunta: c.pregunta }));

export const esPrimario = (c: string) => CLAVES_PRIMARIAS.has(c);

/** Un traspaso entre dos eslabones: donde de verdad se pierden las cosas en una empresa. */
export type Traspaso = { de: Eslabon; a: Eslabon; pregunta: string };

/**
 * LOS TRASPASOS de esta empresa, según los eslabones donde ya tiene algo mapeado. Solo se señala el
 * traspaso entre dos eslabones que EXISTEN en su negocio: no tiene sentido preguntarle a una
 * consultora por su despacho de mercadería.
 */
export function traspasosDe(categoriasConProceso: string[]): Traspaso[] {
  const hay = new Set(categoriasConProceso);
  const presentes = ESLABONES.filter((e) => hay.has(e.clave)).sort((a, b) => a.orden - b.orden);
  const traspasos: Traspaso[] = [];
  for (let i = 0; i < presentes.length - 1; i++) {
    const de = presentes[i];
    const a = presentes[i + 1];
    if (de.orden === a.orden) continue; // producto y servicio conviven; no se traspasan entre sí
    traspasos.push({ de, a, pregunta: de.preguntaDeTraspaso });
  }
  return traspasos;
}

/**
 * DÓNDE SE CORTA LA CADENA: el primer eslabón que el cliente atraviesa y del que la empresa no ha
 * contado nada. No es lo mismo no tener escrita la postventa que no tener escrita la venta: lo
 * segundo rompe todo lo que viene después.
 */
export function primerCorte(categoriasConProceso: string[]): Eslabon | null {
  const hay = new Set(categoriasConProceso);
  // Producto y servicio comparten posición: basta con tener uno de los dos.
  const porOrden = new Map<number, Eslabon[]>();
  for (const e of ESLABONES) porOrden.set(e.orden, [...(porOrden.get(e.orden) ?? []), e]);
  for (const orden of [...porOrden.keys()].sort((a, b) => a - b)) {
    const grupo = porOrden.get(orden)!;
    if (!grupo.some((e) => hay.has(e.clave))) return grupo[0];
  }
  return null;
}

/** El marco como contexto para los agentes. El cliente no lee esto nunca. */
export function cadenaComoTexto(): string {
  return [
    "CADENA DE VALOR (interno, jamas se nombra al cliente):",
    ...ESLABONES.map((e) => `- ${e.nombre}: entrega ${e.entrega}.`),
    "El valor se pierde ENTRE eslabones, no dentro. Lo que ventas promete y operaciones no sabe es",
    "la fuga mas cara y la mas invisible: nadie la registra porque cada area hizo bien lo suyo.",
    "Las de apoyo (" + APOYOS.map((a) => a.nombre).join(", ") + ") no tocan al cliente pero lo sostienen todo.",
  ].join("\n");
}

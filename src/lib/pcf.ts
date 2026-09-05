/**
 * EL MAPA DE TODO NEGOCIO — las 13 categorías del marco APQC, dichas en castellano de dueño.
 *
 * APQC PCF es la taxonomía de procesos que usa el mundo para comparar empresas de cualquier
 * industria: 13 categorías de nivel 1 y cinco niveles (Categoría → Grupo → Proceso → Actividad →
 * Tarea). Es el estándar contra el que se mide cualquier consultora seria.
 *
 * LO QUE HACEMOS DISTINTO: el PCF está escrito para corporaciones y en inglés de consultoría
 * («Manage Enterprise Risk, Compliance, Remediation and Resiliency»). Un dueño de pollería no
 * entiende eso ni tiene por qué. Aquí vive la misma estructura con las palabras que él usa, y cada
 * categoría guarda su equivalencia con el estándar para cuando haya que hablar con un cliente
 * corporativo o justificar la metodología.
 *
 * Las seis primeras son el negocio funcionando; las siete siguientes, lo que lo sostiene.
 */
export type CategoriaPCF = {
  n: number;
  clave: string;
  /** Como se lo decimos al dueño. */
  nombre: string;
  /** Qué se pregunta uno al mirar esta categoría. */
  pregunta: string;
  /** El nombre en el estándar, para trazabilidad y para hablar con corporativos. */
  apqc: string;
  familia: "operacion" | "soporte";
};

export const CATEGORIAS: CategoriaPCF[] = [
  { n: 1, clave: "rumbo", nombre: "Hacia dónde va el negocio", pregunta: "¿Sabemos qué queremos ser y lo estamos decidiendo, o solo reaccionamos?", apqc: "Develop Vision and Strategy", familia: "operacion" },
  { n: 2, clave: "oferta", nombre: "Qué vendemos", pregunta: "¿Está claro qué ofrecemos, a qué precio y qué lo hace bueno?", apqc: "Develop and Manage Products and Services", familia: "operacion" },
  { n: 3, clave: "venta", nombre: "Cómo conseguimos clientes y vendemos", pregunta: "¿Sabemos por dónde llegan y qué pasa desde que preguntan hasta que pagan?", apqc: "Market and Sell Products and Services", familia: "operacion" },
  { n: 4, clave: "entrega_producto", nombre: "Cómo entregamos el producto", pregunta: "¿Lo que prometemos llega completo, a tiempo y bien?", apqc: "Deliver Physical Products", familia: "operacion" },
  { n: 5, clave: "entrega_servicio", nombre: "Cómo prestamos el servicio", pregunta: "¿El servicio sale igual de bien lo haga quien lo haga?", apqc: "Deliver Services", familia: "operacion" },
  { n: 6, clave: "postventa", nombre: "Cómo cuidamos al cliente después", pregunta: "¿Qué pasa cuando el cliente reclama, y vuelve?", apqc: "Manage Customer Service", familia: "operacion" },
  { n: 7, clave: "personas", nombre: "Las personas", pregunta: "¿Cómo entran, aprenden, se evalúan y crecen?", apqc: "Develop and Manage Human Capital", familia: "soporte" },
  { n: 8, clave: "informacion", nombre: "Los sistemas y la información", pregunta: "¿Dónde vive lo importante y quién puede verlo?", apqc: "Manage Information Technology", familia: "soporte" },
  { n: 9, clave: "dinero", nombre: "El dinero", pregunta: "¿Sabemos cuánto entra, cuánto sale y cuánto queda?", apqc: "Manage Financial Resources", familia: "soporte" },
  { n: 10, clave: "bienes", nombre: "Los bienes y equipos", pregunta: "¿Cuidamos lo que si para, para el negocio?", apqc: "Acquire, Construct and Manage Assets", familia: "soporte" },
  { n: 11, clave: "riesgos", nombre: "Los riesgos y lo que hay que cumplir", pregunta: "¿Qué nos puede tumbar y qué estamos obligados a cumplir?", apqc: "Manage Enterprise Risk, Compliance, Remediation and Resiliency", familia: "soporte" },
  { n: 12, clave: "externos", nombre: "Proveedores, banco y entorno", pregunta: "¿De quién dependemos fuera y qué pasa si falla?", apqc: "Manage External Relationships", familia: "soporte" },
  { n: 13, clave: "mejora", nombre: "Cómo mejoramos como empresa", pregunta: "¿Aprendemos de lo que sale mal o lo repetimos?", apqc: "Develop and Manage Business Capabilities", familia: "soporte" },
];

export type ClaveCategoria = (typeof CATEGORIAS)[number]["clave"];
export const CATEGORIA = new Map(CATEGORIAS.map((c) => [c.clave, c]));
export const nombreCategoria = (c: string) => CATEGORIA.get(c)?.nombre ?? c;

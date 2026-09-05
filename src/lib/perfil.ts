/**
 * EL PERFIL DEL NEGOCIO: los rasgos que deciden qué necesita esa empresa.
 *
 * Pedido de Kelin (30-08-2026): «tendremos empresas grandes, pequeñas, con sedes; restaurantes,
 * bufetes de abogados, tiendas, mecánicas. A todas les trabajamos con nuestra metodología, pero
 * deben responder a una matriz de documentación que ese negocio necesita para escalar».
 *
 * LA DECISIÓN DE DISEÑO: no se hace una lista de documentos por rubro. Con cientos de empresas eso
 * es inmantenible y siempre falta el rubro nuevo. Lo que se detecta son RASGOS —maneja efectivo,
 * tiene sedes, vende a crédito, trabaja con inventario— y la matriz se compone sola. Una casa de
 * cambio y una pollería comparten «maneja efectivo» y se separan en «inventario perecible»: la
 * metodología es una, el resultado es distinto porque el negocio es distinto.
 *
 * Los rasgos salen de lo que la empresa YA contó. Ninguno se pregunta en un formulario.
 */
import { clasificarModelo } from "./rules/matrices";

export type ClaveRasgo =
  | "solo_dueno" | "equipo_chico" | "equipo" | "varias_capas"
  | "multi_sede" | "efectivo" | "inventario" | "credito" | "entrega"
  | "canales_digitales" | "citas" | "turnos" | "datos_sensibles" | "atencion_publico"
  | "activos_criticos" | "proveedores_clave";

export type Rasgo = {
  clave: ClaveRasgo;
  /** Cómo se le nombra a la consultora y al dueño. Sin jerga. */
  nombre: string;
  /** Por qué cambia lo que la empresa necesita. Es lo que la consultora le explica al cliente. */
  porque: string;
};

export const RASGOS: Record<ClaveRasgo, Rasgo> = {
  solo_dueno: { clave: "solo_dueno", nombre: "Trabaja solo o casi solo", porque: "Todo depende de una persona: lo urgente es que el negocio no se caiga si esa persona falta" },
  equipo_chico: { clave: "equipo_chico", nombre: "Equipo pequeño", porque: "Ya hay que repartir tareas, pero todavía no hace falta una estructura formal" },
  equipo: { clave: "equipo", nombre: "Equipo formado", porque: "Con varias personas hacen falta reglas iguales para todos y alguien que responda por cada cosa" },
  varias_capas: { clave: "varias_capas", nombre: "Hay jefaturas", porque: "Cuando alguien dirige a otros, el criterio se transmite por escrito o se deforma en cada nivel" },
  multi_sede: { clave: "multi_sede", nombre: "Más de un local o sede", porque: "El mismo trabajo se hace en sitios distintos: sin estándar único, cada sede se vuelve una empresa aparte" },
  efectivo: { clave: "efectivo", nombre: "Maneja dinero en efectivo", porque: "Donde se toca efectivo hacen falta controles: quién cuenta, quién revisa y qué queda registrado" },
  inventario: { clave: "inventario", nombre: "Maneja stock o mercadería", porque: "Lo que no se cuenta se pierde: entradas, salidas, mermas y quién responde por ellas" },
  credito: { clave: "credito", nombre: "Vende a crédito o fía", porque: "Vender no es cobrar: hace falta a quién se le fía, cuánto y cómo se cobra" },
  entrega: { clave: "entrega", nombre: "Entrega o reparte", porque: "La promesa se cumple o se rompe en la entrega, y ahí es donde el cliente juzga" },
  canales_digitales: { clave: "canales_digitales", nombre: "Atiende por WhatsApp o redes", porque: "Si el cliente escribe y nadie responde, la venta se pierde sin que nadie se entere" },
  citas: { clave: "citas", nombre: "Trabaja con citas o agenda", porque: "La hora vacía no se recupera: la agenda ES el ingreso" },
  turnos: { clave: "turnos", nombre: "Trabaja por turnos", porque: "Lo que no queda escrito en el cambio de turno se pierde entre uno y otro" },
  datos_sensibles: { clave: "datos_sensibles", nombre: "Guarda datos delicados de clientes", porque: "Historias, expedientes o datos personales: quién accede y qué se respalda deja de ser opcional" },
  atencion_publico: { clave: "atencion_publico", nombre: "Atiende público directamente", porque: "Cada persona del mostrador ES la marca: sin estándar de atención, la experiencia depende del ánimo" },
  activos_criticos: { clave: "activos_criticos", nombre: "Depende de máquinas o equipos", porque: "Si la máquina para, el negocio para: mantenimiento y plan de contingencia" },
  proveedores_clave: { clave: "proveedores_clave", nombre: "Depende de pocos proveedores", porque: "Si el proveedor falla y no hay alternativa, el problema del proveedor se vuelve tuyo" },
};

/**
 * Señales textuales de cada rasgo. Se buscan en lo que la empresa contó, no se preguntan.
 *
 * CON FRONTERA DE PALABRA, y no es un detalle: la primera versión enganchaba «cita» dentro de
 * «soliCITA» y «neceSITA», y a una casa de cambio le detectaba que trabaja con citas y que vende a
 * crédito (por «tarjeta de crédito»). Un rasgo falso recomienda documentos que el negocio no
 * necesita — o sea, inventa. Preferimos no detectar un rasgo y preguntarlo, a detectarlo mal.
 */
const P = "(?:^|[^a-záéíóúñü])"; // inicio de palabra, tolerando acentos del castellano
const S = "(?:[^a-záéíóúñü]|$)"; // fin de palabra
const frase = (...alternativas: string[]) => new RegExp(`${P}(?:${alternativas.join("|")})${S}`, "i");

const SENALES: Partial<Record<ClaveRasgo, RegExp>> = {
  efectivo: frase("efectivo", "caja chica", "cierre de caja", "cuadre de caja", "cuadrar la caja", "arqueo", "vuelto", "billetes?", "monedas"),
  inventario: frase("stock", "inventario", "mercader[ií]a", "almac[eé]n", "abastecimiento", "merma", "reposici[oó]n", "productos? vencidos?"),
  // "crédito" solo cuenta si es la empresa la que fía, no si el cliente paga con tarjeta.
  credito: frase("fiamos", "fiado", "al cr[eé]dito", "vendemos a cr[eé]dito", "cobranza", "cuentas? por cobrar", "nos deben", "letras?"),
  entrega: frase("delivery", "reparto", "despacho", "env[ií]os?", "motorizado", "a domicilio", "instalaci[oó]n", "courier", "dhl"),
  canales_digitales: frase("whatsapp", "instagram", "facebook", "redes sociales", "tiktok", "p[aá]gina web", "por mensaje"),
  citas: frase("citas?", "agenda", "reservas?", "hora programada", "no vino a su", "no se present[oó]"),
  turnos: frase("turnos?", "cambio de turno", "relevo", "ma[ñn]ana y tarde", "guardia"),
  datos_sensibles: frase("historia cl[ií]nica", "expedientes?", "datos? personales?", "ficha del paciente", "contrato del cliente", "dni del cliente"),
  atencion_publico: frase("mostrador", "ventanilla", "atenci[oó]n al cliente", "recepci[oó]n", "cara al p[uú]blico", "sal[oó]n"),
  activos_criticos: frase("m[aá]quinas?", "equipos?", "horno", "refrigeraci[oó]n", "veh[ií]culos?", "cami[oó]n", "se cae el sistema", "se cae el internet"),
  proveedores_clave: frase("proveedores?", "importador", "distribuidor", "mayorista", "nos surte", "nos abastece"),
};

export type EntradaPerfil = {
  ficha: Record<string, unknown> | null;
  sector: string | null;
  /** Todo lo que la empresa contó: definiciones, respuestas, descripciones de proceso. */
  textos: (string | null | undefined)[];
};

export type Perfil = {
  rasgos: Rasgo[];
  /** Los modelos operativos que ya clasificaba el sistema (citas, orden, retail, comida…). */
  modelos: string[];
  personas: number | null;
  sedes: number | null;
  /** Rasgos que NO se pueden afirmar ni descartar porque la empresa aún no habló de eso. */
  sinDatos: Rasgo[];
};

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Lee el perfil de lo que la empresa ya contó. Lo que no aparece NO se asume: se devuelve en
 * `sinDatos` para que la conversación lo pregunte. Suponer que una tienda maneja inventario
 * porque «todas lo hacen» es exactamente la clase de invención que este producto no comete.
 */
export function perfilDe(e: EntradaPerfil): Perfil {
  const ficha = (e.ficha ?? {}) as Record<string, unknown>;
  const personas = num(ficha.personas);
  const sedes = num(ficha.locales);
  const corpus = [e.sector, ...e.textos, String(ficha.actividad ?? ""), String(ficha.productos ?? ""), String(ficha.canales ?? "")]
    .filter(Boolean)
    .join(" \n ");

  const rasgos: Rasgo[] = [];
  const sinDatos: Rasgo[] = [];

  // Tamaño: un solo rasgo, el que corresponde. Sin dato de personas no se inventa un tamaño.
  if (personas != null) {
    const clave: ClaveRasgo = personas <= 1 ? "solo_dueno" : personas <= 3 ? "equipo_chico" : personas <= 15 ? "equipo" : "varias_capas";
    rasgos.push(RASGOS[clave]);
  } else {
    sinDatos.push(RASGOS.equipo);
  }

  if (sedes != null && sedes > 1) rasgos.push(RASGOS.multi_sede);

  for (const [clave, re] of Object.entries(SENALES) as [ClaveRasgo, RegExp][]) {
    if (re.test(corpus)) rasgos.push(RASGOS[clave]);
    else sinDatos.push(RASGOS[clave]);
  }

  return { rasgos, modelos: clasificarModelo([corpus]), personas, sedes, sinDatos };
}

export const tiene = (p: Perfil, r: ClaveRasgo) => p.rasgos.some((x) => x.clave === r);

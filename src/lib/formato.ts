/**
 * FORMATO POR EMPRESA: montos, números, fechas y horas según lo que cada empresa declaró.
 *
 * ESTO PREPARA LA INTERNACIONALIZACIÓN; NO LA DECLARA. El código da Perú por hecho: soles con «S/», separadores
 * de es-PE y hora de Lima. La auditoría contó 125 sitios en 42 archivos; el grep de «S/», «es-PE» y
 * «America/Lima» en src dio, el 13-10-2026 y sin contar este archivo, 74 líneas en 46 archivos (101 apariciones),
 * y la palabra «soles» aparece en otras 138 líneas. La cifra se mueve mientras se trabaja: se vuelve a medir, no
 * se copia. `companies` ya guarda pais, moneda, idioma y zona_horaria (supabase/migracion-entrada-y-direccion.sql,
 * con Perú por defecto), y este módulo es el único lugar que sabe convertir esa configuración en texto. Ese día
 * ya lo usaban la oferta de productos (lib/producto.ts, components/producto/Oferta.tsx) y la entrada
 * (lib/entrada.ts); LO DEMÁS SIGUE CLAVADO: se migra por partes y, hasta que le toque, sigue mostrando Perú.
 * Los textos de la interfaz siguen en español: «es» es el único idioma disponible; los demás se ofrecen
 * desactivados y rotulados «próximamente, no probado», y si una fila trajera otro idioma, aquí se escribe en
 * español igual. Lo probado está en tests/formato.test.ts (PEN, USD, MXN, COP, CLP, EUR; Lima frente a Ciudad de
 * México en la medianoche), con el Intl de Node. Nada más que eso se afirma.
 *
 * Orden sugerido de migración (los 15 sitios de mayor tráfico, por archivo y nombre; las líneas se mueven):
 *   Portal del dueño, lo que cada cliente ve a diario:
 *   1 `soles` y «Tu meta: S/» en app/(cliente)/portal/page.tsx · 2 `soles` en portal/hoy/page.tsx ·
 *   3 `soles` en portal/numeros/page.tsx · 4 `soles` en portal/plan/page.tsx ·
 *   5 `soles` y `fecha` en portal/informe/page.tsx · 6 `soles` y el valor suelto de components/cliente/MisNumeros.tsx ·
 *   7 `soles` en components/cliente/TarjetaNumeros.tsx · 8 la unidad «soles» en components/cliente/Indicadores.tsx ·
 *   Tablero de la consultora: 9 `soles` en app/(consultor)/empresa/[id]/page.tsx ·
 *   Reglas que escriben frases para todas las pantallas:
 *   10 `soles` en lib/medicion.ts · 11 `conDecimales` y el valor legible en lib/kpis.ts ·
 *   12 la fecha «(hora de Lima)» y `soles` en lib/actas.ts · 13 `soles` en lib/perdida.ts ·
 *   14 `soles` en lib/rules/anomalias.ts · 15 `fechaCorta` y `fechaMes` en lib/textos.ts.
 *   Fuera de la lista por tráfico, pero el más delicado: lib/jobs/handlers/activos.ts le dice al modelo que «la
 *   moneda es SIEMPRE soles». Una empresa con otra moneda recibiría documentos en soles hasta que eso cambie.
 *
 * Determinista y sin dependencias: todo sale de Intl, que Node y los navegadores traen de fábrica. La falta de dato
 * nunca es cero: un valor nulo se escribe «sin dato», jamás «S/ 0». Los formateadores de Intl son caros de
 * construir (cerca de un milisegundo cada fecha), así que se construyen una vez por configuración y se guardan.
 */

export type ConfigEmpresa = { pais: string; moneda: string; idioma: string; zona_horaria: string };

/** Lo que rige cuando la empresa no declaró nada: Perú, igual que los valores por defecto de la migración. */
export const porDefecto: Readonly<ConfigEmpresa> = Object.freeze({ pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" });

/** Textos únicos para lo que no existe. Se devuelven, no se inventa un cero ni una fecha. */
export const SIN_DATO = "sin dato";
export const SIN_FECHA = "sin fecha";
export const SIN_HORA = "sin hora";

/** Un dato de configuración que no se puede usar: el mensaje ya está escrito para la persona, no para el programador. */
export class ConfiguracionInvalida extends Error {
  constructor(mensaje: string, public readonly campo: keyof ConfigEmpresa) {
    super(mensaje);
    this.name = "ConfiguracionInvalida";
  }
}

// ---------------------------------------------------------------------------------------------
// LISTAS CONOCIDAS. Sirven a los selectores y a la validación de la ruta. No limitan a Intl: cualquier
// código ISO 4217 que Intl reconozca pasa como moneda, y cualquier zona IANA válida pasa como zona.
// ---------------------------------------------------------------------------------------------

export type Pais = { codigo: string; nombre: string; moneda: string; zona_horaria: string };

export const PAISES: readonly Pais[] = [
  { codigo: "PE", nombre: "Perú", moneda: "PEN", zona_horaria: "America/Lima" },
  { codigo: "MX", nombre: "México", moneda: "MXN", zona_horaria: "America/Mexico_City" },
  { codigo: "CO", nombre: "Colombia", moneda: "COP", zona_horaria: "America/Bogota" },
  { codigo: "CL", nombre: "Chile", moneda: "CLP", zona_horaria: "America/Santiago" },
  { codigo: "AR", nombre: "Argentina", moneda: "ARS", zona_horaria: "America/Argentina/Buenos_Aires" },
  { codigo: "EC", nombre: "Ecuador", moneda: "USD", zona_horaria: "America/Guayaquil" },
  { codigo: "BO", nombre: "Bolivia", moneda: "BOB", zona_horaria: "America/La_Paz" },
  { codigo: "UY", nombre: "Uruguay", moneda: "UYU", zona_horaria: "America/Montevideo" },
  { codigo: "PY", nombre: "Paraguay", moneda: "PYG", zona_horaria: "America/Asuncion" },
  { codigo: "VE", nombre: "Venezuela", moneda: "VES", zona_horaria: "America/Caracas" },
  { codigo: "PA", nombre: "Panamá", moneda: "USD", zona_horaria: "America/Panama" },
  { codigo: "CR", nombre: "Costa Rica", moneda: "CRC", zona_horaria: "America/Costa_Rica" },
  { codigo: "GT", nombre: "Guatemala", moneda: "GTQ", zona_horaria: "America/Guatemala" },
  { codigo: "SV", nombre: "El Salvador", moneda: "USD", zona_horaria: "America/El_Salvador" },
  { codigo: "HN", nombre: "Honduras", moneda: "HNL", zona_horaria: "America/Tegucigalpa" },
  { codigo: "NI", nombre: "Nicaragua", moneda: "NIO", zona_horaria: "America/Managua" },
  { codigo: "DO", nombre: "República Dominicana", moneda: "DOP", zona_horaria: "America/Santo_Domingo" },
  { codigo: "US", nombre: "Estados Unidos", moneda: "USD", zona_horaria: "America/New_York" },
  { codigo: "ES", nombre: "España", moneda: "EUR", zona_horaria: "Europe/Madrid" },
];

export const CODIGOS_PAIS = PAISES.map((p) => p.codigo) as [string, ...string[]];

export const MONEDAS: readonly { codigo: string; nombre: string }[] = [
  { codigo: "PEN", nombre: "Sol peruano" },
  { codigo: "USD", nombre: "Dólar estadounidense" },
  { codigo: "MXN", nombre: "Peso mexicano" },
  { codigo: "COP", nombre: "Peso colombiano" },
  { codigo: "CLP", nombre: "Peso chileno" },
  { codigo: "ARS", nombre: "Peso argentino" },
  { codigo: "BOB", nombre: "Boliviano" },
  { codigo: "UYU", nombre: "Peso uruguayo" },
  { codigo: "PYG", nombre: "Guaraní" },
  { codigo: "VES", nombre: "Bolívar" },
  { codigo: "CRC", nombre: "Colón costarricense" },
  { codigo: "GTQ", nombre: "Quetzal" },
  { codigo: "HNL", nombre: "Lempira" },
  { codigo: "NIO", nombre: "Córdoba" },
  { codigo: "DOP", nombre: "Peso dominicano" },
  { codigo: "BRL", nombre: "Real brasileño" },
  { codigo: "EUR", nombre: "Euro" },
];

/** Solo el español está disponible y probado. Los demás se muestran, pero desactivados y rotulados. */
export const IDIOMAS: readonly { codigo: string; nombre: string; disponible: boolean }[] = [
  { codigo: "es", nombre: "Español", disponible: true },
  { codigo: "en", nombre: "Inglés", disponible: false },
  { codigo: "pt", nombre: "Portugués", disponible: false },
];
export const IDIOMAS_DISPONIBLES = IDIOMAS.filter((i) => i.disponible).map((i) => i.codigo) as [string, ...string[]];
export const NOTA_IDIOMA_NO_DISPONIBLE = "próximamente, no probado";

export const ZONAS: readonly { zona: string; nombre: string }[] = [
  { zona: "America/Lima", nombre: "Lima (Perú)" },
  { zona: "America/Mexico_City", nombre: "Ciudad de México" },
  { zona: "America/Cancun", nombre: "Cancún" },
  { zona: "America/Hermosillo", nombre: "Hermosillo" },
  { zona: "America/Tijuana", nombre: "Tijuana" },
  { zona: "America/Bogota", nombre: "Bogotá" },
  { zona: "America/Santiago", nombre: "Santiago de Chile" },
  { zona: "America/Argentina/Buenos_Aires", nombre: "Buenos Aires" },
  { zona: "America/Guayaquil", nombre: "Guayaquil / Quito" },
  { zona: "America/La_Paz", nombre: "La Paz" },
  { zona: "America/Montevideo", nombre: "Montevideo" },
  { zona: "America/Asuncion", nombre: "Asunción" },
  { zona: "America/Caracas", nombre: "Caracas" },
  { zona: "America/Panama", nombre: "Panamá" },
  { zona: "America/Costa_Rica", nombre: "San José (Costa Rica)" },
  { zona: "America/Guatemala", nombre: "Guatemala" },
  { zona: "America/El_Salvador", nombre: "San Salvador" },
  { zona: "America/Tegucigalpa", nombre: "Tegucigalpa" },
  { zona: "America/Managua", nombre: "Managua" },
  { zona: "America/Santo_Domingo", nombre: "Santo Domingo" },
  { zona: "America/New_York", nombre: "Nueva York / Miami" },
  { zona: "America/Chicago", nombre: "Chicago / Houston" },
  { zona: "America/Los_Angeles", nombre: "Los Ángeles" },
  { zona: "Europe/Madrid", nombre: "Madrid" },
];

// ---------------------------------------------------------------------------------------------
// MEMORIA. Construir un formateador de Intl cuesta cientos de veces más que usarlo, y validar una zona
// obliga a construir uno. Se guardan por clave, con tope: una entrada rara no hace crecer la memoria.
// ---------------------------------------------------------------------------------------------

const TOPE_MEMORIA = 300;

function recordar<V>(memoria: Map<string, V>, clave: string, crear: () => V): V {
  const ya = memoria.get(clave);
  if (ya !== undefined) return ya;
  if (memoria.size >= TOPE_MEMORIA) memoria.clear();
  const nuevo = crear();
  memoria.set(clave, nuevo);
  return nuevo;
}

const zonasVistas = new Map<string, boolean>();
const paisesVistos = new Map<string, boolean>();
const deNumeros = new Map<string, Intl.NumberFormat>();
const deFechas = new Map<string, Intl.DateTimeFormat>();

/** Las monedas que el motor publica. `null` si el motor no publica lista (navegadores viejos). */
let monedasDelMotor: Set<string> | null | undefined;
function monedasPublicadas(): Set<string> | null {
  if (monedasDelMotor !== undefined) return monedasDelMotor;
  try {
    monedasDelMotor = typeof Intl.supportedValuesOf === "function" ? new Set(Intl.supportedValuesOf("currency")) : null;
  } catch {
    monedasDelMotor = null;
  }
  return monedasDelMotor;
}

// ---------------------------------------------------------------------------------------------
// VALIDACIÓN. Determinista; los mensajes se escriben una vez aquí y los usan la ruta y la pantalla.
// ---------------------------------------------------------------------------------------------

export const MENSAJE = {
  pais: "País no reconocido. Elige uno de la lista.",
  moneda: "Esa moneda no es un código ISO 4217 reconocido. Usa tres letras, por ejemplo PEN, USD o MXN.",
  idioma: "Hoy solo está disponible el español (es). Los demás idiomas no están probados todavía.",
  zona_horaria: "Esa zona horaria no es válida. Usa el nombre completo de la zona, por ejemplo America/Lima.",
} as const;

/** ¿Es un código de moneda que Intl sabe escribir? Tres letras mayúsculas y, cuando el motor publica su lista, estar en ella. */
export function esMonedaValida(codigo: unknown): codigo is string {
  if (typeof codigo !== "string" || !/^[A-Z]{3}$/.test(codigo)) return false;
  const lista = monedasPublicadas();
  if (lista) return lista.has(codigo);
  try {
    new Intl.NumberFormat("es", { style: "currency", currency: codigo });
    return true;
  } catch {
    return false;
  }
}

/** ¿Es una zona IANA que Intl acepta? Se prueba construyendo el formateador: la lista publicada omite alias válidos. */
export function esZonaValida(zona: unknown): zona is string {
  if (typeof zona !== "string" || !/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(zona)) return false;
  return recordar(zonasVistas, zona, () => {
    try {
      new Intl.DateTimeFormat("es", { timeZone: zona });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * ¿Es un código de país ISO 3166 de dos letras que Intl conoce? Más ancho que la lista de los selectores: sirve
 * para ESCRIBIR con lo que la base ya guarde. «XX» o «Perú» no pasan: con ellos Intl escribiría con otro formato
 * sin avisar, o lanzaría un error en inglés.
 */
export function esPaisValido(codigo: unknown): codigo is string {
  if (typeof codigo !== "string" || !/^[A-Z]{2}$/.test(codigo) || codigo === "ZZ") return false;
  return recordar(paisesVistos, codigo, () => {
    try {
      return new Intl.DisplayNames(["es"], { type: "region", fallback: "none" }).of(codigo) !== undefined;
    } catch {
      return true; // Motor sin nombres de región: basta la forma del código.
    }
  });
}

/** ¿Está el país en la lista que ofrecen los selectores? Es lo que se exige para GUARDAR. */
export function esPaisConocido(codigo: unknown): codigo is string {
  return typeof codigo === "string" && CODIGOS_PAIS.includes(codigo);
}

export function esIdiomaDisponible(codigo: unknown): codigo is string {
  return typeof codigo === "string" && IDIOMAS_DISPONIBLES.includes(codigo);
}

export type Validacion = { ok: true; config: ConfigEmpresa } | { ok: false; campo: keyof ConfigEmpresa; error: string };

/** Valida una configuración completa o parcial sobre una base (por defecto, Perú). Devuelve el primer problema, escrito para la persona. */
export function validarConfig(parcial: Partial<Record<keyof ConfigEmpresa, unknown>>, base: ConfigEmpresa = porDefecto): Validacion {
  const config: ConfigEmpresa = { ...base };
  if (parcial.pais !== undefined) {
    if (!esPaisConocido(parcial.pais)) return { ok: false, campo: "pais", error: MENSAJE.pais };
    config.pais = parcial.pais;
  }
  if (parcial.moneda !== undefined) {
    const m = typeof parcial.moneda === "string" ? parcial.moneda.trim().toUpperCase() : parcial.moneda;
    if (!esMonedaValida(m)) return { ok: false, campo: "moneda", error: MENSAJE.moneda };
    config.moneda = m;
  }
  if (parcial.idioma !== undefined) {
    if (!esIdiomaDisponible(parcial.idioma)) return { ok: false, campo: "idioma", error: MENSAJE.idioma };
    config.idioma = parcial.idioma;
  }
  if (parcial.zona_horaria !== undefined) {
    const z = typeof parcial.zona_horaria === "string" ? parcial.zona_horaria.trim() : parcial.zona_horaria;
    if (!esZonaValida(z)) return { ok: false, campo: "zona_horaria", error: MENSAJE.zona_horaria };
    config.zona_horaria = z;
  }
  return { ok: true, config };
}

/**
 * La configuración de una fila de `companies`, con Perú donde falte el dato. Tolera que las columnas no
 * existan (migración sin aplicar) y que vengan nulas o vacías: así ninguna pantalla se cae por leerla.
 * Arregla lo que es solo de forma (espacios, «mx» por «MX»); lo que no es un código no lo adivina: lo deja
 * pasar y será la función de formato la que lo rechace con su mensaje.
 */
export function configDe(fila: Partial<Record<keyof ConfigEmpresa, unknown>> | null | undefined): ConfigEmpresa {
  if (!fila) return { ...porDefecto };
  const texto = (v: unknown, defecto: string) => (typeof v === "string" && v.trim() ? v.trim() : defecto);
  const codigo = (v: string, largo: number, forma: (s: string) => string) => (v.length === largo && /^[A-Za-z]+$/.test(v) ? forma(v) : v);
  return {
    pais: codigo(texto(fila.pais, porDefecto.pais), 2, (s) => s.toUpperCase()),
    moneda: codigo(texto(fila.moneda, porDefecto.moneda), 3, (s) => s.toUpperCase()),
    idioma: codigo(texto(fila.idioma, porDefecto.idioma), 2, (s) => s.toLowerCase()),
    zona_horaria: texto(fila.zona_horaria, porDefecto.zona_horaria),
  };
}

const CAMPOS = ["pais", "moneda", "idioma", "zona_horaria"] as const;

/** Solo lo que cambió respecto de lo guardado: es lo que la pantalla manda a la ruta y lo que queda en el rastro. */
export function cambiosDe(actual: ConfigEmpresa, nueva: ConfigEmpresa): Partial<ConfigEmpresa> {
  return Object.fromEntries(CAMPOS.filter((k) => nueva[k] !== actual[k]).map((k) => [k, nueva[k]]));
}

/**
 * Al elegir un país de la lista se proponen su moneda y su hora habituales. Es una propuesta: quien configura la
 * corrige antes de guardar (una empresa peruana puede facturar en dólares). El idioma no se toca.
 */
export function proponerPorPais(cfg: ConfigEmpresa, codigo: string): ConfigEmpresa {
  const p = PAISES.find((x) => x.codigo === codigo);
  return p ? { ...cfg, pais: p.codigo, moneda: p.moneda, zona_horaria: p.zona_horaria } : { ...cfg, pais: codigo };
}

// ---------------------------------------------------------------------------------------------
// FORMATO. Todo pasa por Intl con la localidad «es-PAÍS» de la empresa (es-PE, es-MX, es-CO…).
// ---------------------------------------------------------------------------------------------

const vacio = (v: unknown) => typeof v !== "string" || v.trim() === "";

/**
 * La localidad con la que se escriben separadores y nombres de mes. El idioma es español mientras sea el único
 * disponible: una fila con «en» no hace que media pantalla salga en inglés. Un país vacío es «no declarado» y rige
 * Perú; un país que no es un código se rechaza con su mensaje.
 */
export function localidadDe(cfg: ConfigEmpresa = porDefecto): string {
  const idioma = esIdiomaDisponible(cfg.idioma) ? cfg.idioma : porDefecto.idioma;
  const pais = vacio(cfg.pais) ? porDefecto.pais : cfg.pais;
  if (!esPaisValido(pais)) throw new ConfiguracionInvalida(`${MENSAJE.pais} Se recibió «${String(cfg.pais)}».`, "pais");
  return `${idioma}-${pais}`;
}

/** Intl separa símbolo y cifra con espacios finos o irrompibles; se vuelven espacios normales para que el texto sea predecible. */
const espacioNormal = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

function exigirMoneda(cfg: ConfigEmpresa): string {
  if (!esMonedaValida(cfg.moneda)) throw new ConfiguracionInvalida(`${MENSAJE.moneda} Se recibió «${String(cfg.moneda)}».`, "moneda");
  return cfg.moneda;
}

function exigirZona(cfg: ConfigEmpresa): string {
  if (!esZonaValida(cfg.zona_horaria)) throw new ConfiguracionInvalida(`${MENSAJE.zona_horaria} Se recibió «${String(cfg.zona_horaria)}».`, "zona_horaria");
  return cfg.zona_horaria;
}

/** Cuántos decimales se pidieron. Un valor imposible es un error de quien llama, y se le dice en claro. */
function exigirDecimales(pedidos: number | undefined, defecto: number): number {
  if (pedidos === undefined) return defecto;
  if (!Number.isInteger(pedidos) || pedidos < 0 || pedidos > 6) throw new RangeError(`«decimales» debe ser un entero entre 0 y 6. Se recibió «${String(pedidos)}».`);
  return pedidos;
}

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Escribe el número; si lo escrito no tiene ninguna cifra distinta de cero, escribe cero sin signo: «-S/ 0» no existe. */
function escribir(f: Intl.NumberFormat, n: number): string {
  const texto = f.format(n);
  return espacioNormal(/[1-9]/.test(texto) ? texto : f.format(0));
}

/**
 * Un monto en la moneda de la empresa: «S/ 1,234,568» en Perú, «$1,234,567.50» en México o Estados Unidos,
 * «1.234.567,50 €» en España. Sin decimales por defecto, como los montos mensuales de las pantallas; `decimales`
 * los fija cuando hacen falta (precios, tarifas por hora). Nulo, indefinido o no numérico → «sin dato».
 * Una moneda que no es la habitual del país se escribe con su código («USD 1,235» en Perú), no con un «$» ambiguo.
 */
export function moneda(valor: number | null | undefined, cfg: ConfigEmpresa = porDefecto, opciones: { decimales?: number } = {}): string {
  const codigo = exigirMoneda(cfg);
  const localidad = localidadDe(cfg);
  const decimales = exigirDecimales(opciones.decimales, 0);
  if (!esNumero(valor)) return SIN_DATO;
  const f = recordar(deNumeros, `${localidad}|${codigo}|${decimales}`, () =>
    new Intl.NumberFormat(localidad, { style: "currency", currency: codigo, minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  );
  return escribir(f, valor);
}

/** El símbolo o código con el que la empresa ve su moneda («S/», «$», «USD», «€»), para etiquetas como «Meta mensual (S/)». */
export function simboloMoneda(cfg: ConfigEmpresa = porDefecto): string {
  const codigo = exigirMoneda(cfg);
  const localidad = localidadDe(cfg);
  const f = recordar(deNumeros, `${localidad}|${codigo}|simbolo`, () => new Intl.NumberFormat(localidad, { style: "currency", currency: codigo }));
  return espacioNormal(f.formatToParts(1).find((p) => p.type === "currency")?.value ?? codigo).trim();
}

/** Un número con los separadores del país: «1,234,567.89» en Perú, «1.234.567,89» en Colombia. Hasta dos decimales por defecto. */
export function numero(n: number | null | undefined, cfg: ConfigEmpresa = porDefecto, opciones: { decimales?: number } = {}): string {
  const localidad = localidadDe(cfg);
  const max = exigirDecimales(opciones.decimales, 2);
  const min = exigirDecimales(opciones.decimales, 0);
  if (!esNumero(n)) return SIN_DATO;
  const f = recordar(deNumeros, `${localidad}|numero|${min}|${max}`, () => new Intl.NumberFormat(localidad, { minimumFractionDigits: min, maximumFractionDigits: max }));
  return escribir(f, n);
}

export type Momento = Date | string | number | null | undefined;

/** «2026», «2026-10» o «2026-10-14»: un día del calendario, sin hora. No es un instante y no se corre con la zona. */
const SOLO_DIA = /^\d{4}(-\d{2}(-\d{2})?)?$/;
/** Fecha y hora ISO, con «T» o con espacio (como la escribe Postgres), con o sin zona. */
const CON_HORA = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** El 30 de febrero no existe, pero el motor lo acepta y lo convierte en 2 de marzo. Aquí no pasa: se vuelve a escribir y se compara. */
function diaExiste(dia: string): boolean {
  const f = new Date(dia);
  return !isNaN(f.getTime()) && f.toISOString().slice(0, dia.length) === dia;
}

/**
 * Lee un momento sin depender de la máquina. Solo se aceptan fechas ISO: «10/11/2026» no se adivina (¿10 de
 * noviembre u 11 de octubre?), se devuelve «sin fecha». Una fecha con hora y sin zona se lee como UTC, que es
 * como la base guarda los instantes; leerla en la hora del servidor daría un resultado distinto en cada máquina.
 */
function leer(d: Momento): { instante: Date; soloDia: boolean } | null {
  if (d == null || d === "") return null;
  let instante: Date;
  let soloDia = false;
  if (d instanceof Date) instante = d;
  else if (typeof d === "number") instante = new Date(d);
  else if (typeof d !== "string") return null;
  else {
    const t = d.trim();
    const m = CON_HORA.exec(t);
    if (SOLO_DIA.test(t)) {
      if (!diaExiste(t)) return null;
      soloDia = true;
      instante = new Date(t); // Las formas de solo fecha se leen como medianoche UTC; se escriben también en UTC.
    } else if (m) {
      const [, dia, horaMin, seg = "00", fraccion = "0", zona = "Z"] = m;
      if (!diaExiste(dia)) return null;
      const desfase = zona === "Z" ? "Z" : zona.length === 3 ? `${zona}:00` : zona.includes(":") ? zona : `${zona.slice(0, 3)}:${zona.slice(3)}`;
      instante = new Date(`${dia}T${horaMin}:${seg}.${fraccion.slice(0, 3).padEnd(3, "0")}${desfase}`);
    } else return null;
  }
  return isNaN(instante.getTime()) ? null : { instante, soloDia };
}

export type EstiloFecha = "corta" | "larga" | "mes";

const OPCIONES_FECHA: Record<EstiloFecha, Intl.DateTimeFormatOptions> = {
  corta: { day: "2-digit", month: "2-digit", year: "numeric" },
  larga: { day: "numeric", month: "long", year: "numeric" },
  mes: { month: "long", year: "numeric" },
};

function formateadorFecha(localidad: string, zona: string, clave: string, opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return recordar(deFechas, `${localidad}|${zona}|${clave}`, () => new Intl.DateTimeFormat(localidad, { ...opciones, timeZone: zona }));
}

/**
 * La fecha en la zona horaria de la empresa. «corta» = 14/10/2026; «larga» = 14 de octubre de 2026; «mes» =
 * octubre de 2026. El mismo instante puede ser otro día según la zona: a las 05:30 UTC ya es 14 en Lima y todavía
 * 13 en Ciudad de México. Un día del calendario («2026-10-14», un periodo «2026-10») no es un instante: se escribe
 * tal cual, sin restarle horas. Leerlo como instante lo mostraba un día antes en toda América.
 */
export function fecha(d: Momento, cfg: ConfigEmpresa = porDefecto, estilo: EstiloFecha = "corta"): string {
  const zona = exigirZona(cfg);
  const localidad = localidadDe(cfg);
  const m = leer(d);
  if (!m) return SIN_FECHA;
  return espacioNormal(formateadorFecha(localidad, m.soloDia ? "UTC" : zona, estilo, OPCIONES_FECHA[estilo]).format(m.instante));
}

/** La hora del día en la zona de la empresa, en 24 horas: «00:30», «23:30». Un día del calendario no tiene hora: «sin hora». */
export function hora(d: Momento, cfg: ConfigEmpresa = porDefecto): string {
  const zona = exigirZona(cfg);
  const localidad = localidadDe(cfg);
  const m = leer(d);
  if (!m) return SIN_FECHA;
  if (m.soloDia) return SIN_HORA;
  return espacioNormal(formateadorFecha(localidad, zona, "hora", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(m.instante));
}

/** Fecha corta y hora juntas: «14/10/2026 00:30». De un día del calendario, solo la fecha: no se le inventa una hora. */
export function fechaHora(d: Momento, cfg: ConfigEmpresa = porDefecto): string {
  const m = leer(d);
  if (!m || m.soloDia) return fecha(d, cfg);
  return `${fecha(m.instante, cfg)} ${hora(m.instante, cfg)}`;
}

/** Lo que una persona verá al elegir una configuración: sirve a la pantalla para mostrar el efecto antes de guardar. */
export function ejemplo(cfg: ConfigEmpresa, instante: Date = new Date(), monto = 1234567.89): { monto: string; fecha: string; fecha_hora: string; simbolo: string } {
  return { monto: moneda(monto, cfg), fecha: fecha(instante, cfg, "larga"), fecha_hora: fechaHora(instante, cfg), simbolo: simboloMoneda(cfg) };
}

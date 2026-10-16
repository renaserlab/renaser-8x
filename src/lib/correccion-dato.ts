/**
 * CORREGIR UN DATO QUE NO CUADRA, EN UN PASO (16-10-2026).
 *
 * Kelin: «si hay alguna incongruencia, el dueño debe tener la forma de corregir datos». En «Tu diagnóstico» el dueño ve
 * dos cifras que no cuadran (lo que dijo y lo que sale de su tabla, de un documento o de la cuenta) y elige con un toque:
 * «Esta es la correcta», «Ninguna, es ___» (como lo diría hablando: «unos 30 mil») o «No lo sé». Aquí vive lo que viaja
 * de la pantalla a /api/portal/numeros y lo que esa ruta escribe:
 *
 *  - `EsquemaCorreccion`: el pedido, validado. Solo reglas que se corrigen escribiendo un número (las de una sección o
 *    de «Confirmar información» se corrigen en su propia pantalla). Solo los nueve números y los reconocidos.
 *  - `filaDeCorreccion`: la fila de company_metricas. «Esta es la correcta» y «Ninguna, es ___» quedan «contado» (de
 *    memoria): «comprobado» solo lo pone la consultora con el documento delante. «No lo sé» queda sin cifra
 *    (`sin_dato`): es una respuesta, no un cero.
 *  - `detalleDeRastro`: lo que queda en audit_log (entidad «correccion_dato»): qué regla, qué número, qué había a cada
 *    lado, qué eligió, qué quedó y la huella con los valores de DESPUÉS. Con esa huella el diagnóstico sabe que esa
 *    diferencia ya la vio el dueño; si una cifra cambia más tarde, la huella cambia y la diferencia vuelve a abrirse.
 *
 * El lado izquierdo de una incongruencia que se corrige escribiendo un número es siempre ese número (lo que dijo el
 * dueño, la ganancia imposible, la cifra que parece eco); el derecho no se toca. Por eso la huella de después lleva el
 * valor escrito a la izquierda y la derecha tal como estaba.
 *
 * Puro: sin base, sin red. Lo importa también la tarjeta del dueño (CorregirDato, de cliente).
 */
import { z } from "zod";
import { huellaDe, type Eleccion, type Incongruencia, type ReglaHoy } from "./incongruencias";
import { numeroEscrito } from "./numero-escrito";
import { AVISO_DATO_NEGATIVO } from "./dato-oral";
import { claveAceptada, VITAL_POR_CLAVE, RECONOCIDA_POR_CLAVE, PERIODO_DORADA, type FilaNumero } from "./metricas";
import type { Seccion } from "./secciones";

/** Las reglas que se corrigen escribiendo un número en Tus números (`corrige.via === "numeros"`). */
export const REGLAS_POR_NUMERO = [
  "venta_vs_productos",
  "declarado_vs_documento",
  "ganancia_vs_cuenta",
  "gasto_fijo_vs_tabla",
  "posible_eco",
  "imposible",
] as const satisfies readonly ReglaHoy[];
export type ReglaPorNumero = (typeof REGLAS_POR_NUMERO)[number];

export const ELECCIONES = ["izquierda", "derecha", "otra", "no_lo_se"] as const satisfies readonly Eleccion[];

/** El tope de un número del negocio: el mismo de la ruta de Tus números. */
const TOPE = 1_000_000_000;

/** Un número del negocio que puede ser negativo de verdad: lo que te quedó libre (una pérdida). Los demás, no. */
const ADMITE_NEGATIVO = new Set(["ganancia_mes"]);

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
/** Un mes con nombre, «hoy» o su mejor época: los periodos en que se guardan los nueve números. */
const periodoValido = (p: string) => ES_MES.test(p) || p === "actual" || p === PERIODO_DORADA;

/**
 * Lo que el dueño dice antes del número y no es parte de él: «unos», «como», «más o menos», «aprox.», «casi»,
 * «alrededor de», «por ahí». Se quitan antes de leerlo; la cifra queda dicha de memoria, como todas las suyas.
 */
const RODEOS = [
  "más o menos", "mas o menos", "alrededor de", "cerca de", "algo así como", "algo asi como", "por ahí de", "por ahi de",
  "aproximadamente", "aprox.", "aprox", "unos", "unas", "como", "casi", "por ahí", "por ahi", "serán", "seran", "son",
];
const CABOS = /[~±≈]/g;

/**
 * «unos 30 mil» → 30000. Devuelve el número, null si no escribió nada, o «invalido» si lo que escribió no es un número.
 * La lectura del número es la de todo el sistema (`numeroEscrito`): aquí solo se quitan los rodeos de la frase.
 */
export function leerCifraDicha(texto: string | null | undefined, o: { negativo?: boolean } = {}): number | null | "invalido" {
  let t = ` ${String(texto ?? "").toLowerCase().replace(CABOS, " ").replace(/\s+/g, " ").trim()} `;
  if (!t.trim()) return null;
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const r of RODEOS) {
      const conEspacios = ` ${r} `;
      if (t.includes(conEspacios)) {
        t = t.replace(conEspacios, " ");
        cambio = true;
      }
    }
  }
  // Escribió algo, pero solo el rodeo («unos»): eso no es «nada», es algo que no se entendió como número.
  if (!t.trim()) return "invalido";
  return numeroEscrito(t.trim(), { negativo: o.negativo });
}

const cifra = z.number().finite().min(-TOPE).max(TOPE);

/** Los avisos de «Ninguna, es ___». Sin una cifra de muestra: lo que va en el aviso se devuelve como respuesta. */
export const AVISO_CIFRA_VACIA = "Escribe la cifra que es, con números o como la dirías hablando.";
export const AVISO_CIFRA_NO_ENTENDIDA = "No entendimos esa cifra. Escríbela con números, o como la dirías hablando.";

/**
 * EL PEDIDO DE CORRECCIÓN, tal como lo manda la tarjeta. `clave` y `periodo` son los de la incongruencia (los de su
 * huella); `corrige` es el número que se escribe. `antes.derecha` falta cuando la incongruencia tiene un solo lado
 * (eco, imposible) y es null cuando el lado existe pero no tiene una cifra sola (un rango): la huella los distingue.
 * `texto` es lo que escribió en «Ninguna, es ___», tal cual; `motivo`, el «¿por qué?» opcional.
 */
export const EsquemaCorreccion = z
  .object({
    id: z.string().trim().min(3).max(200),
    regla: z.enum(REGLAS_POR_NUMERO),
    clave: z.string().max(60).nullable(),
    periodo: z.string().max(20).nullable(),
    corrige: z.object({ clave: z.string().min(1).max(60), periodo: z.string().min(1).max(20) }).strict(),
    eleccion: z.enum(ELECCIONES),
    antes: z.object({ izquierda: cifra.nullable(), derecha: cifra.nullable().optional() }).strict(),
    texto: z.string().trim().max(60).optional(),
    motivo: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const decir = (mensaje: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message: mensaje, path });
    if (!c.id.startsWith(`${c.regla}:`)) decir("Ese dato no corresponde a esa diferencia.", ["id"]);
    if (!claveAceptada(c.corrige.clave)) decir("No conocemos ese número.", ["corrige", "clave"]);
    if (!periodoValido(c.corrige.periodo)) decir("No conocemos ese mes.", ["corrige", "periodo"]);
    const negativo = ADMITE_NEGATIVO.has(c.corrige.clave);
    const fuera = (n: number) => (!negativo && n < 0) || Math.abs(n) > TOPE;
    // Una cifra imposible no se puede elegir como correcta: solo «Ninguna, es ___» o «No lo sé».
    if (c.regla === "imposible" && (c.eleccion === "izquierda" || c.eleccion === "derecha"))
      decir("Esa cifra no puede ser: escribe la que es, o di que no lo sabes.", ["eleccion"]);
    if (c.eleccion === "izquierda") {
      if (c.antes.izquierda == null) decir("Ese lado no tiene una cifra que elegir.", ["antes", "izquierda"]);
      else if (fuera(c.antes.izquierda)) decir("Esa cifra no se puede guardar como tu número.", ["antes", "izquierda"]);
    }
    if (c.eleccion === "derecha") {
      if (c.antes.derecha == null) decir("Ese lado no tiene una cifra que elegir.", ["antes", "derecha"]);
      else if (fuera(c.antes.derecha)) decir("Esa cifra no se puede guardar como tu número.", ["antes", "derecha"]);
    }
    if (c.eleccion === "otra") {
      const n = leerCifraDicha(c.texto, { negativo });
      if (n == null) decir(AVISO_CIFRA_VACIA, ["texto"]);
      else if (n === "invalido") decir(AVISO_CIFRA_NO_ENTENDIDA, ["texto"]);
      else if (fuera(n)) decir(Math.abs(n) > TOPE ? "Esa cifra es demasiado grande." : AVISO_DATO_NEGATIVO, ["texto"]);
    }
  });

export type CorreccionPedida = z.infer<typeof EsquemaCorreccion>;

/** El número que queda escrito: el del lado elegido, el que dijo, o null si no lo sabe. */
export function valorElegido(c: CorreccionPedida): number | null {
  switch (c.eleccion) {
    case "izquierda":
      return c.antes.izquierda;
    case "derecha":
      return c.antes.derecha ?? null;
    case "otra": {
      const n = leerCifraDicha(c.texto, { negativo: ADMITE_NEGATIVO.has(c.corrige.clave) });
      return typeof n === "number" ? n : null;
    }
    case "no_lo_se":
      return null;
  }
}

/**
 * LA FILA QUE SE ESCRIBE. Lo elegido queda «contado» (dicho de memoria por el dueño), nunca «verificado»; «No lo sé»
 * queda sin cifra y `sin_dato`. El resto (no pisar lo verificado, conservar la cifra del documento al lado) lo hace la
 * ruta con el mismo bucle de Tus números.
 */
export function filaDeCorreccion(c: CorreccionPedida): FilaNumero {
  const { clave, periodo } = c.corrige;
  if (c.eleccion === "no_lo_se") return { clave, periodo, valor: null, estado: "sin_dato" };
  const valor = valorElegido(c);
  // El esquema ya lo exige; si aun así no hay cifra, no se escribe un cero inventado: queda como «no lo sé».
  if (valor == null) return { clave, periodo, valor: null, estado: "sin_dato" };
  return { clave, periodo, valor, estado: "contado" };
}

/** «Ventas del mes», «Lo que te quedó libre»… el nombre que el dueño reconoce. */
export const nombreDelNumero = (clave: string) => VITAL_POR_CLAVE.get(clave)?.nombre ?? RECONOCIDA_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");

/**
 * EL RASTRO DE LA CORRECCIÓN (audit_log.detalle). `despues` es lo que quedó escrito (null: «no lo sé»). La huella se
 * toma con los valores de después: el izquierdo es el número escrito y el derecho no cambió. La otra cifra no se
 * pierde: queda en `antes` (y, si venía de un documento, también en la fila, en `cifra_desplazada`).
 */
export function detalleDeRastro(c: CorreccionPedida, despues: number | null): Record<string, unknown> {
  return {
    regla: c.regla,
    clave: c.clave,
    periodo: c.periodo,
    numero: { clave: c.corrige.clave, periodo: c.corrige.periodo, nombre: nombreDelNumero(c.corrige.clave) },
    eleccion: c.eleccion,
    antes: { izquierda: c.antes.izquierda, derecha: c.antes.derecha ?? null },
    despues: despues ?? "no_lo_se",
    texto: c.eleccion === "otra" ? c.texto ?? null : null,
    motivo: c.motivo ? c.motivo : null,
    huella: huellaDe(c.regla, c.clave, c.periodo, despues, c.antes.derecha),
  };
}

/** Lo que se le dice al dueño si su número quedó guardado pero el rastro del cambio no: nada falla en silencio. */
export const AVISO_SIN_RASTRO = "Se guardó tu número, pero no pudimos anotar el cambio: avísale a tu consultora.";

/** Las secciones con las que el dueño puede corregir un número desde «Tu diagnóstico»: basta una abierta. */
export const SECCIONES_PARA_CORREGIR = ["corroborar_diagnostico", "datos_faltantes"] as const satisfies readonly Seccion[];

/** ¿Esta diferencia se corrige desde la tarjeta, escribiendo un número? */
export function seCorrigeConUnNumero(i: Pick<Incongruencia, "regla" | "corrige">): boolean {
  return i.corrige.via === "numeros" && (REGLAS_POR_NUMERO as readonly string[]).includes(i.regla);
}

/**
 * EL PEDIDO A PARTIR DE LA DIFERENCIA QUE EL DUEÑO TIENE DELANTE. Lo arma la tarjeta al tocar un botón; null si esa
 * diferencia no se corrige con un número (va a su sección o a «Confirmar información»).
 */
export function correccionDe(i: Incongruencia, eleccion: Eleccion, o: { texto?: string; motivo?: string } = {}): CorreccionPedida | null {
  if (i.corrige.via !== "numeros" || !seCorrigeConUnNumero(i)) return null;
  const texto = o.texto?.trim();
  const motivo = o.motivo?.trim();
  return {
    id: i.id,
    regla: i.regla as ReglaPorNumero,
    clave: i.clave,
    periodo: i.periodo,
    corrige: { clave: i.corrige.clave, periodo: i.corrige.periodo },
    eleccion,
    antes: { izquierda: i.izquierda.valor, ...(i.derecha ? { derecha: i.derecha.valor } : {}) },
    ...(eleccion === "otra" && texto ? { texto } : {}),
    ...(motivo ? { motivo } : {}),
  };
}

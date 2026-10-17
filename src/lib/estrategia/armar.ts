/**
 * EL ARMADO DE LA ESTRATEGIA (spec-estrategia-8x.md §6.1, último párrafo).
 *
 * `armarEstrategia` junta, sin llamar a ningún modelo, lo que dejaron las dos lentes y el equipo rojo:
 *  - el FODA y los cruces que eligió el equipo rojo, resueltos desde las lentes (cada ítem conserva sus refs y su lente
 *    de origen; si lo reescribió, su texto nuevo);
 *  - cada camino: el de su lente más los CAMBIOS del equipo rojo (quitar, reemplazar o agregar jugadas, sumar casos,
 *    ajustar el punto de decisión), con la página del dueño que escribió el equipo rojo, y su proyección (§4.4);
 *  - el impacto de cada cruce, calculado por el código;
 *  - «si seguimos igual», la nota de confianza y los anexos de la consultora.
 * Lo que no se puede armar (un ítem que no existe, una jugada que se quita dos veces…) no se adivina: queda en
 * `problemas` y el validador lo cuenta como error.
 *
 * LOS IDS DE LAS JUGADAS SON ESTABLES. Las de la lente son J1…Jn (su número en la lente) y lo siguen siendo aunque el
 * equipo rojo quite otras. Una jugada que reemplaza a otra, o que se agrega, recibe el siguiente número libre: primero
 * los reemplazos, en el orden en que vienen, y después la agregada. Así `{{R:a.J2.mes}}` nunca apunta, sin decirlo, a
 * una jugada distinta de la que vio quien lo escribió. Una habilitadora que abría una jugada reemplazada pasa a abrir a
 * su reemplazo. En pantalla las jugadas se numeran por su posición; el id no se muestra nunca.
 *
 * Los ids locales de cada lente: A = el camino del dinero (camino «a»), B = el de la operación (camino «b»). A.F1 es la
 * primera fortaleza de la lente A; A.T2, su segundo cruce; A.J3, su tercera jugada.
 *
 * Puro: sin base, sin red, sin IA.
 */
import type { Rango } from "../dato-oral";
import type { Calculo } from "../finanzas";
import { normalizar, resolverResponsable } from "../plan-reglas";
import { refsDelPaquete, textoDeValor, type ClaseRef, type Paquete, type RefValor } from "./paquete";
import { configDeCalculos, refsDeCalculos, type Calculos } from "./calculos";
import {
  proyectarCamino, proyectarEfecto, refsDeProyeccion,
  type ContextoProyeccion, type EstadoJugada, type FaltaParaProbar, type ProyeccionCamino, type ProyeccionJugada, type SupuestoCuenta,
} from "./proyeccion";
import { CLAVES_SUPUESTO, CLAVE_DE_EFECTO, limitesDe } from "./supuestos";
import { refsEnTexto } from "./texto";
import { CASO_CAJA, NO_ENCONTRADO, notaDeConfianza } from "./textos";
import type {
  CambioCamino, CaminoLente, Caso, CruceTows, Falta, ItemFoda, Jugada, Oferta, ParaElDueno, PuntoDecision,
  SalidaEquipoRojo, SalidaLenteDinero, SalidaLenteTerreno, SupuestoIA,
} from "./esquemas";
import type { Efecto } from "./proyeccion";
import type { Violacion } from "./validador";

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export type Lente = "dinero" | "terreno";
export type LetraCamino = "a" | "b";
export type LetraLente = "A" | "B";
export type Origen = Lente | "equipo_rojo" | "8x";
export type CuadranteFoda = "f" | "d" | "o" | "a";

export const LETRA_DE_LENTE: Record<Lente, LetraLente> = { dinero: "A", terreno: "B" };
export const CAMINO_DE_LENTE: Record<Lente, LetraCamino> = { dinero: "a", terreno: "b" };
export const LENTE_DE_CAMINO: Record<LetraCamino, Lente> = { a: "dinero", b: "terreno" };
const LENTE_DE_LETRA: Record<LetraLente, Lente> = { A: "dinero", B: "terreno" };
export const CUADRANTES_FODA: readonly CuadranteFoda[] = ["f", "d", "o", "a"];

export type ItemFodaFinal = { de: string; lente: Lente; texto: string; refs: string[]; sin_fuente_externa: boolean; reescrito: boolean };

/** El impacto en dinero de un cruce: lo calcula el código desde su efecto, igual que el de una jugada. */
export type ImpactoCruce = {
  estado: EstadoJugada | "sin_efecto";
  utilidad_mes: Calculo<Rango>;
  caja_una_vez: Calculo<Rango>;
  por_probar: FaltaParaProbar[];
  clase: ClaseRef;
  texto_origen: string;
};

export type CruceFinal = Omit<CruceTows, "cruza" | "efecto"> & {
  de: string;
  lente: Lente;
  /** Los dos ítems del FODA que cruza, con su lente delante (A.F1). */
  cruza: string[];
  efecto: Efecto | null;
  /** El efecto que 8X quitó porque no se podía calcular (quitarLoInvalido). */
  efecto_retirado?: { efecto: Efecto; motivo: string };
  reescrita: boolean;
  impacto: ImpactoCruce;
};

export type JugadaFinal = Omit<Jugada, "efecto"> & {
  /** Estable: J1…Jn las de la lente; los reemplazos y la agregada, el número siguiente. */
  id: string;
  /** De dónde viene: «A.J2» si es de la lente; «rojo» si la escribió el equipo rojo. */
  de: string;
  origen: Lente | "equipo_rojo";
  /** null cuando 8X lo quitó porque no se podía calcular (queda en `efecto_retirado`). */
  efecto: Efecto | null;
  efecto_retirado?: { efecto: Efecto; motivo: string };
  /** Si el responsable es alguien de la empresa. Si no, `responsable` dice «por definir» y `responsable_dicho` lo que vino. */
  responsable_encontrado: boolean;
  responsable_dicho?: string;
};

export type CasoFinal = Caso & { origen: Origen };

/**
 * Una victoria de los primeros 14 días, con su cuenta: lo que entra a la caja de una vez (cobrar antes, liberar lo
 * parado) o lo que deja de salir cada mes (cerrar una fuga). Sin efecto, es un número que se cuenta, no dinero.
 */
export type VictoriaFinal = SalidaEquipoRojo["victorias_14_dias"][number] & {
  responsable_encontrado: boolean;
  responsable_dicho?: string;
  /** El efecto que 8X quitó porque no se podía calcular (quitarLoInvalido). */
  efecto_retirado?: { efecto: Efecto; motivo: string };
  /** La cuenta del código; null si la victoria no trae efecto. */
  proyeccion?: ProyeccionJugada | null;
};

export type CaminoFinal = {
  letra: LetraCamino;
  lente: Lente;
  nombre: string;
  filosofia: string;
  jugadas: JugadaFinal[];
  /** Las jugadas de la lente que el equipo rojo quitó o reemplazó: no son parte del camino (no se validan ni se muestran como tales). */
  cambiadas: { jugada: JugadaFinal; motivo: "quitada" | "reemplazada"; por: string | null }[];
  que_pide: CaminoLente["que_pide"];
  casos: CasoFinal[];
  anticipar: CaminoLente["anticipar"];
  senales_tempranas: CaminoLente["senales_tempranas"];
  punto_de_decision: PuntoDecision;
  punto_de_decision_de: Origen;
  para_el_dueno: ParaElDueno;
  /** En qué caso conviene este camino (lo escribe la prueba de los dos caminos): la fila «Conviene si» de la comparación. */
  conviene_si: string;
  proyeccion: ProyeccionCamino;
};

export type SupuestoFinal = SupuestoIA & {
  origen: Lente | "equipo_rojo";
  /** Dónde se usa: «a.J2», «A.T1». */
  usado_en: string[];
  /** 8X lo dejó fuera de las cuentas: fuera de su límite, de una clave que no es de cambio… (quitarLoInvalido). */
  retirado?: string;
};

export type FaltaFinal = Falta & { origen: (Lente | "equipo_rojo")[] };

/** Lo que una jugada necesita saber para tener número, con las jugadas que espera. */
export type Destraba = FaltaParaProbar & { esperan: string[] };

export type Quitado = { puntero: string; tipo: string; quitado: string; motivo: string; resuelto: boolean };

export type CuentasDeAnexo = {
  fugas: { caja: string[]; total_caja: string; vitales: string; horas: string[]; oportunidad: string[]; parado: string[] };
  noventa_diez: string;
  productos: string[];
  poder: { utilidad: string[]; caja: string[]; utilidad_juntas: string; caja_juntas: string };
  multiplicador: string[];
  equilibrio: string[];
  dependencia: string;
};

export type Estrategia = {
  version: 1;
  /** AAAA-MM-DD en la zona de la empresa: el día del paquete con que se armó. */
  hoy: string;
  /** Dónde está · qué la frena · cuánto cuesta seguir igual · la apuesta · cómo sabremos. */
  lectura: string[];
  gran_apuesta: SalidaEquipoRojo["gran_apuesta"];
  foda: Record<CuadranteFoda, ItemFodaFinal[]>;
  tows: CruceFinal[];
  caminos: Record<LetraCamino, CaminoFinal>;
  recomendado: SalidaEquipoRojo["recomendado"];
  victorias_14_dias: VictoriaFinal[];
  oferta: Oferta & { reescrita: boolean };
  medir_desde_el_dia_1: SalidaEquipoRojo["medir_desde_el_dia_1"];
  supuestos: SupuestoFinal[];
  faltan: FaltaFinal[];
  /** Lo que falta saber para que las jugadas y los cruces «por probar» tengan número. */
  destraban: Destraba[];
  por_que_no_llega: string | null;
  objeciones: SalidaEquipoRojo["objeciones"];
  si_seguimos_igual: { mes: "C:no_actuar.mes"; oportunidad: "C:no_actuar.oportunidad" };
  /** La escribe el código: cuántas cifras son hechos, estimados y supuestos, y cuántas jugadas están por probar. */
  nota_de_confianza: string;
  anexos: {
    dinero: { lectura: string; modelo_de_dinero: SalidaLenteDinero["modelo_de_dinero"]; caja: string };
    terreno: Pick<SalidaLenteTerreno, "lectura" | "restriccion" | "personas" | "procesos" | "producto" | "dependencia_del_dueno" | "tiempo_del_dueno" | "arbol" | "terreno" | "canvas">;
    /** Los ids de las cuentas del código que la consultora ve en «El análisis»: se pintan desde los cálculos congelados. */
    cuentas: CuentasDeAnexo;
  };
  /** Lo que no se pudo armar: el validador lo cuenta como error. */
  problemas: Violacion[];
  /** Lo que 8X quitó porque seguía inválido después de la reparación, con su marca. */
  quitado: Quitado[];
};

export type EntradaArmado = {
  paquete: Paquete;
  calculos: Calculos;
  lenteDinero: SalidaLenteDinero;
  lenteTerreno: SalidaLenteTerreno;
  rojo: SalidaEquipoRojo;
};

// ─── Ids locales ─────────────────────────────────────────────────────────────────────────────────

const LETRA_FODA: Record<CuadranteFoda, string> = { f: "F", d: "D", o: "O", a: "A" };
const CUADRANTE_DE_LETRA: Record<string, CuadranteFoda> = { F: "f", D: "d", O: "o", A: "a" };

/** «A.F1» → { lente: dinero, cuadrante: f, n: 1 }. Acepta también «F1» si se dice de qué lente es. */
export function leerIdFoda(id: string, lente?: LetraLente): { lente: LetraLente; cuadrante: CuadranteFoda; n: number } | null {
  const m = /^(?:([AB])\.)?([FDOA])([1-9])$/.exec(id.trim());
  if (!m) return null;
  const l = (m[1] as LetraLente | undefined) ?? lente;
  if (!l) return null;
  return { lente: l, cuadrante: CUADRANTE_DE_LETRA[m[2]!]!, n: Number(m[3]) };
}

/** «A.J3» o «J3» → «J3». */
export const idJugada = (id: string): string => id.trim().replace(/^[AB]\./, "");

/**
 * La salida de una lente con sus ids locales escritos (A.F1, A.T1, A.J1…): es lo que lee el equipo rojo. armarEstrategia
 * no los necesita (salen de la posición), pero si vienen, no estorban.
 */
export function conIds<T extends SalidaLenteDinero | SalidaLenteTerreno>(salida: T, letra: LetraLente): T & { ids: Record<string, string> } {
  const ids: Record<string, string> = {};
  for (const q of CUADRANTES_FODA) salida.foda[q].forEach((it, i) => (ids[`${letra}.${LETRA_FODA[q]}${i + 1}`] = it.texto));
  salida.tows.forEach((t, i) => (ids[`${letra}.T${i + 1}`] = t.estrategia));
  salida.camino.jugadas.forEach((j, i) => (ids[`${letra}.J${i + 1}`] = j.que_se_mueve));
  return { ...structuredClone(salida), ids };
}

// ─── Responsables ────────────────────────────────────────────────────────────────────────────────

const ES_EL_DUENO = /^(?:el |la )?(?:dueno|duena|propietario|propietaria|gerente general)(?: .*)?$/;

/** El responsable dicho, contra las personas de la empresa. El dueño siempre es de la empresa. */
export function resolverQuien(texto: string, personas: Paquete["personas"]): { encontrado: boolean; texto: string; dicho?: string } {
  const t = texto.trim();
  if (ES_EL_DUENO.test(normalizar(t))) return { encontrado: true, texto: t };
  if (resolverResponsable(t, personas)) return { encontrado: true, texto: t };
  return { encontrado: false, texto: NO_ENCONTRADO(t), dicho: t };
}

// ─── Supuestos ───────────────────────────────────────────────────────────────────────────────────

/** El contexto para calcular los límites de un supuesto con los datos de hoy. */
export const contextoLimites = (refs: ReadonlyMap<string, RefValor>) => ({ valor: (id: string) => refs.get(id)?.valor ?? null });

/**
 * Por qué un supuesto no puede entrar en las cuentas, o null si puede. Las mismas reglas que el validador (§6.3, 4 y 5):
 * una clave que no es de cambio, un rango al revés o fuera de su límite, la unidad equivocada, el ancla que falta.
 */
export function problemaDeSupuesto(s: Pick<SupuestoIA, "clave" | "rango" | "unidad" | "ancla">, refs: ReadonlyMap<string, RefValor>): { tipo: "supuesto_de_estado_actual" | "supuesto_fuera_de_limite"; texto: string } | null {
  const def = CLAVES_SUPUESTO[s.clave];
  if (!def || def.tipo !== "cambio") {
    return { tipo: "supuesto_de_estado_actual", texto: def ? `«${def.que_falta}» es cuánto es algo hoy: no se supone, se pregunta` : `la clave «${s.clave}» no es un cambio del catálogo` };
  }
  if (def.pide_ancla && !s.ancla) return { tipo: "supuesto_de_estado_actual", texto: `«${def.nombre}» tiene que decir de qué dato de hoy parte` };
  if (s.unidad !== def.unidad) return { tipo: "supuesto_fuera_de_limite", texto: `«${def.nombre}» se mide en ${def.unidad}, no en ${s.unidad}` };
  if (!Number.isFinite(s.rango.bajo) || !Number.isFinite(s.rango.alto) || s.rango.bajo > s.rango.alto) return { tipo: "supuesto_fuera_de_limite", texto: `el rango de «${def.nombre}» está al revés: el bajo pasa al alto` };
  const l = limitesDe(s.clave, contextoLimites(refs));
  if (l.ok && (s.rango.bajo < l.limites[0] || s.rango.alto > l.limites[1])) {
    return { tipo: "supuesto_fuera_de_limite", texto: `«${def.nombre}» va de ${l.limites[0]} a ${l.limites[1]}; el supuesto dice de ${s.rango.bajo} a ${s.rango.alto}` };
  }
  return null;
}

/**
 * ¿El supuesto llega al tope de lo creíble en 90 días? Entonces la cuenta descansa en lo más optimista: no es error,
 * pero se avisa (revisión del 17-10). Lo «optimista» es el alto, salvo en lo que se gana bajando (un costo, un gasto).
 */
export function enElTope(s: Pick<SupuestoIA, "clave" | "rango">, refs: ReadonlyMap<string, RefValor>): boolean {
  const def = CLAVES_SUPUESTO[s.clave];
  const l = limitesDe(s.clave, contextoLimites(refs));
  if (!def || !l.ok) return false;
  return def.gana_hacia === "abajo" ? s.rango.bajo <= l.limites[0] : s.rango.alto >= l.limites[1];
}

/** El id del supuesto que usa un efecto, y la clave de cambio que tiene que tener. */
export function supuestoDeEfecto(e: Efecto): { id: string; clave: string } | null {
  const clave = CLAVE_DE_EFECTO[e.tipo];
  if (!clave) return null;
  const id = e.tipo === "precio_linea" || e.tipo === "costo_parte" || e.tipo === "volumen_linea" || e.tipo === "precio_general" || e.tipo === "gasto_fijo" ? e.pct
    : e.tipo === "conversion" ? e.de_cada_10_nuevo
    : e.tipo === "dias_cobro" ? e.menos_dias
    : e.tipo === "recompra" || e.tipo === "cierre_fuga" || e.tipo === "inventario_liberado" ? e.de_cada_10
    : null;
  return id ? { id, clave } : null;
}

/** Los ids que un efecto nombra como datos (no supuestos): la línea, la fuga, los interesados, los clientes, las veces. */
export function refsDeEfecto(e: Efecto | null): string[] {
  if (!e) return [];
  switch (e.tipo) {
    case "precio_linea":
    case "costo_parte":
    case "volumen_linea":
      return [e.linea];
    case "conversion":
      return [e.interesados];
    case "recompra":
      return [e.clientes, ...(e.veces_mes ? [e.veces_mes] : [])];
    case "cierre_fuga":
      return [e.fuga];
    default:
      return [];
  }
}

const refSupuesto = (s: SupuestoFinal, cfg: ReturnType<typeof configDeCalculos>): RefValor => ({
  valor: { bajo: s.rango.bajo, alto: s.rango.alto },
  unidad: s.unidad,
  texto: textoDeValor({ bajo: s.rango.bajo, alto: s.rango.alto }, s.unidad, cfg),
  clase: "supuesto",
  formula: s.que_se_supone,
  nombre: s.que_se_supone,
});

// ─── Proyectar ───────────────────────────────────────────────────────────────────────────────────

/** Los ids del paquete y de los cálculos, juntos: la base de toda cuenta. */
export function refsDeBase(paquete: Paquete, calculos: Calculos): Map<string, RefValor> {
  return new Map([...refsDelPaquete(paquete), ...refsDeCalculos(calculos)]);
}

/** Los supuestos que pueden entrar en las cuentas: ni retirados ni inválidos. */
function supuestosParaCuentas(supuestos: SupuestoFinal[], base: ReadonlyMap<string, RefValor>): { cuentas: SupuestoCuenta[]; fuera: Map<string, string> } {
  const cuentas: SupuestoCuenta[] = [];
  const fuera = new Map<string, string>();
  for (const s of supuestos) {
    const p = s.retirado ?? problemaDeSupuesto(s, base)?.texto ?? null;
    if (p) fuera.set(s.id, p);
    else cuentas.push({ id: s.id, clave: s.clave, rango: { bajo: s.rango.bajo, alto: s.rango.alto }, que_se_supone: s.que_se_supone });
  }
  return { cuentas, fuera };
}

/** Un efecto cuyo supuesto quedó fuera de las cuentas no se calcula, y se dice por qué. */
function motivoFuera(e: Efecto | null, fuera: Map<string, string>, supuestos: SupuestoFinal[]): string | null {
  if (!e) return null;
  const s = supuestoDeEfecto(e);
  if (!s) return null;
  if (fuera.has(s.id)) return `el supuesto de esta jugada no entra en las cuentas: ${fuera.get(s.id)}`;
  const def = supuestos.find((x) => x.id === s.id);
  if (def && def.clave !== s.clave) return `el supuesto de esta jugada es de «${CLAVES_SUPUESTO[def.clave]?.nombre ?? def.clave}», y esta jugada necesita «${CLAVES_SUPUESTO[s.clave]?.nombre ?? s.clave}»`;
  return null;
}

function impactoInvalido(motivo: string): ImpactoCruce {
  const nulo = (formula: string): Calculo<Rango> => ({ valor: null, formula, periodo: "al mes", fuentes: [], supuestos: [], limitaciones: [], motivo_nulo: motivo });
  return { estado: "invalida", utilidad_mes: nulo("utilidad de más al mes"), caja_una_vez: nulo("caja que se libera una vez"), por_probar: [], clase: "sin_dato", texto_origen: "" };
}

/**
 * Dónde vive hoy lo que antes era «sin dato»: cuando el dueño responde, `X:interesados_mes` pasa a ser
 * `Q:interesados_mes` (o un número de los nueve, o el campo de una línea, o un gasto). Sin esto, una jugada «por
 * probar» nunca ganaría su número al «Actualizar números» (§7.3). Devuelve null si sigue sin dato o no hay a dónde ir.
 */
export function idQueTieneElDato(id: string, refs: ReadonlyMap<string, RefValor>): string | null {
  const m = /^X:([a-z0-9_.]+)(?:@([A-Za-z0-9_]+))?$/.exec(id);
  if (!m || refs.has(id)) return null;
  const [, clave, sufijo] = m as unknown as [string, string, string | undefined];
  const candidatos: string[] = [`Q:${clave}`, `N:${clave}`];
  const campo = { "linea.precio": "precio", "linea.costo": "costo", "linea.unidades_mes": "unidades" }[clave];
  if (campo && sufijo) candidatos.unshift(`L:${sufijo}.${campo}`);
  if (clave === "gastos_mes" && sufijo) candidatos.unshift(`G:${sufijo}`);
  if (/^(credito|inventario)\./.test(clave)) candidatos.unshift(`B:${clave}`);
  return candidatos.find((c) => refs.get(c)?.valor != null) ?? null;
}

/** Cambia en toda la estrategia los «sin dato» que ya tienen dato por el id donde vive ahora (textos, refs, efectos, anclas). */
function actualizarIds(e: Estrategia, refs: ReadonlyMap<string, RefValor>): void {
  const cambio = (id: string) => (id.startsWith("X:") ? idQueTieneElDato(id, refs) : null);
  const recorrer = (x: unknown, clave: string | null): unknown => {
    if (typeof x === "string") {
      if (x.startsWith("X:") && !x.includes(" ")) return cambio(x) ?? x;
      return x.includes("{{X:") ? x.replace(/\{\{\s*(X:[^{}\s]+)\s*\}\}/g, (todo, id: string) => (cambio(id) ? `{{${cambio(id)}}}` : todo)) : x;
    }
    if (Array.isArray(x)) {
      x.forEach((y, i) => (x[i] = recorrer(y, clave)));
      return x;
    }
    if (x && typeof x === "object") {
      for (const [k, y] of Object.entries(x as Record<string, unknown>)) {
        if (k === "proyeccion" || k === "impacto" || k === "cuentas") continue;
        (x as Record<string, unknown>)[k] = recorrer(y, k);
      }
    }
    return x;
  };
  recorrer(e, null);
}

/**
 * Rehace las cuentas de una estrategia: la proyección de cada camino, el impacto de cada cruce, lo que destraba cada
 * pregunta y la nota de confianza. Se usa al armar, al corregir un supuesto, después de quitar lo inválido y al
 * «Actualizar números» (con el paquete y los cálculos nuevos: lo que era «sin dato» y ya tiene dato pasa a citar el
 * dato). No cambia lo que dice ningún texto.
 */
export function reproyectar(e: Estrategia, paquete: Paquete, calculos: Calculos): Estrategia {
  const base = refsDeBase(paquete, calculos);
  const salida: Estrategia = structuredClone(e);
  actualizarIds(salida, base);
  const { cuentas, fuera } = supuestosParaCuentas(salida.supuestos, base);
  const ctx: ContextoProyeccion = { calculos, refs: base, supuestos: cuentas, modelo: paquete.empresa.modelo_negocio[0] ?? null };

  for (const letra of ["a", "b"] as const) {
    const c = salida.caminos[letra];
    const conEfecto = c.jugadas.filter((j) => j.efecto && !motivoFuera(j.efecto, fuera, salida.supuestos));
    c.proyeccion = proyectarCamino(letra, conEfecto.map((j) => ({ id: j.id, efecto: j.efecto!, desde_dia: j.desde_dia })), ctx);
  }
  for (const t of salida.tows) {
    const m = motivoFuera(t.efecto, fuera, salida.supuestos);
    if (!t.efecto) {
      const motivo = t.pregunta_si_no_hay_cuenta ? `sin cuenta: falta responder «${t.pregunta_si_no_hay_cuenta}»` : "este cruce no trae una cuenta";
      t.impacto = { ...impactoInvalido(motivo), estado: "sin_efecto" };
    } else if (m) t.impacto = impactoInvalido(m);
    else {
      const p = proyectarEfecto(t.efecto, ctx);
      t.impacto = { estado: p.estado, utilidad_mes: p.utilidad_mes, caja_una_vez: p.caja_una_vez, por_probar: p.por_probar, clase: p.clase, texto_origen: p.texto_origen };
    }
  }

  // Las victorias de los primeros 14 días: su cuenta, con las mismas reglas que una jugada.
  for (const v of salida.victorias_14_dias ?? []) {
    const ef = v.efecto ?? null;
    const m = motivoFuera(ef, fuera, salida.supuestos);
    v.proyeccion = !ef ? null : m ? { ...proyectarEfecto({ tipo: "habilitador", abre: "" }, ctx), estado: "invalida", invalida: m, abre: null } : proyectarEfecto(ef, ctx);
  }

  // Dónde se usa cada supuesto.
  for (const s of salida.supuestos) s.usado_en = [];
  const usar = (id: string | undefined, donde: string) => salida.supuestos.find((s) => s.id === id)?.usado_en.push(donde);
  for (const letra of ["a", "b"] as const) for (const j of salida.caminos[letra].jugadas) if (j.efecto) usar(supuestoDeEfecto(j.efecto)?.id, `${letra}.${j.id}`);
  for (const t of salida.tows) if (t.efecto) usar(supuestoDeEfecto(t.efecto)?.id, t.de);
  (salida.victorias_14_dias ?? []).forEach((v, i) => v.efecto && usar(supuestoDeEfecto(v.efecto)?.id, `v.${i + 1}`));

  // Lo que destraba cada pregunta: las jugadas y los cruces por probar que la esperan.
  const destraban = new Map<string, Destraba>();
  const esperar = (f: FaltaParaProbar, quien: string) => {
    const previo = destraban.get(f.id);
    if (!previo) destraban.set(f.id, { ...f, esperan: [quien] });
    else if (!previo.esperan.includes(quien)) previo.esperan.push(quien);
  };
  for (const letra of ["a", "b"] as const) for (const j of salida.caminos[letra].proyeccion.jugadas) for (const f of j.proyeccion.por_probar) esperar(f, `${letra}.${j.id}`);
  for (const t of salida.tows) for (const f of t.impacto.por_probar) esperar(f, t.de);
  salida.destraban = [...destraban.values()].sort((x, y) => x.id.localeCompare(y.id));

  salida.nota_de_confianza = notaDeConfianzaDe(salida, refsDeEstrategia(salida, paquete, calculos, base));
  return salida;
}

/**
 * Todos los ids que una estrategia puede citar, con lo que valen: los del paquete, los de los cálculos, los supuestos
 * (`S:SA1`) y las proyecciones de los dos caminos (`R:a.…`, `R:b.…`). Es lo que usan el validador y el pintor.
 */
export function refsDeEstrategia(e: Estrategia, paquete: Paquete, calculos: Calculos, base: ReadonlyMap<string, RefValor> = refsDeBase(paquete, calculos)): Map<string, RefValor> {
  const cfg = configDeCalculos(calculos);
  const refs = new Map(base);
  for (const s of e.supuestos) refs.set(`S:${s.id}`, refSupuesto(s, cfg));
  for (const [id, r] of refsDeVictorias(e, calculos)) refs.set(id, r);
  for (const letra of ["a", "b"] as const) {
    const c = e.caminos[letra];
    for (const [id, r] of refsDeProyeccion(c.proyeccion, calculos)) refs.set(id, r);
    // Una habilitadora se nombra por la posición de la jugada que abre (en pantalla no hay ids).
    for (const j of c.jugadas) {
      if (j.efecto?.tipo !== "habilitador") continue;
      const pos = c.jugadas.findIndex((x) => x.id === idJugada((j.efecto as { abre: string }).abre));
      const r = refs.get(`R:${letra}.${j.id}.mes`);
      if (r) refs.set(`R:${letra}.${j.id}.mes`, { ...r, texto: pos >= 0 ? `no mueve dinero por sí misma: abre la jugada ${pos + 1}` : "no mueve dinero por sí misma" });
    }
  }
  return refs;
}

/**
 * Los números de las victorias de los primeros 14 días: `R:v.1.caja` (lo que entra de una vez), `R:v.1.mes` (lo que
 * deja de salir cada mes) y los totales `R:v.total.caja` y `R:v.total.mes`, que suman solo las que tienen número. No se
 * suman a ningún camino: sirven a los dos.
 */
export function refsDeVictorias(e: Pick<Estrategia, "victorias_14_dias">, calculos: Pick<Calculos, "moneda" | "zona">): Map<string, RefValor> {
  const cfg = configDeCalculos(calculos);
  const refs = new Map<string, RefValor>();
  const caja: Rango[] = [];
  const mes: Rango[] = [];
  const clases: ClaseRef[] = [];
  const poner = (id: string, nombre: string, valor: Rango | null, clase: ClaseRef, formula: string, motivo: string) =>
    refs.set(id, { valor, unidad: "soles", texto: textoDeValor(valor, "soles", cfg, { redondear: true }), clase: valor ? clase : "sin_dato", formula, nombre, ...(valor ? {} : { motivo_nulo: motivo }) });
  (e.victorias_14_dias ?? []).forEach((v, i) => {
    const p = v.proyeccion;
    if (!p) return;
    const n = i + 1;
    const conNumero = p.estado === "con_numero";
    const c = conNumero ? p.caja_una_vez.valor : null;
    const u = conNumero ? p.utilidad_mes.valor : null;
    const motivo = p.invalida ?? p.caja_una_vez.motivo_nulo ?? p.utilidad_mes.motivo_nulo ?? "sin dato";
    poner(`R:v.${n}.caja`, `Lo que entra a la caja con la victoria ${n}, una vez`, c, p.clase, p.caja_una_vez.formula, motivo);
    poner(`R:v.${n}.mes`, `Lo que deja de salir cada mes con la victoria ${n}`, u, p.clase, p.utilidad_mes.formula, motivo);
    if (c && (c.bajo || c.alto)) caja.push(c);
    if (u && (u.bajo || u.alto)) mes.push(u);
    if (conNumero) clases.push(p.clase);
  });
  const suma = (xs: Rango[]) => (xs.length ? xs.reduce((a, b) => ({ bajo: a.bajo + b.bajo, alto: a.alto + b.alto })) : null);
  const clase: ClaseRef = clases.includes("supuesto") ? "supuesto" : clases.includes("estimado") ? "estimado" : clases.length ? "hecho" : "sin_dato";
  poner("R:v.total.caja", "Lo que entra a la caja con las victorias de los primeros 14 días, una vez", suma(caja), clase, "suma de lo que entra con cada victoria que tiene número", "ninguna victoria libera caja con número todavía");
  poner("R:v.total.mes", "Lo que deja de salir cada mes con las victorias de los primeros 14 días", suma(mes), clase, "suma de lo que deja de salir con cada victoria que tiene número", "ninguna victoria cierra una fuga con número todavía");
  return refs;
}

/** Cuántas cifras usa y de qué clase, en palabras (§6.1). Las cuenta el código, nunca el modelo. */
function notaDeConfianzaDe(e: Estrategia, refs: ReadonlyMap<string, RefValor>): string {
  const ids = new Set<string>();
  const mirar = (v: unknown, clave: string | null): void => {
    if (clave === "proyeccion" || clave === "impacto" || clave === "cambiadas" || clave === "cuentas" || clave === "quitado" || clave === "problemas") return;
    if (typeof v === "string") {
      for (const id of refsEnTexto(v)) ids.add(id);
      if (clave && CLAVES_CON_REF.has(clave) && refs.has(v)) ids.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => mirar(x, clave === "refs" ? "refs" : null));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) mirar(x, k);
  };
  mirar(e, null);
  for (const s of e.supuestos) if (s.usado_en.length && !s.retirado) ids.add(`S:${s.id}`);
  const cuenta = { hecho: 0, estimado: 0, supuesto: 0, sin_dato: 0 };
  for (const id of ids) {
    const r = refs.get(id);
    if (!r || (r.unidad === "texto" && r.valor == null && !r.motivo_nulo)) continue; // descripciones, no cifras
    cuenta[r.valor == null ? "sin_dato" : r.clase]++;
  }
  const porProbar = (["a", "b"] as const).reduce((n, l) => n + e.caminos[l].proyeccion.cuantas_por_probar, 0);
  return notaDeConfianza({ ...cuenta, por_probar: porProbar });
}

/** Las claves cuyo valor es un id (no un texto): se cuentan como cifras usadas. */
const CLAVES_CON_REF = new Set(["refs", "ancla", "base", "meta_30", "meta_90", "precio", "linea", "interesados", "clientes", "veces_mes", "fuga"]);

// ─── El orden en que se juegan ───────────────────────────────────────────────────────────────────

/**
 * EL ORDEN EN QUE SE JUEGAN (revisión del 17-10): por su día de inicio, y la habilitadora antes de la jugada que abre.
 * Antes, la jugada que agregaba la prueba iba siempre al final: en pantalla, la quinta empezaba el día 7 y «abría la
 * jugada 2», después de la cuarta, que empezaba el día 30; y el dueño leía «desde el 20 de octubre» después de un paso
 * del 12 de noviembre. Devuelve las posiciones en el orden nuevo (estable: a igual día, el orden en que vinieron).
 */
export function ordenDeJuego(jugadas: readonly Pick<JugadaFinal, "id" | "desde_dia" | "efecto">[]): number[] {
  const dia = new Map(jugadas.map((j) => [j.id, j.desde_dia]));
  const abreA = (j: Pick<JugadaFinal, "efecto">) => (j.efecto?.tipo === "habilitador" ? idJugada(j.efecto.abre) : null);
  // Una habilitadora juega, como tarde, el día de la que abre.
  const clave = (j: Pick<JugadaFinal, "id" | "desde_dia" | "efecto">) => Math.min(j.desde_dia, dia.get(abreA(j) ?? "") ?? j.desde_dia);
  return jugadas
    .map((j, i) => ({ j, i, k: clave(j) }))
    .sort((a, b) => a.k - b.k || (abreA(a.j) === b.j.id ? -1 : abreA(b.j) === a.j.id ? 1 : a.i - b.i))
    .map((x) => x.i);
}

/**
 * Ordena las jugadas de un camino por su día de inicio. Si la página del dueño trae un paso por jugada (en el orden en que
 * se escribieron), los pasos se mueven con sus jugadas: cada paso sigue al lado de la suya.
 */
export function ordenarCamino(c: CaminoFinal, opciones: { renumerar?: boolean } = {}): CaminoFinal {
  const orden = ordenDeJuego(c.jugadas);
  const pareados = c.para_el_dueno.pasos.length === c.jugadas.length;
  c.jugadas = orden.map((i) => c.jugadas[i]!);
  if (pareados) c.para_el_dueno = { ...c.para_el_dueno, pasos: orden.map((i) => c.para_el_dueno.pasos[i]!) };
  if (opciones.renumerar) renumerarJugadasEnTextos(c);
  return c;
}

/**
 * Cuando el modelo escribe «la jugada 4» en un texto de su camino, habla de SU número (el de la lente, o el siguiente
 * que se le dio a lo que agregó la prueba): el id J4. Con las jugadas ordenadas por su día de inicio, ese número ya no
 * es la posición. Al armar, cada «jugada N» de los textos del camino pasa a la posición que hoy tiene la J N (si la J N
 * ya no está en el camino, se deja como vino). Solo al armar: después, los textos ya hablan de posiciones.
 */
function renumerarJugadasEnTextos(c: CaminoFinal): void {
  const posicion = new Map(c.jugadas.map((j, i) => [j.id, i + 1]));
  const cambiar = (t: string): string =>
    t.replace(/\b([Jj]ugadas?)\s+(\d{1,2}(?:\s*(?:,|y|e)\s*\d{1,2})*)\b/g, (_todo, palabra: string, numeros: string) =>
      `${palabra} ${numeros.replace(/\d{1,2}/g, (n) => String(posicion.get(`J${n}`) ?? n))}`
    );
  for (const j of c.jugadas) {
    j.que_se_mueve = cambiar(j.que_se_mueve);
    j.por_que = cambiar(j.por_que);
    j.respuesta_del_mercado = cambiar(j.respuesta_del_mercado);
    if (j.si_responde_distinto) j.si_responde_distinto = cambiar(j.si_responde_distinto);
    j.que_abre = cambiar(j.que_abre);
  }
  for (const k of c.casos) Object.assign(k, { caso: cambiar(k.caso), por_que_puede_pasar: cambiar(k.por_que_puede_pasar), solucion: cambiar(k.solucion), senal: cambiar(k.senal) });
  c.punto_de_decision = { ...c.punto_de_decision, que_mirar: cambiar(c.punto_de_decision.que_mirar), si_va_bien: cambiar(c.punto_de_decision.si_va_bien), si_no: cambiar(c.punto_de_decision.si_no) };
  c.senales_tempranas = c.senales_tempranas.map((s) => ({ ...s, senal: cambiar(s.senal) }));
  c.anticipar = c.anticipar.map((a) => ({ ...a, que_hacemos_antes: cambiar(a.que_hacemos_antes) }));
  c.filosofia = cambiar(c.filosofia);
}

/** Las victorias, por el día en que empiezan (estable). */
export const ordenarVictorias = <V extends { desde_dia: number }>(vs: V[]): V[] =>
  vs.map((v, i) => ({ v, i })).sort((a, b) => a.v.desde_dia - b.v.desde_dia || a.i - b.i).map((x) => x.v);

// ─── Armar ───────────────────────────────────────────────────────────────────────────────────────

const violacion = (puntero: string, tipo: Violacion["tipo"], texto: string, que_hacer: string): Violacion => ({ puntero, tipo, texto, que_hacer });

function jugadaFinal(j: Jugada, id: string, de: string, origen: JugadaFinal["origen"], personas: Paquete["personas"]): JugadaFinal {
  const quien = resolverQuien(j.responsable, personas);
  return {
    ...structuredClone(j),
    efecto: structuredClone(j.efecto),
    id,
    de,
    origen,
    responsable: quien.texto,
    responsable_encontrado: quien.encontrado,
    ...(quien.dicho ? { responsable_dicho: quien.dicho } : {}),
  };
}

function armarCamino(
  lente: Lente,
  c: CaminoLente,
  cambio: CambioCamino,
  personas: Paquete["personas"],
  problemas: Violacion[],
  proyeccionVacia: ProyeccionCamino
): CaminoFinal {
  const letra = CAMINO_DE_LENTE[lente];
  const L = LETRA_DE_LENTE[lente];
  const lenteJugadas = c.jugadas.map((j, i) => jugadaFinal(j, `J${i + 1}`, `${L}.J${i + 1}`, lente, personas));
  const quitar = new Set<number>();
  for (const n of cambio.quitar) {
    if (n < 1 || n > lenteJugadas.length) problemas.push(violacion(`/caminos/${letra}/jugadas`, "efecto_mal_armado", `El equipo rojo quita la jugada ${n} del ${letra === "a" ? "camino A" : "camino B"}, que no existe.`, "Quitar solo jugadas que el camino tiene."));
    else quitar.add(n);
  }
  let siguiente = lenteJugadas.length + 1;
  const reemplazos = new Map<number, JugadaFinal>();
  for (const r of cambio.reemplazar) {
    if (r.n < 1 || r.n > lenteJugadas.length) {
      problemas.push(violacion(`/caminos/${letra}/jugadas`, "efecto_mal_armado", `El equipo rojo reemplaza la jugada ${r.n}, que no existe.`, "Reemplazar solo jugadas que el camino tiene."));
      continue;
    }
    if (quitar.has(r.n) || reemplazos.has(r.n)) {
      problemas.push(violacion(`/caminos/${letra}/jugadas`, "efecto_mal_armado", `El equipo rojo quita y reemplaza la misma jugada ${r.n}.`, "Una jugada se quita o se reemplaza, no las dos cosas."));
      continue;
    }
    reemplazos.set(r.n, jugadaFinal(r.jugada, `J${siguiente++}`, "rojo", "equipo_rojo", personas));
  }
  const jugadas: JugadaFinal[] = [];
  const cambiadas: CaminoFinal["cambiadas"] = [];
  lenteJugadas.forEach((j, i) => {
    const n = i + 1;
    if (quitar.has(n)) cambiadas.push({ jugada: j, motivo: "quitada", por: null });
    else if (reemplazos.has(n)) {
      const nueva = reemplazos.get(n)!;
      cambiadas.push({ jugada: j, motivo: "reemplazada", por: nueva.id });
      jugadas.push(nueva);
    } else jugadas.push(j);
  });
  for (const a of cambio.agregar) jugadas.push(jugadaFinal(a, `J${siguiente++}`, "rojo", "equipo_rojo", personas));

  // Una habilitadora que abría una jugada reemplazada abre a su reemplazo.
  const reemplazoDe = new Map(cambiadas.filter((x) => x.por).map((x) => [x.jugada.id, x.por!]));
  for (const j of jugadas) {
    if (j.efecto?.tipo === "habilitador") {
      const abre = idJugada(j.efecto.abre);
      j.efecto = { tipo: "habilitador", abre: reemplazoDe.get(abre) ?? abre };
    }
  }

  return ordenarCamino({
    letra,
    lente,
    nombre: c.nombre,
    filosofia: c.filosofia,
    jugadas,
    cambiadas,
    que_pide: structuredClone(c.que_pide),
    casos: [...cambio.casos_nuevos.map((x) => ({ ...structuredClone(x), origen: "equipo_rojo" as const })), ...c.casos.map((x) => ({ ...structuredClone(x), origen: lente }))],
    anticipar: structuredClone(c.anticipar),
    senales_tempranas: structuredClone(c.senales_tempranas),
    punto_de_decision: structuredClone(cambio.punto_de_decision ?? c.punto_de_decision),
    punto_de_decision_de: cambio.punto_de_decision ? "equipo_rojo" : lente,
    para_el_dueno: structuredClone(cambio.para_el_dueno),
    conviene_si: cambio.conviene_si,
    proyeccion: proyeccionVacia,
  }, { renumerar: true });
}

function cuentasDeAnexo(c: Calculos): CuentasDeAnexo {
  return {
    fugas: {
      caja: c.fugas.caja.fugas.map((f) => f.id),
      total_caja: c.fugas.caja.total.id,
      vitales: c.fugas.caja.vitales.id,
      horas: c.fugas.horas.fugas.map((f) => f.id),
      oportunidad: c.fugas.oportunidad.fugas.map((f) => f.id),
      parado: c.fugas.parado.map((p) => p.id),
    },
    noventa_diez: c.noventa_diez.id,
    productos: c.productos.map((p) => p.id),
    poder: {
      utilidad: c.poder.orden.utilidad.map((k) => `C:poder.${k}`),
      caja: c.poder.orden.caja.map((k) => `C:poder.${k}`),
      utilidad_juntas: c.poder.utilidad_juntas.id,
      caja_juntas: c.poder.caja_juntas.id,
    },
    multiplicador: [c.multiplicador.utilidad_hoy.id, c.multiplicador.k.id, c.multiplicador.venta_x2.id, c.multiplicador.venta_x3.id, c.multiplicador.venta_equilibrio.id, ...(c.multiplicador.ganancia_declarada ? [c.multiplicador.ganancia_declarada.id] : [])],
    equilibrio: [c.equilibrio.soles.id, c.equilibrio.unidades.id],
    dependencia: c.dependencia.id,
  };
}

/** Lo que un camino pide en dinero, contra la caja de hoy y lo que el dueño puede poner: cuánto lo pasa, o null. */
export function excesoDeCaja(c: Pick<CaminoFinal, "que_pide">, refs: ReadonlyMap<string, RefValor>): { contra: string[] } | null {
  const pide = refsEnTexto(c.que_pide.dinero).map((id) => refs.get(id)?.valor).filter((v): v is Rango => v != null);
  if (!pide.length) return null;
  const alto = Math.max(...pide.map((v) => v.alto));
  const contra = ["N:caja_hoy", "Q:inversion_disponible_mes"].filter((id) => {
    const v = refs.get(id)?.valor;
    return v != null && alto > v.alto;
  });
  return contra.length ? { contra } : null;
}

/**
 * Arma la estrategia final. No valida: eso lo hace validador.ts sobre lo que devuelve (y cuenta como error lo que quede
 * en `problemas`).
 */
export function armarEstrategia({ paquete, calculos, lenteDinero, lenteTerreno, rojo }: EntradaArmado): Estrategia {
  const problemas: Violacion[] = [];
  const lentes: Record<LetraLente, SalidaLenteDinero | SalidaLenteTerreno> = { A: lenteDinero, B: lenteTerreno };

  // ── El FODA que eligió el equipo rojo.
  const foda = { f: [], d: [], o: [], a: [] } as Record<CuadranteFoda, ItemFodaFinal[]>;
  for (const q of CUADRANTES_FODA) {
    rojo.foda[q].forEach((el, i) => {
      const id = leerIdFoda(el.de);
      const item: ItemFoda | undefined = id && id.cuadrante === q ? lentes[id.lente].foda[q][id.n - 1] : undefined;
      if (!id || !item) {
        problemas.push(violacion(`/foda/${q}/${i}`, "ref_desconocida", `El equipo rojo eligió «${el.de}» para el FODA, y no existe en ese cuadrante.`, "Elegir un ítem que esté en el FODA de una de las dos lentes, en su mismo cuadrante."));
        return;
      }
      const de = `${id.lente}.${LETRA_FODA[q]}${id.n}`;
      if (foda[q].some((x) => x.de === de)) return;
      foda[q].push({ de, lente: LENTE_DE_LETRA[id.lente], texto: el.texto ?? item.texto, refs: [...item.refs], sin_fuente_externa: !!item.sin_fuente_externa, reescrito: el.texto != null });
    });
  }

  // ── Los cruces que eligió el equipo rojo.
  const tows: CruceFinal[] = [];
  rojo.tows.forEach((el, i) => {
    const m = /^([AB])\.T([1-9])$/.exec(el.de);
    const letra = m?.[1] as LetraLente | undefined;
    const t = m ? lentes[letra!].tows[Number(m[2]) - 1] : undefined;
    if (!m || !t) {
      problemas.push(violacion(`/tows/${i}`, "ref_desconocida", `El equipo rojo eligió el cruce «${el.de}», que no existe.`, "Elegir un cruce que esté en una de las dos lentes."));
      return;
    }
    if (tows.some((x) => x.de === el.de)) return;
    const cruza = t.cruza.map((c) => {
      const id = leerIdFoda(c, letra);
      return id ? `${id.lente}.${LETRA_FODA[id.cuadrante]}${id.n}` : c;
    });
    cruza.forEach((c, k) => {
      const id = leerIdFoda(c);
      if (!id || !lentes[id.lente].foda[id.cuadrante][id.n - 1]) problemas.push(violacion(`/tows/${tows.length}/cruza/${k}`, "ref_desconocida", `El cruce «${el.de}» cruza «${c}», que no está en el FODA de su lente.`, "Cruzar dos ítems del FODA de la misma lente."));
    });
    tows.push({
      ...structuredClone(t),
      de: el.de,
      lente: LENTE_DE_LETRA[letra!],
      cruza,
      estrategia: el.estrategia ?? t.estrategia,
      reescrita: el.estrategia != null,
      impacto: impactoInvalido("sin calcular"),
    });
  });

  // ── Los supuestos de las tres salidas: un id, un supuesto.
  const supuestos: SupuestoFinal[] = [];
  const sumarSupuestos = (xs: SupuestoIA[], origen: SupuestoFinal["origen"], donde: string) =>
    xs.forEach((s, i) => {
      if (supuestos.some((x) => x.id === s.id)) {
        problemas.push(violacion(`${donde}/supuestos/${i}`, "ref_desconocida", `El supuesto «${s.id}» está dos veces.`, "Cada supuesto con su propio número."));
        return;
      }
      supuestos.push({ ...structuredClone(s), origen, usado_en: [] });
    });
  sumarSupuestos(lenteDinero.supuestos, "dinero", "/lente_dinero");
  sumarSupuestos(lenteTerreno.supuestos, "terreno", "/lente_terreno");
  sumarSupuestos(rojo.supuestos, "equipo_rojo", "/equipo_rojo");

  // ── Lo que falta saber, sin repetir clave (las «otra», sin repetir pregunta).
  const faltan: FaltaFinal[] = [];
  const sumarFaltan = (xs: Falta[], origen: Lente | "equipo_rojo") =>
    xs.forEach((f) => {
      const igual = faltan.find((x) => x.clave === f.clave && (f.clave !== "otra" || normalizar(x.pregunta_si_otra) === normalizar(f.pregunta_si_otra)));
      if (igual) {
        if (!igual.origen.includes(origen)) igual.origen.push(origen);
      } else faltan.push({ ...structuredClone(f), origen: [origen] });
    });
  sumarFaltan(lenteDinero.faltan, "dinero");
  sumarFaltan(lenteTerreno.faltan, "terreno");
  sumarFaltan(rojo.faltan, "equipo_rojo");

  // ── Los dos caminos: el de cada lente más los cambios del equipo rojo.
  const vacio = proyectarCamino("a", [], { calculos, refs: new Map(), supuestos: [] });
  const caminos: Record<LetraCamino, CaminoFinal> = {
    a: armarCamino("dinero", lenteDinero.camino, rojo.cambios.a, paquete.personas, problemas, { ...vacio, prefijo: "a" }),
    b: armarCamino("terreno", lenteTerreno.camino, rojo.cambios.b, paquete.personas, problemas, { ...vacio, prefijo: "b" }),
  };

  const victorias: VictoriaFinal[] = ordenarVictorias(
    rojo.victorias_14_dias.map((v) => {
      const quien = resolverQuien(v.responsable, paquete.personas);
      return { ...structuredClone(v), efecto: v.efecto ?? null, responsable: quien.texto, responsable_encontrado: quien.encontrado, ...(quien.dicho ? { responsable_dicho: quien.dicho } : {}) };
    })
  );

  let e: Estrategia = {
    version: 1,
    hoy: paquete.empresa.hoy,
    lectura: [...rojo.lectura],
    gran_apuesta: structuredClone(rojo.gran_apuesta),
    foda,
    tows,
    caminos,
    recomendado: structuredClone(rojo.recomendado),
    victorias_14_dias: victorias,
    oferta: { ...structuredClone(rojo.oferta.reescrita ?? lenteDinero.oferta), reescrita: rojo.oferta.reescrita != null },
    medir_desde_el_dia_1: structuredClone(rojo.medir_desde_el_dia_1),
    supuestos,
    faltan,
    destraban: [],
    por_que_no_llega: rojo.por_que_no_llega,
    objeciones: structuredClone(rojo.objeciones),
    si_seguimos_igual: { mes: "C:no_actuar.mes", oportunidad: "C:no_actuar.oportunidad" },
    nota_de_confianza: "",
    anexos: {
      dinero: { lectura: lenteDinero.lectura, modelo_de_dinero: structuredClone(lenteDinero.modelo_de_dinero), caja: lenteDinero.caja },
      terreno: {
        lectura: lenteTerreno.lectura,
        restriccion: structuredClone(lenteTerreno.restriccion),
        personas: lenteTerreno.personas,
        procesos: lenteTerreno.procesos,
        producto: lenteTerreno.producto,
        dependencia_del_dueno: lenteTerreno.dependencia_del_dueno,
        tiempo_del_dueno: lenteTerreno.tiempo_del_dueno,
        arbol: structuredClone(lenteTerreno.arbol),
        terreno: structuredClone(lenteTerreno.terreno),
        canvas: structuredClone(lenteTerreno.canvas),
      },
      cuentas: cuentasDeAnexo(calculos),
    },
    problemas,
    quitado: [],
  };
  e = reproyectar(e, paquete, calculos);

  // Un camino que pide más dinero del que hay: se suma como caso a tener en cuenta, con calma y con su salida (§6.3).
  const refs = refsDeEstrategia(e, paquete, calculos);
  for (const letra of ["a", "b"] as const) {
    const x = excesoDeCaja(e.caminos[letra], refs);
    if (x) e.caminos[letra].casos.push({ ...CASO_CAJA(x.contra), origen: "8x" });
  }
  return e;
}

/** La posición (desde 1) de una jugada en su camino, para nombrarla en pantalla sin su id. */
export const posicionDe = (c: Pick<CaminoFinal, "jugadas">, id: string): number | null => {
  const i = c.jugadas.findIndex((j) => j.id === idJugada(id));
  return i >= 0 ? i + 1 : null;
};

/** El rango de un supuesto, como Rango. */
export const rangoDeSupuesto = (s: Pick<SupuestoIA, "rango">): Rango => ({ bajo: s.rango.bajo, alto: s.rango.alto });

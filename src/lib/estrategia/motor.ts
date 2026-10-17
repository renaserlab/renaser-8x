/**
 * EL MOTOR DE LA ESTRATEGIA, LA PARTE PURA (spec-estrategia-8x.md §5).
 *
 * Lo que el manejador de la cola (src/lib/jobs/handlers/estrategia.ts) hace con la base y con el modelo vive allá; aquí
 * vive todo lo que se puede probar sin base ni red:
 *  - el material que recibe cada lente: SOLO el paquete y los cálculos congelados de la versión (nunca la otra lente:
 *    la independencia es la razón de tener dos);
 *  - la proyección de los dos caminos de las lentes, que el código hace antes de que corra el equipo rojo;
 *  - el material del equipo rojo: lo anterior, las dos lentes con sus ids locales (A.F1, A.T1, A.J1; B.…), sus
 *    proyecciones con los ids R: que puede citar y la lista de control; en la reparación, además, su salida anterior y
 *    lo que rechazó el validador;
 *  - el cierre: armar (lente + cambios), validar, quitar lo inválido si ya no hay otra vuelta, decidir el estado y
 *    correr la lista de control. El veredicto es del código, una sola vez.
 *
 * Lo que viene de la empresa o del modelo (el paquete, las lentes) lo acota cada agente con comoDato al armar su mensaje
 * (src/lib/ai/agents/{lente-dinero,lente-terreno,equipo-rojo}.ts): es contenido, no instrucciones.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { paqueteComoTexto, type Paquete } from "./paquete";
import type { Calculos } from "./calculos";
import { armarEstrategia, conIds, problemaDeSupuesto, refsDeBase, refsDeEstrategia, type Estrategia, type Lente, type LetraCamino } from "./armar";
import { proyectarCamino, refsDeProyeccion, type ProyeccionCamino, type SupuestoCuenta } from "./proyeccion";
import { estadoDeRevision, partesDeLineas, quitarLoInvalido, validar, type Validacion, type Violacion } from "./validador";
import { CLAVES_CONTROL, LISTA_DE_CONTROL, revisarCalidad, type ResultadoControl } from "./calidad";
import type { SalidaEquipoRojo, SalidaLenteDinero, SalidaLenteTerreno } from "./esquemas";

// ─── Los límites del motor (spec-estrategia-8x.md §3.6 y §5.2; Kelin los cambia aquí) ─────────────

/** Cuánto gasta una estrategia, de punta a punta, hasta que el ensayo vivo lo mida (§5.2). */
export const TOKENS_POR_ESTRATEGIA = 130_000;
/** Cuántas estrategias por empresa y por día (§12.2, decisión de Kelin por defecto). «Actualizar números» no cuenta. */
export const ESTRATEGIAS_POR_DIA = 3;
/** Cuántas a la vez en todo 8X: cada una ocupa hasta dos trabajos pesados y con más las entrevistas esperarían (§5.2). */
export const ESTRATEGIAS_A_LA_VEZ = 4;
/** Una versión en curso cuenta como «generándose» durante esta ventana desde que se creó. */
export const VENTANA_A_LA_VEZ_MS = 30 * 60_000;

export const LENTES: readonly Lente[] = ["dinero", "terreno"];
export type SalidaLente = SalidaLenteDinero | SalidaLenteTerreno;
export type ProyeccionesLentes = Record<LetraCamino, ProyeccionCamino>;

// ─── Lo que se le da al modelo ───────────────────────────────────────────────────────────────────

/** Los meses que se pueden anticipar: el de hoy y los tres que siguen (AAAA-MM), los mismos que mira el validador. */
export function mesesQueSePuedenAnticipar(hoy: string): string[] {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  return [0, 1, 2, 3].map((k) => `${a + Math.floor((m - 1 + k) / 12)}-${String(((m - 1 + k) % 12) + 1).padStart(2, "0")}`);
}

/** El paquete en texto, con los cálculos: lo mismo para las dos lentes y para el equipo rojo. */
export function textoDelPaquete(paquete: Paquete, calculos: Calculos): { texto: string; recortes: Paquete["recortes"] } {
  return paqueteComoTexto(paquete, refsDeBase(paquete, calculos));
}

/** Lo que vende, con su id corto y las partes de su costo (para que un efecto `costo_parte` nombre una parte que existe). */
function lineasYPartes(calculos: Calculos): string {
  const partes = partesDeLineas(calculos);
  if (!calculos.lineas.length) return "La empresa no tiene cargada su tabla de lo que vende.";
  return calculos.lineas.map((l) => `[${l.corto}] «${l.nombre}» · partes del costo: ${(partes.get(l.corto) ?? []).join(", ") || "sin partes cargadas"}`).join("\n");
}

/** El poder del uno, de la palanca que más mueve a la que menos, con sus ids. */
function poderOrdenado(paquete: Paquete, calculos: Calculos): string {
  const refs = refsDeBase(paquete, calculos);
  const linea = (k: string) => {
    const r = refs.get(`C:poder.${k}`);
    return r ? `[C:poder.${k}] ${r.nombre}: ${r.texto}` : null;
  };
  const utilidad = calculos.poder.orden.utilidad.map(linea).filter(Boolean);
  const caja = calculos.poder.orden.caja.map(linea).filter(Boolean);
  return [
    "Mueven la utilidad de cada mes:",
    ...(utilidad.length ? utilidad : ["ninguna palanca tiene cifra todavía"]),
    "Liberan caja una sola vez (no se suman a la utilidad):",
    ...(caja.length ? caja : ["ninguna palanca tiene cifra todavía"]),
  ].join("\n");
}

/** En una línea, qué busca la ambición con estos números (§9.2): multiplicar, o primero pasar el equilibrio. */
function metaDeAmbicion(calculos: Calculos): string {
  const e = calculos.multiplicador.estado;
  if (e === "multiplicar") return "Hoy la empresa tiene utilidad con las cuentas: la meta es multiplicarla (ver {{C:mult.venta_x2}} y {{C:mult.venta_x3}}).";
  if (e === "equilibrio_primero") return "Con las cuentas, hoy la utilidad podría ser cero o negativa: la primera meta es pasar el punto de equilibrio (ver {{C:mult.venta_equilibrio}}).";
  return "Sin la venta, lo que deja cada venta y los gastos no hay cuenta del multiplicador: dilo y pide lo que falta.";
}

function cabecera(paquete: Paquete, calculos: Calculos): string {
  return [
    `HOY: ${paquete.empresa.hoy} (en la zona de la empresa). Los meses que se pueden anticipar: ${mesesQueSePuedenAnticipar(paquete.empresa.hoy).join(", ")}.`,
    `LA META: ${metaDeAmbicion(calculos)}`,
  ].join("\n");
}

/**
 * El material de una lente: el paquete y los cálculos congelados de la versión. NADA de la otra lente: tests/
 * estrategia-motor.test.ts comprueba que lo que recibe cada una no trae la salida de la otra. Lo de la empresa lo acota
 * el propio agente con comoDato al armar su mensaje (src/lib/ai/agents/lente-*.ts): así la valla está donde nace el
 * mensaje, y tests/valla-por-agente.test.ts la encuentra.
 */
export type MaterialLente = { cabecera: string; paquete: string; lineas: string; poder: string; instruccion: string };

export function materialLente(lente: Lente, paquete: Paquete, calculos: Calculos): MaterialLente {
  const camino = lente === "dinero" ? "el camino A (el del dinero)" : "el camino B (el de la operación y el terreno)";
  return {
    cabecera: cabecera(paquete, calculos),
    paquete: textoDelPaquete(paquete, calculos).texto,
    lineas: lineasYPartes(calculos),
    poder: poderOrdenado(paquete, calculos),
    instruccion: `Piensa ${camino} para esta empresa y devuelve tu salida. Cita solo ids que aparecen arriba.`,
  };
}

/** Proyecta el camino de una lente con sus propios supuestos (solo los que pueden entrar en las cuentas). */
export function proyectarLente(letra: LetraCamino, salida: SalidaLente, paquete: Paquete, calculos: Calculos): ProyeccionCamino {
  const refs = refsDeBase(paquete, calculos);
  const supuestos: SupuestoCuenta[] = salida.supuestos
    .filter((s) => !problemaDeSupuesto(s, refs))
    .map((s) => ({ id: s.id, clave: s.clave, rango: { bajo: s.rango.bajo, alto: s.rango.alto }, que_se_supone: s.que_se_supone }));
  return proyectarCamino(
    letra,
    salida.camino.jugadas.map((j, i) => ({ id: `J${i + 1}`, efecto: j.efecto, desde_dia: j.desde_dia })),
    { calculos, refs, supuestos, modelo: paquete.empresa.modelo_negocio[0] ?? null }
  );
}

/** Las dos proyecciones que ve el equipo rojo. Las hace el código, con lo congelado. */
export function proyectarLentes(paquete: Paquete, calculos: Calculos, dinero: SalidaLenteDinero, terreno: SalidaLenteTerreno): ProyeccionesLentes {
  return { a: proyectarLente("a", dinero, paquete, calculos), b: proyectarLente("b", terreno, paquete, calculos) };
}

/** Lo que calculó 8X para un camino, con los ids R: que el equipo rojo puede citar. Lo que vale cero no se escribe. */
function lineasProyeccion(letra: LetraCamino, pc: ProyeccionCamino, calculos: Calculos, salida: SalidaLente): string {
  const refs = refsDeProyeccion(pc, calculos);
  const L = letra.toUpperCase();
  const valor = (id: string, sufijo = "") => {
    const r = refs.get(id);
    if (!r) return null;
    if (r.motivo_nulo) return `[${id}] sin número (${r.motivo_nulo})`;
    if (r.valor && r.valor.bajo === 0 && r.valor.alto === 0) return null;
    return `[${id}] ${r.texto}${sufijo}`;
  };
  const jugadas = pc.jugadas.map((j, i) => {
    const p = j.proyeccion;
    const cuenta =
      p.estado === "por_probar" ? `por probar: falta ${p.por_probar.map((f) => f.que_falta).join("; ")}`
      : p.estado === "invalida" ? `no se puede calcular: ${p.invalida}`
      : p.estado === "habilitador" ? `no mueve dinero por sí misma: abre ${p.abre}`
      : p.estado === "mueve_horas" ? "libera horas del dueño, no dinero"
      : [valor(`R:${letra}.${j.id}.mes`, " más al mes"), valor(`R:${letra}.${j.id}.caja`, " de caja, una vez")].filter(Boolean).join(" · ") || "no mueve dinero con estos datos";
    const que = salida.camino.jugadas[i]?.que_se_mueve ?? "";
    return `- ${L}.${j.id} (desde el día ${j.desde_dia}): ${cuenta} — ${que.length > 90 ? `${que.slice(0, 90)}…` : que}`;
  });
  const totales = [
    valor(`R:${letra}.total.d14`, " más al mes al día 14"),
    valor(`R:${letra}.total.d30`, " más al mes al día 30"),
    valor(`R:${letra}.total.d90`, " más al mes al día 90"),
    valor(`R:${letra}.total.acum.d90`, " dados en total hasta el día 90"),
    valor(`R:${letra}.caja.d90`, " de caja liberada hasta el día 90"),
    valor(`R:${letra}.utilidad.d90`, " de utilidad al mes al día 90"),
    valor(`R:${letra}.multiplo.d90`, " la utilidad de hoy, al día 90"),
  ].filter(Boolean);
  return [
    `CAMINO ${L}`,
    ...jugadas,
    "Totales del camino:",
    ...totales.map((t) => `- ${t}`),
    ...(pc.comparacion ? [`En una frase: ${pc.comparacion}.`] : []),
    ...pc.limitaciones.map((l) => `- ${l}`),
  ].join("\n");
}

/** La lista de control, para atacar con ella (el veredicto lo da el código). */
function listaDeControl(): string {
  return CLAVES_CONTROL.map((k) => `- ${LISTA_DE_CONTROL[k].nombre}: ${LISTA_DE_CONTROL[k].exige}`).join("\n");
}

/** Lo que rechazó el validador, para la reparación. */
function violacionesEnTexto(vs: readonly Violacion[]): string {
  return vs.map((v) => `- ${v.puntero} · ${v.tipo} · ${v.texto} → ${v.que_hacer}`).join("\n") || "- (ninguna)";
}

export type EntradaMaterialRojo = {
  paquete: Paquete;
  calculos: Calculos;
  dinero: SalidaLenteDinero;
  terreno: SalidaLenteTerreno;
  proyecciones: ProyeccionesLentes;
  /** Solo en la reparación: la salida anterior y lo que rechazó el validador. */
  reparacion?: { anterior: SalidaEquipoRojo; violaciones: readonly Violacion[] };
};

/**
 * El material del equipo rojo: el paquete, las dos lentes con sus ids locales (A.F1, A.T1, A.J1; B.…), lo que calculó
 * 8X para cada camino con los ids R: que puede citar, y la lista de control; en la reparación, además, su salida
 * anterior y lo que rechazó el validador. Lo que vino del modelo o de la empresa lo acota el agente con comoDato.
 */
export type MaterialRojo = {
  cabecera: string;
  paquete: string;
  lineas: string;
  caminoA: string;
  caminoB: string;
  proyecciones: string;
  lista: string;
  reparacion: { anterior: string; violaciones: string } | null;
};

export function materialEquipoRojo(x: EntradaMaterialRojo): MaterialRojo {
  return {
    cabecera: cabecera(x.paquete, x.calculos),
    paquete: textoDelPaquete(x.paquete, x.calculos).texto,
    lineas: lineasYPartes(x.calculos),
    caminoA: JSON.stringify(conIds(x.dinero, "A")),
    caminoB: JSON.stringify(conIds(x.terreno, "B")),
    proyecciones: [lineasProyeccion("a", x.proyecciones.a, x.calculos, x.dinero), lineasProyeccion("b", x.proyecciones.b, x.calculos, x.terreno)].join("\n\n"),
    lista: listaDeControl(),
    reparacion: x.reparacion ? { anterior: JSON.stringify(x.reparacion.anterior), violaciones: violacionesEnTexto(x.reparacion.violaciones) } : null,
  };
}

// ─── El cierre: armar, validar y decidir ─────────────────────────────────────────────────────────

export type EntradaCierre = { paquete: Paquete; calculos: Calculos; dinero: SalidaLenteDinero; terreno: SalidaLenteTerreno; rojo: SalidaEquipoRojo };

/** Arma la estrategia (lente + cambios del equipo rojo) y la valida contra todos sus ids. */
export function armarYValidar(x: EntradaCierre): { estrategia: Estrategia; validacion: Validacion } {
  const estrategia = armarEstrategia({ paquete: x.paquete, calculos: x.calculos, lenteDinero: x.dinero, lenteTerreno: x.terreno, rojo: x.rojo });
  const refs = refsDeEstrategia(estrategia, x.paquete, x.calculos);
  return { estrategia, validacion: validar(estrategia, refs, { partes: partesDeLineas(x.calculos) }) };
}

export type Cierre = {
  estrategia: Estrategia;
  validacion: Validacion;
  calidad: ResultadoControl[];
  estado: "lista" | "con_observaciones";
  /** Cuántas cosas quitó 8X con marca (solo cuando ya no había otra vuelta). */
  quitadas: number;
};

/**
 * Cierra una estrategia: arma, valida y, si ya no hay otra vuelta (`quitar`), quita lo inválido con marca visible y
 * vuelve a validar. El estado sale de estadoDeRevision; la lista de control, de revisarCalidad (el único veredicto).
 */
export function cerrarEstrategia(x: EntradaCierre, opciones: { quitar: boolean }): Cierre {
  let { estrategia, validacion } = armarYValidar(x);
  if (validacion.errores.length && opciones.quitar) {
    estrategia = quitarLoInvalido(estrategia, validacion.errores, { paquete: x.paquete, calculos: x.calculos });
    validacion = validar(estrategia, refsDeEstrategia(estrategia, x.paquete, x.calculos), { partes: partesDeLineas(x.calculos) });
  }
  const refs = refsDeEstrategia(estrategia, x.paquete, x.calculos);
  return {
    estrategia,
    validacion,
    calidad: revisarCalidad(estrategia, x.paquete, x.calculos, { validacion, refs }),
    estado: estadoDeRevision(estrategia, validacion),
    quitadas: estrategia.quitado.length,
  };
}

/**
 * REGLAS PURAS DEL RECORRIDO DE LOS PILOTOS. Sin base, sin modelo de IA, sin reloj.
 *
 * Lo que un consultor hace a mano cuando le llegan los papeles de una empresa: pone al lado lo que el
 * dueño dijo y lo que el documento muestra, cuenta lo que falta antes de sumar, y mira quién firma
 * todo. Aquí esas tres cosas son funciones que devuelven lo mismo cada vez y explican su respuesta.
 *
 * 13-10-2026 (remate 4): la comparación declarado/extraído sobre números (leerDeclaracion,
 * contradiccionesNumericas, filasDe, sumaSiCompleta) ya vive en src/lib/rules/contradiccion-numerica.ts
 * y la corre el producto (manejador `contrastar`, Matriz de Realidad). Aquí solo se reexporta para que
 * las pruebas de los pilotos sigan leyéndose igual. Lo que sigue viviendo en tests/ es lo que todavía
 * no tiene módulo en src: los vacíos por puesto y la dependencia de una persona en un Word, y el
 * tarifario frente a lo pactado.
 */
import { tituloDe, type Parrafo } from "@/lib/documentos/word";
import { formatoSoles } from "@/lib/rules/contradiccion-numerica";

export {
  leerDeclaracion,
  contradiccionesNumericas,
  filasDe,
  sumaSiCompleta,
  TOLERANCIA_PCT,
  type CifraDeclarada,
  type Rotulo,
  type CifraRotulada,
  type CifraPendiente,
  type VeredictoNumerico,
  type ClaseTolerancia,
  type FilaLeida,
} from "@/lib/rules/contradiccion-numerica";

const soles = formatoSoles;

// ─── Word: vacíos por puesto y dependencia de una persona ───────────────────────────────────────

export type VacioPuesto = {
  puesto: string;
  indice_titulo: number;
  vacio: "sin_funciones" | "sin_horario";
  /** El párrafo que lo delata («Funciones: POR DEFINIR.») o el título, si no hay nada debajo. */
  cita: string;
  indice: number;
};

const SIN_DEFINIR = /por definir|pendiente|sin definir|no indicad[oa]|\(no consta\)|no consta/i;

/**
 * Agrupa los párrafos bajo su título y mira qué le falta a cada puesto: un puesto sin viñetas (o con
 * «POR DEFINIR») no tiene funciones; uno cuyo horario dice «(no indicado)» o no aparece no tiene horario.
 * Solo cuenta como puesto un título que tenga debajo viñetas o una línea de horario o funciones: el
 * título del documento no es un puesto.
 */
export function vaciosPorPuesto(parrafos: Parrafo[]): VacioPuesto[] {
  const bloques = new Map<number, { titulo: Parrafo; cuerpo: Parrafo[] }>();
  for (const p of parrafos) {
    const t = tituloDe(parrafos, p.indice);
    if (!t) continue;
    const b = bloques.get(t.indice) ?? { titulo: t, cuerpo: [] };
    if (p.indice !== t.indice) b.cuerpo.push(p);
    bloques.set(t.indice, b);
  }
  const vacios: VacioPuesto[] = [];
  for (const { titulo, cuerpo } of bloques.values()) {
    const listas = cuerpo.filter((p) => p.estilo === "lista");
    const horario = cuerpo.find((p) => /^horario\s*:/i.test(p.texto));
    const funciones = cuerpo.find((p) => /^funciones\s*:/i.test(p.texto));
    const esPuesto = listas.length > 0 || !!horario || !!funciones;
    if (!esPuesto) continue;
    if (listas.length === 0 || (funciones && SIN_DEFINIR.test(funciones.texto))) {
      const cita = funciones ?? titulo;
      vacios.push({ puesto: titulo.texto, indice_titulo: titulo.indice, vacio: "sin_funciones", cita: cita.texto, indice: cita.indice });
    }
    if (!horario || SIN_DEFINIR.test(horario.texto) || /^horario\s*:\s*$/i.test(horario.texto)) {
      const cita = horario ?? titulo;
      vacios.push({ puesto: titulo.texto, indice_titulo: titulo.indice, vacio: "sin_horario", cita: cita.texto, indice: cita.indice });
    }
  }
  return vacios;
}

export type Mencion = { indice: number; texto: string; bajo: string | null };

/** Los párrafos que nombran algo, con el título bajo el que están: para citar «párrafo 14 · Rosa Mamani». */
export function menciones(parrafos: Parrafo[], patron: RegExp): Mencion[] {
  return parrafos.filter((p) => patron.test(p.texto)).map((p) => ({ indice: p.indice, texto: p.texto, bajo: tituloDe(parrafos, p.indice)?.texto ?? null }));
}

export type Dependencia = {
  /** Pasos del procedimiento: los párrafos con viñeta. */
  pasos: number;
  con_persona: number;
  indices: number[];
  /** Alguno de sus pasos dice que esa persona firma o revisa «todos». */
  firma_todo: boolean;
  citas: string[];
};

/**
 * En cuántos pasos de un procedimiento aparece una persona. No juzga si está bien o mal: cuenta y
 * cita, que es lo que el consultor necesita para preguntar «¿qué pasa si usted no está un mes?».
 */
export function dependenciaDe(parrafos: Parrafo[], persona: RegExp): Dependencia {
  const pasos = parrafos.filter((p) => p.estilo === "lista");
  const con = pasos.filter((p) => persona.test(p.texto));
  return {
    pasos: pasos.length,
    con_persona: con.length,
    indices: con.map((p) => p.indice),
    firma_todo: con.some((p) => /(firma|revisa|aprueba|autoriza)[^.]*\btodos?\b/i.test(p.texto)),
    citas: con.map((p) => `párrafo ${p.indice}: ${p.texto}`),
  };
}

// ─── Precios: el tarifario frente a lo pactado ──────────────────────────────────────────────────

export type ContradiccionPrecios = {
  tipo: "CONTRADICCION" | "COINCIDE";
  tarifa: number;
  de: number;
  /** Cuántos expedientes se pactaron a un precio distinto del tarifario. */
  distintos: number;
  minimo: number;
  maximo: number;
  ejemplos: string[];
  motivo: string;
};

/**
 * Un tarifario dice un precio; los expedientes muestran otros. Si alguno difiere, hay descuentos (o
 * recargos) que no están escritos: CONTRADICCIÓN con los casos citados, para preguntar por la regla
 * que los explica. No concluye que esté mal cobrar distinto.
 */
export function contradiccionDePrecios(tarifa: { valor: number; fuente: string }, pactados: { codigo: string; valor: number; celda: string }[]): ContradiccionPrecios {
  const distintos = pactados.filter((p) => p.valor !== tarifa.valor);
  const valores = pactados.map((p) => p.valor);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const ejemplos = distintos.slice(0, 5).map((p) => `${p.codigo} (${p.celda}): ${soles(p.valor)}`);
  if (!pactados.length) return { tipo: "COINCIDE", tarifa: tarifa.valor, de: 0, distintos: 0, minimo: NaN, maximo: NaN, ejemplos, motivo: "No hay expedientes con honorario pactado que comparar." };
  if (!distintos.length) return { tipo: "COINCIDE", tarifa: tarifa.valor, de: pactados.length, distintos: 0, minimo, maximo, ejemplos, motivo: `Los ${pactados.length} expedientes se pactaron al precio del tarifario (${soles(tarifa.valor)}, ${tarifa.fuente}).` };
  return {
    tipo: "CONTRADICCION",
    tarifa: tarifa.valor,
    de: pactados.length,
    distintos: distintos.length,
    minimo,
    maximo,
    ejemplos,
    motivo: `El tarifario dice ${soles(tarifa.valor)} (${tarifa.fuente}), pero ${distintos.length} de ${pactados.length} expedientes se pactaron a otro precio, entre ${soles(minimo)} y ${soles(maximo)}. Hay descuentos o recargos que no están escritos en ninguna parte: se pregunta cuál es la regla, no se concluye que esté mal.`,
  };
}

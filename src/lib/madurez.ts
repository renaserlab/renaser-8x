/**
 * LA MADUREZ: el número que le dice al dueño que está avanzando de verdad.
 *
 * Los cinco niveles vienen de CMMI —Inicial, Gestionado, Definido, Gestionado cuantitativamente,
 * Optimizando— que es el modelo con el que el mundo mide qué tan maduros son los procesos de una
 * organización. Aquí están dichos en castellano de dueño y, sobre todo, **se calculan**: cada nivel
 * se gana con algo comprobable en la base, no con la opinión de nadie.
 *
 * Esto es lo que separa «te hicimos unos documentos» de «tu empresa pasó de nivel 1 a nivel 3».
 */
export type Nivel = 0 | 1 | 2 | 3 | 4 | 5;

export type DefNivel = { nivel: Nivel; nombre: string; queSignifica: string; cmmi: string };

export const NIVELES: DefNivel[] = [
  { nivel: 0, nombre: "Sin mapear", queSignifica: "Nadie ha dibujado cómo funciona esto todavía", cmmi: "—" },
  { nivel: 1, nombre: "Contado", queSignifica: "Está dibujado: se sabe cómo funciona hoy, aunque solo viva en la cabeza de alguien", cmmi: "Inicial" },
  { nivel: 2, nombre: "Ordenado", queSignifica: "Tiene dueño, tiempos y se sabe qué entra y qué sale: ya no depende de a quién le preguntes", cmmi: "Gestionado" },
  { nivel: 3, nombre: "Escrito", queSignifica: "Está escrito paso a paso: alguien nuevo podría hacerlo leyendo", cmmi: "Definido" },
  { nivel: 4, nombre: "Medido", queSignifica: "Tiene un número que se anota de verdad, no solo una meta escrita", cmmi: "Gestionado cuantitativamente" },
  { nivel: 5, nombre: "Mejorando", queSignifica: "Ese número se movió a mejor contra el punto de partida", cmmi: "Optimizando" },
];

export const NIVEL = new Map(NIVELES.map((n) => [n.nivel, n]));

/** Lo que hay que tener para subir de nivel. Es lo que se le muestra al dueño como siguiente paso. */
export type Evaluacion = {
  nivel: Nivel;
  nombre: string;
  /** Qué falta EXACTAMENTE para el siguiente nivel. Null si ya está arriba del todo. */
  siguiente: string | null;
  /** Qué se comprobó para dar cada nivel. La madurez se sustenta, no se declara. */
  porque: string[];
};

export type ProcesoParaMedir = {
  nodos: number;
  responsable?: string | null;
  tiempo?: string | null;
  proveedor?: string | null;
  cliente_proceso?: string | null;
  inicio?: string | null;
  resultado?: string | null;
  /** ¿Tiene un documento escrito y aprobado que lo describe? */
  documentado?: boolean;
  indicador?: string | null;
  /** ¿Ese indicador tiene valores anotados de verdad, no solo la meta? */
  medicionesReales?: number;
  /** ¿El número mejoró contra la línea base? null si aún no hay con qué comparar. */
  mejoro?: boolean | null;
};

const lleno = (s: string | null | undefined) => !!s && s.trim().length > 1;

/**
 * Mide un proceso. Los niveles son acumulativos y se caen al primero que falla: no tiene sentido
 * decir que algo está «medido» si nadie sabe quién responde por ello.
 */
export function madurezProceso(p: ProcesoParaMedir): Evaluacion {
  const porque: string[] = [];

  if (p.nodos < 2) return { nivel: 0, nombre: NIVEL.get(0)!.nombre, siguiente: "Cuéntanos cómo funciona y lo dibujamos", porque: [] };
  porque.push(`Dibujado con ${p.nodos} pasos`);

  // SIPOC completo: quién lo hace, cuánto toma, qué entra, de quién, qué sale y para quién.
  const sipoc = [
    ["quién responde", lleno(p.responsable)],
    ["cuánto toma", lleno(p.tiempo)],
    ["qué lo inicia", lleno(p.inicio)],
    ["con qué termina", lleno(p.resultado)],
    ["quién entrega lo que necesita", lleno(p.proveedor)],
    ["quién recibe el resultado", lleno(p.cliente_proceso)],
  ] as const;
  const faltanSipoc = sipoc.filter(([, ok]) => !ok).map(([n]) => n);
  if (faltanSipoc.length) return { nivel: 1, nombre: NIVEL.get(1)!.nombre, siguiente: `Falta decir ${faltanSipoc.join(", ")}`, porque };
  porque.push("Tiene dueño, tiempos, y se sabe qué entra y qué sale");

  if (!p.documentado) return { nivel: 2, nombre: NIVEL.get(2)!.nombre, siguiente: "Falta escribirlo paso a paso para que alguien nuevo pueda hacerlo leyendo", porque };
  porque.push("Escrito paso a paso");

  if (!lleno(p.indicador)) return { nivel: 3, nombre: NIVEL.get(3)!.nombre, siguiente: "Falta el número que dice si va bien", porque };
  if ((p.medicionesReales ?? 0) < 2) return { nivel: 3, nombre: NIVEL.get(3)!.nombre, siguiente: "Tiene número, pero falta anotarlo al menos dos veces para poder comparar", porque };
  porque.push(`Su número se anotó ${p.medicionesReales} veces`);

  if (p.mejoro !== true) return { nivel: 4, nombre: NIVEL.get(4)!.nombre, siguiente: p.mejoro === false ? "El número empeoró: hay que corregir antes de subir" : "Falta que el número mejore contra el punto de partida", porque };
  porque.push("El número mejoró contra el punto de partida");
  return { nivel: 5, nombre: NIVEL.get(5)!.nombre, siguiente: null, porque };
}

/**
 * La madurez de la EMPRESA es el promedio de sus procesos, pero contando también los que debería
 * tener y no tiene: una empresa con un proceso perfecto y catorce sin mapear no está en nivel 5.
 * Contar solo lo hecho es la forma más fácil de mentirle a un cliente con un número bonito.
 */
export function madurezEmpresa(evaluaciones: Evaluacion[], procesosEsperados: number): { nivel: number; nombre: string; mapeados: number; esperados: number; nivelMapeados: number; nombreMapeados: string } {
  const total = Math.max(procesosEsperados, evaluaciones.length);
  const vacio = { nivel: 0, nombre: NIVEL.get(0)!.nombre, mapeados: 0, esperados: 0, nivelMapeados: 0, nombreMapeados: NIVEL.get(0)!.nombre };
  if (total === 0) return vacio;
  const suma = evaluaciones.reduce((s, e) => s + e.nivel, 0);
  const redondear = (n: number) => Math.round(n * 10) / 10;
  const nombreDe = (n: number) => NIVEL.get(Math.floor(n) as Nivel)?.nombre ?? NIVEL.get(0)!.nombre;
  const nivel = suma / total;
  // El promedio SOLO de lo mapeado. Sin este segundo número, «nivel 0,3 · Sin mapear» al lado de
  // «6 procesos mapeados» se lee como un error nuestro, y no lo es: son dos preguntas distintas.
  const nivelMapeados = evaluaciones.length ? suma / evaluaciones.length : 0;
  return {
    nivel: redondear(nivel),
    nombre: nombreDe(nivel),
    mapeados: evaluaciones.length,
    esperados: total,
    nivelMapeados: redondear(nivelMapeados),
    nombreMapeados: nombreDe(nivelMapeados),
  };
}

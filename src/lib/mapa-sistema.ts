/**
 * EL MAPA DEL SISTEMA — el visor de agentes y automatizaciones (manual §7).
 *
 * Kelin lo pidió así: «un visor tipo n8n, donde voy a ver cada uno cómo hace». La torre que había
 * era una LISTA. Una lista dice qué existe; un mapa dice cómo se conecta, y eso es lo que permite
 * entender por dónde pasa el trabajo y dónde se detiene.
 *
 * EL MAPA NO SE DIBUJA A MANO. Cada nodo es un tipo de trabajo registrado en el worker, cada flecha
 * es una llamada real a `encolar()` dentro de un manejador, y cada entrada es una ruta de la API que
 * lo dispara. Todo se declara aquí y una prueba lo contrasta contra el código: si alguien conecta
 * dos trabajos y no actualiza el mapa, la prueba falla. Un diagrama que se desvía del sistema es
 * peor que no tener diagrama, porque se le cree.
 *
 * LO QUE EL MAPA DEJÓ VER EL PRIMER DÍA: de diecinueve tipos de trabajo, solo TRES encolan a otro.
 * El resto arranca porque una persona pulsa algo. 8X encadena mucho menos de lo que parecía.
 */
import { supabaseAdmin } from "./supabase/admin";
import { CONTRATOS, esAgenteConocido, type ClaveAgente } from "./agentes/contratos";

/** Las fases del recorrido empresarial. Ordenan el mapa de izquierda a derecha. */
export const FASES = [
  { clave: "entrada", nombre: "Entra información" },
  { clave: "evidencia", nombre: "Se vuelve evidencia" },
  { clave: "diagnostico", nombre: "Diagnóstico" },
  { clave: "diseno", nombre: "Diseño y estructura" },
  { clave: "entrega", nombre: "Entregables" },
  { clave: "seguimiento", nombre: "Seguimiento" },
] as const;
export type ClaveFase = (typeof FASES)[number]["clave"];

export type NodoSistema = {
  /** El tipo de trabajo, tal como lo registra el worker. */
  tipo: string;
  nombre: string;
  fase: ClaveFase;
  /** Qué agentes corren dentro de este trabajo. Vacío = no llama al modelo. */
  agentes: ClaveAgente[];
  /** Rutas de la API que lo disparan. Vacío = solo lo encola otro trabajo. */
  disparadores: string[];
  /** Tipos de trabajo que ESTE encola al terminar. */
  encola: string[];
  /** Qué hace, en una línea, para quien abre el mapa sin conocer el sistema. */
  hace: string;
};

/**
 * EL MAPA. Los campos `disparadores` y `encola` se verifican contra el código en
 * `tests/mapa-sistema.test.ts`: no son documentación, son una afirmación comprobable.
 */
export const NODOS: NodoSistema[] = [
  {
    tipo: "ficha_direccion", nombre: "Dirección empresarial", fase: "diseno", agentes: ["director"],
    disparadores: [], encola: [],
    hace: "Prepara la visión de la empresa y las interpretaciones pendientes de revisión de la consultora.",
  },
  {
    tipo: "evaluar_admision", nombre: "Admisión", fase: "entrada", agentes: ["admision"],
    disparadores: ["/companies/[id]/admission"], encola: [],
    hace: "Decide si una empresa que se registra puede ser atendida, y con qué advertencias.",
  },
  {
    tipo: "entrevista_siguiente", nombre: "La conversación", fase: "entrada", agentes: ["entrevistador"],
    disparadores: ["/portal/empresa"], encola: ["minar_know_how", "extraer", "entrevista_siguiente"],
    hace: "Hace LA siguiente pregunta: la de más valor, respondible hablando.",
  },
  {
    tipo: "transcribir_respuesta", nombre: "Transcribir la voz", fase: "entrada", agentes: [],
    disparadores: [], encola: [],
    hace: "Pasa a texto lo que el dueño grabó. Si no se escuchó nada, lo dice en vez de inventar.",
  },
  {
    tipo: "extraer", nombre: "Extraer afirmaciones", fase: "evidencia", agentes: ["extractor"],
    disparadores: ["/sources", "/sources/[id]/extract", "/claims/[id]/validate", "/companies/[id]/assets/confirmar", "/processes/[id]/confirmar"],
    encola: ["extraer", "contrastar"],
    hace: "Saca de un documento o una respuesta las afirmaciones verificables, con su fecha.",
  },
  {
    tipo: "contrastar", nombre: "Cruzar y contradecir", fase: "evidencia", agentes: ["contrastador"],
    disparadores: ["/companies/[id]/contrast"], encola: [],
    hace: "Cruza cada afirmación nueva contra lo ya dicho y detecta contradicciones vigentes.",
  },
  {
    tipo: "minar_know_how", nombre: "Minar el saber del equipo", fase: "evidencia", agentes: ["minero"],
    disparadores: ["/interviews/[sesion]/knowhow"], encola: [],
    hace: "Saca de cada puesto la regla práctica que nadie escribió.",
  },
  {
    tipo: "diagnosticar", nombre: "Diagnosticar un pilar", fase: "diagnostico", agentes: ["diagnosticador", "auditor"],
    disparadores: ["/companies/[id]/diagnose", "/findings/[id]/review"], encola: ["consolidar"],
    hace: "Encuentra los hallazgos del pilar y los audita contra su evidencia antes de mostrarlos.",
  },
  {
    tipo: "consolidar", nombre: "Consolidar hallazgos", fase: "diagnostico", agentes: [],
    disparadores: [], encola: [],
    hace: "Junta los hallazgos de los pilares y quita los repetidos. No llama al modelo.",
  },
  {
    tipo: "generar_proceso", nombre: "Dibujar un proceso", fase: "diseno", agentes: ["arquitecto"],
    disparadores: ["/processes/generate"], encola: [],
    hace: "Dibuja el proceso REAL que la persona describe, con sus tiempos y sus huecos honestos.",
  },
  {
    tipo: "generar_tobe", nombre: "Rediseñar el proceso", fase: "diseno", agentes: ["rediseno"],
    disparadores: ["/processes/[id]/tobe"], encola: [],
    hace: "Propone el proceso mejorado conservando lo que sirve, con el porqué de cada cambio.",
  },
  {
    tipo: "estudio_organigrama", nombre: "Estudio de organigrama", fase: "diseno", agentes: ["organizador"],
    disparadores: ["/companies/[id]/organigrama/estudio"], encola: [],
    hace: "Diseña dos estructuras posibles con sus ventajas, y dice qué falta levantar.",
  },
  {
    tipo: "modelo_alto_rendimiento", nombre: "Cómo debe ser", fase: "diseno", agentes: ["investigador"],
    disparadores: ["/companies/[id]/modelo"], encola: [],
    hace: "Describe el mejor negocio DE SU TAMAÑO en ese rubro, como referencia, nunca como hecho.",
  },
  {
    tipo: "plan_estrategico", nombre: "Plan estratégico", fase: "diseno", agentes: ["estratega"],
    disparadores: ["/companies/[id]/plan-estrategico"], encola: [],
    hace: "Redacta el plan con el estándar de una firma top, todo salido de la evidencia.",
  },
  {
    tipo: "planificar", nombre: "Plan de 90 días", fase: "entrega", agentes: ["planificador"],
    disparadores: ["/companies/[id]/plan"], encola: [],
    hace: "Convierte los hallazgos en acciones que alguien concreto puede empezar el lunes.",
  },
  {
    tipo: "generar_sop", nombre: "Procedimiento escrito", fase: "entrega", agentes: ["sop"],
    disparadores: ["/processes/[id]/sop"], encola: [],
    hace: "Escribe el paso a paso que se imprime y se pega en la pared.",
  },
  {
    tipo: "construir_activo", nombre: "Construir un documento", fase: "entrega", agentes: ["constructor"],
    disparadores: ["/companies/[id]/assets/construir"], encola: [],
    hace: "Redacta un documento empresarial con lo que la empresa ya mostró, nunca con plantilla.",
  },
  {
    tipo: "sistematizar_activo", nombre: "Mejorar el documento", fase: "entrega", agentes: ["sistematizador"],
    disparadores: ["/companies/[id]/assets/sistematizar"], encola: [],
    hace: "Mejora el documento que el dueño confirmó, anclando cada cambio en un hallazgo.",
  },
  {
    tipo: "redactar_entregables", nombre: "Publicar los entregables", fase: "entrega", agentes: ["redactor"],
    disparadores: ["/companies/[id]/publish"], encola: [],
    hace: "Redacta el informe que el dueño lee, en sus palabras y sin jerga.",
  },
  {
    tipo: "proponer_indicadores", nombre: "Proponer indicadores", fase: "seguimiento", agentes: ["medidor"],
    disparadores: ["/companies/[id]/indicadores"], encola: [],
    hace: "Saca de las incidencias los números que el dueño pueda contar él mismo.",
  },
];

export const NODO = new Map(NODOS.map((n) => [n.tipo, n]));

/** Una flecha: este trabajo encola aquel. */
export type Arista = { de: string; a: string; tipo: "encola" };

export const ARISTAS: Arista[] = NODOS.flatMap((n) =>
  n.encola.filter((t) => t !== n.tipo).map((t) => ({ de: n.tipo, a: t, tipo: "encola" as const }))
);

/** Un trabajo que se encola a sí mismo: trocear un PDF largo. Se marca aparte para no dibujar un bucle. */
export const AUTO_ENCOLA = NODOS.filter((n) => n.encola.includes(n.tipo)).map((n) => n.tipo);

export type NodoConDatos = NodoSistema & {
  trabajos: number;
  hechos: number;
  fallidos: number;
  enCurso: number;
  ultimo: string | null;
  /** Agentes de este nodo que tienen huella de haber corrido alguna vez. */
  agentesConHuella: string[];
};

/**
 * El mapa con lo que de verdad ha pasado por cada nodo. Los conteos salen de `jobs`, agrupados en la
 * base: contar en memoria se truncaría a 1.000 filas y mostraría menos como si fuera todo.
 */
export async function mapaConDatos(companyId?: string): Promise<{ nodos: NodoConDatos[]; aristas: Arista[]; autoEncola: string[] }> {
  const sb = supabaseAdmin();
  let q = sb.from("jobs").select("tipo,estado,created_at");
  if (companyId) q = q.eq("company_id", companyId);
  const [{ data: trabajos }, { data: huellas }] = await Promise.all([q.limit(5000), sb.from("agente_huella").select("agente,llamadas")]);

  const conHuella = new Set((huellas ?? []).filter((h) => Number(h.llamadas) > 0).map((h) => String(h.agente)));
  const por = new Map<string, { n: number; h: number; f: number; c: number; ultimo: string | null }>();
  for (const t of trabajos ?? []) {
    const k = String(t.tipo);
    const a = por.get(k) ?? { n: 0, h: 0, f: 0, c: 0, ultimo: null };
    a.n += 1;
    if (t.estado === "hecho") a.h += 1;
    else if (t.estado === "fallido") a.f += 1;
    else a.c += 1;
    const cuando = String(t.created_at);
    if (!a.ultimo || cuando > a.ultimo) a.ultimo = cuando;
    por.set(k, a);
  }

  return {
    nodos: NODOS.map((n) => {
      const d = por.get(n.tipo);
      return {
        ...n,
        trabajos: d?.n ?? 0,
        hechos: d?.h ?? 0,
        fallidos: d?.f ?? 0,
        enCurso: d?.c ?? 0,
        ultimo: d?.ultimo ?? null,
        agentesConHuella: n.agentes.filter((a) => conHuella.has(a)),
      };
    }),
    aristas: ARISTAS,
    autoEncola: AUTO_ENCOLA,
  };
}

/** Los agentes con contrato que NO aparecen en ningún nodo del mapa: estarían fuera del sistema. */
export function agentesFueraDelMapa(): string[] {
  const enMapa = new Set(NODOS.flatMap((n) => n.agentes));
  return Object.keys(CONTRATOS).filter((c) => !enMapa.has(c as ClaveAgente) && esAgenteConocido(c));
}

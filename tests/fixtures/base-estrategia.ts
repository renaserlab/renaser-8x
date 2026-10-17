/**
 * LA BASE FALSA Y EL PROVEEDOR FALSO DE LA ESTRATEGIA (spec-estrategia-8x.md §9.1).
 *
 *  - `crearBaseEstrategia`: `crearBaseFalsa` con lo que el motor necesita y la base de la otra tarea no tiene: las
 *    claves únicas de `estrategias` (una por número de versión, una en curso y una aprobada por empresa),
 *    `estrategia_preguntas` (una abierta por clave) y `jobs` (la clave idempotente), y las funciones de la base que el
 *    motor llama (`estrategia_lente_lista`, `aprobar_estrategia`, `tokens_de_empresa` y las del cortacircuitos), con la
 *    misma regla que su SQL en supabase/migracion-estrategia.sql.
 *  - `sembrarEmpresa`: convierte las entradas de una empresa ficticia (tests/fixtures/estrategia-falsa.ts) en filas de
 *    sus tablas, para leerlas con leerEntradasPaquete como se leerían de la base de verdad.
 *  - `proveedorFalso`: un proveedor de IA que devuelve las salidas falsas que se le den por agente y CUENTA las
 *    llamadas (con su agente, si fue larga y lo que recibió). Ningún modelo real.
 *
 * Empresas ficticias: nada de un cliente real.
 */
import { crearBaseFalsa, type ErrorFalso, type Fila } from "./base-falsa";
import type { EntradasPaquete } from "@/lib/estrategia/paquete";
import type { AIProvider, CompleteParams, CompleteResult } from "@/lib/ai/provider";

const abierta = (f: Fila) => f.estado === "propuesta" || f.estado === "enviada";
/** Una copia sin unas claves (lo que en la base vive en otra tabla). */
const sin = (f: object, claves: string[]): Fila => Object.fromEntries(Object.entries(f).filter(([k]) => !claves.includes(k)));

export function crearBaseEstrategia(inicial: Record<string, Fila[]> = {}, fallos: Record<string, ErrorFalso> = {}) {
  const b = crearBaseFalsa(inicial, fallos, {
    unicas: {
      estrategias: (a, b) =>
        a.company_id === b.company_id && (a.version === b.version || (a.estado === "en_curso" && b.estado === "en_curso") || (a.estado === "aprobada" && b.estado === "aprobada")),
      estrategia_preguntas: (a, b) => a.company_id === b.company_id && a.clave === b.clave && abierta(a) && abierta(b),
      jobs: (a, b) => a.idempotency_key != null && a.idempotency_key === b.idempotency_key,
    },
    rpc: {
      // La misma regla que el SQL: solo escribe en una versión en curso, y dice si después de guardar están las dos.
      estrategia_lente_lista: (args, tablas) => {
        if (args.p_lente !== "dinero" && args.p_lente !== "terreno") return { data: null, error: { code: "P0001", message: `Lente desconocida: ${String(args.p_lente)}` } };
        const v = (tablas.estrategias ?? []).find((f) => f.id === args.p_id && f.estado === "en_curso");
        if (!v) return { data: false, error: null };
        v[args.p_lente === "dinero" ? "lente_dinero" : "lente_terreno"] = structuredClone(args.p_salida);
        v.updated_at = new Date().toISOString();
        return { data: v.lente_dinero != null && v.lente_terreno != null, error: null };
      },
      aprobar_estrategia: (args, tablas) => {
        const filas = tablas.estrategias ?? [];
        const v = filas.find((f) => f.id === args.p_id);
        if (!v) return { data: null, error: { code: "P0001", message: "La estrategia no existe." } };
        // Bloqueo optimista, como el SQL: si la fila cambió después de leerla, no se aprueba.
        if (args.p_updated_at != null && v.updated_at !== args.p_updated_at) return { data: null, error: { code: "P0001", message: "La estrategia cambió mientras tanto: vuelve a cargarla antes de aprobar." } };
        if (v.estado !== "lista") return { data: null, error: { code: "P0001", message: `Solo se aprueba una estrategia lista (esta está en «${String(v.estado)}»).` } };
        if (!v.camino_elegido) return { data: null, error: { code: "P0001", message: "Falta elegir el camino." } };
        for (const f of filas) if (f.company_id === v.company_id && f.estado === "aprobada") f.estado = "reemplazada";
        Object.assign(v, { estado: "aprobada", para_dueno: args.p_para_dueno, aprobada_por: args.p_por, aprobada_at: new Date().toISOString(), motivo_eleccion: args.p_motivo ?? v.motivo_eleccion, updated_at: new Date().toISOString() });
        return { data: null, error: null };
      },
      tokens_de_empresa: (args, tablas) => ({
        data: (tablas.token_usage ?? []).filter((t) => t.company_id === args.p_company).reduce((s, t) => s + Number(t.tokens_entrada ?? 0) + Number(t.tokens_salida ?? 0), 0),
        error: null,
      }),
      marcar_agente: () => ({ data: null, error: null }),
      circuito_abierto: () => ({ data: false, error: null }),
      circuito_fallo: () => ({ data: false, error: null }),
      circuito_exito: () => ({ data: null, error: null }),
    },
  });
  // Lo que la cola necesita y la base de la otra tarea no trae (sin tocarla): un trabajo nace «pendiente» con sus
  // intentos en cero, como en schema.sql, y `.contains()` (reencolarSeguro acota con él en SQL y después compara el
  // payload exacto en código: aquí no acota y deja esa comparación, que es la que decide).
  const fromBase = b.from;
  const from = (tabla: string) => {
    const q = fromBase(tabla);
    if (tabla === "jobs") {
      const insertar = q.insert;
      q.insert = (f: Fila | Fila[]) => insertar((Array.isArray(f) ? f : [f]).map((x) => ({ estado: "pendiente", intentos: 0, max_intentos: 3, error: null, resultado: null, progreso: null, ...x })));
    }
    return Object.assign(q, { contains: () => q });
  };
  return { ...b, from };
}
export type BaseEstrategia = ReturnType<typeof crearBaseEstrategia>;

/**
 * Las filas de las tablas de una empresa, a partir de sus entradas ficticias. Lo que en la base vive en otra tabla
 * (la fuente de una afirmación, la persona que la dijo, la evidencia de un hallazgo) se separa en su tabla.
 */
export function sembrarEmpresa(e: EntradasPaquete, companyId: string, extra: { tope_tokens?: number; nombre?: string } = {}): Record<string, Fila[]> {
  const participantes: Fila[] = e.participantes.map((p) => ({ ...p, company_id: companyId }));
  const fuentes: Fila[] = [];
  const claims: Fila[] = e.claims.map((c, i) => {
    let participant_id: string | null = null;
    if (c.persona) {
      const igual = participantes.find((p) => p.rol === c.persona!.rol && (p.puesto ?? null) === (c.persona!.puesto ?? null));
      if (igual) participant_id = String(igual.id);
      else {
        const nueva = { id: `${companyId}-persona-${i}`, company_id: companyId, nombre: c.persona.puesto ?? "Sin nombre", puesto: c.persona.puesto, rol: c.persona.rol };
        participantes.push(nueva);
        participant_id = nueva.id;
      }
    }
    let source_id: string | null = null;
    if (c.fuente) {
      source_id = `${companyId}-fuente-${i}`;
      fuentes.push({ id: source_id, company_id: companyId, nombre: `fuente ${i}`, ...c.fuente });
    }
    return { ...sin(c, ["fuente", "persona"]), company_id: companyId, source_id, participant_id };
  });
  const evidencia: Fila[] = e.findings.flatMap((f) => f.claim_ids.map((claim_id) => ({ finding_id: f.id, claim_id, relacion: "sustenta" })));
  const costos: Fila[] = e.costos.map((c) => {
    const d = c.dato as { valor?: number; desde?: number; hasta?: number; estado?: string };
    return { id: c.id, company_id: companyId, periodo: c.periodo, tipo: c.tipo, nombre: c.nombre, monto: d.valor ?? null, monto_desde: d.desde ?? null, monto_hasta: d.hasta ?? null, estado: d.estado ?? "estimado", nota: c.nota, orden: 0 };
  });
  return {
    companies: [{ id: companyId, nombre: extra.nombre ?? "Empresa ficticia", ...e.empresa, tope_tokens: extra.tope_tokens ?? 2_000_000 }],
    company_metricas: e.metricas.map((m) => ({ ...m, company_id: companyId })),
    lineas_producto: e.lineas.map((l) => ({ ...l, company_id: companyId })),
    costos_mes: costos,
    ficha_negocio: [{ company_id: companyId, ...structuredClone(e.ficha_negocio) }],
    operaciones_moneda: e.operaciones.map((o) => ({ ...o, company_id: companyId })),
    sources: fuentes,
    participants: participantes,
    claims,
    findings: e.findings.map((f) => ({ ...sin(f, ["claim_ids"]), company_id: companyId })),
    finding_evidence: evidencia,
    ficha_direccion: e.ficha_direccion ? [{ ...structuredClone(e.ficha_direccion), id: `${companyId}-ficha`, company_id: companyId, version: 1, estado: "acordada" }] : [],
    processes: e.procesos.map((p) => ({ ...p, company_id: companyId, version: "as_is" })),
    estrategia_preguntas: e.respuestas.map((r) => ({ ...r, company_id: companyId, estado: "respondida" })),
    modelo_alto_rendimiento: [],
  };
}

export type Llamada = { agente: string | undefined; largo: boolean; system: string; user: string; maxTokens: number | undefined };
type Respuesta = object | ((p: CompleteParams<unknown>, n: number) => unknown);

/**
 * Un proveedor de IA falso: para cada agente, la salida que devuelve (o una función que la arma, o que lanza). Cuenta
 * las llamadas. La salida se valida contra el esquema de la llamada, como haría el proveedor de verdad.
 */
export function proveedorFalso(respuestas: Partial<Record<"lente_dinero" | "lente_terreno" | "equipo_rojo", Respuesta>>) {
  const llamadas: Llamada[] = [];
  const proveedor: AIProvider = {
    async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
      llamadas.push({ agente: p.agente, largo: p.largo === true, system: p.system, user: p.user, maxTokens: p.maxTokens });
      const r = respuestas[p.agente as keyof typeof respuestas];
      if (r === undefined) throw new Error(`El proveedor falso no tiene respuesta para «${p.agente}».`);
      const n = llamadas.filter((l) => l.agente === p.agente).length;
      const salida = typeof r === "function" ? await (r as (p: CompleteParams<unknown>, n: number) => unknown)(p as CompleteParams<unknown>, n) : structuredClone(r);
      const data = p.schema.parse(salida);
      return { data, tokens_entrada: 1000, tokens_salida: 500, modelo: "modelo-falso", latencia_ms: 1, intentos: 1 };
    },
    async transcribe() {
      throw new Error("El proveedor falso no transcribe.");
    },
    puedeTranscribir: () => false,
  };
  return { proveedor, llamadas };
}

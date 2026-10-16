/**
 * LA FICHA DE DIRECCIÓN EMPRESARIAL (R8.1) — con dobles.
 *
 * Hasta el 13-10-2026 lo que el dueño quiere para su empresa vivía en un campo de texto libre y en respuestas
 * sueltas. La ficha lo ordena en diez bloques y describe de quién depende la empresa, con cuatro reglas que
 * estas pruebas no dejan que se rompan:
 *
 *  1. NADA SE INVENTA. El borrador se arma solo con lo que ya hay (afirmaciones confirmadas, respuestas de la
 *     entrada breve, números con valor, procesos del mapa), cada frase con su fuente. La falta de dato no es cero.
 *  2. LA DEPENDENCIA SE DESCRIBE, NO SE PUNTÚA. «Participa en 6 de 8 procesos» es un dato; un porcentaje no sale
 *     de este código, ni el del asistente entra.
 *  3. LO QUE DIJO EL DUEÑO, LO QUE INTERPRETAMOS Y LO QUE ACORDAMOS NO SE MEZCLAN. Lo que propone el asistente
 *     entra como interpretación sin revisar y no llega a una versión acordada hasta que la consultora lo revisa.
 *  4. NADA SE BORRA. Acordar exige autoridad y crea una versión nueva; la anterior queda reemplazada.
 *  5. «DIJO EL DUEÑO» ES SOLO LO QUE DIJO EL DUEÑO. Lo que quiere una empleada o lo que la consultora anotó en
 *     campo no entra como declaración suya, y la ficha avisa cuántas afirmaciones quedaron fuera.
 *  6. NADIE PISA A NADIE. Lo que la consultora corrige mientras el asistente lee no se pierde: cada guardado
 *     comprueba la revisión del borrador.
 *  7. LA MONEDA ES LA DE LA EMPRESA, y al dueño se le habla de tú, también en los números.
 *
 * Aquí no hay base real ni modelo: `supabaseAdmin()` es una base falsa en memoria (filtros, orden, inserción,
 * actualización y la clave única de versión), el proveedor de IA es un doble, y las pantallas se pintan en el
 * servidor con `renderToStaticMarkup`. Lo que la tabla y sus políticas hacen de verdad lo prueba
 * tests/sql/ficha-direccion.test.ts sobre Postgres embebido. Ninguna pantalla se abrió en un navegador.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const estado = vi.hoisted(() => ({ base: null as null | ReturnType<typeof crearBaseFalsa> }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), usuarioActual: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, restantes: 99, reiniciaEn: 0 })),
}));
vi.mock("@/lib/portal", () => ({ contextoPortal: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/",
  redirect: (a: string) => {
    throw new Error(`redirección a ${a}`);
  },
}));
// El avance de un trabajo se suscribe a la base desde el navegador: aquí no hay navegador.
vi.mock("@/components/base/Progreso", () => ({ Progreso: () => null }));

import {
  armarBorrador, prepararBorrador, fusionar, guardarFicha, actualizarBorrador, borradorVigente, acordadaVigente, historial, acordar,
  clasificarDeclaraciones, vozDe, avisoDeFuera, contarProcesosDelDueno, textoProcesosCliente, distancia, itemsDeDistancia, textoPorPilar, comparablesHoyDeseado,
  numerosDeHoy, numerosDeFicha, elegirNumeros, formatoDeEmpresa, leerVistaCliente, rutaConstancia, tieneQueAcordar,
  BorradorCambio, MOTIVO_MIDE_EN_BLOQUE, ETIQUETA_DOCUMENTO, type Voces,
  editarItem, agregarItem, darPorBueno, descartarItem, recuperarItem, anotarCifra, editarDimension, darPorBuenaDimension,
  incorporarInterpretaciones, pendientesDeRevision, mideLaDependencia, juzgaALaPersona, hayMaterialParaInterpretar, contextoParaDirector, fuentesCitables,
  vistaCliente, vigentes, etiquetaDe, fichaVacia, describirFuentes, fuentesDe,
  SalidaDirector, ReglaDeFicha, BLOQUES_FICHA, DIMENSIONES_DEPENDENCIA, NOMBRE_BLOQUE, TIPOS_ITEM, CLAVE_ENTRADA_A_FICHA, TEXTO_ASISTENTE_EN_PAUSA, TEXTO_SIN_EVIDENCIA,
  type Ficha, type Item, type Numero, type SalidaDirectorT,
} from "@/lib/ficha-direccion";
import { handleFichaDireccion, PROMPT_DIRECTOR, MOTIVO_BORRADOR_REEMPLAZADO } from "@/lib/jobs/handlers/ficha-direccion";
import { moneda as escribirMoneda, type ConfigEmpresa } from "@/lib/formato";
import { usarProveedor, AIProviderPausedError } from "@/lib/ai";
import type { AIProvider, CompleteParams } from "@/lib/ai/provider";
import { CONTRATOS, aplicarContrato } from "@/lib/agentes/contratos";
import { CLAVES_PLAN, TEXTO_CONFIRMA } from "@/lib/entrada";
import { AccesoDenegado, perfilApi, usuarioActual, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { contextoPortal } from "@/lib/portal";
import { GET as leerFicha, POST as editarFicha } from "@/app/api/companies/[id]/direccion/route";
import { POST as proponer } from "@/app/api/companies/[id]/direccion/interpretar/route";
import { POST as confirmar } from "@/app/api/companies/[id]/direccion/confirmar/route";
import DireccionPag from "@/app/(consultor)/empresa/[id]/direccion/page";
import DireccionPortal from "@/app/(cliente)/portal/direccion/page";
import ConstanciaDireccion from "@/app/(cliente)/portal/direccion/constancia/page";
import { FichaDireccion } from "@/components/direccion/FichaDireccion";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// ─── La base falsa ───────────────────────────────────────────────────────────────────────────────

/**
 * Lo mínimo de PostgREST que usan la ficha, su trabajo y sus rutas, en memoria: filtros, orden, tope, inserción,
 * actualización y la clave única (company_id, version) de `ficha_direccion`. Lo que se guarda se copia, como
 * haría una base: quien guardó no comparte objetos con lo guardado. Las consultas se resuelven al hacer `await`.
 */
function crearBaseFalsa(inicial: Record<string, Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = inicial;
  const UNICAS: Record<string, string[]> = { ficha_direccion: ["company_id", "version"] };
  let seq = 0;
  const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  /** Una columna, o un campo dentro de un jsonb como lo pide PostgREST: `dependencia->>revision` devuelve texto. */
  const campo = (f: Fila, c: string): unknown => {
    if (!c.includes("->>")) return f[c];
    const [columna, clave] = c.split("->>");
    const valor = f[columna]?.[clave];
    return valor == null ? null : String(valor);
  };
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private op: "select" | "insert" | "update" = "select";
    private filas: Fila[] = [];
    private patch: Fila = {};
    private orden: { col: string; asc: boolean } | null = null;
    private tope: number | null = null;
    private unico: "single" | "maybe" | null = null;
    constructor(private tabla: string) {}
    select() { return this; }
    insert(f: Fila | Fila[]) { this.op = "insert"; this.filas = Array.isArray(f) ? f : [f]; return this; }
    update(p: Fila) { this.op = "update"; this.patch = p; return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => campo(f, c) === v); return this; }
    is(c: string, v: unknown) { this.filtros.push((f) => (campo(f, c) ?? null) === v); return this; }
    in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    not(c: string, _op: string, v: unknown) { this.filtros.push((f) => (f[c] ?? null) !== v); return this; }
    order(col: string, o?: { ascending?: boolean }) { this.orden = { col, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.tope = n; return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }
    private ejecutar(): Fila {
      const t = (tablas[this.tabla] ??= []);
      if (this.op === "insert") {
        const salida: Fila[] = [];
        for (const f of this.filas) {
          const unica = UNICAS[this.tabla];
          if (unica && t.some((x) => unica.every((k) => x[k] === f[k]))) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${this.tabla}_${unica.join("_")}_key"` } };
          }
          seq++;
          const fila = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, created_at: "2026-10-13T15:00:00.000Z", ...copia(f) };
          t.push(fila);
          salida.push(fila);
        }
        return { data: this.unico ? salida[0] : salida, error: null };
      }
      let filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === "update") {
        for (const f of filas) Object.assign(f, copia(this.patch));
        return { data: filas, error: null };
      }
      if (this.orden) {
        const { col, asc } = this.orden;
        filas = [...filas].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)));
      }
      if (this.tope != null) filas = filas.slice(0, this.tope);
      if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `se esperaba una fila y hay ${filas.length}` } };
      if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
      return { data: filas, error: null };
    }
  }
  return { tablas, from: (t: string) => new Consulta(t), rpc: async () => ({ data: null, error: null }) };
}

// ─── La empresa sintética ────────────────────────────────────────────────────────────────────────

const EMP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora Prueba", rol: "consultor", autoridad: ["aprobar_hallazgo"] };
const SIN_AUTORIDAD: Perfil = { ...CONSULTORA, id: "33333333-3333-4333-8333-333333333333", nombre: "Consultora sin autoridad", autoridad: ["ninguna"] };
const DUENO: Perfil = { id: "11111111-1111-4111-8111-111111111111", email: "dueno@ejemplo.test", nombre: "Carlos Rojas", rol: "cliente", autoridad: [] };

const PREGUNTA_SACRIFICAR = "¿Qué no estás dispuesto a sacrificar por crecer?";

/**
 * Taller Rojas (sintético). Tiene lo que una empresa real tendría a medio levantar: afirmaciones confirmadas
 * con y sin pregunta de origen, una sin verificar, respuestas de la entrada breve (una aproximada, un «no lo sé»
 * y una confirmación de botón), números de dos meses, uno sin valor y uno descartado, y ocho procesos en el mapa.
 */
function sembrar() {
  const proceso = (n: number, nombre: string, version = "as_is") => ({ id: `p${n}`, company_id: EMP, nombre, version });
  const paso = (process_id: string, tipo: string, responsable: string | null, rol: string | null = null) => ({ process_id, tipo, etiqueta: "paso", responsable, rol });
  const base = crearBaseFalsa({
    companies: [
      { id: EMP, nombre: "Taller Rojas (sintético)", aspiracion: "Quiero dos locales y doce personas", ficha: { meta_venta_mensual: "60000", personas: "6" }, moneda: "PEN" },
      { id: OTRA, nombre: "Otra empresa (sintética)", aspiracion: null, ficha: null, moneda: "PEN" },
    ],
    users: [
      { id: CONSULTORA.id, nombre: CONSULTORA.nombre, email: CONSULTORA.email, autoridad: ["aprobar_hallazgo"] },
      { id: SIN_AUTORIDAD.id, nombre: SIN_AUTORIDAD.nombre, email: "otra@ejemplo.test", autoridad: ["ninguna"] },
      { id: DUENO.id, nombre: DUENO.nombre, email: DUENO.email, autoridad: [] },
    ],
    memberships: [{ user_id: DUENO.id, company_id: EMP, nivel: "dueno" }],
    participants: [
      { id: "part-dueno", company_id: EMP, nombre: "Carlos Rojas", rol: "dueno" },
      { id: "part-marta", company_id: EMP, nombre: "Marta Díaz", rol: "empleado" },
    ],
    interview_sessions: [
      { id: "s1", company_id: EMP, tipo: "sueno_dueno", participant_id: "part-dueno" },
      { id: "s2", company_id: EMP, tipo: "empresa_dueno", participant_id: "part-dueno" },
      { id: "s3", company_id: EMP, tipo: "entrada_breve", participant_id: "part-dueno" },
      { id: "s4", company_id: EMP, tipo: "personal", participant_id: "part-marta" },
    ],
    interview_responses: [
      { id: "r1", session_id: "s2", bloque: "proposito", pregunta: PREGUNTA_SACRIFICAR, respuesta: "No boto a nadie", respondido_at: "2026-10-03T15:00:00Z" },
      { id: "r2", session_id: "s1", bloque: "empresa_deseada", pregunta: "Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo?", respuesta: "Dos locales y doce personas", respondido_at: "2026-10-03T15:05:00Z" },
      { id: "r3", session_id: "s3", bloque: "exito", clave_pregunta: "entrada.dinero_tranquilo", pregunta: "¿Cuánto tendría que quedarte al mes, libre, para estar tranquilo?", respuesta: "Con ocho mil al mes estoy tranquilo", certeza: "aproximada", respondido_at: "2026-10-10T15:00:00Z" },
      { id: "r4", session_id: "s3", bloque: "dependencia", clave_pregunta: "entrada.que_se_detiene_sin_mi", pregunta: "Si tú no vas al negocio durante una semana, ¿qué se detiene y qué sigue andando sin ti?", respuesta: "Si yo no estoy no se cotiza nada", certeza: "exacta", respondido_at: "2026-10-10T15:02:00Z" },
      { id: "r5", session_id: "s3", bloque: "empresa_deseada", clave_pregunta: "entrada.rol_futuro", pregunta: "Ese día, dentro de tres años, ¿qué haces tú en el negocio y qué ya no haces?", respuesta: "No lo sé.", certeza: "no_lo_se", respondido_at: "2026-10-10T15:04:00Z" },
      { id: "r6", session_id: "s3", bloque: "empresa_deseada", clave_pregunta: "entrada.vision_3_anios", pregunta: "Antes nos contaste: «Dos locales y doce personas». ¿Sigue siendo así?", respuesta: TEXTO_CONFIRMA, certeza: "exacta", sabida_por: "una conversación anterior contigo", respondido_at: "2026-10-10T15:06:00Z" },
      { id: "r7", session_id: "s4", bloque: "trabas", pregunta: "¿En qué parte de tu trabajo pierdes más tiempo?", respuesta: "Esperando que llegue el señor" },
      { id: "r8", session_id: "s2", bloque: "hoy", pregunta: "Cuéntame tu negocio hoy: ¿qué haces, dónde, con cuánta gente?", respuesta: "Un taller mecánico con seis personas" },
      { id: "r9", session_id: "s2", bloque: "hoy", pregunta: "¿Qué es lo que más te preocupa del negocio hoy?", respuesta: null },
    ],
    claims: [
      { id: "c1", company_id: EMP, estado: "confirmado", texto: "No está dispuesto a despedir a nadie para crecer", pilar: "personas", temporalidad: "actual", fecha_afirmacion: "2026-10-03", response_id: "r1", source_id: "src-entrevista", participant_id: "part-dueno", created_at: "2026-10-03T15:00:01Z" },
      { id: "c2", company_id: EMP, estado: "confirmado", texto: "Quiere dos locales y doce personas en tres años", pilar: "transversal", temporalidad: "aspiracional", fecha_afirmacion: "2026-10-03", response_id: "r2", source_id: "src-entrevista", participant_id: "part-dueno", created_at: "2026-10-03T15:05:01Z" },
      { id: "c3", company_id: EMP, estado: "confirmado", texto: "Sin el dueño no se cotiza", pilar: "procesos", temporalidad: "actual", fecha_afirmacion: "2026-10-10", response_id: "r4", source_id: "src-entrevista", participant_id: "part-dueno", created_at: "2026-10-10T15:02:01Z" },
      { id: "c4", company_id: EMP, estado: "confirmado", texto: "Quiere atender flotas de empresas", pilar: "marketing", temporalidad: "aspiracional", fecha_afirmacion: "2026-09-20", response_id: null, source_id: "src-plan", fragment_id: "frag-1", created_at: "2026-09-20T10:00:00Z" },
      { id: "c5", company_id: EMP, estado: "confirmado", texto: "Hoy atiende sobre todo a particulares", pilar: "marketing", temporalidad: "actual", fecha_afirmacion: "2026-09-20", response_id: null, source_id: "src-plan", created_at: "2026-09-20T10:00:01Z" },
      { id: "c6", company_id: EMP, estado: "sin_verificar", texto: "Quiere vender la empresa en cinco años", pilar: "producto", temporalidad: "aspiracional", fecha_afirmacion: "2026-09-20", response_id: null, source_id: "src-plan", created_at: "2026-09-20T10:00:02Z" },
      { id: "c7", company_id: OTRA, estado: "confirmado", texto: "Quiere abrir en otra ciudad", pilar: "producto", temporalidad: "aspiracional", fecha_afirmacion: "2026-09-20", response_id: null, source_id: "src-otra", created_at: "2026-09-20T10:00:03Z" },
    ],
    sources: [
      { id: "src-entrevista", company_id: EMP, nombre: "Entrevista del dueño", tipo: "entrevista", origen: "cliente" },
      { id: "src-plan", company_id: EMP, nombre: "Plan 2026.docx", tipo: "documento", origen: "consultor" },
      { id: "src-otra", company_id: OTRA, nombre: "Plan de la otra empresa.docx", tipo: "documento", origen: "cliente" },
    ],
    source_fragments: [{ id: "frag-1", source_id: "src-plan", texto: "Meta 2027: contratos con flotas de empresas de reparto." }],
    company_metricas: [
      { id: "m1", company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 40000, estado: "contado" },
      { id: "m2", company_id: EMP, clave: "ganancia_mes", periodo: "2026-09", valor: 4200, estado: "contado" },
      { id: "m3", company_id: EMP, clave: "venta_mes", periodo: "2026-08", valor: 38000, estado: "contado" },
      { id: "m4", company_id: EMP, clave: "caja_hoy", periodo: "actual", valor: 8000, estado: "contado" },
      { id: "m5", company_id: EMP, clave: "deuda_clientes", periodo: "actual", valor: null, estado: "sin_dato" },
      { id: "m6", company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 999, estado: "descartado" },
    ],
    processes: [
      proceso(1, "Cotización"), proceso(2, "Compra de repuestos"), proceso(3, "Recepción"), proceso(4, "Cobranza"),
      proceso(5, "Entrega"), proceso(6, "Caja"), proceso(7, "Limpieza"), proceso(8, "Lavado"), proceso(9, "Cotización rediseñada", "to_be"),
    ],
    process_nodes: [
      // 1 y 2: participa y todas las decisiones son suyas.
      paso("p1", "actividad", "Carlos Rojas"), paso("p1", "decision", "Carlos"),
      paso("p2", "actividad", "el dueño"), paso("p2", "decision", "Dueño"),
      // 3: participa por su rol, pero decide Marta.
      paso("p3", "actividad", "Marta", "Dueño"), paso("p3", "decision", "Marta"),
      // 4: decide él y también Marta: no es el único.
      paso("p4", "actividad", "Carlos Rojas"), paso("p4", "decision", "Carlos"), paso("p4", "decision", "Marta"),
      // 5 y 6: participa y no hay decisiones.
      paso("p5", "actividad", "Carlos"), paso("p6", "actividad", "propietario"),
      // 7 y 8: no participa. «Carlota» no es «Carlos».
      paso("p7", "actividad", "Marta"), paso("p8", "actividad", "Carlota"),
      // El rediseño no es el mapa de hoy.
      paso("p9", "actividad", "Carlos Rojas"), paso("p9", "decision", "Carlos Rojas"),
    ],
    ficha_direccion: [],
    jobs: [],
    token_usage: [],
    actas_aceptacion: [],
  });
  estado.base = base;
  return base;
}

type Base = ReturnType<typeof crearBaseFalsa>;
const cliente = (b: Base) => b as never;
const textos = (items: Item[]) => items.map((i) => i.texto);
const todos = (f: Ficha) => BLOQUES_FICHA.flatMap((b) => f.bloques[b]);

// ─── El asistente falso ──────────────────────────────────────────────────────────────────────────

const SIN_EVIDENCIA = { que_se_detiene: null, podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: [], sin_evidencia: true };
const dependenciaVacia = () => Object.fromEntries(DIMENSIONES_DEPENDENCIA.map((d) => [d, { ...SIN_EVIDENCIA }])) as unknown as SalidaDirectorT["dependencia"];

function salidaDirector(extra: Partial<SalidaDirectorT> = {}): SalidaDirectorT {
  return {
    interpretaciones: [{ bloque: "limites", texto: "Crecer sin despidos es una condición, no una preferencia: cualquier plan tiene que partir de ahí.", claim_ids: ["claim:c1"] }],
    dependencia: {
      ...dependenciaVacia(),
      comercial: { que_se_detiene: "Las cotizaciones: sin el dueño no sale ninguna.", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: ["claim:c3"], sin_evidencia: false },
    },
    ...extra,
  };
}

/** Un proveedor que valida la salida contra el esquema del agente, como hacen los reales, y anota lo que recibió. */
function proveedorFalso(responder: () => unknown) {
  const recibidos: CompleteParams<unknown>[] = [];
  const proveedor = {
    complete: async (p: CompleteParams<unknown>) => {
      recibidos.push(p);
      return { data: p.schema.parse(responder()), tokens_entrada: 900, tokens_salida: 300, modelo: "doble", latencia_ms: 5, intentos: 1 };
    },
    transcribe: async () => ({ texto: "", segmentos: [] }),
    puedeTranscribir: () => false,
  } as unknown as AIProvider;
  return { proveedor, recibidos };
}

const trabajo = (payload: Record<string, unknown> = { actor_id: CONSULTORA.id }) => ({ id: "job-1", company_id: EMP, payload });

// ─── Las rutas, llamadas como las llama la pantalla ─────────────────────────────────────────────

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id = EMP): Ctx => ({ params: Promise.resolve({ id }) });
const post = (cuerpo: unknown, sub = "") => new Request(`http://8x.test/api/companies/${EMP}/direccion${sub}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
const get = () => new Request(`http://8x.test/api/companies/${EMP}/direccion`);
const entra = (p: Perfil) => vi.mocked(perfilApi).mockResolvedValue({ id: p.id, email: p.email, nombre: p.nombre, rol: p.rol });

beforeEach(() => {
  sembrar();
  usarProveedor(null);
  vi.mocked(perfilApi).mockReset();
  vi.mocked(usuarioActual).mockReset();
  vi.mocked(contextoPortal).mockReset();
  vi.mocked(registrar).mockClear();
  vi.mocked(registrarError).mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("armarBorrador: el borrador sale de lo que ya hay, cada frase con su fuente", () => {
  it("clasifica cada declaración en su bloque, como declaración del sistema y con la fuente que la sostiene", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const limite = ficha.bloques.limites.find((i) => i.texto === "No está dispuesto a despedir a nadie para crecer");
    expect(limite).toMatchObject({ tipo: "declaracion", origen: "sistema", fuentes: ["claim:c1"], fecha: "2026-10-03" });
    // La afirmación es el resumen del extractor; lo que el dueño dijo de verdad viaja aparte, como cita.
    expect(limite).toMatchObject({ cita: "No boto a nadie", medio: "conversacion" });
    expect(limite?.textual).toBeUndefined();
    // La pregunta «¿qué no sacrificas?» vive en el bloque propósito del banco y en la ficha es un límite.
    expect(textos(ficha.bloques.proposito)).toEqual([]);
    expect(ficha.bloques.empresa_deseada.find((i) => i.fuentes[0] === "claim:c2")).toMatchObject({ tipo: "declaracion", texto: "Quiere dos locales y doce personas en tres años" });
    expect(ficha.bloques.empresa_deseada.find((i) => i.fuentes[0] === "empresa:aspiracion")).toMatchObject({ tipo: "declaracion", texto: "Quiero dos locales y doce personas", medio: "consultora" }); // la escribe la consultora: no va entre comillas como voz del dueño
    // Una afirmación aspiracional de un documento, sin pregunta de origen, también es dirección; su cita es el fragmento del documento.
    expect(ficha.bloques.clientes_reputacion).toMatchObject([
      { texto: "Quiere atender flotas de empresas", fuentes: ["claim:c4"], tipo: "declaracion", medio: "material", cita: "Meta 2027: contratos con flotas de empresas de reparto." },
    ]);
    // Una respuesta de la entrada breve sin afirmación todavía entra con su certeza, y es textual: son sus palabras.
    expect(ficha.bloques.resultados_deseados.find((i) => i.fuentes[0] === "respuesta:r3")).toMatchObject({ texto: "Con ocho mil al mes estoy tranquilo", certeza: "aproximada", tipo: "declaracion", textual: true, medio: "conversacion" });
    // Lo que dijo sobre qué se detiene sin él va a la descripción de la dependencia, no a un bloque.
    expect(ficha.dependencia.declaraciones).toMatchObject([{ texto: "Sin el dueño no se cotiza", fuentes: ["claim:c3"], certeza: "exacta" }]);
  });

  it("todo ítem lleva una clase válida y al menos una fuente; el borrador no contiene ninguna interpretación de nadie", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const items = [...todos(ficha), ...ficha.dependencia.declaraciones];
    expect(items.length).toBeGreaterThan(10);
    for (const i of items) {
      expect(TIPOS_ITEM, i.texto).toContain(i.tipo);
      expect(i.fuentes.length, `sin fuente: ${i.texto}`).toBeGreaterThan(0);
      expect(i.origen, i.texto).toBe("sistema");
      // Lo único que el código rotula «interpretación» es una cuenta suya, y lo dice: Cálculo. Un número es «Número».
      if (i.tipo === "interpretacion") expect(etiquetaDe(i), i.texto).toBe("Cálculo");
      else expect(etiquetaDe(i), i.texto).toBe(i.momento ? "Número" : i.medio === "material" ? "Dice un documento de la empresa" : i.medio === "consultora" ? "Anotó la consultora" : "Dijo el dueño");
      // Solo va entre comillas lo que el dueño dijo o escribió palabra por palabra: una respuesta. La aspiración la escribe la consultora.
      if (i.textual) expect(i.fuentes[0], i.texto).toMatch(/^respuesta:/);
      if (i.fuentes[0].startsWith("claim:")) expect(i.textual, i.texto).toBeUndefined();
    }
    for (const d of DIMENSIONES_DEPENDENCIA) expect(ficha.dependencia.dimensiones[d]).toMatchObject({ que_se_detiene: null, aporta_valor: null, origen: null, evidencia: [] });
  });

  it("no repite una respuesta que ya tiene afirmación, no toma un botón por una frase, y un «no lo sé» se ve pero no se cita", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const frases = [...todos(ficha), ...ficha.dependencia.declaraciones].map((i) => i.texto);
    expect(frases).not.toContain("No boto a nadie"); // r1 ya está como c1
    expect(frases).not.toContain("Si yo no estoy no se cotiza nada"); // r4 ya está como c3
    expect(frases).not.toContain(TEXTO_CONFIRMA); // r6: «Sí, es así.» confirma, no declara
    expect(ficha.bloques.rol_futuro).toMatchObject([{ texto: "No lo sé.", certeza: "no_lo_se", fuentes: ["respuesta:r5"] }]);
    expect(evidencia.fuentes_validas.has("respuesta:r5")).toBe(false);
    expect([...evidencia.fuentes_validas].sort()).toEqual(
      ["claim:c1", "claim:c2", "claim:c3", "claim:c4", "empresa:aspiracion", "empresa:ficha.meta_venta_mensual", "empresa:ficha.personas", "metrica:m1", "metrica:m2", "metrica:m4", "respuesta:r3"].sort()
    );
    // Un «no lo sé» no es material para interpretar.
    const soloNoSabe = fichaVacia();
    soloNoSabe.bloques.rol_futuro = ficha.bloques.rol_futuro;
    expect(hayMaterialParaInterpretar(soloNoSabe)).toBe(false);
    expect(hayMaterialParaInterpretar(ficha)).toBe(true);
  });

  it("lo que no es de dirección, lo sin verificar, lo de otra persona y lo de otra empresa no entran", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const frases = [...todos(ficha), ...ficha.dependencia.declaraciones].map((i) => i.texto).join(" | ");
    expect(frases).not.toContain("Un taller mecánico con seis personas"); // r8: el negocio de hoy
    expect(frases).not.toContain("Quiere vender la empresa"); // c6: sin verificar
    expect(frases).not.toContain("Esperando que llegue el señor"); // r7: sesión de un empleado
    expect(frases).not.toContain("otra ciudad"); // c7: otra empresa
    // c5 habla de hoy y no vino de una pregunta de dirección: no es una declaración de la ficha, solo se cuenta por área.
    expect(textos(todos(ficha).filter((i) => i.tipo === "declaracion"))).not.toContain("Hoy atiende sobre todo a particulares");
  });

  it("los números con valor se leen en su bloque como «Hoy» o «Meta»; lo vacío y lo descartado no se vuelven número", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const numeros = ficha.bloques.resultados_deseados.filter((i) => i.momento);
    expect(numeros.map((i) => [i.texto, i.fuentes[0], i.momento])).toEqual([
      ["Hoy: Dinero en caja hoy S/ 8,000", "metrica:m4", "hoy"],
      ["Hoy: Lo que queda libre al mes S/ 4,200 (Setiembre 2026)", "metrica:m2", "hoy"],
      // Entre agosto y setiembre gana el mes más reciente.
      ["Hoy: Ventas del mes S/ 40,000 (Setiembre 2026)", "metrica:m1", "hoy"],
      ["Meta: Ventas del mes S/ 60,000", "empresa:ficha.meta_venta_mensual", "deseado"],
    ]);
    expect(ficha.bloques.empresa_deseada.find((i) => i.momento)).toMatchObject({ texto: "Hoy: Personas en el equipo 6", fuentes: ["empresa:ficha.personas"] });
    const todo = JSON.stringify(ficha);
    expect(todo).not.toContain("Lo que te deben"); // m5: sin valor
    expect(todo).not.toContain("Gastos fijos"); // m6: descartado al revisar la extracción
    expect(todo).not.toContain("999");
  });

  it("cuenta los procesos del dueño como descripción: «participa en 6 de 8»", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const p = ficha.dependencia.procesos;
    expect(p.texto).toBe("participa en 6 de 8 procesos del mapa; en 2 de ellos es el único que decide");
    expect(p).toMatchObject({ total: 8, con_dueno: 6, decide_solo: 2 });
    expect(p.nombres_con_dueno).toEqual(["Cotización", "Compra de repuestos", "Recepción", "Cobranza", "Entrega", "Caja"]);
    expect(p.nombres_decide_solo).toEqual(["Cotización", "Compra de repuestos"]);
  });

  it("nunca produce un porcentaje ni un índice: ni en la dependencia ni en ninguna otra parte del borrador", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const todo = JSON.stringify(ficha);
    expect(todo).not.toMatch(/%|por ?ciento|porcentaje/i);
    expect(todo).not.toMatch(/"(indice|puntaje|score|nivel|grado|ratio)[a-z_]*"\s*:/i);
    // Lo único numérico de la dependencia son tres conteos de procesos.
    const numericos = Object.entries(ficha.dependencia.procesos).filter(([, v]) => typeof v === "number").map(([k]) => k);
    expect(numericos.sort()).toEqual(["con_dueno", "decide_solo", "total"]);
    expect(mideLaDependencia(ficha.dependencia.procesos.texto)).toBe(false);
  });

  it("es determinista: con las mismas filas sale la misma ficha, con los mismos ids", async () => {
    const a = await armarBorrador(EMP, cliente(sembrar()));
    const b = await armarBorrador(EMP, cliente(sembrar()));
    expect(b.ficha).toEqual(a.ficha);
    const ids = todos(a.ficha).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("una empresa que no existe se dice; una empresa sin nada da una ficha vacía, no una inventada", async () => {
    await expect(armarBorrador("no-existe", cliente(sembrar()))).rejects.toThrow(/no existe/);
    const { ficha } = await armarBorrador(OTRA, cliente(sembrar()));
    // De la otra empresa solo hay una afirmación aspiracional: va a su bloque y nada más aparece.
    expect(textos(ficha.bloques.empresa_deseada)).toEqual(["Quiere abrir en otra ciudad"]);
    expect(ficha.bloques.resultados_deseados).toEqual([]);
    expect(ficha.dependencia.procesos.texto).toBe("todavía no hay procesos en el mapa: no se puede contar en cuántos participa el dueño");
  });

  it("la tabla de la entrada breve decide las doce preguntas del plan, ni una más ni una menos", () => {
    expect(Object.keys(CLAVE_ENTRADA_A_FICHA).sort()).toEqual([...CLAVES_PLAN].sort());
  });

  it("clasificarDeclaraciones es pura: sin filas no hay frases, y la aspiración en blanco no cuenta", () => {
    const c = clasificarDeclaraciones({ claims: [], respuestas: [], aspiracion: "   " });
    expect(BLOQUES_FICHA.every((b) => c.bloques[b].length === 0)).toBe(true);
    expect(c.dependencia_declarada).toEqual([]);
    expect(c.fuentes_validas.size).toBe(0);
  });
});

describe("el dueño en los procesos: se cuenta, no se puntúa", () => {
  const procesos = [{ id: "a", nombre: "Ventas" }, { id: "b", nombre: "Compras" }];
  it("sin mapa lo dice; sin dueño en ningún paso, también; con un solo proceso habla en singular", () => {
    expect(contarProcesosDelDueno({ procesos: [], nodos: [], nombresDueno: ["Ana Soto"] }).texto).toMatch(/todavía no hay procesos/);
    const ninguno = contarProcesosDelDueno({ procesos, nodos: [{ process_id: "a", tipo: "actividad", responsable: "Luis" }], nombresDueno: ["Ana Soto"] });
    expect(ninguno).toMatchObject({ total: 2, con_dueno: 0, decide_solo: 0, texto: "no figura como responsable en ninguno de los 2 procesos del mapa" });
    const uno = contarProcesosDelDueno({ procesos: [procesos[0]], nodos: [{ process_id: "a", tipo: "decision", responsable: "Ana" }], nombresDueno: ["Ana Soto"] });
    expect(uno.texto).toBe("participa en 1 de 1 proceso del mapa; en 1 de ellos es el único que decide");
  });
  it("reconoce al dueño por su nombre o por cómo lo llama la empresa, y no por parecerse", () => {
    const nodos = [
      { process_id: "a", tipo: "actividad", responsable: "Anabel" }, // no es Ana
      { process_id: "b", tipo: "actividad", responsable: "La dueña" },
    ];
    const c = contarProcesosDelDueno({ procesos, nodos, nombresDueno: ["Ana Soto"] });
    expect(c.nombres_con_dueno).toEqual(["Compras"]);
  });
  it("al dueño se le dice lo mismo en segunda persona, sin calificarlo y sin porcentaje", () => {
    const c = contarProcesosDelDueno({ procesos, nodos: [{ process_id: "a", tipo: "decision", responsable: "Ana Soto" }], nombresDueno: ["Ana Soto"] });
    expect(textoProcesosCliente(c)).toBe("Hemos dibujado 2 procesos de tu empresa. Tú participas en 1 y en 1 eres la única persona que decide.");
    expect(textoProcesosCliente(contarProcesosDelDueno({ procesos: [], nodos: [], nombresDueno: [] }))).toBeNull();
  });
});

describe("distancia: se compara lo comparable y lo demás se rechaza diciendo por qué", () => {
  const numero = (clave: string, valor: number, periodo: string, moneda?: "PEN" | "USD", periodo_dato = "actual"): Numero => ({
    cifra: { clave, valor, periodo, ...(moneda ? { moneda } : {}) },
    etiqueta: clave === "venta_mes" ? "Ventas del mes" : "Horas de trabajo del dueño a la semana",
    fuente: `prueba:${clave}:${periodo_dato}`,
    periodo_dato,
    estado: "contado",
  });

  it("venta de hoy contra venta deseada: misma cifra, misma base, misma moneda → dice cuánto falta subir", () => {
    const d = distancia({ hoy: [numero("venta_mes", 40000, "mes", "PEN", "2026-09")], deseado: [numero("venta_mes", 60000, "mes", "PEN", "deseado")] });
    expect(d.numeros).toHaveLength(1);
    expect(d.numeros[0]).toMatchObject({ clave: "venta_mes", comparable: true, diferencia: 20000 });
    // La regla es la de finanzas.ts: el motivo es el suyo.
    expect(d.numeros[0].motivo).toBe("mismo periodo, misma moneda y sin superposición");
    expect(d.numeros[0].texto).toBe("Ventas del mes: hoy S/ 40,000 (Setiembre 2026) · meta S/ 60,000 · falta subir S/ 20,000");
  });

  it("horas de hoy contra horas deseadas: la meta es bajar, y se dice bajar", () => {
    const d = distancia({ hoy: [numero("horas_semana", 70, "semana")], deseado: [numero("horas_semana", 45, "semana", undefined, "deseado")] });
    expect(d.numeros[0]).toMatchObject({ comparable: true, diferencia: -25 });
    expect(d.numeros[0].texto).toBe("Horas de trabajo del dueño a la semana: hoy 70 · meta 45 · falta bajar 25");
    const igual = distancia({ hoy: [numero("horas_semana", 45, "semana")], deseado: [numero("horas_semana", 45, "semana", undefined, "deseado")] });
    expect(igual.numeros[0]).toMatchObject({ comparable: true, diferencia: 0 });
    expect(igual.numeros[0].texto).toMatch(/ya está en la meta$/);
  });

  it("RECHAZA bases distintas: horas a la semana contra horas al mes no se restan", () => {
    const d = distancia({ hoy: [numero("horas_semana", 70, "semana")], deseado: [numero("horas_semana", 180, "mes", undefined, "deseado")] });
    expect(d.numeros[0]).toMatchObject({ comparable: false, diferencia: null });
    expect(d.numeros[0].motivo).toBe("periodos distintos (semana y mes)");
    expect(d.numeros[0].texto).toMatch(/no se pueden comparar: periodos distintos \(semana y mes\)$/);
    expect(d.numeros[0].texto).not.toMatch(/falta (subir|bajar)/);
    // Al dueño se le dice lo mismo sin nombres de campo.
    expect(d.numeros[0].texto_cliente).toMatch(/no se pueden comparar: la cifra de hoy es por semana y la meta es por mes$/);
  });

  it("RECHAZA monedas distintas: soles contra dólares no se restan", () => {
    const d = distancia({ hoy: [numero("venta_mes", 40000, "mes", "PEN")], deseado: [numero("venta_mes", 20000, "mes", "USD", "deseado")] });
    expect(d.numeros[0]).toMatchObject({ comparable: false, diferencia: null, motivo: "monedas distintas (PEN y USD)" });
    expect(d.numeros[0].texto).toContain("USD 20,000");
  });

  it("RECHAZA dos cifras que no son la misma, aunque compartan base y moneda", () => {
    expect(comparablesHoyDeseado({ clave: "venta_mes", valor: 1, periodo: "mes" }, { clave: "ganancia_mes", valor: 2, periodo: "mes" })).toEqual({
      ok: false,
      motivo: "no son la misma cifra: hoy «venta_mes», deseada «ganancia_mes»",
    });
    expect(comparablesHoyDeseado({ clave: "venta_mes", valor: 1, periodo: "mes" }, { clave: "venta_mes", valor: 2, periodo: "mes" }).ok).toBe(true);
  });

  it("la falta de dato no es cero: sin un lado no hay diferencia, y se dice cuál falta", () => {
    const sinHoy = distancia({ hoy: [], deseado: [numero("venta_mes", 60000, "mes", "PEN", "deseado")] });
    expect(sinHoy.numeros[0]).toMatchObject({ comparable: false, diferencia: null, motivo: "falta la cifra de hoy" });
    expect(sinHoy.numeros[0].texto).toBe("Ventas del mes: hoy sin dato · meta S/ 60,000");
    const sinMeta = distancia({ hoy: [numero("venta_mes", 40000, "mes", "PEN")], deseado: [] });
    expect(sinMeta.numeros[0]).toMatchObject({ comparable: false, diferencia: null, motivo: "falta la cifra deseada" });
    expect(sinMeta.numeros[0].texto).toBe("Ventas del mes: hoy S/ 40,000 · meta sin dato");
    // Un número que no es de dirección y no tiene meta (la caja de hoy) no se lista como distancia.
    expect(distancia({ hoy: [numero("caja_hoy", 8000, "puntual", "PEN")], deseado: [] }).numeros).toEqual([]);
  });

  it("en texto, por área: cita lo que quiere y cuenta lo que hay sobre hoy; emparejar frases no lo hace el código", () => {
    const grupos = textoPorPilar([
      { id: "a", texto: "Quiere atender flotas", pilar: "marketing", temporalidad: "aspiracional", fecha_afirmacion: null, response_id: null, source_id: null },
      { id: "b", texto: "Hoy atiende particulares", pilar: "marketing", temporalidad: "actual", fecha_afirmacion: null, response_id: null, source_id: null },
      { id: "c", texto: "Llegan por recomendación", pilar: "marketing", temporalidad: "actual", fecha_afirmacion: null, response_id: null, source_id: null },
      { id: "d", texto: "Son seis personas", pilar: "personas", temporalidad: "actual", fecha_afirmacion: null, response_id: null, source_id: null },
      { id: "e", texto: "Quiere un segundo producto", pilar: "producto", temporalidad: "aspiracional", fecha_afirmacion: null, response_id: null, source_id: null },
      { id: "f", texto: "Algo general", pilar: "transversal", temporalidad: "actual", fecha_afirmacion: null, response_id: null, source_id: null },
    ]);
    const d = distancia({ hoy: [], deseado: [], texto: grupos });
    expect(d.texto.map((t) => [t.pilar, t.comparable, t.texto])).toEqual([
      ["marketing", true, "Marketing: quiere «Quiere atender flotas» · sobre hoy hay 2 afirmaciones confirmadas"],
      ["personas", false, "Personas: hay 1 afirmación confirmada sobre hoy y ninguna sobre lo que quiere: falta preguntarlo"],
      ["producto", false, "Producto: quiere «Quiere un segundo producto» · sobre hoy no hay afirmaciones confirmadas: no se puede medir la distancia"],
    ]);
    const items = itemsDeDistancia(d);
    // Son cuentas del sistema y notas de trabajo: el dueño no ve un área de método.
    for (const i of items) expect(i).toMatchObject({ calculo: true, interno: true, tipo: "interpretacion", origen: "sistema" });
    expect(items.map((i) => i.fuentes)).toEqual([["claim:a"], ["claim:d"], ["claim:e"]]);
  });

  it("numerosDeHoy y numerosDeFicha no inventan: lo que no es número no entra, y lo deseado no se confunde con lo de hoy", () => {
    expect(numerosDeHoy([{ id: "x", clave: "ventas_mes", periodo: "2026-09", valor: "abc" }])).toEqual([]);
    expect(numerosDeHoy([{ id: "x", clave: "venta_mes", periodo: "epoca_dorada", valor: 90000 }])).toEqual([]);
    // El sinónimo se lleva a la clave canónica y la base es «al mes».
    expect(numerosDeHoy([{ id: "x", clave: "ventas_mes", periodo: "2026-09", valor: "40000", estado: "extraido" }])[0]).toMatchObject({
      cifra: { clave: "venta_mes", valor: 40000, periodo: "mes", moneda: "PEN" },
      fuente: "metrica:x",
      periodo_dato: "2026-09",
      estado: "extraido",
    });
    const f = numerosDeFicha({ meta_venta_mensual: "60000", horas_semana: 70, horas_semana_deseadas: "cuarenta", personas: "" });
    expect(f.deseado.map((n) => n.cifra)).toEqual([{ clave: "venta_mes", valor: 60000, periodo: "mes", moneda: "PEN" }]);
    expect(f.hoy.map((n) => n.cifra)).toEqual([{ clave: "horas_semana", valor: 70, periodo: "semana" }]);
    expect(numerosDeFicha(null)).toEqual({ hoy: [], deseado: [] });
  });

  it("cuando hay dos números para lo mismo: hoy manda el registrado; en la meta manda lo anotado en la ficha de dirección", () => {
    const registrado = numero("venta_mes", 40000, "mes", "PEN", "2026-09");
    const aMano = { ...numero("venta_mes", 99999, "mes", "PEN"), fuente: "consultor:x" };
    const alCrear = { ...numero("venta_mes", 30000, "mes", "PEN"), fuente: "empresa:ficha.venta_mensual" };
    const metaAMano = { ...numero("venta_mes", 70000, "mes", "PEN", "deseado"), fuente: "consultor:x" };
    const metaAlCrear = { ...numero("venta_mes", 60000, "mes", "PEN", "deseado"), fuente: "empresa:ficha.meta_venta_mensual" };
    const e = elegirNumeros({ metricas: [registrado], de_ficha: { hoy: [alCrear], deseado: [metaAlCrear] }, anotados: { hoy: [aMano], deseado: [metaAMano] } });
    expect(e.hoy.map((n) => n.cifra.valor)).toEqual([40000]);
    expect(e.deseado.map((n) => n.cifra.valor)).toEqual([70000]);
    expect(elegirNumeros({ metricas: [], de_ficha: { hoy: [alCrear], deseado: [] }, anotados: { hoy: [aMano], deseado: [] } }).hoy[0].cifra.valor).toBe(99999);
  });

  it("en el borrador de la empresa sintética: una comparación completa, dos que dicen qué falta y las cuentas por área", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    expect(textos(ficha.bloques.distancia)).toEqual([
      "Lo que queda libre al mes: hoy S/ 4,200 (Setiembre 2026) · meta sin dato",
      "Personas en el equipo: hoy 6 · meta sin dato",
      "Ventas del mes: hoy S/ 40,000 (Setiembre 2026) · meta S/ 60,000 · falta subir S/ 20,000",
      "Marketing: quiere «Quiere atender flotas de empresas» · sobre hoy hay 1 afirmación confirmada",
      "Personas: hay 1 afirmación confirmada sobre hoy y ninguna sobre lo que quiere: falta preguntarlo",
      "Procesos: hay 1 afirmación confirmada sobre hoy y ninguna sobre lo que quiere: falta preguntarlo",
    ]);
    const venta = ficha.bloques.distancia[2];
    expect(venta).toMatchObject({ calculo: true, fuentes: ["metrica:m1", "empresa:ficha.meta_venta_mensual"] });
    expect(venta.interno).toBeUndefined();
  });
});

describe("la consultora edita en su sitio: nada se pierde y el sistema no pisa lo que ella tocó", () => {
  it("corregir una frase conserva el texto original, dice quién la revisó y sobrevive a volver a armar", async () => {
    const base = sembrar();
    const b = await armarBorrador(EMP, cliente(base));
    const original = b.ficha.bloques.limites[0];
    const editada = editarItem(b.ficha, "limites", original.id, { texto: "No despide a nadie para crecer", tipo: "declaracion" }, CONSULTORA.id);
    expect(editada.bloques.limites[0]).toMatchObject({ id: original.id, texto: "No despide a nadie para crecer", original: "No está dispuesto a despedir a nadie para crecer", revisado_por: CONSULTORA.id, origen: "sistema", fuentes: ["claim:c1"] });
    // La ficha de partida no se tocó: las ediciones no mutan.
    expect(b.ficha.bloques.limites[0].texto).toBe("No está dispuesto a despedir a nadie para crecer");
    const rearmada = fusionar(editada, await armarBorrador(EMP, cliente(base)));
    expect(textos(rearmada.bloques.limites)).toEqual(["No despide a nadie para crecer"]);
    // Una segunda corrección no pisa el original con el texto intermedio.
    const dosVeces = editarItem(editada, "limites", original.id, { texto: "Crecer sin despedir" }, CONSULTORA.id);
    expect(dosVeces.bloques.limites[0].original).toBe("No está dispuesto a despedir a nadie para crecer");
    // Lo que el dueño dijo sigue siendo lo que dijo, se corrija lo que se corrija.
    expect(dosVeces.bloques.limites[0].cita).toBe("No boto a nadie");
    // Corregir una frase textual la saca de las comillas: sus palabras quedan como cita y la frase nueva es de la consultora.
    const textual = b.ficha.bloques.resultados_deseados.find((i) => i.fuentes[0] === "respuesta:r3")!;
    const corregida = editarItem(b.ficha, "resultados_deseados", textual.id, { texto: "Necesita unos ocho mil soles libres al mes" }, CONSULTORA.id);
    expect(corregida.bloques.resultados_deseados.find((i) => i.id === textual.id)).toMatchObject({ texto: "Necesita unos ocho mil soles libres al mes", textual: false, cita: "Con ocho mil al mes estoy tranquilo", original: "Con ocho mil al mes estoy tranquilo" });
  });

  it("quitar no borra: la frase queda descartada, deja de contar, no vuelve al armar de nuevo y se puede recuperar", async () => {
    const base = sembrar();
    const b = await armarBorrador(EMP, cliente(base));
    const id = b.ficha.bloques.clientes_reputacion[0].id;
    const sin = descartarItem(b.ficha, "clientes_reputacion", id, CONSULTORA.id);
    expect(sin.bloques.clientes_reputacion).toHaveLength(1);
    expect(sin.bloques.clientes_reputacion[0]).toMatchObject({ descartado: true, revisado_por: CONSULTORA.id });
    expect(vigentes(sin.bloques.clientes_reputacion)).toEqual([]);
    const rearmada = fusionar(sin, await armarBorrador(EMP, cliente(base)));
    expect(rearmada.bloques.clientes_reputacion).toHaveLength(1);
    expect(vigentes(rearmada.bloques.clientes_reputacion)).toEqual([]);
    expect(vigentes(recuperarItem(rearmada, "clientes_reputacion", id, CONSULTORA.id).bloques.clientes_reputacion)).toHaveLength(1);
  });

  it("una frase añadida a mano lleva a la consultora como fuente y no se duplica", async () => {
    const { ficha } = await armarBorrador(EMP, cliente(sembrar()));
    const con = agregarItem(ficha, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller", tipo: "acuerdo", actorId: CONSULTORA.id });
    expect(con.bloques.decisiones_pendientes).toMatchObject([{ tipo: "acuerdo", origen: "consultor", fuentes: [`consultor:${CONSULTORA.id}`], revisado_por: CONSULTORA.id }]);
    expect(etiquetaDe(con.bloques.decisiones_pendientes[0])).toBe("Acordado");
    expect(() => agregarItem(con, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller", tipo: "acuerdo", actorId: CONSULTORA.id })).toThrow(ReglaDeFicha);
    expect(() => agregarItem(ficha, "limites", { texto: " a ", tipo: "interpretacion", actorId: CONSULTORA.id })).toThrow(/frase completa/);
    expect(() => editarItem(ficha, "limites", "no-existe", { texto: "x y z" }, CONSULTORA.id)).toThrow(/ya no está/);
    expect(() => editarItem(ficha, "limites", ficha.bloques.limites[0].id, { texto: "   " }, CONSULTORA.id)).toThrow(/vacío/);
  });

  it("anotar las horas de hoy y las deseadas hace que la distancia las compare; y un número registrado manda sobre uno anotado a mano", async () => {
    const base = sembrar();
    const b = await armarBorrador(EMP, cliente(base));
    let ficha = anotarCifra(b.ficha, { clave: "horas_semana", momento: "hoy", valor: 70, actorId: CONSULTORA.id });
    ficha = anotarCifra(ficha, { clave: "horas_semana", momento: "deseado", valor: 45, actorId: CONSULTORA.id });
    expect(ficha.bloques.tiempo.map((i) => [i.texto, i.momento, i.cifra])).toEqual([
      ["Hoy: Horas de trabajo del dueño a la semana 70", "hoy", { clave: "horas_semana", valor: 70, periodo: "semana" }],
      ["Meta: Horas de trabajo del dueño a la semana 45", "deseado", { clave: "horas_semana", valor: 45, periodo: "semana" }],
    ]);
    ficha = anotarCifra(ficha, { clave: "venta_mes", momento: "hoy", valor: 99999, actorId: CONSULTORA.id });
    const rearmada = fusionar(ficha, await armarBorrador(EMP, cliente(base)));
    const d = textos(rearmada.bloques.distancia);
    expect(d).toContain("Horas de trabajo del dueño a la semana: hoy 70 · meta 45 · falta bajar 25");
    expect(d).toContain("Ventas del mes: hoy S/ 40,000 (Setiembre 2026) · meta S/ 60,000 · falta subir S/ 20,000");
    expect(d.join(" | ")).not.toContain("99,999");
    // Los cálculos no se acumulan: cada cifra aparece una sola vez.
    expect(d.filter((t) => t.startsWith("Ventas del mes:"))).toHaveLength(1);
    // Uno por cifra y momento; lo que no es número o no es de dirección no entra; un número no se corrige editando la frase.
    expect(() => anotarCifra(ficha, { clave: "horas_semana", momento: "hoy", valor: 60, actorId: CONSULTORA.id })).toThrow(/Ya hay un número/);
    expect(() => anotarCifra(b.ficha, { clave: "horas_semana", momento: "hoy", valor: Number.NaN, actorId: null })).toThrow(/Escribe el número/);
    expect(() => anotarCifra(b.ficha, { clave: "dependencia", momento: "hoy", valor: 80, actorId: null })).toThrow(/no es de los que lleva la ficha/);
    expect(() => editarItem(ficha, "tiempo", ficha.bloques.tiempo[0].id, { texto: "Hoy: 50 horas" }, CONSULTORA.id)).toThrow(/no se corrige a mano/);
    const registrado = b.ficha.bloques.resultados_deseados.find((i) => i.fuentes[0] === "metrica:m1")!;
    expect(() => editarItem(b.ficha, "resultados_deseados", registrado.id, { texto: "Hoy: Ventas del mes S/ 90,000" }, CONSULTORA.id)).toThrow(ReglaDeFicha);
  });

  it("una dimensión se describe a mano y queda revisada; un porcentaje no entra tampoco de la mano de la consultora", () => {
    const f = editarDimension(fichaVacia(), "equipo", { que_se_detiene: "  ", aporta_valor: "Forma él mismo a cada mecánico nuevo" }, CONSULTORA.id);
    expect(f.dependencia.dimensiones.equipo).toMatchObject({ que_se_detiene: null, aporta_valor: "Forma él mismo a cada mecánico nuevo", origen: "consultor", revisado_por: CONSULTORA.id });
    // Corregir un campo no borra los otros; mandarlo vacío sí lo borra.
    const dos = editarDimension(f, "equipo", { capacidad_falta: "Nadie más sabe enseñar el oficio", podria_delegarse: undefined }, CONSULTORA.id);
    expect(dos.dependencia.dimensiones.equipo).toMatchObject({ aporta_valor: "Forma él mismo a cada mecánico nuevo", capacidad_falta: "Nadie más sabe enseñar el oficio", podria_delegarse: null });
    expect(editarDimension(dos, "equipo", { aporta_valor: null }, CONSULTORA.id).dependencia.dimensiones.equipo).toMatchObject({ aporta_valor: null, capacidad_falta: "Nadie más sabe enseñar el oficio" });
    expect(() => editarDimension(fichaVacia(), "comercial", { que_se_detiene: "El 80 % de las ventas depende de él" }, CONSULTORA.id)).toThrow(/se describe, no se mide/);
    expect(() => editarDimension(fichaVacia(), "comercial", { que_se_detiene: "Índice de dependencia alto" }, CONSULTORA.id)).toThrow(ReglaDeFicha);
  });
});

describe("el asistente propone; el código decide qué entra y como qué", () => {
  it("lo que propone entra como INTERPRETACIÓN del asistente, sin revisar, con sus fuentes; nunca como declaración", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const r = incorporarInterpretaciones(ficha, salidaDirector(), evidencia.fuentes_validas, new Date("2026-10-13T16:00:00Z"));
    expect(r).toMatchObject({ incorporadas: 1, descartadas: 0 });
    const propuesta = r.ficha.bloques.limites.find((i) => i.origen === "director")!;
    expect(propuesta).toMatchObject({ tipo: "interpretacion", fuentes: ["claim:c1"], fecha: "2026-10-13T16:00:00.000Z" });
    expect(propuesta.revisado_por).toBeUndefined();
    expect(etiquetaDe(propuesta)).toBe("Interpretamos · propuesta del asistente, sin revisar");
    // Las declaraciones siguen siendo exactamente las que eran.
    expect(r.ficha.bloques.limites.filter((i) => i.tipo === "declaracion")).toEqual(ficha.bloques.limites);
    expect(todos(r.ficha).filter((i) => i.origen === "director").every((i) => i.tipo === "interpretacion")).toBe(true);
    expect(r.ficha.dependencia.dimensiones.comercial).toMatchObject({ que_se_detiene: "Las cotizaciones: sin el dueño no sale ninguna.", evidencia: ["claim:c3"], origen: "director", nota: null });
    expect(r.ficha.dependencia.dimensiones.financiera).toMatchObject({ que_se_detiene: null, evidencia: [], nota: TEXTO_SIN_EVIDENCIA, origen: "director" });
    expect(r.ficha.dependencia.interpretaciones).toEqual({ pendiente: false, motivo: null, at: "2026-10-13T16:00:00.000Z" });
    expect(pendientesDeRevision(r.ficha)).toEqual({ items: 1, dimensiones: ["comercial"], total: 2 });
  });

  it("ni la consultora puede volver «Dijo el dueño» lo que propuso el asistente o lo que calculó el código", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const r = incorporarInterpretaciones(ficha, salidaDirector(), evidencia.fuentes_validas);
    const propuesta = r.ficha.bloques.limites.find((i) => i.origen === "director")!;
    expect(() => editarItem(r.ficha, "limites", propuesta.id, { tipo: "declaracion" }, CONSULTORA.id)).toThrow(/no lo dijo el dueño/);
    const calculo = r.ficha.bloques.distancia.find((i) => i.calculo)!;
    expect(() => editarItem(r.ficha, "distancia", calculo.id, { tipo: "declaracion" }, CONSULTORA.id)).toThrow(ReglaDeFicha);
    // Sí puede darla por buena o firmarla como acuerdo.
    const acordada = editarItem(r.ficha, "limites", propuesta.id, { tipo: "acuerdo" }, CONSULTORA.id);
    expect(acordada.bloques.limites.find((i) => i.id === propuesta.id)).toMatchObject({ tipo: "acuerdo", origen: "director", revisado_por: CONSULTORA.id });
  });

  it("descarta, diciendo por qué, lo que cita una fuente que no existe, lo que juzga a la persona y lo que mide la dependencia", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const salida = salidaDirector({
      interpretaciones: [
        { bloque: "limites", texto: "Hay una promesa hecha al equipo que condiciona el crecimiento.", claim_ids: ["c1"] }, // id pelado: se resuelve
        { bloque: "empresa_deseada", texto: "Quiere abrir una sede en Arequipa el próximo año.", claim_ids: ["claim:inventado"] },
        { bloque: "rol_futuro", texto: "No suelta la cotización porque es controlador y no sabe delegar.", claim_ids: ["claim:c3"] },
        { bloque: "rol_futuro", texto: "No sabe todavía qué quiere hacer él dentro de tres años.", claim_ids: ["respuesta:r5"] }, // un «no lo sé» no se cita
      ],
      dependencia: {
        ...dependenciaVacia(),
        comercial: { que_se_detiene: "La empresa depende en un 80 % del dueño para vender.", podria_delegarse: "La cotización de trabajos simples.", capacidad_falta: null, aporta_valor: null, evidencia: ["claim:c3"], sin_evidencia: false },
        decisiones: { que_se_detiene: "Todas las decisiones importantes.", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: ["claim:no-existe"], sin_evidencia: false },
      },
    });
    const r = incorporarInterpretaciones(ficha, salida, evidencia.fuentes_validas);
    expect(r.incorporadas).toBe(1);
    expect(r.ficha.bloques.limites.find((i) => i.origen === "director")).toMatchObject({ fuentes: ["claim:c1"] });
    expect(r.descartes.map((d) => [d.donde, d.motivo])).toEqual([
      ["Empresa deseada", "cita una fuente que no existe en la ficha"],
      ["Rol futuro del propietario", "califica a la persona en vez de describir a la empresa"],
      ["Rol futuro del propietario", "cita una fuente que no existe en la ficha"],
      ["Dependencia · Comercial", "mide la dependencia con un número: se describe, no se puntúa"],
      ["Dependencia · Decisiones", "no cita ninguna fuente que exista"],
    ]);
    expect(r.descartadas).toBe(5);
    // De la dimensión comercial queda lo que sí describe; la que no pudo citar nada queda vacía y lo dice.
    expect(r.ficha.dependencia.dimensiones.comercial).toMatchObject({ que_se_detiene: null, podria_delegarse: "La cotización de trabajos simples.", evidencia: ["claim:c3"] });
    expect(r.ficha.dependencia.dimensiones.decisiones).toMatchObject({ que_se_detiene: null, evidencia: [], nota: TEXTO_SIN_EVIDENCIA });
    expect(JSON.stringify(r.ficha)).not.toMatch(/80 ?%|controlador|Arequipa/);
  });

  it("las redes de palabras: qué mide y qué juzga", () => {
    for (const t of ["Depende en un 80% del dueño", "un 60 por ciento de la venta", "índice de dependencia alto", "grado de dependencia 4", "nivel 4 de 5"]) expect(mideLaDependencia(t), t).toBe(true);
    for (const t of ["participa en 6 de 8 procesos del mapa", "Sin él no se cotiza", "Las compras a proveedores"]) expect(mideLaDependencia(t), t).toBe(false);
    for (const t of ["Es controlador", "no sabe delegar", "es un líder ausente", "por culpa del dueño"]) expect(juzgaALaPersona(t), t).toBe(true);
    for (const t of ["La cotización pasa siempre por el dueño", "Él conoce a cada cliente de flota por su nombre"]) expect(juzgaALaPersona(t), t).toBe(false);
  });

  it("el esquema del agente es estricto: sin fuente no vale, no hay dónde poner un porcentaje y las ocho dimensiones son obligatorias", () => {
    expect(SalidaDirector.safeParse(salidaDirector()).success).toBe(true);
    const sinFuente = salidaDirector({ interpretaciones: [{ bloque: "limites", texto: "Una lectura sin sostén alguno.", claim_ids: [] }] });
    expect(SalidaDirector.safeParse(sinFuente).success).toBe(false);
    const conPorcentaje = { ...salidaDirector(), dependencia: { ...dependenciaVacia(), comercial: { ...SIN_EVIDENCIA, porcentaje: 80 } } };
    expect(SalidaDirector.safeParse(conPorcentaje).success).toBe(false);
    expect(SalidaDirector.safeParse({ ...salidaDirector(), indice_dependencia: 0.8 }).success).toBe(false);
    const sieteDimensiones = { ...salidaDirector(), dependencia: Object.fromEntries(DIMENSIONES_DEPENDENCIA.slice(1).map((d) => [d, SIN_EVIDENCIA])) };
    expect(SalidaDirector.safeParse(sieteDimensiones).success).toBe(false);
    // Una dimensión dice algo con evidencia, o dice «sin evidencia»: ni las dos cosas ni ninguna.
    const niUnaNiOtra = { ...salidaDirector(), dependencia: { ...dependenciaVacia(), equipo: { ...SIN_EVIDENCIA, sin_evidencia: false } } };
    expect(SalidaDirector.safeParse(niUnaNiOtra).success).toBe(false);
    const lasDos = { ...salidaDirector(), dependencia: { ...dependenciaVacia(), equipo: { ...SIN_EVIDENCIA, evidencia: ["claim:c1"] } } };
    expect(SalidaDirector.safeParse(lasDos).success).toBe(false);
    // Tampoco puede proponer el bloque distancia: eso es cálculo, no lectura.
    expect(SalidaDirector.safeParse(salidaDirector({ interpretaciones: [{ bloque: "distancia" as never, texto: "Está lejos de la meta.", claim_ids: ["claim:c1"] }] })).success).toBe(false);
  });

  it("una segunda ronda sustituye las propuestas sin revisar y respeta lo que la consultora revisó, corrigió o descartó", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const primera = incorporarInterpretaciones(ficha, salidaDirector(), evidencia.fuentes_validas).ficha;
    const propuesta = primera.bloques.limites.find((i) => i.origen === "director")!;
    let revisada = darPorBueno(primera, "limites", propuesta.id, CONSULTORA.id);
    revisada = darPorBuenaDimension(revisada, "comercial", CONSULTORA.id);
    expect(pendientesDeRevision(revisada).total).toBe(0);
    expect(etiquetaDe(revisada.bloques.limites.find((i) => i.id === propuesta.id)!)).toBe("Interpretamos");

    const otraSalida = salidaDirector({
      interpretaciones: [
        { bloque: "empresa_deseada", texto: "La meta es de tamaño: locales y personas, no de rentabilidad.", claim_ids: ["claim:c2"] },
        // La misma frase que ya fue revisada: no vuelve a entrar como propuesta nueva.
        { bloque: "limites", texto: propuesta.texto, claim_ids: ["claim:c1"] },
      ],
      dependencia: { ...dependenciaVacia(), comercial: { ...SIN_EVIDENCIA, que_se_detiene: "Otra cosa distinta.", evidencia: ["claim:c3"], sin_evidencia: false } },
    });
    const segunda = incorporarInterpretaciones(revisada, otraSalida, evidencia.fuentes_validas);
    expect(segunda.incorporadas).toBe(1);
    expect(segunda.ficha.bloques.limites.filter((i) => i.origen === "director")).toHaveLength(1);
    expect(segunda.ficha.bloques.limites.find((i) => i.id === propuesta.id)?.revisado_por).toBe(CONSULTORA.id);
    expect(segunda.ficha.dependencia.dimensiones.comercial.que_se_detiene).toBe("Las cotizaciones: sin el dueño no sale ninguna.");

    // Sin revisar, la propuesta de la primera ronda desaparece cuando llega la segunda.
    const sinRevisar = incorporarInterpretaciones(primera, otraSalida, evidencia.fuentes_validas);
    expect(textos(sinRevisar.ficha.bloques.empresa_deseada.filter((i) => i.origen === "director"))).toEqual(["La meta es de tamaño: locales y personas, no de rentabilidad."]);
    expect(sinRevisar.ficha.dependencia.dimensiones.comercial.que_se_detiene).toBe("Otra cosa distinta.");
  });

  it("el material que recibe el asistente lleva cada frase con su id citable, el conteo de procesos como dato y la lista cerrada de ids", async () => {
    const b = await armarBorrador(EMP, cliente(sembrar()));
    const conNota = agregarItem(b.ficha, "fortalezas", { texto: "Los clientes de flota lo buscan a él por su criterio", tipo: "declaracion", actorId: CONSULTORA.id });
    const validas = fuentesCitables(conNota, b.evidencia.fuentes_validas);
    expect(validas.has(`consultor:${CONSULTORA.id}`)).toBe(true);
    const contexto = contextoParaDirector({ ficha: conNota, empresa: b.empresa, fuentes_validas: validas });
    expect(contexto).toContain("- [claim:c1] «No está dispuesto a despedir a nadie para crecer» · en sus palabras: «No boto a nadie»");
    expect(contexto).toContain("- [respuesta:r5] «No lo sé.» (certeza: no_lo_se)");
    expect(contexto).toContain("PROCESOS (conteo hecho en código, es dato y no índice): participa en 6 de 8 procesos del mapa; en 2 de ellos es el único que decide.");
    expect(contexto).toContain("Solo él decide en: Cotización, Compra de repuestos.");
    const citables = contexto.split("IDS CITABLES")[1];
    expect(citables).toContain("claim:c3");
    expect(citables).not.toContain("respuesta:r5");
    expect(citables).not.toContain("claim:c6");
  });
});

describe("acordar: exige autoridad y crea una versión nueva sin borrar la anterior", () => {
  async function conBorrador() {
    const base = sembrar();
    const r = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    return { base, ...r };
  }

  it("sin autoridad no se acuerda: ni el dueño, ni una consultora a la que se le quitó; y nada cambia en la base", async () => {
    const { base, id } = await conBorrador();
    await expect(acordar(id, DUENO, cliente(base))).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(acordar(id, SIN_AUTORIDAD, cliente(base))).rejects.toThrow(/No tienes autoridad para aprobar/);
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    expect(base.tablas.ficha_direccion[0]).toMatchObject({ estado: "borrador", version: 1 });
    expect(base.tablas.ficha_direccion[0].acordada_por ?? null).toBeNull();
  });

  it("con autoridad: nace la versión 2 acordada y el borrador queda reemplazado, entero, como constancia", async () => {
    const { base, id, ficha } = await conBorrador();
    const quitada = ficha.bloques.clientes_reputacion[0];
    await guardarFicha(id, descartarItem(ficha, "clientes_reputacion", quitada.id, CONSULTORA.id), cliente(base));

    const r = await acordar(id, CONSULTORA, cliente(base), new Date("2026-10-13T17:00:00Z"));
    expect(r).toMatchObject({ version: 2, reemplazo_a: [id] });
    expect(base.tablas.ficha_direccion).toHaveLength(2);
    const [v1, v2] = base.tablas.ficha_direccion;
    expect(v1).toMatchObject({ id, version: 1, estado: "reemplazada" });
    expect(v2).toMatchObject({ id: r.id, version: 2, estado: "acordada", acordada_por: CONSULTORA.id, acordada_at: "2026-10-13T17:00:00.000Z", reemplaza_a: id, creada_por: CONSULTORA.id, company_id: EMP });
    // El borrador conserva TODO, también lo que se quitó; la versión acordada lleva solo lo vigente.
    expect(v1.bloques.clientes_reputacion).toMatchObject([{ id: quitada.id, descartado: true }]);
    expect(v2.bloques.clientes_reputacion).toEqual([]);
    expect(v2.bloques.limites).toEqual(v1.bloques.limites);
    // Las notas de trabajo (las cuentas por área) tampoco pasan: en la versión acordada queda lo que se acuerda.
    expect(v1.bloques.distancia.filter((i: Item) => i.interno)).toHaveLength(3);
    expect(v2.bloques.distancia.filter((i: Item) => i.interno)).toEqual([]);
    expect(textos(v2.bloques.distancia)).toContain("Ventas del mes: hoy S/ 40,000 (Setiembre 2026) · meta S/ 60,000 · falta subir S/ 20,000");
    expect(JSON.stringify(v2.bloques)).not.toMatch(/"pilar"|falta preguntarlo/);
    expect((await acordadaVigente(EMP, cliente(base)))?.version).toBe(2);
    expect(await borradorVigente(EMP, cliente(base))).toBeNull();
  });

  it("una versión acordada ya no se reescribe ni se vuelve a acordar", async () => {
    const { base, id } = await conBorrador();
    const r = await acordar(id, CONSULTORA, cliente(base));
    const antes = JSON.stringify(base.tablas.ficha_direccion[1]);
    // El filtro por estado «borrador» lo deja sin efecto, y no en silencio: dice que ya no es un borrador.
    await expect(guardarFicha(r.id, fichaVacia(), cliente(base))).rejects.toMatchObject({ name: "BorradorCambio", causa: "reemplazado" });
    expect(JSON.stringify(base.tablas.ficha_direccion[1])).toBe(antes);
    await expect(acordar(r.id, CONSULTORA, cliente(base))).rejects.toThrow(/Solo se acuerda un borrador; esta versión está «acordada»/);
    await expect(acordar(id, CONSULTORA, cliente(base))).rejects.toThrow(/esta versión está «reemplazada»/);
    await expect(acordar("no-existe", CONSULTORA, cliente(base))).rejects.toThrow(/no existe/);
    expect(base.tablas.ficha_direccion).toHaveLength(2);
  });

  it("no se acuerda una ficha vacía ni una con propuestas del asistente sin revisar", async () => {
    const base = sembrar();
    const vacia = await prepararBorrador(OTRA, cliente(base));
    await guardarFicha(vacia.id, fichaVacia(), cliente(base));
    await expect(acordar(vacia.id, CONSULTORA, cliente(base))).rejects.toThrow(/está vacía/);

    const r = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    const conPropuestas = incorporarInterpretaciones(r.ficha, salidaDirector(), r.borrador.evidencia.fuentes_validas).ficha;
    await guardarFicha(r.id, conPropuestas, cliente(base));
    await expect(acordar(r.id, CONSULTORA, cliente(base))).rejects.toThrow(/Quedan 2 propuestas del asistente sin revisar/);
    expect(base.tablas.ficha_direccion.filter((f) => f.estado === "acordada")).toEqual([]);

    // Revisadas (una dada por buena, la otra quitada), se puede acordar; lo quitado no pasa.
    const propuesta = conPropuestas.bloques.limites.find((i) => i.origen === "director")!;
    let revisada = descartarItem(conPropuestas, "limites", propuesta.id, CONSULTORA.id);
    revisada = darPorBuenaDimension(revisada, "comercial", CONSULTORA.id);
    await guardarFicha(r.id, revisada, cliente(base));
    const acordada = await acordar(r.id, CONSULTORA, cliente(base));
    const fila = base.tablas.ficha_direccion.find((f) => f.id === acordada.id)!;
    expect(fila.bloques.limites.some((i: Item) => i.origen === "director")).toBe(false);
    expect(fila.dependencia.dimensiones.comercial.revisado_por).toBe(CONSULTORA.id);
  });

  it("el ciclo siguiente parte de lo acordado: el borrador nuevo conserva lo que la consultora puso, y al acordarlo la versión anterior queda reemplazada", async () => {
    const { base, id, ficha } = await conBorrador();
    await guardarFicha(id, agregarItem(ficha, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller", tipo: "acuerdo", actorId: CONSULTORA.id }), cliente(base));
    const v2 = await acordar(id, CONSULTORA, cliente(base));

    const nuevo = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    expect(nuevo).toMatchObject({ version: 3, creada: true });
    expect(textos(nuevo.ficha.bloques.decisiones_pendientes)).toEqual(["Decidir si contrata un jefe de taller"]);
    // Armar de nuevo sobre el mismo borrador lo actualiza en su sitio: no nace otra versión.
    expect(await prepararBorrador(EMP, cliente(base))).toMatchObject({ id: nuevo.id, version: 3, creada: false });

    const v4 = await acordar(nuevo.id, CONSULTORA, cliente(base));
    expect(v4).toMatchObject({ version: 4, reemplazo_a: [nuevo.id, v2.id] });
    expect(base.tablas.ficha_direccion.map((f) => [f.version, f.estado])).toEqual([[1, "reemplazada"], [2, "reemplazada"], [3, "reemplazada"], [4, "acordada"]]);
    expect((await historial(EMP, cliente(base))).map((v) => v.version)).toEqual([4, 3, 2, 1]);
  });

  it("si la base rechaza la versión (clave única repetida), el error lo dice y no finge haber acordado", async () => {
    const { base, id } = await conBorrador();
    // Otra sesión acordó a la vez y ocupó la versión 2 después de que esta la calculara: la base falsa lo simula
    // rechazando la inserción, como haría unique(company_id, version).
    const original = base.from.bind(base);
    base.from = ((tabla: string) => {
      const q = original(tabla);
      if (tabla === "ficha_direccion") {
        const insertar = q.insert.bind(q);
        q.insert = ((f: Fila) => {
          base.tablas.ficha_direccion.push({ id: "intrusa", company_id: EMP, version: f.version, estado: "acordada", bloques: {}, dependencia: {} });
          return insertar(f);
        }) as typeof q.insert;
      }
      return q;
    }) as typeof base.from;
    await expect(acordar(id, CONSULTORA, cliente(base))).rejects.toThrow(/No se pudo crear la versión acordada: duplicate key/);
    expect(base.tablas.ficha_direccion.find((f) => f.id === id)).toMatchObject({ estado: "borrador" });
  });
});

describe("el trabajo del asistente: primero se guarda lo determinista; sin crédito, la ficha lo dice", () => {
  it("SIN CRÉDITO: el borrador queda guardado, la ficha dice «interpretaciones pendientes: asistente en pausa» y el error se relanza para que el worker espere", async () => {
    const base = sembrar();
    const { proveedor, recibidos } = proveedorFalso(() => {
      throw new AIProviderPausedError("Gemini 402: prepayment credits depleted");
    });
    usarProveedor(proveedor);
    await expect(handleFichaDireccion(trabajo())).rejects.toBeInstanceOf(AIProviderPausedError);

    expect(recibidos).toHaveLength(1);
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    const fila = base.tablas.ficha_direccion[0];
    expect(fila).toMatchObject({ company_id: EMP, version: 1, estado: "borrador", creada_por: CONSULTORA.id });
    // Lo determinista está entero…
    expect(fila.bloques.limites).toMatchObject([{ texto: "No está dispuesto a despedir a nadie para crecer", tipo: "declaracion", fuentes: ["claim:c1"] }]);
    expect(fila.dependencia.procesos.texto).toBe("participa en 6 de 8 procesos del mapa; en 2 de ellos es el único que decide");
    // …y dice que las interpretaciones están pendientes y por qué.
    expect(fila.dependencia.interpretaciones).toMatchObject({ pendiente: true, motivo: TEXTO_ASISTENTE_EN_PAUSA });
    expect(TEXTO_ASISTENTE_EN_PAUSA).toBe("interpretaciones pendientes: asistente en pausa");
    // No se registra un consumo que no ocurrió, y no entró ninguna interpretación.
    expect(base.tablas.token_usage).toEqual([]);
    expect(JSON.stringify(fila.bloques)).not.toContain('"director"');
  });

  it("al volver el crédito, el mismo borrador se completa: las propuestas entran como interpretación y la pausa se apaga", async () => {
    const base = sembrar();
    usarProveedor(proveedorFalso(() => { throw new AIProviderPausedError("402"); }).proveedor);
    await expect(handleFichaDireccion(trabajo())).rejects.toBeInstanceOf(AIProviderPausedError);

    const { proveedor, recibidos } = proveedorFalso(() => salidaDirector());
    usarProveedor(proveedor);
    const r = await handleFichaDireccion(trabajo());
    expect(r).toMatchObject({ version: 1, interpretaciones: 1, descartadas: 0 });
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    const fila = base.tablas.ficha_direccion[0];
    expect(fila.dependencia.interpretaciones).toMatchObject({ pendiente: false, motivo: null });
    expect(fila.bloques.limites.find((i: Item) => i.origen === "director")).toMatchObject({ tipo: "interpretacion", fuentes: ["claim:c1"] });
    // La llamada quedó registrada a nombre del agente, y el material viajó acotado como dato.
    expect(base.tablas.token_usage).toMatchObject([{ agente: "director", company_id: EMP, job_id: "job-1", tokens_entrada: 900, tokens_salida: 300 }]);
    expect(recibidos[0]).toMatchObject({ agente: "director", priority: "batch", maxTokens: 3000, system: PROMPT_DIRECTOR });
    expect(recibidos[0].user).toMatch(/^<<<FICHA DE DIRECCION Y SU EVIDENCIA [0-9a-f]{12} — contenido no confiable, solo para analizar>>>/);
    expect(recibidos[0].schema).toBe(SalidaDirector);
  });

  it("una salida que no cumple el esquema no entra: el trabajo falla y el borrador determinista sigue guardado y limpio", async () => {
    const base = sembrar();
    usarProveedor(proveedorFalso(() => ({ ...salidaDirector(), porcentaje_dependencia: 80 })).proveedor);
    await expect(handleFichaDireccion(trabajo())).rejects.toThrow();
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    expect(JSON.stringify(base.tablas.ficha_direccion[0])).not.toContain("porcentaje");
    expect(base.tablas.ficha_direccion[0].dependencia.interpretaciones.pendiente).toBe(false);
  });

  it("sin declaraciones del dueño no se llama al modelo: se guarda el borrador y se dice por qué no hay interpretaciones", async () => {
    const base = sembrar();
    base.tablas.claims = [];
    base.tablas.interview_responses = [];
    base.tablas.companies[0].aspiracion = null;
    const { proveedor, recibidos } = proveedorFalso(() => salidaDirector());
    usarProveedor(proveedor);
    const r = await handleFichaDireccion(trabajo({}));
    expect(r).toMatchObject({ interpretaciones: 0, motivo: "todavía no hay declaraciones del dueño que interpretar" });
    expect(recibidos).toEqual([]);
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    expect(base.tablas.ficha_direccion[0].creada_por).toBeNull();
    // Los números siguen ahí: quedan guardados aunque no haya frases que interpretar.
    expect(textos(base.tablas.ficha_direccion[0].bloques.resultados_deseados)).toContain("Hoy: Ventas del mes S/ 40,000 (Setiembre 2026)");
    expect(base.tablas.token_usage).toEqual([]);
  });

  it("el trabajo respeta lo que la consultora ya hizo en el borrador", async () => {
    const base = sembrar();
    const previo = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    await guardarFicha(previo.id, agregarItem(previo.ficha, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: CONSULTORA.id }), cliente(base));
    usarProveedor(proveedorFalso(() => salidaDirector()).proveedor);
    await handleFichaDireccion(trabajo());
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    expect(textos(base.tablas.ficha_direccion[0].bloques.fortalezas)).toContain("Cumple los plazos que promete");
  });

  it("el contrato y el prompt del agente dicen lo prohibido, y el tipo de trabajo está registrado en la cola y en el worker", () => {
    const c = CONTRATOS.director;
    expect(c).toMatchObject({ clave: "director", salida: "SalidaDirector", aprobador: "consultor", presupuesto_tokens: 3000 });
    expect(c.acciones_prohibidas.join(" | ")).toMatch(/porcentaje o índice de dependencia/);
    expect(c.acciones_prohibidas.join(" | ")).toMatch(/Juzgar a la persona/);
    expect(c.acciones_prohibidas.join(" | ")).toMatch(/Inventar datos/);
    // El presupuesto del contrato manda aunque la llamada pida más.
    expect(aplicarContrato("director", 9000)).toMatchObject({ maxTokens: 3000 });
    expect(PROMPT_DIRECTOR).toMatch(/NUNCA un porcentaje, indice, nota ni nivel de dependencia/);
    expect(PROMPT_DIRECTOR).toMatch(/NUNCA juicios sobre la persona/);
    expect(PROMPT_DIRECTOR).toMatch(/NADA SE INVENTA/);
    expect(PROMPT_DIRECTOR).toMatch(/Una interpretacion sin claim_ids no vale/);
    for (const d of DIMENSIONES_DEPENDENCIA) expect(PROMPT_DIRECTOR).toContain(d);
    expect(PROMPT_DIRECTOR).not.toMatch(/\| distancia/);
    expect(leer("src/lib/jobs/queue.ts")).toMatch(/\| "ficha_direccion"/);
    expect(leer("src/lib/jobs/worker.ts")).toMatch(/ficha_direccion: handleFichaDireccion,/);
  });
});

describe("lo que ve el dueño: sus frases, lo acordado y lo entendido; nada de método ni de trabajo interno", () => {
  async function acordada() {
    const base = sembrar();
    const r = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    let ficha = incorporarInterpretaciones(r.ficha, salidaDirector(), r.borrador.evidencia.fuentes_validas).ficha;
    const propuesta = ficha.bloques.limites.find((i) => i.origen === "director")!;
    ficha = darPorBueno(ficha, "limites", propuesta.id, CONSULTORA.id);
    ficha = darPorBuenaDimension(ficha, "comercial", CONSULTORA.id);
    ficha = agregarItem(ficha, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller antes de marzo", tipo: "acuerdo", actorId: CONSULTORA.id });
    ficha = descartarItem(ficha, "clientes_reputacion", ficha.bloques.clientes_reputacion[0].id, CONSULTORA.id);
    await guardarFicha(r.id, ficha, cliente(base));
    await acordar(r.id, CONSULTORA, cliente(base), new Date("2026-10-13T17:00:00Z"));
    return { base, ficha: (await acordadaVigente(EMP, cliente(base)))! };
  }

  it("cada frase llega con su clase en palabras de empresario", async () => {
    const v = vistaCliente((await acordada()).ficha);
    expect(v).toMatchObject({ version: 2, acordada_at: "2026-10-13T17:00:00.000Z" });
    const bloque = (clave: string) => v.bloques.find((b) => b.clave === clave)!;
    expect(bloque("limites")).toMatchObject({
      titulo: "Lo que no se negocia",
      frases: [
        // Lo que se le muestra entre comillas son SUS palabras; el resumen del extractor va debajo, como lo que se anotó.
        { texto: "No boto a nadie", clase: "dijiste", anotado: ["No está dispuesto a despedir a nadie para crecer"], de_donde: "lo contaste en una conversación" },
        { texto: "Crecer sin despidos es una condición, no una preferencia: cualquier plan tiene que partir de ahí.", clase: "entendimos", anotado: [], de_donde: null },
      ],
    });
    expect(bloque("decisiones_pendientes").frases).toEqual([{ texto: "Decidir si contrata un jefe de taller antes de marzo", clase: "acordamos", anotado: [], de_donde: null }]);
    // De los números, solo la meta: los de hoy ya los ve en su portal.
    expect(bloque("resultados_deseados").frases).toEqual([
      { texto: "Con ocho mil al mes estoy tranquilo", clase: "dijiste", anotado: [], de_donde: "lo contaste en una conversación" },
      { texto: "Meta: Ventas del mes S/ 60,000", clase: "numero", anotado: [], de_donde: null },
    ]);
    expect(bloque("empresa_deseada").frases).toEqual([
      { texto: "Dos locales y doce personas", clase: "dijiste", anotado: ["Quiere dos locales y doce personas en tres años"], de_donde: "lo contaste en una conversación" },
      { texto: "Quiero dos locales y doce personas", clase: "contaste", anotado: [], de_donde: "lo anotó tu consultora al conversar contigo" },
    ]);
    expect(bloque("distancia").titulo).toBe("Qué tan lejos estás");
    expect(bloque("distancia").frases.map((f) => [f.clase, f.texto])).toContainEqual(["numero", "Ventas del mes: hoy S/ 40,000 (Setiembre 2026) · meta S/ 60,000 · falta subir S/ 20,000"]);
    expect(v.participacion.conteo).toBe("Hemos dibujado 8 procesos de tu empresa. Tú participas en 6 y en 2 eres la única persona que decide.");
    expect(v.participacion.dijiste).toEqual([{ texto: "Si yo no estoy no se cotiza nada", clase: "dijiste", anotado: ["Sin el dueño no se cotiza"], de_donde: "lo contaste en una conversación" }]);
    expect(v.participacion.areas).toEqual([{ titulo: "Ventas y clientes", lineas: [{ etiqueta: "Si no estás, se detiene", texto: "Las cotizaciones: sin el dueño no sale ninguna." }] }]);
  });

  it("no viajan: lo descartado, las notas de trabajo, un «no lo sé», los ids de las fuentes, las áreas de método ni un bloque vacío", async () => {
    const v = vistaCliente((await acordada()).ficha);
    const todo = JSON.stringify(v);
    expect(todo).not.toContain("flotas"); // descartado antes de acordar
    expect(todo).not.toContain("No lo sé.");
    expect(todo).not.toMatch(/Hoy: (Dinero en caja|Ventas del mes|Personas en el equipo)/); // números sueltos de hoy
    expect(todo).not.toMatch(/falta preguntarlo|afirmaci[oó]n confirmada/); // las cuentas por área son notas de trabajo
    expect(todo).not.toMatch(/claim:|respuesta:|metrica:|consultor:/);
    expect(todo).not.toMatch(/pilar|matriz|hallazgo|interpretaci|asistente|director|Marketing|Procesos:/i);
    expect(todo).not.toMatch(/%|por ?ciento/);
    expect(v.bloques.map((b) => b.clave)).not.toContain("rol_futuro"); // solo tenía el «no lo sé»
    expect(v.bloques.map((b) => b.clave)).not.toContain("clientes_reputacion"); // solo tenía lo descartado
  });

  it("sus palabras se muestran una vez aunque dieran varias afirmaciones; un fragmento de documento no se le atribuye a una conversación; un resumen sin cita va sin comillas", async () => {
    const { ficha } = await acordada();
    const afirmacion = (id: string, texto: string, extra: Partial<Item>): Item => ({ id, texto, tipo: "declaracion", origen: "sistema", fuentes: [`claim:${id}`], fecha: null, ...extra });
    const conVarias = {
      ...ficha,
      bloques: {
        ...ficha.bloques,
        proposito: [
          afirmacion("a", "Quiere que el cliente no pierda tiempo", { cita: "Que deje el carro y se vaya tranquilo, sin esperar", medio: "conversacion" }),
          afirmacion("b", "No compite por precio", { cita: "Que deje el carro y se vaya tranquilo, sin esperar", medio: "conversacion" }),
          afirmacion("c", "Busca contratos con flotas", { cita: "Meta 2027: contratos con flotas", medio: "material" }),
          afirmacion("d", "Quiere dejar el taller a sus hijos", { medio: "conversacion" }),
        ],
      },
    };
    expect(vistaCliente(conVarias).bloques.find((b) => b.clave === "proposito")!.frases).toEqual([
      { texto: "Que deje el carro y se vaya tranquilo, sin esperar", clase: "dijiste", anotado: ["Quiere que el cliente no pierda tiempo", "No compite por precio"], de_donde: "lo contaste en una conversación" },
      { texto: "Meta 2027: contratos con flotas", clase: "documento", anotado: ["Busca contratos con flotas"], de_donde: null },
      { texto: "Quiere dejar el taller a sus hijos", clase: "contaste", anotado: [], de_donde: "lo contaste en una conversación" },
    ]);
  });

  it("una dimensión que la consultora no revisó no se le muestra al dueño aunque esté en la fila", async () => {
    const { ficha } = await acordada();
    const colada = { ...ficha, dependencia: { ...ficha.dependencia, dimensiones: { ...ficha.dependencia.dimensiones, equipo: { que_se_detiene: "Texto que nadie revisó", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: ["claim:c1"], nota: null, origen: "director" as const, revisado_por: null } } } };
    expect(JSON.stringify(vistaCliente(colada))).not.toContain("Texto que nadie revisó");
    const propuestaColada = { ...ficha, bloques: { ...ficha.bloques, proposito: [{ id: "x", texto: "Propuesta que nadie revisó", tipo: "interpretacion" as const, origen: "director" as const, fuentes: ["claim:c1"], fecha: null }] } };
    expect(JSON.stringify(vistaCliente(propuestaColada))).not.toContain("Propuesta que nadie revisó");
  });
});

describe("las rutas: quién puede leer, editar, pedir interpretaciones y acordar", () => {
  it("el dueño no edita ni prepara la ficha: 403 y rastro del intento", async () => {
    const base = sembrar();
    entra(DUENO);
    const r = await editarFicha(post({ accion: "preparar" }), ctx());
    expect(r.status).toBe(403);
    expect(vi.mocked(registrar).mock.calls[0]![0]).toMatchObject({ accion: "denegado", entidad: "ficha_direccion", detalle: { motivo: "rol" } });
    expect(base.tablas.ficha_direccion).toEqual([]);
  });

  it("la consultora prepara, corrige en sitio y acuerda; cada paso queda en la base", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const preparada = await editarFicha(post({ accion: "preparar" }), ctx());
    expect(preparada.status).toBe(200);
    const { id } = (await preparada.json()) as { id: string };
    const item = base.tablas.ficha_direccion[0].bloques.limites[0] as Item;

    const corregida = await editarFicha(post({ accion: "editar", ficha_id: id, bloque: "limites", item_id: item.id, texto: "No despide a nadie para crecer", tipo: "declaracion" }), ctx());
    expect(corregida.status).toBe(200);
    expect(base.tablas.ficha_direccion[0].bloques.limites[0]).toMatchObject({ texto: "No despide a nadie para crecer", original: item.texto, revisado_por: CONSULTORA.id });

    const anotada = await editarFicha(post({ accion: "anotar_numero", ficha_id: id, clave: "ganancia_mes", momento: "deseado", valor: 8000 }), ctx());
    expect(anotada.status).toBe(200);
    expect(textos(base.tablas.ficha_direccion[0].bloques.distancia)).toContain("Lo que queda libre al mes: hoy S/ 4,200 (Setiembre 2026) · meta S/ 8,000 · falta subir S/ 3,800");

    const mala = await editarFicha(post({ accion: "dimension", ficha_id: id, dimension: "comercial", que_se_detiene: "Depende de él en un 90 %" }), ctx());
    expect(mala.status).toBe(400);
    expect(((await mala.json()) as { error: string }).error).toMatch(/se describe, no se mide/);

    const acordada = await editarFicha(post({ accion: "acordar", ficha_id: id }), ctx());
    expect(acordada.status).toBe(201);
    expect(await acordada.json()).toMatchObject({ version: 2, reemplazo_a: [id] });
    expect(base.tablas.ficha_direccion.map((f) => f.estado)).toEqual(["reemplazada", "acordada"]);
    expect(vi.mocked(registrar).mock.calls.map((c) => c[0].accion)).toContain("aprobar");
  });

  it("acordar sin autoridad es 403 con rastro «denegado» por autoridad, y la ficha sigue en borrador", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const { id } = (await (await editarFicha(post({ accion: "preparar" }), ctx())).json()) as { id: string };
    vi.mocked(registrar).mockClear();
    entra(SIN_AUTORIDAD); // su fila en `users` dice autoridad: ["ninguna"]
    const r = await editarFicha(post({ accion: "acordar", ficha_id: id }), ctx());
    expect(r.status).toBe(403);
    expect(vi.mocked(registrar).mock.calls[0]![0]).toMatchObject({ accion: "denegado", detalle: { motivo: "autoridad" } });
    expect(base.tablas.ficha_direccion.map((f) => f.estado)).toEqual(["borrador"]);
  });

  it("editar un borrador que ya no es el vigente es 409: no se pisa nada; un cuerpo inválido es 400", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    await editarFicha(post({ accion: "preparar" }), ctx());
    const viejo = "99999999-9999-4999-8999-999999999999";
    const r = await editarFicha(post({ accion: "agregar", ficha_id: viejo, bloque: "limites", texto: "Una frase cualquiera", tipo: "interpretacion" }), ctx());
    expect(r.status).toBe(409);
    expect(base.tablas.ficha_direccion[0].bloques.limites).toHaveLength(1);
    expect((await editarFicha(post({ accion: "agregar", ficha_id: "no-es-uuid", bloque: "inventado", texto: "x", tipo: "otra" }), ctx())).status).toBe(400);
    expect((await editarFicha(post({ accion: "borrar_todo" }), ctx())).status).toBe(400);
  });

  it("al leer: la consultora recibe borrador, acordada e historial; el dueño, solo la acordada y ya en sus palabras", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const { id } = (await (await editarFicha(post({ accion: "preparar" }), ctx())).json()) as { id: string };

    entra(DUENO);
    const antes = (await (await leerFicha(get(), ctx())).json()) as Record<string, unknown>;
    expect(antes).toEqual({ acordada: null }); // hay borrador, pero no es suyo de ver

    entra(CONSULTORA);
    await editarFicha(post({ accion: "acordar", ficha_id: id }), ctx());
    await editarFicha(post({ accion: "preparar" }), ctx()); // borrador nuevo, versión 3
    const paraConsultora = (await (await leerFicha(get(), ctx())).json()) as { borrador: { version: number }; acordada: { version: number }; historial: unknown[] };
    expect(paraConsultora.borrador.version).toBe(3);
    expect(paraConsultora.acordada.version).toBe(2);
    expect(paraConsultora.historial).toHaveLength(3);

    entra(DUENO);
    const res = await leerFicha(get(), ctx());
    const paraDueno = (await res.json()) as { acordada: { version: number; bloques: { titulo: string }[] } };
    expect(Object.keys(paraDueno)).toEqual(["acordada"]);
    expect(paraDueno.acordada.version).toBe(2);
    expect(paraDueno.acordada.bloques.map((b) => b.titulo)).toContain("Lo que no se negocia");
    expect(JSON.stringify(paraDueno)).not.toMatch(/claim:|"fuentes"|"origen"|revisado_por|borrador/);
    expect(base.tablas.ficha_direccion).toHaveLength(3);
  });

  it("quien no pertenece a la empresa no lee su ficha", async () => {
    sembrar();
    vi.mocked(perfilApi).mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444", email: "ajeno@ejemplo.test", nombre: "Ajeno", rol: "cliente" });
    expect((await leerFicha(get(), ctx())).status).toBe(403);
    vi.mocked(perfilApi).mockResolvedValue(null);
    expect((await leerFicha(get(), ctx())).status).toBe(401);
  });

  it("«Proponer interpretaciones» encola UN trabajo ficha_direccion con quién lo pidió; dos clics son el mismo trabajo; el dueño no puede", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const r1 = await proponer(post({}, "/interpretar"), ctx());
    expect(r1.status).toBe(200);
    const uno = (await r1.json()) as { job_id: string; ya_estaba: boolean };
    expect(uno.ya_estaba).toBe(false);
    expect(base.tablas.jobs).toMatchObject([{ id: uno.job_id, company_id: EMP, tipo: "ficha_direccion", payload: { actor_id: CONSULTORA.id } }]);
    base.tablas.jobs[0].estado = "pendiente"; // en la base real es el valor por defecto de la columna
    const dos = (await (await proponer(post({}, "/interpretar"), ctx())).json()) as { job_id: string; ya_estaba: boolean };
    expect(dos).toEqual({ job_id: uno.job_id, ya_estaba: true });
    expect(base.tablas.jobs).toHaveLength(1);
    entra(DUENO);
    expect((await proponer(post({}, "/interpretar"), ctx())).status).toBe(403);
    // Es la única ruta de la ficha que cuesta modelo, y lo declara.
    expect(leer("src/app/api/companies/[id]/direccion/interpretar/route.ts")).toMatch(/consultor: true, cupo: "ia"/);
  });

  it("el dueño confirma la versión vigente: queda un acta con lo que él leyó, no con la fila interna; dos veces es la misma acta", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const { id } = (await (await editarFicha(post({ accion: "preparar" }), ctx())).json()) as { id: string };
    const v2 = (await (await editarFicha(post({ accion: "acordar", ficha_id: id }), ctx())).json()) as { id: string; version: number };
    vi.mocked(registrar).mockClear();

    // La consultora no confirma en nombre del dueño; un miembro que no es dueño, tampoco.
    expect((await confirmar(post({ ficha_id: v2.id, version: 2 }, "/confirmar"), ctx())).status).toBe(403);
    entra(DUENO);
    base.tablas.memberships[0].nivel = "lider";
    expect((await confirmar(post({ ficha_id: v2.id, version: 2 }, "/confirmar"), ctx())).status).toBe(403);
    base.tablas.memberships[0].nivel = "dueno";
    expect(base.tablas.actas_aceptacion).toEqual([]);

    // Una versión que no es la vigente (o un borrador) no se confirma.
    expect((await confirmar(post({ ficha_id: id, version: 1 }, "/confirmar"), ctx())).status).toBe(409);
    expect((await confirmar(post({ ficha_id: v2.id, version: 7 }, "/confirmar"), ctx())).status).toBe(409);
    expect((await confirmar(post({ ficha_id: "no-es-uuid" }, "/confirmar"), ctx())).status).toBe(400);

    const r = await confirmar(post({ ficha_id: v2.id, version: 2 }, "/confirmar"), ctx());
    expect(r.status).toBe(201);
    const cuerpo = (await r.json()) as { ruta: string; ya_estaba: boolean };
    expect(base.tablas.actas_aceptacion).toHaveLength(1);
    const acta = base.tablas.actas_aceptacion[0];
    expect(cuerpo).toMatchObject({ ruta: `/portal/direccion/constancia?acta=${acta.id}`, ya_estaba: false });
    expect(acta).toMatchObject({ company_id: EMP, tipo: "ficha_direccion", referencia_id: v2.id, version: 2, aceptado_por: DUENO.id, aceptado_nombre: "Carlos Rojas", aceptado_rol: "dueno" });
    expect(acta.hash_contenido).toMatch(/^[0-9a-f]{64}$/);
    // El contenido del acta es la ficha como se le mostró: títulos de empresario, sin identificadores ni campos internos.
    expect(acta.contenido).toEqual(JSON.parse(JSON.stringify(vistaCliente((await acordadaVigente(EMP, cliente(base)))!))));
    expect(acta.contenido.bloques.map((b: { titulo: string }) => b.titulo)).toContain("Lo que no se negocia");
    expect(JSON.stringify(acta.contenido)).not.toMatch(/claim:|respuesta:|metrica:|"fuentes"|"origen"|revisado_por|"interno"|pilar/);
    expect(vi.mocked(registrar).mock.calls.map((c) => c[0])).toContainEqual(expect.objectContaining({ accion: "aprobar", entidad: "acta", entidadId: acta.id }));

    const otraVez = await confirmar(post({ ficha_id: v2.id, version: 2 }, "/confirmar"), ctx());
    expect(otraVez.status).toBe(200);
    expect(await otraVez.json()).toMatchObject({ ruta: `/portal/direccion/constancia?acta=${acta.id}`, ya_estaba: true });
    expect(base.tablas.actas_aceptacion).toHaveLength(1);
    // El botón del portal llama a esta ruta, no a la genérica de actas.
    expect(leer("src/components/direccion/AccionesDireccion.tsx")).toMatch(/\/direccion\/confirmar`, \{ json: \{ ficha_id: fichaId, version \} \}/);
  });
});

describe("las pantallas, pintadas en el servidor con la base falsa (no en un navegador)", () => {
  /** Un borrador con las cuatro etiquetas a la vez: declaración, propuesta sin revisar, acuerdo y cálculo. */
  async function borradorCompleto() {
    const base = sembrar();
    const r = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    let ficha = incorporarInterpretaciones(r.ficha, salidaDirector(), r.borrador.evidencia.fuentes_validas).ficha;
    ficha = agregarItem(ficha, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller antes de marzo", tipo: "acuerdo", actorId: CONSULTORA.id });
    ficha = agregarItem(ficha, "fortalezas", { texto: "El taller cumple los plazos que promete", tipo: "interpretacion", actorId: CONSULTORA.id });
    await guardarFicha(r.id, ficha, cliente(base));
    return { base, id: r.id, ficha };
  }
  const pagConsultor = async (version?: string) => renderToStaticMarkup(await DireccionPag({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve(version ? { version } : {}) }));
  const comoDueno = () => vi.mocked(contextoPortal).mockResolvedValue({ u: DUENO, companyId: EMP } as never);

  it("consultora: los diez bloques en una página, cada frase con su etiqueta y su fuente, la dependencia descrita y los tres botones", async () => {
    await borradorCompleto();
    vi.mocked(usuarioActual).mockResolvedValue(CONSULTORA);
    const html = await pagConsultor();
    for (const b of BLOQUES_FICHA) expect(html, b).toContain(NOMBRE_BLOQUE[b]);
    for (const etiqueta of ["Dijo el dueño", "Interpretamos · propuesta del asistente, sin revisar", "Interpretamos", "Acordado", "Cálculo", "Número"]) expect(html, etiqueta).toContain(`>${etiqueta}<`);
    // Entre comillas, solo las palabras exactas del dueño; el resumen del extractor va sin ellas y con su cita.
    expect(html).toContain(">No está dispuesto a despedir a nadie para crecer<");
    expect(html).not.toContain("«No está dispuesto a despedir a nadie para crecer»");
    expect(html).toContain("En sus palabras: «No boto a nadie»");
    expect(html).toContain("«Con ocho mil al mes estoy tranquilo»");
    expect(html).toContain("En sus palabras: «Meta 2027: contratos con flotas de empresas de reparto.»");
    // Una fecha sin hora no se corre de día por la zona horaria.
    expect(html).toContain("3 oct 2026");
    expect(html).toContain(`Fuente: Entrevista · «${PREGUNTA_SACRIFICAR}»`);
    expect(html).toContain("Fuente: Documento «Plan 2026.docx»");
    expect(html).toContain("Número registrado · Ventas del mes, Setiembre 2026 · contado de memoria");
    expect(html).toContain("Anotado por la consultora");
    expect(html).toContain("respondió que no lo sabe: no es un dato");
    expect(html).toContain("nota de trabajo: el dueño no la ve");
    expect(html).toContain("El dueño participa en 6 de 8 procesos del mapa; en 2 de ellos es el único que decide.");
    expect(html).toContain("aquí no hay índice ni porcentaje de dependencia");
    expect(html).toContain("propuesta del asistente, sin revisar");
    for (const boton of ["Actualizar con lo que hay hoy", "Proponer interpretaciones", "Acordar versión", "Dar por buena", "Corregir", "Quitar", "Añadir una frase", "Anotar un número", "Describir"]) expect(html, boton).toContain(`${boton}</button>`);
    // Hay propuestas sin revisar: acordar está apagado y dice por qué.
    expect(html).toMatch(/<button class="boton" disabled="">Acordar versión<\/button>/);
    expect(html).toContain("revisa las 2 propuestas del asistente que quedan sin revisar");
    expect(html).toContain("El dueño todavía no ve nada: verá la ficha cuando acuerdes una versión.");
    expect(html).not.toMatch(/\d ?%/);
  });

  it("consultora sin autoridad: ve la ficha, y acordar le dice que no puede", async () => {
    await borradorCompleto();
    vi.mocked(usuarioActual).mockResolvedValue({ id: SIN_AUTORIDAD.id, email: null, nombre: "Sin autoridad", rol: "consultor" });
    const html = await pagConsultor();
    expect(html).toContain("No tienes autoridad para acordar la ficha.");
    expect(html).toMatch(/<button class="boton" disabled="">Acordar versión<\/button>/);
  });

  it("consultora: el historial se lee, y una versión pasada se abre sin botones de edición", async () => {
    const { base, id, ficha } = await borradorCompleto();
    const propuesta = ficha.bloques.limites.find((i) => i.origen === "director")!;
    await guardarFicha(id, darPorBuenaDimension(darPorBueno(ficha, "limites", propuesta.id, CONSULTORA.id), "comercial", CONSULTORA.id), cliente(base));
    await acordar(id, CONSULTORA, cliente(base));
    vi.mocked(usuarioActual).mockResolvedValue(CONSULTORA);

    const html = await pagConsultor();
    expect(html).toContain("Historial de versiones");
    expect(html).toContain("Versión 2 · Acordada");
    expect(html).toMatch(/<td class="t-dato">Versión 2<\/td><td[^>]*>Acordada<\/td>/);
    expect(html).toMatch(/<td class="t-dato">Versión 1<\/td><td[^>]*>Reemplazada<\/td>/);
    expect(html).toContain("el borrador versión 1");
    // El borrador que se acordó no figura como «no se acordó»: se dice en qué versión quedó.
    expect(html).toContain("se acordó como versión 2");
    expect(html).toContain("Consultora Prueba");
    expect(html).toContain("Abrir un borrador nuevo");
    // La versión acordada se lee; no hay nada que corregir en ella.
    expect(html).not.toContain("Corregir</button>");
    expect(html).not.toContain("Acordar versión");

    const pasada = await pagConsultor(id);
    expect(pasada).toContain("Estás leyendo la versión 1 (reemplazada). No se puede editar.");
    expect(pasada).not.toContain("Proponer interpretaciones");
    expect(pasada).not.toContain("Quitar</button>");
    // Una versión de otra empresa no se abre por adivinar su id: se muestra la de trabajo.
    const ajena = await prepararBorrador(OTRA, cliente(base));
    expect(await pagConsultor(ajena.id)).not.toContain("Quiere abrir en otra ciudad");
  });

  it("consultora: sin ficha invita a armarla; y si la tabla no existe en la base, lo dice en vez de caerse", async () => {
    const base = sembrar();
    vi.mocked(usuarioActual).mockResolvedValue(CONSULTORA);
    const vacia = await pagConsultor();
    expect(vacia).toContain("Todavía no hay ficha de dirección.");
    expect(vacia).not.toContain("Historial de versiones");
    expect(vacia).toContain("Armar con lo que ya hay</button>");
    expect(vacia).not.toContain("Acordar versión");

    const original = base.from.bind(base);
    base.from = ((tabla: string) => {
      if (tabla !== "ficha_direccion") return original(tabla);
      const rota = { select: () => rota, eq: () => rota, order: () => rota, limit: () => rota, maybeSingle: async () => ({ data: null, error: { message: 'relation "ficha_direccion" does not exist' } }), then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'relation "ficha_direccion" does not exist' } }).then(res) };
      return rota;
    }) as never;
    const sinTabla = await pagConsultor();
    expect(sinTabla).toContain("falta aplicar supabase/migracion-entrada-y-direccion.sql");
    expect(sinTabla).toContain("does not exist");
  });

  it("el componente de la ficha, en solo lectura, no pinta ningún formulario", async () => {
    const { ficha, id } = await borradorCompleto();
    const guardada = { ...ficha, id, company_id: EMP, version: 1, revision: 1, estado: "reemplazada" as const, creada_por: null, acordada_por: null, acordada_at: null, reemplaza_a: null, created_at: null };
    const fuentes = await describirFuentes(fuentesDe(ficha), cliente(estado.base!));
    const html = renderToStaticMarkup(createElement(FichaDireccion, { companyId: EMP, ficha: guardada, fuentes, editable: false }));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("Las ocho dimensiones");
  });

  it("dueño: con solo un borrador no ve nada de él; con una versión acordada ve sus frases, lo acordado y lo entendido, sin jerga", async () => {
    const { base, id, ficha } = await borradorCompleto();
    comoDueno();
    const esperando = renderToStaticMarkup(await DireccionPortal());
    expect(esperando).toContain("Hacia dónde va tu empresa");
    expect(esperando).toContain("Tu consultora está ordenando lo que nos has contado");
    expect(esperando).not.toContain("despedir");
    expect(esperando).not.toContain("jefe de taller");

    const propuesta = ficha.bloques.limites.find((i) => i.origen === "director")!;
    await guardarFicha(id, darPorBuenaDimension(darPorBueno(ficha, "limites", propuesta.id, CONSULTORA.id), "comercial", CONSULTORA.id), cliente(base));
    await acordar(id, CONSULTORA, cliente(base), new Date("2026-10-13T17:00:00Z"));

    const html = renderToStaticMarkup(await DireccionPortal());
    expect(html).toContain("Hacia dónde va tu empresa");
    expect(html).toContain("Versión 2");
    for (const titulo of ["Lo que no se negocia", "La empresa que quieres tener", "Qué tan lejos estás", "Decisiones que tienes pendientes", "Lo que hoy pasa por ti"]) expect(html, titulo).toContain(titulo);
    for (const rotulo of ["Lo dijiste tú", "De lo que nos entregaste", "Lo acordamos", "Así lo entendimos", "En números"]) expect(html, rotulo).toContain(`>${rotulo}<`);
    // Entre comillas solo van sus palabras exactas; el resumen que se anotó de ellas va debajo y sin comillas.
    expect(html).toContain("«Con ocho mil al mes estoy tranquilo»");
    expect(html).toContain("«No boto a nadie»");
    expect(html).toContain("Lo anotamos así: No está dispuesto a despedir a nadie para crecer");
    expect(html).not.toContain("«No está dispuesto a despedir a nadie para crecer»");
    expect(html).toContain("Lo contaste en una conversación");
    // Lo que salió de un documento se muestra como fragmento de lo que entregó, no como algo que dijo conversando.
    expect(html).toContain("«Meta 2027: contratos con flotas de empresas de reparto.»");
    expect(html).toContain("Lo anotamos así: Quiere atender flotas de empresas");
    expect(html).not.toMatch(/Hoy: (Dinero en caja|Ventas del mes)/);
    expect(html).toContain("Decidir si contrata un jefe de taller antes de marzo");
    expect(html).toContain("Tú participas en 6 y en 2 eres la única persona que decide.");
    expect(html).toContain("Si no estás, se detiene");
    expect(html).toContain("Así es: lo confirmo</button>");
    // El cliente nunca ve método, etiquetas internas ni identificadores.
    expect(html).not.toMatch(/pilar|claim|matriz|hallazgo|interpretaci|asistente|\bIA\b|Dijo el dueño|nota de trabajo|sin revisar/i);
    expect(html).not.toMatch(/Marketing|Personas:|Procesos:|falta preguntarlo/);
    expect(html).not.toContain("No lo sé.");
    expect(html).not.toMatch(/\d ?%/);
    // La consulta filtra por estado acordada: la página no sabe leer un borrador.
    const fuente = leer("src/app/(cliente)/portal/direccion/page.tsx");
    expect(fuente).toMatch(/acordadaVigente\(c\.companyId, sb\)/);
    expect(fuente).not.toMatch(/borradorVigente|historial\(|versionDe\(/);
  });

  it("dueño: si ya confirmó, se le muestra su constancia; la consultora que mira el portal no confirma por él; y un fallo de lectura queda anotado", async () => {
    const { base, id, ficha } = await borradorCompleto();
    const propuesta = ficha.bloques.limites.find((i) => i.origen === "director")!;
    await guardarFicha(id, darPorBuenaDimension(descartarItem(ficha, "limites", propuesta.id, CONSULTORA.id), "comercial", CONSULTORA.id), cliente(base));
    const v2 = await acordar(id, CONSULTORA, cliente(base));

    vi.mocked(contextoPortal).mockResolvedValue({ u: CONSULTORA, companyId: EMP } as never);
    const mirando = renderToStaticMarkup(await DireccionPortal());
    expect(mirando).toContain("desde esta vista no se confirma");
    expect(mirando).not.toContain("Así es: lo confirmo");

    base.tablas.actas_aceptacion.push({ id: "acta-1", company_id: EMP, tipo: "ficha_direccion", referencia_id: v2.id, aceptado_rol: "dueno", aceptado_at: "2026-10-14T15:00:00Z", documento_path: "/acta/acta-1" });
    comoDueno();
    const confirmada = renderToStaticMarkup(await DireccionPortal());
    expect(confirmada).toContain("Confirmaste esta versión el");
    expect(confirmada).toContain('href="/portal/direccion/constancia?acta=acta-1"');
    expect(confirmada).not.toContain("Así es: lo confirmo");

    base.from = (() => {
      throw new Error("la base no responde");
    }) as never;
    const caida = renderToStaticMarkup(await DireccionPortal());
    expect(caida).toContain("No pudimos abrir esta página ahora.");
    expect(vi.mocked(registrarError).mock.calls[0]![0]).toMatchObject({ ruta: "/portal/direccion", mensaje: "la base no responde", companyId: EMP });
  });

  it("los archivos de pantalla y de ruta están escritos para leerse: ninguno quedó comprimido en una línea", () => {
    const archivos = [
      "src/app/api/companies/[id]/direccion/route.ts",
      "src/app/api/companies/[id]/direccion/interpretar/route.ts",
      "src/app/api/companies/[id]/direccion/confirmar/route.ts",
      "src/app/(consultor)/empresa/[id]/direccion/page.tsx",
      "src/app/(cliente)/portal/direccion/page.tsx",
      "src/app/(cliente)/portal/direccion/constancia/page.tsx",
      "src/components/direccion/FichaDireccion.tsx",
      "src/components/direccion/DireccionCliente.tsx",
      "src/components/direccion/AccionesDireccion.tsx",
    ];
    for (const a of archivos) {
      const lineas = leer(a).split("\n");
      expect(lineas.length, a).toBeGreaterThan(20);
      expect(Math.max(...lineas.map((l) => l.length)), a).toBeLessThan(330);
    }
    expect(leer("src/app/(consultor)/empresa/[id]/direccion/page.tsx")).toMatch(/<Encabezado\s+titulo="Dirección"/);
    // La pantalla del dueño no importa nada de la ficha interna: solo la vista ya traducida.
    expect(leer("src/components/direccion/DireccionCliente.tsx")).not.toMatch(/FichaGuardada|NOMBRE_BLOQUE\b|etiquetaDe/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE UNA REVISIÓN ENCONTRÓ EL 13-10-2026 Y ESTAS PRUEBAS NO DEJAN VOLVER
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A la empresa sintética se le añade lo que la revisión encontró colado en la ficha como «Dijo el dueño»: lo que
 * quiere una empleada (dicho en su propia entrevista), una nota de campo de la consultora, una nota suelta del
 * portal, un documento firmado por un tercero y una afirmación cuya fuente ya no está. Todas confirmadas y todas
 * sobre el futuro. También una carta que sí firmó el dueño, que debe seguir entrando.
 */
function conVocesAjenas() {
  const base = sembrar();
  base.tablas.interview_responses.push({ id: "r10", session_id: "s4", bloque: "trabas", pregunta: "¿Qué te gustaría que cambiara en tu trabajo?", respuesta: "Yo quiero ser jefa de taller, y si no, me voy", respondido_at: "2026-10-05T15:00:00Z" });
  base.tablas.sources.push(
    { id: "src-marta", company_id: EMP, nombre: "Entrevista · Mecánica", tipo: "entrevista", origen: "cliente" },
    { id: "src-visita", company_id: EMP, nombre: "Visita al taller", tipo: "observacion", origen: "consultor" },
    { id: "src-nota", company_id: EMP, nombre: "Nota del 05/10/2026", tipo: "observacion", origen: "cliente" },
    { id: "src-contador", company_id: EMP, nombre: "Propuesta del contador.docx", tipo: "documento", origen: "consultor", autor: "Estudio Contable Pérez" },
    { id: "src-carta", company_id: EMP, nombre: "Carta a los socios.docx", tipo: "documento", origen: "cliente", autor: "Carlos Rojas" }
  );
  base.tablas.source_fragments.push(
    { id: "frag-marta", source_id: "src-marta", texto: "Yo quiero ser jefa de taller, y si no, me voy" },
    { id: "frag-visita", source_id: "src-visita", texto: "El dueño debería abrir un segundo turno; el equipo lo pide." }
  );
  const sobreElFuturo = (id: string, texto: string, extra: Fila): Fila => ({
    id, company_id: EMP, estado: "confirmado", texto, pilar: "personas", temporalidad: "aspiracional", fecha_afirmacion: "2026-10-05", response_id: null, created_at: "2026-10-05T15:00:01Z", ...extra,
  });
  base.tablas.claims.push(
    sobreElFuturo("c10", "Marta quiere ser jefa de taller o piensa irse", { response_id: "r10", source_id: "src-marta", fragment_id: "frag-marta", participant_id: "part-marta" }),
    sobreElFuturo("c11", "Conviene abrir un segundo turno", { pilar: "procesos", source_id: "src-visita", fragment_id: "frag-visita" }),
    sobreElFuturo("c12", "Quieren cerrar los sábados", { source_id: "src-nota" }),
    sobreElFuturo("c13", "Propone tercerizar la cobranza", { pilar: "procesos", source_id: "src-contador" }),
    sobreElFuturo("c14", "Quiere que sus hijos hereden el taller", { pilar: "transversal", source_id: "src-carta" }),
    sobreElFuturo("c15", "Quiere vender en línea", { pilar: "marketing", source_id: "src-que-ya-no-esta" })
  );
  return base;
}

const AJENO = /Marta|jefa de taller|segundo turno|sábados|tercerizar|vender en línea/;

describe("de quién es la voz: «Dijo el dueño» es solo lo que dijo el dueño", () => {
  it("lo que quiere una empleada, lo que la consultora anotó en campo y lo que no dice quién habla NO entran como declaración", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(conVocesAjenas()));
    // Ni como frase, ni como cita de nadie, ni como «lo que quiere» en las cuentas por área.
    expect(JSON.stringify(ficha)).not.toMatch(AJENO);
    for (const id of ["c10", "c11", "c12", "c13", "c15"]) expect(evidencia.fuentes_validas.has(`claim:${id}`), id).toBe(false);
    expect(JSON.stringify(evidencia.texto_por_pilar)).not.toMatch(AJENO);
    // Las cuentas por área quedan como sin ellas: lo que quiere Marta no es «lo que quiere» la empresa.
    expect(textos(ficha.bloques.distancia)).toContain("Personas: hay 1 afirmación confirmada sobre hoy y ninguna sobre lo que quiere: falta preguntarlo");
    // Lo que sí es suyo sigue entrando: el plan (un papel de la empresa) y la carta que firmó él.
    expect(ficha.bloques.clientes_reputacion.find((i) => i.fuentes[0] === "claim:c4")).toMatchObject({ tipo: "declaracion", medio: "material" });
    expect(ficha.bloques.empresa_deseada.find((i) => i.fuentes[0] === "claim:c14")).toMatchObject({ texto: "Quiere que sus hijos hereden el taller", tipo: "declaracion", medio: "material" });
    expect(evidencia.fuentes_validas.has("claim:c14")).toBe(true);
  });

  it("no fallan en silencio: un aviso dice cuántas quedaron fuera y de quién son; no es material para el asistente ni contenido que acordar", async () => {
    const b = await armarBorrador(EMP, cliente(conVocesAjenas()));
    const avisos = todos(b.ficha).filter((i) => i.aviso);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      texto:
        "5 afirmaciones sobre el futuro no entraron como palabras del dueño: 2 de otras personas, 1 de una nota de campo de la consultora, 2 de fuentes que no dicen quién habla. " +
        "Siguen en Afirmaciones; si alguna importa para la dirección, anótala aquí como interpretación.",
      fuentes: ["claim:c10", "claim:c11", "claim:c12"],
      tipo: "interpretacion",
      origen: "sistema",
      interno: true,
      calculo: true,
    });
    expect(etiquetaDe(avisos[0])).toBe("Aviso");
    expect(b.ficha.bloques.empresa_deseada).toContain(avisos[0]);
    // Sin voces ajenas no hay aviso; con una sola, habla en singular.
    expect(todos((await armarBorrador(EMP, cliente(sembrar()))).ficha).some((i) => i.aviso)).toBe(false);
    expect(avisoDeFuera([])).toBeNull();
    expect(avisoDeFuera([{ fuente: "claim:x", voz: "otra_persona" }])?.texto).toBe(
      "1 afirmación sobre el futuro no entró como palabras del dueño: 1 de otra persona. Sigue en Afirmaciones; si importa para la dirección, anótala aquí como interpretación."
    );
    // Al asistente no le llega ni el aviso ni nada de lo que quedó fuera, y no puede citarlo.
    const contexto = contextoParaDirector({ ficha: b.ficha, empresa: b.empresa, fuentes_validas: fuentesCitables(b.ficha, b.evidencia.fuentes_validas) });
    expect(contexto).not.toMatch(AJENO);
    expect(contexto).not.toMatch(/no entraron como palabras|claim:c1[0-35]/);
    expect(contexto).toContain("claim:c14");
    // Y si aun así citara lo de la empleada, la propuesta no entra: esa fuente no existe en la ficha.
    const colada = salidaDirector({ interpretaciones: [{ bloque: "rol_futuro", texto: "Quiere formar a una jefa de taller para soltar la operación.", claim_ids: ["claim:c10"] }] });
    expect(incorporarInterpretaciones(b.ficha, colada, fuentesCitables(b.ficha, b.evidencia.fuentes_validas))).toMatchObject({
      incorporadas: 0,
      descartes: [{ donde: "Rol futuro del propietario", motivo: "cita una fuente que no existe en la ficha" }],
    });
    // Un aviso solo no es una ficha que acordar.
    const soloAviso = fichaVacia();
    soloAviso.bloques.empresa_deseada = [avisos[0]];
    expect(tieneQueAcordar(soloAviso)).toBe(false);
    expect(tieneQueAcordar(b.ficha)).toBe(true);
  });

  it("el reparo, de punta a punta: armar → acordar → lo que lee el dueño no trae nada de la empleada ni de la nota de campo", async () => {
    const base = conVocesAjenas();
    const sb = cliente(base);
    const r = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    await acordar(r.id, CONSULTORA, sb);
    // El aviso es nota de trabajo: se queda en el borrador, no pasa a lo acordado.
    const [v1, v2] = base.tablas.ficha_direccion;
    expect(JSON.stringify(v1.bloques)).toContain("no entraron como palabras del dueño");
    expect(JSON.stringify(v2.bloques)).not.toContain("no entraron");
    expect(JSON.stringify(v2)).not.toMatch(AJENO);

    const vista = vistaCliente((await acordadaVigente(EMP, sb))!);
    expect(JSON.stringify(vista)).not.toMatch(AJENO);
    expect(JSON.stringify(vista)).not.toContain("no entraron");
    // Lo suyo sí está: lo que dice su carta, como algo que entregó y sin comillas (no hay cita textual).
    expect(vista.bloques.find((x) => x.clave === "empresa_deseada")!.frases).toContainEqual({
      texto: "Quiere que sus hijos hereden el taller", clase: "contaste", anotado: [], de_donde: "está en lo que nos entregaste",
    });

    vi.mocked(contextoPortal).mockResolvedValue({ u: DUENO, companyId: EMP } as never);
    const html = renderToStaticMarkup(await DireccionPortal());
    expect(html).toContain("Quiere que sus hijos hereden el taller");
    expect(html).not.toMatch(AJENO);
    expect(html).not.toMatch(/Aviso|no entraron/);
  });

  it("una sesión «del dueño» que respondió otra persona no es su voz; la entrada breve sí lo es de quien la respondió", async () => {
    // La entrevista «tu empresa» quedó asignada a Marta: lo que ella respondió ahí no lo dijo el dueño.
    const base = sembrar();
    base.tablas.interview_sessions[1].participant_id = "part-marta";
    for (const c of base.tablas.claims) if (c.response_id === "r1") c.participant_id = "part-marta";
    const { ficha } = await armarBorrador(EMP, cliente(base));
    expect(ficha.bloques.limites).toEqual([]);
    expect(JSON.stringify(ficha)).not.toMatch(/No boto a nadie|despedir a nadie/);

    // La entrada breve solo la responde quien es dueño de la empresa: su participante vale aunque su registro diga otro rol.
    const otra = sembrar();
    otra.tablas.participants.push({ id: "part-gerente", company_id: EMP, nombre: "Ana Rojas", rol: "lider" });
    otra.tablas.interview_sessions[2].participant_id = "part-gerente";
    const conEntrada = await armarBorrador(EMP, cliente(otra));
    expect(textos(conEntrada.ficha.bloques.resultados_deseados)).toContain("Con ocho mil al mes estoy tranquilo");
  });

  it("vozDe: la persona manda; sin persona, la fuente; ante la duda no es del dueño", () => {
    const fuente = (id: string, tipo: string, origen: string, autor?: string) => [id, { id, tipo, origen, ...(autor ? { autor } : {}) }] as const;
    const voces: Voces = {
      duenos: new Set(["part-dueno"]),
      nombresDueno: ["Carlos Rojas"],
      fuentes: new Map([
        fuente("doc", "documento", "consultor"),
        fuente("foto", "foto", "cliente"),
        fuente("tabla", "dato", "cliente"),
        fuente("visita", "observacion", "consultor"),
        fuente("visita-citando", "observacion", "consultor", "Carlos Rojas"),
        fuente("nota", "observacion", "cliente"),
        fuente("audio", "audio", "cliente"),
        fuente("suyo", "documento", "cliente", "Carlos Rojas"),
        fuente("pila", "documento", "cliente", "Carlos"),
        fuente("cargo", "documento", "cliente", "Gerente General"),
        fuente("tocayo", "documento", "cliente", "Carlos Pérez"),
        fuente("tercero", "documento", "cliente", "Estudio Contable Pérez"),
        fuente("secretaria", "documento", "cliente", "La secretaria de Carlos Rojas"),
        fuente("asistente", "documento", "cliente", "Asistente del gerente general"),
        fuente("entre-varios", "documento", "cliente", "Carlos Rojas y Marta Díaz"),
      ]),
    };
    const voz = (participant_id: string | null, source_id: string | null) => vozDe({ participant_id, source_id }, voces);
    expect(voz("part-dueno", "visita")).toBe("dueno");
    expect(voz("part-marta", "suyo")).toBe("otra_persona"); // la persona entrevistada manda sobre el papel
    for (const papel of ["doc", "foto", "tabla"]) expect(voz(null, papel), papel).toBe("empresa");
    // Lo que la consultora anotó es suyo aunque cite al dueño.
    for (const nota of ["visita", "visita-citando"]) expect(voz(null, nota), nota).toBe("consultora");
    for (const suya of ["suyo", "pila", "cargo"]) expect(voz(null, suya), suya).toBe("dueno");
    // «Carlos Pérez» no es «Carlos Rojas» por llamarse Carlos; nombrar al dueño no es ser el dueño.
    for (const ajena of ["tocayo", "tercero", "secretaria", "asistente", "entre-varios"]) expect(voz(null, ajena), ajena).toBe("otra_persona");
    for (const muda of ["nota", "audio", "no-existe"]) expect(voz(null, muda), muda).toBe("sin_identificar");
    expect(voz(null, null)).toBe("sin_identificar");

    // La función pura, sin saber de quién es nada, no deja entrar ninguna afirmación suelta; sabiéndolo, sí.
    const suelta = { id: "x", texto: "Quiere abrir otro local", pilar: "producto", temporalidad: "aspiracional", fecha_afirmacion: null, response_id: null, source_id: "doc" };
    const aCiegas = clasificarDeclaraciones({ claims: [suelta], respuestas: [], aspiracion: null });
    expect(aCiegas.fuera).toEqual([{ fuente: "claim:x", voz: "sin_identificar" }]);
    expect(BLOQUES_FICHA.every((k) => aCiegas.bloques[k].length === 0)).toBe(true);
    const conVoces = clasificarDeclaraciones({ claims: [suelta], respuestas: [], aspiracion: null, voces });
    expect(conVoces.fuera).toEqual([]);
    expect(conVoces.bloques.empresa_deseada).toMatchObject([{ texto: "Quiere abrir otro local", medio: "material", fuentes: ["claim:x"] }]);
    // Lo que el dueño dijo en otra conversación entra como algo que dijo, no como un papel.
    const dicha = clasificarDeclaraciones({ claims: [{ ...suelta, participant_id: "part-dueno" }], respuestas: [], aspiracion: null, voces });
    expect(dicha.bloques.empresa_deseada).toMatchObject([{ medio: "conversacion" }]);
  });

  it("consultora: el aviso se ve como aviso, con sus fuentes, y lo que salió de un papel no dice «Dijo el dueño»", async () => {
    const base = conVocesAjenas();
    await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    vi.mocked(usuarioActual).mockResolvedValue(CONSULTORA);
    const html = renderToStaticMarkup(await DireccionPag({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({}) }));
    expect(html).toContain(">Aviso<");
    expect(html).toContain("5 afirmaciones sobre el futuro no entraron como palabras del dueño");
    expect(html).toContain("Observación «Visita al taller»");
    expect(html).not.toMatch(AJENO);
    expect(ETIQUETA_DOCUMENTO).toBe("Dice un documento de la empresa");
    expect(html).toMatch(/>Dice un documento de la empresa<\/span><\/div><p class="t-cuerpo mt-1 medida">Quiere atender flotas de empresas</);
    expect(html).toMatch(/>Dijo el dueño<\/span><\/div><p class="t-cuerpo mt-1 medida">No está dispuesto a despedir a nadie para crecer</);
  });
});

describe("el asistente no pone medidas en ninguna parte de la ficha", () => {
  const conMedida = () =>
    salidaDirector({
      interpretaciones: [
        { bloque: "rol_futuro", texto: "La empresa depende en un 80 % del dueño.", claim_ids: ["claim:c3"] },
        { bloque: "empresa_deseada", texto: "El índice de dependencia es alto: todo pasa por él.", claim_ids: ["claim:c2"] },
        { bloque: "limites", texto: "Crecer sin despidos es una condición, no una preferencia.", claim_ids: ["claim:c1"] },
      ],
    });

  it("una interpretación de BLOQUE con un porcentaje o un índice se descarta diciendo por qué, igual que en las dimensiones", async () => {
    const { ficha, evidencia } = await armarBorrador(EMP, cliente(sembrar()));
    const r = incorporarInterpretaciones(ficha, conMedida(), evidencia.fuentes_validas);
    expect(r.incorporadas).toBe(1);
    expect(r.descartes).toEqual([
      { donde: "Rol futuro del propietario", texto: "La empresa depende en un 80 % del dueño.", motivo: MOTIVO_MIDE_EN_BLOQUE },
      { donde: "Empresa deseada", texto: "El índice de dependencia es alto: todo pasa por él.", motivo: MOTIVO_MIDE_EN_BLOQUE },
    ]);
    expect(MOTIVO_MIDE_EN_BLOQUE).toMatch(/se describe, no se puntúa/);
    expect(textos(todos(r.ficha).filter((i) => i.origen === "director"))).toEqual(["Crecer sin despidos es una condición, no una preferencia."]);
    expect(JSON.stringify(r.ficha)).not.toMatch(/80 ?%|[íi]ndice de dependencia/i);
  });

  it("y el trabajo lo cumple de punta a punta: lo que el manejador afirma en su comentario es lo que pasa", async () => {
    const base = sembrar();
    usarProveedor(proveedorFalso(conMedida).proveedor);
    const r = await handleFichaDireccion(trabajo());
    expect(r).toMatchObject({ interpretaciones: 1, descartadas: 2 });
    expect(JSON.stringify(base.tablas.ficha_direccion[0])).not.toMatch(/80 ?%|[íi]ndice de dependencia/i);
    expect(PROMPT_DIRECTOR).toMatch(/tambien para las interpretaciones de bloque/);
  });
});

describe("nadie pisa a nadie: la revisión del borrador", () => {
  it("guardar con una revisión vieja no pisa; aplicar el cambio sobre lo que hay conserva las dos ediciones", async () => {
    const base = sembrar();
    const sb = cliente(base);
    const { id } = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    const fila = () => base.tablas.ficha_direccion[0];
    expect(fila().dependencia.revision).toBe(1);
    const leida = (await borradorVigente(EMP, sb))!;
    expect(leida.revision).toBe(1);
    // La revisión es de la fila: quien lee la ficha no la ve mezclada con la descripción de la dependencia.
    expect(leida.dependencia).not.toHaveProperty("revision");

    // Dos consultoras leyeron la misma revisión. La primera guarda…
    const deUna = agregarItem(leida, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: CONSULTORA.id });
    expect(await guardarFicha(id, deUna, sb, { revision: leida.revision })).toBe(2);
    // …y la segunda, con su copia vieja, NO pisa lo de la primera: se le dice.
    const deOtra = agregarItem(leida, "fortalezas", { texto: "Los clientes vuelven", tipo: "interpretacion", actorId: SIN_AUTORIDAD.id });
    const pisar = guardarFicha(id, deOtra, sb, { revision: leida.revision });
    await expect(pisar).rejects.toBeInstanceOf(BorradorCambio);
    await expect(pisar).rejects.toMatchObject({ causa: "revision", message: expect.stringMatching(/No se guardó nada encima/) });
    expect(textos(fila().bloques.fortalezas)).toEqual(["Cumple los plazos que promete"]);
    expect(fila().dependencia.revision).toBe(2);

    // Aplicando su cambio sobre lo que hay guardado, quedan las dos.
    const r = await actualizarBorrador(EMP, id, sb, (actual) => agregarItem(actual, "fortalezas", { texto: "Los clientes vuelven", tipo: "interpretacion", actorId: SIN_AUTORIDAD.id }));
    expect(r.revision).toBe(3);
    expect(textos(fila().bloques.fortalezas)).toEqual(["Cumple los plazos que promete", "Los clientes vuelven"]);
  });

  it("si otro guardado se cuela entre leer y guardar, se vuelve a leer y el cambio cae encima; una regla rota no se reintenta", async () => {
    const base = sembrar();
    const sb = cliente(base);
    const { id } = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    const fila = () => base.tablas.ficha_direccion[0];
    let veces = 0;
    await actualizarBorrador(EMP, id, sb, (actual) => {
      veces++;
      if (veces === 1) {
        // Entre que se leyó y que se va a guardar, otra sesión guarda una frase: la fila sube de revisión.
        const deOtraSesion = agregarItem(actual, "proposito", { texto: "Que el cliente se vaya tranquilo", tipo: "declaracion", actorId: SIN_AUTORIDAD.id });
        fila().bloques = JSON.parse(JSON.stringify(deOtraSesion.bloques));
        fila().dependencia.revision += 1;
      }
      return agregarItem(actual, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: CONSULTORA.id });
    });
    expect(veces).toBe(2);
    expect(textos(fila().bloques.proposito)).toEqual(["Que el cliente se vaya tranquilo"]);
    expect(textos(fila().bloques.fortalezas)).toEqual(["Cumple los plazos que promete"]);

    // Lo que la regla de la ficha no deja pasar no es un choque de revisiones: se dice a la primera.
    let intentos = 0;
    const repetida = actualizarBorrador(EMP, id, sb, (actual) => {
      intentos++;
      return agregarItem(actual, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: CONSULTORA.id });
    });
    await expect(repetida).rejects.toBeInstanceOf(ReglaDeFicha);
    expect(intentos).toBe(1);
    // Sobre un borrador que no es el vigente no se escribe.
    await expect(actualizarBorrador(EMP, "otro-borrador", sb, (actual) => actual)).rejects.toMatchObject({ name: "BorradorCambio", causa: "reemplazado" });
    // Una fila creada a mano, sin revisión, vale cero y sube desde ahí.
    base.tablas.ficha_direccion.push({ id: "a-mano", company_id: OTRA, version: 1, estado: "borrador", bloques: {}, dependencia: {} });
    expect(await guardarFicha("a-mano", fichaVacia(), sb)).toBe(1);
    expect(await guardarFicha("a-mano", fichaVacia(), sb)).toBe(2);
  });

  it("LA EDICIÓN PERDIDA, reproducida y cerrada: lo que la consultora corrige mientras el asistente lee sigue ahí cuando él termina", async () => {
    const base = sembrar();
    const previo = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    const limite = previo.ficha.bloques.limites[0];
    const delPlan = previo.ficha.bloques.clientes_reputacion[0];
    entra(CONSULTORA);

    const estados: number[] = [];
    const { proveedor, recibidos } = proveedorFalso(() => salidaDirector());
    const completar = proveedor.complete.bind(proveedor);
    proveedor.complete = (async (p: CompleteParams<unknown>) => {
      // El modelo tarda. Mientras tanto ella corrige una frase, añade otra y quita una tercera, por la ruta real.
      estados.push((await editarFicha(post({ accion: "editar", ficha_id: previo.id, bloque: "limites", item_id: limite.id, texto: "No despide a nadie para crecer", tipo: "declaracion" }), ctx())).status);
      estados.push((await editarFicha(post({ accion: "agregar", ficha_id: previo.id, bloque: "fortalezas", texto: "Cumple los plazos que promete", tipo: "interpretacion" }), ctx())).status);
      estados.push((await editarFicha(post({ accion: "quitar", ficha_id: previo.id, bloque: "clientes_reputacion", item_id: delPlan.id }), ctx())).status);
      return completar(p);
    }) as typeof proveedor.complete;
    usarProveedor(proveedor);

    const r = await handleFichaDireccion(trabajo());
    expect(estados).toEqual([200, 200, 200]);
    expect(recibidos).toHaveLength(1);
    expect(r).toMatchObject({ ficha_id: previo.id, interpretaciones: 1, descartadas: 0 });
    expect(base.tablas.ficha_direccion).toHaveLength(1);
    const fila = base.tablas.ficha_direccion[0];
    // Lo de ella sigue ahí: la corrección, la frase nueva y lo que quitó…
    expect(fila.bloques.limites.find((i: Item) => i.id === limite.id)).toMatchObject({ texto: "No despide a nadie para crecer", original: limite.texto, revisado_por: CONSULTORA.id });
    expect(textos(fila.bloques.fortalezas)).toContain("Cumple los plazos que promete");
    expect(fila.bloques.clientes_reputacion.find((i: Item) => i.id === delPlan.id)).toMatchObject({ descartado: true, revisado_por: CONSULTORA.id });
    // …y lo del asistente también, como propuesta sin revisar.
    expect(fila.bloques.limites.find((i: Item) => i.origen === "director")).toMatchObject({ tipo: "interpretacion", fuentes: ["claim:c1"] });
    expect(fila.dependencia.dimensiones.comercial).toMatchObject({ origen: "director", evidencia: ["claim:c3"] });
    expect(fila.dependencia.interpretaciones.pendiente).toBe(false);
  });

  it("si el borrador se acuerda mientras el asistente lee, sus propuestas no se escriben en ninguna versión y el resultado lo dice", async () => {
    const base = sembrar();
    const previo = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    const { proveedor } = proveedorFalso(() => salidaDirector());
    const completar = proveedor.complete.bind(proveedor);
    proveedor.complete = (async (p: CompleteParams<unknown>) => {
      await acordar(previo.id, CONSULTORA, cliente(base));
      return completar(p);
    }) as typeof proveedor.complete;
    usarProveedor(proveedor);

    const r = await handleFichaDireccion(trabajo());
    expect(r).toMatchObject({ ficha_id: previo.id, interpretaciones: 0, descartadas: 0, motivo: MOTIVO_BORRADOR_REEMPLAZADO });
    expect(MOTIVO_BORRADOR_REEMPLAZADO).toMatch(/sus propuestas no se guardaron/);
    expect(base.tablas.ficha_direccion.map((f) => f.estado)).toEqual(["reemplazada", "acordada"]);
    expect(JSON.stringify(base.tablas.ficha_direccion)).not.toContain('"director"');
    // La llamada ocurrió y quedó registrada: el costo no se esconde.
    expect(base.tablas.token_usage).toMatchObject([{ agente: "director", job_id: "job-1" }]);
  });

  it("sin crédito y con la consultora editando: la pausa se anota sobre el borrador de ese momento, sin borrar su corrección", async () => {
    const base = sembrar();
    const previo = await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    entra(CONSULTORA);
    const { proveedor } = proveedorFalso(() => salidaDirector());
    proveedor.complete = (async () => {
      await editarFicha(post({ accion: "agregar", ficha_id: previo.id, bloque: "fortalezas", texto: "Cumple los plazos que promete", tipo: "interpretacion" }), ctx());
      throw new AIProviderPausedError("402");
    }) as typeof proveedor.complete;
    usarProveedor(proveedor);

    await expect(handleFichaDireccion(trabajo())).rejects.toBeInstanceOf(AIProviderPausedError);
    const fila = base.tablas.ficha_direccion[0];
    expect(textos(fila.bloques.fortalezas)).toContain("Cumple los plazos que promete");
    expect(fila.dependencia.interpretaciones).toMatchObject({ pendiente: true, motivo: TEXTO_ASISTENTE_EN_PAUSA });
  });

  it("sin crédito, si además no se puede anotar la pausa, el worker recibe igual la PAUSA: un fallo al anotar no la tapa", async () => {
    const base = sembrar();
    await prepararBorrador(EMP, cliente(base), { creadaPor: CONSULTORA.id });
    const { proveedor } = proveedorFalso(() => salidaDirector());
    proveedor.complete = (async () => {
      // La base deja de aceptar escrituras en la ficha justo cuando el proveedor responde que no hay crédito.
      const original = base.from.bind(base);
      base.from = ((tabla: string) => {
        const q = original(tabla);
        if (tabla === "ficha_direccion") q.update = (() => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: "la base no acepta escrituras" } }) }) }) }) })) as never;
        return q;
      }) as typeof base.from;
      throw new AIProviderPausedError("402");
    }) as typeof proveedor.complete;
    usarProveedor(proveedor);
    const anotado = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(handleFichaDireccion(trabajo())).rejects.toBeInstanceOf(AIProviderPausedError);
      expect(anotado.mock.calls.map((c) => String(c[0])).join(" | ")).toMatch(/no se pudo anotar la pausa en la ficha: No se pudo guardar la ficha: la base no acepta escrituras/);
    } finally {
      anotado.mockRestore();
    }
  });

  it("la ruta: si el borrador no deja de cambiar responde 409 y no guarda nada encima", async () => {
    const base = sembrar();
    entra(CONSULTORA);
    const { id } = (await (await editarFicha(post({ accion: "preparar" }), ctx())).json()) as { id: string };
    // Otra sesión guarda justo antes de cada intento: la fila sube de revisión cada vez que alguien va a escribir.
    const original = base.from.bind(base);
    base.from = ((tabla: string) => {
      const q = original(tabla);
      if (tabla === "ficha_direccion") {
        const actualizar = q.update.bind(q);
        q.update = ((p: Fila) => {
          base.tablas.ficha_direccion[0].dependencia.revision += 1;
          return actualizar(p);
        }) as typeof q.update;
      }
      return q;
    }) as typeof base.from;
    const r = await editarFicha(post({ accion: "agregar", ficha_id: id, bloque: "limites", texto: "Una frase cualquiera", tipo: "interpretacion" }), ctx());
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/cambió justo cuando se iba a guardar/);
    expect(textos(base.tablas.ficha_direccion[0].bloques.limites)).not.toContain("Una frase cualquiera");
  });
});

describe("la moneda es la de la empresa, no siempre soles", () => {
  it("una empresa en pesos colombianos lee sus cifras en pesos, con los separadores de Colombia, de punta a punta", async () => {
    const base = sembrar();
    const sb = cliente(base);
    Object.assign(base.tablas.companies[0], { pais: "CO", moneda: "COP", ficha: { meta_venta_mensual: "60000000", personas: "6" } });
    base.tablas.company_metricas[0].valor = 40000000; // m1: ventas de setiembre
    const b = await armarBorrador(EMP, sb);
    expect(b.empresa).toMatchObject({ moneda: "COP", formato: { pais: "CO", moneda: "COP" } });
    expect(b.evidencia.metricas.find((n) => n.fuente === "metrica:m1")!.cifra).toEqual({ clave: "venta_mes", valor: 40000000, periodo: "mes", moneda: "COP" });
    expect(textos(b.ficha.bloques.resultados_deseados)).toContain("Hoy: Ventas del mes $ 40.000.000 (Setiembre 2026)");
    expect(textos(b.ficha.bloques.distancia)).toContain("Ventas del mes: hoy $ 40.000.000 (Setiembre 2026) · meta $ 60.000.000 · falta subir $ 20.000.000");
    // Ni un sol en toda la ficha: antes, todo lo que no era dólar se escribía «S/».
    expect(JSON.stringify(b.ficha)).not.toContain("S/");

    const r = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    await acordar(r.id, CONSULTORA, sb);
    const vista = JSON.stringify(vistaCliente((await acordadaVigente(EMP, sb))!));
    expect(vista).toContain("Meta: Ventas del mes $ 60.000.000");
    expect(vista).not.toContain("S/");
  });

  it("un número anotado a mano va en la moneda de la empresa: la ruta lee su configuración", async () => {
    const base = sembrar();
    Object.assign(base.tablas.companies[0], { pais: "MX", moneda: "MXN" });
    entra(CONSULTORA);
    const { id } = (await (await editarFicha(post({ accion: "preparar" }), ctx())).json()) as { id: string };
    expect((await editarFicha(post({ accion: "anotar_numero", ficha_id: id, clave: "ganancia_mes", momento: "deseado", valor: 8000 }), ctx())).status).toBe(200);
    const MX: ConfigEmpresa = { pais: "MX", moneda: "MXN", idioma: "es", zona_horaria: "America/Lima" };
    expect(escribirMoneda(8000, MX)).toBe("$8,000");
    const fila = base.tablas.ficha_direccion[0];
    expect(fila.bloques.resultados_deseados.find((i: Item) => i.cifra?.clave === "ganancia_mes")).toMatchObject({
      texto: "Meta: Lo que queda libre al mes $8,000",
      texto_cliente: "Meta: Lo que te queda libre al mes $8,000",
      cifra: { clave: "ganancia_mes", valor: 8000, periodo: "mes", moneda: "MXN" },
    });
    expect(textos(fila.bloques.distancia)).toContain("Lo que queda libre al mes: hoy $4,200 (Setiembre 2026) · meta $8,000 · falta subir $3,800");
  });

  it("lo que no es un código válido no tumba la ficha ni se disfraza de soles", async () => {
    expect(formatoDeEmpresa(null)).toEqual({ pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" });
    expect(formatoDeEmpresa({ pais: "co", moneda: "cop", zona_horaria: "America/Bogota" })).toMatchObject({ pais: "CO", moneda: "COP", zona_horaria: "America/Bogota" });
    expect(formatoDeEmpresa({ pais: "Perú", moneda: "SOLES", zona_horaria: "Lima" })).toMatchObject({ pais: "PE", moneda: "SOLES", zona_horaria: "America/Lima" });
    const base = sembrar();
    Object.assign(base.tablas.companies[0], { pais: "Perú", moneda: "SOLES" });
    const { ficha } = await armarBorrador(EMP, cliente(base));
    // Se escribe el código tal cual está guardado: se ve que algo anda mal en la configuración, y no se inventa un símbolo.
    expect(textos(ficha.bloques.resultados_deseados)).toContain("Hoy: Ventas del mes SOLES 40,000 (Setiembre 2026)");
    expect(JSON.stringify(ficha)).not.toContain("S/");
  });
});

describe("al dueño se le habla de tú, también en los números", () => {
  it("la consultora lee «del dueño»; él lee «tus horas», «tu equipo», «lo que te queda»", async () => {
    const base = sembrar();
    const sb = cliente(base);
    const r = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    let ficha = anotarCifra(r.ficha, { clave: "horas_semana", momento: "hoy", valor: 70, actorId: CONSULTORA.id });
    ficha = anotarCifra(ficha, { clave: "horas_semana", momento: "deseado", valor: 45, actorId: CONSULTORA.id });
    ficha = anotarCifra(ficha, { clave: "ganancia_mes", momento: "deseado", valor: 8000, actorId: CONSULTORA.id });
    await guardarFicha(r.id, ficha, sb);
    await prepararBorrador(EMP, sb); // la distancia se recalcula con lo anotado

    const borrador = (await borradorVigente(EMP, sb))!;
    expect(textos(borrador.bloques.tiempo)).toEqual(["Hoy: Horas de trabajo del dueño a la semana 70", "Meta: Horas de trabajo del dueño a la semana 45"]);
    expect(textos(borrador.bloques.distancia)).toContain("Horas de trabajo del dueño a la semana: hoy 70 · meta 45 · falta bajar 25");

    await acordar(r.id, CONSULTORA, sb);
    const vista = vistaCliente((await acordadaVigente(EMP, sb))!);
    const frases = (clave: string) => vista.bloques.find((x) => x.clave === clave)!.frases.map((f) => f.texto);
    expect(frases("tiempo")).toEqual(["Meta: Tus horas de trabajo a la semana 45"]);
    expect(frases("resultados_deseados")).toContain("Meta: Lo que te queda libre al mes S/ 8,000");
    expect(frases("distancia")).toEqual(
      expect.arrayContaining([
        "Tus horas de trabajo a la semana: hoy 70 · meta 45 · falta bajar 25",
        "Lo que te queda libre al mes: hoy S/ 4,200 (Setiembre 2026) · meta S/ 8,000 · falta subir S/ 3,800",
        "Personas en tu equipo: hoy 6 · meta sin dato",
      ])
    );
    const numeros = vista.bloques.flatMap((x) => x.frases).filter((f) => f.clase === "numero").map((f) => f.texto).join(" | ");
    expect(numeros).not.toMatch(/del dueño|en el equipo/);
  });

  it("el motivo de lo que no se puede comparar se le dice en llano, sin códigos ni nombres de campo", () => {
    const venta = (valor: number, moneda: string, periodo_dato = "actual"): Numero => ({
      cifra: { clave: "venta_mes", valor, periodo: "mes", moneda }, etiqueta: "Ventas del mes", fuente: `prueba:${periodo_dato}`, periodo_dato, estado: "contado",
    });
    const d = distancia({ hoy: [venta(40000, "PEN")], deseado: [venta(20000, "USD", "deseado")] });
    // A la consultora, el motivo de la regla de finanzas, tal cual.
    expect(d.numeros[0].texto).toBe("Ventas del mes: hoy S/ 40,000 · meta USD 20,000 · no se pueden comparar: monedas distintas (PEN y USD)");
    // Al dueño, lo mismo en palabras: las monedas ya se ven en las propias cifras.
    expect(d.numeros[0].texto_cliente).toBe("Ventas del mes: hoy S/ 40,000 · meta USD 20,000 · no se pueden comparar: están en monedas distintas");
    expect(d.numeros[0].texto_cliente).not.toMatch(/PEN|periodo|clave/);
    // Y eso es lo que viaja a su pantalla.
    const [comparacion] = itemsDeDistancia(d);
    expect(comparacion.texto_cliente).toBe(d.numeros[0].texto_cliente);
    const acordada = { ...fichaVacia(), id: "x", company_id: EMP, version: 2, revision: 1, estado: "acordada" as const, creada_por: null, acordada_por: null, acordada_at: null, reemplaza_a: null, created_at: null };
    acordada.bloques.distancia = [comparacion];
    expect(vistaCliente(acordada).bloques[0].frases).toEqual([{ texto: d.numeros[0].texto_cliente, clase: "numero", anotado: [], de_donde: null }]);
  });
});

describe("la constancia del dueño se lee en palabras, no como datos en crudo", () => {
  /** Una versión acordada y confirmada por el dueño por la ruta real. Confirmó de noche: en UTC ya era 14, en Lima seguía siendo 13. */
  async function confirmada() {
    const base = sembrar();
    const sb = cliente(base);
    const r = await prepararBorrador(EMP, sb, { creadaPor: CONSULTORA.id });
    const v2 = await acordar(r.id, CONSULTORA, sb, new Date("2026-10-13T17:00:00Z"));
    entra(DUENO);
    const res = await confirmar(post({ ficha_id: v2.id, version: 2 }, "/confirmar"), ctx());
    const { ruta } = (await res.json()) as { ruta: string };
    const acta = base.tablas.actas_aceptacion[0];
    acta.aceptado_at = "2026-10-14T03:30:00.000Z";
    vi.mocked(contextoPortal).mockResolvedValue({ u: DUENO, companyId: EMP } as never);
    return { base, acta, ruta };
  }
  const constancia = async (acta?: string) => renderToStaticMarkup(await ConstanciaDireccion({ searchParams: Promise.resolve(acta ? { acta } : {}) }));

  it("muestra lo que confirmó como lo leyó, con su versión, su día y su hora; el documento completo queda a un clic", async () => {
    const { acta, ruta } = await confirmada();
    expect(ruta).toBe(`/portal/direccion/constancia?acta=${acta.id}`);
    expect(ruta).toBe(rutaConstancia(acta.id));
    const html = await constancia(acta.id);
    expect(html).toContain("Tu constancia");
    expect(html).toContain("Versión 2 · confirmada el 13 de octubre de 2026 a las 22:30 por Carlos Rojas");
    for (const esperado of ["Lo que no se negocia", "Lo dijiste tú", "«No boto a nadie»", "Lo anotamos así: No está dispuesto a despedir a nadie para crecer", "Qué tan lejos estás", "Lo que hoy pasa por ti"]) {
      expect(html, esperado).toContain(esperado);
    }
    // Antes veía esto mismo como datos en crudo: las claves del contenido guardado y llaves de JSON.
    expect(html).not.toMatch(/de_donde|anotado|&quot;clase&quot;|\{&quot;|acordada_at/);
    expect(html).not.toMatch(/pilar|claim|matriz|hallazgo|interpretaci|asistente|Dijo el dueño|nota de trabajo/i);
    expect(html).toContain(`href="/acta/${acta.id}"`);
    expect(html).toContain("Abrir el documento completo para imprimir");
    expect(html).toContain('href="/portal/direccion"');
    // Sin pedir un acta concreta abre la más reciente.
    expect(await constancia()).toContain("«No boto a nadie»");
    // Lo guardado se lee de vuelta con la forma exacta de lo que se le mostró.
    expect(leerVistaCliente(acta.contenido)).toEqual(acta.contenido);
  });

  it("no abre la constancia de otra empresa ni la de la consultora; dice cuando no hay ninguna; y no se cae si algo falla", async () => {
    const { base, acta } = await confirmada();
    const deOtraEmpresa = "55555555-5555-4555-8555-555555555555";
    const deLaConsultora = "66666666-6666-4666-8666-666666666666";
    base.tablas.actas_aceptacion.push({ ...acta, id: deOtraEmpresa, company_id: OTRA }, { ...acta, id: deLaConsultora, aceptado_rol: "consultor" });
    for (const ajena of [deOtraEmpresa, deLaConsultora]) {
      const html = await constancia(ajena);
      expect(html, ajena).toContain("No encontramos esa constancia en tu empresa.");
      expect(html, ajena).not.toContain("No boto a nadie");
    }

    // Un contenido que no tiene la forma de la ficha no rompe la página: lo dice y deja el documento completo.
    expect(leerVistaCliente({ valores: { venta_mes: 40000 } })).toBeNull();
    acta.contenido = { valores: { venta_mes: 40000 } };
    const rara = await constancia(acta.id);
    expect(rara).toContain("No pudimos mostrar aquí lo que confirmaste.");
    expect(rara).toContain(`href="/acta/${acta.id}"`);

    base.tablas.actas_aceptacion.length = 0;
    expect(await constancia()).toContain("Todavía no has confirmado ninguna versión.");

    base.from = (() => {
      throw new Error("la base no responde");
    }) as never;
    expect(await constancia()).toContain("No pudimos abrir tu constancia ahora.");
    expect(vi.mocked(registrarError).mock.calls.at(-1)![0]).toMatchObject({ ruta: "/portal/direccion/constancia", mensaje: "la base no responde", companyId: EMP });
  });
});

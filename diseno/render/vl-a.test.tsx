/**
 * ARNÉS DE DISEÑO · VISTAS LIMPIAS, DUEÑO A (16-10-2026): la columna de cinco vistas y el Expediente, «En esta vista», la
 * cabecera con «Administrar», y las vistas que solo reúnen pantallas existentes (Avance, Expediente, Estructura). Pinta
 * las pantallas tal como las arman la app y sus marcos, con la base en memoria de tests/fixtures/base-falsa.ts y una
 * empresa FICTICIA. No toca producción ni ninguna base. Deja el HTML en diseno/render/salida/ (ignorada por git) para
 * mirarlo con Chrome sin cabeza y el CSS compilado de las fuentes de hoy (salida/app-nuevo.css).
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/vl-a.test.tsx
 *
 * Mocks, armarBase, variantes y consultora() copiados de diseno/render/entrar-hoy.test.tsx (vi.mock no se comparte entre
 * archivos); a la empresa se le agregan solo las filas que estos casos necesitan.
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { prerenderToNodeStream } from "react-dom/static";
import Link from "next/link";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";
import { periodosRecientes } from "@/lib/kpis";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown, ruta: "/portal" }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  perfilApi: vi.fn(),
  puedeAcceder: vi.fn(async () => true),
  requerirConsultor: async () => ({ id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@ejemplo.pe", nombre: "Consultora de Ejemplo", rol: "consultor" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => estado.ruta,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode; prefetch?: unknown }) => {
    const atributos: Record<string, unknown> = { ...resto };
    delete atributos.prefetch;
    return (
      <a href={href} {...atributos}>
        {children}
      </a>
    );
  },
}));

// ─────────────────────────── La empresa ficticia ───────────────────────────
const EMP = "0000000a-0000-4000-8000-00000000000a";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Rosa Ejemplo" };
const HOY = new Date();
const dia = (d: number) => new Date(HOY.getTime() - d * 86_400_000).toISOString();
const fecha = (d: number) => dia(d).slice(0, 10);

const METRICAS: Fila[] = [
  { company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: "2026-08", valor: 39900, estado: "verificado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 8000, estado: "contado" },
  { company_id: EMP, clave: "caja_hoy", periodo: "2026-10", valor: 3200, estado: "contado" },
];

const PROCESOS: Fila[] = [
  { id: "p1", company_id: EMP, nombre: "Cómo se atiende un pedido por WhatsApp", area: "Ventas", version: "as_is", origen: "conversado", responsable: "Vendedora de tienda", tiempo: "15 minutos", inicio: "Llega el mensaje", resultado: "Pedido anotado", padre_id: null, created_at: dia(20), process_nodes: [{ count: 6 }], sops: [{ count: 1 }] },
  { id: "p2", company_id: EMP, nombre: "Corte y costura de un lote", area: "Producción", version: "as_is", origen: "conversado", responsable: "Jefa de taller", padre_id: null, created_at: dia(12), process_nodes: [{ count: 4 }], sops: [{ count: 0 }] },
  { id: "p3", company_id: EMP, nombre: "Control de calidad antes de entregar", area: "Producción", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(2) },
  { id: "p4", company_id: EMP, nombre: "Compra de tela al proveedor", area: "Compras", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(2) },
];

const FUENTES: Fila[] = [
  { id: "f1", company_id: EMP, nombre: "foto-cuaderno-corte.jpg", tipo: "imagen", estado: "leido", revision: null, origen: "subida", created_at: dia(3), process_id: null },
  { id: "f2", company_id: EMP, nombre: "checklist calidad v2 FINAL (1).docx", tipo: "documento", estado: "leido", revision: "pendiente", origen: "subida", created_at: dia(2), process_id: null },
  { id: "f3", company_id: EMP, nombre: "compras.pdf", tipo: "documento", estado: "leyendo", revision: null, origen: "subida", created_at: dia(1), process_id: null },
  { id: "f4", company_id: EMP, nombre: "audio-reunion-lunes.m4a", tipo: "audio", estado: "error", error: "El audio está vacío", revision: null, origen: "subida", created_at: dia(1), process_id: null },
];

/** Cinco valores de la venta mensual en los últimos ocho meses cerrados, con un mes sin anotar en medio. */
function valoresIndicador(): Fila[] {
  const meses = periodosRecientes("mensual", 8, HOY, "America/Lima"); // del más reciente al más antiguo
  const con = [meses[0]!, meses[1]!, meses[3]!, meses[4]!, meses[5]!];
  const valores = [41800, 39900, 44100, 38200, 36500];
  return con.map((p, i) => ({ indicador_id: "k1", periodo: p, valor: valores[i], estado_validacion: i === 1 ? "verificado" : "declarado", created_at: dia(i * 30) }));
}

function armarBase(extra: Record<string, Fila[]> = {}) {
  const b = crearBaseFalsa({
    companies: [
      {
        id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", etapa: "diagnostico", estado_admision: "admitida",
        pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: ["fabrica_y_vende"], tipo_trabajo: "estructurar_y_sistematizar",
        ruta_inicio: fecha(7), hora_cierre: "19:00", modelo_operativo: ["produccion"], ficha: { personas: "6", ciudad: "Arequipa", meta_venta_mensual: "55000", whatsapp: "999888777" },
        admision: null, tope_tokens: 2_000_000, created_at: dia(40),
      },
    ],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
    participants: [
      { id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", token_expira_at: null, token_revocado_at: null, token_canjeado_at: dia(30), created_at: dia(30), user_id: DUENA.id },
      { id: "pa2", company_id: EMP, nombre: "Lucía Ejemplo", puesto: "Jefa de taller", rol: "lider", token_expira_at: dia(-5), token_revocado_at: null, token_canjeado_at: null, created_at: dia(10) },
    ],
    interview_sessions: [
      { id: "se1", company_id: EMP, tipo: "empresa_dueno", estado: "en_curso", participant_id: "pa1", bloques_cubiertos: [] },
      { id: "se2", company_id: EMP, tipo: "lider", estado: "pendiente", participant_id: "pa2", bloques_cubiertos: [] },
    ],
    interview_responses: [
      { session_id: "se1", bloque: null, pregunta: "¿Cuántas personas trabajan contigo hoy?", respuesta: "Seis, contándome" },
      { session_id: "se1", bloque: null, pregunta: "¿Quién cierra la caja el sábado cuando tú no estás?", respuesta: null },
    ],
    claims: [
      { company_id: EMP, pilar: "procesos", estado: "confirmado" },
      { company_id: EMP, pilar: "procesos", estado: "confirmado" },
      { company_id: EMP, pilar: "producto", estado: "confirmado" },
    ],
    company_metricas: METRICAS,
    processes: PROCESOS,
    sources: FUENTES,
    company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 2, sin_verificar: 15, hallazgos_por_revisar: 3, fuentes: 9 }],
    indicadores: [
      { id: "k0", company_id: EMP, clave: "pedidos_atendidos", nombre: "Pedidos atendidos a tiempo", como_se_mide: "", mejor_si: "sube", origen: "manual", estado: "activo", unidad: "numero", frecuencia: "semanal", tipo_indicador: "ejecucion", definicion: "Pedidos entregados el día prometido", created_at: dia(20) },
      { id: "k1", company_id: EMP, clave: "venta_mes", nombre: "Venta del mes", como_se_mide: "", mejor_si: "sube", origen: "manual", estado: "activo", unidad: "soles", frecuencia: "mensual", tipo_indicador: "resultado", definicion: "Lo que se vendió en el mes", fuente: "Cuaderno de caja", responsable_participant_id: "pa1", linea_base_valor: 38200, linea_base_periodo: "2026-06", meta_valor: 55000, meta_plazo: "2027-03", valor_actual: 41800, valor_actual_periodo: "2026-09", valor_actual_at: dia(10), estado_validacion: "declarado", umbral_alerta: 35000, umbral_sentido: "por_debajo", decision_asociada: "Revisar precios", created_at: dia(25) },
      { id: "k2", company_id: EMP, clave: "devoluciones", nombre: "Prendas devueltas", como_se_mide: "", mejor_si: "baja", origen: "manual", estado: "activo", unidad: "unidades", frecuencia: "mensual", tipo_indicador: null, created_at: dia(5) },
    ],
    indicador_valores: valoresIndicador(),
    actions: [
      { id: "a1", company_id: EMP, accion: "Anotar cada venta del sábado en el cuaderno", estado: "verificado", verificado_at: dia(3), vence_at: fecha(1), indicador_id: null, updated_at: dia(3) },
      { id: "a2", company_id: EMP, accion: "Subir el precio del jean clásico", estado: "verificado", verificado_at: dia(1), vence_at: fecha(4), indicador_id: "k1", updated_at: dia(1) },
      { id: "a3", company_id: EMP, accion: "Contar la tela antes de cada corte", estado: "en_ejecucion", verificado_at: null, vence_at: fecha(-10), indicador_id: null, updated_at: dia(2) },
      { id: "a4", company_id: EMP, accion: "Nombrar quién cierra la caja el sábado", estado: "aprobado", verificado_at: null, vence_at: fecha(-14), indicador_id: null, updated_at: dia(2) },
      { id: "a5", company_id: EMP, accion: "Probar la venta por catálogo", estado: "propuesto", verificado_at: null, vence_at: null, indicador_id: null, updated_at: dia(1) },
    ],
    deliverables: [
      { id: "d1", company_id: EMP, tipo: "informe_realidad", version: 1, publicado: true, publicado_at: dia(2), created_at: dia(3) },
      { id: "d2", company_id: EMP, tipo: "diagnostico_4p", version: 1, publicado: true, publicado_at: dia(2), created_at: dia(3) },
      { id: "d3", company_id: EMP, tipo: "mapa_as_is", version: 1, publicado: false, publicado_at: null, created_at: dia(3) },
    ],
    revisiones_semanales: [],
    ruta_marcas: [{ company_id: EMP, clave: "diagnostico.compromiso", valor: "cumple", nota: "Lo dijo en la reunión del lunes", marcado_at: dia(3) }],
    iniciativas: [],
    ...extra,
  });
  // Lo que la base falsa no trae y estas pantallas usan: .or/.not (filtros que aquí no filtran) y rpc.
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown>;
    q.or = () => q;
    q.not = () => q;
    return q;
  };
  estado.base = { from, rpc: async () => ({ data: 184_000, error: null }) };
  return b;
}

// ─────────────────────────── El HTML ───────────────────────────
const SALIDA = path.resolve(__dirname, "salida");

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<style>:root{--font-manrope:"Manrope";--font-public-sans:"Public Sans";--font-source-serif:"Source Serif 4";}</style>
</head><body>${cuerpo}</body></html>`;
}

/** Los tres estados de la barra lateral: abierta (como entra), riel (escritorio, oculta) y cajón (celular, abierto). */
function variantes(nombre: string, titulo: string, html: string) {
  writeFileSync(path.join(SALIDA, `${nombre}.html`), pagina(titulo, html));
  writeFileSync(path.join(SALIDA, `${nombre}--riel.html`), pagina(titulo, html.replace('data-estado="abierta"', 'data-estado="riel"').replace('aria-pressed="false"', 'aria-pressed="true"')));
  writeFileSync(
    path.join(SALIDA, `${nombre}--cajon.html`),
    pagina(titulo, html.replace('data-movil="cerrada"', 'data-movil="abierta"').replace("</aside>", '</aside><button type="button" class="telon no-imprimir" aria-label="Cerrar el menú"></button>'))
  );
}

/**
 * A HTML esperando todo lo asíncrono: algunas pantallas de siempre (la matriz de realidad) tienen componentes de servidor
 * async adentro, que renderToStaticMarkup no espera. prerender sí.
 */
async function aHtml(el: React.ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el);
  const trozos: Buffer[] = [];
  for await (const t of prelude) trozos.push(Buffer.from(t as Uint8Array));
  return Buffer.concat(trozos).toString("utf8");
}

async function consultora(sub: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = `/empresa/${EMP}${sub}`;
  const { NavConsultor } = await import("@/components/consultor/NavConsultor");
  const { default: LayoutEmpresa } = await import("@/app/(consultor)/empresa/[id]/layout");
  const contenido = await cuerpo();
  const empresa = await LayoutEmpresa({ children: contenido, params: Promise.resolve({ id: EMP }) });
  return aHtml(
    <div className="marco-app">
      <NavConsultor
        empresas={[{ id: EMP, nombre: "Jeans del Valle (ficticia)" }, { id: "e2", nombre: "Estudio Contable Vargas & Asociados (ficticia)" }, { id: "e3", nombre: "Panadería Flor de Mayo (ficticia)" }]}
        usuario="Consultora de Ejemplo"
        torre={<Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control">T</Link>}
      />
      <div className="columna-app">
        <main className="contenido-app">
          <div className="hoja">{empresa}</div>
        </main>
      </div>
    </div>
  );
}

type Pagina = (p: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string>> }) => Promise<unknown>;
const con = (P: Pagina) => async () => (await P({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({}) })) as React.ReactElement;

it("pinta las vistas del dueño A", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };

  await hacer("vl-columna-realidad", async () => {
    armarBase();
    const { default: Realidad } = await import("@/app/(consultor)/empresa/[id]/realidad/page");
    variantes("vl-columna-realidad", "Matriz de realidad en Números (arnés)", await consultora("/realidad", con(Realidad as unknown as Pagina)));
  });
  await hacer("vl-avance", async () => {
    armarBase();
    const { default: Avance } = await import("@/app/(consultor)/empresa/[id]/avance/page");
    variantes("vl-avance", "Avance (arnés)", await consultora("/avance", con(Avance as unknown as Pagina)));
  });
  await hacer("vl-avance-sin-ruta", async () => {
    const b = armarBase({ indicador_valores: [], actions: [], deliverables: [], ruta_marcas: [] });
    Object.assign(b.tablas.companies![0]!, { tipo_trabajo: null, ruta_inicio: null });
    const { default: Avance } = await import("@/app/(consultor)/empresa/[id]/avance/page");
    variantes("vl-avance-sin-ruta", "Avance sin ruta (arnés)", await consultora("/avance", con(Avance as unknown as Pagina)));
  });
  await hacer("vl-expediente", async () => {
    armarBase();
    const { default: Expediente } = await import("@/app/(consultor)/empresa/[id]/expediente/page");
    variantes("vl-expediente", "Expediente (arnés)", await consultora("/expediente", con(Expediente as unknown as Pagina)));
  });
  await hacer("vl-estructura", async () => {
    armarBase();
    const { default: Procesos } = await import("@/app/(consultor)/empresa/[id]/procesos/page");
    variantes("vl-estructura", "Estructura · Procesos (arnés)", await consultora("/procesos", con(Procesos as unknown as Pagina)));
  });
  await hacer("vl-menu-administrar", async () => {
    armarBase();
    const { default: Organigrama } = await import("@/app/(consultor)/empresa/[id]/organigrama/page");
    const html = await consultora("/organigrama", con(Organigrama as unknown as Pagina));
    // El menú abierto, como queda al tocar «Administrar».
    variantes("vl-menu-administrar", "Menú Administrar (arnés)", html.replace('<details class="menu-administrar', '<details open="" class="menu-administrar'));
  });

  // Revisión de integración (16-10-2026): Estructura › Organigrama sin el menú abierto, y Estrategia (Debe ser) vacía y
  // con un plan estratégico, como las ve la consultora en una empresa a medio diagnóstico.
  await hacer("vl-organigrama", async () => {
    armarBase({
      org_puestos: [
        { id: "o1", company_id: EMP, nombre: "Dueña y gerente", persona: "Rosa Ejemplo", decide: "Precios, compras y pagos", mision: "Que el taller venda con ganancia", reporta_a: null, orden: 1, created_at: dia(9) },
        { id: "o2", company_id: EMP, nombre: "Jefa de taller", persona: "Lucía Ejemplo", decide: "El orden del corte", mision: "Que cada lote salga a tiempo", reporta_a: "o1", orden: 2, created_at: dia(9) },
        { id: "o3", company_id: EMP, nombre: "Vendedora de tienda", persona: "Ana Ejemplo", decide: null, mision: null, reporta_a: "o1", orden: 3, created_at: dia(9) },
        { id: "o4", company_id: EMP, nombre: "Costurera", persona: null, decide: null, mision: null, reporta_a: "o2", orden: 4, created_at: dia(9) },
      ],
    });
    const { default: Organigrama } = await import("@/app/(consultor)/empresa/[id]/organigrama/page");
    variantes("vl-organigrama", "Estructura · Organigrama (arnés)", await consultora("/organigrama", con(Organigrama as unknown as Pagina)));
  });
  await hacer("vl-estrategia", async () => {
    armarBase();
    const { default: DebeSer } = await import("@/app/(consultor)/empresa/[id]/debe-ser/page");
    variantes("vl-estrategia", "Estrategia · Debe ser (arnés)", await consultora("/debe-ser", con(DebeSer as unknown as Pagina)));
  });
  await hacer("vl-plan-estrategico", async () => {
    armarBase();
    const { default: PlanEstrategico } = await import("@/app/(consultor)/empresa/[id]/plan-estrategico/page");
    variantes("vl-plan-estrategico", "Estrategia · Plan estratégico (arnés)", await consultora("/plan-estrategico", con(PlanEstrategico as unknown as Pagina)));
  });

  // Revisión del 16-10-2026: Indicadores es su propia vista (salió de Avance).
  await hacer("vl-indicadores", async () => {
    armarBase();
    const { default: Kpis } = await import("@/app/(consultor)/empresa/[id]/kpis/page");
    variantes("vl-indicadores", "Indicadores (arnés)", await consultora("/kpis", con(Kpis as unknown as Pagina)));
  });

  writeFileSync(path.join(SALIDA, "vl-a-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);

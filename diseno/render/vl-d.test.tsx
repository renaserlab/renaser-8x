/**
 * ARNÉS DE DISEÑO · VISTAS LIMPIAS · D «EL PORTAL DEL DUEÑO» (16-10-2026). Pinta las pantallas del dueño tal como las
 * arma la app con su marco (barra lateral de cinco destinos, barra de avance y «En esta sección»), con la base en memoria
 * de tests/fixtures/base-falsa.ts y una empresa FICTICIA. No toca producción ni ninguna base. Deja el HTML en
 * diseno/render/salida/ (ignorada por git) para mirarlo con Chrome sin cabeza.
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/vl-d.test.tsx
 *
 * Casos (clientes/8x-plan/spec-vistas-limpias.md §13):
 *  - vl-portal-diagnostico: «Confirmar lo que encontramos» abierta: tarjetas de corrección con sus botones;
 *  - vl-portal-diagnostico-cerrada: sin sección abierta: las cifras, sin botones;
 *  - vl-portal-diagnostico-sin-publicar: nivel < 3: «Tu consultora está terminando tu diagnóstico»;
 *  - vl-portal-numeros: el tablero arriba y el formulario de siempre en su hoja;
 *  - vl-portal-nav: Inicio con los cinco destinos nuevos (abierta, riel y cajón).
 *
 * Los mocks, armarBase, variantes y portal() son copia de diseno/render/entrar-hoy.test.tsx (vi.mock no se comparte
 * entre archivos). El HTML lleva su propia hoja (salida/vl-d.css, compilada de src/app/globals.css) para no pisar la de
 * los otros arneses.
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown, ruta: "/portal", hoy: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  perfilApi: vi.fn(),
  puedeAcceder: vi.fn(async () => true),
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
// Lo que el dueño ya ve en su portal (empresaHoy lee una docena de tablas que no son de este encargo): se le da hecho.
vi.mock("@/lib/hoy", () => ({ empresaHoy: async () => estado.hoy }));
vi.mock("@/lib/tablero", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    tableroEmpresario: async () => ({
      preguntaAbierta: null,
      comprension: 64,
      kpis: { venta: { valor: 41800, periodo: "2026-09", estado: "contado" }, ganancia: { valor: 3000, periodo: "2026-09" }, deuda: null },
      serieVentas: [
        { periodo: "2026-05", valor: 38200, estado: "contado" },
        { periodo: "2026-06", valor: 44100, estado: "contado" },
        { periodo: "2026-08", valor: 39900, estado: "verificado" },
        { periodo: "2026-09", valor: 41800, estado: "contado" },
      ],
      epocaDorada: 60000,
      biblioteca: { listos: 3, total: 7, personas: 6 },
      entrada: { estado: "confirmada", respondidas: 12, total: 12 },
    }),
    pendientesDelDueno: async () => ({
      comoDueno: true, pedidos: { abiertas: 2 }, direccion: null, puntoDePartida: null, tareas: null,
      indicadores: [], numeros: { faltan: 5, total: 9 }, informeListo: false, informeAbierto: null,
    }),
  };
});

// ─────────────────────────── La empresa ficticia ───────────────────────────
const EMP = "0000000a-0000-4000-8000-00000000000a";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Rosa Ejemplo" };
const HOY = new Date();
const dia = (d: number) => new Date(HOY.getTime() - d * 86_400_000).toISOString();
const fecha = (d: number) => dia(d).slice(0, 10);

const sol = (seccion: string, est: "activa" | "completada" | "retirada", extra: Fila = {}): Fila => ({
  id: `s-${seccion}-${est}`, company_id: EMP, seccion, nota: null, estado: est, activada_at: dia(2),
  completada_at: est === "completada" ? dia(1) : null, retirada_at: null, activada_por: "00000000-0000-4000-8000-0000000000c1", ...extra,
});

const metrica = (n: number, clave: string, valor: number | null, periodo: string, est = "contado"): Fila => ({
  id: `m${n}`, company_id: EMP, clave, periodo, valor, estado: est, origen: est === "verificado" ? "conciliado" : "declarado", valor_texto: null, nota: null,
  response_id: null, source_id: null, updated_at: dia(3),
});

/**
 * Dos datos que no cuadran: lo que le quedó en setiembre (3.000) frente a la cuenta (41.800 − 20.000 − 6.000 = 15.800),
 * y el gasto fijo de sus nueve números (6.000) frente a la suma de su tabla de gastos (entre 8.880 y 9.680).
 */
const METRICAS: Fila[] = [
  metrica(1, "venta_mes", 38200, "2026-05"),
  metrica(2, "venta_mes", 44100, "2026-06"),
  metrica(3, "venta_mes", 39900, "2026-08", "verificado"),
  metrica(4, "venta_mes", 41800, "2026-09"),
  metrica(5, "costo_variable_mes", 20000, "2026-09"),
  metrica(6, "gasto_fijo_mes", 6000, "2026-09"),
  metrica(7, "ganancia_mes", 3000, "2026-09"),
  metrica(8, "caja_hoy", 3200, "actual"),
  metrica(9, "deuda_propia", 15000, "actual"),
  metrica(10, "venta_mes", 60000, "epoca_dorada"),
];

const COSTOS: Fila[] = [
  { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del taller", monto: 2500, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1, creado_por: DUENA.id },
  { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos (4 personas)", monto: null, monto_desde: 6000, monto_hasta: 6800, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
  { id: "c3", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Luz y agua", monto: 380, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 3, creado_por: DUENA.id },
];

/** Cinco procesos dibujados en distinto grado: cuántos pasos tiene cada uno y si está escrito. */
const PROCESOS: Fila[] = [
  { id: "p1", company_id: EMP, nombre: "Cómo se atiende un pedido por WhatsApp", area: "Ventas", categoria: null, version: "as_is", responsable: "Vendedora de tienda", tiempo: "15 minutos", inicio: "Llega un mensaje", resultado: "Pedido anotado y cobrado", proveedor: "Cliente", cliente_proceso: "Taller", indicador: null, created_at: dia(20) },
  { id: "p2", company_id: EMP, nombre: "Corte y costura de un lote", area: "Producción", categoria: null, version: "as_is", responsable: "Jefa de taller", tiempo: null, inicio: null, resultado: null, proveedor: null, cliente_proceso: null, indicador: null, created_at: dia(12) },
  { id: "p3", company_id: EMP, nombre: "Cierre de caja del día", area: "Administración", categoria: null, version: "as_is", responsable: "Rosa Ejemplo", tiempo: "30 minutos", inicio: "Cierre de tienda", resultado: "Caja cuadrada", proveedor: "Vendedora de tienda", cliente_proceso: "Dueña", indicador: null, created_at: dia(10) },
  { id: "p4", company_id: EMP, nombre: "Compra de tela al proveedor", area: "Compras", categoria: null, version: "as_is", responsable: "Rosa Ejemplo", tiempo: null, inicio: null, resultado: null, proveedor: null, cliente_proceso: null, indicador: null, created_at: dia(8) },
  { id: "p5", company_id: EMP, nombre: "Control de calidad antes de entregar", area: "Producción", categoria: null, version: "as_is", responsable: null, tiempo: null, inicio: null, resultado: null, proveedor: null, cliente_proceso: null, indicador: null, created_at: dia(2) },
];
const PASOS: Record<string, number> = { p1: 7, p2: 6, p3: 4, p4: 3, p5: 0 };
const ESCRITOS = new Set(["p1"]);
const NODOS: Fila[] = [
  { process_id: "p1", tipo: "tarea", responsable: "Vendedora de tienda", rol: null },
  { process_id: "p1", tipo: "decision", responsable: "Rosa Ejemplo", rol: null },
  { process_id: "p2", tipo: "tarea", responsable: "Jefa de taller", rol: null },
  { process_id: "p3", tipo: "tarea", responsable: "Rosa Ejemplo", rol: null },
  { process_id: "p3", tipo: "decision", responsable: "Rosa Ejemplo", rol: null },
  { process_id: "p4", tipo: "decision", responsable: "Rosa Ejemplo", rol: null },
  { process_id: "p4", tipo: "tarea", responsable: "Vendedora de tienda", rol: null },
];

const HOY_PUBLICADO = {
  nivel: 3, espejo: [], secundarias: [], fortalezas: [{ id: "h3", titulo: "Los clientes vuelven por el arreglo gratis de bastas", causa: null, impacto: null, pilar: "marketing", patron: null, preserva: true, recomendacion: null, costo_posible: null, evidencia: [], provisional: false }],
  noVes: [], porConfirmar: [], fortalezasPorConfirmar: [], caleta: [], sistematizar: [], tentativo: [], pilares: [], stats: { fuentes: 9, afirmaciones: 48, confirmadas: 31, porValidar: 0, espejo: 0, porConfirmar: 0, fortalezasPorConfirmar: 0 },
  restriccion: { id: "h1", titulo: "El precio del jean clásico no cubre la tela de este año", causa: null, impacto: "alto", pilar: "producto", patron: null, preserva: false, recomendacion: null, costo_posible: "Hasta S/ 2,100 al mes", evidencia: [], provisional: false },
};
const HOY_SIN_PUBLICAR = { ...HOY_PUBLICADO, nivel: 2, restriccion: null, fortalezas: [] };

const declaracion = (id: string, texto: string): Fila => ({ id, texto, tipo: "declaracion", origen: "consultor", fuentes: [], fecha: null, revisado_por: "00000000-0000-4000-8000-0000000000c1" });

function armarBase(extra: Record<string, Fila[]> = {}) {
  const b = crearBaseFalsa({
    companies: [
      {
        id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", etapa: "diagnostico", estado_admision: "admitida",
        pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: ["fabrica_y_vende"], tipo_trabajo: "estructurar_y_sistematizar",
        ruta_inicio: fecha(7), hora_cierre: "19:00", modelo_operativo: ["produccion"], ficha: { personas: "6", ciudad: "Arequipa", meta_venta_mensual: "55000" },
        admision: null, tope_tokens: 2_000_000, created_at: dia(40),
      },
    ],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
    participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", created_at: dia(30), user_id: DUENA.id }],
    solicitudes_cliente: [sol("corroborar_diagnostico", "activa", { nota: "Revisa los datos que no cuadran en Tu diagnóstico" }), sol("subir_organigrama", "completada")],
    company_metricas: METRICAS,
    costos_mes: COSTOS,
    ficha_negocio: [{ company_id: EMP, historia: {}, modulos: {}, totales: {}, moneda: {}, credito: {}, inventario: {} }],
    processes: PROCESOS,
    process_nodes: NODOS,
    ficha_direccion: [
      {
        id: "f1", company_id: EMP, version: 1, estado: "acordada", acordada_at: dia(4), bloques: {},
        dependencia: { declaraciones: [declaracion("d1", "Si no estoy, nadie compra la tela"), declaracion("d2", "Los precios los pongo yo")], dimensiones: {} },
      },
    ],
    actions: [
      { id: "a1", company_id: EMP, accion: "Subir el precio del jean clásico a lo que cuesta hacerlo este año", estado: "en_ejecucion", prioridad: 1 },
      { id: "a2", company_id: EMP, accion: "Anotar cada venta del sábado en el cuaderno", estado: "aprobado", prioridad: 2 },
    ],
    company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 0, sin_verificar: 17, hallazgos_por_revisar: 0, fuentes: 9 }],
    ...extra,
  });
  // Lo que la base falsa no trae y estas pantallas usan: .or/.not (filtros que aquí no filtran), rpc y el conteo
  // embebido de pasos y documentos de cada proceso («process_nodes(count)», «sops(count)»).
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown> & { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown> };
    q.or = () => q;
    q.not = () => q;
    // «*, findings(titulo)»: la base falsa no resuelve las relaciones embebidas y devolvía filas vacías (Tu plan salía
    // «se está armando» con dos acciones aprobadas). Aquí, «*» basta.
    const sel = q.select as (c?: string, o?: unknown) => unknown;
    q.select = (c?: string, o?: unknown) => sel(c && c.trim().startsWith("*") ? "*" : c, o);
    if (t === "processes") {
      const original = q.then;
      q.then = (res, rej) =>
        original((r: unknown) => {
          const x = r as { data: Fila[] | null };
          return res(x.data ? { ...x, data: x.data.map((f) => ({ ...f, process_nodes: [{ count: PASOS[String(f.id)] ?? 0 }], sops: [{ count: ESCRITOS.has(String(f.id)) ? 1 : 0 }] })) } : x);
        }, rej);
    }
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
<link rel="stylesheet" href="vl-d.css">
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

/** El marco del portal, como lo arma src/app/(cliente)/layout.tsx, con los cinco destinos nuevos. */
async function portal(ruta: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = ruta;
  const { NavCliente } = await import("@/components/cliente/NavCliente");
  const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
  const { BarraRutaCliente } = await import("@/components/cliente/BarraRutaCliente");
  const { seccionesAbiertas, pantallasOcultas } = await import("@/lib/solicitudes");
  const { negocioDeEmpresa } = await import("@/lib/ruta-datos");
  const [abiertasAhora, negocio] = await Promise.all([seccionesAbiertas(EMP).catch(() => null), negocioDeEmpresa(EMP).catch(() => null)]);
  const ocultar = pantallasOcultas(abiertasAhora, negocio?.guardado ?? null);
  const enlaces: [string, string][] = [["/portal", "Inicio"], ["/portal/diagnostico", "Tu diagnóstico"], ["/portal/numeros", "Tus números"], ["/portal/procesos", "Tus procesos"], ["/portal/plan", "Tu plan"]];
  const barra = await BarraRutaCliente({ companyId: EMP });
  const contenido = await cuerpo();
  return renderToStaticMarkup(
    <div className="marco-app">
      <NavCliente enlaces={enlaces} empresa="Jeans del Valle (ficticia)" avisos={abiertasAhora?.length ? { "/portal": abiertasAhora.length } : undefined} />
      <div className="columna-app">
        {barra}
        <main className="contenido-app">
          <EnEstaSeccion ocultar={ocultar} />
          <div className="hoja">{contenido}</div>
        </main>
      </div>
    </div>
  );
}

const comoDuena = (hoy: unknown = HOY_PUBLICADO) => {
  estado.portal = { u: DUENA, companyId: EMP, empresa: { id: EMP, nombre: "Jeans del Valle (ficticia)", etapa: "diagnostico" }, queFalta: "Tu diagnóstico se está afinando.", paso: 6, porValidar: 0, fuentes: 9, sesionesPend: 0, stats: null };
  estado.hoy = hoy;
};

it("pinta el portal del dueño en cinco destinos", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };

  await hacer("vl-portal-diagnostico", async () => {
    armarBase();
    comoDuena();
    const { default: TuDiagnostico } = await import("@/app/(cliente)/portal/diagnostico/page");
    variantes("vl-portal-diagnostico", "Tu diagnóstico (arnés)", await portal("/portal/diagnostico", TuDiagnostico));
  });
  await hacer("vl-portal-diagnostico-cerrada", async () => {
    armarBase({ solicitudes_cliente: [sol("corroborar_diagnostico", "completada")] });
    comoDuena();
    const { default: TuDiagnostico } = await import("@/app/(cliente)/portal/diagnostico/page");
    variantes("vl-portal-diagnostico-cerrada", "Tu diagnóstico cerrada (arnés)", await portal("/portal/diagnostico", TuDiagnostico));
  });
  await hacer("vl-portal-diagnostico-sin-publicar", async () => {
    armarBase({ solicitudes_cliente: [] });
    comoDuena(HOY_SIN_PUBLICAR);
    const { default: TuDiagnostico } = await import("@/app/(cliente)/portal/diagnostico/page");
    variantes("vl-portal-diagnostico-sin-publicar", "Tu diagnóstico sin publicar (arnés)", await portal("/portal/diagnostico", TuDiagnostico));
  });
  await hacer("vl-portal-numeros", async () => {
    armarBase({ solicitudes_cliente: [sol("datos_faltantes", "activa", { nota: "Faltan lo que te deben tus clientes y lo que cuesta lo que más vendes." })] });
    comoDuena();
    const { default: Numeros } = await import("@/app/(cliente)/portal/numeros/page");
    variantes("vl-portal-numeros", "Tus números (arnés)", await portal("/portal/numeros", Numeros));
  });
  await hacer("vl-portal-nav", async () => {
    armarBase();
    comoDuena();
    const { default: Inicio } = await import("@/app/(cliente)/portal/page");
    variantes("vl-portal-nav", "Inicio con cinco destinos (arnés)", await portal("/portal", Inicio));
  });

  // Revisión de integración (16-10-2026): los dos destinos que faltaban, con el mismo marco de cinco destinos.
  await hacer("vl-portal-procesos", async () => {
    armarBase();
    comoDuena();
    const { default: Procesos } = await import("@/app/(cliente)/portal/procesos/page");
    variantes("vl-portal-procesos", "Tus procesos (arnés)", await portal("/portal/procesos", Procesos));
  });
  await hacer("vl-portal-plan", async () => {
    armarBase();
    comoDuena();
    const { default: Plan } = await import("@/app/(cliente)/portal/plan/page");
    variantes("vl-portal-plan", "Tu plan (arnés)", await portal("/portal/plan", Plan));
  });

  writeFileSync(path.join(SALIDA, "vl-d-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);

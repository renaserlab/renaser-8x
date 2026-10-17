/**
 * ARNÉS DE DISEÑO · «ENTRAR HOY» (16-10-2026). Pinta las pantallas nuevas y cambiadas tal como las arman la app y sus
 * marcos (barra lateral, barra de avance, «En esta sección»), con la base en memoria de tests/fixtures/base-falsa.ts y
 * una empresa FICTICIA. No toca producción ni ninguna base. Deja el HTML en diseno/render/salida/ (ignorada por git)
 * para mirarlo con Chrome sin cabeza y el CSS compilado de las fuentes de hoy (salida/app-nuevo.css).
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/entrar-hoy.test.tsx
 *
 * Los estados de la barra lateral (riel en escritorio, cajón abierto en el celular) los pone el navegador al tocar un
 * botón; aquí se fijan cambiando los mismos atributos que cambia Lateral.tsx (data-estado, data-movil y el telón).
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";

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
// El inicio del dueño lee una docena de tablas que no son de este encargo: se le dan sus números ya leídos.
vi.mock("@/lib/hoy", () => ({
  empresaHoy: async () => ({
    nivel: 3,
    espejo: [],
    secundarias: [],
    restriccion: { id: "h1", titulo: "El precio del jean clásico no cubre la tela de este año", causa: null, impacto: null, pilar: "producto", patron: null, preserva: false, recomendacion: null, costo_posible: "Hasta S/ 2,100 al mes", evidencia: [], provisional: false },
    noVes: [{ id: "h2", titulo: "Las ventas del sábado no se anotan en el cuaderno", causa: null, impacto: null, pilar: "procesos", patron: null, preserva: false, recomendacion: null, costo_posible: null, evidencia: [], provisional: true }],
    fortalezas: [{ id: "h3", titulo: "Los clientes vuelven por el arreglo gratis de bastas", causa: null, impacto: null, pilar: "marketing", patron: null, preserva: true, recomendacion: null, costo_posible: null, evidencia: [], provisional: false }],
  }),
}));
vi.mock("@/lib/tablero", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    tableroEmpresario: async () => ({
      preguntaAbierta: null,
      comprension: 64,
      kpis: { venta: { valor: 41800, periodo: "2026-09", estado: "contado" }, ganancia: null, deuda: null },
      serieVentas: [
        { periodo: "2026-05", valor: 38200, estado: "contado" },
        { periodo: "2026-06", valor: 44100, estado: "contado" },
        { periodo: "2026-08", valor: 39900, estado: "verificado" },
        { periodo: "2026-09", valor: 41800, estado: "contado" },
      ],
      epocaDorada: 60000,
      biblioteca: { listos: 3, total: 7, personas: 12 },
      entrada: { estado: "confirmada", respondidas: 12, total: 12 },
    }),
    pendientesDelDueno: async () => ({
      comoDueno: true, pedidos: { abiertas: 4 }, direccion: null, puntoDePartida: null, tareas: null,
      indicadores: [], numeros: { faltan: 4, total: 9 }, informeListo: false, informeAbierto: null,
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
  id: `s-${seccion}-${est}`,
  company_id: EMP,
  seccion,
  nota: null,
  estado: est,
  activada_at: dia(2),
  completada_at: est === "completada" ? dia(1) : null,
  retirada_at: null,
  activada_por: "00000000-0000-4000-8000-0000000000c1",
  ...extra,
});

const linea = (n: number, nombre: string, grupo: string | null, precio: number | null, partes: [string, number | null, string][], unidades: number | null, estados: Fila, extra: Fila = {}): Fila => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
  company_id: EMP,
  codigo: null,
  nombre,
  tipo: "producto",
  precio,
  costo_variable_unitario: partes.every((p) => p[1] != null) && partes.length ? partes.reduce((a, p) => a + (p[1] ?? 0), 0) : null,
  unidades_periodo: null,
  periodo: null,
  origen: "declarado",
  decision: n === 3 ? "retirar" : null,
  decision_motivo: n === 3 ? "Margen bajo y poca rotación" : null,
  modelo: "fabrica_y_vende",
  grupo,
  componentes_costo: partes.map(([nombre, valor, estado]) => ({ nombre, valor, estado })),
  unidades_mes: unidades,
  estados,
  creada_por: DUENA.id,
  created_at: dia(30 - n),
  ...extra,
});

const LINEAS: Fila[] = [
  linea(1, "Jean clásico azul", "Pantalones", 80, [["tela", 22, "contado"], ["costura", 12, "estimado"], ["botones y cierre", 3, "contado"]], 120, { precio: "contado", costo: "estimado", unidades: "estimado" }),
  linea(2, "Pantalón cargo", "Pantalones", null, [["tela", 24, "contado"], ["costura", 14, "estimado"]], null, { costo: "estimado" }, { datos_modelo: { rango_precio: { desde: 85, hasta: 95 }, rango_de_cada_10: { desde: 2, hasta: 3 } } }),
  linea(3, "Short de verano", "Pantalones", 45, [["tela", 18, "estimado"], ["costura", 20, "estimado"]], 30, { precio: "contado", costo: "estimado", unidades: "estimado" }),
  linea(4, "Casaca de jean forrada con chiporro para invierno (talla grande)", "Casacas", 180, [["tela", 55, "contado"], ["chiporro", 30, "contado"], ["costura", 25, "estimado"]], 12, { precio: "comprobado", costo: "estimado", unidades: "contado" }),
  linea(5, "Polo básico", "Polos", 25, [["tela", null, "no_lo_se"], ["estampado", 4, "estimado"]], 200, { precio: "contado", unidades: "estimado" }),
  linea(6, "Arreglo de bastas", null, 10, [], null, { precio: "contado" }, { tipo: "servicio", modelo: "vende_horas_o_casos" }),
];

const COSTOS: Fila[] = [
  { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del taller", monto: 2500, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1, creado_por: DUENA.id },
  { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos (4 personas)", monto: null, monto_desde: 6000, monto_hasta: 6800, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
  { id: "c3", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Luz y agua", monto: 380, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 3, creado_por: DUENA.id },
  { id: "c4", company_id: EMP, periodo: "mes_tipico", tipo: "comercializacion", nombre: "Publicidad en redes", monto: null, monto_desde: null, monto_hasta: null, estado: "no_lo_se", nota: null, orden: 1, creado_por: DUENA.id },
  { id: "c5", company_id: EMP, periodo: "mes_tipico", tipo: "comercializacion", nombre: "Delivery", monto: 450, monto_desde: null, monto_hasta: null, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
];

const METRICAS: Fila[] = [
  { company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: "2026-08", valor: 39900, estado: "verificado" },
  { company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 8000, estado: "contado" },
  { company_id: EMP, clave: "caja_hoy", periodo: "2026-10", valor: 3200, estado: "contado" },
  { company_id: EMP, clave: "deuda_propia", periodo: "2026-10", valor: 15000, estado: "contado" },
];

const PROCESOS: Fila[] = [
  { id: "p1", company_id: EMP, nombre: "Cómo se atiende un pedido por WhatsApp", area: "Ventas", version: "as_is", origen: "conversado", padre_id: null, created_at: dia(20) },
  { id: "p2", company_id: EMP, nombre: "Corte y costura de un lote", area: "Producción", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(3) },
  { id: "p3", company_id: EMP, nombre: "Control de calidad antes de entregar", area: "Producción", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(2) },
  { id: "p4", company_id: EMP, nombre: "Compra de tela al proveedor", area: "Compras", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(2) },
  { id: "p5", company_id: EMP, nombre: "Cierre de caja del día", area: "Administración", version: "sin_dibujar", origen: "importado", padre_id: null, created_at: dia(1) },
];
const FUENTES: Fila[] = [
  { id: "f1", company_id: EMP, nombre: "foto-cuaderno-corte.jpg", tipo: "imagen", estado: "leido", revision: null, origen: "subida", created_at: dia(3), process_id: "p2" },
  { id: "f2", company_id: EMP, nombre: "checklist calidad v2 FINAL (1).docx", tipo: "documento", estado: "leido", revision: "pendiente", origen: "subida", created_at: dia(2), process_id: "p3" },
  { id: "f3", company_id: EMP, nombre: "compras.pdf", tipo: "documento", estado: "leyendo", revision: null, origen: "subida", created_at: dia(1), process_id: "p4" },
  { id: "f9", company_id: EMP, nombre: "organigrama-taller-2026.pdf", tipo: "documento", estado: "leido", revision: "consolidada", origen: "subida", created_at: dia(4), process_id: null },
];

const PUESTOS: Fila[] = [
  { id: "o1", company_id: EMP, nombre: "Dueña y gerente", area: "Dirección", reporta_a: null, personas: 1, orden: 1, created_at: dia(10) },
  { id: "o2", company_id: EMP, nombre: "Jefa de taller", area: "Producción", reporta_a: "o1", personas: 1, orden: 2, created_at: dia(10) },
  { id: "o3", company_id: EMP, nombre: "Costurera", area: "Producción", reporta_a: "o2", personas: 3, orden: 3, created_at: dia(10) },
  { id: "o4", company_id: EMP, nombre: "Vendedora de tienda", area: "Ventas", reporta_a: "o1", personas: 1, orden: 4, created_at: dia(10) },
];

function armarBase(extra: Record<string, Fila[]> = {}) {
  const b = crearBaseFalsa(
    {
      companies: [
        {
          id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", etapa: "diagnostico", estado_admision: "admitida",
          pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: ["fabrica_y_vende"], tipo_trabajo: "estructurar_y_sistematizar",
          ruta_inicio: fecha(7), hora_cierre: "19:00", modelo_operativo: ["produccion"], ficha: { personas: "6", ciudad: "Arequipa", meta_venta_mensual: "55000", whatsapp: "999888777" },
          admision: null, tope_tokens: 2_000_000, created_at: dia(40),
        },
      ],
      memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
      participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", token_expira_at: null, token_revocado_at: null, token_canjeado_at: dia(30), created_at: dia(30), user_id: DUENA.id }],
      solicitudes_cliente: [
        sol("productos", "activa", { nota: "Empieza por los jeans, que son los que más vendes. Lo demás, si te da el tiempo." }),
        sol("costos", "activa"),
        sol("historia", "activa", { nota: "Cuéntalo como me lo contaste el martes." }),
        sol("subir_procesos", "activa", { nota: "Sube las fotos de tu cuaderno de corte." }),
        sol("subir_organigrama", "completada"),
        sol("moneda", "retirada"),
      ],
      lineas_producto: LINEAS,
      costos_mes: COSTOS,
      ficha_negocio: [{ company_id: EMP, historia: { anio_inicio: { valor: 2012, estado: "contado" }, venta_inicial: { valor: 8000, estado: "estimado" } }, modulos: { moneda: true, credito: false }, totales: {}, moneda: { vende_en: ["USD"] }, credito: {}, inventario: {} }],
      operaciones_moneda: [
        { id: "op1", company_id: EMP, fecha_venta: "2026-09-02", fecha_cobro: "2026-09-25", dias_cobro: 23, moneda: "USD", monto: 1200, tc_cotizado: 3.8, tc_cobro: 3.72, recibido: 4380, comisiones: 45, conversiones: 2, estado: "contado", creado_por: DUENA.id, created_at: dia(10) },
        { id: "op2", company_id: EMP, fecha_venta: "2026-09-18", fecha_cobro: null, dias_cobro: null, moneda: "USD", monto: 800, tc_cotizado: 3.78, tc_cobro: null, recibido: null, comisiones: null, conversiones: null, estado: "estimado", creado_por: DUENA.id, created_at: dia(5) },
      ],
      company_metricas: METRICAS,
      processes: PROCESOS,
      sources: FUENTES,
      company_assets: [{ company_id: EMP, clave: "personas.organigrama", estado: "en_revision", source_id: "f9", updated_at: dia(4), confirmado_at: null }],
      org_puestos: PUESTOS,
      ruta_marcas: [{ company_id: EMP, clave: "diagnostico.compromiso", valor: "cumple", nota: "Lo dijo en la reunión del lunes", marcado_at: dia(3) }],
      company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 2, sin_verificar: 15, hallazgos_por_revisar: 3, fuentes: 9 }],
      diagnoses: [
        { company_id: EMP, pilar: "producto", estado: "mejorable", resumen: null },
        { company_id: EMP, pilar: "procesos", estado: "critico", resumen: null },
      ],
      ...extra,
    },
    // Una lectura que falla de verdad: la ruta tiene que decir «no se pudo leer» y no pintarlo como hecho ni como falta.
    { indicadores: { code: "57014", message: "canceling statement due to statement timeout" } }
  );
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<style>:root{--font-bodoni:"Bodoni Moda";--font-manrope:"Manrope";--font-source-serif:"Source Serif 4";}</style>
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

async function portal(ruta: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = ruta;
  const { NavCliente } = await import("@/components/cliente/NavCliente");
  const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
  const { BarraRutaCliente } = await import("@/components/cliente/BarraRutaCliente");
  const { seccionesAbiertas, pantallasOcultas } = await import("@/lib/solicitudes");
  const { negocioDeEmpresa } = await import("@/lib/ruta-datos");
  const [abiertasAhora, negocio] = await Promise.all([seccionesAbiertas(EMP).catch(() => null), negocioDeEmpresa(EMP).catch(() => null)]);
  const ocultar = pantallasOcultas(abiertasAhora, negocio?.guardado ?? null);
  const enlaces: [string, string][] = [["/portal", "Inicio"], ["/portal/hoy", "Mi empresa"], ["/portal/procesos", "Procesos"], ["/portal/activos", "Tus documentos"], ["/portal/plan", "Plan"]];
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

async function consultora(sub: string, cuerpo: () => Promise<React.ReactElement> | React.ReactElement) {
  estado.ruta = `/empresa/${EMP}${sub}`;
  const { NavConsultor } = await import("@/components/consultor/NavConsultor");
  const { default: LayoutEmpresa } = await import("@/app/(consultor)/empresa/[id]/layout");
  const contenido = await cuerpo();
  const empresa = await LayoutEmpresa({ children: contenido, params: Promise.resolve({ id: EMP }) });
  return renderToStaticMarkup(
    <div className="marco-app">
      <NavConsultor
        empresas={[{ id: EMP, nombre: "Jeans del Valle (ficticia)" }, { id: "e2", nombre: "Estudio Contable Vargas & Asociados (ficticia)" }, { id: "e3", nombre: "Panadería Flor de Mayo (ficticia)" }]}
        usuario="Consultora de Ejemplo"
        torre={<Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control"><Icono nombre="torre" /></Link>}
      />
      <div className="columna-app">
        <main className="contenido-app">
          <div className="hoja">{empresa}</div>
        </main>
      </div>
    </div>
  );
}

const comoDuena = () => (estado.portal = { u: DUENA, companyId: EMP, empresa: { id: EMP, nombre: "Jeans del Valle (ficticia)", etapa: "diagnostico" }, queFalta: "Tu diagnóstico se está afinando.", paso: 6, porValidar: 0, fuentes: 9, sesionesPend: 0, stats: null });

it("pinta las pantallas de «entrar hoy»", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };

  // ── Portal del dueño ──
  await hacer("portal-inicio", async () => {
    armarBase();
    comoDuena();
    const { default: Inicio } = await import("@/app/(cliente)/portal/page");
    variantes("eh-portal-inicio", "Inicio (arnés)", await portal("/portal", Inicio));
  });
  await hacer("portal-pedidos", async () => {
    armarBase();
    comoDuena();
    const { default: Pedidos } = await import("@/app/(cliente)/portal/pedidos/page");
    variantes("eh-portal-pedidos", "Pedidos (arnés)", await portal("/portal/pedidos", Pedidos));
  });
  await hacer("portal-costos", async () => {
    armarBase();
    comoDuena();
    const { default: Costos } = await import("@/app/(cliente)/portal/costos/page");
    variantes("eh-portal-costos", "Gastos (arnés)", await portal("/portal/costos", Costos));
  });
  await hacer("portal-costos-cerrada", async () => {
    armarBase({ solicitudes_cliente: [], costos_mes: [] });
    comoDuena();
    const { default: Costos } = await import("@/app/(cliente)/portal/costos/page");
    variantes("eh-portal-costos-cerrada", "Gastos cerrada (arnés)", await portal("/portal/costos", Costos));
  });
  await hacer("portal-historia", async () => {
    armarBase();
    comoDuena();
    const { default: Historia } = await import("@/app/(cliente)/portal/historia/page");
    variantes("eh-portal-historia", "Historia (arnés)", await portal("/portal/historia", Historia));
  });
  await hacer("portal-cobros", async () => {
    armarBase();
    comoDuena();
    const { default: Cobros } = await import("@/app/(cliente)/portal/cobros/page");
    variantes("eh-portal-cobros", "Cobros (arnés)", await portal("/portal/cobros", Cobros));
  });
  await hacer("portal-producto-abierta", async () => {
    armarBase();
    comoDuena();
    const { default: Producto } = await import("@/app/(cliente)/portal/producto/page");
    variantes("eh-portal-producto-abierta", "Lo que vendes abierta (arnés)", await portal("/portal/producto", Producto));
  });
  await hacer("portal-producto-cerrada", async () => {
    armarBase({ solicitudes_cliente: [sol("productos", "completada")] });
    comoDuena();
    const { default: Producto } = await import("@/app/(cliente)/portal/producto/page");
    variantes("eh-portal-producto-cerrada", "Lo que vendes cerrada (arnés)", await portal("/portal/producto", Producto));
  });
  await hacer("portal-producto-modelo", async () => {
    const b = armarBase({ lineas_producto: [] });
    b.tablas.companies![0]!.modelo_negocio = null;
    comoDuena();
    const { default: Producto } = await import("@/app/(cliente)/portal/producto/page");
    variantes("eh-portal-producto-modelo", "Lo que vendes sin modelo (arnés)", await portal("/portal/producto", Producto));
  });
  await hacer("portal-procesos", async () => {
    armarBase();
    comoDuena();
    const { default: Procesos } = await import("@/app/(cliente)/portal/procesos/page");
    variantes("eh-portal-procesos", "Procesos (arnés)", await portal("/portal/procesos", Procesos));
  });

  // ── La consultora ──
  await hacer("empresa-panorama", async () => {
    armarBase();
    const { default: Panorama } = await import("@/app/(consultor)/empresa/[id]/page");
    variantes("eh-empresa-panorama", "Panorama (arnés)", await consultora("", async () => (await Panorama({ params: Promise.resolve({ id: EMP }) })) as React.ReactElement));
  });
  await hacer("empresa-producto", async () => {
    armarBase();
    const { default: Producto } = await import("@/app/(consultor)/empresa/[id]/producto/page");
    variantes(
      "eh-empresa-producto",
      "Producto y rentabilidad (arnés)",
      await consultora("/producto", async () => (await Producto({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({}) })) as React.ReactElement)
    );
  });
  await hacer("empresa-organigrama", async () => {
    armarBase();
    const { default: Organigrama } = await import("@/app/(consultor)/empresa/[id]/organigrama/page");
    variantes("eh-empresa-organigrama", "Organigrama (arnés)", await consultora("/organigrama", async () => (await Organigrama({ params: Promise.resolve({ id: EMP }) })) as React.ReactElement));
  });

  writeFileSync(path.join(SALIDA, "eh-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);

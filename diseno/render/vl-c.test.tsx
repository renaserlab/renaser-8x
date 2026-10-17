/**
 * ARNÉS DE DISEÑO · VISTAS LIMPIAS · C «NÚMEROS» (16-10-2026). Pinta /empresa/[id]/numeros tal como la arma la app
 * con su marco (barra lateral, barra de avance, cabecera de la empresa, columna de vistas y «En esta vista»), con la base
 * en memoria de tests/fixtures/base-falsa.ts y una empresa FICTICIA. No toca producción ni ninguna base. Deja el HTML en
 * diseno/render/salida/ (ignorada por git) para mirarlo con Chrome sin cabeza.
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/vl-c.test.tsx
 *
 * Casos (clientes/8x-plan/spec-vistas-limpias.md §13):
 *  - vl-numeros: los nueve con las cinco marcas, la línea con el equilibrio, la rentabilidad y las fugas con cifra;
 *  - vl-numeros-un-mes: un solo mes de ventas, el aviso en lugar de la línea;
 *  - vl-numeros-vacio: sin números: rayado, y «no aplica» en los módulos que la empresa dijo que no.
 *
 * Los mocks, armarBase, variantes y consultora() son copia de diseno/render/entrar-hoy.test.tsx (vi.mock no se comparte
 * entre archivos). El HTML lleva su propia hoja de estilos (salida/vl-c.css) para no pisar la de los otros arneses.
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, ruta: "/empresa" }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
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

/** El mes pasado en Lima y los anteriores: los datos se mueven con el día en que se corre el arnés. */
const hoyLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(HOY).slice(0, 7);
const mes = (k: number) => {
  const total = Number(hoyLima.slice(0, 4)) * 12 + Number(hoyLima.slice(5, 7)) - 1 - k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

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
  decision: null,
  decision_motivo: null,
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
  linea(2, "Pantalón cargo", "Pantalones", 90, [["tela", 24, "contado"], ["costura", 14, "estimado"]], 60, { precio: "contado", costo: "estimado", unidades: "contado" }),
  linea(3, "Short de verano", "Pantalones", 45, [["tela", 18, "estimado"], ["costura", 20, "estimado"]], 30, { precio: "contado", costo: "estimado", unidades: "estimado" }),
  linea(4, "Casaca de jean forrada con chiporro para invierno (talla grande)", "Casacas", 180, [["tela", 55, "contado"], ["chiporro", 30, "contado"], ["costura", 25, "estimado"]], 12, { precio: "comprobado", costo: "estimado", unidades: "contado" }),
  linea(5, "Polo básico", "Polos", 25, [["tela", null, "no_lo_se"], ["estampado", 4, "estimado"]], 200, { precio: "contado", unidades: "estimado" }),
];

const COSTOS: Fila[] = [
  { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del taller", monto: 2500, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1, creado_por: DUENA.id },
  { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos (4 personas)", monto: null, monto_desde: 6000, monto_hasta: 6800, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
  { id: "c3", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Luz y agua", monto: 380, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 3, creado_por: DUENA.id },
];

/** Las cinco marcas: comprobado, de memoria, de un documento sin revisar, no lo sabe y falta. Un mes sin venta en medio. */
const METRICAS: Fila[] = [
  { company_id: EMP, clave: "venta_mes", periodo: mes(1), valor: 41800, estado: "contado", cifra_desplazada: { lado: "extraido", valor: 52300, nota: "reporte de ventas del POS" } },
  { company_id: EMP, clave: "venta_mes", periodo: mes(2), valor: 39900, estado: "verificado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(3), valor: 44100, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(5), valor: 38200, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(6), valor: 35600, estado: "extraido" },
  { company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado" },
  { company_id: EMP, clave: "costo_variable_mes", periodo: mes(1), valor: 21500, estado: "contado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: mes(1), valor: 9200, estado: "contado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: mes(2), valor: 9000, estado: "contado" },
  { company_id: EMP, clave: "ganancia_mes", periodo: mes(1), valor: null, estado: "sin_dato" },
  { company_id: EMP, clave: "caja_hoy", periodo: "actual", valor: 6400, estado: "extraido" },
  { company_id: EMP, clave: "precio_producto_estrella", periodo: "actual", valor: 80, estado: "verificado" },
  { company_id: EMP, clave: "costo_producto_estrella", periodo: "actual", valor: 37, estado: "contado" },
  { company_id: EMP, clave: "deuda_propia", periodo: "actual", valor: 15000, estado: "contado" },
];

const FICHA_CON_MODULOS: Fila = {
  company_id: EMP,
  historia: { anio_inicio: { valor: 2012, estado: "contado" }, venta_inicial: { valor: 8000, estado: "estimado" } },
  modulos: { moneda: true, credito: true, inventario: true },
  totales: {},
  moneda: { vende_en: ["USD"], operaciones_mes: { valor: 4, estado: "contado" }, monto_tipico: { desde: 900, hasta: 1300, estado: "estimado" } },
  credito: { de_cada_10: { valor: 3, estado: "contado" }, dias: { valor: 45, estado: "estimado" }, incobrables_de_cada_10: { desde: 1, hasta: 2, estado: "estimado" } },
  inventario: { parado: { desde: 9000, hasta: 12000, estado: "estimado" }, meses: { valor: 2, estado: "contado" } },
};

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
    participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", token_expira_at: null, token_revocado_at: null, token_canjeado_at: dia(30), created_at: dia(30), user_id: DUENA.id }],
    lineas_producto: LINEAS,
    costos_mes: COSTOS,
    ficha_negocio: [FICHA_CON_MODULOS],
    operaciones_moneda: [
      { id: "op1", company_id: EMP, fecha_venta: fecha(40), fecha_cobro: fecha(17), dias_cobro: 23, moneda: "USD", monto: 1200, tc_cotizado: 3.8, tc_cobro: 3.72, recibido: 4380, comisiones: 45, conversiones: 2, estado: "contado", creado_por: DUENA.id, created_at: dia(10) },
      { id: "op2", company_id: EMP, fecha_venta: fecha(20), fecha_cobro: fecha(2), dias_cobro: 18, moneda: "USD", monto: 800, tc_cotizado: 3.78, tc_cobro: 3.7, recibido: 2915, comisiones: 30, conversiones: 1, estado: "contado", creado_por: DUENA.id, created_at: dia(5) },
    ],
    company_metricas: METRICAS,
    company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 2, sin_verificar: 15, hallazgos_por_revisar: 3, fuentes: 9 }],
    ...extra,
  });
  // Lo que la base falsa no trae y el marco usa: .or/.not (filtros que aquí no filtran) y rpc.
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
<link rel="stylesheet" href="vl-c.css">
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

const numeros = async () => {
  const { default: Numeros } = await import("@/app/(consultor)/empresa/[id]/numeros/page");
  return (await Numeros({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({}) })) as React.ReactElement;
};

it("pinta la vista «Números» de la consultora", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };

  await hacer("vl-numeros", async () => {
    armarBase();
    variantes("vl-numeros", "Números (arnés)", await consultora("/numeros", numeros));
  });
  await hacer("vl-numeros-un-mes", async () => {
    armarBase({ company_metricas: [{ company_id: EMP, clave: "venta_mes", periodo: mes(1), valor: 41800, estado: "contado" }, { company_id: EMP, clave: "gasto_fijo_mes", periodo: "actual", valor: 9200, estado: "contado" }] });
    variantes("vl-numeros-un-mes", "Números, un mes (arnés)", await consultora("/numeros", numeros));
  });
  await hacer("vl-numeros-vacio", async () => {
    armarBase({
      company_metricas: [],
      lineas_producto: [],
      costos_mes: [],
      operaciones_moneda: [],
      ficha_negocio: [{ company_id: EMP, historia: {}, modulos: { moneda: false, credito: false, inventario: false }, totales: {}, moneda: {}, credito: {}, inventario: {} }],
    });
    variantes("vl-numeros-vacio", "Números vacía (arnés)", await consultora("/numeros", numeros));
  });

  writeFileSync(path.join(SALIDA, "vl-c-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);

/**
 * ARNÉS DE DISEÑO · VISTAS LIMPIAS, DUEÑO B: el Diagnóstico de la consultora (16-10-2026). Pinta la portada de la
 * empresa tal como la arman la app y sus marcos (barra lateral, barra de avance, cabecera, columna de vistas y «En esta
 * vista»), con la base en memoria de tests/fixtures/base-falsa.ts y una empresa FICTICIA. No toca producción ni ninguna
 * base. Deja el HTML en diseno/render/salida/ (ignorada por git).
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/vl-b.test.tsx
 *
 * Casos:
 *  - vl-diagnostico: dos datos que no cuadran (ganancia frente a la cuenta y gasto fijo frente a la tabla), una
 *    restricción con monto y «Lo que falta» con un pedido activo y uno entregado;
 *  - vl-diagnostico-limpio: sin datos que no cuadran, sin aviso;
 *  - vl-diagnostico-vacio: una empresa recién creada: todo rayado, el medidor sin dato y la ficha de trabajo abierta.
 *
 * El mapa de procesos se le da ya armado: la base en memoria no cuenta los pasos de cada proceso (process_nodes(count))
 * y sin eso todo proceso saldría «sin mapear».
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, ruta: "/empresa", mapa: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  perfilApi: vi.fn(),
  puedeAcceder: vi.fn(async () => true),
  requerirConsultor: async () => ({ id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@ejemplo.pe", nombre: "Consultora de Ejemplo", rol: "consultor" }),
}));
vi.mock("@/lib/mapa-empresa", async (original) => ({
  ...(await original<typeof import("@/lib/mapa-empresa")>()),
  mapaDe: async () => estado.mapa,
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
/** El último mes cerrado y el anterior, como AAAA-MM. */
const mes = (atras: number) => {
  const t = HOY.getUTCFullYear() * 12 + HOY.getUTCMonth() - atras;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

const sol = (seccion: string, est: "activa" | "completada" | "retirada", extra: Fila = {}): Fila => ({
  id: `s-${seccion}-${est}`, company_id: EMP, seccion, nota: null, estado: est, activada_at: dia(3), completada_at: est === "completada" ? dia(1) : null,
  retirada_at: null, activada_por: "00000000-0000-4000-8000-0000000000c1", ...extra,
});

const linea = (n: number, nombre: string, grupo: string | null, precio: number | null, partes: [string, number | null, string][], unidades: number | null, estados: Fila, extra: Fila = {}): Fila => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`, company_id: EMP, codigo: null, nombre, tipo: "producto", precio,
  costo_variable_unitario: partes.every((p) => p[1] != null) && partes.length ? partes.reduce((a, p) => a + (p[1] ?? 0), 0) : null,
  unidades_periodo: null, periodo: null, origen: "declarado", decision: null, decision_motivo: null, modelo: "fabrica_y_vende", grupo,
  componentes_costo: partes.map(([nombre, valor, estado]) => ({ nombre, valor, estado })), unidades_mes: unidades, estados, creada_por: DUENA.id, created_at: dia(30 - n), ...extra,
});

const LINEAS: Fila[] = [
  linea(1, "Jean clásico azul", "Pantalones", 80, [["tela", 22, "contado"], ["costura", 12, "estimado"], ["botones y cierre", 3, "contado"]], 120, { precio: "contado", costo: "estimado", unidades: "estimado" }),
  linea(2, "Pantalón cargo", "Pantalones", 90, [["tela", 24, "contado"], ["costura", 14, "estimado"]], null, { costo: "estimado" }),
  linea(3, "Casaca de jean forrada", "Casacas", 180, [["tela", 55, "contado"], ["chiporro", 30, "contado"], ["costura", 25, "estimado"]], 12, { precio: "comprobado", costo: "estimado", unidades: "contado" }),
];

const COSTOS: Fila[] = [
  { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del taller", monto: 2500, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1, creado_por: DUENA.id },
  { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos (4 personas)", monto: null, monto_desde: 6000, monto_hasta: 6800, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
  { id: "c3", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Luz y agua", monto: 380, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 3, creado_por: DUENA.id },
];

/** Los números: con el gasto fijo y la ganancia que no cuadran (casos 3 y 4); el caso limpio los corrige. */
const metricas = (limpio: boolean): Fila[] => [
  { company_id: EMP, clave: "venta_mes", periodo: mes(5), valor: 36400, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(4), valor: 38200, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(3), valor: 44100, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(2), valor: 39900, estado: "verificado" },
  { company_id: EMP, clave: "venta_mes", periodo: mes(1), valor: 41800, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado" },
  { company_id: EMP, clave: "costo_variable_mes", periodo: mes(1), valor: 22000, estado: "contado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: mes(1), valor: limpio ? 9200 : 6000, estado: "contado" },
  { company_id: EMP, clave: "ganancia_mes", periodo: mes(1), valor: limpio ? 10600 : 3200, estado: "contado" },
  { company_id: EMP, clave: "caja_hoy", periodo: "actual", valor: 7800, estado: "contado" },
  { company_id: EMP, clave: "deuda_propia", periodo: "actual", valor: 15000, estado: "contado" },
  { company_id: EMP, clave: "deuda_clientes", periodo: "actual", valor: null, estado: "sin_dato" },
];

const ev = (nivel: number, nombre: string, siguiente: string | null) => ({ nivel, nombre, siguiente, porque: [] });
const MAPA = {
  procesos: [
    { id: "p1", nombre: "Cómo se atiende un pedido por WhatsApp", categoria: null, evaluacion: ev(3, "Escrito", "Falta el número que dice si va bien") },
    { id: "p2", nombre: "Corte y costura de un lote", categoria: null, evaluacion: ev(2, "Ordenado", "Falta escribirlo paso a paso para que alguien nuevo pueda hacerlo leyendo") },
    { id: "p3", nombre: "Cierre de caja del día", categoria: null, evaluacion: ev(1, "Contado", "Falta decir quién responde, cuánto toma") },
  ],
  empresa: { nivel: 1.2, nombre: "Contado", mapeados: 3, esperados: 5, nivelMapeados: 2, nombreMapeados: "Ordenado" },
};
const MAPA_VACIO = { procesos: [], empresa: { nivel: 0, nombre: "Sin mapear", mapeados: 0, esperados: 0, nivelMapeados: 0, nombreMapeados: "Sin mapear" } };

const FICHA_DIRECCION: Fila = {
  id: "fd1", company_id: EMP, version: 1, estado: "borrador", bloques: {},
  dependencia: {
    dimensiones: {
      comercial: { que_se_detiene: "Las ventas grandes las cierra ella", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: [], nota: null, origen: "consultor" },
      financiera: { que_se_detiene: "Nadie más paga a proveedores", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: [], nota: null, origen: "director" },
      decisiones: { que_se_detiene: "Los descuentos", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, evidencia: [], nota: null, origen: "consultor", revisado_por: "c1" },
    },
    procesos: { total: 3, con_dueno: 3, decide_solo: 2, nombres_con_dueno: [], nombres_decide_solo: [], texto: "participa en 3 de 3 procesos del mapa; en 2 de ellos es el único que decide" },
    declaraciones: [
      { id: "d1", texto: "Si no estoy, nadie aprueba los descuentos a los mayoristas.", tipo: "declaracion", origen: "sistema", fuentes: [], fecha: null },
      { id: "d2", texto: "Los pagos a proveedores esperan a que yo vuelva.", tipo: "declaracion", origen: "sistema", fuentes: [], fecha: null },
    ],
    interpretaciones: { pendiente: false, motivo: null, at: null },
  },
  created_at: dia(5),
};

const CLAIMS: Fila[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: `cl-p${i}`, company_id: EMP, pilar: "procesos", estado: "confirmado", texto: "x" })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: `cl-m${i}`, company_id: EMP, pilar: "producto", estado: "confirmado", texto: "x" })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `cl-x${i}`, company_id: EMP, pilar: "personas", estado: "sin_verificar", prioridad_validacion: true, texto: "x" })),
];

function armarBase(caso: "completo" | "limpio" | "vacio") {
  const vacio = caso === "vacio";
  const b = crearBaseFalsa({
    companies: [
      {
        id: EMP, nombre: vacio ? "Panadería Flor de Mayo (ficticia)" : "Jeans del Valle (ficticia)", sector: vacio ? null : "Confección textil", etapa: vacio ? "admision" : "diagnostico",
        estado_admision: "admitida", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: vacio ? null : ["fabrica_y_vende"],
        tipo_trabajo: vacio ? null : "estructurar_y_sistematizar", ruta_inicio: vacio ? null : fecha(9), hora_cierre: null, modelo_operativo: [],
        ficha: vacio ? null : { personas: "6", ciudad: "Arequipa", meta_venta_mensual: "55000", whatsapp: "999888777" }, admision: null, tope_tokens: 2_000_000, created_at: dia(40),
      },
    ],
    ...(vacio
      ? {}
      : {
          memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
          participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", created_at: dia(30) }],
          solicitudes_cliente: [sol("corroborar_diagnostico", "activa", { nota: "Revisa los datos que no cuadran en Tu diagnóstico." }), sol("productos", "completada")],
          lineas_producto: LINEAS,
          costos_mes: COSTOS,
          ficha_negocio: [{ company_id: EMP, historia: { anio_inicio: { valor: 2012, estado: "contado" }, venta_inicial: { valor: 8000, estado: "estimado" } }, modulos: { moneda: false, credito: false }, totales: {}, moneda: {}, credito: {}, inventario: {} }],
          company_metricas: metricas(caso === "limpio"),
          ficha_direccion: [FICHA_DIRECCION],
          claims: CLAIMS,
          diagnoses: [
            { company_id: EMP, pilar: "producto", estado: "mejorable", resumen: null },
            { company_id: EMP, pilar: "procesos", estado: "critico", resumen: null },
          ],
          findings: [
            { id: "h1", company_id: EMP, titulo: "El precio del jean clásico no cubre la tela de este año", pilar: "producto", impacto: "alto", impacto_potencial: "alto", confianza: 0.8, provisional: false, requiere_validacion: false, estado_revision: "aprobado", filtros: { costo_posible: "Hasta S/ 2,100 al mes" }, created_at: dia(4) },
            { id: "h2", company_id: EMP, titulo: "Las ventas del sábado no se anotan", pilar: "procesos", impacto: "medio", impacto_potencial: "alto", confianza: 0.3, provisional: true, requiere_validacion: true, estado_revision: "pendiente", filtros: null, created_at: dia(3) },
          ],
          actions: [{ id: "a1", company_id: EMP, accion: "Subir el precio del jean clásico a S/ 89", estado: "en_ejecucion", prioridad: 1 }],
          org_puestos: [{ id: "o1", company_id: EMP, nombre: "Dueña y gerente", area: "Dirección", reporta_a: null, personas: 1, orden: 1, created_at: dia(10) }],
          company_stats: [{ company_id: EMP, afirmaciones: 26, confirmadas: 23, contradichas: 0, sin_verificar: 3, hallazgos_por_revisar: 1, fuentes: 4 }],
        }),
  });
  // Lo que la base falsa no trae y estas pantallas usan: .or/.not (filtros que aquí no filtran) y rpc.
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown>;
    q.or = () => q;
    q.not = () => q;
    return q;
  };
  estado.base = { from, rpc: async () => ({ data: 184_000, error: null }) };
  estado.mapa = vacio ? MAPA_VACIO : MAPA;
  return b;
}

// ─────────────────────────── El HTML ───────────────────────────
const SALIDA = path.resolve(__dirname, "salida");

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="vl-b.css">
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

it("pinta el Diagnóstico de la consultora", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const hacer = async (nombre: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };
  const diagnostico = async () => {
    const { default: Diagnostico } = await import("@/app/(consultor)/empresa/[id]/page");
    return (await Diagnostico({ params: Promise.resolve({ id: EMP }) })) as React.ReactElement;
  };

  await hacer("vl-diagnostico", async () => {
    armarBase("completo");
    variantes("vl-diagnostico", "Diagnóstico (arnés)", await consultora("", diagnostico));
  });
  await hacer("vl-diagnostico-limpio", async () => {
    armarBase("limpio");
    variantes("vl-diagnostico-limpio", "Diagnóstico sin datos que no cuadran (arnés)", await consultora("", diagnostico));
  });
  await hacer("vl-diagnostico-vacio", async () => {
    armarBase("vacio");
    variantes("vl-diagnostico-vacio", "Diagnóstico de una empresa recién creada (arnés)", await consultora("", diagnostico));
  });

  // Muestra (no es un caso del encargo): el mismo tablero con las palabras del dueño, sin su barra ni su página, para
  // ver las piezas compartidas. Su página de verdad (/portal/diagnostico) la pinta el arnés del dueño D.
  await hacer("vl-b-muestra-dueno", async () => {
    armarBase("completo");
    const { leerHechosDiagnostico } = await import("@/lib/diagnostico-datos");
    const { armarDiagnostico } = await import("@/lib/diagnostico-tablero");
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const t = armarDiagnostico(await leerHechosDiagnostico(EMP, { para: "dueno" }), "dueno");
    const html = renderToStaticMarkup(
      <div className="marco-app">
        <div className="columna-app">
          <main className="contenido-app">
            <TableroDiagnostico t={t} base="/portal" accionIncongruencia={() => <button type="button" className="boton boton--secundario">Corregir este dato</button>} />
          </main>
        </div>
      </div>
    );
    variantes("vl-b-muestra-dueno", "Tu diagnóstico, piezas (arnés)", html);
  });

  writeFileSync(path.join(SALIDA, "vl-b-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 240_000);

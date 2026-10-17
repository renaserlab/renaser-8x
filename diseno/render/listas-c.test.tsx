/**
 * ARNÉS DE DISEÑO · LAS LISTAS DE LA CONSULTORA (constructor C, sistema «noche y perla», 17-10-2026). Pinta /bandeja,
 * /empresas, /cartera, /decisiones y /salud dentro del marco real de la consultora (src/app/(consultor)/layout.tsx), con
 * empresas FICTICIAS y una base en memoria. No toca producción ni ninguna base. Deja el HTML en diseno/render/salida/
 * (ignorada por git) con la hoja compilada de src/app/globals.css (salida/app-nuevo.css).
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/listas-c.test.tsx
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";

const ruta = vi.hoisted(() => ({ actual: "/bandeja" }));
vi.mock("next/navigation", () => ({
  usePathname: () => ruta.actual,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect");
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

const HOY = Date.now();
const haceDias = (d: number) => new Date(HOY - d * 86_400_000).toISOString();
const EMPRESAS = [
  { id: "e1", nombre: "Modas Lucero (ficticia)", sector: "Confección", etapa: "diagnostico", estado_admision: "admitida", created_at: haceDias(40) },
  { id: "e2", nombre: "Estudio Vargas & Asociados (ficticio)", sector: "Servicios contables", etapa: "contraste", estado_admision: "admitida", created_at: haceDias(32) },
  { id: "e3", nombre: "Taller Rojas (ficticio)", sector: "Metalmecánica", etapa: "implementacion", estado_admision: "admitida", created_at: haceDias(21) },
  { id: "e4", nombre: "Panadería Flor de Mayo (ficticia)", sector: null, etapa: "levantamiento", estado_admision: "admitida", created_at: haceDias(3) },
];
const tablas = vi.hoisted(() => ({ datos: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (t: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "in", "order", "limit", "single", "maybeSingle", "neq", "is", "not", "or", "range"]) b[m] = () => b;
      b.then = (ok: (r: unknown) => unknown) => ok({ data: tablas.datos[t] ?? [], error: null, count: 0 });
      return b;
    },
  }),
}));
vi.mock("@/lib/auth", () => ({
  requerirConsultor: async () => ({ id: "u1", email: "consultora@ejemplo.pe", nombre: "Consultora de Ejemplo", rol: "consultor" }),
}));
vi.mock("@/lib/errores", () => ({
  registrarError: vi.fn(async () => {}),
  erroresRecientes: async () => [
    { id: "x1", ruta: "/api/companies/e1/medicion", metodo: "POST", mensaje: "La venta del mes no es un número.", detalle: null, created_at: haceDias(0.2) },
    { id: "x2", ruta: "/api/portal/numeros", metodo: "PATCH", mensaje: "Se cortó la conexión con la base.", detalle: null, created_at: haceDias(1.4) },
  ],
  pulso24h: async () => ({ errores: 1, movimientos: 46 }),
}));
vi.mock("@/lib/decisiones", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const base = { company_id: "e1", origen: "agente", agente: "diagnosticador", agente_version: "3", evidencia: [{ tipo: "dato", texto: "Venta de setiembre" }], alternativas: [], recomendacion: "Subir el precio", recomendacion_por_que: "El costo subió", impacto_esperado: "+S/ 1,800 al mes", que_pasa_si_se_aprueba: "Se avisa al dueño", created_at: haceDias(2) };
  return {
    ...real,
    listarDecisiones: async () => [
      { ...base, id: "d1", estado: "pendiente", titulo: "Subir el precio del jean clásico" },
      { ...base, id: "d2", estado: "aprobada", titulo: "Anotar cada venta del sábado", company_id: "e3" },
      { ...base, id: "d3", estado: "rechazada", titulo: "Cerrar la tienda del centro", company_id: "e2", origen: "consultora" },
    ],
    balanceDeCorrecciones: async () => ({ total: 4, porAccion: { modificar: 3, rechazar: 1 }, conResultado: 1, sinResultado: 3 }),
  };
});
vi.mock("@/lib/cartera", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    cargarCartera: async () => ({
      hoy: new Date(HOY).toISOString().slice(0, 10), generadaAt: new Date(HOY).toISOString(), filas: [], conAsignacion: true, avisos: [],
      consultores: [{ id: "u1", nombre: "Consultora de Ejemplo", email: null }],
      carga: [
        { id: "u1", nombre: "Consultora de Ejemplo", activas: 3, empresas: 4, exigenDecision: 1, conBloqueo: 1, compromisosVencidos: 0, prioridades: 5 },
        { id: null, nombre: "Sin asignar", activas: 1, empresas: 1, exigenDecision: 0, conBloqueo: 0, compromisosVencidos: 0, prioridades: 0 },
      ],
      resumen: { empresas: 4, activas: 4, exigenDecision: 1, conBloqueo: 1, compromisosVencidos: 0, compromisosQueVencenPronto: 2, entregasPendientes: 1, fuentesAtascadas: 0, trabajosFallidos: 0, sinConsultor: 1 },
    }),
  };
});
const radio = (listos: number) => ({ listos, total: 9, faltan: [], sinDato: [], completa: listos === 9, mesesConVenta: 3 });
const stats = (a: number, c: number, x: number, r: number) => ({ afirmaciones: a, confirmadas: c, contradichas: x, hallazgos_por_revisar: r, fuentes: 9 });
vi.mock("@/lib/bandeja", () => ({
  bandeja: async () => ({
    items: [
      { tipo: "escalado", titulo: "2 frente(s) trabados dos semanas", detalle: "Escala al consultor: nada muere en silencio.", company_id: "e3", empresa: "Taller Rojas (ficticio)", href: "#", urgencia: 1 },
      { tipo: "revisar", titulo: "3 hallazgo(s) por revisar", detalle: "Ningún hallazgo llega al cliente sin pasar por ti.", company_id: "e1", empresa: "Modas Lucero (ficticia)", href: "#", urgencia: 1 },
      { tipo: "contradicciones", titulo: "2 contradicción(es) sin resolver", detalle: "El dueño las resuelve con tres botones.", company_id: "e2", empresa: "Estudio Vargas & Asociados (ficticio)", href: "#", urgencia: 2 },
      { tipo: "numeros", titulo: "Le faltan 6 de los 9 números", detalle: "Sin ellos el diagnóstico es opinión.", company_id: "e4", empresa: "Panadería Flor de Mayo (ficticia)", href: "#", urgencia: 2 },
      { tipo: "medir", titulo: "Toca medir: 31 días sin corte", detalle: "Actualiza sus números.", company_id: "e3", empresa: "Taller Rojas (ficticio)", href: "#", urgencia: 3 },
    ],
    empresas: [
      { id: "e1", nombre: "Modas Lucero (ficticia)", etapa: "diagnostico", estado_admision: "admitida", stats: stats(74, 58, 0, 3), radiografia: radio(8) },
      { id: "e2", nombre: "Estudio Vargas & Asociados (ficticio)", etapa: "contraste", estado_admision: "admitida", stats: stats(61, 39, 2, 0), radiografia: radio(6) },
      { id: "e3", nombre: "Taller Rojas (ficticio)", etapa: "implementacion", estado_admision: "admitida", stats: stats(52, 41, 0, 0), radiografia: radio(9) },
      { id: "e4", nombre: "Panadería Flor de Mayo (ficticia)", etapa: "levantamiento", estado_admision: "admitida", stats: stats(12, 2, 0, 0), radiografia: radio(3) },
    ],
  }),
}));

const SALIDA = path.resolve(__dirname, "salida");
function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<style>:root{--font-bodoni:"Bodoni Moda";--font-manrope:"Manrope";--font-source-serif:"Source Serif 4";}</style>
</head><body>${cuerpo}</body></html>`;
}

it("pinta las listas de la consultora en su marco", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const errores: string[] = [];
  const { default: Layout } = await import("@/app/(consultor)/layout");
  const hacer = async (nombre: string, r: string, cuerpo: () => Promise<React.ReactNode>) => {
    try {
      ruta.actual = r;
      tablas.datos = { companies: EMPRESAS, sources: [{ company_id: "e1" }, { company_id: "e1" }], claims: [3, 5, 9, 12, 16, 17, 20, 24, 30, 33, 38, 44].map((d) => ({ company_id: "e1", validado_at: haceDias(d) })), findings: [], memberships: [{ company_id: "e1" }] };
      const contenido = await cuerpo();
      const marco = await Layout({ children: contenido });
      writeFileSync(path.join(SALIDA, `lc-${nombre}.html`), pagina(`${nombre} (arnés)`, renderToStaticMarkup(marco)));
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  };
  await hacer("bandeja", "/bandeja", async () => (await import("@/app/(consultor)/bandeja/page")).default());
  await hacer("empresas", "/empresas", async () => (await import("@/app/(consultor)/empresas/page")).default());
  await hacer("cartera", "/cartera", async () => (await import("@/app/(consultor)/cartera/page")).default({ searchParams: Promise.resolve({}) } as never));
  await hacer("decisiones", "/decisiones", async () => (await import("@/app/(consultor)/decisiones/page")).default({ searchParams: Promise.resolve({}) } as never));
  await hacer("salud", "/salud", async () => (await import("@/app/(consultor)/salud/page")).default());
  writeFileSync(path.join(SALIDA, "lc-errores.txt"), errores.join("\n\n") || "sin errores");
  if (errores.length) console.log(errores.join("\n\n"));
}, 120_000);

// ─────────── «Mi empresa hoy» del dueño (/portal/hoy), con un diagnóstico FICTICIO completo ───────────
const hallazgo = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, titulo, causa: "Se fija el precio con la tela del año pasado.", impacto: "alto", pilar: "producto", patron: null, preserva: false,
  recomendacion: "Recalcular el costo con la factura de este año.", costo_posible: "Hasta S/ 2,100 al mes", evidencia: [{ fuente: "lo que contaste" }], provisional: false, ...extra,
});
vi.mock("@/lib/portal", () => ({
  contextoPortal: async () => ({
    u: { id: "u2", email: null, nombre: "Rosa Ejemplo", rol: "cliente" },
    companyId: "e1", empresa: { id: "e1", nombre: "Modas Lucero (ficticia)", etapa: "diagnostico" },
    queFalta: "Tu diagnóstico se está afinando.", paso: 6, porValidar: 1, fuentes: 9, sesionesPend: 0, stats: null,
  }),
}));
vi.mock("@/lib/hoy", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    empresaHoy: async () => ({
      nivel: 3,
      stats: { fuentes: 9, afirmaciones: 48, confirmadas: 31, porValidar: 1, espejo: 1, porConfirmar: 1, fortalezasPorConfirmar: 0 },
      restriccion: hallazgo("h1", "El precio del jean clásico no cubre la tela de este año"),
      noVes: [
        hallazgo("h1", "El precio del jean clásico no cubre la tela de este año"),
        hallazgo("h2", "Las ventas del sábado no se anotan en el cuaderno", { pilar: "procesos", costo_posible: null }),
        hallazgo("h4", "Nadie más sabe comprar la tela", { impacto: "medio", pilar: "personas", costo_posible: null }),
      ],
      secundarias: [],
      fortalezas: [hallazgo("h3", "Los clientes vuelven por el arreglo gratis de bastas", { preserva: true, impacto: null, pilar: "marketing", costo_posible: null })],
      espejo: [{ declarado: { texto: "Vendemos unos 40 mil al mes", fuente: "lo que contaste", fecha: null, clase: "dueno" }, contraste: { texto: "El cuaderno suma 31 mil en setiembre", fuente: "un documento", fecha: null, clase: "documento" }, explicacion: null, resuelto: false }],
      porConfirmar: [{ id: "p1", titulo: "La tienda del centro no se paga sola", pilar: "finanzas", graveSiSeConfirma: true, confianza: "media", motivo: "documentos_sin_confirmar", deDonde: "Sale de un documento: el cuaderno de setiembre.", fuentes: 1, sustento: { confirmadas: 0, porConfirmar: 1 }, contradiccionAbierta: false, porQue: "Sale de documentos que aún nadie confirmó." }],
      fortalezasPorConfirmar: [],
      caleta: [{ puesto: "Jefa de taller", critico: true, documentado: false, situacion: "Cuando la tela llega húmeda, la deja un día antes de cortar.", senal: "La tela pesa más", regla: "Esperar un día" }],
      sistematizar: [{ nombre: "La compra de tela", motivo: "Hoy depende de una sola persona." }],
      tentativo: [
        { n: 1, problema: "Recalcular el precio del jean clásico", primerMovimiento: "Pedir la factura de tela de este mes.", porQue: "Cada jean se vende por debajo de lo que cuesta.", indicador: "Margen por jean" },
        { n: 2, problema: "Anotar cada venta del sábado", primerMovimiento: "Un cuaderno junto a la caja.", porQue: null, indicador: null },
      ],
      pilares: [
        { pilar: "producto", estado: "critico", resumen: "El precio no cubre el costo de este año." },
        { pilar: "procesos", estado: "mejorable", resumen: "Lo del sábado no se anota." },
        { pilar: "marketing", estado: "solido", resumen: "Los clientes vuelven." },
        { pilar: "finanzas", estado: "desconocido", resumen: null },
      ],
    }),
  };
});

it("pinta «Mi empresa hoy» del dueño en su hoja", async () => {
  mkdirSync(SALIDA, { recursive: true });
  ruta.actual = "/portal/hoy";
  tablas.datos = { companies: [], company_metricas: [], company_assets: [], interview_sessions: [], org_puestos: [] };
  let html = "";
  try {
    const { NavCliente } = await import("@/components/cliente/NavCliente");
    const { default: Hoy } = await import("@/app/(cliente)/portal/hoy/page");
    const enlaces: [string, string][] = [["/portal", "Inicio"], ["/portal/diagnostico", "Tu diagnóstico"], ["/portal/numeros", "Tus números"], ["/portal/procesos", "Tus procesos"], ["/portal/plan", "Tu plan"]];
    html = renderToStaticMarkup(
      <div className="marco-app">
        <NavCliente enlaces={enlaces} empresa="Modas Lucero (ficticia)" />
        <div className="columna-app">
          <main className="contenido-app">
            <div className="hoja">{await Hoy()}</div>
          </main>
        </div>
      </div>
    );
    writeFileSync(path.join(SALIDA, "lc-portal-hoy.html"), pagina("Mi empresa hoy (arnés)", html));
    writeFileSync(path.join(SALIDA, "lc-hoy-errores.txt"), "sin errores");
  } catch (e) {
    writeFileSync(path.join(SALIDA, "lc-hoy-errores.txt"), e instanceof Error ? String(e.stack) : String(e));
  }
}, 120_000);

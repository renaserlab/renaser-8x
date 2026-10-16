/**
 * ARNÉS DE DISEÑO (13-10-2026). Pinta /bandeja y /portal tal como los arma la app, con datos de ejemplo
 * (empresas inventadas), sin base de datos ni sesión, y deja el HTML en diseno/render/salida/ para mirarlo en el
 * navegador con el CSS compilado de `next build`. No toca producción ni ninguna base.
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";

const ruta = { actual: "/bandeja" };
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual, redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => <a href={href} {...resto}>{children}</a>,
}));

const HOY = Date.now();
const haceDias = (d: number) => new Date(HOY - d * 86_400_000).toISOString();
const tablas: Record<string, unknown> = {
  claims: [3, 3, 5, 9, 10, 12, 16, 17, 17, 20, 23, 24, 25, 26, 30, 31, 33, 38, 39, 40, 44, 45, 46, 47, 51].map((d) => ({ validado_at: haceDias(d) })),
  company_metricas: [],
  companies: { ficha: { meta_venta_mensual: "95000" } },
};
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (t: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "in", "order", "limit", "single", "maybeSingle", "neq", "is", "not", "or"]) b[m] = () => b;
      b.then = (ok: (r: unknown) => unknown) => ok({ data: tablas[t] ?? [], error: null });
      return b;
    },
  }),
}));

vi.mock("@/lib/auth", () => ({
  requerirConsultor: async () => ({ id: "u1", email: "kelin@ejemplo.pe", nombre: "Kelin Merma", rol: "consultor" }),
}));

const radio = (listos: number) => ({ listos, total: 9, faltan: [], sinDato: [], completa: listos === 9, mesesConVenta: 3 });
const stats = (a: number, c: number, x: number, r: number) => ({ afirmaciones: a, confirmadas: c, contradichas: x, hallazgos_por_revisar: r, fuentes: 9 });
vi.mock("@/lib/bandeja", () => ({
  bandeja: async () => ({
    items: [
      { tipo: "escalado", titulo: "2 frente(s) trabados dos semanas", detalle: "Escala al consultor: nada muere en silencio.", company_id: "e3", empresa: "Taller Rojas", href: "#", urgencia: 1 },
      { tipo: "revisar", titulo: "3 hallazgo(s) por revisar", detalle: "Ningún hallazgo llega al cliente sin pasar por ti.", company_id: "e1", empresa: "Modas Lucero", href: "#", urgencia: 1 },
      { tipo: "contradicciones", titulo: "2 contradicción(es) sin resolver", detalle: "El dueño las resuelve con tres botones.", company_id: "e2", empresa: "Estudio Vargas & Asociados", href: "#", urgencia: 2 },
      { tipo: "linea_base", titulo: "Ya se puede fijar el punto de partida", detalle: "Tiene 7 de 9 números.", company_id: "e5", empresa: "Clínica Dental Sonríe", href: "#", urgencia: 2 },
      { tipo: "numeros", titulo: "Le faltan 6 de los 9 números", detalle: "Sin ellos el diagnóstico es opinión.", company_id: "e4", empresa: "Panadería Flor de Mayo", href: "#", urgencia: 2 },
      { tipo: "trabada", titulo: "Sin actividad hace 6 días", detalle: "Llámalo o llena por él.", company_id: "e4", empresa: "Panadería Flor de Mayo", href: "#", urgencia: 2 },
      { tipo: "medir", titulo: "Toca medir: 31 días sin corte", detalle: "Actualiza sus números.", company_id: "e3", empresa: "Taller Rojas", href: "#", urgencia: 3 },
    ],
    empresas: [
      { id: "e1", nombre: "Modas Lucero", etapa: "diagnostico", estado_admision: "admitida", stats: stats(74, 58, 0, 3), radiografia: radio(8) },
      { id: "e2", nombre: "Estudio Vargas & Asociados", etapa: "contraste", estado_admision: "admitida", stats: stats(61, 39, 2, 0), radiografia: radio(6) },
      { id: "e3", nombre: "Taller Rojas", etapa: "implementacion", estado_admision: "admitida", stats: stats(52, 41, 0, 0), radiografia: radio(9) },
      { id: "e4", nombre: "Panadería Flor de Mayo", etapa: "levantamiento", estado_admision: "admitida", stats: stats(12, 2, 0, 0), radiografia: radio(3) },
      { id: "e5", nombre: "Clínica Dental Sonríe", etapa: "contraste", estado_admision: "admitida", stats: stats(38, 30, 1, 1), radiografia: radio(7) },
    ],
  }),
}));

vi.mock("@/lib/portal", () => ({
  contextoPortal: async () => ({
    u: { id: "u2", email: null, nombre: "Lucero Quispe", rol: "cliente" },
    companyId: "e1", empresa: { id: "e1", nombre: "Modas Lucero", etapa: "diagnostico" },
    queFalta: "Tu diagnóstico se está afinando.", paso: 6, porValidar: 0, fuentes: 9, sesionesPend: 0, stats: null,
  }),
}));
vi.mock("@/lib/hoy", () => ({
  empresaHoy: async () => ({
    nivel: 3, espejo: [], secundarias: [],
    restriccion: { id: "h1", titulo: "El precio del uniforme escolar no cubre la tela de este año", causa: null, impacto: null, pilar: "producto", patron: null, preserva: false, recomendacion: null, costo_posible: "Hasta S/ 2,100 al mes", evidencia: [], provisional: false },
    noVes: [{ id: "h2", titulo: "Las ventas del sábado no se anotan en el cuaderno", causa: null, impacto: null, pilar: "procesos", patron: null, preserva: false, recomendacion: null, costo_posible: null, evidencia: [], provisional: true }],
    fortalezas: [{ id: "h3", titulo: "Los clientes vuelven por el arreglo gratis de bastas", causa: null, impacto: null, pilar: "marketing", patron: null, preserva: true, recomendacion: null, costo_posible: null, evidencia: [], provisional: false }],
  }),
}));
vi.mock("@/lib/tablero", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    tableroEmpresario: async () => ({
      preguntaAbierta: null, comprension: 72,
      kpis: { venta: { valor: 86900, periodo: "2026-09", estado: "verificado" }, ganancia: { valor: 8000, periodo: "2026-09" }, deuda: null },
      serieVentas: [
        { periodo: "2026-04", valor: 74200, estado: "verificado" },
        { periodo: "2026-05", valor: 81500, estado: "verificado" },
        { periodo: "2026-07", valor: 88300, estado: "contado" },
        { periodo: "2026-08", valor: 79100, estado: "verificado" },
        { periodo: "2026-09", valor: 86900, estado: "verificado" },
      ],
      epocaDorada: null,
      biblioteca: { listos: 4, total: 6, personas: 8 },
      entrada: { estado: "confirmada", respondidas: 12, total: 12 },
    }),
    pendientesDelDueno: async () => ({
      comoDueno: true, direccion: null, puntoDePartida: { version: 1 }, tareas: { estaSemana: 5, enMarcha: 3 },
      indicadores: [], numeros: { faltan: 3, total: 9 }, informeListo: false, informeAbierto: null,
    }),
  };
});

const SALIDA = path.resolve(__dirname, "salida");

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app.css">
<style>:root{--font-manrope:"Manrope";--font-public-sans:"Public Sans";--font-source-serif:"Source Serif 4";}</style>
</head><body><div class="min-h-screen flex flex-col">${cuerpo}</div></body></html>`;
}

it("pinta las dos páginas", async () => {
  mkdirSync(SALIDA, { recursive: true });
  const css = path.resolve(__dirname, "../../.next/static");
  if (existsSync(css)) {
    const buscar = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? buscar(path.join(d, e.name)) : e.name.endsWith(".css") ? [path.join(d, e.name)] : []));
    const hojas = buscar(css);
    const { readFileSync } = await import("fs");
    // Lo compilado por `next build` (Tailwind incluido) y, encima, los dos estilos propios tal como están ahora.
    const propios = ["../../src/design/tokens.css", "../../src/design/tablero.css"].map((f) => readFileSync(path.resolve(__dirname, f), "utf8"));
    writeFileSync(path.join(SALIDA, "app.css"), [...hojas.map((h) => readFileSync(h, "utf8")), ...propios].join(String.fromCharCode(10)));
  }

  const { NavConsultor } = await import("@/components/consultor/NavConsultor");
  const { default: Bandeja } = await import("@/app/(consultor)/bandeja/page");
  ruta.actual = "/bandeja";
  const bandeja = renderToStaticMarkup(
    <>
      <NavConsultor empresas={[{ id: "e1", nombre: "Modas Lucero" }, { id: "e3", nombre: "Taller Rojas" }]} usuario="Kelin Merma" />
      <main className="contenido-app flex-1"><div className="hoja">{await Bandeja()}</div></main>
    </>
  );
  writeFileSync(path.join(SALIDA, "bandeja.html"), pagina("8X · Bandeja (arnés)", bandeja));

  const { NavCliente } = await import("@/components/cliente/NavCliente");
  const { default: Portal } = await import("@/app/(cliente)/portal/page");
  ruta.actual = "/portal";
  const enlaces: [string, string][] = [["/portal", "Inicio"], ["/portal/hoy", "Mi empresa"], ["/portal/procesos", "Procesos"], ["/portal/activos", "Tus documentos"], ["/portal/plan", "Plan"]];
  const portal = renderToStaticMarkup(
    <>
      <NavCliente enlaces={enlaces} empresa="Modas Lucero" />
      <main className="contenido-app flex-1"><div className="hoja">{await Portal()}</div></main>
    </>
  );
  writeFileSync(path.join(SALIDA, "portal.html"), pagina("8X · Portal (arnés)", portal));
  copyFileSync(path.resolve(__dirname, "../prototipos/marco.html"), path.join(SALIDA, "marco.html"));
}, 60_000);

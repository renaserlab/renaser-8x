/**
 * LAS VISTAS DE LA EMPRESA, PARA LA CONSULTORA (16-10-2026).
 *
 * Pedido de Kelin: «hace rato estaba simple y fácil: diagnóstico, qué hay en números, indicadores y el avance
 * progresivo… son muchas pestañas que deberían estar en una sola». La columna de la empresa pasó de 20 pestañas en
 * tres capas a cinco vistas y el Expediente aparte. Revisión del 16-10-2026: las cinco son las cuatro cosas que nombró
 * Kelin y la Estructura (Diagnóstico, Números, Indicadores, Estructura, Avance); «Debe ser» vive en Diagnóstico y el
 * plan estratégico en Avance; las vistas van en una barra bajo el nombre, no en una columna. Lo que se fija:
 *  - el mapa: cada una de las 20 pantallas de siempre cae en su vista, con su nombre en «En esta vista»;
 *  - vistaDe/subActiva: una ruta hija (/procesos/x, /entrega/x) cae en la vista y la pantalla de su madre;
 *  - la columna y la fila, pintadas: en /realidad la vista activa es «Números» y la pantalla, «Matriz de realidad»;
 *  - el layout: la empresa sale de la hoja, cabecera con «Ver como el empresario» y el menú «Administrar»;
 *  - Avance con una empresa ficticia: la frase de la compuerta, la ruta con id="ruta", «sin dato» en Indicadores sin
 *    valores, la línea con un periodo rayado cuando sí hay, y ningún «0 %» de algo no medido;
 *  - Expediente: la pista de lo confirmado y las personas entrevistadas;
 *  - Estructura: el resumen de procesos arriba y la hoja de siempre debajo;
 *  - ni un emoji.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts; las pantallas se renderizan a HTML con renderToStaticMarkup. Nadie las abrió en un
 * navegador aquí: lo que pasa al tocar (abrir el menú, cambiar de vista) no se ejecuta. Empresa FICTICIA.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, ruta: "/empresa/e1" }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
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

import { VISTAS, EXPEDIENTE, TODAS_LAS_VISTAS, PANTALLAS_MUDADAS, vistaDe, subActiva, subrutaDe, type ClaveVista } from "@/lib/vistas-empresa";
import { periodosRecientes } from "@/lib/kpis";

vi.setConfig({ testTimeout: 60_000 });

const SRC = path.resolve(__dirname, "../src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
/** Un «0 %» que no sea parte de otro número (10 %, 40 %…). */
const CERO_POR_CIENTO = /(^|[^\d])0\s?%/;
/** Un cero en dinero que nadie dijo. */
const CERO_INVENTADO = /S\/\s?0(?![.,]?\d)/;
const EMOJI = /\p{Extended_Pictographic}/u;

/** La etiqueta <a …> que lleva a `href`, con sus atributos en cualquier orden (Next pone aria-current antes que href). */
const etiquetaDe = (html: string, href: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`href="${href}"`)) ?? "";
/** ¿El enlace a `href` está marcado como el activo? */
const activo = (html: string, href: string) => /aria-current="page"/.test(etiquetaDe(html, href));
/** Los href de los enlaces marcados como activos. */
const activos = (html: string) => [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map((m) => /href="([^"]*)"/.exec(m[0])?.[1]);

// ————————————————————————————————————— EL MAPA —————————————————————————————————————

/** La tabla de §1: cada pantalla de hoy (y las tres nuevas), su vista y su nombre en «En esta vista». */
const MAPA: [string, ClaveVista, string][] = [
  ["", "diagnostico", "Resumen"],
  ["/direccion", "diagnostico", "Dirección empresarial"],
  ["/fuentes", "expediente", "Fuentes"],
  ["/afirmaciones", "expediente", "Afirmaciones"],
  ["/realidad", "numeros", "Matriz de realidad"],
  ["/entrevista", "expediente", "Entrevista"],
  ["/dia", "expediente", "El día"],
  ["/procesos", "estructura", "Procesos"],
  ["/organigrama", "estructura", "Organigrama"],
  ["/producto", "numeros", "Producto y rentabilidad"],
  ["/madurez", "diagnostico", "Radiografía"],
  ["/diagnostico", "diagnostico", "Hallazgos"],
  ["/debe-ser", "estrategia", "Debe ser"],
  ["/estrategia", "estrategia", "Estrategia"],
  ["/plan", "avance", "Plan"],
  ["/kpis", "indicadores", "Indicadores"],
  ["/revision", "avance", "Revisión semanal"],
  ["/excelencia", "avance", "Excelencia"],
  ["/entrega", "avance", "Entrega"],
  ["/configuracion", "expediente", "Configuración"],
  ["/numeros", "numeros", "Resumen"],
  ["/avance", "avance", "Resumen"],
  ["/expediente", "expediente", "Resumen"],
];

describe("el mapa: 20 pestañas → 5 vistas + Expediente", () => {
  it("seis vistas en este orden, con su enlace y su ícono, y el Expediente aparte", () => {
    expect(VISTAS.map((v) => [v.clave, v.nombre, v.href, v.icono])).toEqual([
      ["diagnostico", "Diagnóstico", "", "diagnostico"],
      ["numeros", "Números", "/numeros", "numeros"],
      ["indicadores", "Indicadores", "/kpis", "indicadores"],
      ["estructura", "Estructura", "/procesos", "procesos"],
      ["estrategia", "Estrategia", "/estrategia", "estrategia"],
      ["avance", "Avance", "/avance", "avance"],
    ]);
    expect([EXPEDIENTE.clave, EXPEDIENTE.nombre, EXPEDIENTE.href, EXPEDIENTE.icono]).toEqual(["expediente", "Expediente", "/expediente", "carpeta"]);
    expect(TODAS_LAS_VISTAS).toHaveLength(7);
  });

  it("las subpantalla de cada vista, en el orden de la especificación", () => {
    const sub = Object.fromEntries(TODAS_LAS_VISTAS.map((v) => [v.clave, v.sub.map(([h]) => h)]));
    expect(sub).toEqual({
      diagnostico: ["", "/diagnostico", "/madurez", "/direccion"],
      numeros: ["/numeros", "/producto", "/realidad"],
      indicadores: ["/kpis"],
      estructura: ["/procesos", "/organigrama"],
      estrategia: ["/estrategia", "/debe-ser"],
      avance: ["/avance", "/plan", "/revision", "/excelencia", "/entrega"],
      expediente: ["/expediente", "/fuentes", "/afirmaciones", "/entrevista", "/dia", "/configuracion"],
    });
  });

  it.each(MAPA)("«%s» cae en la vista %s, con el nombre «%s»", (ruta, vista, nombre) => {
    expect(vistaDe(ruta)).toBe(vista);
    expect(subActiva(ruta)).toBe(ruta);
    const v = TODAS_LAS_VISTAS.find((x) => x.clave === vista)!;
    expect(v.sub).toContainEqual([ruta, nombre]);
    // En exactamente una vista.
    expect(TODAS_LAS_VISTAS.filter((x) => x.sub.some(([h]) => h === ruta))).toHaveLength(1);
  });

  it("una ruta hija cae en la vista y la pantalla de su madre", () => {
    expect(vistaDe("/procesos/x")).toBe("estructura");
    expect(subActiva("/procesos/abc")).toBe("/procesos");
    expect(vistaDe("/entrega/x")).toBe("avance");
    expect(subActiva("/entrega/x")).toBe("/entrega");
    expect(vistaDe("")).toBe("diagnostico");
    expect(vistaDe("/direccion/constancia")).toBe("diagnostico");
    // «Plan estratégico» se mudó a la estrategia (17-10-2026): su dirección vieja es la pantalla nueva, nunca /plan.
    expect(subActiva("/plan-estrategico")).toBe("/estrategia");
    expect(vistaDe("/plan-estrategico")).toBe("estrategia");
    expect(vistaDe("/estrategia")).toBe("estrategia");
    expect(vistaDe("/debe-ser")).toBe("estrategia");
    expect(vistaDe("/planilla")).toBeNull();
    expect(vistaDe("/no-existe")).toBeNull();
    // Barra final y parámetros no cambian nada.
    expect(vistaDe("/realidad/")).toBe("numeros");
    expect(vistaDe("/kpis?x=1")).toBe("indicadores");
    expect(vistaDe("/kpis/k1")).toBe("indicadores");
  });

  it("«Plan estratégico» se mudó: no está en ninguna vista y lleva a la estrategia, la primera pantalla de Estrategia", () => {
    expect(PANTALLAS_MUDADAS).toEqual({ "/plan-estrategico": "/estrategia" });
    for (const [vieja, nueva] of Object.entries(PANTALLAS_MUDADAS)) {
      expect(TODAS_LAS_VISTAS.filter((v) => v.sub.some(([h]) => h === vieja)), `${vieja} sigue en una vista`).toHaveLength(0);
      expect(TODAS_LAS_VISTAS.filter((v) => v.sub.some(([h]) => h === nueva)), `${nueva} no está en una sola vista`).toHaveLength(1);
    }
    const estrategia = TODAS_LAS_VISTAS.find((v) => v.clave === "estrategia")!;
    expect(estrategia.href).toBe("/estrategia");
    expect(estrategia.sub[0]).toEqual(["/estrategia", "Estrategia"]);
    expect(estrategia.sub[1]).toEqual(["/debe-ser", "Debe ser"]);
  });

  it("de la ruta del navegador a la subruta de la empresa", () => {
    expect(subrutaDe("/empresa/e1", "/empresa/e1")).toBe("");
    expect(subrutaDe("/empresa/e1/procesos/p9", "/empresa/e1")).toBe("/procesos/p9");
    expect(subrutaDe("/empresa/e10/procesos", "/empresa/e1")).toBeNull();
    expect(subrutaDe("/bandeja", "/empresa/e1")).toBeNull();
  });
});

// ————————————————————————————————————— LA COLUMNA Y LA FILA —————————————————————————————————————

describe("la columna de vistas y la fila «En esta vista», pintadas", () => {
  beforeAll(async () => {
    await Promise.all([import("@/components/consultor/TabsEmpresa"), import("@/components/consultor/EnEstaVista")]);
  }, 120_000);

  it("en /empresa/e1/realidad la vista activa es «Números» y la pantalla, «Matriz de realidad»; el Expediente va al final y discreto", async () => {
    estado.ruta = "/empresa/e1/realidad";
    const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
    const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
    const tabs = renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }));
    expect(tabs).toMatch(/<nav class="vistas-empresa[^"]*" aria-label="Vistas de la empresa"/);
    expect(tabs.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    expect(activos(tabs)).toEqual(["/empresa/e1/numeros"]);
    // Siete enlaces: seis vistas y el Expediente, este último dentro de su caja aparte y con data-discreto.
    expect(tabs.match(/<a /g) ?? []).toHaveLength(7);
    const orden = [...tabs.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(orden).toEqual(["Diagnóstico", "Números", "Indicadores", "Estructura", "Estrategia", "Avance", "Expediente"]);
    expect(tabs).toMatch(/<div class="vistas-empresa__expediente"><a [^>]*href="\/empresa\/e1\/expediente"/);
    expect(etiquetaDe(tabs, "/empresa/e1/expediente")).toContain('data-discreto=""');
    // Cada vista con su ícono de trazo.
    expect(tabs.match(/<svg /g) ?? []).toHaveLength(7);

    const fila = renderToStaticMarkup(createElement(EnEstaVista, { base: "/empresa/e1" }));
    expect(fila).toMatch(/aria-label="En esta vista"/);
    expect(fila).toMatch(/class="no-imprimir en-seccion/);
    expect([...fila.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1])).toEqual(["Resumen", "Producto y rentabilidad", "Matriz de realidad"]);
    expect(activos(fila)).toEqual(["/empresa/e1/realidad"]);
  });

  it("en un proceso abierto (/procesos/p1) la vista es Estructura y la pantalla, Procesos", async () => {
    estado.ruta = "/empresa/e1/procesos/p1";
    const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
    const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
    const tabs = renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }));
    expect(activos(tabs)).toEqual(["/empresa/e1/procesos"]);
    const fila = renderToStaticMarkup(createElement(EnEstaVista, { base: "/empresa/e1" }));
    expect(activos(fila)).toEqual(["/empresa/e1/procesos"]);
    expect(fila).toContain(">Procesos<");
    expect(fila).toContain(">Organigrama<");
  });

  it("en la portada (/empresa/e1) la vista es Diagnóstico y la pantalla, Resumen; en Configuración, el Expediente", async () => {
    estado.ruta = "/empresa/e1";
    const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
    const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
    const tabs = renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }));
    expect(activos(tabs)).toEqual(["/empresa/e1"]);
    const portada = renderToStaticMarkup(createElement(EnEstaVista, { base: "/empresa/e1" }));
    expect(activos(portada)).toEqual(["/empresa/e1"]);
    expect([...portada.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1])).toEqual(["Resumen", "Hallazgos", "Radiografía", "Dirección empresarial"]);

    estado.ruta = "/empresa/e1/configuracion";
    const exp = renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }));
    expect(activos(exp)).toEqual(["/empresa/e1/expediente"]);
  });

  it("Indicadores es una vista de una sola pantalla: activa en /kpis y sin fila «En esta vista»", async () => {
    estado.ruta = "/empresa/e1/kpis";
    const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
    const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
    const tabs = renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }));
    expect(activos(tabs)).toEqual(["/empresa/e1/kpis"]);
    expect(renderToStaticMarkup(createElement(EnEstaVista, { base: "/empresa/e1" }))).toBe("");
  });

  it("fuera de la empresa no marca nada ni pinta la fila", async () => {
    estado.ruta = "/bandeja";
    const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
    const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
    expect(renderToStaticMarkup(createElement(TabsEmpresa, { base: "/empresa/e1", vistas: VISTAS, expediente: EXPEDIENTE }))).not.toContain("aria-current");
    expect(renderToStaticMarkup(createElement(EnEstaVista, { base: "/empresa/e1" }))).toBe("");
  });
});

// ————————————————————————————————————— LA BASE FICTICIA —————————————————————————————————————

/** Jeans del Valle (ficticia), con lo que cada caso le agregue. `fallos` hace fallar tablas enteras. */
function base(extra: Record<string, Fila[]> = {}, fallos: Record<string, { code: string; message: string }> = {}) {
  const b = crearBaseFalsa(
    {
      companies: [
        {
          id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", etapa: "diagnostico", estado_admision: "admitida",
          pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", tipo_trabajo: "estructurar", ruta_inicio: "2026-10-12",
          modelo_operativo: ["produccion"], ficha: { personas: "6", ciudad: "Arequipa", whatsapp: "999888777" }, admision: null, tope_tokens: 2_000_000,
        },
      ],
      ...extra,
    },
    fallos
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

const indicador = (extra: Fila = {}): Fila => ({
  id: "k1", company_id: EMP, clave: "venta_mes", nombre: "Venta del mes", como_se_mide: "", mejor_si: "sube", origen: "manual", estado: "activo",
  unidad: "soles", frecuencia: "mensual", tipo_indicador: "resultado", definicion: "Lo que se vendió en el mes", created_at: "2026-10-01T10:00:00.000Z",
  ...extra,
});

const pagina = async (ruta: string, cargar: () => Promise<{ default: (p: { params: Promise<{ id: string }> }) => Promise<React.ReactElement> }>) => {
  estado.ruta = `/empresa/${EMP}${ruta}`;
  const { default: P } = await cargar();
  return renderToStaticMarkup(await P({ params: Promise.resolve({ id: EMP }) }));
};

// ————————————————————————————————————— EL LAYOUT —————————————————————————————————————

describe("el layout de la empresa: sobre el cielo, con su cabecera y su menú", () => {
  it("barra de avance, cabecera, columna de vistas y la pantalla dentro de .empresa-contenido", async () => {
    base();
    estado.ruta = `/empresa/${EMP}/realidad`;
    const { default: Layout } = await import("@/app/(consultor)/empresa/[id]/layout");
    const h = renderToStaticMarkup(await Layout({ children: createElement("p", null, "contenido de prueba"), params: Promise.resolve({ id: EMP }) }));
    expect(h.startsWith('<div class="empresa-marco">')).toBe(true);
    expect(h.indexOf("barra-ruta")).toBeLessThan(h.indexOf("empresa-cabeza"));
    expect(h.indexOf("empresa-cabeza")).toBeLessThan(h.indexOf("vistas-empresa"));
    // La ruta en UNA línea arriba (la barra entera vive en Avance) y las vistas en una barra bajo la cabecera, con sus
    // pantallas debajo y la pantalla a todo lo ancho: ninguna columna de vistas al lado (revisión del 16-10-2026).
    expect(h).toContain('class="barra-ruta barra-ruta--compacta');
    expect(h).toMatch(/Etapa 1 de \d+ · <b>[^<]+<\/b> · /);
    expect(h).not.toContain("barra-ruta__falta");
    expect(h).toMatch(/<div class="empresa-navegacion[^"]*"><nav class="vistas-empresa/);
    expect(h).not.toContain("empresa-rejilla");
    expect(h.indexOf('aria-label="En esta vista"')).toBeGreaterThan(h.indexOf("vistas-empresa"));
    expect(h.indexOf('aria-label="En esta vista"')).toBeLessThan(h.indexOf("empresa-contenido"));
    // Con la ruta arriba, la fase del expediente no se repite como otra «etapa» en la cabecera.
    expect(h).not.toMatch(/class="estado neutro">Diagnóstico</);
    expect(h).toContain("Jeans del Valle (ficticia)");
    expect(h).toContain("Confección textil · Arequipa");
    expect(h).toContain('href="/api/consultor/ver-portal?empresa=' + EMP + '"');
    expect(h).toMatch(/<details class="menu-administrar[^"]*"><summary class="boton boton--secundario">Administrar/);
    expect(h).toContain("País y moneda");
    expect(h).toContain("Fase del expediente");
    expect(h).toContain('href="https://wa.me/51999888777"');
    expect(h).toMatch(/<div class="empresa-contenido"><p>contenido de prueba<\/p><\/div>/);
    expect(activo(h, `/empresa/${EMP}/numeros`)).toBe(true);
    expect(activo(h, `/empresa/${EMP}/realidad`)).toBe(true);
    expect(h).toContain('aria-label="En esta vista"');
    // Con tipo de trabajo e inicio, la barra lleva a la ruta en Avance.
    expect(h).toContain(`href="/empresa/${EMP}/avance#ruta"`);
    expect(h).not.toMatch(EMOJI);
  });

  it("sin tipo de trabajo, la barra lleva a la ficha de trabajo del Diagnóstico; sin admitir, lo dice en la cabecera", async () => {
    const b = base();
    Object.assign(b.tablas.companies![0]!, { tipo_trabajo: null, estado_admision: "candidata" });
    const { default: Layout } = await import("@/app/(consultor)/empresa/[id]/layout");
    const h = renderToStaticMarkup(await Layout({ children: null, params: Promise.resolve({ id: EMP }) }));
    expect(h).toContain(`href="/empresa/${EMP}#ficha"`);
    expect(h).toContain("Admisión por decidir");
    // Sin ruta dibujada arriba, la fase del expediente sí se dice en la cabecera.
    expect(h).toMatch(/class="estado neutro">Diagnóstico</);
  });

  it("el estilo: la hoja se apaga con .empresa-marco, la pantalla es un contenedor y lo que no es tablero va en su hoja", () => {
    const css = leer("design/vistas.css");
    // Desde el 17-10-2026 (sistema «noche y perla») la cabecera, la ruta compacta, las vistas y los menús viven en marco.css.
    const marco = leer("design/marco.css");
    const globals = leer("app/globals.css");
    expect(globals).toMatch(/@import "\.\.\/design\/vistas\.css";/);
    expect(globals).toMatch(/@import "\.\.\/design\/marco\.css";/);
    expect(css).toMatch(/\.hoja:has\(> \.empresa-marco\) \{ background: none; box-shadow: none; padding: 0; border-radius: 0; \}/);
    expect(css).toMatch(/\.empresa-pantalla \{[^}]*container: empresa \/ inline-size;/);
    expect(css).toMatch(/\.empresa-contenido:not\(:has\(> \.tablero\)\),\n\.hoja-suelta \{[^}]*box-shadow: var\(--sombra\)/);
    expect(css).toMatch(/@container empresa \(min-width: 561px\) and \(max-width: 980px\)/);
    expect(css).toMatch(/@container empresa \(max-width: 560px\)/);
    expect(marco).toMatch(/@media \(min-width: 1180px\)/);
    for (const clase of [".empresa-cabeza", ".empresa-navegacion", ".barra-ruta--compacta", ".vistas-empresa", ".vistas-empresa__expediente", ".menu-acciones", ".menu-administrar"]) {
      expect(marco, `falta ${clase} en marco.css`).toContain(clase);
    }
    for (const clase of [".proceso-tarjeta", ".empresa-contenido", ".hoja-suelta", ".tablero .bloque", ".tablero .medidor-en-bloque", ".tablero .aviso-incongruencias", ".tablero .incongruencias", ".tablero .incongruencia", ".tablero .lista li > .fila"]) {
      expect(css, `falta ${clase} en vistas.css`).toContain(clase);
    }
    const imprimirMarco = marco.slice(marco.indexOf("@media print"));
    for (const clase of [".vistas-empresa", ".en-seccion", ".menu-administrar"]) expect(imprimirMarco).toContain(clase);
    expect(css.slice(css.indexOf("@media print"))).toContain(".aviso-incongruencias");
  });
});

// ————————————————————————————————————— AVANCE —————————————————————————————————————

describe("Avance: la ruta, ¿mejoró?, indicadores, plan, revisión, excelencia y entrega", () => {
  beforeAll(async () => {
    await import("@/app/(consultor)/empresa/[id]/avance/page");
  }, 120_000);

  it("la ruta en una tarjeta (etapa, %, día, tramos y lo que falta), con id=\"ruta\", y «sin dato» en Indicadores sin valores", async () => {
    base({
      indicadores: [indicador()],
      ruta_marcas: [{ company_id: EMP, clave: "diagnostico.compromiso", valor: "cumple", nota: null, marcado_at: "2026-10-13T15:00:00.000Z" }],
    });
    const h = await pagina("/avance", () => import("@/app/(consultor)/empresa/[id]/avance/page"));
    expect(h.startsWith('<div class="tablero">')).toBe(true);
    // El titular dice la etapa con su avance, sin jerga; lo que falta para la compuerta va debajo, abierto, una sola vez.
    expect(h).toMatch(/<h1 id="t-avance"[^>]*>Etapa 1 de \d+ · Diagnóstico y plan · (\d+ %|sin medir)<\/h1>/);
    expect(h).toMatch(/Día \d+/);
    expect(h).toMatch(/<details class="barra-ruta__falta" open="">/);
    expect(h).toMatch(/Para pasar la Compuerta 5 · La Firma faltan \d+/);
    expect(h.match(/class="tramos"/g) ?? []).toHaveLength(1);
    expect(h).toContain('id="ruta"');
    // Las compuertas para marcar, plegadas dentro de la misma tarjeta.
    expect(h).toMatch(/<details class="plegado"[^>]*><summary><span>Las compuertas: lo que mide 8X y lo que marcas tú<\/span>/);
    // Indicadores: el título es «Indicadores» y dice cuántos hay activos.
    expect(h).toMatch(/<h2 id="t-indicadores">Indicadores<\/h2><p class="sub">1 activo<\/p>/);
    expect(h).toContain("Ningún indicador tiene dos valores anotados todavía");
    expect(h).not.toContain('class="grafico-linea"');
    expect(h).toContain("Todavía no hay plan");
    // Cada tarjeta lleva a su pantalla.
    for (const sub of ["/kpis", "/plan", "/revision", "/excelencia", "/entrega"]) expect(h).toContain(`href="/empresa/${EMP}${sub}"`);
    // Ningún «0 %» de algo no medido, y ningún «S/ 0» que nadie dijo.
    expect(h).not.toMatch(CERO_POR_CIENTO);
    expect(h).not.toMatch(CERO_INVENTADO);
    expect(h).not.toMatch(EMOJI);
  });

  it("con cinco valores de un indicador de resultado y un periodo sin anotar: la línea, con su hueco rayado", async () => {
    const periodos = periodosRecientes("mensual", 8, new Date(), "America/Lima"); // del más reciente al más antiguo
    const conValor = [periodos[0]!, periodos[1]!, periodos[3]!, periodos[4]!, periodos[5]!]; // periodos[2]: sin anotar
    base({
      indicadores: [indicador({ id: "k0", nombre: "Pedidos atendidos", tipo_indicador: "ejecucion", unidad: "numero" }), indicador()],
      indicador_valores: conValor.map((p, i) => ({ indicador_id: "k1", periodo: p, valor: 40000 + i * 1500, estado_validacion: "declarado" })),
      actions: [
        { company_id: EMP, estado: "verificado", verificado_at: "2026-10-14T15:00:00.000Z", vence_at: "2026-10-20" },
        { company_id: EMP, estado: "en_ejecucion", verificado_at: null, vence_at: "2026-11-01" },
        { company_id: EMP, estado: "propuesto", verificado_at: null, vence_at: null },
      ],
      deliverables: [
        { company_id: EMP, tipo: "informe_realidad", publicado: true },
        { company_id: EMP, tipo: "informe_realidad", publicado: true },
        { company_id: EMP, tipo: "diagnostico_4p", publicado: false },
      ],
    });
    const h = await pagina("/avance", () => import("@/app/(consultor)/empresa/[id]/avance/page"));
    expect(h).toContain('class="grafico-linea"');
    expect(h).toContain("Venta del mes");
    // El título es de todos los indicadores; el subtítulo dice cuál es la línea.
    expect(h).toMatch(/<h2 id="t-indicadores">Indicadores<\/h2><p class="sub">2 activos · la línea es Venta del mes/);
    expect(h).not.toContain("Ningún indicador tiene dos valores anotados todavía");
    // El periodo sin anotar se dibuja rayado y con su nombre, nunca como un cero.
    expect(h).toMatch(/<rect [^>]*fill="url\(#rayado-/);
    expect(h).toContain("rayado: un periodo sin valor anotado");
    expect(h).toMatch(/<span class="num">S\/ [\d.,]+<\/span>/);
    // Segmentos del plan y de la entrega.
    expect(h).toContain('<i class="l1"></i>1 verificada<');
    expect(h).toContain('<i class="l2"></i>1 en marcha<');
    expect(h).toContain('<i class="l4"></i>1 propuesta<');
    expect(h).toMatch(/1<small>de 7 publicados<\/small>/);
    // ¿Mejoró? sale una sola vez: el panel trae su título y la tarjeta no lo repite.
    expect(h.match(/>¿Mejoró\?</g) ?? []).toHaveLength(1);
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("si lo que se lee falla, cada tarjeta lo dice con su nombre y nada sale en 0", async () => {
    base({}, { indicadores: { code: "57014", message: "timeout" }, actions: { code: "57014", message: "timeout" }, deliverables: { code: "57014", message: "timeout" } });
    const h = await pagina("/avance", () => import("@/app/(consultor)/empresa/[id]/avance/page"));
    expect(h).toContain("No se pudieron leer los indicadores");
    expect(h).toContain("No se pudo leer el plan");
    expect(h).toContain("No se pudieron leer los documentos");
    expect(h).not.toMatch(/>0<small>de 7/);
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("sin tipo de trabajo: lo dice arriba y lleva a la ficha de trabajo del Diagnóstico", async () => {
    const b = base();
    b.tablas.companies![0]!.tipo_trabajo = null;
    const h = await pagina("/avance", () => import("@/app/(consultor)/empresa/[id]/avance/page"));
    expect(h).toContain("Falta elegir el tipo de trabajo");
    expect(h).toContain(`href="/empresa/${EMP}#ficha"`);
    expect(h).toContain("Elige el tipo de trabajo para ver sus etapas y sus compuertas.");
  });
});

// ————————————————————————————————————— EXPEDIENTE —————————————————————————————————————

describe("Expediente: lo que se levantó de la empresa y su administración", () => {
  beforeAll(async () => {
    await import("@/app/(consultor)/empresa/[id]/expediente/page");
  }, 120_000);

  it("la pista de lo confirmado, fuentes en tres estados, la entrevista y las personas entrevistadas", async () => {
    base({
      company_stats: [{ company_id: EMP, afirmaciones: 48, confirmadas: 31, contradichas: 2, sin_verificar: 15, hallazgos_por_revisar: 3, fuentes: 9 }],
      sources: [
        { company_id: EMP, estado: "leido" },
        { company_id: EMP, estado: "leido" },
        { company_id: EMP, estado: "leyendo" },
        { company_id: EMP, estado: "error" },
      ],
      participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", puesto: "Dueña", rol: "dueno", token_expira_at: null, token_revocado_at: null, token_canjeado_at: null, created_at: "2026-10-01T10:00:00.000Z" }],
      interview_sessions: [{ id: "se1", company_id: EMP, tipo: "empresa_dueno", estado: "en_curso", participant_id: "pa1", bloques_cubiertos: [] }],
      interview_responses: [
        { session_id: "se1", bloque: null, pregunta: "¿Cuántas personas trabajan contigo?", respuesta: "Seis" },
        { session_id: "se1", bloque: null, pregunta: "¿Quién cierra la caja el sábado?", respuesta: null },
      ],
      claims: [{ company_id: EMP, pilar: "procesos", estado: "confirmado" }],
    });
    const h = await pagina("/expediente", () => import("@/app/(consultor)/empresa/[id]/expediente/page"));
    expect(h.startsWith('<div class="tablero">')).toBe(true);
    // Arriba y en la tarjeta «Fuentes», el mismo número: el de la lectura de hoy (4 filas), no el de company_stats (9),
    // que es una vista materializada y puede ir atrasada.
    expect(h).toContain("4 fuentes · 31 de 48 afirmaciones confirmadas");
    expect(h).toContain('<span class="grande">4</span> fuentes');
    expect(h).not.toContain("9 fuentes");
    // La conversación en palabras, no con el código de la base.
    expect(h).toContain("Tu empresa · en curso");
    expect(h).not.toContain("empresa_dueno");
    expect(h).toMatch(/<div class="pista" aria-hidden="true"><span class="lleno"/);
    expect(h).toContain('class="resto"');
    // «31 de 48» y su barra, una sola vez: el titular lo dice y la tarjeta «Afirmaciones» dice lo que falta (revisión del
    // 16-10-2026: los dos repetían la cifra, con dos barras).
    expect(h.match(/31 de 48/g) ?? []).toHaveLength(1);
    expect(h.match(/class="pista"/g) ?? []).toHaveLength(1);
    expect(h).toContain('<span class="grande">17</span> por confirmar');
    expect(h).toContain("2 leídas");
    expect(h).toContain("1 leyendo");
    expect(h).toContain("1 con error");
    expect(h).toContain("Personas entrevistadas");
    expect(h).toContain("Rosa Ejemplo");
    expect(h).toContain("Parado en: «¿Quién cierra la caja el sábado?»");
    expect(h).toContain("Dónde profundizar");
    expect(h).toContain("Perú");
    expect(h).toContain("Cumplimiento legal (Perú) · 6 trabajadores");
    expect(h).toContain("184k / 2000k");
    for (const sub of ["/fuentes", "/afirmaciones", "/entrevista", "/dia", "/configuracion"]) expect(h).toContain(`href="/empresa/${EMP}${sub}"`);
    expect(h).not.toMatch(EMOJI);
  });

  it("sin nada levantado: cada bloque dice «sin dato» o «todavía» con su nombre, sin ceros inventados", async () => {
    base();
    const h = await pagina("/expediente", () => import("@/app/(consultor)/empresa/[id]/expediente/page"));
    expect(h).toContain("Fuentes y afirmaciones: sin dato");
    expect(h).toContain("Fuentes: todavía ninguna");
    expect(h).toContain("Entrevista: todavía sin sesiones");
    expect(h).not.toMatch(/class="pista"/);
    expect(h).not.toMatch(CERO_POR_CIENTO);
  });
});

// ————————————————————————————————————— ESTRUCTURA —————————————————————————————————————

describe("Estructura: el resumen de procesos arriba y la hoja de siempre debajo", () => {
  const conteo = {
    esperados: 12, dibujados: 5, conResponsable: 3, escritos: 2, medidos: 1, nivel: 0.9, nombreNivel: "Sin mapear",
    lista: [{ nivel: 4 }, { nivel: 3 }, { nivel: 2 }, { nivel: 1 }, { nivel: 1 }, { nivel: 0 }],
  };

  it("«5 de 12 procesos dibujados», nivel medio y la barra: medidos, escritos, sin escribir y, rayado, por dibujar", async () => {
    const { ResumenProcesos, partesProcesos } = await import("@/components/procesos/ResumenProcesos");
    expect(partesProcesos(conteo)).toEqual([
      { n: 1, texto: "medidos", tipo: "s1" },
      { n: 1, texto: "escritos", tipo: "s2" },
      { n: 3, texto: "dibujados sin escribir", tipo: "s4" },
      { n: 7, texto: "por dibujar", tipo: "s3" },
    ]);
    const h = renderToStaticMarkup(createElement(ResumenProcesos, { conteo, base: "/empresa/e1" }));
    expect(h.startsWith('<div class="tablero">')).toBe(true);
    expect(h).toContain("5<small>de 12 procesos dibujados</small>");
    expect(h).toContain(`nivel medio ${(0.9).toLocaleString("es-PE")} de 5 (Sin mapear)`);
    expect(h).toContain('class="segmentos"');
    expect(h).toContain('<i class="rayita"></i>7 por dibujar');
    expect(h).toContain('href="/empresa/e1/madurez"');
  });

  it("sin procesos: «Todavía no hay procesos dibujados»; sin mapa: «No se pudo leer», que no es lo mismo", async () => {
    const { ResumenProcesos } = await import("@/components/procesos/ResumenProcesos");
    const vacio = renderToStaticMarkup(createElement(ResumenProcesos, { conteo: { ...conteo, esperados: 0, dibujados: 0, conResponsable: 0, escritos: 0, medidos: 0, nivel: null, nombreNivel: null, lista: [] }, base: "/empresa/e1" }));
    expect(vacio).toContain('<p class="sin-dato" style="margin-top:14px">Todavía no hay procesos dibujados</p>');
    const fallo = renderToStaticMarkup(createElement(ResumenProcesos, { conteo: null, base: "/empresa/e1" }));
    expect(fallo).toContain("No se pudo leer el mapa de procesos");
    expect(fallo).not.toContain("Todavía no hay procesos dibujados");
  });

  it("la página de Procesos pinta el resumen arriba y lo de siempre en .hoja-suelta, sin cambiar", () => {
    const pag = leer("app/(consultor)/empresa/[id]/procesos/page.tsx");
    expect(pag).toMatch(/conteoProcesos\(mapa\)/);
    expect(pag).toMatch(/mapaDe\(id\)/);
    const resumen = pag.indexOf("<ResumenProcesos");
    const hoja = pag.indexOf('<div className="hoja-suelta">');
    expect(resumen).toBeGreaterThan(-1);
    expect(hoja).toBeGreaterThan(resumen);
    for (const pieza of ["<ProcesosLista", "<SubirProceso", "<ImportarProcesos"]) expect(pag.indexOf(pieza)).toBeGreaterThan(hoja);
    // Revisión del 16-10-2026: las tres formas de agregar, juntas y plegadas al final; lo que falta dibujar, una sola vez.
    const plegado = pag.indexOf('<details className="plegado agregar-procesos">');
    expect(plegado).toBeGreaterThan(pag.indexOf("<ProcesosLista"));
    for (const pieza of ["<NuevoProceso", '<SubirProceso companyId={id} base={base} porDibujar={conArchivo} archivosLeidos={archivosLeidos} parte="formulario"', '<ImportarProcesos companyId={id} enLista={sinArchivo} base={base} parte="formulario"']) {
      expect(pag.indexOf(pieza), pieza).toBeGreaterThan(plegado);
    }
    expect(pag.match(/parte="lista"/g) ?? []).toHaveLength(2);
    expect(pag.indexOf('parte="lista"')).toBeLessThan(plegado);
  });

  it("cada proceso dibujado es una tarjeta a todo lo ancho: qué se hace, quién responde, pasos, nivel y «Ver el flujo»; «Quitar» en su menú", async () => {
    const { ProcesosLista } = await import("@/components/ProcesosLista");
    const procesos = [
      { id: "p1", nombre: "Cómo se atiende un pedido por WhatsApp", area: "Ventas", version: "as_is", origen: "conversado", padre_id: null, nodos: 6, tiene_tobe: false, tiene_sop: true },
      { id: "p2", nombre: "Corte y costura de un lote", area: null, version: "as_is", origen: "generado_ia", padre_id: null, nodos: 4, tiene_tobe: false, tiene_sop: false },
      { id: "p3", nombre: "Compra de tela", area: "Compras", version: "sin_dibujar", origen: "importado", padre_id: null, nodos: 0, tiene_tobe: false, tiene_sop: false },
    ];
    const detalle = {
      p1: { nivel: 3, nombreNivel: "Escrito", responsable: "Vendedora de tienda", inicio: "Llega el mensaje", resultado: "Pedido anotado" },
      p2: { nivel: 1, nombreNivel: "Contado", responsable: null, inicio: null, resultado: null },
    };
    const h = renderToStaticMarkup(createElement(ProcesosLista, { companyId: EMP, procesos, base: "/empresa/e1/procesos", detalle }));
    expect(h).not.toContain("<table");
    expect(h).toContain("Procesos dibujados (2)");
    expect(h.match(/class="proceso-tarjeta"/g) ?? []).toHaveLength(2);
    expect(h).toContain("De «Llega el mensaje» a «Pedido anotado»");
    expect(h).toContain("Ventas · responde Vendedora de tienda · 6 pasos · dibujado a mano");
    expect(h).toContain("Sin área · sin responsable · 4 pasos · dibujado por IA");
    expect(h).toContain(">Nivel 3 · Escrito<");
    expect(h).toContain(">Manual<");
    expect(h.match(/>Ver el flujo</g) ?? []).toHaveLength(2);
    expect(h).toMatch(/<details class="menu-acciones no-imprimir"><summary aria-label="Más acciones de «Cómo se atiende un pedido por WhatsApp»"/);
    expect(h).toContain(">Quitar este proceso<");
    // Lo importado sin dibujar no se lista aquí: lo lista el importador, una sola vez.
    expect(h).not.toContain("Compra de tela");
    expect(h).not.toContain("De la lista de la empresa, sin dibujar");
    // Ningún «Quitar» subrayado a la vista, con el mismo peso que abrir.
    expect(h).not.toMatch(/text-decoration:underline[^>]*>Quitar/);
  });

  it("el organigrama tiene su resumen arriba: puestos, ocupados y vacantes, niveles, y cuántas reglas del estudio cumple", async () => {
    const { ResumenOrganigrama } = await import("@/components/consultor/ResumenOrganigrama");
    const { estudioOrganigrama } = await import("@/lib/rules/organigrama");
    const puestos = [
      { id: "o1", nombre: "Dueña y gerente", persona: "Rosa Ejemplo", reporta_a: null },
      { id: "o2", nombre: "Jefa de taller", persona: "Lucía Ejemplo", reporta_a: "o1" },
      { id: "o3", nombre: "Vendedora de tienda", persona: "Ana Ejemplo", reporta_a: "o1" },
      { id: "o4", nombre: "Costurera", persona: null, reporta_a: "o2" },
    ];
    const estudio = estudioOrganigrama(puestos);
    const cumplen = estudio.filter((r) => r.cumple).length;
    const h = renderToStaticMarkup(createElement(ResumenOrganigrama, { puestos, estudio }));
    expect(h.startsWith('<div class="tablero no-imprimir">')).toBe(true);
    expect(h).toContain('<span class="grande">4</span> puestos en 3 niveles');
    expect(h).toContain('<i class="l1"></i>3 ocupados');
    expect(h).toContain('<i class="l4"></i>1 vacante');
    expect(h).toContain(`Cumple <span class="grande">${cumplen}</span> de ${estudio.length} reglas`);
    expect(renderToStaticMarkup(createElement(ResumenOrganigrama, { puestos: [], estudio: [] }))).toContain("Todavía no hay puestos");
    // La página lo pone arriba y lo de siempre debajo, en su hoja.
    const pag = leer("app/(consultor)/empresa/[id]/organigrama/page.tsx");
    expect(pag.indexOf("<ResumenOrganigrama")).toBeGreaterThan(-1);
    expect(pag.indexOf('<div className="hoja-suelta">')).toBeGreaterThan(pag.indexOf("<ResumenOrganigrama"));
    expect(pag.indexOf("<Organigrama")).toBeGreaterThan(pag.indexOf('<div className="hoja-suelta">'));
  });
});

// ————————————————————————————————————— INDICADORES —————————————————————————————————————

describe("Indicadores: su propia vista, con la línea arriba y el tablero de siempre debajo", () => {
  it("la tarjeta de Indicadores es una sola pieza (ResumenIndicadores): la abre la vista Indicadores y la resume Avance", () => {
    const kpis = leer("app/(consultor)/empresa/[id]/kpis/page.tsx");
    const tablero = kpis.indexOf('<div className="tablero">');
    expect(tablero).toBeGreaterThan(-1);
    expect(kpis.indexOf("<ResumenIndicadores")).toBeGreaterThan(tablero);
    expect(kpis.indexOf('<div className="hoja-suelta">')).toBeGreaterThan(kpis.indexOf("<ResumenIndicadores"));
    expect(kpis.indexOf("<TableroKpis")).toBeGreaterThan(kpis.indexOf('<div className="hoja-suelta">'));
    // En la propia vista, la flecha no lleva a sí misma; en Avance, sí lleva a la vista.
    expect(kpis).not.toMatch(/<ResumenIndicadores[^>]*\bir=/);
    expect(leer("app/(consultor)/empresa/[id]/avance/page.tsx")).toMatch(/<ResumenIndicadores[^>]*ir=\{`\$\{base\}\/kpis`\}/);
  });
});

// ————————————————————————————————————— SIN EMOJI —————————————————————————————————————

describe("sin emoji ni palabras de prueba en lo nuevo", () => {
  const ARCHIVOS = [
    "lib/vistas-empresa.ts",
    "components/consultor/TabsEmpresa.tsx",
    "components/consultor/EnEstaVista.tsx",
    "components/consultor/MenuAdministrar.tsx",
    "components/consultor/SeguimientoConversacion.tsx",
    "components/procesos/ResumenProcesos.tsx",
    "components/consultor/ResumenOrganigrama.tsx",
    "components/base/MenuAcciones.tsx",
    "components/ProcesosLista.tsx",
    "components/navegacion/BarraRuta.tsx",
    "components/kpis/ResumenIndicadores.tsx",
    "app/(consultor)/empresa/[id]/layout.tsx",
    "app/(consultor)/empresa/[id]/avance/page.tsx",
    "app/(consultor)/empresa/[id]/expediente/page.tsx",
    "app/(consultor)/empresa/[id]/procesos/page.tsx",
    "design/vistas.css",
  ];
  it.each(ARCHIVOS)("%s", (a) => {
    const s = leer(a);
    expect(s).not.toMatch(EMOJI);
    // Sombras, degradados y desenfoque solo en src/design (tests/visual.test.ts lo vigila en todo; aquí, en lo nuevo).
    if (!a.startsWith("design/")) expect(s).not.toMatch(/box-?[sS]hadow|gradient\(|backdrop-filter/);
  });

  it("las páginas nuevas son dinámicas, como las demás de la empresa", () => {
    for (const p of ["avance", "expediente"]) expect(leer(`app/(consultor)/empresa/[id]/${p}/page.tsx`)).toMatch(/export const dynamic = "force-dynamic";/);
  });
});

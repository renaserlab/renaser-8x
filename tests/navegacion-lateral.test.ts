/**
 * LA NAVEGACIÓN VA AL COSTADO Y ARRIBA VA EL AVANCE (pedido de Kelin, 16-10-2026).
 *
 * «Prefiero una navegación al costado, no arriba, que se vea la barra lateral o pueda ocultarla. Arriba la barra
 * de proceso y avance con cada empresa.» Esta prueba fija las piezas de esa decisión:
 * — una sola barra lateral (Lateral.tsx) para la consultora y para el cliente: se oculta a riel en escritorio y
 *   entra como cajón en el celular; recuerda la elección en el navegador sin romperse si no puede guardar;
 * — los dos marcos (layouts) con la barra a la izquierda y la columna de contenido;
 * — la barra de avance arriba: en /empresa/[id] antes de las secciones de la empresa, y en el portal antes del
 *   contenido; un % que no se pudo calcular se dice «sin medir», nunca «0 %», y lo que no se pudo leer va rayado.
 *
 * 16-10-2026, más tarde: la empresa pasó de tres capas de pestañas a cinco vistas y el Expediente (TabsEmpresa con
 * `vistas={VISTAS}`), y el portal, a cinco destinos nuevos: «Mi empresa» (/portal/hoy) vive ahora dentro de «Tu
 * diagnóstico», y lo de «Tus números» (lo que vende, gastos, historia, cobros) dentro de su destino.
 *
 * NOTA DE ALCANCE: lee el código fuente y pinta los componentes en Node con renderToStaticMarkup. No demuestra
 * el comportamiento en un navegador (abrir, cerrar, foco, Escape): eso no se vio todavía en pantalla.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvanceRuta, CriterioEvaluado, EtapaEvaluada } from "@/lib/ruta";

const estado = vi.hoisted(() => ({ ruta: "/portal/hoy" }));
vi.mock("next/navigation", () => ({ usePathname: () => estado.ruta }));

import { BarraRuta } from "@/components/navegacion/BarraRuta";
import { CLAVE_LATERAL } from "@/components/navegacion/Lateral";
import { NavCliente } from "@/components/cliente/NavCliente";

const SRC = path.resolve(__dirname, "../src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const lateral = leer("components/navegacion/Lateral.tsx");
const navConsultor = leer("components/consultor/NavConsultor.tsx");
const navCliente = leer("components/cliente/NavCliente.tsx");
const layoutConsultor = leer("app/(consultor)/layout.tsx");
const layoutCliente = leer("app/(cliente)/layout.tsx");
const layoutEmpresa = leer("app/(consultor)/empresa/[id]/layout.tsx");
// Desde el 17-10-2026 (sistema «noche y perla») el marco, la barra lateral y la ruta viven en src/design/marco.css.
const css = leer("design/marco.css");

/** Un «0 %» que no sea parte de otro número (10 %, 40 %…). */
const CERO_POR_CIENTO = /(^|[^\d])0\s?%/;

describe("una sola barra lateral, para la consultora y para el cliente", () => {
  it("las dos navegaciones montan <Lateral> y la píldora flotante ya no existe", () => {
    for (const [nombre, fuente] of [["NavConsultor", navConsultor], ["NavCliente", navCliente]] as const) {
      expect(fuente, `${nombre} no monta la barra lateral`).toMatch(/<Lateral\b/);
      expect(fuente, `${nombre} sigue pintando la píldora`).not.toMatch(/className="pildora"/);
    }
  });

  it("Lateral es de cliente y lleva lo que hace falta para ocultarse, abrirse y cerrarse", () => {
    expect(lateral.startsWith(`"use client"`)).toBe(true);
    expect(CLAVE_LATERAL).toBe("8x.lateral");
    expect(lateral).toMatch(/export const CLAVE_LATERAL = "8x\.lateral"/);
    expect(lateral).toMatch(/aria-controls="lateral"/);
    expect(lateral).toMatch(/aria-expanded=\{/);
    expect(lateral).toMatch(/aria-pressed=\{/);
    expect(lateral).toMatch(/"Ocultar el menú"/);
    expect(lateral).toMatch(/"Mostrar el menú"/);
    expect(lateral).toMatch(/"Escape"/);
    expect(lateral).toMatch(/data-estado=\{/);
    expect(lateral).toMatch(/data-movil=\{/);
    expect(lateral).toMatch(/id="lateral"/);
    expect(lateral, "el telón cierra el menú del celular").toMatch(/className="telon[^"]*" aria-label="Cerrar el menú"/);
    // Mientras el cajón está abierto el cuerpo no se desplaza, y se restaura al cerrar.
    expect(lateral).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(lateral).toMatch(/document\.body\.style\.overflow = desplazamiento/);
  });

  it("el navegador privado no la rompe: localStorage se toca solo dentro de try", () => {
    const bloquesTry = [...lateral.matchAll(/try \{([\s\S]*?)\} catch/g)].map((m) => m[1]!);
    expect(bloquesTry.some((b) => /localStorage\.getItem\(CLAVE_LATERAL\)/.test(b)), "se lee dentro de try").toBe(true);
    expect(bloquesTry.some((b) => /localStorage\.setItem\(CLAVE_LATERAL/.test(b)), "se escribe dentro de try").toBe(true);
    let fuera = lateral;
    for (const b of bloquesTry) fuera = fuera.replace(b, "");
    expect(fuera, "hay un acceso a localStorage fuera de try").not.toMatch(/localStorage\.(getItem|setItem|removeItem|clear)\(/);
    // Ningún catch vacío: cada uno dice por qué no hay nada que hacer.
    expect(lateral).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  it("el portal no lleva enlaces sueltos: solo las listas de siempre", () => {
    expect(navCliente).toMatch(/PRINCIPALES\.map\(/);
    expect(navCliente).toMatch(/enlaces\.map\(/);
    expect(navCliente).toMatch(/avisos\?: Record<string, number>/);
  });
});

describe("los dos marcos: barra a la izquierda, columna con el contenido", () => {
  it("los layouts de la consultora y del cliente usan .marco-app y <main className=\"contenido-app\">", () => {
    for (const [nombre, fuente] of [["consultora", layoutConsultor], ["cliente", layoutCliente]] as const) {
      expect(fuente, `layout de ${nombre}`).toMatch(/className="marco-app"/);
      expect(fuente, `layout de ${nombre}`).toMatch(/className="columna-app"/);
      expect(fuente, `layout de ${nombre}`).toMatch(/<main className="contenido-app/);
    }
  });

  it("la barra de avance va arriba: en la empresa antes de sus secciones, en el portal antes del contenido", () => {
    const barra = layoutEmpresa.indexOf("<BarraRuta");
    expect(barra, "el layout de la empresa no pinta <BarraRuta>").toBeGreaterThan(-1);
    expect(barra).toBeLessThan(layoutEmpresa.indexOf("<TabsEmpresa"));
    expect(layoutEmpresa).toMatch(/para="consultora"/);
    expect(layoutEmpresa).toMatch(/avanceDeEmpresa\(id\)/);
    const barraCliente = layoutCliente.indexOf("<BarraRutaCliente");
    expect(barraCliente, "el layout del portal no pinta <BarraRutaCliente>").toBeGreaterThan(-1);
    expect(barraCliente).toBeLessThan(layoutCliente.lastIndexOf("<main"));
  });

  // Revisión del 16-10-2026: la columna fija de vistas junto a la barra lateral era una columna de más. Las vistas van en
  // una barra horizontal bajo la cabecera, sus pantallas debajo, y la pantalla a todo lo ancho (sin rejilla de dos columnas).
  it("la empresa: las vistas en una barra bajo la cabecera, «En esta vista» debajo y la pantalla a todo lo ancho", () => {
    expect(layoutEmpresa).toMatch(/className="empresa-navegacion[^"]*"/);
    expect(layoutEmpresa).not.toMatch(/className="empresa-rejilla"/);
    expect(layoutEmpresa).toMatch(/<TabsEmpresa[^>]*vistas=\{VISTAS\}/);
    const navegacion = layoutEmpresa.indexOf('className="empresa-navegacion');
    expect(navegacion).toBeGreaterThan(layoutEmpresa.indexOf("</header>"));
    expect(layoutEmpresa.indexOf("<TabsEmpresa")).toBeGreaterThan(navegacion);
    expect(layoutEmpresa.indexOf("<EnEstaVista")).toBeGreaterThan(layoutEmpresa.indexOf("<TabsEmpresa"));
    expect(layoutEmpresa.indexOf("{children}")).toBeGreaterThan(layoutEmpresa.indexOf("<EnEstaVista"));
    // La ruta, arriba y en una sola línea; la barra entera vive en Avance.
    expect(layoutEmpresa).toMatch(/<BarraRuta[^>]*\bcompacta\b/);
  });
});

describe("el estilo vive en marco.css", () => {
  it("marco, riel, cajón bajo 1024 px, movimiento reducido, rayado e impresión", () => {
    expect(css).toMatch(/\.marco-app\b/);
    expect(css).toMatch(/grid-template-columns: var\(--ancho-lateral, 248px\) minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.marco-app:has\(> \.lateral\[data-estado="riel"\]\) \{ --ancho-lateral: 72px; \}/);
    const movil = css.slice(css.indexOf("@media (max-width: 1023px)"));
    expect(movil, "el cajón del celular").toMatch(/\.lateral\[data-movil="abierta"\]/);
    expect(movil).toMatch(/transform: translateX\(-104%\)/);
    const reducido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducido, "sin movimiento para quien lo pidió").toMatch(/^[^}]*\.lateral/);
    expect(css).toMatch(/\.sin-medir \{ background: var\(--rayado\); \}/);
    const imprimir = css.slice(css.lastIndexOf("@media print {\n  .barra-movil"));
    expect(imprimir).toMatch(/\.lateral/);
    expect(imprimir).toMatch(/\.barra-ruta/);
  });
});

// ———————————————————————————————————— BARRA DE AVANCE (render) ————————————————————————————————————

const criterio = (c: Partial<CriterioEvaluado> & Pick<CriterioEvaluado, "clave" | "texto">): CriterioEvaluado => ({
  fuente: "medido",
  estado: "falta",
  detalle: "",
  ...c,
});

const etapa = (e: Partial<EtapaEvaluada> & Pick<EtapaEvaluada, "clave" | "nombre" | "desdeDia" | "hastaDia">): EtapaEvaluada => ({
  nombreDueno: e.nombre,
  criterios: [],
  hechos: 0,
  medibles: 0,
  sinMedir: 0,
  pct: null,
  compuerta: { clave: "c30", nombre: "Estructura en marcha", veredicto: null, sugerido: "rojo" },
  estado: "por_venir",
  ...e,
});

const faltan = [
  criterio({ clave: "numeros", texto: "Los 9 números", estado: "sin_medir" }),
  criterio({ clave: "compromiso", texto: "Compromiso del director", fuente: "marca" }),
];

const avanceSinMedir: AvanceRuta = {
  tipo: "estructurar",
  inicio: "2026-10-01",
  dia: 9,
  etapas: [
    etapa({
      clave: "diagnostico",
      nombre: "Diagnóstico y plan",
      nombreDueno: "Conocer tu empresa",
      desdeDia: 1,
      hastaDia: 7,
      criterios: faltan,
      sinMedir: 1,
      pct: null,
      estado: "en_curso",
      compuerta: { clave: "c5", nombre: "La Firma", veredicto: null, sugerido: "no_se_pudo_leer" },
    }),
    etapa({ clave: "estructurar", nombre: "Implementar la estructura", nombreDueno: "Ordenar", desdeDia: 8, hastaDia: 30 }),
  ],
  actual: "diagnostico",
  aviso: "Va 2 días más de lo previsto para esta etapa",
  faltaParaLaCompuerta: faltan,
};

const pintar = (avance: AvanceRuta | null) => renderToStaticMarkup(createElement(BarraRuta, { avance, para: "consultora", enlace: "/empresa/e1#ruta" }));

describe("la barra de avance de la consultora", () => {
  it("un % que no se pudo calcular dice «sin medir», nunca «0 %», y lo que no se pudo leer va rayado", () => {
    const html = pintar(avanceSinMedir);
    expect(html).toContain("sin medir");
    expect(html, "pintó «0 %» para un % que no se pudo calcular").not.toMatch(CERO_POR_CIENTO);
    expect(html).toContain("no se pudo leer");
    expect(html).toMatch(/class="pista sin-medir"/);
    expect(html).toMatch(/class="senal sin-medir"/);
  });

  it("una compuerta que 8X no pudo leer nunca sale sugerida en verde", () => {
    const html = pintar(avanceSinMedir);
    expect(html).toContain("«La Firma»");
    expect(html).not.toContain("sugiere verde");
    expect(html).toContain("8X no sugiere color");
  });

  it("el calendario informa, no bloquea: «Día 9 · la etapa prevé hasta el día 7»", () => {
    const html = pintar(avanceSinMedir);
    expect(html).toContain("Día 9 · la etapa prevé hasta el día 7");
    expect(html).toMatch(/data-estado="en_curso"/);
    expect(html).toMatch(/data-estado="por_venir"/);
    // El ancho de cada tramo sale de sus días: 7 el diagnóstico, 23 la estructura.
    expect(html).toMatch(/flex-grow:7/);
    expect(html).toMatch(/flex-grow:23/);
    expect(html).toContain('href="/empresa/e1#ruta"');
  });

  it("un cero medido sí es cero: se pinta «0 %»", () => {
    const conCero: AvanceRuta = {
      ...avanceSinMedir,
      etapas: [{ ...avanceSinMedir.etapas[0]!, pct: 0, medibles: 4, sinMedir: 0 }, avanceSinMedir.etapas[1]!],
    };
    expect(pintar(conCero)).toMatch(CERO_POR_CIENTO);
  });

  it("sin avance (la base no tiene la ruta) lo dice en una línea", () => {
    expect(pintar(null)).toContain("La ruta todavía no está habilitada en esta base.");
  });

  it("si la lectura falló lo dice como fallo, con qué hacer, y no lo disfraza de «no habilitada»", () => {
    const html = renderToStaticMarkup(createElement(BarraRuta, { avance: null, fallo: true, para: "consultora" }));
    expect(html).toContain("No se pudo leer el avance de la ruta");
    expect(html).toContain("Vuelve a cargar la página");
    expect(html).not.toContain("no está habilitada");
    expect(layoutEmpresa, "el layout no avisa del fallo").toMatch(/fallo=\{avance === "fallo"\}/);
  });

  it("sin tipo de trabajo dice qué falta y dónde se completa", () => {
    const html = pintar({ ...avanceSinMedir, tipo: null, etapas: [], actual: null, dia: null, aviso: "Falta elegir el tipo de trabajo", faltaParaLaCompuerta: [] });
    expect(html).toContain("Falta elegir el tipo de trabajo");
    expect(html).toContain('href="/empresa/e1#ruta"');
    expect(html).not.toMatch(CERO_POR_CIENTO);
  });
});

describe("la barra lateral del portal, pintada", () => {
  estado.ruta = "/portal/hoy";
  const html = renderToStaticMarkup(
    createElement(NavCliente, {
      enlaces: [
        ["/portal", "Inicio"],
        ["/portal/diagnostico", "Tu diagnóstico"],
      ],
      empresa: "Jeans del Valle (ficticia)",
      avisos: { "/portal": 2 },
    }),
  );

  it("sale abierta y con el cajón cerrado (lo guardado se lee en el navegador, no en el servidor)", () => {
    expect(html).toMatch(/<aside id="lateral"[^>]*data-estado="abierta"/);
    expect(html).toMatch(/data-movil="cerrada"/);
    expect(html).toMatch(/aria-controls="lateral"/);
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).not.toMatch(/class="telon/);
  });

  it("marca el destino de la pantalla abierta y cuenta lo que pidió la consultora", () => {
    // En /portal/hoy («Todo lo que encontramos») el destino es «Tu diagnóstico».
    expect(html).toMatch(/aria-current="page"[^>]*aria-label="Tu diagnóstico"/);
    expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    expect(html).toContain('aria-label="2 pedidos de tu consultora"');
    expect(html).toContain('aria-label="Inicio, 2 pedidos de tu consultora"');
  });
});

describe("«Tus números» muestra lo que le toca hoy al dueño, no todo lo que existe", () => {
  it("costos, historia y cobros solo con su sección abierta o con algo guardado; sin saber, no se esconde nada", async () => {
    const { pantallasOcultas } = await import("@/lib/secciones");
    const nada = { costos: false, historia: false, cobros: false };
    expect(pantallasOcultas([], nada).sort()).toEqual(["/portal/cobros", "/portal/costos", "/portal/historia"]);
    expect(pantallasOcultas(["costos"], nada).sort()).toEqual(["/portal/cobros", "/portal/historia"]);
    // «Lo que vendes» abierta: sus tres preguntas de sí o no se contestan en «Cobros y mercadería».
    expect(pantallasOcultas(["productos"], nada).sort()).toEqual(["/portal/costos", "/portal/historia"]);
    expect(pantallasOcultas(["credito"], nada)).not.toContain("/portal/cobros");
    // Con algo guardado se ve aunque esté cerrada: lo suyo no se esconde.
    expect(pantallasOcultas([], { costos: true, historia: true, cobros: true })).toEqual([]);
    expect(pantallasOcultas(null, nada)).toEqual([]);
    expect(pantallasOcultas([], null)).toEqual([]);
  });

  it("la fila no pinta lo oculto; el layout le pasa lo que hoy no toca", async () => {
    // Costos, historia y cobros viven bajo «Tus números»: la fila se pinta en su destino.
    estado.ruta = "/portal/numeros";
    const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
    const todo = renderToStaticMarkup(createElement(EnEstaSeccion, {}));
    for (const href of ["/portal/costos", "/portal/historia", "/portal/cobros"]) expect(todo).toContain(`href="${href}"`);
    const hoy = renderToStaticMarkup(createElement(EnEstaSeccion, { ocultar: ["/portal/costos", "/portal/historia", "/portal/cobros"] }));
    for (const href of ["/portal/costos", "/portal/historia", "/portal/cobros"]) expect(hoy).not.toContain(`href="${href}"`);
    expect(hoy).toContain('href="/portal/producto"');
    expect(layoutCliente).toMatch(/pantallasOcultas\(abiertasAhora, negocio\?\.guardado \?\? null\)/);
    expect(layoutCliente).toMatch(/<EnEstaSeccion variasEmpresas=\{variasEmpresas\} ocultar=\{ocultar\} \/>/);
  });
});

/**
 * EL PORTAL DEL DUEÑO EN CINCO DESTINOS · «TU DIAGNÓSTICO» Y «TUS NÚMEROS», PINTADOS EN NODE (16-10-2026).
 *
 * Kelin: «hace rato estaba simple y fácil: diagnóstico, qué hay en números, indicadores y el avance… son muchas
 * pestañas… no me quiero ni imaginar qué tiene el cliente en su ventana». Lo que se fija:
 *  - la barra del dueño tiene cinco destinos con su ícono (Inicio, Tu diagnóstico, Tus números, Tus procesos, Tu
 *    plan), y cada pantalla de siempre sigue abriendo dentro de uno de ellos;
 *  - «Tu diagnóstico» pinta los cuatro bloques con sus títulos simples, sin palabras de consultoría, sin dimensiones,
 *    sin nada de una ficha en borrador y sin un «S/ 0» inventado;
 *  - «Corregir este dato» solo con «Confirmar lo que encontramos» o «Los números que faltan» abiertas; cerrada, las
 *    cifras se ven con TEXTO_SECCION_CERRADA y sin botones; la consultora «como el empresario», sin botones;
 *  - sin diagnóstico publicado: «Tu consultora está terminando tu diagnóstico»;
 *  - «Tus números» lleva el tablero arriba y el formulario de siempre debajo, en su hoja.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts; la sesión, el contexto del portal y lo que ya ve el dueño (empresaHoy) los pone la
 * prueba. Las pantallas se pintan con renderToStaticMarkup: nadie las abrió en un navegador y lo que pasa al tocar un
 * botón no se ejecuta aquí (eso lo prueba tests/correccion-dato.test.ts contra la ruta). La empresa es FICTICIA.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown, ruta: "/portal/diagnostico", hoy: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
vi.mock("@/lib/hoy", () => ({ empresaHoy: async () => estado.hoy }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => estado.ruta,
  redirect: () => {
    throw new Error("redirect");
  },
}));

import { TEXTO_SECCION_CERRADA } from "@/lib/secciones";
import { huellaDe } from "@/lib/incongruencias";
import { NOMBRE_DIMENSION, NOMBRE_DIMENSION_CLIENTE } from "@/lib/ficha-direccion";

vi.setConfig({ testTimeout: 60_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Dueña" };
const PARTICIPANTE = { id: "00000000-0000-4000-8000-0000000000a2", rol: "cliente", nombre: "Equipo" };
const CONSULTORA = { id: "00000000-0000-4000-8000-0000000000c1", rol: "consultor", nombre: "Consultora" };

/** Lo que el dueño nunca lee: palabras del método y de la base (la misma vara de tests/pantallas-entrar-hoy.test.ts). */
const PROHIBIDAS = /contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|decisi[oó]n|pilar|INTERNO/i;
/** Un cero en dinero que nadie dijo: «S/ 0» seguido de algo que no es un decimal. */
const CERO_INVENTADO = /S\/\s?0(?![.,]?\d)/;

const SECRETO_BORRADOR = "Solo ella firma los cheques del banco";
const DE_LA_ACORDADA = "Si no estoy, no se compra tela";

const item = (id: string, texto: string): Fila => ({ id, texto, tipo: "declaracion", origen: "consultor", fuentes: [], fecha: null, revisado_por: CONSULTORA.id });
const conteo = { total: 5, con_dueno: 3, decide_solo: 1, nombres_con_dueno: [], nombres_decide_solo: [], texto: "decide sola en 1 de 5 procesos" };
const dimensionesLlenas = Object.fromEntries(Object.keys(NOMBRE_DIMENSION).map((k) => [k, { que_se_detiene: "Todo se para", podria_delegarse: null, capacidad_falta: null, aporta_valor: null, nota: null, origen: "consultor", revisado_por: CONSULTORA.id }]));

const metrica = (n: number, clave: string, valor: number | null, periodo = "2026-09", est = "contado"): Fila => ({
  id: `m${n}`, company_id: EMP, clave, periodo, valor, estado: est, origen: "declarado", valor_texto: null, nota: null, response_id: null, source_id: null, updated_at: "2026-10-10T12:00:00.000Z",
});

/** Lo que le quedó en setiembre (3.000) no cuadra con la cuenta: 41.800 − 20.000 − 8.000 = 13.800. */
const METRICAS: Fila[] = [
  metrica(1, "venta_mes", 39900, "2026-08", "verificado"),
  metrica(2, "venta_mes", 41800),
  metrica(3, "costo_variable_mes", 20000),
  metrica(4, "gasto_fijo_mes", 8000),
  metrica(5, "ganancia_mes", 3000),
  metrica(6, "caja_hoy", 3200, "actual"),
];

const sol = (seccion: string, e: "activa" | "completada" = "activa"): Fila => ({
  id: `s-${seccion}`, company_id: EMP, seccion, nota: null, estado: e, activada_at: "2026-10-15T13:00:00.000Z", completada_at: e === "completada" ? "2026-10-16T13:00:00.000Z" : null,
});

/** Lo que el dueño ya ve en su portal: con diagnóstico publicado (nivel 3 y una conclusión firme) o sin él. */
const HOY_PUBLICADO = {
  nivel: 3, espejo: [], secundarias: [], fortalezas: [], noVes: [],
  restriccion: { id: "h1", titulo: "El precio del jean clásico no cubre la tela de este año", causa: null, impacto: "alto", pilar: "producto", patron: null, preserva: false, recomendacion: null, costo_posible: "Hasta S/ 2,100 al mes", evidencia: [], provisional: false },
};
const HOY_SIN_PUBLICAR = { nivel: 2, espejo: [], secundarias: [], fortalezas: [], noVes: [], restriccion: null };

function base(o: { abiertas?: string[]; extra?: Record<string, Fila[]> } = {}): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", ficha: { personas: "6" }, estado_admision: "admitida", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" }],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }, { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" }],
    company_metricas: METRICAS,
    solicitudes_cliente: (o.abiertas ?? ["corroborar_diagnostico"]).map((s) => sol(s)),
    ficha_direccion: [
      { id: "f-acordada", company_id: EMP, version: 1, estado: "acordada", acordada_at: "2026-10-12T15:00:00.000Z", bloques: {}, dependencia: { procesos: conteo, declaraciones: [item("d1", DE_LA_ACORDADA)], dimensiones: dimensionesLlenas } },
      { id: "f-borrador", company_id: EMP, version: 2, estado: "borrador", bloques: {}, dependencia: { procesos: conteo, declaraciones: [item("d2", SECRETO_BORRADOR)], dimensiones: dimensionesLlenas } },
    ],
    actions: [
      { id: "a1", company_id: EMP, accion: "Subir el precio del jean clásico a S/ 89", estado: "en_ejecucion", prioridad: 1 },
      { id: "a2", company_id: EMP, accion: "Anotar las ventas del sábado", estado: "propuesta", prioridad: 2 },
    ],
    ...(o.extra ?? {}),
  });
  // Lo que la base en memoria no trae y estas lecturas usan: .or/.not (filtros que aquí no filtran) y rpc.
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown>;
    q.or = () => q;
    q.not = () => q;
    return q;
  };
  estado.base = { from, rpc: async () => ({ data: null, error: null }) };
  return b;
}

const como = (u: typeof DUENA, hoy: unknown = HOY_PUBLICADO) => {
  estado.portal = { u, companyId: EMP, empresa: { id: EMP, nombre: "Jeans del Valle (ficticia)", etapa: "diagnostico" }, queFalta: "", paso: 6 };
  estado.hoy = hoy;
};

/** La página, pintada a HTML, y su texto sin etiquetas (para leer frases que cruzan elementos). */
async function pintar(): Promise<{ html: string; texto: string }> {
  const { default: TuDiagnostico } = await import("@/app/(cliente)/portal/diagnostico/page");
  const html = renderToStaticMarkup(await TuDiagnostico());
  return { html, texto: html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ") };
}
const botones = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());

beforeAll(async () => {
  await Promise.all([import("@/app/(cliente)/portal/diagnostico/page"), import("@/app/(cliente)/portal/numeros/page"), import("@/components/cliente/NavCliente")]);
}, 180_000);

// ─────────────────────────── La barra: cinco destinos ───────────────────────────

describe("la barra del dueño: cinco destinos, cada uno con su ícono", () => {
  const SRC = path.resolve(__dirname, "../src");
  const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
  const CINCO: [string, string][] = [
    ["/portal", "Inicio"],
    ["/portal/diagnostico", "Tu diagnóstico"],
    ["/portal/numeros", "Tus números"],
    ["/portal/procesos", "Tus procesos"],
    ["/portal/plan", "Tu plan"],
  ];
  const pares = (codigo: string) => [...codigo.matchAll(/\[\s*"([^"]*)"\s*,\s*"([^"]*)"/g)].map((m) => [m[1]!, m[2]!] as [string, string]);
  const cuerpoDe = (src: string, nombre: string) => src.match(new RegExp(`const ${nombre}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n\\s*\\];`))?.[1] ?? "";

  it("el layout y NavCliente dicen los mismos cinco, en el mismo orden", () => {
    expect(pares(cuerpoDe(leer("app/(cliente)/layout.tsx"), "enlaces"))).toEqual(CINCO);
    expect(pares(cuerpoDe(leer("components/cliente/NavCliente.tsx"), "PRINCIPALES"))).toEqual(CINCO);
  });

  it("pintada en «Todo lo que encontramos», marca «Tu diagnóstico»; cada destino lleva un ícono distinto, nunca un emoji", async () => {
    estado.ruta = "/portal/hoy";
    const { NavCliente } = await import("@/components/cliente/NavCliente");
    const todo = renderToStaticMarkup(createElement(NavCliente, { enlaces: CINCO, empresa: "Jeans del Valle (ficticia)" }));
    // Solo el menú (la marca «8X» también enlaza a Inicio, y no es un destino).
    const html = todo.match(/<nav class="menu-lateral"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const enlaces = [...html.matchAll(/<a [^>]*href="(\/portal[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => CINCO.some(([h]) => h === m[1]));
    expect(enlaces.map((m) => m[1])).toEqual(CINCO.map(([h]) => h));
    const actual = enlaces.find((m) => /aria-current="page"/.test(m[0]!));
    expect(actual?.[1]).toBe("/portal/diagnostico");
    const iconos = enlaces.map((m) => m[2]!.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "");
    expect(iconos.every((s) => s.length > 0), "cada destino con su ícono").toBe(true);
    expect(new Set(iconos).size, "cinco íconos distintos").toBe(5);
    expect(todo).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("cada pantalla de siempre vive bajo un destino; Mi empresa y Tus documentos siguen abriendo, dentro", async () => {
    const { destinoDe, GRUPO } = await import("@/components/cliente/NavCliente");
    const bajo = (d: string) => GRUPO.filter(([, p]) => p === d).map(([s]) => s);
    expect(bajo("/portal")).toEqual(["/portal/entrada", "/portal/conversacion", "/portal/pedidos", "/portal/activos", "/portal/documentos"]);
    expect(bajo("/portal/diagnostico")).toEqual(["/portal/hoy", "/portal/validar", "/portal/direccion", "/portal/informe"]);
    expect(bajo("/portal/numeros")).toEqual(["/portal/producto", "/portal/costos", "/portal/historia", "/portal/cobros"]);
    expect(bajo("/portal/plan")).toEqual(["/portal/semana", "/portal/kpis", "/portal/resultados", "/portal/iniciativas"]);
    expect(GRUPO.map(([s]) => s)).not.toContain("/portal/numeros");
    expect(destinoDe("/portal/hoy")).toBe("/portal/diagnostico");
    expect(destinoDe("/portal/direccion/constancia")).toBe("/portal/diagnostico");
    expect(destinoDe("/portal/numeros")).toBe("/portal/numeros");
    expect(destinoDe("/portal/procesos/abc")).toBe("/portal/procesos");
    expect(destinoDe("/portal/activos")).toBe("/portal");
  });

  it("«En esta sección» nombra cada pantalla de su destino, en palabras del dueño", async () => {
    const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
    estado.ruta = "/portal/diagnostico";
    const diag = renderToStaticMarkup(createElement(EnEstaSeccion, {}));
    for (const t of ["Todo lo que encontramos", "Confirmar información", "Hacia dónde vamos", "Informe"]) expect(diag).toContain(`>${t}<`);
    estado.ruta = "/portal/numeros";
    const num = renderToStaticMarkup(createElement(EnEstaSeccion, {}));
    for (const t of ["Lo que vendes", "Tus gastos del mes", "Tu historia", "Cobros y mercadería"]) expect(num).toContain(`>${t}<`);
    expect(num).not.toContain("Todo lo que encontramos");
    estado.ruta = "/portal";
    const inicio = renderToStaticMarkup(createElement(EnEstaSeccion, {}));
    for (const t of ["Cuéntanos tu negocio", "Lo que te pidió tu consultora", "Tus documentos", "Archivos aportados"]) expect(inicio).toContain(`>${t}<`);
  });
});

// ─────────────────────────── Tu diagnóstico ───────────────────────────

describe("dueño · /portal/diagnostico", () => {
  it("los cuatro bloques con sus títulos simples, la frase de arriba y la corrección con sus cuatro botones", async () => {
    base();
    como(DUENA);
    const { html, texto } = await pintar();
    for (const t of ["Tus procesos", "Tu tiempo", "Tu dinero", "Lo que encontramos"]) expect(html).toContain(`>${t}</h2>`);
    expect(texto).toMatch(/Tu empresa hoy vende S\/ ?41,800 al mes/);
    expect(texto).toContain("participas en 3 de 5 procesos");
    // El aviso y la diferencia, con las dos cifras y de dónde sale cada una.
    expect(texto).toContain("1 dato no cuadra. Corrígelo en un minuto.");
    expect(texto).toContain("Lo que te quedó en setiembre 2026 no cuadra con la cuenta de tus números");
    expect(texto).toContain("Lo dijiste tú");
    expect(texto).toContain("Sale de la cuenta");
    const b = botones(html);
    expect(b.filter((x) => x.startsWith("Esta es la correcta"))).toHaveLength(2);
    expect(b).toContain("Ninguna, es otra cifra");
    expect(b).toContain("No lo sé");
    expect(b).toContain("¿Por qué? (si quieres)");
    expect(texto).not.toContain(TEXTO_SECCION_CERRADA);
    // Lo que encontramos: lo que le frena y lo que haremos (solo lo que está en marcha).
    expect(texto).toContain("El precio del jean clásico no cubre la tela de este año");
    expect(texto).toContain("Subir el precio del jean clásico");
    expect(texto).not.toContain("Anotar las ventas del sábado");
  });

  it("sin palabras de consultoría, sin dimensiones, sin nada de la ficha en borrador y sin un «S/ 0» inventado", async () => {
    base();
    como(DUENA);
    const { texto } = await pintar();
    expect(texto).not.toMatch(PROHIBIDAS);
    expect(texto).not.toMatch(CERO_INVENTADO);
    expect(texto).not.toContain(SECRETO_BORRADOR);
    expect(texto).toContain(DE_LA_ACORDADA);
    for (const n of [...Object.values(NOMBRE_DIMENSION).filter((x) => !["Equipo", "Decisiones"].includes(x)), ...Object.values(NOMBRE_DIMENSION_CLIENTE)]) expect(texto).not.toContain(n);
    expect(texto).not.toMatch(/ocho dimensiones|revisada|propuesta|\/100|confirmadas/i);
  });

  it("con «Los números que faltan» abierta también se corrige", async () => {
    base({ abiertas: ["datos_faltantes"] });
    como(DUENA);
    const { html } = await pintar();
    expect(botones(html)).toContain("No lo sé");
  });

  it("con la sección cerrada: las dos cifras a la vista, TEXTO_SECCION_CERRADA y ningún botón", async () => {
    base({ abiertas: ["productos"] });
    como(DUENA);
    const { html, texto } = await pintar();
    expect(texto).toContain("Lo que te quedó en setiembre 2026 no cuadra con la cuenta de tus números");
    expect(texto).toMatch(/S\/ ?3,000/);
    expect(texto).toMatch(/S\/ ?13,800/);
    expect(texto).toContain(TEXTO_SECCION_CERRADA);
    expect(botones(html)).toEqual([]);
    // El aviso de arriba no promete lo que abajo no se puede hacer.
    expect(texto).not.toContain("en un minuto");
    expect(html).not.toMatch(/>Corregir<\/a>/);
  });

  it("la consultora que mira «como el empresario» ve la tarjeta, sin botones", async () => {
    base();
    como(CONSULTORA);
    const { html, texto } = await pintar();
    expect(texto).toContain("Lo que te quedó en setiembre 2026 no cuadra");
    expect(texto).toContain("Los botones para corregir solo salen en su cuenta");
    expect(botones(html)).toEqual([]);
  });

  it("una participante del equipo ve la tarjeta, sin botones: lo corrige el dueño", async () => {
    base();
    como(PARTICIPANTE);
    const { html, texto } = await pintar();
    expect(texto).toContain("Este dato lo corrige el dueño de la empresa");
    expect(botones(html)).toEqual([]);
  });

  it("lo ya corregido (misma huella) sale como «corregido», sin botones, con su línea en Cambios", async () => {
    base({
      extra: {
        audit_log: [{
          id: 7, company_id: EMP, actor_id: DUENA.id, actor_rol: "cliente", accion: "editar", entidad: "correccion_dato", entidad_id: "ganancia_vs_cuenta:ganancia_mes:2026-09",
          created_at: "2026-10-16T15:00:00.000Z", ruta: "/api/portal/numeros",
          detalle: { regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: "2026-09", eleccion: "izquierda", antes: { izquierda: 3000, derecha: 13800 }, despues: 3000, motivo: null, huella: huellaDe("ganancia_vs_cuenta", "ganancia_mes", "2026-09", 3000, 13800) },
        }],
      },
    });
    como(DUENA);
    const { html, texto } = await pintar();
    expect(texto).not.toContain("dato no cuadra");
    expect(texto).toContain("Datos corregidos");
    expect(texto).toContain("corregido");
    expect(botones(html)).toEqual([]);
  });

  it("sin diagnóstico publicado: «Tu consultora está terminando tu diagnóstico», sin rayado (no es un dato que falte)", async () => {
    base();
    como(DUENA, HOY_SIN_PUBLICAR);
    const { html, texto } = await pintar();
    expect(texto).toContain("Tu consultora está terminando tu diagnóstico");
    expect(html).not.toMatch(/class="t-etiqueta"[^>]*>Lo que te frena</);
    expect(texto).not.toContain("Lo que haremos en 30 días");
    expect(html).not.toMatch(/class="sin-dato"[^>]*>Tu consultora/);
  });

  it("una empresa recién creada: todo dicho como falta, ningún «S/ 0» ni «0 %»", async () => {
    base({ abiertas: [], extra: { company_metricas: [], ficha_direccion: [], actions: [] } });
    como(DUENA, HOY_SIN_PUBLICAR);
    const { texto } = await pintar();
    expect(texto).toContain("Todavía estamos reuniendo lo que hace falta para leer tu empresa.");
    expect(texto).not.toMatch(CERO_INVENTADO);
    expect(texto).not.toMatch(/(^|[^\d])0\s?%/);
    expect(texto).not.toMatch(PROHIBIDAS);
  });
});

// ─────────────────────────── Tus números ───────────────────────────

describe("dueño · /portal/numeros: el tablero arriba, el formulario de siempre debajo", () => {
  const pintarNumeros = async () => {
    const { default: Numeros } = await import("@/app/(cliente)/portal/numeros/page");
    return renderToStaticMarkup(await Numeros());
  };

  it("lo que te queda, lo que vendiste, tus 9 números y la línea; abajo, en su hoja, lo de siempre", async () => {
    base({ abiertas: ["datos_faltantes"] });
    como(DUENA);
    const html = await pintarNumeros();
    const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const tablero = html.indexOf('class="tablero"');
    const hoja = html.indexOf('class="hoja-suelta" id="formulario"');
    expect(tablero).toBeGreaterThanOrEqual(0);
    expect(hoja).toBeGreaterThan(tablero);
    const arriba = html.slice(tablero, hoja).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(arriba).toContain("Lo que te queda");
    expect(arriba).toMatch(/S\/ ?3,000 al mes/);
    expect(arriba).toContain("Lo que vendiste");
    expect(arriba).toMatch(/S\/ ?41,800/);
    // Venta, ganancia, gasto fijo y caja: cuatro de los nueve (el costo de la mercadería no es uno de ellos).
    expect(arriba).toContain("De tus 9 números: 4");
    expect(arriba).toContain("Tus ventas mes a mes");
    // La raya de lo que necesita vender: 8.000 / ((41.800 − 20.000) / 41.800) = 15.339,4.
    expect(arriba).toMatch(/S\/ 15,339/);
    expect(arriba).not.toMatch(PROHIBIDAS);
    expect(arriba).not.toMatch(CERO_INVENTADO);
    // Lo que le quedó no cuadra con la cuenta (3.000 frente a 13.800): arriba sale «por confirmar», con su enlace a
    // corregirlo en Tu diagnóstico, no como un hecho (revisión del 16-10-2026).
    expect(arriba).toMatch(/por confirmar Esta cifra no cuadra con la cuenta de tus números/);
    expect(html).toContain('href="/portal/diagnostico#incongruencias"');
    // Cada cifra una sola vez: debajo del tablero ya no se repiten la franja de cifras ni la radiografía «N de 9».
    const abajo = html.slice(hoja);
    expect(abajo).not.toContain("La radiografía de tu negocio");
    expect(abajo).not.toContain("de cada 100 soles");
    expect(abajo).not.toContain("tienes que vender al mes");
    expect(texto.match(/de cada 100 soles, te queda/g) ?? []).toHaveLength(1);
    // El formulario de siempre, dentro de la hoja: lo pedido arriba y «Lo que ya nos contaste».
    expect(abajo).toContain("Tu consultora te pidió");
    expect(texto).toContain("Tus números");
  });

  it("sin números: rayado y con su nombre, ni un «S/ 0»; sin dos meses, el aviso en lugar de la línea", async () => {
    base({ abiertas: [], extra: { company_metricas: [] } });
    como(DUENA);
    const vacia = (await pintarNumeros()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(vacia).toContain("Todavía no lo contaste");
    expect(vacia).toContain("Todavía sin ventas contadas");
    expect(vacia).toContain("De tus 9 números: 0");
    expect(vacia).not.toMatch(CERO_INVENTADO);

    base({ abiertas: [], extra: { company_metricas: [metrica(1, "venta_mes", 41800)] } });
    const unMes = (await pintarNumeros()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(unMes).toContain("Hacen falta dos meses de ventas para dibujar la línea");
  });
});

// ─────────────────────────── «Corregir este dato», por dónde se corrige ───────────────────────────

describe("CorregirDato: cada diferencia se corrige por donde vive", () => {
  const lado = (valor: number | null, texto: string, origen: "lo_dijiste" | "tu_tabla" | "documento" | "otra_fuente" | "cuenta" = "lo_dijiste") => ({ valor, rango: null, texto, origen, detalle: "" });
  const comun = { id: "x", clave: null, periodo: null, titulo: "", tituloDueno: "", diferenciaPct: null, toleranciaPct: null, huella: "", resuelta: null } as const;
  const pinta = async (i: unknown, abiertas: string[] | null, quien: "dueno" | "consultora" | "otro" = "dueno") => {
    const { CorregirDato } = await import("@/components/cliente/CorregirDato");
    return renderToStaticMarkup(createElement(CorregirDato, { i: i as never, abiertas: abiertas as never, quien }));
  };

  it("«de cada 10»: se corrige en «Lo que vendes», solo con esa sección abierta", async () => {
    const i = { ...comun, regla: "de_cada_10", izquierda: lado(12, "suman 12 de 10", "tu_tabla"), derecha: null, opciones: [], corrige: { via: "seccion", seccion: "productos", href: "/portal/producto" } };
    const abierta = await pinta(i, ["productos"]);
    expect(abierta).toContain('href="/portal/producto"');
    expect(abierta).toContain("Corregirlo en «Lo que vendes»");
    const cerrada = await pinta(i, ["corroborar_diagnostico"]);
    expect(cerrada).toContain(TEXTO_SECCION_CERRADA);
    expect(cerrada).not.toContain("/portal/producto");
  });

  it("dos respuestas que se contradicen: «Revisarlo» en Confirmar información", async () => {
    const i = { ...comun, regla: "respuestas_contradichas", izquierda: lado(null, "Vendemos más los sábados"), derecha: lado(null, "Otra persona de tu empresa lo cuenta distinto.", "otra_fuente"), opciones: [], corrige: { via: "validar", claimId: "c1" } };
    const h = await pinta(i, ["corroborar_diagnostico"]);
    expect(h).toContain('href="/portal/validar"');
    expect(h).toContain(">Revisarlo<");
  });

  it("una cifra imposible no se elige: «No, es otra cifra» y «No lo sé»", async () => {
    const i = { ...comun, id: "imposible:caja_hoy:actual", regla: "imposible", clave: "caja_hoy", periodo: "actual", izquierda: lado(-500, "-S/ 500"), derecha: null, opciones: ["otra", "no_lo_se"], corrige: { via: "numeros", clave: "caja_hoy", periodo: "actual" } };
    expect(botones(await pinta(i, ["datos_faltantes"]))).toEqual(["No, es otra cifra", "No lo sé", "¿Por qué? (si quieres)"]);
  });

  it("un posible eco (un solo lado): «Sí, es S/ …», además de las otras dos", async () => {
    const i = { ...comun, id: "posible_eco:venta_mes:2026-09", regla: "posible_eco", clave: "venta_mes", periodo: "2026-09", izquierda: lado(40000, "S/ 40,000"), derecha: null, opciones: ["izquierda", "otra", "no_lo_se"], corrige: { via: "numeros", clave: "venta_mes", periodo: "2026-09" } };
    expect(botones(await pinta(i, ["corroborar_diagnostico"]))).toEqual(["Sí, es S/ 40,000", "No, es otra cifra", "No lo sé", "¿Por qué? (si quieres)"]);
  });

  it("un lado en rango no se elige: solo la otra cifra lleva «Esta es la correcta»", async () => {
    const i = {
      ...comun, id: "gasto_fijo_vs_tabla:gasto_fijo_mes:actual", regla: "gasto_fijo_vs_tabla", clave: "gasto_fijo_mes", periodo: "actual",
      izquierda: lado(6000, "S/ 6,000"), derecha: { valor: null, rango: { bajo: 8880, alto: 9680 }, texto: "entre S/ 8,880 y S/ 9,680", origen: "tu_tabla", detalle: "" },
      opciones: ["izquierda", "otra", "no_lo_se"], corrige: { via: "numeros", clave: "gasto_fijo_mes", periodo: "actual" },
    };
    expect(botones(await pinta(i, ["corroborar_diagnostico"])).filter((x) => x.startsWith("Esta es la correcta"))).toEqual(["Esta es la correcta: S/ 6,000"]);
  });

  it("si no se sabe qué está abierto, no se promete nada; lo ya corregido no lleva acciones", async () => {
    const i = {
      ...comun, id: "ganancia_vs_cuenta:ganancia_mes:2026-09", regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: "2026-09",
      izquierda: lado(3000, "S/ 3,000"), derecha: lado(13800, "S/ 13,800", "cuenta"), opciones: ["izquierda", "derecha", "otra", "no_lo_se"], corrige: { via: "numeros", clave: "ganancia_mes", periodo: "2026-09" },
    };
    const sinSaber = await pinta(i, null);
    expect(botones(sinSaber)).toEqual([]);
    expect(sinSaber).toContain(TEXTO_SECCION_CERRADA);
    expect(await pinta({ ...i, resuelta: { at: "2026-10-16T15:00:00.000Z", eleccion: "izquierda", quien: "Dueña", linea: "x" } }, ["corroborar_diagnostico"])).toBe("");
  });
});

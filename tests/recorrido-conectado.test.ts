/**
 * NINGUNA PANTALLA QUEDA DESCONECTADA.
 *
 * Pedido de Dirección (13-10-2026): «No quiero pantallas desconectadas». La rama de ejecución autónoma
 * añadió pantallas que solo se alcanzaban tecleando la dirección. La salida fácil —un enlace más en la
 * barra por cada pantalla nueva— ya se intentó: la barra del portal llegó a 17 enlaces y hubo que
 * revertirla, porque la regla vigente es otra: «CINCO DESTINOS, NO OCHO» (src/app/(cliente)/layout.tsx).
 *
 * Las dos reglas se cumplen a la vez así:
 * — PORTAL: cinco destinos fijos. Toda otra pantalla pertenece a uno de ellos (mapa GRUPO de NavCliente)
 *   y se enlaza, con nombre de empresario, en la fila «En esta sección» (EnEstaSeccion), montada una sola
 *   vez en el layout. Cualquier pantalla queda a dos toques como máximo.
 * — CONSULTORA: las pestañas de /empresa/[id] van en tres capas con rótulo: Resumen, Evidencia, Intervención.
 *   Las pantallas generales (Inicio, Empresas, Cartera…) se enlazan en la barra lateral de NavConsultor.
 *
 * 16-10-2026: la navegación pasó AL COSTADO (pedido de Kelin). Antes había dos barras (la lateral de escritorio y
 * la inferior del celular); ahora hay una sola, que en celular entra como cajón. La lista que se llamaba `abajo`
 * es `principales`: el grupo de los destinos de todos los días. Las reglas no cambian (cinco como máximo, con
 * ícono, sin repetir); cambia dónde se pintan.
 *
 * Una pantalla nueva sin enlazar hace fallar esta prueba. Ese es el punto.
 *
 * LO QUE SE ENLAZÓ EN LA TANDA DE EXCELENCIA Y CARTERA (13-10-2026), cada cosa con su prueba propia además de
 * la regla general: «Lo que estamos probando» (/portal/iniciativas) bajo Plan; la pestaña «Excelencia y
 * aceleración» en Intervención; y «Cartera» en las dos barras de la consultora.
 *
 * NOTA DE ALCANCE: la prueba lee el código fuente y el sistema de archivos. Demuestra que el enlace está
 * ESCRITO; no demuestra que la pantalla abra en un navegador con datos reales.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

/** Toda carpeta con page.tsx bajo `dir`, como ruta relativa a ella ("" es la propia carpeta). */
function rutasConPagina(dir: string, rel = ""): string[] {
  const acc: string[] = [];
  if (existsSync(path.join(dir, "page.tsx"))) acc.push(rel);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) acc.push(...rutasConPagina(path.join(dir, e.name), `${rel}/${e.name}`));
  }
  return acc.sort();
}

/** Lo que hay entre los corchetes de `const NOMBRE = [ … ];` en un archivo fuente. */
function cuerpoDe(src: string, nombre: string): string {
  const m = src.match(new RegExp(`const ${nombre}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n\\s*\\];`));
  return m ? m[1]! : "";
}

/** Los pares ["ruta", "texto"] escritos en un trozo de código (de una terna se leen los dos primeros). */
const pares = (codigo: string) => [...codigo.matchAll(/\[\s*"([^"]*)"\s*,\s*"([^"]*)"/g)].map((m) => [m[1]!, m[2]!] as [string, string]);

/** Una ruta dinámica (/x/[p]) se abre desde la lista de su pantalla madre (/x): se juzga por ella. */
const madreDe = (ruta: string) => (ruta.includes("[") ? ruta.slice(0, ruta.indexOf("/[")) : ruta);

// ————————————————————————————————————————— PORTAL DEL CLIENTE —————————————————————————————————————————

const CINCO: [string, string][] = [
  ["/portal", "Inicio"],
  ["/portal/hoy", "Mi empresa"],
  ["/portal/procesos", "Procesos"],
  ["/portal/activos", "Tus documentos"],
  ["/portal/plan", "Plan"],
];

const layoutCliente = leer("app/(cliente)/layout.tsx");
const navCliente = leer("components/cliente/NavCliente.tsx");
const enEstaSeccion = leer("components/cliente/EnEstaSeccion.tsx");

const RUTAS_PORTAL = rutasConPagina(path.join(SRC, "app/(cliente)/portal")).map((r) => `/portal${r}`);
const GRUPO = new Map(pares(cuerpoDe(navCliente, "GRUPO")));
const NOMBRES = new Map(pares(cuerpoDe(enEstaSeccion, "NOMBRES")));

/**
 * EXCEPCIONES: pantallas del portal que NO van en la fila «En esta sección». Cada una con su porqué y con
 * la comprobación de que igual tiene por dónde entrarse. La lista es corta a propósito: alargarla sin
 * justificación es volver a tener pantallas sueltas. Las rutas dinámicas no se anotan aquí: se juzgan
 * por su pantalla madre (ver `madreDe`).
 */
const EXCEPCIONES: Record<string, { porque: string; seEntraDesde: string; con: RegExp }> = {
  "/portal/elegir-empresa": {
    porque: "No es una sección: es el cambio de empresa. Se ofrece como «Cambiar de empresa» solo a quien tiene más de una.",
    seEntraDesde: "components/cliente/EnEstaSeccion.tsx",
    con: /"\/portal\/elegir-empresa"/,
  },
  "/portal/direccion/constancia": {
    porque: "Es el documento de una confirmación concreta: se abre con «Ver mi constancia» desde Hacia dónde vamos.",
    seEntraDesde: "app/(cliente)/portal/direccion/page.tsx",
    con: /rutaConstancia\(/,
  },
};

/** Por qué una pantalla del portal NO está conectada; null si lo está. */
function faltaEnPortal(ruta: string): string | null {
  if (ruta.includes("[")) {
    const f = faltaEnPortal(madreDe(ruta));
    return f ? `es una ruta dinámica y su pantalla madre no está conectada (${f})` : null;
  }
  if (CINCO.some(([href]) => href === ruta)) return null;
  const ex = EXCEPCIONES[ruta];
  if (ex) return ex.con.test(leer(ex.seEntraDesde)) ? null : `está anotada como excepción, pero ${ex.seEntraDesde} ya no la enlaza`;
  const principal = GRUPO.get(ruta);
  if (!principal) return "no está en el mapa GRUPO de NavCliente: falta decir bajo cuál de los cinco destinos vive";
  if (!CINCO.some(([href]) => href === principal)) return `GRUPO la pone bajo ${principal}, que no es uno de los cinco destinos`;
  if (!NOMBRES.get(ruta)) return "no tiene nombre en EnEstaSeccion: nadie llega a ella sin teclear la dirección";
  return null;
}

describe("portal del cliente: cinco destinos, y toda pantalla a dos toques", () => {
  it("se encontraron pantallas y listas (si esto falla, la prueba no mira nada)", () => {
    expect(RUTAS_PORTAL.length).toBeGreaterThan(10);
    expect(GRUPO.size).toBeGreaterThan(5);
    expect(NOMBRES.size).toBeGreaterThan(5);
  });

  it("la barra tiene exactamente cinco destinos, y son esos cinco", () => {
    expect(pares(cuerpoDe(layoutCliente, "enlaces")), "la lista `enlaces` del layout (barra lateral de escritorio)").toEqual(CINCO);
    expect(pares(cuerpoDe(navCliente, "PRINCIPALES")), "la lista PRINCIPALES de NavCliente (de donde sale el ícono de cada destino)").toEqual(CINCO);
    expect(navCliente).toMatch(/PRINCIPALES\.map\(/);
    expect(navCliente).toMatch(/enlaces\.map\(/);
  });

  it("la barra no lleva enlaces escritos a mano fuera de esas listas", () => {
    // Así se llegó a 17: añadiendo un enlace suelto por cada pantalla nueva.
    const nav = navCliente.replace(cuerpoDe(navCliente, "PRINCIPALES"), "").replace(cuerpoDe(navCliente, "GRUPO"), "");
    expect(nav, "NavCliente tiene una ruta del portal fuera de PRINCIPALES y GRUPO").not.toMatch(/"\/portal\/[^"]*"/);
    const layout = layoutCliente.replace(cuerpoDe(layoutCliente, "enlaces"), "");
    expect(layout, "el layout del portal tiene una ruta fuera de la lista `enlaces`").not.toMatch(/"\/portal\/[^"]*"/);
  });

  it.each(RUTAS_PORTAL)("%s se alcanza desde la navegación", (ruta) => {
    const falta = faltaEnPortal(ruta);
    expect(falta, `${ruta} ${falta}. O se enlaza, o se anota en EXCEPCIONES con su porqué.`).toBeNull();
  });

  it("el mapa y la fila dicen lo mismo, y ninguno apunta a una pantalla que no existe", () => {
    expect([...NOMBRES.keys()].sort(), "pantallas con nombre en EnEstaSeccion frente a pantallas del mapa GRUPO").toEqual([...GRUPO.keys()].sort());
    for (const ruta of GRUPO.keys()) expect(RUTAS_PORTAL, `GRUPO enlaza ${ruta}, que no tiene page.tsx`).toContain(ruta);
    for (const ruta of Object.keys(EXCEPCIONES)) expect(RUTAS_PORTAL, `la excepción ${ruta} ya no existe: se borra de la lista`).toContain(ruta);
  });

  it("la fila se monta una sola vez, en el layout y encima del contenido", () => {
    expect(layoutCliente.match(/<EnEstaSeccion\b/g) ?? []).toHaveLength(1);
    const i = layoutCliente.indexOf("<EnEstaSeccion");
    expect(i).toBeGreaterThan(layoutCliente.lastIndexOf("<main"));
    expect(i).toBeLessThan(layoutCliente.lastIndexOf("{children}"));
    // «Cambiar de empresa» depende de un dato que el layout ya tiene: no se ofrece a quien solo tiene una.
    expect(layoutCliente).toMatch(/variasEmpresas = r\.empresas\.length > 1/);
    expect(enEstaSeccion).toMatch(/const cambiar = variasEmpresas &&/);
    for (const r of RUTAS_PORTAL) {
      const pagina = leer(`app/(cliente)${r}/page.tsx`);
      expect(pagina, `${r} monta la fila por su cuenta: saldría dos veces`).not.toMatch(/EnEstaSeccion/);
    }
  });

  it("la fila cabe en un celular y se puede nombrar", () => {
    expect(enEstaSeccion.startsWith(`"use client"`)).toBe(true);
    expect(enEstaSeccion).toMatch(/usePathname\(\)/);
    expect(enEstaSeccion).toMatch(/<nav[^>]*overflow-x-auto[^>]*aria-label="[^"]+"/);
    expect(enEstaSeccion).toMatch(/no-imprimir/);
    expect(enEstaSeccion).toMatch(/whiteSpace: "nowrap"/);
  });

  it("la fila habla como el empresario: sin jerga de consultoría", () => {
    // Las rutas no se leen en pantalla (existe /portal/kpis): se quitan antes de mirar. Lo demás, todo.
    const aLaVista = enEstaSeccion.replace(/"\/portal[^"]*"/g, "").toLowerCase();
    for (const palabra of ["pilar", "claim", "KPI", "baseline", "matriz"]) {
      expect(aLaVista, `EnEstaSeccion contiene «${palabra}»`).not.toContain(palabra.toLowerCase());
    }
  });

  it("lo nuevo de esta tanda: «Lo que estamos probando» vive bajo Plan, junto a las demás pantallas del plan", () => {
    expect(RUTAS_PORTAL, "la pantalla de iniciativas del dueño no existe: no se enlaza lo que no está construido").toContain("/portal/iniciativas");
    expect(GRUPO.get("/portal/iniciativas")).toBe("/portal/plan");
    expect(NOMBRES.get("/portal/iniciativas")).toBe("Lo que estamos probando");
    // Bajo Plan quedan cuatro pantallas, en el orden en que el dueño las recorre: la semana, lo que se mide, cómo vamos y lo que se prueba.
    const bajoPlan = [...NOMBRES.keys()].filter((r) => GRUPO.get(r) === "/portal/plan");
    expect(bajoPlan).toEqual(["/portal/semana", "/portal/kpis", "/portal/resultados", "/portal/iniciativas"]);
  });
});

// ————————————————————————————————————————— LADO DE LA CONSULTORA —————————————————————————————————————————

const layoutEmpresa = leer("app/(consultor)/empresa/[id]/layout.tsx");
const tabsEmpresa = leer("components/consultor/TabsEmpresa.tsx");
const RUTAS_EMPRESA = rutasConPagina(path.join(SRC, "app/(consultor)/empresa/[id]"));

/** Las capas escritas en el layout: su rótulo y las pestañas que cuelgan de cada una. */
const CAPAS = cuerpoDe(layoutEmpresa, "CAPAS")
  .split(/rotulo:\s*/)
  .slice(1)
  .map((trozo) => ({ rotulo: trozo.match(/^"([^"]+)"/)?.[1] ?? "", hrefs: pares(trozo).map(([href]) => href) }));

describe("empresa de la consultora: Resumen → Evidencia → Intervención", () => {
  it("se encontraron pantallas (si esto falla, la prueba no mira nada)", () => {
    expect(RUTAS_EMPRESA.length).toBeGreaterThan(10);
  });

  it("las pestañas van en tres capas, con esos rótulos y en ese orden", () => {
    expect(CAPAS.map((c) => c.rotulo)).toEqual(["Resumen", "Evidencia", "Intervención"]);
    for (const c of CAPAS) expect(c.hrefs.length, `la capa ${c.rotulo} no tiene pestañas`).toBeGreaterThan(0);
    expect(layoutEmpresa).toMatch(/<TabsEmpresa[^>]*capas=\{CAPAS\}/);
  });

  it("el rótulo de cada capa se pinta, y las pestañas se deslizan en un celular", () => {
    expect(tabsEmpresa).toMatch(/\{capa\.rotulo\}/);
    expect(tabsEmpresa).toMatch(/overflow-x-auto/);
    expect(tabsEmpresa).toMatch(/aria-label="[^"]+"/);
  });

  it.each(RUTAS_EMPRESA)("/empresa/[id]%s tiene pestaña en una sola de las tres capas", (ruta) => {
    const madre = madreDe(ruta);
    const donde = CAPAS.filter((c) => c.hrefs.includes(madre)).map((c) => c.rotulo);
    expect(donde, `/empresa/[id]${madre} tiene que estar en una capa, y solo en una; está en: [${donde.join(", ")}]`).toHaveLength(1);
  });

  it("ninguna pestaña apunta a una pantalla que no existe", () => {
    for (const c of CAPAS) for (const href of c.hrefs) expect(RUTAS_EMPRESA, `la pestaña ${href || "(Panorama)"} de ${c.rotulo} no tiene page.tsx`).toContain(href);
  });

  it("lo nuevo de esta tanda: «Excelencia y aceleración» es una pestaña de Intervención", () => {
    expect(RUTAS_EMPRESA, "la pantalla de excelencia no existe: no se enlaza lo que no está construido").toContain("/excelencia");
    expect(CAPAS.find((c) => c.rotulo === "Intervención")?.hrefs).toContain("/excelencia");
    expect(pares(cuerpoDe(layoutEmpresa, "CAPAS"))).toContainEqual(["/excelencia", "Excelencia y aceleración"]);
  });
});

// ————————————————————————————————————————— BARRAS DE LA CONSULTORA —————————————————————————————————————————

const navConsultor = leer("components/consultor/NavConsultor.tsx");
const layoutConsultor = leer("app/(consultor)/layout.tsx");

/** Las pantallas generales de la consultora: el primer tramo de cada ruta con page.tsx (/torre/mapa cuenta como /torre). */
const SECCIONES_CONSULTORA = [...new Set(rutasConPagina(path.join(SRC, "app/(consultor)")).map((r) => `/${r.split("/")[1]}`))].sort();

/**
 * El grupo principal de la barra lateral (antes, «la barra inferior del celular»): ruta, nombre e ícono de cada
 * destino de todos los días. Desde el 16-10-2026 hay una sola barra, al costado; este grupo es lo único que queda
 * a la vista cuando se oculta en riel.
 */
const PRINCIPALES_C = [...cuerpoDe(navConsultor, "principales").matchAll(/\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\]/g)].map((m) => ({ href: m[1]!, nombre: m[2]!, icono: m[3]! }));

/**
 * Todos los enlaces de la barra lateral: los que pinta `item(...)`, los escritos como <Link href="…"> y, después,
 * el grupo principal (en ese orden: así «/cartera» sigue justo después de «/empresas»).
 */
const LATERAL = [
  ...[...navConsultor.matchAll(/item\("(\/[^"]*)"\s*,\s*"([^"]*)"/g), ...navConsultor.matchAll(/<Link href="(\/[^"]*)"[^>]*>([^<{]*)</g)].map((m) => ({ href: m[1]!, nombre: m[2]!.trim() })),
  ...PRINCIPALES_C.map(({ href, nombre }) => ({ href, nombre })),
];

describe("barra lateral de la consultora: las pantallas generales, y la Cartera en el grupo principal", () => {
  it("se encontraron pantallas y enlaces (si esto falla, la prueba no mira nada)", () => {
    expect(SECCIONES_CONSULTORA.length).toBeGreaterThan(5);
    expect(PRINCIPALES_C.length).toBeGreaterThan(2);
    expect(LATERAL.length).toBeGreaterThan(5);
  });

  it.each(SECCIONES_CONSULTORA)("%s se alcanza desde la barra lateral", (seccion) => {
    // La empresa abierta no es un enlace fijo: se entra por la lista de empresas recientes, una por fila.
    if (seccion === "/empresa") {
      expect(navConsultor).toMatch(/item\(`\/empresa\/\$\{e\.id\}`/);
      return;
    }
    expect(LATERAL.map((e) => e.href), `${seccion} tiene page.tsx y la barra lateral de NavConsultor no la enlaza`).toContain(seccion);
  });

  it("ningún enlace de las barras apunta a una pantalla que no existe", () => {
    for (const { href } of [...PRINCIPALES_C, ...LATERAL]) expect(SECCIONES_CONSULTORA, `NavConsultor enlaza ${href}, que no tiene page.tsx`).toContain(href);
  });

  it("lo nuevo de esta tanda: «Cartera» está en la barra lateral, en su grupo principal", () => {
    expect(existsSync(path.join(SRC, "app/(consultor)/cartera/page.tsx")), "la pantalla de cartera no existe: no se enlaza lo que no está construido").toBe(true);
    expect(LATERAL).toContainEqual({ href: "/cartera", nombre: "Cartera" });
    expect(PRINCIPALES_C.map((e) => [e.href, e.nombre])).toContainEqual(["/cartera", "Cartera"]);
    // Va junto a la lista de empresas: es otra manera de mirarlas todas, no una herramienta del sistema.
    const orden = LATERAL.map((e) => e.href);
    expect(orden.indexOf("/cartera")).toBe(orden.indexOf("/empresas") + 1);
  });

  it("el grupo principal de la barra lateral no se llena: cinco destinos como máximo, cada uno con su ícono dibujado", () => {
    expect(PRINCIPALES_C.length).toBeLessThanOrEqual(5);
    expect(new Set(PRINCIPALES_C.map((e) => e.href)).size, "un destino repetido en el grupo principal de la barra lateral").toBe(PRINCIPALES_C.length);
    const iconos = navConsultor.slice(navConsultor.indexOf("const ICONOS"), navConsultor.indexOf("const principales"));
    for (const { nombre, icono } of PRINCIPALES_C) expect(iconos, `«${nombre}» pide el ícono «${icono}», que no está dibujado: saldría un hueco`).toMatch(new RegExp(`\\b${icono}: <path `));
    expect(navConsultor).toMatch(/principales\.map\(/);
    // Los íconos son trazos, nunca emoji.
    expect(navConsultor).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("en un celular la torre está a un toque: va en la franja de arriba, además de en la barra lateral", () => {
    expect(layoutConsultor).toMatch(/lg:hidden[\s\S]*href="\/torre"/);
  });
});

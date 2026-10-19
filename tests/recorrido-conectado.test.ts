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
 * — CONSULTORA: las pantallas de /empresa/[id] van en cinco vistas (Diagnóstico, Números, Estructura, Estrategia,
 *   Avance) y el Expediente aparte (src/lib/vistas-empresa.ts); dentro de cada vista, la fila «En esta vista». Las
 *   pantallas generales (Inicio, Empresas, Cartera…) se enlazan en la barra lateral de NavConsultor.
 *
 * 16-10-2026: la navegación pasó AL COSTADO (pedido de Kelin). Antes había dos barras (la lateral de escritorio y
 * la inferior del celular); ahora hay una sola, que en celular entra como cajón. La lista que se llamaba `abajo`
 * es `principales`: el grupo de los destinos de todos los días. Las reglas no cambian (cinco como máximo, con
 * ícono, sin repetir); cambia dónde se pintan.
 *
 * 16-10-2026, más tarde: «son muchas pestañas que deberían estar en una sola» (Kelin). La empresa pasó de 20 pestañas
 * en tres capas a cinco vistas y el Expediente; el portal, a cinco destinos nuevos (Inicio, Tu diagnóstico, Tus
 * números, Tus procesos, Tu plan). «Mi empresa» y «Tus documentos» dejan de ser destinos y siguen abriendo dentro de
 * uno. Ninguna ruta vieja se borró: la regla de esta prueba no se aflojó, cambió el mapa contra el que mide.
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
import { VISTAS, EXPEDIENTE, PANTALLAS_MUDADAS } from "@/lib/vistas-empresa";
import { MI_DIA, MI_EQUIPO, AVISOS_OS, PERFIL_OS, CONSULTORIA, RUTAS_MENU_OS, gruposOS } from "@/lib/os/menu";

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
  ["/portal/diagnostico", "Tu diagnóstico"],
  ["/portal/numeros", "Tus números"],
  ["/portal/procesos", "Tus procesos"],
  ["/portal/plan", "Tu plan"],
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
    // Bajo Plan, en el orden en que el dueño las recorre: lo que su consultora le preguntó (solo cuando se lo preguntó),
    // la semana, lo que se mide, cómo vamos y lo que se prueba.
    const bajoPlan = [...NOMBRES.keys()].filter((r) => GRUPO.get(r) === "/portal/plan");
    expect(bajoPlan).toEqual(["/portal/plan/preguntas", "/portal/semana", "/portal/kpis", "/portal/resultados", "/portal/iniciativas"]);
  });

  it("lo nuevo del 17-10: las preguntas de la estrategia se responden dentro de «Tu plan», sin un destino nuevo", () => {
    // spec-estrategia-8x.md §8.2 con el ajuste de los cinco destinos: la página vive bajo /portal/plan y la fila la nombra.
    expect(RUTAS_PORTAL, "la página de las preguntas del dueño no existe: no se enlaza lo que no está construido").toContain("/portal/plan/preguntas");
    expect(GRUPO.get("/portal/plan/preguntas")).toBe("/portal/plan");
    expect(NOMBRES.get("/portal/plan/preguntas")).toBe("Preguntas para tu plan");
    // Los cinco destinos no crecen.
    expect(pares(cuerpoDe(layoutCliente, "enlaces"))).toEqual(CINCO);
    // Y en la fila sale solo con su pedido abierto: el layout suma pantallasSinPedido a lo que se oculta.
    expect(layoutCliente).toMatch(/pantallasSinPedido\(abiertasAhora\)/);
  });

  it("lo nuevo del 16-10: bajo Tus números van lo que vende, los gastos, la historia y los cobros, en ese orden", () => {
    const bajoNumeros = [...NOMBRES.keys()].filter((r) => GRUPO.get(r) === "/portal/numeros");
    expect(bajoNumeros).toEqual(["/portal/producto", "/portal/costos", "/portal/historia", "/portal/cobros"]);
    // Tus números es destino: ya no cuelga de otro ni lleva nombre en la fila.
    expect(GRUPO.has("/portal/numeros")).toBe(false);
    expect(NOMBRES.has("/portal/numeros")).toBe(false);
  });

  it("lo nuevo del 16-10: «Mi empresa» y «Tus documentos» dejan de ser destinos y siguen abriendo dentro de uno", () => {
    expect(RUTAS_PORTAL, "ninguna ruta vieja se borra").toEqual(expect.arrayContaining(["/portal/hoy", "/portal/activos"]));
    expect(GRUPO.get("/portal/hoy")).toBe("/portal/diagnostico");
    expect(NOMBRES.get("/portal/hoy")).toBe("Todo lo que encontramos");
    expect(GRUPO.get("/portal/activos")).toBe("/portal");
    expect(NOMBRES.get("/portal/activos")).toBe("Tus documentos");
    const bajoDiagnostico = [...NOMBRES.keys()].filter((r) => GRUPO.get(r) === "/portal/diagnostico");
    expect(bajoDiagnostico).toEqual(["/portal/hoy", "/portal/validar", "/portal/direccion", "/portal/informe"]);
  });
});

// ————————————————————————————————————————— LADO DE LA CONSULTORA —————————————————————————————————————————

const layoutEmpresa = leer("app/(consultor)/empresa/[id]/layout.tsx");
const tabsEmpresa = leer("components/consultor/TabsEmpresa.tsx");
const enEstaVista = leer("components/consultor/EnEstaVista.tsx");
const RUTAS_EMPRESA = rutasConPagina(path.join(SRC, "app/(consultor)/empresa/[id]"));
const TODAS = [...VISTAS, EXPEDIENTE];

describe("empresa de la consultora: seis vistas y el Expediente", () => {
  it("se encontraron pantallas (si esto falla, la prueba no mira nada)", () => {
    expect(RUTAS_EMPRESA.length).toBeGreaterThan(10);
  });

  it("seis vistas en este orden y el Expediente aparte, cada una con su ícono dibujado", () => {
    expect(VISTAS).toHaveLength(6);
    // Las cuatro cosas que nombró Kelin (diagnóstico, números, indicadores, avance), la Estructura y la Estrategia (16-10-2026).
    expect(VISTAS.map((v) => v.nombre)).toEqual(["Diagnóstico", "Números", "Indicadores", "Estructura", "Estrategia", "Avance"]);
    expect(EXPEDIENTE.nombre).toBe("Expediente");
    const iconos = leer("components/base/Icono.tsx");
    for (const v of TODAS) expect(iconos, `la vista ${v.nombre} pide el ícono «${v.icono}», que no está dibujado`).toMatch(new RegExp(`\\b${v.icono}: <`));
    for (const v of TODAS) expect(v.sub.length, `la vista ${v.nombre} no tiene pantallas`).toBeGreaterThan(0);
    // El enlace de cada vista abre una de sus pantallas (Indicadores y Estructura no tienen resumen propio: abren la primera).
    for (const v of TODAS) expect(v.sub.map(([h]) => h), `el enlace de ${v.nombre} no es una de sus pantallas`).toContain(v.href);
  });

  it("el layout pinta la columna con las vistas y la fila «En esta vista» una sola vez, encima de la pantalla", () => {
    expect(layoutEmpresa).toMatch(/<TabsEmpresa[^>]*vistas=\{VISTAS\}[^>]*expediente=\{EXPEDIENTE\}/);
    expect(layoutEmpresa).toMatch(/import \{ VISTAS, EXPEDIENTE \} from "@\/lib\/vistas-empresa"/);
    expect(layoutEmpresa.match(/<TabsEmpresa\b/g) ?? []).toHaveLength(1);
    expect(layoutEmpresa.match(/<EnEstaVista\b/g) ?? []).toHaveLength(1);
    expect(layoutEmpresa.indexOf("<EnEstaVista")).toBeLessThan(layoutEmpresa.indexOf("{children}"));
    // Ninguna pantalla monta la fila ni la columna por su cuenta: saldrían dos veces.
    for (const r of RUTAS_EMPRESA) {
      const pagina = leer(`app/(consultor)/empresa/[id]${r}/page.tsx`);
      expect(pagina, `${r || "(portada)"} monta la columna o la fila por su cuenta`).not.toMatch(/<TabsEmpresa\b|<EnEstaVista\b/);
    }
  });

  it("la columna y la fila se deslizan en un celular, se pueden nombrar y no salen al imprimir", () => {
    expect(tabsEmpresa.startsWith(`"use client"`)).toBe(true);
    expect(tabsEmpresa).toMatch(/aria-label="[^"]+"/);
    expect(tabsEmpresa).toMatch(/no-imprimir/);
    expect(tabsEmpresa).toMatch(/vistaDe\(/);
    expect(tabsEmpresa).toMatch(/data-discreto=/);
    expect(enEstaVista.startsWith(`"use client"`)).toBe(true);
    expect(enEstaVista).toMatch(/<nav[^>]*overflow-x-auto[^>]*aria-label="En esta vista"/);
    expect(enEstaVista).toMatch(/subActiva\(/);
    expect(enEstaVista).toMatch(/whiteSpace: "nowrap"/);
  });

  it.each(RUTAS_EMPRESA)("/empresa/[id]%s está en una sola vista (o se mudó y lleva a la nueva)", (ruta) => {
    const madre = madreDe(ruta);
    const donde = TODAS.filter((v) => v.sub.some(([h]) => h === madre)).map((v) => v.nombre);
    // Una pantalla que se mudó no va en ninguna vista: lo que se ve es la nueva, a la que redirige (prueba de abajo).
    if (PANTALLAS_MUDADAS[madre]) {
      expect(donde, `/empresa/[id]${madre} se mudó a ${PANTALLAS_MUDADAS[madre]}: no puede seguir en una vista`).toHaveLength(0);
      return;
    }
    expect(donde, `/empresa/[id]${madre} tiene que estar en las pantallas de una vista, y solo de una; está en: [${donde.join(", ")}]`).toHaveLength(1);
  });

  it("una pantalla que se mudó lleva a la nueva: redirección escrita en next.config.ts (307); si su carpeta vieja sigue, su page.tsx solo la repite", () => {
    const config = readFileSync(path.resolve(SRC, "../next.config.ts"), "utf8");
    expect(Object.keys(PANTALLAS_MUDADAS).length, "si esto falla, la prueba no mira nada").toBeGreaterThan(0);
    for (const [vieja, nueva] of Object.entries(PANTALLAS_MUDADAS)) {
      // La nueva existe y está en una vista.
      expect(RUTAS_EMPRESA, `${nueva} no tiene page.tsx`).toContain(nueva);
      expect(TODAS.filter((v) => v.sub.some(([h]) => h === nueva)), `${nueva} no está en una sola vista`).toHaveLength(1);
      // next.config.ts la redirige, NO permanente: un 308 se queda guardado en el navegador aunque se revierta.
      const regla = new RegExp(String.raw`source:\s*"/empresa/:id${vieja}",\s*destination:\s*"/empresa/:id${nueva}",\s*permanent:\s*false`);
      expect(config, `next.config.ts no redirige ${vieja} → ${nueva} con permanent: false`).toMatch(regla);
      // Mientras su carpeta exista, su página repite la redirección (nunca vuelve a pintar lo de antes). La de «Plan
      // estratégico» se retiró en el tramo 8 de spec-estrategia-8x.md: la redirección de next.config.ts basta.
      const pagina = path.join(SRC, `app/(consultor)/empresa/[id]${vieja}/page.tsx`);
      if (existsSync(pagina)) {
        const src = readFileSync(pagina, "utf8");
        expect(src, `${vieja}/page.tsx no redirige`).toMatch(/redirect\(/);
        expect(src, `${vieja}/page.tsx no lleva a ${nueva}`).toContain(`/estrategia`);
        expect(src, `${vieja}/page.tsx todavía lee o pinta algo`).not.toMatch(/supabaseAdmin|<article|BotonJob/);
      }
    }
  });

  it("ninguna pantalla de una vista apunta a algo que no existe, y ninguna se repite", () => {
    for (const v of TODAS) for (const [h] of v.sub) expect(RUTAS_EMPRESA, `la pantalla ${h || "(portada)"} de ${v.nombre} no tiene page.tsx`).toContain(h);
    const todas = TODAS.flatMap((v) => v.sub.map(([h]) => h));
    expect(new Set(todas).size, "una pantalla en dos vistas").toBe(todas.length);
    for (const v of TODAS) for (const [h, n] of v.sub) expect(n.trim(), `la pantalla ${h} de ${v.nombre} no tiene nombre`).not.toBe("");
  });

  it("las 20 pestañas de antes siguen abriendo: ninguna ruta vieja se borró sin llevar a la nueva", () => {
    const DE_ANTES = ["", "/direccion", "/fuentes", "/afirmaciones", "/realidad", "/entrevista", "/dia", "/procesos", "/organigrama", "/producto", "/madurez", "/diagnostico", "/debe-ser", "/plan-estrategico", "/plan", "/kpis", "/revision", "/excelencia", "/entrega", "/configuracion"];
    expect(DE_ANTES).toHaveLength(20);
    // Abre si tiene su page.tsx, o si se mudó y su dirección lleva a la nueva («Plan estratégico» → la estrategia).
    for (const r of DE_ANTES) expect(RUTAS_EMPRESA.includes(r) || !!PANTALLAS_MUDADAS[r], `${r || "(portada)"} ya no tiene page.tsx ni lleva a otra`).toBe(true);
  });

  it("la estrategia es la primera pantalla de la vista Estrategia; «Debe ser», la segunda", () => {
    const estrategia = VISTAS.find((v) => v.clave === "estrategia")!;
    expect(estrategia.href).toBe("/estrategia");
    expect(estrategia.sub.map(([h]) => h)).toEqual(["/estrategia", "/debe-ser"]);
    expect(RUTAS_EMPRESA).toContain("/estrategia");
  });

  it("«Excelencia» sigue enlazada: está en Avance", () => {
    expect(RUTAS_EMPRESA, "la pantalla de excelencia no existe: no se enlaza lo que no está construido").toContain("/excelencia");
    expect(VISTAS.find((v) => v.clave === "avance")?.sub).toContainEqual(["/excelencia", "Excelencia"]);
  });
});

// ————————————————————————————————————————— BARRAS DE LA CONSULTORA —————————————————————————————————————————

const navConsultor = leer("components/consultor/NavConsultor.tsx");
const layoutConsultor = leer("app/(consultor)/layout.tsx");

/** Las pantallas generales de la consultora: el primer tramo de cada ruta con page.tsx (/torre/mapa cuenta como /torre). */
const SECCIONES_CONSULTORA = [...new Set(rutasConPagina(path.join(SRC, "app/(consultor)")).map((r) => `/${r.split("/")[1]}`))].sort();
/** Y cada ruta entera con page.tsx: un enlace a /pulso/avisos se juzga por /pulso/avisos, no por /pulso. */
const RUTAS_CONSULTORA = rutasConPagina(path.join(SRC, "app/(consultor)")).filter(Boolean).sort();

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
    for (const { href } of [...PRINCIPALES_C, ...LATERAL]) expect(RUTAS_CONSULTORA, `NavConsultor enlaza ${href}, que no tiene page.tsx`).toContain(href);
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

// ————————————————————————————————————————————— RENASER OS —————————————————————————————————————————————
//
// RENASER OS (19-10-2026, prototipo aprobado) añade dos grupos a la barra de la empresa —«Mi día» y, para la gestión,
// «Mi equipo»— y el grupo «RENASER OS» a la de la consultora. La regla de siempre vale igual: toda pantalla de /os está
// en el menú (src/lib/os/menu.ts, que ES el menú) y ningún enlace apunta a algo que no existe. Los cinco destinos de
// la consultoría no se tocan.

const RUTAS_OS = rutasConPagina(path.join(SRC, "app/(os)/os")).map((r) => `/os${r}`);
const layoutOS = leer("app/(os)/os/layout.tsx");

describe("RENASER OS: toda pantalla de /os está en el menú, y el menú no cambia los cinco destinos", () => {
  it("se encontraron pantallas (si esto falla, la prueba no mira nada)", () => {
    expect(RUTAS_OS).toContain("/os");
    expect(RUTAS_MENU_OS.length).toBeGreaterThan(8);
  });

  it.each(RUTAS_OS.filter((r) => r !== "/os"))("%s se alcanza desde el menú de RENASER OS", (ruta) => {
    // La portada /os solo redirige (a la apertura, a Mi trabajo o al equipo); una ruta dinámica se abre desde su madre.
    expect(RUTAS_MENU_OS, `${ruta} tiene page.tsx y no está en src/lib/os/menu.ts`).toContain(madreDe(ruta));
  });

  it("ningún enlace del menú de RENASER OS apunta a una pantalla que no existe, y ninguno se repite", () => {
    for (const ruta of RUTAS_MENU_OS) expect(RUTAS_OS, `el menú enlaza ${ruta}, que no tiene page.tsx`).toContain(ruta);
    expect(new Set(RUTAS_MENU_OS).size, "una pantalla repetida en el menú de RENASER OS").toBe(RUTAS_MENU_OS.length);
  });

  it("cada destino del menú lleva su ícono dibujado (nunca un hueco)", () => {
    const iconos = leer("components/base/Icono.tsx");
    for (const [href, nombre, icono] of [...MI_DIA, ...MI_EQUIPO]) expect(iconos, `«${nombre}» (${href}) pide el ícono «${icono}»`).toMatch(new RegExp(`\\b${icono}: <`));
  });

  it("«Mi equipo» es solo de la gestión; el personal ve sus avisos dentro de «Mi día»; el perfil va al pie, no en un grupo", () => {
    expect(gruposOS({ gestion: true }).map((g) => g.titulo)).toEqual(["Mi día", "Mi equipo"]);
    expect(gruposOS({ gestion: false }).map((g) => g.titulo)).toEqual(["Mi día"]);
    expect(gruposOS({ gestion: false })[0]!.items).toContainEqual(AVISOS_OS);
    expect(gruposOS({ gestion: true })[0]!.items).not.toContainEqual(AVISOS_OS);
    for (const g of [...gruposOS({ gestion: true }), ...gruposOS({ gestion: false })]) expect(g.items.map(([h]) => h)).not.toContain(PERFIL_OS);
    expect(RUTAS_MENU_OS).toContain(PERFIL_OS);
  });

  it("los destinos de la consultoría que repite el menú de /os son los cinco de siempre, en el mismo orden", () => {
    expect(CONSULTORIA).toEqual(CINCO);
  });

  it("el layout del portal y el de /os pasan los grupos a NavCliente; sin grupos, la barra es la de siempre", () => {
    // En el portal, solo si la base ya tiene RENASER OS (`conOS`): el código puede llegar antes que la migración.
    expect(layoutCliente).toMatch(/<NavCliente[\s\S]*?grupos=\{conOS \? gruposOS\(/);
    expect(layoutCliente).toMatch(/const conOS = !!companyId && !sinOS;/);
    expect(layoutOS).toMatch(/<NavCliente[\s\S]*?grupos=\{gruposOS\(c\)\}/);
    expect(layoutOS.match(/<NavCliente\b/g) ?? []).toHaveLength(1);
    // El personal no recibe los destinos de la consultoría: solo quien la tiene.
    expect(layoutOS).toMatch(/enlaces=\{c\.consultoria \? CONSULTORIA : \[\]\}/);
    expect(navCliente).toMatch(/grupos\?: GrupoMenu\[\]/);
  });

  it("la barra de la consultora enlaza el pulso de empresas y los avisos de clientes, y las dos pantallas existen", () => {
    expect(LATERAL).toContainEqual({ href: "/pulso", nombre: "Pulso de empresas" });
    expect(LATERAL).toContainEqual({ href: "/pulso/avisos", nombre: "Avisos de clientes" });
    expect(RUTAS_CONSULTORA).toEqual(expect.arrayContaining(["/pulso", "/pulso/avisos"]));
    // El pulso no se enciende cuando se está en sus avisos.
    expect(navConsultor).toMatch(/item\("\/pulso", "Pulso de empresas", "pulso", true\)/);
  });
});

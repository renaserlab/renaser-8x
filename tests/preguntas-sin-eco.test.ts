import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { MODELO, MODELOS_NEGOCIO } from "@/lib/negocio";
import { AVISO_DATO_NEGATIVO, AVISO_DATO_NO_ENTENDIDO, AVISO_DATO_VACIO } from "@/lib/dato-oral";

/**
 * UNA PREGUNTA NO SUGIERE LA RESPUESTA (revisión del 16-10-2026, secciones 3a y 3b).
 *
 * Una pregunta traía una cifra de ejemplo y la dueña la repitió: lo que va dentro de la pregunta o de la caja se
 * devuelve como respuesta. Para Kelin «la magia está en saber preguntar, claro, bien, concreto», y 8X «no debe
 * marear». Las reglas que se fijan aquí, para la construcción «entrar hoy»:
 *  - Ni «Por ejemplo» ni «ej.» en una pregunta, un rótulo de casilla o un placeholder.
 *  - Un placeholder no trae cifras ni una lista de ejemplo («Tela, costura, lavado…»): la lista se queda corta y el
 *    dueño solo nombra lo que ve.
 *  - Una sola pregunta por texto (un «¿» y un «?»).
 *  - Se pide el episodio o el conteo, no el promedio: nada de «en un mes normal», «más o menos», «suele» ni
 *    «promedio» en una pregunta o un rótulo.
 *  - Registro formal y cálido: «dinero», nunca «plata».
 *
 * Cómo se leen los textos: cada archivo se recorre como código (sin comentarios); se toman sus cadenas y el texto
 * suelto de JSX. Es pregunta todo texto con «¿»; es placeholder lo que va en `placeholder`, `placeholderPartes` o una
 * constante PISTA_*; es rótulo lo que va en `etiqueta`, `ayuda`, `titulo`, `aria-label` o `pregunta*`.
 */

/** Los archivos de la construcción «entrar hoy» (nuevos o tocados el 16-10-2026). */
const ARCHIVOS = [
  "src/app/(cliente)/layout.tsx",
  "src/app/(cliente)/portal/activos/page.tsx",
  "src/app/(cliente)/portal/cobros/page.tsx",
  "src/app/(cliente)/portal/costos/page.tsx",
  "src/app/(cliente)/portal/historia/page.tsx",
  "src/app/(cliente)/portal/kpis/page.tsx",
  "src/app/(cliente)/portal/numeros/page.tsx",
  "src/app/(cliente)/portal/page.tsx",
  "src/app/(cliente)/portal/pedidos/page.tsx",
  "src/app/(cliente)/portal/procesos/[p]/page.tsx",
  "src/app/(cliente)/portal/procesos/page.tsx",
  "src/app/(cliente)/portal/producto/page.tsx",
  "src/app/(cliente)/portal/validar/page.tsx",
  "src/app/(consultor)/empresa/[id]/kpis/page.tsx",
  "src/app/(consultor)/empresa/[id]/layout.tsx",
  "src/app/(consultor)/empresa/[id]/organigrama/page.tsx",
  "src/app/(consultor)/empresa/[id]/page.tsx",
  "src/app/(consultor)/empresa/[id]/procesos/[p]/page.tsx",
  "src/app/(consultor)/empresa/[id]/procesos/page.tsx",
  "src/app/(consultor)/empresa/[id]/producto/page.tsx",
  "src/app/(consultor)/layout.tsx",
  "src/app/api/companies/[id]/costos/[cid]/route.ts",
  "src/app/api/companies/[id]/costos/route.ts",
  "src/app/api/companies/[id]/indicadores/route.ts",
  "src/app/api/companies/[id]/kpis/[kid]/route.ts",
  "src/app/api/companies/[id]/kpis/[kid]/valor/route.ts",
  "src/app/api/companies/[id]/kpis/_registro.ts",
  "src/app/api/companies/[id]/kpis/route.ts",
  "src/app/api/companies/[id]/medicion/route.ts",
  "src/app/api/companies/[id]/moneda/[oid]/route.ts",
  "src/app/api/companies/[id]/moneda/route.ts",
  "src/app/api/companies/[id]/negocio/_comun.ts",
  "src/app/api/companies/[id]/negocio/route.ts",
  "src/app/api/companies/[id]/procesos/importar/route.ts",
  "src/app/api/companies/[id]/procesos/route.ts",
  "src/app/api/companies/[id]/producto/[lid]/route.ts",
  "src/app/api/companies/[id]/producto/esquemas.ts",
  "src/app/api/companies/[id]/producto/importar/route.ts",
  "src/app/api/companies/[id]/producto/route.ts",
  "src/app/api/companies/[id]/ruta/route.ts",
  "src/app/api/companies/[id]/solicitudes/[sid]/route.ts",
  "src/app/api/companies/[id]/solicitudes/route.ts",
  "src/app/api/portal/numeros/route.ts",
  "src/app/api/processes/[id]/dibujar/route.ts",
  "src/components/cliente/BarraRutaCliente.tsx",
  "src/components/cliente/EnEstaSeccion.tsx",
  "src/components/cliente/Indicadores.tsx",
  "src/components/cliente/NavCliente.tsx",
  "src/components/consultor/ActivarParaCliente.tsx",
  "src/components/consultor/FichaDeTrabajo.tsx",
  "src/components/consultor/MarcarCompuerta.tsx",
  "src/components/consultor/NavConsultor.tsx",
  "src/components/consultor/TabsEmpresa.tsx",
  "src/components/kpis/FormularioKpi.tsx",
  "src/components/kpis/RegistrarValor.tsx",
  "src/components/kpis/TableroKpis.tsx",
  "src/components/kpis/TusIndicadores.tsx",
  "src/components/navegacion/BarraRuta.tsx",
  "src/components/navegacion/Lateral.tsx",
  "src/components/negocio/CampoDato.tsx",
  "src/components/negocio/CobrosYMercaderia.tsx",
  "src/components/negocio/CostosMes.tsx",
  "src/components/negocio/ElegirModelo.tsx",
  "src/components/negocio/EstadoDato.tsx",
  "src/components/negocio/HistoriaNegocio.tsx",
  "src/components/negocio/ListoParaConsultora.tsx",
  "src/components/negocio/Marcas.tsx",
  "src/components/negocio/MatrizMargenVolumen.tsx",
  "src/components/negocio/Palancas.tsx",
  "src/components/negocio/PedidoDeConsultora.tsx",
  "src/components/negocio/PedidosCliente.tsx",
  "src/components/negocio/TablaProductos.tsx",
  "src/components/negocio/TableroRentabilidad.tsx",
  "src/components/negocio/dato.ts",
  "src/components/negocio/datos.ts",
  "src/components/procesos/AbrirArchivo.tsx",
  "src/components/procesos/ArchivosDelProceso.tsx",
  "src/components/procesos/DibujarDesdeArchivo.tsx",
  "src/components/procesos/FranjaSubido.tsx",
  "src/components/procesos/ImportarProcesos.tsx",
  "src/components/procesos/SubirProceso.tsx",
  "src/components/procesos/datos.ts",
  "src/components/procesos/subidas.ts",
  "src/lib/dato-oral.ts",
  "src/lib/esquemas-negocio.ts",
  "src/lib/kpis.ts",
  "src/lib/negocio-datos.ts",
  "src/lib/negocio.ts",
  "src/lib/producto.ts",
  "src/lib/rentabilidad.ts",
  "src/lib/ruta-datos.ts",
  "src/lib/ruta.ts",
  "src/lib/secciones.ts",
  "src/lib/siguiente-accion.ts",
  "src/lib/solicitudes.ts",
  "src/lib/tablero.ts",
];

/** Los que no pueden faltar: si uno se mueve, esta lista se actualiza (no se deja de revisar en silencio). */
const IMPRESCINDIBLES = [
  "src/lib/negocio.ts",
  "src/components/negocio/TablaProductos.tsx",
  "src/components/negocio/CostosMes.tsx",
  "src/components/negocio/HistoriaNegocio.tsx",
  "src/components/negocio/CobrosYMercaderia.tsx",
  "src/components/negocio/CampoDato.tsx",
];

type Tipo = "pregunta" | "placeholder" | "rotulo";
type Texto = { archivo: string; linea: number; tipo: Tipo; texto: string };

/** Marca de lo que va dentro de `${…}` en una plantilla: no trae cifras ni signos de pregunta. */
const EXPR = "⟨⟩";

/**
 * Recorre un archivo como código: separa las cadenas (comillas y plantillas, con lo de `${…}` aparte) y devuelve el
 * código sin comentarios, con cada cadena cambiada por `""` y los mismos saltos de línea (para numerar).
 */
function trocear(src: string): { cadenas: { texto: string; linea: number; antes: string }[]; codigo: string } {
  const cadenas: { texto: string; linea: number; antes: string }[] = [];
  const out: string[] = [];
  const n = src.length;
  let i = 0;
  let linea = 1;
  const antesDe = (pos: number) => src.slice(src.lastIndexOf("\n", pos - 1) + 1, pos);

  // Una «/» abre una expresión regular si lo anterior no puede terminar un valor (heurística clásica).
  const abreRegex = (): boolean => {
    const previo = out.join("").replace(/[ \t\r]+$/, "");
    if (!previo || previo.endsWith("\n")) return true;
    if (/\b(return|typeof|case|in|of)$/.test(previo)) return true;
    return /[(,=:[!&|?{};+\-*%~^]$/.test(previo);
  };

  const regex = () => {
    let enClase = false;
    i++;
    while (i < n) {
      const c = src[i]!;
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") return;
      if (c === "[") enClase = true;
      else if (c === "]") enClase = false;
      else if (c === "/" && !enClase) { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/.test(src[i]!)) i++;
    out.push("/r/");
  };

  const cadena = (q: string) => {
    const desde = i;
    const l = linea;
    let t = "";
    i++;
    while (i < n && src[i] !== q && src[i] !== "\n") {
      if (src[i] === "\\") { t += src[i + 1] ?? ""; i += 2; continue; }
      t += src[i];
      i++;
    }
    if (src[i] === q) i++;
    cadenas.push({ texto: t, linea: l, antes: antesDe(desde) });
    out.push('""');
  };

  const plantilla = () => {
    const desde = i;
    const l = linea;
    let t = "";
    i++;
    while (i < n && src[i] !== "`") {
      const c = src[i]!;
      if (c === "\\") { t += src[i + 1] ?? ""; i += 2; continue; }
      if (c === "$" && src[i + 1] === "{") {
        i += 2;
        t += EXPR;
        codigo(true);
        continue;
      }
      if (c === "\n") { out.push("\n"); linea++; }
      t += c;
      i++;
    }
    i++;
    cadenas.push({ texto: t, linea: l, antes: antesDe(desde) });
    out.push('""');
  };

  function codigo(dentroDePlantilla: boolean) {
    let prof = 0;
    while (i < n) {
      const c = src[i]!;
      const d = src[i + 1];
      if (c === "\n") { out.push("\n"); linea++; i++; continue; }
      if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") {
        const fin = src.indexOf("*/", i + 2);
        const hasta = fin < 0 ? n : fin + 2;
        for (let k = i; k < hasta; k++) if (src[k] === "\n") { out.push("\n"); linea++; }
        i = hasta;
        continue;
      }
      if (c === '"' || c === "'") { cadena(c); continue; }
      if (c === "`") { plantilla(); continue; }
      if (c === "/" && abreRegex()) { regex(); continue; }
      if (dentroDePlantilla) {
        if (c === "{") prof++;
        else if (c === "}") {
          if (prof === 0) { i++; return; }
          prof--;
        }
      }
      out.push(c);
      i++;
    }
  }

  codigo(false);
  return { cadenas, codigo: out.join("") };
}

/** Lo que hay en la línea antes de la cadena: la clave a la que va, sin otra cadena ni una llave cerrada de por medio. */
const CONTEXTO_PLACEHOLDER = /(?:placeholder\w*|PISTA_\w+|NOMBRE_PARTE)\s*[=:]\s*\{?[^}"'`]*$/i;
const CONTEXTO_ROTULO = /(?:etiqueta|ayuda|titulo|aria-label|pregunta\w*)\s*[=:]\s*\{?[^}"'`]*$/i;

/** El texto suelto de JSX de una línea de código (sin cadenas): lo que queda fuera de llaves y etiquetas. */
function textoJsx(lineaDeCodigo: string): string[] {
  let s = lineaDeCodigo;
  for (let previo = ""; previo !== s; ) {
    previo = s;
    s = s.replace(/\{[^{}]*\}/g, " ¦ ");
  }
  s = s.replace(/<\/?[A-Za-z][^<>]*\/?>/g, " ¦ ");
  return s.split("¦").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function textosDe(archivo: string): Texto[] {
  const src = readFileSync(path.join(process.cwd(), archivo), "utf8");
  const { cadenas, codigo } = trocear(src);
  const salida: Texto[] = [];
  for (const c of cadenas) {
    const texto = c.texto.replace(/\s+/g, " ").trim();
    if (!texto) continue;
    // Un placeholder que pregunta («¿Cuánto en …?») se revisa como placeholder y también como pregunta.
    const esPista = CONTEXTO_PLACEHOLDER.test(c.antes);
    if (esPista) salida.push({ archivo, linea: c.linea, tipo: "placeholder", texto });
    if (texto.includes("¿")) salida.push({ archivo, linea: c.linea, tipo: "pregunta", texto });
    else if (!esPista && CONTEXTO_ROTULO.test(c.antes)) salida.push({ archivo, linea: c.linea, tipo: "rotulo", texto });
  }
  codigo.split("\n").forEach((l, k) => {
    for (const t of textoJsx(l)) if (t.includes("¿")) salida.push({ archivo, linea: k + 1, tipo: "pregunta", texto: t });
  });
  return salida;
}

const existentes = ARCHIVOS.filter((a) => existsSync(path.join(process.cwd(), a)));
const TEXTOS = existentes.flatMap(textosDe);
const de = (tipo: Tipo) => TEXTOS.filter((t) => t.tipo === tipo);
const donde = (t: Texto) => `${t.archivo}:${t.linea} · «${t.texto}»`;

const POR_EJEMPLO = /por ejemplo|(?:^|[\s(«])(?:p\.\s?)?ej\.|\(ej\b/i;
const PLATA = /\bplata\b/i;
const PROMEDIO = /\ben un (?:mes|d[ií]a) normal\b|\bm[aá]s o menos\b|\bpromedio\b|\bnormalmente\b|\bsuel(?:e|en|es)\b|\bpor lo general\b/i;
/** Una lista de ejemplo: entre paréntesis con comas, o dos o más comas que terminan en «…». */
const LISTA = /\([^)]*,[^)]*\)|(?:[^,]+,){2,}[^,]*(?:…|\.\.\.)/;
const LISTA_EN_PISTA = /,[^,]*(?:…|\.\.\.)\s*$|(?:[^,]*,){2,}/;
const cuenta = (t: string, c: string) => t.split(c).length - 1;

describe("las preguntas de «entrar hoy» no sugieren la respuesta", () => {
  it("se revisan los archivos de la construcción, y hay preguntas que revisar", () => {
    for (const a of IMPRESCINDIBLES) expect(existentes, `falta ${a}: actualiza ARCHIVOS`).toContain(a);
    expect(de("pregunta").length).toBeGreaterThan(40);
    expect(de("placeholder").length).toBeGreaterThan(5);
  });

  it("ni «Por ejemplo» ni «ej.» en una pregunta, un rótulo o un placeholder", () => {
    expect(TEXTOS.filter((t) => POR_EJEMPLO.test(t.texto)).map(donde)).toEqual([]);
  });

  it("«dinero», nunca «plata»", () => {
    expect(TEXTOS.filter((t) => PLATA.test(t.texto)).map(donde)).toEqual([]);
  });

  it("un placeholder no trae cifras ni una lista de ejemplo", () => {
    expect(de("placeholder").filter((t) => /\d/.test(t.texto)).map(donde), "una cifra en la caja se devuelve como respuesta").toEqual([]);
    expect(de("placeholder").filter((t) => LISTA_EN_PISTA.test(t.texto)).map(donde), "la lista se queda corta y el dueño solo nombra lo que ve").toEqual([]);
  });

  it("una sola pregunta por texto", () => {
    expect(de("pregunta").filter((t) => cuenta(t.texto, "¿") > 1 || cuenta(t.texto, "?") > 1).map(donde)).toEqual([]);
  });

  it("se pide el episodio o el conteo: nada de «en un mes normal», «más o menos», «suele» ni «promedio»", () => {
    expect(TEXTOS.filter((t) => t.tipo !== "placeholder" && PROMEDIO.test(t.texto)).map(donde)).toEqual([]);
  });

  it("ninguna pregunta ni rótulo trae una lista de ejemplo", () => {
    expect(TEXTOS.filter((t) => t.tipo !== "placeholder" && LISTA.test(t.texto)).map(donde)).toEqual([]);
  });

  it("los casos que señaló la revisión del 16-10 no vuelven", () => {
    const todo = TEXTOS.map((t) => t.texto).join("\n");
    for (const viejo of [
      "Tela, costura, lavado, accesorios",
      "Alquiler, sueldos fijos, luz",
      "Pantalones, polos, casacas",
      "¿Cuál fue tu mejor época? ¿Cuándo fue",
      "En un mes normal",
      "te pagan, más o menos",
      "Por ejemplo: cómo se atiende un pedido",
    ]) expect(todo, viejo).not.toContain(viejo);
  });
});

describe("el vocabulario de cada modelo de negocio (src/lib/negocio.ts)", () => {
  const preguntas = MODELOS_NEGOCIO.flatMap((m) => {
    const d = MODELO[m];
    return [d.preguntaPrecio, d.preguntaPrecioPorHora, d.preguntaSegundoPrecio, d.preguntaCosto, d.preguntaVolumen]
      .filter((p): p is string => !!p)
      .map((p) => ({ m, p }));
  });

  it("cada pregunta es una sola, sin «normal», sin promedio y sin ejemplos", () => {
    for (const { m, p } of preguntas) {
      expect(cuenta(p, "¿"), `${m}: ${p}`).toBe(1);
      expect(cuenta(p, "?"), `${m}: ${p}`).toBe(1);
      expect(p, m).not.toMatch(/\bnormal\b/i);
      expect(p, m).not.toMatch(PROMEDIO);
      expect(p, m).not.toMatch(POR_EJEMPLO);
      expect(p, m).not.toMatch(LISTA);
    }
  });

  it("la pista de las partes del costo es neutra: sin cifras, sin lista, sin «…»", () => {
    for (const m of MODELOS_NEGOCIO) {
      const pista = MODELO[m].placeholderPartes;
      expect(pista, m).not.toMatch(/\d/);
      expect(pista, m).not.toMatch(/,|…/);
    }
  });

  it("el volumen se pregunta por el episodio, en la unidad en que se convierte", () => {
    for (const m of MODELOS_NEGOCIO) {
      const d = MODELO[m];
      const ancla = d.volumenSeDicePor === "mes" ? /^El mes pasado, ¿/ : d.volumenSeDicePor === "trimestre" ? /^En los últimos tres meses, ¿/ : /^El último día que abriste, ¿/;
      expect(d.preguntaVolumen, m).toMatch(ancla);
    }
  });
});

describe("los avisos de la caja no traen cifras de muestra (src/lib/dato-oral.ts)", () => {
  it("vacío, negativo y no entendido: dicen qué hacer sin un número que repetir", () => {
    for (const a of [AVISO_DATO_VACIO, AVISO_DATO_NEGATIVO, AVISO_DATO_NO_ENTENDIDO]) {
      expect(a).not.toMatch(/\d/);
      expect(a).not.toMatch(POR_EJEMPLO);
    }
  });
});

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { MODELO, MODELOS_NEGOCIO } from "@/lib/negocio";
import { AVISO_DATO_NEGATIVO, AVISO_DATO_NO_ENTENDIDO, AVISO_DATO_VACIO } from "@/lib/dato-oral";
import { BLOQUES } from "@/lib/rules/cobertura";
import { BLOQUES_ACTIVOS, PISTA_RESPUESTA } from "@/lib/activos";
import { MATRICES } from "@/lib/rules/matrices";
import { CULTURAS } from "@/lib/rules/cultura";
import { PLAN_ENTRADA, CUAL_SE_VENDIO_MAS } from "@/lib/entrada";
import {
  VITALES, RECONOCIDAS, VITAL_POR_CLAVE, deCadaDiez, claveDeConteo, campoDeValor, comoSeMide, cuerpoDeNumeros, revisarNumerosEscritos,
  esCampoDeConteo, AVISO_CONTEO, type FormularioNumeros,
} from "@/lib/metricas";
import { PROMPT_ENTREVISTADOR } from "@/lib/ai/agents/entrevistador";
import { PROMPT_DIAGNOSTICADOR } from "@/lib/ai/agents/diagnosticador";

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
  // Vistas limpias (16-10-2026): cinco vistas para la consultora y cinco destinos para el dueño. Los archivos nuevos con
  // texto de pantalla de los cuatro constructores; el que todavía no existe se salta (existsSync), no se revisa a medias.
  "src/app/(cliente)/portal/diagnostico/page.tsx",
  "src/app/(consultor)/empresa/[id]/avance/page.tsx",
  "src/app/(consultor)/empresa/[id]/expediente/page.tsx",
  "src/app/(consultor)/empresa/[id]/numeros/page.tsx",
  "src/components/cliente/CorregirDato.tsx",
  "src/components/consultor/EnEstaVista.tsx",
  "src/components/consultor/MenuAdministrar.tsx",
  "src/components/consultor/SeguimientoConversacion.tsx",
  "src/components/diagnostico/PedirAlCliente.tsx",
  "src/components/diagnostico/TableroDiagnostico.tsx",
  "src/components/numeros/NueveNumeros.tsx",
  "src/components/procesos/ResumenProcesos.tsx",
  "src/lib/correccion-dato.ts",
  "src/lib/diagnostico-datos.ts",
  "src/lib/diagnostico-tablero.ts",
  "src/lib/incongruencias.ts",
  "src/lib/numeros-vista.ts",
  "src/lib/vistas-empresa.ts",
  // Las pantallas que muestran los bancos de preguntas (limpieza del 16-10-2026): «Tus números» y el levantamiento
  // de documentos, donde estaban las cifras de muestra («p. ej. 8 mil») y las 34 respuestas modelo.
  "src/components/cliente/MisNumeros.tsx",
  "src/components/cliente/InventarioActivos.tsx",
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

/**
 * LOS BANCOS DE PREGUNTAS Y LAS INSTRUCCIONES DE LAS IA QUE PREGUNTAN (revisión del 16-10-2026, sección 3 y pieza 1).
 *
 * La entrevista de una clienta traía cifras dentro de la pregunta y ella las devolvió como suyas. La raíz estaba en
 * dos lados: los bancos de preguntas (ejemplos entre paréntesis, listas después de dos puntos, dos preguntas pegadas
 * con «…y», promedios) y la IA que entrevista, que tenía la orden escrita de cerrar cada pregunta con «(Por ejemplo:
 * …)» y de repreguntar con un menú de opciones. Aquí se recorre todo lo que una persona escucha o lee como pregunta:
 * los cinco bancos, los nueve números, el plan de la entrada breve, las preguntas de cultura y del modelo de negocio,
 * y los prompts del entrevistador y del diagnosticador. Una pregunta falla si trae:
 *  - «Por ejemplo» o «ej.»;
 *  - una cifra: cualquier dígito, un porcentaje o el marco de una proporción («de cada diez»). Una cantidad que solo
 *    fija el alcance va en letras («tus últimos cinco clientes»): una pregunta oral no lleva dígitos;
 *  - una lista: después de dos puntos, entre paréntesis o abierta con «…»;
 *  - dos preguntas en una: dos signos de abrir o de cerrar pregunta, o una segunda pegada con «y», «o» o «ni»
 *    («¿Qué vendes y a quién?»). Una pregunta que empieza con «¿Y…» es una sola;
 *  - «plata»;
 *  - un promedio en vez del episodio («en un mes normal», «más o menos», «suele»).
 */
type DeBanco = { banco: string; texto: string };

const BANCOS: DeBanco[] = [
  ...Object.entries(BLOQUES).flatMap(([tipo, bloques]) => bloques.flatMap((b) => b.preguntas.map((texto) => ({ banco: `rules/cobertura.ts · ${tipo}.${b.clave}`, texto })))),
  ...BLOQUES_ACTIVOS.flatMap((b) => b.activos.flatMap((a) => a.preguntas.map((texto) => ({ banco: `activos.ts · ${b.clave}.${a.clave}`, texto })))),
  ...MATRICES.flatMap((m) => m.preguntas.map((texto) => ({ banco: `rules/matrices.ts · ${m.clave}`, texto }))),
  ...[...VITALES, ...RECONOCIDAS].flatMap((v) => [v.pregunta, ...(v.seguida ? [v.seguida] : [])].map((texto) => ({ banco: `metricas.ts · ${v.clave}`, texto }))),
  ...PLAN_ENTRADA.map((p) => ({ banco: `entrada.ts · ${p.clave}`, texto: p.texto })),
  { banco: "entrada.ts · CUAL_SE_VENDIO_MAS", texto: CUAL_SE_VENDIO_MAS },
  ...CULTURAS.map((c) => ({ banco: `rules/cultura.ts · ${c.clave}`, texto: c.pregunta })),
  ...MODELOS_NEGOCIO.flatMap((m) => {
    const d = MODELO[m];
    return [d.preguntaPrecio, d.preguntaPrecioPorHora, d.preguntaSegundoPrecio, d.preguntaCosto, d.preguntaVolumen]
      .filter((p): p is string => !!p)
      .map((texto) => ({ banco: `negocio.ts · ${m}`, texto }));
  }),
];
const lugar = (t: DeBanco) => `${t.banco} · «${t.texto}»`;

/** Una cifra dentro de la pregunta: un dígito, un porcentaje o el marco de una proporción. */
const CIFRA = /\d|%|\bpor ciento\b|\bde cada (?:diez|cien|veinte|mil)\b/i;
/** Una lista: después de dos puntos (con una coma más adelante), entre paréntesis, o abierta con puntos suspensivos. */
const LISTA_TRAS_DOS_PUNTOS = /:[^:]*,/;
const ENTRE_PARENTESIS = /\([^)]*\)/;
const SUSPENSIVOS = /…|\.\.\./;
/** Una segunda pregunta pegada a la primera con «y», «o» o «ni» («¿qué vendes y a quién?»), no al empezar. */
const PEGADA = /[^\s¿]\s*,?\s+(?:y|o|ni)\s+(?:(?:a|de|en|con|hasta|desde|para)\s+)?(?:qué|cuánt[oa]s?|cuál(?:es)?|quién(?:es)?|cómo|dónde|cuándo|por qué)(?![\p{L}])/iu;
const dosPreguntas = (t: string) => cuenta(t, "¿") > 1 || cuenta(t, "?") > 1 || PEGADA.test(t);

describe("los bancos de preguntas no sugieren la respuesta", () => {
  it("se recorren todos los bancos, y hay preguntas en cada uno", () => {
    for (const banco of ["rules/cobertura.ts", "activos.ts", "rules/matrices.ts", "metricas.ts", "entrada.ts", "rules/cultura.ts", "negocio.ts"])
      expect(BANCOS.filter((t) => t.banco.startsWith(banco)).length, banco).toBeGreaterThan(3);
    expect(BANCOS.length).toBeGreaterThan(250);
  });

  it("ni «Por ejemplo» ni «ej.»", () => {
    expect(BANCOS.filter((t) => POR_EJEMPLO.test(t.texto)).map(lugar)).toEqual([]);
  });

  it("ninguna cifra de ejemplo: ni dígitos, ni porcentajes, ni «de cada diez»", () => {
    expect(BANCOS.filter((t) => CIFRA.test(t.texto)).map(lugar), "una cifra dentro de la pregunta se devuelve como respuesta").toEqual([]);
  });

  it("ninguna lista: ni después de dos puntos, ni entre paréntesis, ni abierta con «…»", () => {
    expect(BANCOS.filter((t) => LISTA_TRAS_DOS_PUNTOS.test(t.texto)).map(lugar), "la lista se queda corta y el dueño solo nombra lo que ve").toEqual([]);
    expect(BANCOS.filter((t) => ENTRE_PARENTESIS.test(t.texto)).map(lugar), "lo que va entre paréntesis es un ejemplo").toEqual([]);
    expect(BANCOS.filter((t) => SUSPENSIVOS.test(t.texto)).map(lugar), "«…» abre una lista o pega dos preguntas").toEqual([]);
  });

  it("una sola pregunta por texto: ni dos signos de pregunta, ni una segunda pegada con «y» u «o»", () => {
    expect(BANCOS.filter((t) => dosPreguntas(t.texto)).map(lugar)).toEqual([]);
  });

  it("«dinero», nunca «plata»", () => {
    expect(BANCOS.filter((t) => PLATA.test(t.texto)).map(lugar)).toEqual([]);
  });

  it("el episodio, no el promedio: nada de «en un mes normal», «más o menos» ni «suele»", () => {
    expect(BANCOS.filter((t) => PROMEDIO.test(t.texto) || /\b(?:semana|mes) normal\b/i.test(t.texto)).map(lugar)).toEqual([]);
  });

  it("la regla atrapa lo que la revisión señaló (si deja de atraparlo, la prueba no prueba nada)", () => {
    expect(CIFRA.test("De cada 10 personas que preguntan por tu producto, ¿cuántas terminan pagando?")).toBe(true);
    expect(CIFRA.test("De cada diez personas que preguntan, ¿cuántas compran?")).toBe(true);
    expect(LISTA_TRAS_DOS_PUNTOS.test("¿Dónde queda apuntado todo: cuaderno, WhatsApp, Excel… o en la cabeza de alguien?")).toBe(true);
    expect(ENTRE_PARENTESIS.test("¿Cuánto gastas para que te llegue un cliente nuevo (anuncios, comisiones, lo que sea)?")).toBe(true);
    expect(dosPreguntas("¿Qué vendes, a quién, y qué de todo eso te deja más dinero?")).toBe(true);
    expect(dosPreguntas("¿Qué vendes y a quién?")).toBe(true);
    expect(dosPreguntas("¿Hay alguien que haga de todo un poco? ¿Qué cosas?")).toBe(true);
    expect(PLATA.test("¿Qué es lo que tu empresa NUNCA haría, aunque se pierda plata?")).toBe(true);
    expect(PROMEDIO.test("En un mes normal, ¿cuánto vendes en total?")).toBe(true);
    // Y deja pasar lo que está bien: una pregunta que empieza con «¿Y…», o un «y» que no abre otra pregunta.
    expect(dosPreguntas("¿Y qué recibe de verdad?")).toBe(false);
    expect(dosPreguntas("Cuéntame lo último que probaron en tu empresa y que nunca habían hecho.")).toBe(false);
  });

  it("las doce preguntas que señaló la revisión quedaron con su versión buena, en su archivo", () => {
    const de = (prefijo: string) => BANCOS.filter((t) => t.banco.startsWith(prefijo)).map((t) => t.texto);
    const entrada = new Map(PLAN_ENTRADA.map((p) => [p.clave, p.texto]));
    // 2, 3, 4 y 5: la entrada breve, con la otra mitad de cada una en el banco de la entrevista.
    expect(entrada.get("entrada.ventas_y_ganancia")).toBe("El mes pasado, ¿cuánto vendiste en total?");
    expect(de("rules/cobertura.ts")).toContain("Ese mes, ¿cuánto dinero sacaste del negocio para ti?");
    expect(entrada.get("entrada.que_vende_estrella")).toBe("¿Qué vendes? Dime los nombres, uno por uno.");
    expect(de("rules/cobertura.ts")).toContain("El mes pasado, ¿cuál de esos vendiste más veces?");
    expect(entrada.get("entrada.que_se_detiene_sin_mi")).toBe("La última vez que faltaste al negocio, ¿qué se quedó esperando hasta que volviste?");
    expect(entrada.get("entrada.recursos_desaprovechados")).toBe("La semana pasada, ¿qué máquina o espacio del negocio no se usó?");
    expect(de("rules/cobertura.ts · entrada_breve")).toContain("De los clientes que ya no te compran, ¿de cuántos tienes todavía el número?");
    // 6 y 7: los nueve números. La conversión se cuenta en dos preguntas; el gasto fijo, sin lista.
    const conversion = VITAL_POR_CLAVE.get("conversion_de_cada_10")!;
    expect([conversion.pregunta, conversion.seguida]).toEqual(["El último día que abriste, ¿cuántas personas preguntaron por lo que vendes?", "De ellas, ¿cuántas compraron?"]);
    expect(VITAL_POR_CLAVE.get("gasto_fijo_mes")!.pregunta).toBe("El mes pasado, sumando todo lo que pagas vendas o no vendas, ¿cuánto pagaste?");
    // 8, 9 y 10: el banco de la entrevista.
    for (const q of [
      "Tu última venta de ayer, ¿dónde quedó anotada?",
      "El mes pasado, ¿cuánto pagaste en publicidad?",
      "¿Y en comisiones?",
      "¿Cuántos clientes nuevos llegaron ese mes?",
      "¿En qué mes notaste que las ventas empezaban a bajar?",
      "Ese mes, ¿qué cambió dentro del negocio?",
      "Y afuera del negocio, ¿qué pasó ese mismo mes?",
    ]) expect(de("rules/cobertura.ts"), q).toContain(q);
    // 11: las preguntas del oficio.
    expect(de("rules/matrices.ts")).toContain("El mes pasado, ¿qué producto vendiste más veces?");
    // 12: los documentos de la empresa.
    expect(de("activos.ts")).toEqual(expect.arrayContaining(["Cuéntame una venta que rechazaste.", "¿Por qué la rechazaste?"]));
  });

  it("los casos que señaló la revisión no vuelven a ningún banco", () => {
    const todo = BANCOS.map((t) => t.texto).join("\n");
    for (const viejo of [
      "por dato o por ojo",
      "Sueldos, alquiler y servicios",
      "De cada 10",
      "aunque se pierda plata",
      "(anuncios, comisiones",
      "cuaderno, WhatsApp, Excel",
      "competencia, precios, la zona",
      "un local, una máquina, una persona",
      "Si tú no vas al negocio durante una semana",
    ]) expect(todo, viejo).not.toContain(viejo);
  });
});

describe("la caja de cada pregunta no trae una respuesta modelo (src/lib/activos.ts)", () => {
  it("la pista es una sola, neutra: sin cifras, sin nombres, sin «Por ejemplo»", () => {
    expect(PISTA_RESPUESTA).toBe("Cuéntalo con tus palabras.");
    expect(PISTA_RESPUESTA).not.toMatch(CIFRA);
    expect(PISTA_RESPUESTA).not.toMatch(POR_EJEMPLO);
  });
});

describe("lo que es una proporción se cuenta en dos preguntas, y la cuenta la hace 8X (src/lib/metricas.ts)", () => {
  const vacio = { periodo: "", monto: "" };
  const formulario = (valores: Record<string, string>, sinDato: string[] = []): FormularioNumeros => ({
    valores, meses: {}, mejor: vacio, peor: vacio, sinDato, mesPasado: "2026-09", mesesConVenta: [],
  });
  const total = claveDeConteo("conversion_de_cada_10", "total");
  const parte = claveDeConteo("conversion_de_cada_10", "parte");

  it("de cada diez, con un decimal; sin los dos conteos, con cero personas o con más compras que personas, no hay cuenta", () => {
    expect(deCadaDiez(8, 2)).toBe(2.5);
    expect(deCadaDiez(3, 3)).toBe(10);
    expect(deCadaDiez(7, 0)).toBe(0);
    for (const [t, p] of [[0, 0], [3, 5], [null, 2], [8, null], [-1, 0]] as const) expect(deCadaDiez(t, p), `${t}/${p}`).toBeNull();
  });

  it("Tus números envía el número calculado, nunca las dos cajas sueltas", () => {
    expect(cuerpoDeNumeros(formulario({ [total]: "8", [parte]: "2" })).vitales).toEqual({ conversion_de_cada_10: 2.5 });
    expect(cuerpoDeNumeros(formulario({ [total]: "8" })).vitales, "con un solo conteo no se inventa la cuenta").toEqual({});
    expect(cuerpoDeNumeros(formulario({ [total]: "8", [parte]: "2" }, ["conversion_de_cada_10"])).vitales, "«No lo sé» manda").toEqual({});
  });

  it("un conteo a medias o imposible detiene el guardado y se dice por qué, sin cifras de muestra", () => {
    expect(revisarNumerosEscritos(formulario({ [total]: "8" }))).toMatchObject({ invalidos: [campoDeValor(parte)], listo: false });
    expect(revisarNumerosEscritos(formulario({ [parte]: "2" }))).toMatchObject({ invalidos: [campoDeValor(total)], listo: false });
    expect(revisarNumerosEscritos(formulario({ [total]: "2", [parte]: "5" }))).toMatchObject({ invalidos: [campoDeValor(parte)], listo: false });
    expect(revisarNumerosEscritos(formulario({ [total]: "8", [parte]: "2" })).listo).toBe(true);
    expect(revisarNumerosEscritos(formulario({ [total]: "8" }, ["conversion_de_cada_10"])).listo, "con «No lo sé» no se revisa").toBe(true);
    expect(esCampoDeConteo(campoDeValor(parte))).toBe(true);
    expect(esCampoDeConteo(campoDeValor("conversion_de_cada_10"))).toBe(false);
    expect(AVISO_CONTEO).not.toMatch(CIFRA);
  });

  it("el indicador que nace de la conversión dice cómo se mide: los dos conteos y quién hace la cuenta", () => {
    const como = comoSeMide(VITAL_POR_CLAVE.get("conversion_de_cada_10")!);
    expect(como).toContain("¿cuántas personas preguntaron");
    expect(como).toContain("¿cuántas compraron?");
    expect(como).toContain("La cuenta la hace 8X");
    expect(comoSeMide(VITAL_POR_CLAVE.get("venta_mes")!)).toBe(VITAL_POR_CLAVE.get("venta_mes")!.pregunta);
  });
});

/**
 * Las preguntas que escriben las IA salen de sus instrucciones: lo que el prompt pone entre comillas como modelo es lo
 * que la IA imita. Esas preguntas modelo se revisan con las mismas reglas de los bancos. Los contraejemplos van
 * marcados «MAL: … ->» y no se revisan: están ahí para que la IA sepa qué no hacer.
 */
const preguntasModelo = (prompt: string) =>
  [...prompt.replace(/MAL:[\s\S]*?->/g, " ").matchAll(/"([^"]*)"/g)].map((m) => m[1]!.replace(/\s+/g, " ").trim()).filter((q) => q.includes("?"));

describe("las IA que preguntan tienen la orden de pedir el episodio, no de dar ejemplos ni opciones", () => {
  const PROMPTS = { entrevistador: PROMPT_ENTREVISTADOR, diagnosticador: PROMPT_DIAGNOSTICADOR };

  it("las comillas de los prompts están pareadas: si no, las preguntas modelo no se pueden leer", () => {
    for (const [n, p] of Object.entries(PROMPTS)) expect(cuenta(p, '"') % 2, n).toBe(0);
  });

  it("ya no está la orden de cerrar con un ejemplo entre paréntesis, ni la de repreguntar con opciones", () => {
    for (const [n, p] of Object.entries(PROMPTS)) {
      expect(p, n).not.toMatch(/por ejemplo/i);
      expect(p, n).not.toMatch(/ejemplo entre parentesis|un ejemplo corto|repregunta concreta con un ejemplo/i);
      expect(p, n).not.toMatch(/con opciones/i);
      expect(p, n).not.toMatch(/\(ej[.:]|\bp\.\s?ej\./i);
      expect(p, n).not.toMatch(/de cada (?:\d+|diez|cien)\b/i);
    }
  });

  it("la orden está en positivo: el episodio, una sola cosa, y las tres repreguntas", () => {
    const e = PROMPT_ENTREVISTADOR;
    for (const ancla of ['"la ultima vez"', '"el mes pasado"', '"ayer"']) expect(e).toContain(ancla);
    expect(e).toMatch(/UNA SOLA COSA POR PREGUNTA/);
    expect(e).toMatch(/LA PREGUNTA NO TRAE LA RESPUESTA/);
    for (const r of ['"¿como lo sabes?"', '"¿cuando fue la ultima vez?"', '"¿donde se ve?"']) expect(e, r).toContain(r);
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/LA PREGUNTA NO TRAE LA RESPUESTA/);
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/EPISODIO antes que el concepto/);
  });

  it("«dinero», nunca «plata»: la palabra solo aparece en la prohibición misma", () => {
    for (const [n, p] of Object.entries(PROMPTS)) expect(p.replace(/nunca\s+"plata"/gi, ""), n).not.toMatch(PLATA);
  });

  it("las preguntas modelo cumplen las mismas reglas que los bancos", () => {
    for (const [n, p] of Object.entries(PROMPTS)) {
      const modelos = preguntasModelo(p);
      expect(modelos.length, n).toBeGreaterThan(3);
      const malas = modelos.filter(
        (q) => POR_EJEMPLO.test(q) || CIFRA.test(q) || LISTA_TRAS_DOS_PUNTOS.test(q) || ENTRE_PARENTESIS.test(q) || SUSPENSIVOS.test(q) || dosPreguntas(q) || PLATA.test(q) || PROMEDIO.test(q),
      );
      expect(malas, n).toEqual([]);
    }
  });

  it("los casos que señaló la revisión no vuelven a los prompts", () => {
    for (const [n, p] of Object.entries(PROMPTS))
      for (const viejo of ["Rosa revisa los pedidos", "entran pocos clientes, entran pero no compran", "con el Dia del Padre", "el pago, los", "38%", "de cada 100 soles"])
        expect(p, `${n}: ${viejo}`).not.toContain(viejo);
  });
});

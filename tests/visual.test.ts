/** Auditoría visual por código (fase 10, capítulo 18): lo prohibido no aparece en ningún componente ni estilo. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const raiz = path.resolve(__dirname, "../src");
function archivos(d: string, acc: string[] = []): string[] {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(tsx|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const fuentes = archivos(raiz).map((p) => ({ p: path.relative(raiz, p), s: readFileSync(p, "utf8") }));
const ui = fuentes.filter((f) => !f.p.startsWith("lib"));

/**
 * 13-10-2026: Kelin cambió el estilo de toda la app con una imagen de referencia («manda la imagen en toda la
 * app»). Las reglas de «sin degradados, sin sombras, sin desenfoque» se reemplazaron por una más estricta en otro
 * sentido: esas tres cosas viven SOLO en el sistema de diseño (src/design/*.css). Ningún componente las escribe
 * por su cuenta: así el estilo es uno y se cambia en un solo lugar.
 *
 * 17-10-2026: Kelin cambió el mundo otra vez, con el logo («nada Apple, nada premium… quiero que realmente el
 * aplicativo refleje ese premium»): «noche y perla». El marco en azul noche con la luz dorada del 8X, el trabajo en
 * papel perla con tarjetas blancas, títulos y cifras grandes en Bodoni Moda, la interfaz en Manrope, datos en acero.
 * Lo que NO cambió: sombras, degradados y desenfoque solo en el sistema. Se suman tres reglas del mundo nuevo: la
 * letra de títulos no entra a los componentes, el oro es luz y no relleno, y el lienzo es perla lisa.
 * Spec: clientes/8x-plan/spec-diseno-premium.md §9.
 */
const diseno = (f: { p: string }) => f.p.startsWith("design");
const componentes = ui.filter((f) => !diseno(f));
/** Compara rutas sin importar la barra: en Windows path.relative devuelve barras invertidas. */
const es = (f: { p: string }, rel: string) => path.normalize(f.p) === path.normalize(rel);

describe("lo que este producto no debe parecer", () => {
  it("los degradados solo existen en el sistema de diseño", () => {
    // Los <linearGradient>/<radialGradient> de Logo8X.tsx (y de los íconos de app que lo usan) son el dibujo de la
    // marca, no estilo: no chocan con esta regla, que busca la función CSS gradient( y las clases de Tailwind.
    for (const f of componentes) expect(f.s, f.p).not.toMatch(/gradient\(|bg-gradient/i);
  });
  it("sin violeta ni acentos neón", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/#(8b5cf6|a855f7|7c3aed|6d28d9|d946ef|ff00ff|00ffff|39ff14)|violet|purple|fuchsia|indigo-/i);
  });
  it("el desenfoque solo existe en el sistema de diseño (la barra de arriba: la franja del celular y la ruta pegajosa)", () => {
    for (const f of componentes) expect(f.s, f.p).not.toMatch(/backdrop-blur|backdrop-filter|glass/i);
  });
  it("sin rounded-2xl/3xl de Tailwind; los radios salen de los tokens (12 px controles, 20 px tarjetas, 24 px la hoja)", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/rounded-(2xl|3xl|full)\b(?!.*aria)/);
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(t).toMatch(/--radio: 12px/);
    expect(t).toMatch(/--radio-tarjeta: 20px/);
    expect(t).toMatch(/--radio-hoja: 24px/);
  });
  it("las sombras solo existen en el sistema de diseño (y el anillo de selección del canvas)", () => {
    for (const f of componentes) {
      const sombras = (f.s.match(/box-?[sS]hadow|shadow-(sm|md|lg|xl)/g) ?? []).length;
      if (/canvas[\\/]nodos/.test(f.p)) continue; // anillo de selección: comunica estado
      expect(sombras, f.p).toBe(0);
    }
  });
  it("sin emoji como íconos en la interfaz", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const f of ui) expect(f.s, f.p).not.toMatch(emoji);
  });
  it("sin íconos de chispa/varita/cerebro ni 'powered by AI' ni chatbot flotante", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/sparkle|magic|wand|brain|powered by|potenciado por|chatbot|chat-bubble/i);
  });
  it("el cliente nunca ve 'IA' en su portal ni en componentes con paraCliente", () => {
    const portal = ui.filter((f) => f.p.startsWith("app\\(cliente)") || f.p.startsWith("app/(cliente)") || f.p.includes("cliente"));
    for (const f of portal) expect(f.s, f.p).not.toMatch(/\bIA\b(?!.*paraCliente)|inteligencia artificial/);
    expect(readFileSync(path.join(raiz, "lib/textos.ts"), "utf8")).toMatch(/EJECUTOR_CLIENTE/);
  });
  it("sin ruedas indeterminadas: todo progreso es texto real", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/animate-spin|spinner|Procesando\.\.\./);
  });
  it("tipografía: Bodoni Moda (títulos y cifras grandes) + Manrope (toda la interfaz) + Source Serif 4 (documentos), nunca Inter", () => {
    const layout = readFileSync(path.join(raiz, "app/layout.tsx"), "utf8");
    expect(layout, "la Didone con su eje óptico").toMatch(/Bodoni_Moda\(\{[^}]*axes: \["opsz"\]/);
    expect(layout).toMatch(/Manrope/);
    expect(layout).toMatch(/Source_Serif_4/);
    expect(layout, "dos grotescas parecidas lado a lado se ven armadas: Public Sans salió de la pantalla").not.toMatch(/Public_Sans/);
    for (const f of fuentes) expect(f.s, f.p).not.toMatch(/\bInter\b/);
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(t).toMatch(/--font-display: var\(--font-bodoni\)/);
    expect(t).toMatch(/font-size: 17px/);
  });
  it("la letra de títulos no entra a los componentes: se pide solo por clase, desde src/design", () => {
    /**
     * Lo que se persigue es PEDIR la letra, no nombrarla. La comprobación buscaba la palabra «Bodoni» en todo el
     * archivo, comentarios incluidos, y así el único componente que ES la letra —el logo, que compone «8X» con los
     * trazos de la misma didone de los títulos— no podía explicar en su cabecera por qué. Un comentario no pide
     * nada: lo que pide es el token, la familia o el import de la fuente, y es eso lo que se mira. Sigue prohibido
     * exactamente lo mismo que antes, y de paso queda prohibido el import directo de next/font, que no estaba.
     */
    const PIDE_LA_LETRA = /--font-display|Bodoni_Moda\s*\(|font-?[fF]amily[^;,}]*(?:bodoni|font-display)/i;
    for (const f of ui) {
      if (diseno(f) || es(f, "app/layout.tsx")) continue;
      expect(f.s, `${f.p} pide la letra de títulos por su cuenta: va por clase, en src/design`).not.toMatch(PIDE_LA_LETRA);
    }
  });
  it("el oro es luz, no relleno: solo en el logo, el marco y la flecha de la acción de hoy", () => {
    const ORO = /var\(--(champan|champan-claro|oro)\)/;
    const permitidos = ["design/tokens.css", "design/marco.css", "design/tablero.css", "components/base/Logo8X.tsx"];
    for (const f of ui) {
      if (permitidos.some((p) => es(f, p))) continue;
      expect(f.s, `${f.p} usa el oro: junto a un dato se lee «ámbar = caducado»`).not.toMatch(ORO);
    }
    // En tablero.css el oro es solo la flecha redonda de .accion-hoy: todo bloque que lo use la nombra en su selector.
    const tablero = readFileSync(path.join(raiz, "design/tablero.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, cuerpo] of tablero.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (ORO.test(cuerpo!)) expect(selector!.trim(), "un bloque de tablero.css usa el oro fuera de .accion-hoy").toMatch(/\.accion-hoy/);
    }
  });
  it("el lienzo es perla lisa: sin degradado de fondo ni resplandor en la esquina del tablero", () => {
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8").replace(/\r\n/g, "\n");
    const desde = t.indexOf("\nhtml {");
    expect(desde, "falta el bloque html { de tokens.css").toBeGreaterThan(-1);
    const html = t.slice(desde, t.indexOf("}", desde));
    expect(html).toMatch(/background-color: var\(--perla\)/);
    expect(html).not.toMatch(/gradient\(/);
    expect(readFileSync(path.join(raiz, "design/tablero.css"), "utf8")).not.toMatch(/\.tablero::before/);
  });
  it("accesibilidad: objetivos táctiles de 44px, foco visible, reduced-motion", () => {
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(t).toMatch(/min-height: 44px/);
    expect(t).toMatch(/:focus-visible/);
    expect(t).toMatch(/prefers-reduced-motion/);
  });
  it("todos los inputs/selects/textareas tienen etiqueta real o aria-label", () => {
    /**
     * SE MIRA SI EL CONTROL ESTÁ DENTRO DE SU <label>, NO SI LA ETIQUETA CAE CERCA.
     *
     * Antes se buscaba la apertura de <label> en los 200 caracteres anteriores al control. Eso aprueba y reprueba
     * por la razón equivocada: un campo bien envuelto se reprobaba solo porque su texto era largo —el que dice
     * «cómo se va a medir, o por qué no se mide» pasa de 200 con las dos redacciones— y, al revés, un control
     * suelto pasaba por quedar cerca de una etiqueta que ya se había cerrado. Lo que de verdad asocia una etiqueta
     * con su control en HTML es envolverlo o nombrarlo: se cuenta si hay un <label> abierto en ese punto, y si no,
     * se acepta la asociación explícita (htmlFor con su id) o un aria-label.
     */
    for (const f of ui) {
      const controles = f.s.match(/<(input|select|textarea)(?:[^>]|=>)*?(?:\/>|(?<!=)>)/g) ?? [];
      for (const c of controles) {
        if (/type="(file|checkbox)"/.test(c)) continue;
        const antes = f.s.slice(0, f.s.indexOf(c));
        const abiertos = (antes.match(/<label[\s>]/g) ?? []).length - (antes.match(/<\/label>/g) ?? []).length;
        const porId = (() => {
          const id = /[\s]id=(?:"([^"]+)"|\{([^}]+)\})/.exec(c);
          if (!id) return false;
          const cual = (id[1] ?? id[2])!.trim();
          return f.s.includes(`htmlFor="${cual}"`) || f.s.includes(`htmlFor={${cual}}`);
        })();
        const conLabel = /aria-label=|id="archivo"/.test(c) || abiertos > 0 || porId;
        expect(conLabel, `${f.p}: control sin etiqueta → ${c.slice(0, 80)}`).toBe(true);
      }
    }
  });
});

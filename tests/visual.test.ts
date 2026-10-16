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
 * app»): cielo azul suave, tarjetas blancas con sombra suave, navegación en píldora con vidrio en el celular.
 * Las reglas de «sin degradados, sin sombras, sin desenfoque» se reemplazan por una más estricta en otro
 * sentido: esas tres cosas viven SOLO en el sistema de diseño (src/design/*.css). Ningún componente las escribe
 * por su cuenta: así el estilo es uno y se cambia en un solo lugar.
 */
const diseno = (f: { p: string }) => f.p.startsWith("design");
const componentes = ui.filter((f) => !diseno(f));

describe("lo que este producto no debe parecer", () => {
  it("los degradados solo existen en el sistema de diseño", () => {
    for (const f of componentes) expect(f.s, f.p).not.toMatch(/gradient\(|bg-gradient/i);
  });
  it("sin violeta ni acentos neón", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/#(8b5cf6|a855f7|7c3aed|6d28d9|d946ef|ff00ff|00ffff|39ff14)|violet|purple|fuchsia|indigo-/i);
  });
  it("el desenfoque solo existe en el sistema de diseño (la píldora flotante del celular)", () => {
    for (const f of componentes) expect(f.s, f.p).not.toMatch(/backdrop-blur|backdrop-filter|glass/i);
  });
  it("sin rounded-2xl/3xl de Tailwind; los radios salen de los tokens (14px controles, 24px tarjetas)", () => {
    for (const f of ui) expect(f.s, f.p).not.toMatch(/rounded-(2xl|3xl|full)\b(?!.*aria)/);
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(t).toMatch(/--radio: 14px/);
    expect(t).toMatch(/--radio-tarjeta: 24px/);
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
  it("tipografía: Public Sans + Manrope (números) + Source Serif 4 (documentos), nunca Inter; cuerpo 17px", () => {
    const layout = readFileSync(path.join(raiz, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/Public_Sans/);
    expect(layout).toMatch(/Source_Serif_4/);
    expect(layout).toMatch(/Manrope/);
    for (const f of fuentes) expect(f.s, f.p).not.toMatch(/\bInter\b/);
    expect(readFileSync(path.join(raiz, "design/tokens.css"), "utf8")).toMatch(/font-size: 17px/);
  });
  it("accesibilidad: objetivos táctiles de 44px, foco visible, reduced-motion", () => {
    const t = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(t).toMatch(/min-height: 44px/);
    expect(t).toMatch(/:focus-visible/);
    expect(t).toMatch(/prefers-reduced-motion/);
  });
  it("todos los inputs/selects/textareas tienen etiqueta real o aria-label", () => {
    for (const f of ui) {
      const controles = f.s.match(/<(input|select|textarea)(?:[^>]|=>)*?(?:\/>|(?<!=)>)/g) ?? [];
      for (const c of controles) {
        if (/type="(file|checkbox)"/.test(c)) continue;
        const conLabel = /aria-label=|id="archivo"/.test(c) || /<label[^>]*>[^<]*(?:<span[^>]*>[^<]*<\/span>)?\s*$/.test(f.s.slice(Math.max(0, f.s.indexOf(c) - 200), f.s.indexOf(c)));
        expect(conLabel, `${f.p}: control sin etiqueta → ${c.slice(0, 80)}`).toBe(true);
      }
    }
  });
});

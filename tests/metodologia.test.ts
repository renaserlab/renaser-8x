/** Sincronía /methodology ↔ código, y referentes invisibles para el cliente (1.6). */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { LENTES, DIMENSIONES, PATRONES } from "@/lib/rules/patrones";
import { PROMPT_DIAGNOSTICADOR } from "@/lib/ai/agents/diagnosticador";
import { PROMPT_REDACTOR } from "@/lib/ai/agents/planificador";
import * as textos from "@/lib/textos";

const M = path.resolve(__dirname, "../methodology");
const leer = (f: string) => readFileSync(path.join(M, f), "utf8");
const REFERENTES = ["Lemonis", "McKinsey", "Hormozi", "Jobs", "Collins", "Lean", "EOS"];

describe("/methodology existe y está sincronizada con el código", () => {
  it("los 8 archivos pedidos existen", () => {
    const files = readdirSync(M);
    for (const f of ["people.md", "process.md", "product.md", "marketing.md", "purpose.md", "wisdom.md", "excellence.md", "references.md"]) expect(files).toContain(f);
  });
  it("cada referente de references.md está en LENTES y en el prompt del diagnosticador", () => {
    const ref = leer("references.md");
    for (const r of REFERENTES) {
      expect(ref).toContain(r);
      expect(LENTES).toContain(r);
      expect(PROMPT_DIAGNOSTICADOR).toContain(r);
    }
  });
  it("la regla central está en references.md y en el prompt", () => {
    expect(leer("references.md")).toMatch(/LENTE PARA INVESTIGAR/);
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/benchmark nunca es un hecho/);
  });
  it("las dimensiones de cada P en los .md coinciden con DIMENSIONES", () => {
    const mapa: Record<string, string> = { personas: "people.md", procesos: "process.md", producto: "product.md", marketing: "marketing.md" };
    for (const [p, f] of Object.entries(mapa)) {
      const md = leer(f).toLowerCase();
      for (const d of DIMENSIONES[p]) expect(md, `${f} no menciona "${d}"`).toContain(d.toLowerCase());
    }
  });
  it("los patrones citados en los .md existen en PATRONES", () => {
    const claves = new Set(PATRONES.map((p) => p.clave));
    for (const f of ["people.md", "product.md", "marketing.md"]) {
      const citados = leer(f).match(/[a-z_]+(?:_[a-z_]+)+/g) ?? [];
      for (const c of citados.filter((x) => claves.has(x) || x.includes("_vs_") || x.endsWith("_fundador"))) if (x(c)) expect(claves.has(c), `${f}: ${c}`).toBe(true);
    }
    function x(c: string) { return c.includes("_"); }
  });
  it("las sub-preguntas de los tres filtros están en el prompt del diagnosticador", () => {
    for (const frag of ["contradice algo esencial", "genera dinero destruyendo el proposito", "causa o sintoma", "efecto secundario", "optimiza una parte destruyendo otra", "problema futuro", "mantiene el estandar", "degrada la experiencia", "sostenerse al crecer"]) expect(PROMPT_DIAGNOSTICADOR.toLowerCase()).toContain(frag);
  });
});

describe("ningún referente es visible para el cliente", () => {
  it("textos.ts (todo el copy de la interfaz) no nombra referentes", () => {
    const todo = JSON.stringify(textos);
    for (const r of REFERENTES) expect(todo).not.toMatch(new RegExp(r, "i"));
  });
  it("el REDACTOR tiene prohibido mencionarlos", () => {
    expect(PROMPT_REDACTOR).toMatch(/Nunca menciones nombres de autores, metodologias ni referentes/);
  });
  it("el portal del cliente (páginas) no contiene sus nombres", () => {
    const dir = path.resolve(__dirname, "../src/app/(cliente)");
    const leerTodo = (d: string): string => readdirSync(d, { withFileTypes: true }).map((e) => (e.isDirectory() ? leerTodo(path.join(d, e.name)) : readFileSync(path.join(d, e.name), "utf8"))).join("\n");
    const src = leerTodo(dir);
    for (const r of REFERENTES) expect(src).not.toMatch(new RegExp(`\\b${r}\\b`));
  });
});

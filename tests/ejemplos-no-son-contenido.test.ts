import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { EJEMPLOS } from "@/lib/activos";

/**
 * UN EJEMPLO JAMÁS ES CONTENIDO DE LA CAJA.
 *
 * El 30-08-2026 la dueña de Qori Home creyó que el aplicativo le estaba metiendo datos de otra
 * empresa —de otro rubro— en sus respuestas, y tuvo que borrarlos letra por letra. No había fuga
 * de datos: era un ejemplo puesto donde va lo que ella escribe. Para quien llena el formulario, un
 * ejemplo dentro de la caja ES un dato ajeno; la diferencia técnica no existe para ella.
 *
 * La regla del producto, desde hoy: los ejemplos viven en `placeholder` —tenue, en cursiva, y se
 * van solos al escribir o al dictar—; nunca en `value` ni en `defaultValue`.
 */
const raiz = path.join(process.cwd(), "src");

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const tsx = archivos(raiz);
const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");

describe("un ejemplo jamás va dentro de la caja de respuesta", () => {
  it("ningún campo se rellena con EJEMPLOS: eso obliga a borrar letra por letra", () => {
    const culpables = tsx.filter((f) => {
      const src = readFileSync(f, "utf8");
      // value={...EJEMPLOS...} o defaultValue={...EJEMPLOS...} en la misma expresión.
      return /(?:value|defaultValue)=\{[^}]*EJEMPLOS/.test(src);
    });
    expect(culpables.map(rel), "un ejemplo debe ir en placeholder, nunca como contenido").toEqual([]);
  });

  it("los ejemplos que se muestran van como placeholder, que es lo que se borra solo", () => {
    const src = readFileSync(path.join(raiz, "components/cliente/InventarioActivos.tsx"), "utf8");
    expect(src, "el ejemplo tiene que estar en el placeholder").toMatch(/placeholder=\{[^}]*EJEMPLOS/);
    expect(src, "y no puede estar además como contenido").not.toMatch(/value=\{[^}]*EJEMPLOS/);
  });

  it("el placeholder se ve tenue y en cursiva: no se puede confundir con lo escrito", () => {
    const css = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(css).toMatch(/\.campo::placeholder/);
    expect(css).toMatch(/font-style:\s*italic/);
    expect(css, "tiene que ser más claro que la tinta normal").toMatch(/opacity:\s*0?\.[0-6]/);
  });

  it("ninguna caja arranca con texto de ejemplo escrito a mano", () => {
    // Un value/defaultValue con una cadena literal larga es texto puesto a dedo dentro de la caja.
    const culpables: string[] = [];
    for (const f of tsx) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:value|defaultValue)=\{?"([^"]{25,})"\}?/g)) {
        culpables.push(`${rel(f)}: "${m[1].slice(0, 40)}…"`);
      }
    }
    expect(culpables, "eso es contenido que la persona tendría que borrar").toEqual([]);
  });

  it("los ejemplos del catálogo siguen siendo frases de dueño, no plantillas", () => {
    const textos = Object.values(EJEMPLOS);
    expect(textos.length).toBeGreaterThan(10);
    for (const t of textos) {
      // Entrecomillado con « »: se lee como algo que alguien dijo, no como una instrucción del sistema.
      expect(t, `«${t.slice(0, 40)}» debería ir entrecomillado como algo que alguien dijo`).toMatch(/«[^»]+»/);
      expect(t, "un ejemplo no puede tener huecos por rellenar").not.toMatch(/\[|\]|XXX|___/);
    }
  });
});

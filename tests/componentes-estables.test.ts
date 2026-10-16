/**
 * NINGÚN COMPONENTE SE CREA DURANTE EL RENDER.
 *
 * Un componente definido dentro del cuerpo de otro es una función NUEVA en cada render. React
 * compara los tipos por identidad: si el tipo cambió, no actualiza el subárbol — lo DESMONTA y lo
 * vuelve a montar completo. Lo que se pierde en ese remonte es el estado del DOM: el foco, la
 * posición de scroll, la selección de texto y cualquier useState que viva dentro.
 *
 * Pasó de verdad: en `EstudioOrganigrama` la tarjeta de cada opción estaba definida dentro del
 * componente, así que al pulsar «Adoptar esta estructura» el cambio de estado remontaba las dos
 * tarjetas y el botón perdía el foco a mitad de la acción. El lint lo detectó; esta prueba impide
 * que vuelva sin depender de que alguien mire la salida del lint.
 *
 * NOTA DE ALCANCE: esta prueba lee el código fuente. No demuestra el comportamiento en un navegador
 * —no hay entorno de DOM en esta suite— y no pretende hacerlo. Protege contra la CAUSA.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../src");

function archivosTsx(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) acc.push(...archivosTsx(f));
    else if (e.name.endsWith(".tsx")) acc.push(f);
  }
  return acc;
}

/**
 * Un componente anidado se reconoce por estar INDENTADO (vive dentro de otra función) y devolver
 * JSX. Se exige lo segundo para no marcar manejadores ni helpers que solo calculan.
 */
function componentesAnidados(src: string): string[] {
  const lineas = src.split("\n");
  const hallados: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^(\s+)(?:const|let|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?:=|\()/);
    if (!m) continue;
    const [, sangria, nombre] = m;
    if (sangria.length === 0) continue;
    // Se mira el bloque siguiente: si devuelve JSX, es un componente y no un dato.
    const bloque = lineas.slice(i, i + 40).join("\n");
    const devuelveJsx = /return\s*\(\s*\n?\s*</.test(bloque) || /=>\s*\(\s*\n?\s*</.test(bloque);
    // Un tipo o una constante de datos en mayúscula no es un componente.
    const esTipoODato = /^(\s+)(?:const|let)\s+[A-Z][A-Za-z0-9_]*\s*(?::\s*[A-Za-z<>[\]{}|, ]+)?\s*=\s*(?:new\s|[[{"'`\d])/.test(lineas[i]);
    if (devuelveJsx && !esTipoODato) hallados.push(`${nombre} (línea ${i + 1})`);
  }
  return hallados;
}

/**
 * SOLO COMPONENTES DE CLIENTE. En un componente de servidor el árbol se construye una vez por
 * petición: no hay re-render, así que no hay remonte y no se pierde ningún foco. Ahí un componente
 * anidado es cuestión de estilo, no un defecto, y marcarlo convertiría esta prueba en ruido — que es
 * la forma más rápida de que alguien la desactive. El lint de React opina lo mismo: de los tres
 * casos que había en el repositorio, solo señaló el del componente de cliente.
 */
const ARCHIVOS = archivosTsx(RAIZ).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

describe("ningún componente se crea durante el render", () => {
  it("se encontraron archivos .tsx (si esto falla, la prueba no mira nada)", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(30);
  });

  it.each(ARCHIVOS.map((f) => [path.relative(RAIZ, f), f] as const))("%s", (_rel, f) => {
    const anidados = componentesAnidados(readFileSync(f, "utf8"));
    expect(
      anidados,
      `Componente definido dentro de otro: ${anidados.join(", ")}. React lo remonta en cada render y se pierde el foco y el estado del DOM. Súbelo al nivel del módulo y pásale lo que necesita por props.`
    ).toEqual([]);
  });
});

describe("la prueba de verdad detecta el patrón", () => {
  it("marca un componente anidado que devuelve JSX", () => {
    const malo = [
      "export function Padre() {",
      "  const Hijo = ({ x }: { x: string }) => {",
      "    return (",
      "      <p>{x}</p>",
      "    );",
      "  };",
      "  return <Hijo x=\"a\" />;",
      "}",
    ].join("\n");
    expect(componentesAnidados(malo)).toHaveLength(1);
  });

  it("no marca un componente al nivel del módulo", () => {
    const bueno = ["function Hijo({ x }: { x: string }) {", "  return (", "    <p>{x}</p>", "  );", "}"].join("\n");
    expect(componentesAnidados(bueno)).toEqual([]);
  });

  it("no marca una constante de datos en mayúscula", () => {
    const dato = ["function Padre() {", "  const CUANDO = { ahora: \"ahora\" };", "  return <p />;", "}"].join("\n");
    expect(componentesAnidados(dato)).toEqual([]);
  });
});

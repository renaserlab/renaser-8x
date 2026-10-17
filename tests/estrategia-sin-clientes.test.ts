/**
 * NINGÚN CLIENTE REAL EN LA ESTRATEGIA (spec-estrategia-8x.md §0.10 y §9.1).
 *
 * El repositorio es público. Si existe la lista local `clientes/nombres-reales.txt` (fuera del repositorio: la carpeta
 * `clientes/` no se publica), ningún archivo de la estrategia, de sus agentes ni de sus datos de prueba puede traer uno
 * de esos nombres. Si la lista no está en esta máquina, la prueba se SALTA y su título lo dice: un salto se ve en el
 * resumen de vitest; un verde que no miró nada, no. La lista no se copia aquí: nombrar a los clientes para buscarlos
 * sería publicarlos.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const raiz = process.cwd();
const LISTA = path.join(raiz, "clientes", "nombres-reales.txt");
const hayLista = existsSync(LISTA);

function archivosDe(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    return statSync(p).isDirectory() ? archivosDe(p) : [p];
  });
}

/**
 * Lo que se revisa: la estrategia entera, sus tres agentes, su ensayo vivo, sus pantallas (las de la consultora, las del
 * dueño y sus rutas), su migración y sus pruebas con sus datos (revisión del 17-10: antes dejaba fuera las pantallas
 * del dueño, las pruebas y la migración).
 */
function archivosDeLaEstrategia(): string[] {
  const pruebas = path.join(raiz, "tests");
  return [
    ...archivosDe(path.join(raiz, "src", "lib", "estrategia")),
    ...archivosDe(path.join(raiz, "scripts", "estrategia")),
    ...archivosDe(path.join(raiz, "src", "components", "estrategia")),
    ...archivosDe(path.join(raiz, "src", "app", "(consultor)", "empresa", "[id]", "estrategia")),
    ...archivosDe(path.join(raiz, "src", "app", "(cliente)", "portal", "plan")),
    ...archivosDe(path.join(raiz, "src", "app", "api", "companies", "[id]", "estrategia")),
    ...archivosDe(path.join(raiz, "src", "app", "api", "companies", "[id]", "estrategia-preguntas")),
    ...["CaminoElegido", "ResponderPreguntas"].map((c) => path.join(raiz, "src", "components", "cliente", `${c}.tsx`)),
    ...["estrategia", "camino"].map((c) => path.join(raiz, "src", "design", `${c}.css`)),
    ...["lente-dinero", "lente-terreno", "equipo-rojo", "estrategia-comun"].map((a) => path.join(raiz, "src", "lib", "ai", "agents", `${a}.ts`)),
    path.join(raiz, "src", "lib", "jobs", "handlers", "estrategia.ts"),
    path.join(raiz, "supabase", "migracion-estrategia.sql"),
    path.join(raiz, "supabase", "revertir", "migracion-estrategia.sql"),
    ...readdirSync(pruebas).filter((f) => /^(?:estrategia-|pantallas-estrategia-|ai-largo)/.test(f)).map((f) => path.join(pruebas, f)),
    path.join(pruebas, "sql", "estrategia.test.ts"),
    path.join(pruebas, "fixtures", "estrategia-falsa.ts"),
    path.join(pruebas, "fixtures", "base-estrategia.ts"),
  ].filter((f) => existsSync(f) && path.resolve(f) !== path.resolve(__filename));
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("la estrategia no nombra a ningún cliente real", () => {
  it.skipIf(!hayLista)(hayLista ? "ningún archivo de la estrategia trae un nombre de la lista local" : "sin lista local de nombres: no se pudo comprobar", () => {
    const nombres = readFileSync(LISTA, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(nombres.length, "la lista local está vacía").toBeGreaterThan(0);
    const hallados: string[] = [];
    for (const f of archivosDeLaEstrategia()) {
      const texto = sinTildes(readFileSync(f, "utf8"));
      for (const n of nombres) {
        const patron = new RegExp(`\\b${sinTildes(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (patron.test(texto)) hallados.push(`${path.relative(raiz, f)}: «${n}»`);
      }
    }
    expect(hallados, "un nombre de cliente real en el repositorio público").toEqual([]);
  });

  it("revisa algo: la estrategia y sus datos de prueba existen", () => {
    const archivos = archivosDeLaEstrategia().map((f) => path.relative(raiz, f).split(path.sep).join("/"));
    expect(archivos).toEqual(expect.arrayContaining(["src/lib/estrategia/paquete.ts", "tests/fixtures/estrategia-falsa.ts", "src/components/cliente/CaminoElegido.tsx", "supabase/migracion-estrategia.sql", "tests/estrategia-api.test.ts"]));
  });
});

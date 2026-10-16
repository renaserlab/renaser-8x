/**
 * EL TRABAJO DE LA CONSULTORA NO LLEGA AL NAVEGADOR DEL CLIENTE.
 *
 * Regla de Kelin (27-09-2026): «toda la parte de trabajo en la empresa, la persona o dueño no debe
 * verla, solo el diagnóstico; yo le doy las versiones finales aparte para implementar».
 *
 * No es una preferencia de presentación: es el negocio. Lo que la consultora propone se entrega
 * cuando ella decide, en la versión que ella aprueba. Que el dueño vea un borrador interno adelanta
 * una conversación que no le toca tener todavía.
 *
 * SE FILTRA EN LA CONSULTA, NUNCA AL PINTAR. Pasó justo eso: `/portal/hoy` traía los siete puestos
 * de una empresa cliente —todos creados por la consultora desde los documentos de los trabajadores— y el componente
 * los escondía con un `.filter()` en el navegador. Los datos viajaban igual dentro del código de la
 * página, y encima se veían en el desplegable de «a quién le reporta». Filtrar al pintar no es
 * filtrar: es esconder.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const PORTAL = path.resolve(__dirname, "../src/app/(cliente)");

function paginas(dir: string): { ruta: string; src: string }[] {
  const acc: { ruta: string; src: string }[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) acc.push(...paginas(f));
    else if (e.name === "page.tsx") acc.push({ ruta: path.relative(PORTAL, f).replace(/\\/g, "/"), src: readFileSync(f, "utf8") });
  }
  return acc;
}

const PAGINAS = paginas(PORTAL);

/** Las consultas de una página: el nombre de la tabla y la cadena completa de filtros encadenados. */
function consultas(src: string): { tabla: string; cadena: string }[] {
  const out: { tabla: string; cadena: string }[] = [];
  for (const m of src.matchAll(/from\("([a-z_]+)"\)([\s\S]{0,400}?)(?:;|\n\s*\]|\n\s*\))/g)) {
    out.push({ tabla: m[1], cadena: m[2] });
  }
  return out;
}

describe("el portal del cliente no lee trabajo interno de la consultora", () => {
  it("se encontraron páginas del portal (si esto falla, la prueba no mira nada)", () => {
    expect(PAGINAS.length).toBeGreaterThan(5);
  });

  it.each(PAGINAS.map((p) => [p.ruta, p] as const))("%s no trae puestos propuestos por la consultora", (_r, p) => {
    for (const q of consultas(p.src)) {
      if (q.tabla !== "org_puestos") continue;
      expect(
        q.cadena,
        `${p.ruta} lee org_puestos sin filtrar por origen. Los puestos que propone la consultora no pueden llegar al navegador del cliente, ni siquiera ocultos.`
      ).toMatch(/\.eq\("origen",\s*"cliente"\)/);
    }
  });

  it.each(PAGINAS.map((p) => [p.ruta, p] as const))("%s solo muestra entregables publicados", (_r, p) => {
    for (const q of consultas(p.src)) {
      if (q.tabla !== "deliverables") continue;
      expect(q.cadena, `${p.ruta} lee deliverables sin exigir publicado`).toMatch(/\.eq\("publicado",\s*true\)/);
    }
  });

  it.each(PAGINAS.map((p) => [p.ruta, p] as const))("%s no muestra hallazgos rechazados", (_r, p) => {
    for (const q of consultas(p.src)) {
      if (q.tabla !== "findings") continue;
      expect(
        q.cadena,
        `${p.ruta} lee findings sin excluir los rechazados: el cliente vería un hallazgo que la consultora descartó`
      ).toMatch(/estado_revision/);
    }
  });

  it("ninguna página del cliente lee las decisiones de la consultora", () => {
    for (const p of PAGINAS) {
      expect(p.src, `${p.ruta} lee decisiones: eso es deliberación interna`).not.toMatch(/from\("decisiones"\)/);
      expect(p.src, `${p.ruta} lee el historial de decisiones`).not.toMatch(/from\("decision_historial"\)/);
    }
  });

  it("ninguna página del cliente lee la torre de control ni el consumo de los agentes", () => {
    for (const p of PAGINAS) {
      expect(p.src, `${p.ruta} lee token_usage`).not.toMatch(/from\("token_usage"\)/);
      expect(p.src, `${p.ruta} lee la huella de agentes`).not.toMatch(/from\("agente_huella"\)/);
      expect(p.src, `${p.ruta} lee contratos de agentes`).not.toMatch(/agentes\/contratos/);
    }
  });
});

describe("filtrar al pintar no cuenta como filtrar", () => {
  it("el componente del equipo ya no depende de esconder lo que le llega", () => {
    const c = readFileSync(path.resolve(__dirname, "../src/components/cliente/DeclararEquipo.tsx"), "utf8");
    // Puede seguir filtrando por defensa en profundidad, pero la página TIENE que filtrar en la consulta.
    const hoy = PAGINAS.find((p) => p.ruta.includes("hoy"));
    expect(hoy?.src).toMatch(/\.eq\("origen",\s*"cliente"\)/);
    expect(c).toContain("origen"); // sigue conociendo el campo: la defensa doble no estorba
  });
});

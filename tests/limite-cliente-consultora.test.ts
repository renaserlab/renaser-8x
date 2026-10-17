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

  it("ninguna página del portal lee las marcas ni los veredictos de compuerta de la consultora (ruta_marcas)", () => {
    // El dueño ve sus etapas por vistaDueno (src/lib/ruta.ts), sin criterios, notas ni veredictos; la tabla no se lee
    // desde ninguna página suya, ni con el cliente de la base ni por su nombre.
    for (const p of PAGINAS) expect(p.src, `${p.ruta} lee ruta_marcas: es trabajo interno de la consultora`).not.toMatch(/ruta_marcas/);
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

/**
 * LA ESTRATEGIA (spec-estrategia-8x.md §8.2 y §10.1). `estrategias` y `estrategia_ediciones` no tienen política de
 * cliente: son trabajo de la consultora. El dueño ve su camino APROBADO y sus preguntas ENVIADAS, y nada más, por las
 * lecturas de src/lib/estrategia/portal.ts, que filtran en la consulta. Ninguna página del portal lee esas tablas por su
 * cuenta ni importa lo que arma la estrategia por dentro (versiones, lentes, cálculos, correcciones).
 */
describe("la estrategia: el portal ve solo el camino aprobado y las preguntas enviadas", () => {
  const PORTAL_LIB = readFileSync(path.resolve(__dirname, "../src/lib/estrategia/portal.ts"), "utf8");
  const PREGUNTAS_LIB = readFileSync(path.resolve(__dirname, "../src/lib/estrategia/preguntas.ts"), "utf8");

  it.each(PAGINAS.map((p) => [p.ruta, p] as const))("%s no lee las tablas de la estrategia por su cuenta", (_r, p) => {
    expect(p.src, `${p.ruta} lee estrategias: solo por caminoAprobadoParaDueno (src/lib/estrategia/portal.ts)`).not.toMatch(/from\("estrategias"\)/);
    expect(p.src, `${p.ruta} lee estrategia_preguntas: solo por preguntasDelDueno o preguntasPendientes`).not.toMatch(/from\("estrategia_preguntas"\)/);
    expect(p.src, `${p.ruta} nombra estrategia_ediciones: lo que corrigió la consultora no llega al portal`).not.toMatch(/estrategia_ediciones/);
  });

  it("de la estrategia, el portal solo importa lo que es para el dueño", () => {
    const PERMITIDOS = ["portal", "textos", "dueno", "para-dueno"];
    const usados: string[] = [];
    for (const p of PAGINAS) {
      for (const m of p.src.matchAll(/from "@\/lib\/estrategia\/([a-z-]+)"/g)) {
        usados.push(m[1]!);
        expect(PERMITIDOS, `${p.ruta} importa src/lib/estrategia/${m[1]}: el portal no lee versiones, lentes ni correcciones`).toContain(m[1]);
      }
    }
    expect(usados, "ninguna página del portal usa la estrategia: la prueba no mira nada").toContain("portal");
  });

  it("caminoAprobadoParaDueno filtra en la consulta: su empresa, solo la aprobada, solo cuatro columnas", () => {
    const q = consultas(PORTAL_LIB).filter((c) => c.tabla === "estrategias");
    expect(q, "src/lib/estrategia/portal.ts lee estrategias una sola vez").toHaveLength(1);
    expect(q[0]!.cadena).toMatch(/\.select\(COLUMNAS_CAMINO_DUENO\)/);
    expect(q[0]!.cadena).toMatch(/\.eq\("company_id",\s*companyId\)/);
    expect(q[0]!.cadena).toMatch(/\.eq\("estado",\s*"aprobada"\)/);
    // La página congelada al aprobar (con las cifras ya escritas), su versión y cuándo: ni vigente, ni salida, ni cálculos.
    expect(PORTAL_LIB).toMatch(/COLUMNAS_CAMINO_DUENO = "id,version,para_dueno,aprobada_at"/);
    expect(PORTAL_LIB).not.toMatch(/from\("estrategia_ediciones"\)/);
  });

  it("las preguntas del dueño: de su empresa, solo enviadas o respondidas, sin el porqué de la consultora ni la clave", () => {
    const q = consultas(PORTAL_LIB).filter((c) => c.tabla === "estrategia_preguntas");
    expect(q.length).toBeGreaterThanOrEqual(2);
    for (const c of q) expect(c.cadena, "una lectura de preguntas sin filtrar por la empresa").toMatch(/\.eq\("company_id",\s*companyId\)/);
    const lista = q.find((c) => /COLUMNAS_PREGUNTA_DUENO/.test(c.cadena));
    expect(lista, "la lista de preguntas del dueño usa sus columnas").toBeDefined();
    expect(lista!.cadena).toMatch(/\.in\("estado",\s*\["enviada",\s*"respondida"\]\)/);
    const columnas = PREGUNTAS_LIB.match(/COLUMNAS_PREGUNTA_DUENO = "([^"]+)"/)?.[1]?.split(",") ?? [];
    expect(columnas).toContain("texto");
    for (const interna of ["por_que", "clave", "espera", "estrategia_id", "enviada_por"]) expect(columnas, `el dueño recibe ${interna}`).not.toContain(interna);
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

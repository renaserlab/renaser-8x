/**
 * EL REPOSITORIO DEBE DESCRIBIR LO QUE LA BASE TIENE.
 *
 * La auditoría del 13-10-2026 (PAQUETE-DE-DECISION-8X.md §E.2 n.º 13) encontró «7 tablas y 4 columnas
 * sin DDL en el repo»: company_metricas, org_puestos, org_estudio, org_estudio_versiones,
 * modelo_alto_rendimiento, modelo_versiones y conocimiento_base nacieron por el SQL Editor o por
 * scripts sueltos, y nunca entraron a supabase/. Medido contra la descripción OpenAPI real de
 * PostgREST, el hueco era mayor: las 7 tablas y 12 columnas repartidas en companies (5),
 * company_assets (4) y processes (3).
 *
 * Por qué importa. Sin el DDL en el repo no se puede levantar la base en otro sitio (ni el Postgres
 * embebido de pruebas, ni un segundo proyecto), no se pueden auditar las políticas RLS desde el
 * código, y hay migraciones que alteran tablas que el repo no conoce (migracion-procedencia.sql:26
 * sobre org_puestos). Lo que no está escrito no se puede revisar ni reproducir.
 *
 * Qué comprueba esto. Se toma como verdad la foto SANEADA del OpenAPI de producción del 13-10-2026
 * (tests/fixtures/esquema-produccion-2026-10-13.json: solo definiciones y nombres de rpc; sin host,
 * sin claves) y se exige que cada relación y cada columna que la base expone tenga DDL en algún
 * supabase/*.sql. Y que la migración que cierra el hueco sea solo aditiva: si alguna vez se aplica
 * sobre producción no debe poder quitar nada.
 *
 * Qué NO comprueba. Que el DDL coincida en acciones de borrado, defaults jsonb, índices o políticas:
 * el OpenAPI no los trae. Eso queda marcado INFERIDO en la migración y se confirma con pg_dump.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

type Propiedad = { type?: string; format?: string; default?: unknown; description?: string };
type Relacion = { required?: string[]; properties: Record<string, Propiedad> };
type Fixture = { definitions: Record<string, Relacion>; rpc: string[] };

const RAIZ = path.resolve(__dirname, "..");
const FIXTURE_PATH = path.join(RAIZ, "tests/fixtures/esquema-produccion-2026-10-13.json");
const FIXTURE_TEXTO = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE = JSON.parse(FIXTURE_TEXTO) as Fixture;

const DIR_SQL = path.join(RAIZ, "supabase");
const ARCHIVOS_SQL = readdirSync(DIR_SQL).filter((f) => f.endsWith(".sql")).sort();
/** Todo el SQL del repo, sin comentarios: un `-- drop` en una explicación no es una sentencia. */
const SQL = ARCHIVOS_SQL.map((f) => readFileSync(path.join(DIR_SQL, f), "utf8")).join("\n").replace(/--[^\n]*/g, "");

const MIGRACION_TEXTO = readFileSync(path.join(DIR_SQL, "migracion-deriva-esquema.sql"), "utf8");
const MIGRACION = MIGRACION_TEXTO.replace(/--[^\n]*/g, "").toLowerCase();

/** Bloques `create table|view|materialized view [if not exists] [public.]<tabla> ... ;` de una relación. */
function bloquesCreate(tabla: string): string[] {
  const re = new RegExp(
    "create\\s+(?:materialized\\s+view|table|or\\s+replace\\s+view|view)(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?" + tabla + "\\b[\\s\\S]*?;",
    "gi"
  );
  return [...SQL.matchAll(re)].map((m) => m[0]);
}

/** Sentencias `alter table [if exists] [public.]<tabla> ... ;`. */
function sentenciasAlter(tabla: string): string[] {
  const re = new RegExp("alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?" + tabla + "\\b[\\s\\S]*?;", "gi");
  return [...SQL.matchAll(re)].map((m) => m[0]);
}

/** La columna aparece como identificador (no como parte de otro nombre) dentro del texto. */
function nombraColumna(texto: string, columna: string): boolean {
  return new RegExp("(^|[^a-z0-9_])" + columna + "($|[^a-z0-9_])", "i").test(texto);
}

function anadeColumna(alter: string, columna: string): boolean {
  return new RegExp("add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+" + columna + "\\b", "i").test(alter);
}

const RELACIONES = Object.keys(FIXTURE.definitions).sort();

describe("el fixture es la foto de producción, saneada", () => {
  it("trae las 51 relaciones y las 21 rpc que expone PostgREST", () => {
    expect(RELACIONES.length).toBe(51);
    expect(FIXTURE.rpc.length).toBe(21);
  });

  it("solo contiene definiciones y nombres de rpc: ni host, ni basePath, ni info, ni servers", () => {
    expect(Object.keys(FIXTURE).sort()).toEqual(["definitions", "rpc"]);
  });

  it("no contiene direcciones ni claves (regla 3: nada de .env.local en el repo)", () => {
    expect(FIXTURE_TEXTO).not.toContain("supabase.co");
    expect(FIXTURE_TEXTO).not.toContain("eyJ");
    expect(FIXTURE_TEXTO).not.toMatch(/https?:\/\//);
  });
});

describe("cada relación que la base expone tiene DDL en supabase/*.sql", () => {
  it.each(RELACIONES)("%s se crea en algún archivo del repo", (tabla) => {
    expect(
      bloquesCreate(tabla).length,
      `${tabla} existe en producción y ningún supabase/*.sql la crea: la base no se puede reproducir desde el repo`
    ).toBeGreaterThan(0);
  });
});

describe("cada columna que la base expone está declarada", () => {
  const casos = RELACIONES.flatMap((tabla) => Object.keys(FIXTURE.definitions[tabla].properties).map((col) => [tabla, col] as const));

  it.each(casos)("%s.%s aparece en su create o en un alter table ... add column", (tabla, col) => {
    const enCreate = bloquesCreate(tabla).some((b) => nombraColumna(b, col));
    const enAlter = sentenciasAlter(tabla).some((a) => anadeColumna(a, col));
    expect(
      enCreate || enAlter,
      `${tabla}.${col} existe en producción y el repo no la declara: el código la lee o escribe sobre algo que el DDL no describe`
    ).toBe(true);
  });
});

describe("cada rpc expuesta tiene su función en el repo", () => {
  it.each(FIXTURE.rpc)("%s", (fn) => {
    expect(SQL, `la rpc ${fn} se llama desde producción y ningún supabase/*.sql la define`).toMatch(
      new RegExp("create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?" + fn + "\\s*\\(", "i")
    );
  });
});

describe("la migración que cierra el hueco es solo aditiva", () => {
  it("no quita nada: ni drop, ni delete, ni truncate, ni alter ... drop", () => {
    // `alter ... drop` cae dentro de "ningún drop". La acción de clave foránea `on delete cascade`
    // no borra nada por sí misma: se descuenta antes de buscar un DELETE de verdad.
    const sinAccionesFk = MIGRACION.replace(/\bon\s+delete\s+(?:cascade|set\s+null|set\s+default|restrict|no\s+action)\b/g, "");
    expect(MIGRACION).not.toMatch(/\bdrop\b/);
    expect(sinAccionesFk).not.toMatch(/\bdelete\b/);
    expect(MIGRACION).not.toMatch(/\btruncate\b/);
  });

  it("es idempotente: todo create table / create index / add column lleva if not exists", () => {
    for (const m of MIGRACION.matchAll(/create\s+table\s+(\S+)/g)) expect(m[1], `create table ${m[1]} sin if not exists`).toBe("if");
    for (const m of MIGRACION.matchAll(/create\s+index\s+(\S+)/g)) expect(m[1], `create index ${m[1]} sin if not exists`).toBe("if");
    for (const m of MIGRACION.matchAll(/add\s+column\s+(\S+)/g)) expect(m[1], `add column ${m[1]} sin if not exists`).toBe("if");
  });

  it("crea exactamente las siete tablas que la auditoría encontró sin DDL", () => {
    const creadas = [...MIGRACION.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z_]+)/g)].map((m) => m[1]).sort();
    expect(creadas).toEqual(["company_metricas", "conocimiento_base", "modelo_alto_rendimiento", "modelo_versiones", "org_estudio", "org_estudio_versiones", "org_puestos"]);
  });

  it("las políticas se crean solo si no existen: no pisa las reales de producción", () => {
    const politicas = (MIGRACION.match(/create\s+policy/g) ?? []).length;
    const guardas = (MIGRACION.match(/if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+pg_policies/g) ?? []).length;
    expect(politicas).toBeGreaterThan(0);
    expect(guardas, "cada create policy necesita su guarda sobre pg_policies").toBe(politicas);
  });

  it("todo lo que el OpenAPI no trae va marcado INFERIDO en el archivo", () => {
    // Acciones de borrado, índices y políticas no vienen en el OpenAPI: no pueden presentarse como seguras.
    const lineas = MIGRACION_TEXTO.split("\n");
    lineas.forEach((l, i) => {
      // Solo la parte de sentencia: que el encabezado explique `on delete` no es una acción de borrado.
      const sentencia = l.replace(/--.*$/, "");
      if (/\bon delete\b/i.test(sentencia)) expect(l, `línea ${i + 1}: acción de borrado sin marca INFERIDO`).toMatch(/-- INFERIDO/);
      if (/^\s*create index/i.test(sentencia)) {
        const marcada = /-- INFERIDO/.test(l) || /-- INFERIDO/.test(lineas[i - 1] ?? "");
        expect(marcada, `línea ${i + 1}: índice sin marca INFERIDO (ni en la línea ni en la anterior)`).toBe(true);
      }
    });
    expect(MIGRACION_TEXTO).toMatch(/RLS[\s\S]*INFERIDO/);
  });
});

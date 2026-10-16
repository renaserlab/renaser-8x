/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LAS DIMENSIONES DE LA EVIDENCIA TIENEN COLUMNA Y LA COLUMNA TIENE CANDADO.
 *
 * migracion-evidencia-dimensiones.sql separa lo que antes era una sola perilla: en `sources` el autor, el período
 * y la fidelidad de la extracción; en `claims` la comprobación del hecho, la confianza y la vigencia; en `findings`
 * el impacto POTENCIAL, la CONFIANZA con su motivo y la bandera PROVISIONAL; en `company_metricas` el origen del
 * número. Aquí se comprueba sobre una base vacía que un hallazgo provisional con impacto potencial alto y confianza
 * 0,3 se guarda y se lee tal cual, y que los checks rechazan lo que no está en el rango: una confianza de 1,5 o un
 * impacto «enorme» no entran por la puerta de atrás.
 *
 * Qué no prueba: PostgREST, RLS por rol ni que producción tenga la migración aplicada (eso lo decide Dirección).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema } from "./aplicar";

const EMP = "0000000e-0000-4000-8000-00000000000e";
const SRC = "0000000f-0000-4000-8000-00000000000f";
const CLAIM = "00000010-0000-4000-8000-000000000010";
const FINDING = "00000011-0000-4000-8000-000000000011";

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)')", [EMP]);
  } catch (e) {
    fallo = e;
  }
}, 180_000);

afterAll(async () => {
  await pg?.close();
});

function base(): PGlite {
  if (fallo) throw fallo;
  if (!pg) throw new Error("no hay base: beforeAll no la creó");
  return pg;
}

/** Ejecuta esperando un rechazo del check; devuelve el mensaje de Postgres para afirmarlo. */
async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("Postgres embebido (PGlite), no Supabase: un hallazgo provisional se guarda con sus dimensiones separadas", () => {
  it("la fuente guarda autor, período y fidelidad; la afirmación guarda comprobación, confianza y vigencia", async () => {
    await base().query(
      `insert into sources (id, company_id, tipo, nombre, origen, autor, periodo_desde, periodo_hasta, fidelidad_extraccion, fidelidad_nota, revision)
       values ($1, $2, 'documento', 'Inventario marzo.xlsx', 'cliente', 'Rosa Quispe', '2026-03-01', '2026-03-31', 'media', 'hoja con celdas vacías', 'pendiente')`,
      [SRC, EMP]
    );
    await base().query(
      `insert into claims (id, company_id, source_id, texto, pilar, estado, comprobacion, confianza, vigente_hasta)
       values ($1, $2, $3, 'El 40 % del stock lleva más de 6 meses sin venderse', 'producto', 'sin_verificar', 'no_comprobado', 0.2, '2026-12-31')`,
      [CLAIM, EMP, SRC]
    );
    const f = await base().query<{ autor: string; periodo_desde: string; fidelidad_extraccion: string; revision: string }>("select autor, periodo_desde::text, fidelidad_extraccion, revision from sources where id = $1", [SRC]);
    expect(f.rows[0]).toEqual({ autor: "Rosa Quispe", periodo_desde: "2026-03-01", fidelidad_extraccion: "media", revision: "pendiente" });
    const c = await base().query<{ estado: string; comprobacion: string; confianza: string; vigente_hasta: string }>("select estado, comprobacion, confianza::text, vigente_hasta::text from claims where id = $1", [CLAIM]);
    expect(c.rows[0]).toEqual({ estado: "sin_verificar", comprobacion: "no_comprobado", confianza: "0.2", vigente_hasta: "2026-12-31" });
  });

  it("el hallazgo provisional con impacto potencial alto y confianza 0,3 se lee tal cual: el impacto rebajado y el potencial viven en columnas distintas", async () => {
    await base().query(
      `insert into findings (id, company_id, pilar, titulo, impacto, impacto_potencial, confianza, confianza_motivo, provisional, requiere_validacion, motivo_validacion)
       values ($1, $2, 'producto', 'Stock inmovilizado que come la caja', 'medio', 'alto', 0.3, 'se apoya en 1 afirmación de documento no confirmada; una sola fuente', true, true, 'Impacto alto con 1 fuente(s) y ninguna fuerte')`,
      [FINDING, EMP]
    );
    await base().query("insert into finding_evidence (finding_id, claim_id, relacion) values ($1, $2, 'sustenta')", [FINDING, CLAIM]);
    const r = await base().query<{ impacto: string; impacto_potencial: string; confianza: string; confianza_motivo: string; provisional: boolean; n: number }>(
      "select f.impacto, f.impacto_potencial, f.confianza::text, f.confianza_motivo, f.provisional, (select count(*)::int from finding_evidence e where e.finding_id = f.id) as n from findings f where f.id = $1",
      [FINDING]
    );
    expect(r.rows[0]).toEqual({ impacto: "medio", impacto_potencial: "alto", confianza: "0.3", confianza_motivo: "se apoya en 1 afirmación de documento no confirmada; una sola fuente", provisional: true, n: 1 });
  });

  it("provisional nace en false: los hallazgos anteriores a la migración no se vuelven provisionales de golpe", async () => {
    const r = await base().query<{ provisional: boolean; impacto_potencial: string | null; confianza: string | null }>(
      "insert into findings (company_id, pilar, titulo, impacto) values ($1, 'procesos', 'Hallazgo viejo', 'bajo') returning provisional, impacto_potencial, confianza::text",
      [EMP]
    );
    expect(r.rows[0]).toEqual({ provisional: false, impacto_potencial: null, confianza: null });
  });
});

describe("Postgres embebido (PGlite), no Supabase: los checks rechazan valores fuera de rango", () => {
  it("findings.confianza fuera de 0-1 no entra, en ningún sentido", async () => {
    expect(await rechaza("insert into findings (company_id, pilar, titulo, confianza) values ($1, 'procesos', 'x', 1.5)", [EMP])).toMatch(/check/i);
    expect(await rechaza("insert into findings (company_id, pilar, titulo, confianza) values ($1, 'procesos', 'x', -0.1)", [EMP])).toMatch(/check/i);
    // Los bordes sí valen: 0 y 1 son confianzas legítimas.
    await base().query("insert into findings (company_id, pilar, titulo, confianza) values ($1, 'procesos', 'borde 0', 0), ($1, 'procesos', 'borde 1', 1)", [EMP]);
  });

  it("findings.impacto_potencial solo admite alto, medio o bajo", async () => {
    expect(await rechaza("insert into findings (company_id, pilar, titulo, impacto_potencial) values ($1, 'procesos', 'x', 'enorme')", [EMP])).toMatch(/check/i);
  });

  it("claims.comprobacion y claims.confianza tienen el mismo candado", async () => {
    expect(await rechaza("insert into claims (company_id, source_id, texto, comprobacion) values ($1, $2, 'x', 'quizas')", [EMP, SRC])).toMatch(/check/i);
    expect(await rechaza("insert into claims (company_id, source_id, texto, confianza) values ($1, $2, 'x', 2)", [EMP, SRC])).toMatch(/check/i);
  });

  it("sources.fidelidad_extraccion y sources.revision no aceptan palabras inventadas", async () => {
    expect(await rechaza("insert into sources (company_id, tipo, nombre, fidelidad_extraccion) values ($1, 'documento', 'x', 'regular')", [EMP])).toMatch(/check/i);
    expect(await rechaza("insert into sources (company_id, tipo, nombre, revision) values ($1, 'documento', 'x', 'vista')", [EMP])).toMatch(/check/i);
  });

  it("company_metricas.origen solo admite declarado, extraido, conciliado o calculado", async () => {
    expect(await rechaza("insert into company_metricas (company_id, clave, origen) values ($1, 'venta_mes', 'inventado')", [EMP])).toMatch(/check/i);
  });
});

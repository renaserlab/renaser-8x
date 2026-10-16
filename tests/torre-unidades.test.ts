/**
 * LAS CUATRO UNIDADES NO SE CONFUNDEN, Y NINGÚN JOIN LAS MULTIPLICA.
 *
 * Esta prueba existe por dos errores míos, no por prudencia abstracta:
 *
 *  1. Reporté «más de 1.900 ejecuciones» y «269 trabajos contrastar fallidos». Los dos estaban
 *     INFLADOS: hice `LEFT JOIN token_usage` y conté con `count(*)`, así que cada trabajo se contó
 *     una vez por cada llamada al modelo que hizo. Los números reales eran 697 y 9.
 *  2. La primera torre agregaba en JavaScript trayendo filas con `.limit(20000)`. Supabase devuelve
 *     como máximo 1.000 filas por petición, así que con 1.583 llamadas mostró 8 agentes como 7 y una
 *     latencia media de 4,9 s donde era 14,7 s. Recortado en silencio, presentado como completo.
 *
 * Así que se comprueba lo estructural: que las funciones de agregación cuenten cada unidad en su
 * propia subconsulta, que la torre no agregue en memoria, y que todo tope se declare.
 *
 * ALCANCE: análisis del SQL y del código. Las cifras concretas contra la base se verifican con
 * `scripts/prueba-torre.mts`, que no vive en esta suite porque necesita credenciales.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { TOPE_LISTA, PREFIJO_TRABAJO } from "@/lib/torre";

const SQL = readFileSync(path.resolve(__dirname, "../supabase/migracion-torre.sql"), "utf8");
const TORRE = readFileSync(path.resolve(__dirname, "../src/lib/torre.ts"), "utf8");
const QUERIES = readFileSync(path.resolve(__dirname, "../src/lib/db/queries.ts"), "utf8");
const WORKER = readFileSync(path.resolve(__dirname, "../src/lib/jobs/worker.ts"), "utf8");

describe("ningún JOIN multiplica los conteos", () => {
  it("torre_totales cuenta cada unidad en su propia subconsulta, sin un solo join", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function torre_totales"), SQL.indexOf("revoke all on function torre_por_agente"));
    expect(fn).not.toMatch(/\bjoin\b/i);
    // Una subconsulta independiente por unidad: trabajos, estados, reintentos y llamadas.
    expect((fn.match(/\(select count\(\*\) from jobs/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(fn).toMatch(/\(select count\(\*\) from token_usage\)/);
  });

  it("los trabajos se cuentan desde jobs y las llamadas desde token_usage, nunca al revés", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function torre_totales"));
    // «trabajos» nunca sale de token_usage.
    expect(fn).not.toMatch(/trabajos[\s\S]{0,40}from token_usage/i);
  });

  it("torre_por_agente distingue llamadas de trabajos distintos", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function torre_por_agente"), SQL.indexOf("create or replace function torre_totales"));
    expect(fn, "sin count(*) no hay llamadas").toMatch(/count\(\*\)/);
    expect(fn, "sin count(distinct job_id) se confundirían llamadas con trabajos").toMatch(/count\(distinct t\.job_id\)/);
  });

  it("el reintento no se cuenta como un trabajo nuevo: sale de intentos - 1", () => {
    expect(SQL).toMatch(/greatest\(intentos - 1, 0\)/);
    expect(TORRE).toMatch(/Math\.max\(n\(j\.intentos\) - 1, 0\)/);
  });
});

describe("no se agrega en memoria: los topes de fila no pueden recortar un total", () => {
  it("la torre no trae filas de token_usage para contarlas en JavaScript", () => {
    // El patrón que falló: select sobre token_usage con limit alto y reduce/length después.
    expect(TORRE).not.toMatch(/from\("token_usage"\)[\s\S]{0,200}\.limit\(\s*\d{4,}\s*\)/);
  });

  it("los totales y el consumo por agente salen de funciones de la base", () => {
    expect(TORRE).toMatch(/rpc\("torre_totales"\)/);
    expect(TORRE).toMatch(/rpc\("torre_por_agente"\)/);
  });

  it("el consumo de una empresa también se suma en la base: de eso depende el tope de gasto", () => {
    expect(QUERIES).toMatch(/rpc\("tokens_de_empresa"/);
    expect(QUERIES, "sumar en memoria se truncaría a 1.000 filas y dejaría pasar cualquier gasto").not.toMatch(
      /tokensUsados[\s\S]{0,300}reduce\(/
    );
  });

  it("si no se puede calcular el consumo, se propaga el error en vez de devolver cero", () => {
    const fn = QUERIES.slice(QUERIES.indexOf("export async function tokensUsados"));
    expect(fn.slice(0, 500)).toMatch(/throw new Error/);
  });
});

describe("los límites de cobertura se declaran, no se aplican en silencio", () => {
  it("la lista de trabajos declara su tope", () => {
    expect(TORRE).toMatch(/topes: \[`Máximo \$\{pedidos\} trabajos/);
  });

  it("el filtro por agente avisa de que filtra sobre la página, no sobre el histórico", () => {
    expect(TORRE).toMatch(/SOBRE esos \$\{pedidos\} trabajos, no sobre todo el histórico/);
  });

  it("los totales no aplican tope de filas ni muestreo", () => {
    expect(TORRE).toMatch(/sin muestreo ni tope de filas/i);
    const fn = TORRE.slice(TORRE.indexOf("export async function totales"), TORRE.indexOf("export type EjecucionResumen"));
    expect(fn).not.toMatch(/\.limit\(/);
  });

  it("pero NO se declaran «todo el histórico»: las ejecuciones se borran con la empresa", () => {
    // Hallazgo del rastreo adversarial: jobs y token_usage cuelgan de companies con `on delete
    // cascade`, y el 31-08-2026 se eliminaron 18 de 23 empresas. Decir «todo el histórico» sobre lo
    // que queda es medir a los supervivientes y concluir sobre la historia completa.
    expect(TORRE, "la cobertura no puede afirmar que cubre todo el histórico").not.toMatch(/Todo el histórico/);
    expect(TORRE).toMatch(/se borran con la empresa/);
  });

  it("«nunca ha corrido» ya no se afirma: se dice «sin registro recuperable»", () => {
    // Se miran los textos que se PINTAN, no los comentarios: el comentario de cabecera nombra la
    // frase prohibida justamente para explicar por qué no se usa, y prohibirla ahí sería ruido.
    const ficha = readFileSync(path.resolve(__dirname, "../src/components/consultor/Torre.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(ficha, "la ausencia de filas no prueba que un agente no haya corrido").not.toMatch(/nunca ha corrido/);
    expect(ficha).toMatch(/sin registro recuperable|Sin ejecuciones en el registro recuperable/);
  });

  it("existe una huella por agente que sobrevive al borrado de la empresa", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migracion-huella-agentes.sql"), "utf8");
    // Sin company_id a propósito: es lo único que responde «¿corrió alguna vez?» tras un borrado.
    const tabla = sql.slice(sql.indexOf("create table if not exists agente_huella"), sql.indexOf("alter table agente_huella"));
    expect(tabla).not.toMatch(/company_id/);
    expect(QUERIES, "la huella tiene que marcarse en cada llamada").toMatch(/rpc\("marcar_agente"/);
  });

  it("el tope de la lista es un número explícito y exportado, no un literal escondido", () => {
    expect(TOPE_LISTA).toBeGreaterThan(0);
    expect(TORRE).toMatch(/export const TOPE_LISTA/);
  });
});

describe("la columna del agente no se ensucia con tipos de trabajo", () => {
  it("el worker marca el fallo del trabajo con prefijo en vez de escribir el tipo a secas", () => {
    expect(WORKER).toMatch(/registrarErrorLlamada\([^)]*`trabajo:\$\{job\.tipo\}`/);
  });

  it("el prefijo está en un solo sitio y la torre lo reconoce", () => {
    expect(PREFIJO_TRABAJO).toBe("trabajo:");
    expect(TORRE).toMatch(/startsWith\(PREFIJO_TRABAJO\)/);
  });

  it("solo los agentes con contrato cuentan como agentes en los totales", () => {
    expect(TORRE).toMatch(/filas\.filter\(\(f\) => esAgenteConocido\(f\.agente\)\)\.length/);
  });

  it("un agente que nunca corrió devuelve null, no ceros", () => {
    expect(TORRE).toMatch(/real: AgenteEnTorre\["real"\]|real: MedidoPorAgente \| null/);
    expect(TORRE).toMatch(/nuncaCorrio|real: f\s*\?/);
  });
});

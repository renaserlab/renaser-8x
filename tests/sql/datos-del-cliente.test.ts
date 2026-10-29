/**
 * EL ARCHIVO DE DATOS DEL PRIMER CLIENTE, ENSAYADO ANTES DE PEGARLO.
 *
 * Son más de 70 KB que van a producción sobre la empresa que es el primer cliente real: el texto
 * completo de su manual de funciones vigente, su revisión contra la vara, los 16 entregables de su
 * contrato y dos correcciones de filas que ya existen. Pegar eso sin ensayarlo es exactamente lo
 * que esta casa no hace.
 *
 * LA IDENTIDAD DEL CLIENTE NO ESTÁ AQUÍ. Este repositorio es público. El nombre de la empresa, los
 * identificadores de su base y los nombres de sus personas viven en
 * `clientes/8x-produccion/identidad-primer-cliente.json`, que está en .gitignore; esta prueba lo
 * lee. Si ese archivo o el texto del documento no están —en otra máquina, o en otra sesión— la
 * prueba SE SALTA diciéndolo. Una prueba que se da por buena sin el dato es peor que ninguna.
 *
 * Qué se comprueba, sobre un Postgres de verdad (PGlite) con el esquema y las migraciones aplicadas:
 *   · que el archivo sea SQL válido y entre completo en una sola transacción;
 *   · que deje el expediente con su manual VIGENTE y medido, que es lo que la dueña busca en su portal;
 *   · que NO toque ninguna jefatura del organigrama: la que hay está registrada citando a la Gerencia,
 *     y reescribirla desde un archivo nuestro sería sustituir su declaración por la nuestra;
 *   · que no quede ningún nombre propio de persona en el título de una decisión;
 *   · que se pueda ejecutar dos veces sin duplicar nada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarArchivo, leerOrden, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";

const RAIZ = path.resolve(__dirname, "..", "..");
const RUTA_IDENTIDAD = path.join(RAIZ, "clientes/8x-produccion/identidad-primer-cliente.json");

type Identidad = {
  company_id: string;
  nombre: string;
  sector: string;
  gerencia_user_id: string;
  decision_caja_id: string;
  documento: { nombre: string; version: string; entregable: string; activo_clave: string };
  nombres_que_no_pueden_aparecer: string[];
  archivos: { documento: string; revision: string };
};

const SC = `${process.env.TEMP}/claude/C--Users-Usuario-Desktop-RenaserConsulting/32e6e0d5-86e6-428c-b96f-0eda8d2f9c90/scratchpad`;
const I: Identidad | null = existsSync(RUTA_IDENTIDAD) ? (JSON.parse(readFileSync(RUTA_IDENTIDAD, "utf8")) as Identidad) : null;
const HAY_DATOS = !!I && existsSync(`${SC}/${I.archivos.documento}`) && existsSync(`${SC}/${I.archivos.revision}`);

/** El archivo tal como se va a pegar. Se arma aquí para que la prueba ensaye lo mismo que se pega. */
function armarDatos(): string {
  return execFileSync("node", ["--import=tsx", "scripts/produccion/armar-datos-cliente.ts"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Una base con todo el esquema y todas las migraciones, y la empresa con los puestos sin jefatura y
 * la decisión con nombre propio que hay hoy en producción.
 */
async function baseConLaEmpresa(i: Identidad): Promise<PGlite> {
  const pg = await crearBase();
  await aplicarArchivo(pg, RUTA_ENTORNO);
  for (const e of leerOrden()) await aplicarArchivo(pg, path.join(CARPETA_SUPABASE, e.archivo), e.archivo);

  await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'gerencia@empresa.test', $2::jsonb)", [
    i.gerencia_user_id,
    JSON.stringify({ nombre: "Gerencia General" }),
  ]);
  await pg.query("insert into companies (id, nombre, sector) values ($1, $2, $3)", [i.company_id, i.nombre, i.sector]);

  // Los puestos como están hoy en producción: la jefatura SÍ está registrada —14 de 15 la tienen, y
  // cada una cita lo que la Gerencia declaró el 29-08-2026—, y el archivo no la toca. Lo que falta
  // es su confirmación por puestos, porque esa declaración nombraba personas y dos ya salieron.
  const puestos: Record<string, string> = {};
  for (const n of ["Gerencia General", "Administrador(a) General", "Supervisora de Caja Principal", "Encargado(a) de Tienda"]) {
    const { rows } = await pg.query<{ id: string }>("insert into org_puestos (company_id, nombre) values ($1, $2) returning id", [i.company_id, n]);
    puestos[n] = rows[0]!.id;
  }
  await pg.query("update org_puestos set reporta_a = $1 where company_id = $2 and nombre <> 'Gerencia General'", [
    puestos["Gerencia General"],
    i.company_id,
  ]);
  // La decisión con el nombre propio en el título, tal como está en producción.
  await pg.query(
    "insert into decisiones (id, company_id, titulo, por_que_ahora, estado) values ($1, $2, $3, 'Del dossier del 16-10-2026.', 'pendiente')",
    [i.decision_caja_id, i.company_id, `Caja principal y ${i.nombres_que_no_pueden_aparecer[0]}: ¿quién mueve el dinero y quién lo revisa?`]
  );
  return pg;
}

describe.skipIf(!HAY_DATOS)("Postgres embebido: el archivo de datos del primer cliente", () => {
  let pg: PGlite | undefined;
  let sql = "";
  const i = I!;

  beforeAll(async () => {
    sql = armarDatos();
    pg = await baseConLaEmpresa(i);
  }, 300_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("es una sola transacción y no borra ni vacía nada", () => {
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    const sinComentarios = sql.replace(/^--.*$/gm, "");
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(sinComentarios).not.toMatch(/\btruncate\b/i);
    expect(sinComentarios).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("trae el texto del documento completo, no un resumen: sin texto no se puede volver a medir", () => {
    const texto = readFileSync(`${SC}/${i.archivos.documento}`, "utf8");
    // Un trozo del medio del documento, para que no pase con solo el encabezado.
    const medio = texto.slice(Math.floor(texto.length / 2), Math.floor(texto.length / 2) + 60);
    expect(sql).toContain(medio);
    expect(sql.length).toBeGreaterThan(texto.length);
  });

  it("entra completo de una vez y lo dice", async () => {
    const resultados = await pg!.exec(sql);
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("DATOS DEL CLIENTE APLICADOS");
    expect(Number(ultima.entregables_del_contrato_de_16)).toBe(16);
    expect(Number(ultima.documentos_en_el_expediente)).toBe(1);
    expect(Number(ultima.vigentes)).toBe(1);
    expect(Number(ultima.revisiones)).toBe(1);
    expect(Number(ultima.decisiones_con_nombre_propio_debe_ser_0)).toBe(0);
  }, 300_000);

  it("el documento queda vigente, con su aprobación y su fecha de vigencia separadas", async () => {
    const { rows } = await pg!.query<{
      estado: string;
      origen: string;
      entregable: string;
      activo_clave: string;
      aprobado_por: string;
      aprobado_at: Date;
      vigente_desde: Date;
      version: string;
    }>(
      "select estado, origen, entregable, activo_clave, aprobado_por, aprobado_at, vigente_desde, version from expediente_documental where company_id = $1",
      [i.company_id]
    );
    expect(rows).toHaveLength(1);
    const d = rows[0]!;
    expect(d.estado).toBe("vigente");
    expect(d.origen, "es el documento que la empresa tiene: materia prima, no obra nuestra").toBe("cliente");
    expect(d.entregable).toBe(i.documento.entregable);
    expect(d.activo_clave, "sin esto el sistema puede volver a construirlo desde cero").toBe(i.documento.activo_clave);
    expect(d.version).toBe(i.documento.version);
    // La aprobación es la decisión y la vigencia el estado institucional: dos campos, no uno.
    expect(d.aprobado_por).toBe(i.gerencia_user_id);
    expect(d.aprobado_at).not.toBeNull();
    expect(d.vigente_desde).not.toBeNull();
  });

  it("su revisión guarda un veredicto por exigencia y el veredicto sale de ellos", async () => {
    const esperada = JSON.parse(readFileSync(`${SC}/${i.archivos.revision}`, "utf8")) as {
      veredicto: string;
      verdictos: { cumple: string }[];
    };
    const { rows } = await pg!.query<{ veredicto: string; total: number; cumple: number; contenido: { verdictos: unknown[] } }>(
      "select veredicto, exigencias_total as total, exigencias_cumple as cumple, contenido from revision_documental where company_id = $1",
      [i.company_id]
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.total).toBe(esperada.verdictos.length);
    expect(r.cumple).toBe(esperada.verdictos.filter((v) => v.cumple === "si").length);
    expect(r.veredicto).toBe(esperada.veredicto);
    expect(r.contenido.verdictos).toHaveLength(esperada.verdictos.length);
    // Un documento vigente puede estar medido como deficiente: las dos cosas son verdad a la vez, y
    // es lo que justifica una versión nueva en vez de un documento desde cero.
    if (r.cumple < r.total) expect(r.veredicto).not.toBe("cumple");
  });

  // Esta es la prueba que impide el error más fácil de cometer aquí.
  it("NO toca ninguna jefatura: la que hay la declaró la Gerencia y no se sustituye desde un archivo nuestro", async () => {
    // Se mira el SQL sin comentarios: los comentarios SÍ nombran `reporta_a`, justamente para
    // explicar por qué no se escribe. Lo que no puede haber es una sentencia que lo escriba.
    const sentencias = sql.replace(/^--.*$/gm, "");
    expect(sentencias, "una línea de mando escrita por nosotros es una línea de mando inventada").not.toMatch(/reporta_a/);
    expect(sentencias).not.toMatch(/update\s+org_puestos/i);
    expect(sentencias).not.toMatch(/insert\s+into\s+org_puestos/i);
    // La jefatura que había antes de aplicar el archivo sigue intacta después de aplicarlo.
    const { rows } = await pg!.query<{ n: number }>("select count(*)::int as n from org_puestos where company_id = $1 and reporta_a is not null", [
      i.company_id,
    ]);
    expect(rows[0]!.n, "el archivo no añade ni quita jefaturas").toBe(3);
  });

  it("en su lugar abre la decisión de CONFIRMAR la estructura, con lo que falta preguntar", async () => {
    const { rows } = await pg!.query<{ titulo: string; estado: string; faltantes: string[] }>(
      "select titulo, estado, faltantes from decisiones where company_id = $1 and titulo like 'Línea de mando:%'",
      [i.company_id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.estado).toBe("pendiente");
    expect(rows[0]!.faltantes.length, "lo que falta se pregunta puesto por puesto").toBeGreaterThanOrEqual(5);
  });

  it("ningún título de decisión lleva un nombre propio de persona", async () => {
    const { rows } = await pg!.query<{ titulo: string }>("select titulo from decisiones where company_id = $1", [i.company_id]);
    for (const { titulo } of rows) {
      for (const n of i.nombres_que_no_pueden_aparecer) expect(titulo, titulo).not.toContain(n);
    }
    // Y la que llevaba uno sigue existiendo, con el puesto en su lugar: no se borró una decisión abierta.
    expect(rows.map((r) => r.titulo).join(" | ")).toMatch(/Caja principal y el Administrador\(a\) General/);
  });

  it("los 16 entregables traen su cláusula, y los cuatro que no son documentos están marcados", async () => {
    const { rows } = await pg!.query<{ clave: string; clausula: string; tipo: string }>(
      "select clave, clausula, tipo from contrato_entregables where company_id = $1 order by orden",
      [i.company_id]
    );
    expect(rows).toHaveLength(16);
    for (const e of rows) expect(e.clausula, e.clave).toMatch(/^2\.\d$/);
    expect(rows.filter((e) => e.tipo !== "documento").map((e) => e.clave)).toEqual([
      "auditoria_diagnostico",
      "auditoria_interna",
      "capacitacion_general",
      "acompanamiento_induccion",
    ]);
  });

  it("se puede ejecutar por segunda vez sin duplicar nada", async () => {
    await pg!.exec(sql);
    const n = async (t: string, donde = "") =>
      (await pg!.query<{ n: number }>(`select count(*)::int as n from ${t} where company_id = $1 ${donde}`, [i.company_id])).rows[0]!.n;
    expect(await n("contrato_entregables")).toBe(16);
    expect(await n("expediente_documental")).toBe(1);
    expect(await n("revision_documental")).toBe(1);
    expect(await n("decisiones", "and titulo like 'Línea de mando:%'")).toBe(1);
  }, 300_000);
});

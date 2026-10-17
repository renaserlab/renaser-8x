/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LA ESTRATEGIA QUE 8X GENERA SOLA (migracion-estrategia.sql, 16-10-2026).
 *
 * Qué se comprueba, sobre TODO el esquema del repositorio (clientes/8x-plan/spec-estrategia-8x.md, §9.3 y §10):
 *  - la migración aplica dos veces seguidas, las tres tablas tienen RLS y ninguna tabla de public queda sin ella;
 *  - cada check rechaza lo que debe (estado, etapa, camino, huella, puntero, clave y texto de la pregunta, unidad en
 *    porcentaje, respondida sin respuesta, aprobada sin camino ni página del dueño) y deja pasar lo que debe;
 *  - una sola estrategia aprobada y una sola en curso por empresa; una sola pregunta abierta por clave;
 *  - el rastro de ediciones no se cambia (el disparador lo rechaza), salvo el autor que pasa a nulo cuando se borra
 *    un usuario: si no, borrar la cuenta de una consultora fallaría;
 *  - RLS: el dueño no lee ninguna de las tres (su camino y sus preguntas se los da la aplicación) ni escribe nada; la
 *    consultora LEE todo, pero desde el navegador no escribe nada —ni aprobar, ni la página del dueño, ni el estado de
 *    las preguntas, ni el rastro con otro autor—: toda escritura pasa por la aplicación (revisión del 17-10); el
 *    anónimo nada; las dos funciones solo las ejecuta el servidor;
 *  - estrategia_lente_lista devuelve true solo cuando están las dos lentes y no escribe en una versión que no está
 *    en curso; aprobar_estrategia deja una sola aprobada, dice por qué no aprueba y no aprueba una fila que cambió
 *    después de leerla (bloqueo optimista con su updated_at);
 *  - los checks ampliados admiten preguntas_estrategia y plan_estrategico, y nada inventado;
 *  - borrar la empresa vacía las tres tablas;
 *  - si falta migracion-entrar-hoy.sql, se detiene antes de cambiar nada y dice qué aplicar primero;
 *  - la reversión (supabase/revertir/migracion-estrategia.sql) apaga sin perder filas, y después la migración vuelve
 *    a aplicar CON sus índices únicos (si los nombres siguieran vivos en las retiradas, no se crearían, sin aviso).
 *
 * Límite: rol y claims los pone la prueba; no hay PostgREST. Que producción quede igual exige aplicar la migración,
 * y eso solo con el «sí» de Kelin (§10.4). Empresas y personas ficticias.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { readFileSync } from "fs";
import type { PGlite } from "@electric-sql/pglite";
import { aplicarArchivo, aplicarTodo, baseConEsquema, consultarComo, crearBase, dividirSentencias, leerOrden, CARPETA_SUPABASE, type Rol } from "./aplicar";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const U_D = "00000000-0000-4000-8000-0000000000d1"; // consultora que deja el equipo (se borra su cuenta)
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const HUELLA = "0123456789abcdef".repeat(4);
const TABLAS = ["estrategias", "estrategia_ediciones", "estrategia_preguntas"] as const;
const FUNCIONES = ["estrategia_lente_lista", "aprobar_estrategia"] as const;
const MIGRACION = path.join(CARPETA_SUPABASE, "migracion-estrategia.sql");
const REVERSION = path.join(CARPETA_SUPABASE, "revertir", "migracion-estrategia.sql");
/** Los índices de cada tabla, por nombre: los que la migración nombra y los que Postgres nombra por la clave primaria y la única. */
const INDICES: Record<(typeof TABLAS)[number], string[]> = {
  estrategias: ["estrategias_company_id_version_key", "estrategias_company_idx", "estrategias_dia_idx", "estrategias_pkey", "estrategias_una_aprobada", "estrategias_una_en_curso"],
  estrategia_ediciones: ["estrategia_ediciones_idx", "estrategia_ediciones_pkey"],
  estrategia_preguntas: ["estrategia_preguntas_company_idx", "estrategia_preguntas_pkey", "estrategia_preguntas_una_abierta"],
};
const PAGINA_DEL_DUENO = { titulo: "El camino que elegimos", pasos: ["uno", "dos", "tres"] };

type Base = { pg: PGlite };

/** Ayudas sobre una base: cada describe tiene la suya. */
function ayudas(b: Base) {
  const db = () => b.pg;
  /** El código de Postgres con que falla una sentencia, o null si pasó. */
  const codigo = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await db().query(sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  /** El mensaje con que falla una sentencia (para las excepciones con texto de la casa), o null si pasó. */
  const mensaje = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await db().query(sql, params);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const codigoComo = async (rol: Rol, sub: string | null, sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await consultarComo(db(), rol, sub, sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  const cuenta = async (rol: Rol, sub: string | null, tabla: string): Promise<number> =>
    (await consultarComo<{ n: number }>(db(), rol, sub, `select count(*)::int as n from ${tabla}`))[0]!.n;
  const filas = async (tabla: string): Promise<number> => (await db().query<{ n: number }>(`select count(*)::int as n from ${tabla}`)).rows[0]!.n;
  const existe = async (rel: string): Promise<boolean> => (await db().query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${rel}`])).rows[0]!.t !== null;
  const indicesDe = async (tabla: string): Promise<string[]> =>
    (await db().query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public' and tablename = $1", [tabla])).rows.map((r) => r.indexname).sort();
  const funciones = async (): Promise<string[]> =>
    (await db().query<{ proname: string }>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${FUNCIONES.map((f) => `'${f}'`).join(",")})`)).rows
      .map((r) => r.proname)
      .sort();
  /** Una versión de estrategia con lo mínimo; los objetos van como jsonb. Devuelve su id. */
  const estrategia = async (emp: string, version: number, campos: Record<string, unknown> = {}): Promise<string> => {
    const todo: Record<string, unknown> = { company_id: emp, version, paquete: {}, paquete_huella: HUELLA, calculos: {}, ...campos };
    const cols = Object.keys(todo);
    const marcas = cols.map((c, i) => (todo[c] !== null && typeof todo[c] === "object" ? `$${i + 1}::text::jsonb` : `$${i + 1}`));
    const valores = cols.map((c) => (todo[c] !== null && typeof todo[c] === "object" ? JSON.stringify(todo[c]) : todo[c]));
    const { rows } = await db().query<{ id: string }>(`insert into estrategias (${cols.join(",")}) values (${marcas.join(",")}) returning id`, valores);
    return rows[0]!.id;
  };
  const aprobada = (emp: string, version: number, extra: Record<string, unknown> = {}) =>
    estrategia(emp, version, { estado: "aprobada", camino_elegido: "a", para_dueno: PAGINA_DEL_DUENO, aprobada_at: new Date().toISOString(), ...extra });
  /** Siembra lo mismo en una empresa: v1 aprobada, v2 en curso, dos ediciones y cuatro preguntas (una por estado). */
  const sembrar = async (emp: string, autorQueSeVa: string | null = null) => {
    const v1 = await aprobada(emp, 1);
    const v2 = await estrategia(emp, 2, { basada_en: v1, pedida_por: U_C });
    await db().query(
      "insert into estrategia_ediciones (estrategia_id, company_id, puntero, tipo, antes, despues, autor) values ($1, $2, '/vigente/lectura/0', 'texto', '\"lo que escribió 8X\"'::jsonb, '\"lo que corrigió la consultora\"'::jsonb, $3), ($1, $2, '/camino_elegido', 'eleccion', null, '\"a\"'::jsonb, $4)",
      [v1, emp, U_C, autorQueSeVa ?? U_C]
    );
    await db().query(
      `insert into estrategia_preguntas (company_id, estrategia_id, clave, texto, unidad, estado, respuesta, respondida_at) values
        ($1, $2, 'interesados_mes', 'En un mes normal, ¿cuántas personas te preguntan precio o te piden información?', 'unidades_mes', 'propuesta', null, null),
        ($1, $2, 'clientes_dormidos', '¿Cuántos clientes te compraron alguna vez y este año no han vuelto?', 'personas', 'enviada', null, null),
        ($1, $2, 'dias_pago_proveedor', '¿A cuántos días le pagas a tu proveedor principal?', 'dias', 'respondida', '{"valor": {"desde": 15, "hasta": 30}, "estado": "estimado"}'::jsonb, now()),
        ($1, $2, 'horas_dueno_semana', 'En una semana normal, ¿cuántas horas trabajas en el negocio?', 'horas_semana', 'retirada', null, null)`,
      [emp, v2]
    );
    return { v1, v2 };
  };
  return { db, codigo, mensaje, codigoComo, cuenta, filas, existe, indicesDe, funciones, estrategia, aprobada, sembrar };
}

/** Las cuentas de la prueba: el disparador handle_new_user crea su perfil en public.users. */
async function personasYEmpresas(pg: PGlite) {
  await pg.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', '{}'::jsonb), ($2, 'dueno-b@prueba.local', '{}'::jsonb), ($3, 'consultora@prueba.local', '{}'::jsonb), ($4, 'otra-consultora@prueba.local', '{}'::jsonb)",
    [U_A, U_B, U_C, U_D]
  );
  await pg.query("update users set rol = 'consultor' where id in ($1, $2)", [U_C, U_D]);
  await pg.query("insert into companies (id, nombre) values ($1, 'Frutas Ficticias A'), ($2, 'Consultorio Ficticio B')", [EMP_A, EMP_B]);
  await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
}

describe("Postgres embebido (PGlite), no Supabase: migracion-estrategia.sql", () => {
  const b = {} as Base;
  const h = ayudas(b);
  let semilla: { a: { v1: string; v2: string }; b: { v1: string; v2: string } };

  beforeAll(async () => {
    b.pg = (await baseConEsquema()).pg;
    await personasYEmpresas(b.pg);
    semilla = { a: await h.sembrar(EMP_A, U_D), b: await h.sembrar(EMP_B) };
  }, 240_000);

  afterAll(async () => {
    await b.pg?.close();
  });

  it("se puede aplicar dos veces más sobre la base ya migrada: no falla, no toca filas y deja los mismos índices", async () => {
    const antes = await Promise.all(TABLAS.map((t) => h.filas(t)));
    for (let vez = 0; vez < 2; vez++) for (const s of dividirSentencias(readFileSync(MIGRACION, "utf8"))) await h.db().exec(s);
    expect(await Promise.all(TABLAS.map((t) => h.filas(t)))).toEqual(antes);
    for (const t of TABLAS) expect(await h.indicesDe(t), t).toEqual([...INDICES[t]].sort());
    expect(await h.funciones()).toEqual([...FUNCIONES].sort());
  });

  it("ninguna tabla de public queda sin RLS, y las tres nuevas la tienen", async () => {
    const { rows } = await h.db().query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'"
    );
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    for (const t of TABLAS) expect(rows.find((r) => r.relname === t)?.relrowsecurity, t).toBe(true);
  });

  it("los checks de estrategias: estado sin «fallida», etapa, origen, camino, huella, paquete y cálculos como objeto, versión desde 1", async () => {
    const intento = (campos: Record<string, unknown>) => h.estrategia(EMP_A, 50, { estado: "descartada", ...campos }).then(() => null, (e) => (e as { code?: string }).code ?? String(e));
    expect(await intento({ estado: "fallida" })).toBe("23514");
    expect(await intento({ etapa: "pensando" })).toBe("23514");
    expect(await intento({ origen: "manual" })).toBe("23514");
    expect(await intento({ camino_elegido: "c" })).toBe("23514");
    expect(await intento({ paquete_huella: "abc" })).toBe("23514");
    expect(await intento({ paquete_huella: HUELLA.toUpperCase() })).toBe("23514");
    expect(await intento({ paquete: ["no", "es", "objeto"] })).toBe("23514");
    expect(await intento({ calculos: ["tampoco"] })).toBe("23514");
    expect(await intento({ version: 0 })).toBe("23514");
    expect(await intento({ errores: { no: "es lista" } })).toBe("23514");
    expect(await intento({ trabajos: ["no", "es", "objeto"] })).toBe("23514");
    expect(await intento({ motivo_eleccion: "x".repeat(601) })).toBe("23514");
    // Aprobada exige el camino elegido, la página del dueño y la fecha de aprobación.
    expect(await intento({ estado: "aprobada", para_dueno: PAGINA_DEL_DUENO, aprobada_at: new Date().toISOString() })).toBe("23514");
    expect(await intento({ estado: "aprobada", camino_elegido: "a", aprobada_at: new Date().toISOString() })).toBe("23514");
    expect(await intento({ estado: "aprobada", camino_elegido: "a", para_dueno: PAGINA_DEL_DUENO })).toBe("23514");
    // Sin paquete no hay versión, y el número de versión no se repite en la empresa.
    expect(await h.codigo("insert into estrategias (company_id, version, paquete_huella, calculos) values ($1, 51, $2, '{}'::jsonb)", [EMP_A, HUELLA])).toBe("23502");
    expect(await intento({ version: 1 })).toBe("23505");
    // Lo que sí vale: una versión descartada con todo en forma.
    expect(await intento({ etapa: "equipo_rojo", origen: "actualizacion", errores: [{ etapa: "terreno", motivo: "no salió" }], trabajos: { dinero: null } })).toBeNull();
  });

  it("una sola estrategia en curso y una sola aprobada por empresa; la otra empresa no estorba", async () => {
    // A ya tiene su v2 en curso: una tercera en curso choca (también ante un doble clic).
    expect(await h.codigo("insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 60, '{}'::jsonb, $2, '{}'::jsonb)", [EMP_A, HUELLA])).toBe("23505");
    // Y una segunda aprobada también.
    expect(await h.aprobada(EMP_A, 61).then(() => null, (e) => (e as { code?: string }).code)).toBe("23505");
    // Reemplazadas, listas y descartadas pueden ser muchas.
    expect(await h.estrategia(EMP_A, 62, { estado: "reemplazada" }).then(() => null)).toBeNull();
    expect(await h.estrategia(EMP_A, 63, { estado: "lista" }).then(() => null)).toBeNull();
    expect(await h.estrategia(EMP_A, 64, { estado: "lista" }).then(() => null)).toBeNull();
    // Descartar la que está en curso libera el lugar.
    await h.db().query("update estrategias set estado = 'descartada' where id = $1", [semilla.a.v2]);
    const nueva = await h.estrategia(EMP_A, 65);
    expect(await h.codigo("update estrategias set estado = 'en_curso' where id = $1", [semilla.a.v2])).toBe("23505");
    await h.db().query("update estrategias set estado = 'descartada' where id = $1", [nueva]);
    await h.db().query("update estrategias set estado = 'en_curso' where id = $1", [semilla.a.v2]);
  });

  it("el rastro de ediciones: puntero y tipo con su forma; no se cambia, solo se agrega", async () => {
    const editar = (puntero: string, tipo = "texto") =>
      h.codigo("insert into estrategia_ediciones (estrategia_id, company_id, puntero, tipo, autor) values ($1, $2, $3, $4, $5)", [semilla.a.v1, EMP_A, puntero, tipo, U_C]);
    expect(await editar("/vigente/caminos/a/jugadas/1/que_se_mueve")).toBeNull();
    expect(await editar("vigente/lectura")).toBe("23514");
    expect(await editar("/Vigente/lectura")).toBe("23514");
    expect(await editar("/vigente/{{C:poder.precio}}")).toBe("23514");
    expect(await editar("/" + "a".repeat(200))).toBe("23514");
    expect(await editar("/vigente/lectura/0", "borrar")).toBe("23514");
    // El disparador rechaza cualquier cambio: lo que se corrige es una edición nueva.
    expect(await h.mensaje("update estrategia_ediciones set despues = '\"otra cosa\"'::jsonb where company_id = $1", [EMP_A])).toMatch(/El rastro de ediciones no se cambia/);
    expect(await h.mensaje("update estrategia_ediciones set autor = $2 where company_id = $1 and autor = $3", [EMP_A, U_D, U_C])).toMatch(/El rastro de ediciones no se cambia/);
    expect(await h.mensaje("update estrategia_ediciones set autor = null, despues = '\"otra cosa\"'::jsonb where company_id = $1 and autor = $2", [EMP_A, U_D])).toMatch(
      /El rastro de ediciones no se cambia/
    );
  });

  it("borrar la cuenta de una consultora que corrigió una estrategia funciona: su edición queda, con autor nulo y lo demás igual", async () => {
    const antes = await h.db().query("select id, estrategia_id, company_id, puntero, tipo, antes, despues, created_at from estrategia_ediciones where autor = $1", [U_D]);
    expect(antes.rows).toHaveLength(1);
    await h.db().query("delete from users where id = $1", [U_D]);
    const despues = await h.db().query<{ autor: string | null }>("select id, estrategia_id, company_id, puntero, tipo, antes, despues, created_at, autor from estrategia_ediciones where id = $1", [
      (antes.rows[0] as { id: string }).id,
    ]);
    expect(despues.rows[0]!.autor).toBeNull();
    const { autor, ...resto } = despues.rows[0] as Record<string, unknown>;
    expect(autor).toBeNull();
    expect(resto).toEqual(antes.rows[0]);
  });

  it("las preguntas: clave, texto, unidad (nunca en porcentaje), estado y respuesta con su forma; una abierta por clave", async () => {
    const preguntar = (clave: string, texto: string, extra: { unidad?: string; estado?: string; respuesta?: string; respuesta_texto?: string; espera?: string; por_que?: string } = {}) =>
      h.codigo(
        "insert into estrategia_preguntas (company_id, clave, texto, unidad, estado, respuesta, respuesta_texto, espera, por_que) values ($1, $2, $3, coalesce($4, 'texto'), coalesce($5, 'propuesta'), $6::text::jsonb, $7, coalesce($8::text::jsonb, '[]'::jsonb), $9)",
        [EMP_B, clave, texto, extra.unidad ?? null, extra.estado ?? null, extra.respuesta ?? null, extra.respuesta_texto ?? null, extra.espera ?? null, extra.por_que ?? null]
      );
    const TEXTO = "¿Cuántos clientes distintos te compraron el mes pasado?";
    expect(await preguntar("Clientes_activos_mes", TEXTO)).toBe("23514");
    expect(await preguntar("ab", TEXTO)).toBe("23514");
    expect(await preguntar("clientes activos", TEXTO)).toBe("23514");
    expect(await preguntar("clientes_activos_mes", "¿Cuánto?")).toBeNull(); // ocho letras justas
    expect(await preguntar("ticket_promedio", "   Precio?   ")).toBe("23514"); // siete sin los espacios
    expect(await preguntar("capacidad_extra_mes", "x".repeat(201))).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { unidad: "pct" })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { estado: "borrador" })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { estado: "respondida" })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { respuesta: "[1, 2]" })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { espera: '{"version": 1}' })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { por_que: "x".repeat(301) })).toBe("23514");
    expect(await preguntar("merma_mes", TEXTO, { estado: "respondida", respuesta_texto: "No lo sé" })).toBeNull();
    expect(await preguntar("otra.1a2b3c4d", "¿Quién decide los descuentos cuando tú no estás?", { espera: '[{"version": 2, "camino": "a", "jugada": "A.J1"}]' })).toBeNull();
    // Una sola abierta (propuesta o enviada) por clave y empresa; cerradas, las que hagan falta; otra empresa, aparte.
    expect(await preguntar("interesados_mes", TEXTO)).toBe("23505");
    expect(await preguntar("interesados_mes", TEXTO, { estado: "enviada" })).toBe("23505");
    expect(await preguntar("interesados_mes", TEXTO, { estado: "retirada" })).toBeNull();
    expect(await preguntar("interesados_mes", TEXTO, { estado: "respondida", respuesta: '{"valor": null, "estado": "no_lo_se"}' })).toBeNull();
    expect(await h.codigo("insert into estrategia_preguntas (company_id, clave, texto) values ($1, 'clientes_activos_mes', $2)", [EMP_A, TEXTO])).toBeNull();
  });

  it("RLS · el dueño no lee ninguna de las tres: su camino y sus preguntas se los da la aplicación, sin lo que es de la consultora", async () => {
    for (const sub of [U_A, U_B]) {
      for (const t of TABLAS) expect(await h.cuenta("authenticated", sub, t), `${sub} ${t}`).toBe(0);
    }
    // Ni las enviadas: desde el navegador vería por qué se le pregunta, qué espera y quién la envió.
    expect(await consultarComo(h.db(), "authenticated", U_B, "select por_que, espera, enviada_por from estrategia_preguntas where estado = 'enviada'")).toEqual([]);
  });

  it("RLS · el dueño no escribe en ninguna de las tres: ni insertar, ni cambiar, ni borrar (tampoco su propia respuesta)", async () => {
    expect(
      await h.codigoComo("authenticated", U_B, "insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 90, '{}'::jsonb, $2, '{}'::jsonb)", [EMP_B, HUELLA])
    ).toBe("42501");
    expect(await h.codigoComo("authenticated", U_B, "insert into estrategia_ediciones (estrategia_id, company_id, puntero, tipo) values ($1, $2, '/vigente/lectura/0', 'texto')", [semilla.b.v1, EMP_B])).toBe("42501");
    expect(await h.codigoComo("authenticated", U_B, "insert into estrategia_preguntas (company_id, clave, texto, estado) values ($1, 'ticket_promedio', 'Cuando un cliente te compra, ¿cuánto gasta?', 'enviada')", [EMP_B])).toBe("42501");
    // El rol del navegador no tiene permiso de escritura sobre las tres: ni cambiar ni borrar.
    for (const t of TABLAS) {
      expect(await h.codigoComo("authenticated", U_B, `update ${t} set company_id = company_id where company_id = $1`, [EMP_B]), `update ${t}`).toBe("42501");
      expect(await h.codigoComo("authenticated", U_B, `delete from ${t} where company_id = $1`, [EMP_B]), `delete ${t}`).toBe("42501");
    }
    // Responder es de la ruta de la aplicación (con su solicitud abierta), no de la base directa.
    expect(await h.codigoComo("authenticated", U_B, "update estrategia_preguntas set estado = 'respondida', respuesta_texto = 'treinta' where estado = 'enviada'")).toBe("42501");
    expect((await h.db().query<{ n: number }>("select count(*)::int as n from estrategia_preguntas where company_id = $1 and estado = 'enviada'", [EMP_B])).rows[0]!.n).toBe(1);
  });

  it("RLS · la consultora lee todo, pero desde el navegador no escribe nada: ni aprobar, ni la página del dueño, ni las preguntas, ni el rastro", async () => {
    for (const t of TABLAS) expect(await h.cuenta("authenticated", U_C, t), t).toBe(await h.filas(t));
    const antes = (await h.db().query("select estado, para_dueno, motivo_eleccion from estrategias where id = $1", [semilla.b.v2])).rows[0];
    // Aprobar sin la autoridad de aprobar planes, o escribir la página del dueño sin pasar por el validador: no.
    expect(await h.codigoComo("authenticated", U_C, "update estrategias set estado = 'aprobada', camino_elegido = 'a', para_dueno = '{}'::jsonb, aprobada_at = now() where id = $1", [semilla.b.v2])).toBe("42501");
    expect(await h.codigoComo("authenticated", U_C, "update estrategias set motivo_eleccion = 'mejor caja en 90 días' where id = $1", [semilla.b.v2])).toBe("42501");
    expect((await h.db().query("select estado, para_dueno, motivo_eleccion from estrategias where id = $1", [semilla.b.v2])).rows[0]).toEqual(antes);
    // El estado de las preguntas lo cambia la ruta de enviar, con su solicitud abierta.
    expect(await h.codigoComo("authenticated", U_C, "update estrategia_preguntas set estado = 'enviada', enviada_por = $2, enviada_at = now() where company_id = $1 and clave = 'interesados_mes' and estado = 'propuesta'", [EMP_B, U_C])).toBe("42501");
    // El rastro tampoco: firmado con otro autor, o de una versión que no existe.
    expect(await h.codigoComo("authenticated", U_C, "insert into estrategia_ediciones (estrategia_id, company_id, puntero, tipo, autor) values ($1, $2, '/vigente/gran_apuesta/frase', 'texto', $3)", [semilla.b.v2, EMP_B, U_D])).toBe("42501");
    expect(await h.codigoComo("authenticated", U_C, "insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 91, '{}'::jsonb, $2, '{}'::jsonb)", [EMP_B, HUELLA])).toBe("42501");
    for (const t of TABLAS) expect(await h.codigoComo("authenticated", U_C, `delete from ${t} where company_id = $1`, [EMP_B]), `delete ${t}`).toBe("42501");
    for (const t of TABLAS) expect(await h.cuenta("anon", null, t), t).toBe(0);
    expect(await h.codigoComo("anon", null, "insert into estrategia_preguntas (company_id, clave, texto) values ($1, 'ticket_promedio', 'Cuando un cliente te compra, ¿cuánto gasta?')", [EMP_B])).toBe("42501");
  });

  it("las dos funciones solo las ejecuta el servidor: ni el dueño, ni la consultora desde el navegador, ni un anónimo", async () => {
    const llamadas = [
      ["select estrategia_lente_lista($1, 'dinero', '{}'::jsonb)", [semilla.b.v2]],
      ["select aprobar_estrategia($1, $2, '{}'::jsonb, null)", [semilla.b.v2, U_C]],
    ] as const;
    for (const [sql, params] of llamadas) {
      for (const [rol, sub] of [["authenticated", U_B], ["authenticated", U_C], ["anon", null]] as const) {
        expect(await h.codigoComo(rol, sub, sql, [...params]), `${rol} ${sub ?? ""} ${sql}`).toBe("42501");
      }
    }
    expect(await h.codigoComo("service_role", null, "select estrategia_lente_lista(gen_random_uuid(), 'dinero', '{}'::jsonb)")).toBeNull();
  });

  it("estrategia_lente_lista: true solo cuando están las dos; un reintento vuelve a decir true; nada en una versión que no está en curso", async () => {
    const lente = async (id: string, cual: string | null, salida: object) =>
      (await h.db().query<{ lista: boolean }>("select estrategia_lente_lista($1, $2, $3::text::jsonb) as lista", [id, cual, JSON.stringify(salida)])).rows[0]!.lista;
    const columnas = async (id: string) =>
      (await h.db().query<{ lente_dinero: unknown; lente_terreno: unknown }>("select lente_dinero, lente_terreno from estrategias where id = $1", [id])).rows[0]!;
    const id = semilla.b.v2;
    expect(await lente(id, "dinero", { lectura: "primera" })).toBe(false);
    expect(await columnas(id)).toEqual({ lente_dinero: { lectura: "primera" }, lente_terreno: null });
    expect(await lente(id, "terreno", { lectura: "operación" })).toBe(true);
    // Un reintento de la primera vuelve a recibir true (el equipo rojo es uno solo por su clave idempotente, no por esta función).
    expect(await lente(id, "dinero", { lectura: "reintento" })).toBe(true);
    expect(await columnas(id)).toEqual({ lente_dinero: { lectura: "reintento" }, lente_terreno: { lectura: "operación" } });
    expect(await h.mensaje("select estrategia_lente_lista($1, 'rojo', '{}'::jsonb)", [id])).toMatch(/Lente desconocida: rojo/);
    expect(await h.mensaje("select estrategia_lente_lista($1, null, '{}'::jsonb)", [id])).toMatch(/Lente desconocida/);
    // Una versión descartada no se toca, y una que no existe tampoco.
    const descartada = await h.estrategia(EMP_B, 70, { estado: "descartada" });
    expect(await lente(descartada, "dinero", { lectura: "tarde" })).toBe(false);
    expect(await columnas(descartada)).toEqual({ lente_dinero: null, lente_terreno: null });
    expect(await lente("00000000-0000-4000-8000-00000000dead", "terreno", {})).toBe(false);
  });

  it("aprobar_estrategia: solo una lista, con camino y página del dueño; la anterior pasa a reemplazada y queda una sola aprobada", async () => {
    const aprobar = (id: string, para: object | null, motivo: string | null = null) =>
      h.mensaje("select aprobar_estrategia($1, $2, $3::text::jsonb, $4)", [id, U_C, para === null ? null : JSON.stringify(para), motivo]);
    const id = semilla.b.v2;
    expect(await aprobar(id, PAGINA_DEL_DUENO)).toMatch(/Solo se aprueba una estrategia lista \(esta está en «en_curso»\)/);
    await h.db().query("update estrategias set estado = 'con_observaciones' where id = $1", [id]);
    expect(await aprobar(id, PAGINA_DEL_DUENO)).toMatch(/«con_observaciones»/);
    await h.db().query("update estrategias set estado = 'lista', motivo_eleccion = 'el que más deja a 90 días' where id = $1", [id]);
    expect(await aprobar(id, PAGINA_DEL_DUENO)).toMatch(/Falta elegir el camino/);
    await h.db().query("update estrategias set camino_elegido = 'b' where id = $1", [id]);
    expect(await aprobar(id, null)).toMatch(/Falta la página del dueño/);
    expect(await aprobar("00000000-0000-4000-8000-00000000dead", PAGINA_DEL_DUENO)).toMatch(/La estrategia no existe/);
    expect(await aprobar(id, PAGINA_DEL_DUENO)).toBeNull();
    const { rows } = await h.db().query<{ id: string; estado: string; para_dueno: unknown; aprobada_por: string | null; aprobada_at: string | null; motivo_eleccion: string | null }>(
      "select id, estado, para_dueno, aprobada_por, aprobada_at, motivo_eleccion from estrategias where company_id = $1 and estado in ('aprobada','reemplazada') order by version",
      [EMP_B]
    );
    expect(rows.map((r) => [r.id, r.estado])).toEqual([[semilla.b.v1, "reemplazada"], [id, "aprobada"]]);
    const nueva = rows[1]!;
    expect(nueva.para_dueno).toEqual(PAGINA_DEL_DUENO);
    expect(nueva.aprobada_por).toBe(U_C);
    expect(nueva.aprobada_at).not.toBeNull();
    // Sin motivo nuevo, se queda el que escribió la consultora al elegir.
    expect(nueva.motivo_eleccion).toBe("el que más deja a 90 días");
    // Ya aprobada, no se vuelve a aprobar (es la que ve el dueño).
    expect(await aprobar(id, PAGINA_DEL_DUENO)).toMatch(/«aprobada»/);
  });

  it("aprobar_estrategia con bloqueo optimista: si la fila cambió después de leerla, no aprueba; si sigue igual, sí", async () => {
    const id = await h.estrategia(EMP_A, 80, { estado: "lista", camino_elegido: "a" });
    const leida = (await h.db().query<{ updated_at: string }>("select updated_at::text as updated_at from estrategias where id = $1", [id])).rows[0]!.updated_at;
    // Otra pestaña guarda una corrección entre medio.
    await h.db().query("update estrategias set vigente = '{\"lectura\": [\"corregida\"]}'::jsonb, updated_at = now() + interval '1 second' where id = $1", [id]);
    const aprobarCon = (marca: string) => h.mensaje("select aprobar_estrategia($1, $2, $3::text::jsonb, null, $4::timestamptz)", [id, U_C, JSON.stringify(PAGINA_DEL_DUENO), marca]);
    expect(await aprobarCon(leida)).toMatch(/cambió mientras tanto/);
    expect((await h.db().query<{ estado: string }>("select estado from estrategias where id = $1", [id])).rows[0]!.estado).toBe("lista");
    const fresca = (await h.db().query<{ updated_at: string }>("select updated_at::text as updated_at from estrategias where id = $1", [id])).rows[0]!.updated_at;
    expect(await aprobarCon(fresca)).toBeNull();
    expect((await h.db().query<{ estado: string }>("select estado from estrategias where id = $1", [id])).rows[0]!.estado).toBe("aprobada");
  });

  it("los checks ampliados admiten preguntas_estrategia y plan_estrategico, siguen admitiendo lo de antes y nada inventado", async () => {
    expect(await h.codigo("insert into solicitudes_cliente (company_id, seccion, nota) values ($1, 'preguntas_estrategia', 'Unas preguntas para afinar tu plan')", [EMP_A])).toBeNull();
    expect(await h.codigo("insert into solicitudes_cliente (company_id, seccion) values ($1, 'subir_procesos')", [EMP_A])).toBeNull();
    expect(await h.codigo("insert into solicitudes_cliente (company_id, seccion) values ($1, 'estrategia')", [EMP_A])).toBe("23514");
    expect(await h.codigo("insert into deliverables (company_id, tipo, contenido, version) values ($1, 'plan_estrategico', '{\"formato\": \"estrategia_dueno_v1\"}'::jsonb, 1)", [EMP_A])).toBeNull();
    expect(await h.codigo("insert into deliverables (company_id, tipo, version) values ($1, 'plan_90', 1)", [EMP_A])).toBeNull();
    expect(await h.codigo("insert into deliverables (company_id, tipo, version) values ($1, 'plan_inventado', 1)", [EMP_A])).toBe("23514");
  });

  it("borrar la empresa vacía las tres tablas en cascada (y no toca las de la otra)", async () => {
    await h.db().query("delete from companies where id = $1", [EMP_A]);
    for (const t of TABLAS) {
      const r = await h.db().query<{ a: number; b: number }>(`select count(*) filter (where company_id = $1)::int as a, count(*) filter (where company_id = $2)::int as b from ${t}`, [EMP_A, EMP_B]);
      expect(r.rows[0]!.a, t).toBe(0);
      expect(r.rows[0]!.b, t).toBeGreaterThan(0);
    }
  });
});

describe("Postgres embebido (PGlite), no Supabase: migracion-estrategia.sql sin lo que da por hecho", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    // Todo el esquema menos la del 16-10 que crea solicitudes_cliente (y esta misma).
    pg = await crearBase();
    await aplicarTodo(pg, { orden: leerOrden().filter((e) => e.archivo !== "migracion-entrar-hoy.sql" && e.archivo !== "migracion-estrategia.sql") });
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se detiene en la primera sentencia, dice qué aplicar primero y no deja nada creado", async () => {
    await expect(aplicarArchivo(pg!, MIGRACION)).rejects.toThrow(/sentencia 1 .*Falta aplicar migracion-entrar-hoy\.sql/);
    for (const t of TABLAS) expect((await pg!.query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${t}`])).rows[0]!.t, t).toBeNull();
  });
});

describe("Postgres embebido (PGlite), no Supabase: deshacer sin perder nada (supabase/revertir/migracion-estrategia.sql)", () => {
  const b = {} as Base;
  const h = ayudas(b);
  let antes: number[];
  const revertir = () => h.db().exec(readFileSync(REVERSION, "utf8"));

  beforeAll(async () => {
    b.pg = (await baseConEsquema()).pg;
    await personasYEmpresas(b.pg);
    await h.sembrar(EMP_A);
    await h.sembrar(EMP_B);
    await b.pg.query("insert into solicitudes_cliente (company_id, seccion) values ($1, 'preguntas_estrategia')", [EMP_A]);
    await b.pg.query("insert into deliverables (company_id, tipo, contenido, version) values ($1, 'plan_estrategico', '{}'::jsonb, 1)", [EMP_A]);
    antes = await Promise.all(TABLAS.map((t) => h.filas(t)));
  }, 240_000);

  afterAll(async () => {
    await b.pg?.close();
  });

  it("no está en el orden de aplicación ni en la carpeta que se aplica: es la salida de emergencia, aparte", () => {
    expect(leerOrden().map((e) => e.archivo)).not.toContain("revertir/migracion-estrategia.sql");
    const texto = readFileSync(REVERSION, "utf8").replace(/--.*$/gm, "");
    expect(texto).not.toMatch(/\bdrop\s+table\b/i);
    expect(texto).not.toMatch(/\bdelete\s+from\b/i);
    expect(texto).not.toMatch(/\btruncate\b/i);
    expect(texto).not.toMatch(/drop\s+constraint/i); // los checks ampliados se quedan
  });

  it("apaga: las tablas cambian de nombre con todas sus filas, las funciones se van y lo dice", async () => {
    const resultados = await revertir();
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACION ESTRATEGIA RETIRADA");
    expect(Number(ultima.tablas_vivas_deben_ser_0)).toBe(0);
    expect(Number(ultima.funciones_deben_ser_0)).toBe(0);
    expect(ultima.tablas_retiradas).toBe("estrategia_ediciones_retirada, estrategia_preguntas_retirada, estrategias_retirada");
    for (const t of TABLAS) expect(await h.existe(t), t).toBe(false);
    expect(await Promise.all(TABLAS.map((t) => h.filas(`${t}_retirada`)))).toEqual(antes);
    expect(await h.funciones()).toEqual([]);
    // Cada índice se llevó su nombre: ninguno de los nombres de la migración queda ocupado.
    for (const t of TABLAS) expect(await h.indicesDe(`${t}_retirada`), t).toEqual(INDICES[t].map((i) => `${i}_retirada`).sort());
  });

  it("lo retirado sigue cerrado: con RLS, sin lectura del dueño, y el rastro de ediciones sigue sin poder cambiarse", async () => {
    const { rows } = await h.db().query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in (${TABLAS.map((t) => `'${t}_retirada'`).join(",")})`
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    expect(await h.cuenta("authenticated", U_A, "estrategia_preguntas_retirada")).toBe(0);
    expect(await h.cuenta("authenticated", U_C, "estrategia_preguntas_retirada")).toBe(antes[2]);
    expect(await h.mensaje("update estrategia_ediciones_retirada set despues = '\"otra\"'::jsonb")).toMatch(/El rastro de ediciones no se cambia/);
  });

  it("los checks ampliados se quedan: el código de antes no los nota y lo ya guardado sigue valiendo", async () => {
    expect(await h.codigo("insert into solicitudes_cliente (company_id, seccion) values ($1, 'productos')", [EMP_B])).toBeNull();
    expect(await h.codigo("insert into deliverables (company_id, tipo, version) values ($1, 'plan_estrategico', 2)", [EMP_A])).toBeNull();
    expect((await h.db().query<{ n: number }>("select count(*)::int as n from solicitudes_cliente where seccion = 'preguntas_estrategia'")).rows[0]!.n).toBe(1);
  });

  it("ejecutarla otra vez no encuentra nada que renombrar y no cambia nada", async () => {
    await revertir();
    expect(await Promise.all(TABLAS.map((t) => h.filas(`${t}_retirada`)))).toEqual(antes);
    for (const t of TABLAS) expect(await h.existe(t), t).toBe(false);
  });

  it("después, la migración vuelve a aplicar: tablas nuevas vacías CON sus índices únicos, que de verdad impiden duplicar", async () => {
    await aplicarArchivo(h.db(), MIGRACION);
    for (const t of TABLAS) {
      expect(await h.existe(t), t).toBe(true);
      expect(await h.filas(t), t).toBe(0);
      expect(await h.indicesDe(t), t).toEqual([...INDICES[t]].sort());
    }
    expect(await h.funciones()).toEqual([...FUNCIONES].sort());
    await h.estrategia(EMP_A, 1);
    expect(await h.codigo("insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 2, '{}'::jsonb, $2, '{}'::jsonb)", [EMP_A, HUELLA])).toBe("23505");
    await h.aprobada(EMP_A, 3);
    expect(await h.aprobada(EMP_A, 4).then(() => null, (e) => (e as { code?: string }).code)).toBe("23505");
    await h.db().query("insert into estrategia_preguntas (company_id, clave, texto) values ($1, 'ticket_promedio', 'Cuando un cliente te compra, ¿cuánto gasta normalmente?')", [EMP_A]);
    expect(await h.codigo("insert into estrategia_preguntas (company_id, clave, texto, estado) values ($1, 'ticket_promedio', 'Cuando un cliente te compra, ¿cuánto gasta normalmente?', 'enviada')", [EMP_A])).toBe("23505");
    // Las tablas nuevas vuelven con sus políticas de solo lectura para la consultora (y ninguna del dueño), y las
    // retiradas siguen intactas.
    expect(await h.db().query("select 1 from pg_policies where tablename = 'estrategia_preguntas' and policyname = 'estrategia_preguntas_consultor' and cmd = 'SELECT'").then((r) => r.rows.length)).toBe(1);
    expect(await h.db().query("select 1 from pg_policies where tablename = 'estrategia_preguntas' and policyname = 'estrategia_preguntas_cliente'").then((r) => r.rows.length)).toBe(0);
    expect(await Promise.all(TABLAS.map((t) => h.filas(`${t}_retirada`)))).toEqual(antes);
  });

  it("con retiradas de antes y tablas vivas otra vez, no pisa nada: se detiene, dice qué hacer y todo queda como estaba", async () => {
    await expect(revertir()).rejects.toThrow(/Ya existe estrategias_retirada de una reversión anterior/);
    await h.db().exec("rollback");
    for (const t of TABLAS) expect(await h.existe(t), t).toBe(true);
    expect(await h.funciones()).toEqual([...FUNCIONES].sort());
    expect(await Promise.all(TABLAS.map((t) => h.filas(`${t}_retirada`)))).toEqual(antes);
    expect(await h.filas("estrategias")).toBe(2);
  });
});

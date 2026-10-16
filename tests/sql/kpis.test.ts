/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LA HISTORIA DE VALORES DE UN INDICADOR TIENE CANDADOS.
 *
 * migracion-plan-kpi-linea-base.sql amplía `indicadores` con los doce atributos y crea `indicador_valores`.
 * Aquí se comprueba sobre una base vacía lo que la base promete por sí sola: un indicador no tiene dos
 * valores para el mismo periodo; un valor null no es una fila (la falta de dato no es cero ni hueco);
 * las unidades, frecuencias, tipos, validaciones y sentidos de umbral inventados no entran; y cada dueño
 * lee los valores de SU empresa y de ninguna otra, mientras que escribirlos es cosa del servidor.
 *
 * REMATE K (13-10-2026), al final: el código REAL que usan las dos rutas de registro (`guardarValor`,
 * `zonaDeEmpresa`, `dejarMotivoDeArchivo`, de src/app/api/companies/[id]/kpis/_registro.ts) escribe aquí, en el
 * esquema real, a través de un adaptador mínimo que traduce las cuatro llamadas que hacen a SQL. Con eso se
 * comprueba que las columnas que nombran existen, que los candados de la base las aceptan, que un «sin dato»
 * no deja fila en ninguna tabla y que la zona horaria sale de `companies.zona_horaria`. También que todo valor
 * mensual queda reflejado en `company_metricas` (entre por la ruta que entre), que lo que no es mensual no, y
 * que un número verificado de la empresa no lo pisa un valor registrado en un indicador.
 *
 * Qué no prueba: PostgREST, Auth ni que producción tenga la migración aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseConEsquema, consultarComo } from "./aplicar";
import { desdeFila } from "@/lib/kpis";
import { guardarValor, zonaDeEmpresa, dejarMotivoDeArchivo } from "@/app/api/companies/[id]/kpis/_registro";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const P_A = "000000a1-0000-4000-8000-0000000000a1"; // Rosa, encargada de tienda en A
const I_A = "0000001a-0000-4000-8000-00000000001a"; // devoluciones_mes (A, mensual)
const I_B = "0000001b-0000-4000-8000-00000000001b"; // descuadres_caja (B, quincenal)

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    await pg.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb), ($5, 'consultora@prueba.local', $6::jsonb)",
      [U_A, JSON.stringify({ nombre: "Dueña A" }), U_B, JSON.stringify({ nombre: "Dueño B" }), U_C, JSON.stringify({ nombre: "Consultora" })]
    );
    await pg.query("update users set rol = 'consultor' where id = $1", [U_C]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Estudio jurídico (sintético)')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
    await pg.query("insert into participants (id, company_id, nombre, puesto, rol) values ($1, $2, 'Rosa Quispe', 'Encargada de tienda', 'lider')", [P_A, EMP_A]);
    await pg.query(
      `insert into indicadores (id, company_id, clave, nombre, como_se_mide, unidad, mejor_si, frecuencia, estado, definicion, formula, fuente, responsable_participant_id, tipo_indicador, moneda)
       values ($1, $2, 'devoluciones_mes', 'Devoluciones al mes', 'Contar las prendas devueltas en el cuaderno de caja', 'unidades', 'baja', 'mensual', 'activo',
               'Cuántas prendas vuelven cada mes', 'Suma de devoluciones del cuaderno de caja', 'Cuaderno de caja', $3, 'resultado', null)`,
      [I_A, EMP_A, P_A]
    );
    await pg.query(
      `insert into indicadores (id, company_id, clave, nombre, como_se_mide, unidad, mejor_si, frecuencia, estado, tipo_indicador)
       values ($1, $2, 'descuadres_caja', 'Descuadres de caja', 'Contar los días con descuadre', 'numero', 'baja', 'quincenal', 'activo', 'ejecucion')`,
      [I_B, EMP_B]
    );
    await pg.query(
      `insert into indicador_valores (indicador_id, periodo, valor, fuente, estado_validacion) values
         ($1, '2026-08', 3, 'Cuaderno de caja', 'declarado'), ($1, '2026-09', 1, 'Cuaderno de caja', 'conciliado'), ($2, '2026-09-Q1', 2, null, 'declarado')`,
      [I_A, I_B]
    );
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

/** Ejecuta esperando un rechazo; devuelve el mensaje de Postgres para afirmarlo. */
async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("Postgres embebido (PGlite), no Supabase: un indicador, un valor por periodo", () => {
  it("el segundo valor para el mismo periodo del mismo indicador no entra: es una corrección, no una fila nueva", async () => {
    const m = await rechaza("insert into indicador_valores (indicador_id, periodo, valor) values ($1, '2026-09', 5)", [I_A]);
    expect(m).toMatch(/duplicate key|unique/i);
    // Otro indicador sí puede tener ese periodo: la unicidad es por indicador.
    await base().query("insert into indicador_valores (indicador_id, periodo, valor) values ($1, '2026-09', 4)", [I_B]);
  });

  it("un valor null no es una fila: la falta de dato se anota en el indicador (sin_dato), no en la historia", async () => {
    expect(await rechaza("insert into indicador_valores (indicador_id, periodo, valor) values ($1, '2026-10', null)", [I_A])).toMatch(/null/i);
    await base().query("update indicadores set estado_validacion = 'sin_dato' where id = $1", [I_A]);
    const r = await base().query<{ estado_validacion: string; n: number }>(
      "select i.estado_validacion, (select count(*)::int from indicador_valores v where v.indicador_id = i.id) as n from indicadores i where i.id = $1",
      [I_A]
    );
    expect(r.rows[0]).toEqual({ estado_validacion: "sin_dato", n: 2 });
  });

  it("la historia no acepta «sin_dato» como validación de un valor: un valor existe o no existe", async () => {
    expect(await rechaza("insert into indicador_valores (indicador_id, periodo, valor, estado_validacion) values ($1, '2026-07', 2, 'sin_dato')", [I_A])).toMatch(/check/i);
  });
});

describe("Postgres embebido (PGlite), no Supabase: los checks rechazan lo inventado", () => {
  it("unidad: entran las nuevas (horas, unidades, moneda, soles_por_hora) y no una inventada", async () => {
    for (const u of ["horas", "unidades", "moneda", "soles_por_hora", "porcentaje"]) {
      await base().query("insert into indicadores (company_id, clave, nombre, como_se_mide, unidad) values ($1, $2, 'x', 'y', $3)", [EMP_A, `u_${u}`, u]);
    }
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, unidad) values ($1, 'u_mala', 'x', 'y', 'bananas')", [EMP_A])).toMatch(/check/i);
  });

  it("frecuencia: quincenal y trimestral entran; «anual» no", async () => {
    await base().query("insert into indicadores (company_id, clave, nombre, como_se_mide, frecuencia) values ($1, 'f_q', 'x', 'y', 'quincenal'), ($1, 'f_t', 'x', 'y', 'trimestral')", [EMP_A]);
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, frecuencia) values ($1, 'f_a', 'x', 'y', 'anual')", [EMP_A])).toMatch(/check/i);
  });

  it("tipo_indicador solo admite ejecucion o resultado; umbral_sentido solo por_debajo o por_encima", async () => {
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, tipo_indicador) values ($1, 't_m', 'x', 'y', 'mixto')", [EMP_A])).toMatch(/check/i);
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, umbral_sentido) values ($1, 's_a', 'x', 'y', 'arriba')", [EMP_A])).toMatch(/check/i);
  });

  it("estado_validacion: en el indicador admite sin_dato y rechaza «quizas»; en la historia rechaza las dos", async () => {
    await base().query("insert into indicadores (company_id, clave, nombre, como_se_mide, estado_validacion) values ($1, 'v_sd', 'x', 'y', 'sin_dato')", [EMP_A]);
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, estado_validacion) values ($1, 'v_q', 'x', 'y', 'quizas')", [EMP_A])).toMatch(/check/i);
    expect(await rechaza("insert into indicador_valores (indicador_id, periodo, valor, estado_validacion) values ($1, '2026-06', 2, 'quizas')", [I_A])).toMatch(/check/i);
  });

  it("el responsable es una persona de participants: un id que no existe no entra", async () => {
    expect(await rechaza("insert into indicadores (company_id, clave, nombre, como_se_mide, responsable_participant_id) values ($1, 'r_x', 'x', 'y', '00000000-0000-4000-8000-00000000dead')", [EMP_A])).toMatch(/foreign key/i);
  });

  it("los doce atributos se guardan y se leen tal cual", async () => {
    const r = await base().query<Record<string, unknown>>(
      "select definicion, formula, unidad, moneda, fuente, responsable_participant_id, frecuencia, tipo_indicador, linea_base_valor, meta_plazo, valor_actual, estado_validacion, umbral_alerta, umbral_sentido, accion_asociada_id, decision_asociada from indicadores where id = $1",
      [I_A]
    );
    expect(r.rows[0]).toMatchObject({ definicion: "Cuántas prendas vuelven cada mes", fuente: "Cuaderno de caja", responsable_participant_id: P_A, frecuencia: "mensual", tipo_indicador: "resultado", estado_validacion: "sin_dato", valor_actual: null, linea_base_valor: null });
  });
});

describe("Postgres embebido (PGlite), no Supabase: cada dueño lee los valores de su empresa y de ninguna otra", () => {
  const periodosQueVe = async (sub: string | null, rol: "authenticated" | "anon" | "service_role" = "authenticated") =>
    (await consultarComo<{ periodo: string }>(base(), rol, sub, "select periodo from indicador_valores order by periodo")).map((f) => f.periodo);

  it("la dueña de A ve los valores de A (incluido el nuevo de setiembre) y ninguno de B", async () => {
    expect(await periodosQueVe(U_A)).toEqual(["2026-08", "2026-09"]);
  });

  it("el dueño de B ve solo los de B", async () => {
    expect(await periodosQueVe(U_B)).toEqual(["2026-09", "2026-09-Q1"]);
  });

  it("la consultora y la service role ven todo; un anónimo, nada", async () => {
    expect(await periodosQueVe(U_C)).toHaveLength(4);
    expect(await periodosQueVe(null, "service_role")).toHaveLength(4);
    expect(await periodosQueVe(null, "anon")).toEqual([]);
  });

  it("la dueña lee indicadores de A y no de B, y tampoco los de B por su valor", async () => {
    const claves = (await consultarComo<{ clave: string }>(base(), "authenticated", U_A, "select clave from indicadores where id in ($1, $2) order by clave", [I_A, I_B])).map((f) => f.clave);
    expect(claves).toEqual(["devoluciones_mes"]);
  });

  it("la dueña NO escribe en la historia: el valor lo registra la ruta con service role, que deja rastro", async () => {
    let mensaje = "";
    try {
      await consultarComo(base(), "authenticated", U_A, "insert into indicador_valores (indicador_id, periodo, valor) values ($1, '2026-07', 9)", [I_A]);
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
    expect(mensaje).toMatch(/row-level security|permission denied/i);
    const n = await base().query<{ n: number }>("select count(*)::int as n from indicador_valores where indicador_id = $1", [I_A]);
    expect(n.rows[0].n).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REMATE K · el camino real de registro, sobre el esquema real. Va al final a propósito: añade filas
// (un indicador y sus valores) que las pruebas de arriba no deben ver.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type Res = { data: Record<string, unknown>[] | null; error: { message: string } | null };

/**
 * Un PostgREST mínimo sobre PGlite, con el rol que crea la base (como la service role de las rutas): solo lo
 * que `_registro.ts` llama. select+eq+maybeSingle, update+eq e insert. Un objeto se manda como JSON (jsonb).
 */
function sobrePg(db: PGlite): SupabaseClient {
  const aParametro = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);
  const from = (tabla: string) => {
    let modo: "select" | "update" | "insert" = "select";
    let columnas = "*";
    let cuerpo: Record<string, unknown> = {};
    const filtros: [string, unknown][] = [];
    const ejecutar = async (): Promise<Res> => {
      try {
        const cols = Object.keys(cuerpo);
        if (modo === "insert") {
          await db.query(`insert into ${tabla} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => aParametro(cuerpo[c])));
          return { data: null, error: null };
        }
        if (modo === "update") {
          const donde = filtros.map(([k], i) => `${k} = $${cols.length + i + 1}`).join(" and ");
          await db.query(`update ${tabla} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} where ${donde}`, [...cols.map((c) => aParametro(cuerpo[c])), ...filtros.map(([, v]) => v)]);
          return { data: null, error: null };
        }
        const donde = filtros.map(([k], i) => `${k} = $${i + 1}`).join(" and ");
        const r = await db.query<Record<string, unknown>>(`select ${columnas} from ${tabla}${donde ? ` where ${donde}` : ""}`, filtros.map(([, v]) => v));
        return { data: r.rows, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    };
    const q = {
      select: (cols = "*") => { if (modo === "select") columnas = cols; return q; },
      eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
      update: (datos: Record<string, unknown>) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: Record<string, unknown>) => { modo = "insert"; cuerpo = datos; return q; },
      maybeSingle: async () => { const r = await ejecutar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res: (v: Res) => unknown, rej?: (e: unknown) => unknown) => ejecutar().then(res, rej),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

describe("Postgres embebido (PGlite), no Supabase: el único camino de registro escribe en el esquema real", () => {
  const I_C = "0000001c-0000-4000-8000-00000000001c"; // quejas_mes (A, mensual, activo, sin valores)
  const I_D = "0000001d-0000-4000-8000-00000000001d"; // reclamos_mes (A, mensual, activo, sin valores)
  const HOY = new Date("2026-10-13T12:00:00Z");
  const LIMA_21_30 = new Date("2026-10-01T02:30:00Z"); // 30 de setiembre, 21:30 en Lima
  const duena = { id: U_A, rol: "cliente" };
  const dueno = { id: U_B, rol: "cliente" };
  const consultora = { id: U_C, rol: "consultor" };

  const sb = () => sobrePg(base());
  const kpi = async (id: string) => desdeFila((await base().query<Record<string, unknown>>("select * from indicadores where id = $1", [id])).rows[0]!);
  const valoresDe = async (id: string) =>
    (await base().query<{ periodo: string; valor: string; estado_validacion: string; registrado_por: string | null; fuente: string | null }>(
      "select periodo, valor::text as valor, estado_validacion, registrado_por, fuente from indicador_valores where indicador_id = $1 order by periodo", [id]
    )).rows;
  const numerosDe = async (clave: string) =>
    (await base().query<{ periodo: string; valor: string; estado: string }>("select periodo, valor::text as valor, estado from company_metricas where company_id = $1 and clave = $2 order by periodo", [EMP_A, clave])).rows;
  const actualDe = async (id: string) =>
    (await base().query<{ valor_actual: string | null; valor_actual_periodo: string | null; estado_validacion: string | null }>(
      "select valor_actual::text as valor_actual, valor_actual_periodo, estado_validacion from indicadores where id = $1", [id]
    )).rows[0]!;

  beforeAll(async () => {
    await base().query(
      `insert into indicadores (id, company_id, clave, nombre, como_se_mide, unidad, mejor_si, frecuencia, estado, fuente, tipo_indicador) values
         ($1, $3, 'quejas_mes', 'Quejas al mes', 'Contar las quejas del cuaderno', 'numero', 'baja', 'mensual', 'activo', 'Cuaderno de quejas', 'resultado'),
         ($2, $3, 'reclamos_mes', 'Reclamos al mes', 'Contar los reclamos del libro', 'numero', 'baja', 'mensual', 'activo', 'Libro de reclamaciones', 'resultado')`,
      [I_C, I_D, EMP_A]
    );
  });

  it("companies.zona_horaria existe, nace en America/Lima, y de ahí la lee la ruta; una zona inventada cae a Lima", async () => {
    const r = await base().query<{ zona_horaria: string }>("select zona_horaria from companies where id = $1", [EMP_A]);
    expect(r.rows[0]!.zona_horaria).toBe("America/Lima");
    expect(await zonaDeEmpresa(sb(), EMP_A)).toBe("America/Lima");
    await base().query("update companies set zona_horaria = 'No/Existe' where id = $1", [EMP_B]);
    expect(await zonaDeEmpresa(sb(), EMP_B)).toBe("America/Lima");
    await base().query("update companies set zona_horaria = 'America/Bogota' where id = $1", [EMP_B]);
    expect(await zonaDeEmpresa(sb(), EMP_B)).toBe("America/Bogota");
    await base().query("update companies set zona_horaria = 'America/Lima' where id = $1", [EMP_B]);
    expect(await zonaDeEmpresa(sb(), "00000000-0000-4000-8000-00000000dead")).toBe("America/Lima");
  });

  it("la dueña anota 7: fila declarada en la historia, valor actual movido y reflejo en los números de la empresa", async () => {
    const r = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-09", valor: 7 }, duena, { hoy: HOY, zona: await zonaDeEmpresa(sb(), EMP_A) });
    expect(r).toMatchObject({ ok: true, sin_dato: false, valor: 7, estado_validacion: "declarado", corregido: false, espejo: "reflejado", aviso: null, pendiente: null });
    expect(await valoresDe(I_C)).toEqual([{ periodo: "2026-09", valor: "7", estado_validacion: "declarado", registrado_por: U_A, fuente: "Cuaderno de quejas" }]);
    expect(await actualDe(I_C)).toEqual({ valor_actual: "7", valor_actual_periodo: "2026-09", estado_validacion: "declarado" });
    expect(await numerosDe("quejas_mes")).toEqual([{ periodo: "2026-09", valor: "7", estado: "contado" }]);
  });

  it("corregir el mismo periodo no duplica: sigue habiendo una fila en la historia y una en los números", async () => {
    const r = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-09", valor: 9 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, corregido: true });
    expect(await valoresDe(I_C)).toEqual([{ periodo: "2026-09", valor: "9", estado_validacion: "declarado", registrado_por: U_A, fuente: "Cuaderno de quejas" }]);
    expect(await numerosDe("quejas_mes")).toEqual([{ periodo: "2026-09", valor: "9", estado: "contado" }]);
    expect((await actualDe(I_C)).valor_actual).toBe("9");
  });

  it("NEGATIVO · «sin dato» en agosto (anterior al valor actual): ni una fila nueva y el indicador intacto", async () => {
    const r = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-08", valor: null }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: true, es_periodo_anterior: true });
    expect(await valoresDe(I_C)).toHaveLength(1);
    expect(await numerosDe("quejas_mes")).toHaveLength(1);
    expect(await actualDe(I_C)).toEqual({ valor_actual: "9", valor_actual_periodo: "2026-09", estado_validacion: "declarado" });
  });

  it("«sin dato» en octubre (posterior): el indicador queda sin_dato, conserva su último valor y no nace ninguna fila", async () => {
    const enNoviembre = new Date("2026-11-13T12:00:00Z");
    const r = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-10", valor: null }, duena, { hoy: enNoviembre });
    expect(r).toMatchObject({ ok: true, sin_dato: true, es_periodo_anterior: false, texto: "sin dato en Octubre 2026" });
    expect(await valoresDe(I_C)).toHaveLength(1);
    expect(await numerosDe("quejas_mes")).toHaveLength(1);
    expect(await actualDe(I_C)).toEqual({ valor_actual: "9", valor_actual_periodo: "2026-09", estado_validacion: "sin_dato" });
  });

  it("la consultora concilia un periodo anterior: entra en la historia con su validación; la dueña no puede pedir «verificado»", async () => {
    const c = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-08", valor: 11, estado_validacion: "conciliado", fuente: "Cuaderno, hojas 4 a 9" }, consultora, { hoy: HOY });
    expect(c).toMatchObject({ ok: true, es_periodo_anterior: true, estado_validacion: "conciliado" });
    const d = await guardarValor(sb(), await kpi(I_C), { periodo: "2026-07", valor: 5, estado_validacion: "verificado" }, duena, { hoy: HOY });
    expect(d).toMatchObject({ ok: false, status: 403 });
    expect(await valoresDe(I_C)).toEqual([
      { periodo: "2026-08", valor: "11", estado_validacion: "conciliado", registrado_por: U_C, fuente: "Cuaderno, hojas 4 a 9" },
      { periodo: "2026-09", valor: "9", estado_validacion: "declarado", registrado_por: U_A, fuente: "Cuaderno de quejas" },
    ]);
    // Lo que concilió la consultora también queda en los números de la empresa (un solo escritor para las dos
    // rutas), pero como «contado»: registrar un valor en un indicador no asciende un número a verificado.
    expect(c).toMatchObject({ espejo: "reflejado" });
    expect(await numerosDe("quejas_mes")).toEqual([
      { periodo: "2026-08", valor: "11", estado: "contado" },
      { periodo: "2026-09", valor: "9", estado: "contado" },
    ]);
  });

  it("30 de setiembre, 21:30 en Lima: con la zona que guarda la empresa, setiembre no entra; si la empresa vive en UTC, sí", async () => {
    const enLima = await guardarValor(sb(), await kpi(I_D), { periodo: "2026-09", valor: 3 }, duena, { hoy: LIMA_21_30, zona: await zonaDeEmpresa(sb(), EMP_A) });
    expect(enLima).toMatchObject({ ok: false, status: 400 });
    expect(await valoresDe(I_D)).toEqual([]);
    expect(await numerosDe("reclamos_mes")).toEqual([]);
    // La quincena de B: cerrada en UTC a esa hora, abierta en Lima.
    const bEnLima = await guardarValor(sb(), await kpi(I_B), { periodo: "2026-09-Q2", valor: 2 }, dueno, { hoy: LIMA_21_30, zona: await zonaDeEmpresa(sb(), EMP_B) });
    expect(bEnLima).toMatchObject({ ok: false, status: 400 });
    await base().query("update companies set zona_horaria = 'UTC' where id = $1", [EMP_B]);
    const bEnUtc = await guardarValor(sb(), await kpi(I_B), { periodo: "2026-09-Q2", valor: 2 }, dueno, { hoy: LIMA_21_30, zona: await zonaDeEmpresa(sb(), EMP_B) });
    expect(bEnUtc).toMatchObject({ ok: true, sin_dato: false, espejo: "no_aplica", pendiente: null });
    await base().query("update companies set zona_horaria = 'America/Lima' where id = $1", [EMP_B]);
    expect((await valoresDe(I_B)).map((v) => v.periodo)).toContain("2026-09-Q2");
    // NEGATIVO · una quincena no es un mes: no deja fila en los números de la empresa.
    const deB = await base().query<{ n: number }>("select count(*)::int as n from company_metricas where company_id = $1", [EMP_B]);
    expect(deB.rows[0]!.n).toBe(0);
  });

  it("NEGATIVO · un número VERIFICADO en los números de la empresa no lo pisa un valor del indicador: queda intacto y se avisa", async () => {
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado) values ($1, 'reclamos_mes', '2026-08', 20, 'verificado')", [EMP_A]);
    const r = await guardarValor(sb(), await kpi(I_D), { periodo: "2026-08", valor: 4 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, valor: 4, espejo: "intacto", pendiente: null });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    expect(r.aviso).toBe("En «Tus números», Agosto 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.");
    expect(await numerosDe("reclamos_mes")).toEqual([{ periodo: "2026-08", valor: "20", estado: "verificado" }]);
    // El valor declarado sí quedó en la historia del indicador, con su rótulo.
    expect(await valoresDe(I_D)).toEqual([{ periodo: "2026-08", valor: "4", estado_validacion: "declarado", registrado_por: U_A, fuente: "Libro de reclamaciones" }]);
    // POSITIVO · sobre un número contado de memoria, el mismo camino sí lo reemplaza.
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado) values ($1, 'reclamos_mes', '2026-09', 20, 'contado')", [EMP_A]);
    const s = await guardarValor(sb(), await kpi(I_D), { periodo: "2026-09", valor: 6 }, duena, { hoy: HOY });
    expect(s).toMatchObject({ ok: true, sin_dato: false, espejo: "reflejado", aviso: null });
    expect(await numerosDe("reclamos_mes")).toEqual([
      { periodo: "2026-08", valor: "20", estado: "verificado" },
      { periodo: "2026-09", valor: "6", estado: "contado" },
    ]);
  });

  it("«sin dato» sobre el mismo periodo que ya tiene valor: el indicador queda sin_dato, el número sigue en la historia y el texto lo dice", async () => {
    const r = await guardarValor(sb(), await kpi(I_D), { periodo: "2026-09", valor: null }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: true, es_periodo_anterior: false, texto: "Se anotó sin dato en Setiembre 2026. Ese periodo ya tenía un valor: no se borra, sigue en la historia." });
    expect(await actualDe(I_D)).toEqual({ valor_actual: "6", valor_actual_periodo: "2026-09", estado_validacion: "sin_dato" });
    expect((await valoresDe(I_D)).map((v) => `${v.periodo}=${v.valor}`)).toEqual(["2026-08=4", "2026-09=6"]);
  });

  it("el motivo de archivo entra en audit_log tal como lo escribe la ruta, y se puede leer después", async () => {
    const r = await dejarMotivoDeArchivo(sb(), {
      companyId: EMP_A, indicadorId: I_D, clave: "reclamos_mes", motivo: "Ya lo lleva el libro de reclamaciones", quien: duena, ruta: "/api/companies/kpis", ip: null,
      antes: { estado: "activo" }, despues: { estado: "archivado" },
    });
    expect(r).toEqual({ ok: true });
    const fila = await base().query<{ motivo: string; antes: string; despues: string; actor_rol: string; accion: string }>(
      "select detalle->>'motivo' as motivo, detalle->'antes'->>'estado' as antes, detalle->'despues'->>'estado' as despues, actor_rol, accion from audit_log where entidad = 'indicador' and entidad_id = $1",
      [I_D]
    );
    expect(fila.rows).toEqual([{ motivo: "Ya lo lleva el libro de reclamaciones", antes: "activo", despues: "archivado", actor_rol: "cliente", accion: "editar" }]);
  });

  it("NEGATIVO · si el rastro no puede guardar el motivo (actor que no existe), lo dice: quien llama no archiva", async () => {
    const r = await dejarMotivoDeArchivo(sb(), {
      companyId: EMP_A, indicadorId: I_D, clave: "reclamos_mes", motivo: "Ya lo lleva el libro de reclamaciones", quien: { id: "00000000-0000-4000-8000-00000000dead", rol: "cliente" },
      ruta: "/api/companies/kpis", ip: null, antes: { estado: "activo" }, despues: { estado: "archivado" },
    });
    expect(r.ok).toBe(false);
  });
});

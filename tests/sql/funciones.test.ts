/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LAS FUNCIONES DE LA BASE HACEN LO QUE DICEN.
 *
 * Son las funciones que el código llama por RPC con la service role y de las que depende la cola
 * (take_job, recover_stale_jobs), la línea base (congelar_medicion), el cortacircuitos del modelo
 * (circuito_fallo / circuito_abierto / circuito_exito) y el límite de peticiones (consumir_cupo). Hasta
 * hoy solo se podían probar contra producción, así que no se probaban.
 *
 * Qué no prueba: que Supabase las exponga por PostgREST ni los permisos de ejecución por rol. Aquí se
 * llaman como dueño de la base, que es lo que hace la service role.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema } from "./aplicar";

// Identificadores fijos: la prueba es reproducible y los mensajes de error se leen igual cada vez.
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const J1 = "00000001-0000-4000-8000-000000000001";
const J2 = "00000002-0000-4000-8000-000000000002";

type Job = { id: string; estado: string; intentos: number; lease_en_el_futuro: boolean; tomado: boolean };

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    await pg.query("insert into companies (id, nombre) values ($1, 'Empresa A'), ($2, 'Empresa B')", [EMP_A, EMP_B]);
  } catch (e) {
    fallo = e;
  }
}, 180_000);

afterAll(async () => {
  await pg?.close();
});

/** La base aplicada; si aplicar falló, el error se relanza aquí para que cada caso lo diga completo. */
function base(): PGlite {
  if (fallo) throw fallo;
  if (!pg) throw new Error("no hay base: beforeAll no la creó");
  return pg;
}

async function tomar(): Promise<Job[]> {
  const r = await base().query<Job>(
    "select id, estado, intentos, lease_expira_at > now() as lease_en_el_futuro, tomado_at is not null as tomado from take_job(10, 2, 12)"
  );
  return r.rows;
}

describe("Postgres embebido (PGlite), no Supabase: take_job y recover_stale_jobs", () => {
  it("entrega el trabajo pendiente más antiguo, con lease en el futuro, estado corriendo y un intento más", async () => {
    await base().query(
      "insert into jobs (id, company_id, tipo, prioridad, created_at) values ($1, $3, 'extraer', 5, now() - interval '2 minutes'), ($2, $3, 'extraer', 5, now() - interval '1 minute')",
      [J1, J2, EMP_A]
    );
    const r = await tomar();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: J1, estado: "corriendo", intentos: 1, lease_en_el_futuro: true, tomado: true });
  });

  it("no entrega el mismo trabajo dos veces: la segunda llamada da el otro, la tercera nada", async () => {
    const segunda = await tomar();
    expect(segunda.map((j) => j.id)).toEqual([J2]);
    expect(await tomar()).toEqual([]);
  });

  it("fairness: con dos pesados corriendo de una empresa, el tercero pesado espera; un interactivo (prioridad < 5) no", async () => {
    await base().query(
      "insert into jobs (company_id, tipo, prioridad, created_at) select $1, 'extraer', 5, now() - make_interval(mins => n) from generate_series(3, 1, -1) n",
      [EMP_B]
    );
    expect(await tomar()).toHaveLength(1);
    expect(await tomar()).toHaveLength(1);
    // Empresa B ya tiene dos pesados corriendo: el tercero no sale aunque esté pendiente.
    expect(await tomar()).toEqual([]);
    await base().query("insert into jobs (company_id, tipo, prioridad) values ($1, 'pregunta', 1)", [EMP_B]);
    const interactivo = await tomar();
    expect(interactivo).toHaveLength(1);
    expect(interactivo[0].estado).toBe("corriendo");
  });

  it("recover_stale_jobs devuelve a pendiente el lease vencido con intentos de sobra y da por fallido al que los agotó", async () => {
    await base().query(
      `insert into jobs (id, company_id, tipo, estado, intentos, max_intentos, lease_expira_at) values
         ('00000003-0000-4000-8000-000000000003', $1, 'extraer', 'corriendo', 1, 3, now() - interval '1 minute'),
         ('00000004-0000-4000-8000-000000000004', $1, 'extraer', 'corriendo', 3, 3, now() - interval '1 minute')`,
      [EMP_A]
    );
    const n = await base().query<{ recover_stale_jobs: number }>("select recover_stale_jobs()");
    expect(n.rows[0].recover_stale_jobs).toBe(2);

    const r = await base().query<{ id: string; estado: string; error: string | null }>(
      "select id, estado, error from jobs where id in ('00000003-0000-4000-8000-000000000003', '00000004-0000-4000-8000-000000000004') order by id"
    );
    expect(r.rows[0]).toMatchObject({ estado: "pendiente", error: null });
    expect(r.rows[1].estado).toBe("fallido");
    expect(r.rows[1].error).toContain("[lease vencido]");
    // Los que tienen el lease vivo no se tocan.
    const vivos = await base().query<{ n: number }>("select count(*)::int as n from jobs where estado = 'corriendo'");
    expect(vivos.rows[0].n).toBe(5);
  });
});

describe("Postgres embebido (PGlite), no Supabase: congelar_medicion", () => {
  type Medicion = { id: string; tipo: string; numero: number; valores: { venta_mes?: number } };
  const congelar = (tipo: string, venta: number) =>
    base().query<Medicion>("select id, tipo, numero, valores from congelar_medicion($1, $2, $3::jsonb, '{}'::jsonb, null, null)", [
      EMP_A,
      tipo,
      JSON.stringify({ venta_mes: venta }),
    ]);

  let primera: string;

  it("la línea base se guarda con número 0 y sus valores", async () => {
    const r = await congelar("linea_base", 40000);
    expect(r.rows[0]).toMatchObject({ tipo: "linea_base", numero: 0, valores: { venta_mes: 40000 } });
    primera = r.rows[0].id;
  });

  it("volver a congelar la línea base CONSERVA la anterior: versión 2 vigente, versión 1 guardada como historial (R14.1)", async () => {
    // Antes (migracion-mediciones.sql:59) la segunda borraba la primera y toda comparación histórica cambiaba en silencio.
    const r = await congelar("linea_base", 45000);
    expect(r.rows[0]).toMatchObject({ tipo: "linea_base", numero: 0, valores: { venta_mes: 45000 } });
    const todas = await base().query<{ id: string; version: number; vigente: boolean; reemplaza_a: string | null }>(
      "select id, version, vigente, reemplaza_a from mediciones where company_id = $1 and tipo = 'linea_base' order by version",
      [EMP_A],
    );
    expect(todas.rows.length).toBe(2);
    expect(todas.rows[0]).toMatchObject({ version: 1, vigente: false, reemplaza_a: null });
    expect(todas.rows[1]).toMatchObject({ version: 2, vigente: true, reemplaza_a: todas.rows[0].id });
  });

  it("los cortes se numeran solos: 1, 2…", async () => {
    const c1 = await congelar("corte", 41000);
    const c2 = await congelar("corte", 42000);
    expect(c1.rows[0].numero).toBe(1);
    expect(c2.rows[0].numero).toBe(2);
  });

  it("un corte referencia la versión EXACTA de la línea base vigente al medirlo", async () => {
    const vigente = await base().query<{ id: string }>("select id from mediciones where company_id = $1 and tipo = 'linea_base' and vigente", [EMP_A]);
    const c = await base().query<{ linea_base_id: string | null; hash_contenido: string | null }>(
      "select linea_base_id, hash_contenido from congelar_medicion($1, 'corte', '{\"venta_mes\": 46000}'::jsonb, '{}'::jsonb, null, null)",
      [EMP_A],
    );
    expect(c.rows[0].linea_base_id).toBe(vigente.rows[0].id);
    expect(c.rows[0].hash_contenido).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rechaza un tipo que no sea linea_base ni corte", async () => {
    await expect(congelar("otro", 1)).rejects.toThrow(/tipo de medición no válido/);
  });
});

describe("Postgres embebido (PGlite), no Supabase: el circuito compartido del modelo", () => {
  const CLAVE = "proveedor:prueba";
  const fallo = () => base().query<{ circuito_fallo: boolean }>("select circuito_fallo($1, 3, 60)", [CLAVE]).then((r) => r.rows[0].circuito_fallo);
  const abierto = (clave = CLAVE) => base().query<{ circuito_abierto: boolean }>("select circuito_abierto($1)", [clave]).then((r) => r.rows[0].circuito_abierto);

  it("una clave que nunca falló está cerrada", async () => {
    expect(await abierto("nunca:vista")).toBe(false);
  });

  it("dos fallos no abren con umbral 3; el tercero sí", async () => {
    expect(await fallo()).toBe(false);
    expect(await fallo()).toBe(false);
    expect(await abierto()).toBe(false);
    expect(await fallo()).toBe(true);
    expect(await abierto()).toBe(true);
  });

  it("al abrir se reinicia la cuenta de fallos: la ventana ya protege", async () => {
    const r = await base().query<{ fallos: number }>("select fallos from circuito where clave = $1", [CLAVE]);
    expect(r.rows[0].fallos).toBe(0);
  });

  it("un éxito lo cierra de inmediato", async () => {
    await base().query("select circuito_exito($1)", [CLAVE]);
    expect(await abierto()).toBe(false);
    const r = await base().query<{ cortado_hasta: string | null }>("select cortado_hasta from circuito where clave = $1", [CLAVE]);
    expect(r.rows[0].cortado_hasta).toBeNull();
  });
});

describe("Postgres embebido (PGlite), no Supabase: consumir_cupo (límite de peticiones)", () => {
  type Cupo = { permitido: boolean; restantes: number; reinicia_en: number };
  const consumir = (clave: string) => base().query<Cupo>("select * from consumir_cupo($1, 2, 60)", [clave]).then((r) => r.rows[0]);

  it("concede hasta el máximo y después niega, contando los restantes", async () => {
    expect(await consumir("ip:1")).toMatchObject({ permitido: true, restantes: 1 });
    expect(await consumir("ip:1")).toMatchObject({ permitido: true, restantes: 0 });
    const tercera = await consumir("ip:1");
    expect(tercera).toMatchObject({ permitido: false, restantes: 0 });
    expect(tercera.reinicia_en).toBeGreaterThanOrEqual(0);
    expect(tercera.reinicia_en).toBeLessThanOrEqual(60);
  });

  it("cada clave tiene su propia ventana", async () => {
    expect(await consumir("ip:2")).toMatchObject({ permitido: true, restantes: 1 });
  });

  it("una ventana vencida se reinicia en la misma llamada", async () => {
    await base().query("update rate_limits set ventana_inicio = now() - interval '2 minutes' where clave = 'ip:1'");
    expect(await consumir("ip:1")).toMatchObject({ permitido: true, restantes: 1 });
  });
});

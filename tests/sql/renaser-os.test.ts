/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: RENASER OS (migracion-renaser-os.sql, 19-10-2026).
 *
 * Qué se comprueba, sobre TODO el esquema del repositorio:
 *  - las 16 tablas os_* existen, todas con RLS, y desde el navegador (anon y authenticated) nadie lee ni escribe nada
 *    en ellas ni ejecuta las reglas: todo pasa por la aplicación, con la credencial del servidor;
 *  - cada regla genera sus avisos con datos mínimos: el cronómetro olvidado, el bloqueo de más de 30 minutos, el plan
 *    del día siguiente (a la persona y a la gestión), el diagnóstico diario; y no avisa a quien no corresponde;
 *  - correr una regla dos veces no duplica (la clave única de os_avisos), y una regla apagada en os_reglas no avisa;
 *  - os_marcar_corrida anota la última corrida en cada empresa con equipo, sin tocar si la regla está apagada;
 *  - la migración se puede aplicar dos veces sin daño;
 *  - la reversión (supabase/revertir/migracion-renaser-os.sql) retira las 16 tablas sin perder filas, y después la
 *    migración vuelve a aplicar con sus índices (si los nombres siguieran vivos en las retiradas, chocaría).
 *
 * Límite: PGlite no deja mover now(). Lo que depende de la hora de Lima (la inactividad entre las 8 y las 19, el
 * cierre semanal de viernes y sábado) se comprueba en las dos ramas, según el día y la hora en que corra la prueba: si
 * hoy no toca, se comprueba que NO avisa. No hay pg_cron: la agenda no se prueba aquí (en el Supabase local sí existe).
 * Empresas y personas ficticias.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { aplicarArchivo, baseConEsquema, consultarComo, CARPETA_SUPABASE } from "./aplicar";
import { siguienteDiaHabil } from "@/lib/os/calculos";

const TABLAS = [
  "os_personas", "os_proyectos", "os_tareas", "os_bloqueos", "os_reprogramaciones", "os_registros_tiempo", "os_aperturas",
  "os_cierres", "os_cierres_semanales", "os_entregables", "os_objetivos", "os_legajos", "os_acompanamientos",
  "os_evaluaciones", "os_avisos", "os_reglas",
] as const;
const REGLAS = ["os_regla_inactividad", "os_regla_bloqueos", "os_regla_plan_manana", "os_regla_cierre_semanal", "os_regla_diagnostico"] as const;
const MIGRACION = path.join(CARPETA_SUPABASE, "migracion-renaser-os.sql");
const REVERSION = path.join(CARPETA_SUPABASE, "revertir", "migracion-renaser-os.sql");

// Cuentas (auth.users → users por el disparador) y empresas.
const U_ROSA = "00000000-0000-4000-8000-0000000000e1"; // dueña de A
const U_CARLA = "00000000-0000-4000-8000-0000000000e2";
const U_LUIS = "00000000-0000-4000-8000-0000000000e3";
const U_JORGE = "00000000-0000-4000-8000-0000000000e4";
const U_ANA = "00000000-0000-4000-8000-0000000000e5"; // la única de B
const EMP_A = "0000000e-0000-4000-8000-00000000000a";
const EMP_B = "0000000e-0000-4000-8000-00000000000b";
const EMP_C = "0000000e-0000-4000-8000-00000000000c"; // sin equipo
// Fichas del equipo.
const P_ROSA = "000000e1-0000-4000-8000-0000000000a1";
const P_CARLA = "000000e1-0000-4000-8000-0000000000a2";
const P_LUIS = "000000e1-0000-4000-8000-0000000000a3";
const P_JORGE = "000000e1-0000-4000-8000-0000000000a4";
const P_PEDRO = "000000e1-0000-4000-8000-0000000000a5"; // sin cuenta todavía
const P_ANA = "000000e1-0000-4000-8000-0000000000b1";

let pg: PGlite;

const uno = async <T,>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0]!;
const servidor = (sql: string, params: unknown[] = []) => consultarComo(pg, "service_role", null, sql, params);
const avisos = async (clave: string) => (await pg.query<{ n: number }>("select count(*)::int as n from os_avisos where clave like $1", [clave])).rows[0]!.n;

/** El día de hoy en Lima, como lo calcula la base. */
let HOY: string;

beforeAll(async () => {
  ({ pg } = await baseConEsquema());
  HOY = (await uno<{ hoy: string }>("select ((now() at time zone 'America/Lima')::date)::text as hoy")).hoy;
  await pg.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'rosa@andina.prueba', '{"nombre": "Rosa Quispe"}'), ($2, 'carla@andina.prueba', '{}'), ($3, 'luis@andina.prueba', '{}'),
       ($4, 'jorge@andina.prueba', '{}'), ($5, 'ana@lucero.prueba', '{}')`,
    [U_ROSA, U_CARLA, U_LUIS, U_JORGE, U_ANA]
  );
  await pg.query("insert into companies (id, nombre) values ($1, 'Distribuidora Ficticia A'), ($2, 'Textiles Ficticios B'), ($3, 'Bodega Sin Equipo C')", [EMP_A, EMP_B, EMP_C]);
  await pg.query("insert into memberships (user_id, company_id, nivel) values ($1, $2, 'dueno')", [U_ROSA, EMP_A]);
  await pg.query(
    `insert into os_personas (id, company_id, user_id, email, nombre, rol) values
       ($1, $7, $8, 'rosa@andina.prueba', 'Rosa Quispe', 'dueno'),
       ($2, $7, $9, 'carla@andina.prueba', 'Carla Mendoza', 'persona'),
       ($3, $7, $10, 'luis@andina.prueba', 'Luis Huamán', 'persona'),
       ($4, $7, $11, 'jorge@andina.prueba', 'Jorge Salazar', 'persona'),
       ($5, $7, null, 'pedro@andina.prueba', 'Pedro Rojas', 'persona'),
       ($6, $12, $13, 'ana@lucero.prueba', 'Ana Flores', 'dueno')`,
    [P_ROSA, P_CARLA, P_LUIS, P_JORGE, P_PEDRO, P_ANA, EMP_A, U_ROSA, U_CARLA, U_LUIS, U_JORGE, EMP_B, U_ANA]
  );
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe("RENASER OS en Postgres embebido: tablas y permisos", () => {
  it("las 16 tablas os_* existen y todas tienen RLS", async () => {
    const { rows } = await pg.query<{ relname: string; rls: boolean }>(
      "select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'os\\_%' order by 1"
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLAS].sort());
    for (const r of rows) expect(r.rls, `${r.relname} sin RLS`).toBe(true);
  });

  it("desde el navegador nadie lee ni escribe en ninguna (ni la dueña, ni el anónimo): todo pasa por la aplicación", async () => {
    for (const t of TABLAS) {
      for (const [rol, sub] of [["authenticated", U_ROSA], ["anon", null]] as const) {
        await expect(consultarComo(pg, rol, sub, `select * from ${t} limit 1`), `${rol} lee ${t}`).rejects.toThrow(/permission denied/);
        await expect(consultarComo(pg, rol, sub, `insert into ${t} default values`), `${rol} inserta en ${t}`).rejects.toThrow(/permission denied/);
        await expect(consultarComo(pg, rol, sub, `update ${t} set company_id = company_id`), `${rol} cambia ${t}`).rejects.toThrow(/permission denied/);
        await expect(consultarComo(pg, rol, sub, `delete from ${t}`), `${rol} borra en ${t}`).rejects.toThrow(/permission denied/);
      }
    }
  });

  it("las reglas solo las ejecuta el servidor", async () => {
    for (const f of REGLAS) {
      await expect(consultarComo(pg, "authenticated", U_ROSA, `select ${f}()`), f).rejects.toThrow(/permission denied/);
      await expect(consultarComo(pg, "anon", null, `select ${f}()`), f).rejects.toThrow(/permission denied/);
    }
    await expect(consultarComo(pg, "authenticated", U_ROSA, "select os_marcar_corrida('bloqueos')")).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg, "authenticated", U_ROSA, "select os_regla_activa($1, 'bloqueos')", [EMP_A])).rejects.toThrow(/permission denied/);
  });

  it("el bucket de entregables existe y es privado", async () => {
    expect(await uno<{ public: boolean }>("select public from storage.buckets where id = 'os-entregables'")).toEqual({ public: false });
  });

  it("un cronómetro por persona, un bloqueo abierto por tarea, y el ánimo va de 1 a 5", async () => {
    const t = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo) values ($1, $2, 'Probar los índices') returning id", [EMP_A, P_LUIS]);
    await pg.query("insert into os_registros_tiempo (company_id, tarea_id, persona_id) values ($1, $2, $3)", [EMP_A, t.id, P_LUIS]);
    await expect(pg.query("insert into os_registros_tiempo (company_id, tarea_id, persona_id) values ($1, $2, $3)", [EMP_A, t.id, P_LUIS])).rejects.toThrow(/os_un_cronometro_por_persona/);
    await pg.query("insert into os_bloqueos (company_id, tarea_id, persona_id, causa) values ($1, $2, $3, 'Falta el camión')", [EMP_A, t.id, P_LUIS]);
    await expect(pg.query("insert into os_bloqueos (company_id, tarea_id, persona_id, causa) values ($1, $2, $3, 'Otra causa')", [EMP_A, t.id, P_LUIS])).rejects.toThrow(/os_un_bloqueo_abierto/);
    await expect(pg.query("insert into os_aperturas (company_id, persona_id, fecha, animo) values ($1, $2, $3, 6)", [EMP_A, P_LUIS, HOY])).rejects.toThrow(/check/);
    await pg.query("delete from os_tareas where id = $1", [t.id]); // en cascada: su tramo y su bloqueo
    expect(await uno("select (select count(*) from os_registros_tiempo)::int as r, (select count(*) from os_bloqueos)::int as b")).toEqual({ r: 0, b: 0 });
  });
});

describe("RENASER OS en Postgres embebido: las reglas que generan avisos", () => {
  it("bloqueos: avisa una vez a la gestión por la tarea bloqueada hace más de 30 minutos, y no por la reciente ni por la de una empresa que apagó la regla", async () => {
    const vieja = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo, estado) values ($1, $2, 'Ruta Lima Norte', 'bloqueada') returning id", [EMP_A, P_CARLA]);
    const nueva = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo, estado) values ($1, $2, 'Conciliar Yape', 'bloqueada') returning id", [EMP_A, P_CARLA]);
    const deB = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo, estado) values ($1, $2, 'Pedido de tela', 'bloqueada') returning id", [EMP_B, P_ANA]);
    const b1 = await uno<{ id: string }>(
      "insert into os_bloqueos (company_id, tarea_id, persona_id, causa, depende_de, desde) values ($1, $2, $3, 'No hay camión asignado', 'Operaciones', now() - interval '31 minutes') returning id",
      [EMP_A, vieja.id, P_CARLA]
    );
    await pg.query("insert into os_bloqueos (company_id, tarea_id, persona_id, causa, desde) values ($1, $2, $3, 'Falta el reporte del banco', now() - interval '10 minutes')", [EMP_A, nueva.id, P_CARLA]);
    const bB = await uno<{ id: string }>(
      "insert into os_bloqueos (company_id, tarea_id, persona_id, causa, desde) values ($1, $2, $3, 'El proveedor no contesta', now() - interval '2 hours') returning id",
      [EMP_B, deB.id, P_ANA]
    );
    await pg.query("insert into os_reglas (company_id, regla, activa) values ($1, 'bloqueos', false)", [EMP_B]);

    const [{ n }] = await servidor("select os_regla_bloqueos() as n") as [{ n: number }];
    expect(n).toBe(1);
    const aviso = await uno<{ para_gestion: boolean; persona_id: string | null; regla: string; titulo: string; detalle: string; enlace: string }>(
      "select para_gestion, persona_id, regla, titulo, detalle, enlace from os_avisos where clave = $1",
      [`bloqueo:${b1.id}`]
    );
    expect(aviso).toMatchObject({ para_gestion: true, persona_id: null, regla: "bloqueos", enlace: "/os/equipo" });
    expect(aviso.titulo).toMatch(/^«Ruta Lima Norte» lleva 3[12] min bloqueada$/);
    expect(aviso.detalle).toBe("Carla Mendoza · causa: No hay camión asignado. Depende de: Operaciones.");
    expect(await uno<{ avisado: boolean }>("select avisado_at is not null as avisado from os_bloqueos where id = $1", [b1.id])).toEqual({ avisado: true });
    // La empresa B apagó la regla: su bloqueo de dos horas no avisa ni queda marcado.
    expect(await avisos(`bloqueo:${bB.id}`)).toBe(0);
    expect(await uno<{ avisado: boolean }>("select avisado_at is not null as avisado from os_bloqueos where id = $1", [bB.id])).toEqual({ avisado: false });

    // Dos veces: no repite.
    const [{ n: n2 }] = await servidor("select os_regla_bloqueos() as n") as [{ n: number }];
    expect(n2).toBe(0);
    expect(await avisos("bloqueo:%")).toBe(1);
  });

  it("os_marcar_corrida anota la corrida en cada empresa con equipo, sin encender la regla que la empresa apagó", async () => {
    const { rows } = await pg.query<{ company_id: string; activa: boolean; corrio: boolean }>(
      "select company_id, activa, ultima_corrida_at is not null as corrio from os_reglas where regla = 'bloqueos' order by company_id"
    );
    expect(rows).toEqual([
      { company_id: EMP_A, activa: true, corrio: true },
      { company_id: EMP_B, activa: false, corrio: true },
    ]);
    // La empresa sin equipo no tiene fila: nada que anotar.
    expect(await uno<{ n: number }>("select count(*)::int as n from os_reglas where company_id = $1", [EMP_C])).toEqual({ n: 0 });
  });

  it("inactividad (2): un cronómetro que corre hace más de 10 horas avisa una vez, a la gestión y a la persona", async () => {
    const t = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo) values ($1, $2, 'Recepción de mercadería') returning id", [EMP_A, P_JORGE]);
    const r = await uno<{ id: string }>(
      "insert into os_registros_tiempo (company_id, tarea_id, persona_id, inicio) values ($1, $2, $3, now() - interval '11 hours') returning id",
      [EMP_A, t.id, P_JORGE]
    );
    await servidor("select os_regla_inactividad()");
    const aviso = await uno<{ para_gestion: boolean; persona_id: string; titulo: string; detalle: string }>(
      "select para_gestion, persona_id, titulo, detalle from os_avisos where clave = $1",
      [`cronometro:${r.id}`]
    );
    expect(aviso).toMatchObject({ para_gestion: true, persona_id: P_JORGE, titulo: "Cronómetro olvidado: Jorge Salazar" });
    expect(aviso.detalle).toMatch(/en «Recepción de mercadería»\.$/);
    await servidor("select os_regla_inactividad()");
    expect(await avisos(`cronometro:${r.id}`)).toBe(1);
  });

  it("inactividad (1): quien abrió el día y no se movió en una hora avisa a la gestión, solo de lunes a sábado entre las 8 y las 19 de Lima", async () => {
    // Luis abrió hoy hace dos horas y no tiene tareas ni cronómetro: su último movimiento es la apertura.
    await pg.query("insert into os_aperturas (company_id, persona_id, fecha, animo, created_at) values ($1, $2, $3, 3, now() - interval '2 hours')", [EMP_A, P_LUIS, HOY]);
    const { en } = await uno<{ en: boolean }>(
      "select extract(isodow from now() at time zone 'America/Lima') between 1 and 6 and extract(hour from now() at time zone 'America/Lima') between 8 and 18 as en"
    );
    await servidor("select os_regla_inactividad()");
    const luis = await pg.query<{ titulo: string; para_gestion: boolean }>("select titulo, para_gestion from os_avisos where clave like $1", [`inactividad:${P_LUIS}:%`]);
    if (en) {
      expect(luis.rows).toHaveLength(1);
      expect(luis.rows[0]!.titulo).toMatch(/^Luis Huamán no registra actividad desde las \d{2}:\d{2}$/);
      expect(luis.rows[0]!.para_gestion).toBe(true);
    } else {
      expect(luis.rows, "fuera del horario de trabajo la regla no avisa").toHaveLength(0);
    }
    // Jorge tiene el cronómetro corriendo (aunque olvidado): no es «sin actividad».
    expect(await avisos(`inactividad:${P_JORGE}:%`)).toBe(0);
    // Dos veces en la misma hora: no repite.
    await servidor("select os_regla_inactividad()");
    expect(await avisos(`inactividad:${P_LUIS}:%`)).toBe(en ? 1 : 0);
  });

  it("plan de mañana: avisa a cada persona con cuenta sin tareas para el próximo día hábil, y a la gestión con los nombres", async () => {
    const manana = siguienteDiaHabil(HOY);
    // Carla ya tiene trabajo para ese día; Pedro no tiene cuenta; Luis, Jorge y Rosa no tienen nada.
    await pg.query("insert into os_tareas (company_id, persona_id, titulo, fecha_inicio) values ($1, $2, 'Llamar a clientes atrasados', $3)", [EMP_A, P_CARLA, manana]);
    await servidor("select os_regla_plan_manana()");
    const { rows } = await pg.query<{ persona_id: string }>("select persona_id from os_avisos where regla = 'plan' and company_id = $1 and persona_id is not null order by persona_id", [EMP_A]);
    expect(rows.map((r) => r.persona_id)).toEqual([P_ROSA, P_LUIS, P_JORGE].sort());
    const propio = await uno<{ titulo: string; enlace: string; clave: string }>("select titulo, enlace, clave from os_avisos where persona_id = $1 and regla = 'plan'", [P_LUIS]);
    expect(propio.titulo).toBe(`Pon tu trabajo para el ${manana.slice(8, 10)}/${manana.slice(5, 7)}`);
    expect(propio).toMatchObject({ enlace: "/os/mi-trabajo", clave: `plan_manana:${P_LUIS}:${manana}` });
    const equipo = await uno<{ titulo: string; detalle: string; para_gestion: boolean }>("select titulo, detalle, para_gestion from os_avisos where clave = $1", [`plan_equipo:${EMP_A}:${manana}`]);
    expect(equipo.para_gestion).toBe(true);
    expect(equipo.titulo).toMatch(/^Plan de mañana: 3 personas sin tareas para el /);
    expect(equipo.detalle).toBe("Jorge Salazar, Luis Huamán, Rosa Quispe.");
    // La empresa B (Ana sola, sin tareas) también recibe los suyos.
    expect(await avisos(`plan_manana:${P_ANA}:${manana}`)).toBe(1);
    // Dos veces: no repite.
    await servidor("select os_regla_plan_manana()");
    expect(await uno<{ n: number }>("select count(*)::int as n from os_avisos where regla = 'plan'")).toEqual({ n: 6 });
  });

  it("cierre semanal: viernes y sábado de Lima avisa a quien no cerró su semana; cualquier otro día, a nadie", async () => {
    const { dia, lunes } = await uno<{ dia: number; lunes: string }>(
      "select extract(isodow from now() at time zone 'America/Lima')::int as dia, (date_trunc('week', (now() at time zone 'America/Lima')::date)::date)::text as lunes"
    );
    await pg.query("insert into os_cierres_semanales (company_id, persona_id, semana, logros) values ($1, $2, $3, 'Cerré El Sol')", [EMP_A, P_CARLA, lunes]);
    await servidor("select os_regla_cierre_semanal()");
    const { rows } = await pg.query<{ persona_id: string | null; para_gestion: boolean }>("select persona_id, para_gestion from os_avisos where regla = 'cierre_semanal' and company_id = $1", [EMP_A]);
    if (dia === 5 || dia === 6) {
      // Carla cerró; Pedro no tiene cuenta. El sábado, además, uno a la gestión.
      expect(rows.filter((r) => r.persona_id).map((r) => r.persona_id).sort()).toEqual([P_ROSA, P_LUIS, P_JORGE].sort());
      expect(rows.filter((r) => r.para_gestion)).toHaveLength(dia === 6 ? 1 : 0);
    } else {
      expect(rows, "de domingo a jueves la regla no avisa").toHaveLength(0);
    }
  });

  it("diagnóstico diario: cuenta vencidas, sin fecha, prorrogadas tres veces y bloqueadas; la empresa sin nada que decir no recibe aviso", async () => {
    // La empresa B: una vencida, una sin fecha, una prorrogada tres veces (con fecha futura) y la bloqueada de antes.
    await pg.query(
      `insert into os_tareas (company_id, persona_id, titulo, fecha_limite) values
         ($1, $2, 'Cobrar a Bodega Rosita', ($3::date - 2)),
         ($1, $2, 'Ordenar el almacén', null)`,
      [EMP_B, P_ANA, HOY]
    );
    const prorrogada = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo, fecha_limite) values ($1, $2, 'Catálogo 2027', ($3::date + 10)) returning id", [EMP_B, P_ANA, HOY]);
    for (let i = 0; i < 3; i++) {
      await pg.query("insert into os_reprogramaciones (company_id, tarea_id, tipo, motivo) values ($1, $2, 'prorroga', 'Sin fotos todavía')", [EMP_B, prorrogada.id]);
    }
    // Una completada vieja no cuenta. Y la empresa C no tiene tareas: no recibe aviso.
    await pg.query("insert into os_tareas (company_id, persona_id, titulo, estado, fecha_limite, completada_at) values ($1, $2, 'Lista de precios', 'completada', ($3::date - 5), now())", [EMP_B, P_ANA, HOY]);
    // La empresa A apagó el diagnóstico (lo vuelve a encender la prueba siguiente).
    await pg.query("insert into os_reglas (company_id, regla, activa) values ($1, 'diagnostico', false) on conflict (company_id, regla) do update set activa = false", [EMP_A]);
    await servidor("select os_regla_diagnostico()");
    const b = await uno<{ titulo: string; detalle: string; para_gestion: boolean }>("select titulo, detalle, para_gestion from os_avisos where clave = $1", [`diagnostico:${EMP_B}:${HOY}`]);
    // Abiertas en B: la bloqueada (sin fecha), la vencida, la sin fecha y la prorrogada.
    expect(b).toEqual({ titulo: "Diagnóstico de tareas de hoy", detalle: "1 vencidas, 2 sin fecha límite, 1 prorrogadas tres veces o más y 1 bloqueadas.", para_gestion: true });
    expect(await avisos(`diagnostico:${EMP_C}:%`)).toBe(0);
    await servidor("select os_regla_diagnostico()");
    expect(await avisos(`diagnostico:${EMP_B}:%`)).toBe(1);
  });

  it("una regla apagada no avisa, y al encenderla vuelve a avisar: el diagnóstico de la empresa A", async () => {
    // A tiene tareas abiertas que decir (las bloqueadas de antes), pero apagó la regla: nada.
    expect(await avisos(`diagnostico:${EMP_A}:%`)).toBe(0);
    await pg.query("update os_reglas set activa = true where company_id = $1 and regla = 'diagnostico'", [EMP_A]);
    await servidor("select os_regla_diagnostico()");
    expect(await avisos(`diagnostico:${EMP_A}:${HOY}`)).toBe(1);
  });
});

describe("RENASER OS en Postgres embebido: aplicar dos veces, retirar y volver a aplicar", () => {
  it("la migración se aplica otra vez sin error y sin tocar lo que había", async () => {
    const antes = await uno<{ p: number; t: number; a: number }>("select (select count(*) from os_personas)::int as p, (select count(*) from os_tareas)::int as t, (select count(*) from os_avisos)::int as a");
    await aplicarArchivo(pg, MIGRACION);
    expect(await uno("select (select count(*) from os_personas)::int as p, (select count(*) from os_tareas)::int as t, (select count(*) from os_avisos)::int as a")).toEqual(antes);
  });

  it("la reversión retira las 16 tablas sin perder filas, borra las reglas, y la migración vuelve a aplicar con sus índices", async () => {
    const antes = await uno<{ p: number; t: number; a: number }>("select (select count(*) from os_personas)::int as p, (select count(*) from os_tareas)::int as t, (select count(*) from os_avisos)::int as a");
    expect(antes.p).toBe(6);
    await aplicarArchivo(pg, REVERSION);

    const { rows } = await pg.query<{ relname: string }>("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'os\\_%' order by 1");
    expect(rows.map((r) => r.relname).sort()).toEqual(TABLAS.map((t) => `${t}_retirada`).sort());
    expect(await uno("select (select count(*) from os_personas_retirada)::int as p, (select count(*) from os_tareas_retirada)::int as t, (select count(*) from os_avisos_retirada)::int as a")).toEqual(antes);
    expect(await uno<{ n: number }>("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'os\\_regla%' or p.proname = 'os_marcar_corrida')")).toEqual({ n: 0 });
    // Ningún índice de lo retirado conserva su nombre de antes.
    const vivos = await pg.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public' and tablename like 'os\\_%\\_retirada' and indexname not like '%\\_retirada'");
    expect(vivos.rows).toEqual([]);

    await aplicarArchivo(pg, MIGRACION);
    expect(await uno("select (select count(*) from os_personas)::int as p, (select count(*) from os_tareas)::int as t, (select count(*) from os_avisos)::int as a")).toEqual({ p: 0, t: 0, a: 0 });
    // Con sus índices únicos de verdad: un segundo cronómetro de la misma persona se rechaza otra vez.
    await pg.query("insert into os_personas (id, company_id, nombre) values ($1, $2, 'Luis Huamán')", [P_LUIS, EMP_A]);
    const t = await uno<{ id: string }>("insert into os_tareas (company_id, persona_id, titulo) values ($1, $2, 'De nuevo') returning id", [EMP_A, P_LUIS]);
    await pg.query("insert into os_registros_tiempo (company_id, tarea_id, persona_id) values ($1, $2, $3)", [EMP_A, t.id, P_LUIS]);
    await expect(pg.query("insert into os_registros_tiempo (company_id, tarea_id, persona_id) values ($1, $2, $3)", [EMP_A, t.id, P_LUIS])).rejects.toThrow(/os_un_cronometro_por_persona/);
    // Y las reglas vuelven a estar, solo para el servidor.
    await expect(consultarComo(pg, "authenticated", U_ROSA, "select os_regla_bloqueos()")).rejects.toThrow(/permission denied/);
    expect(await servidor("select os_regla_bloqueos() as n")).toEqual([{ n: 0 }]);
  });
});

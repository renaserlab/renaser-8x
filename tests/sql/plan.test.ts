/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: EL PLAN SE APRUEBA CON RASTRO Y EL CHECK NO DEJA PASAR ESTADOS INVENTADOS.
 *
 * migracion-plan-kpi-linea-base.sql amplía `actions` con los 14 campos y los estados de Dirección, y crea
 * `accion_historial`. Aquí se comprueba sobre una base vacía que una acción propuesta se aprueba y deja su
 * fila de historial con quién, por qué y qué implica; que un estado o una acción de historial inventados
 * no entran; que la clave de la persona responsable y de la línea base son foráneas de verdad; y que el
 * dueño de una empresa lee el historial de sus acciones y no el de la otra (RLS).
 *
 * Al final (remate P): lo que DECIDE la regla pura de src/lib/plan-reglas.ts (verificar con prueba; marcar
 * prioridad contando los frentes sobre las filas de esta base; desbloquear una prioridad contándolos también)
 * se escribe tal cual, con sus mismas columnas y su misma fila de historial, y el esquema real lo acepta. Los dobles de tests/plan-intervencion.test.ts no
 * saben si una columna existe; esta base sí.
 *
 * Qué no prueba: PostgREST, Auth ni las lecturas de src/lib/plan-intervencion.ts (eso va en tests/plan-intervencion.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo } from "./aplicar";
import { transicion, accionVacia, type Actor, type AccionPlan, type Estado, type ResultadoTransicion } from "@/lib/plan-reglas";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const PART_A = "000000a1-0000-4000-8000-0000000000a1";
const ACC_A = "000000aa-0000-4000-8000-00000000aaa1";
const ACC_B = "000000bb-0000-4000-8000-00000000bbb1";

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
    await pg.query("insert into participants (id, company_id, nombre, puesto, rol) values ($1, $2, 'Carlos Quispe', 'Jefe de taller', 'lider')", [PART_A, EMP_A]);
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

async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("Postgres embebido (PGlite), no Supabase: una acción propuesta se aprueba y deja historial", () => {
  it("la acción nace propuesta con los 14 campos, la persona responsable y la línea base vigente como referencia", async () => {
    const lb = await base().query<{ id: string; version: number }>("select id, version from congelar_medicion($1, 'linea_base', '{\"venta_mes\": 40000}'::jsonb, '{}'::jsonb, null, null)", [EMP_A]);
    await base().query(
      `insert into actions (id, company_id, accion, estado, objetivo_empresarial, linea_base_id, resultado_esperado, restriccion_oportunidad, evidencia_ids, entregable,
         responsable_participant_id, recursos, fecha_inicio, vence_at, depende_de, criterio_aceptacion, riesgos, supuestos, obligaciones_cliente, obligaciones_renaser, kpi, es_prioridad)
       values ($1, $2, 'Cotizar sin el dueño', 'propuesto', 'Que la venta no dependa del dueño', $3, '7 de cada 10 cotizaciones salen sin él', 'Quita la restricción: el dueño cotiza todo',
         '{}', 'Plantilla de cotización firmada', $4, 'Una laptop y la lista de precios', '2026-10-20', '2026-11-10', '{}', 'Diez cotizaciones firmadas por Carlos',
         'Que el dueño siga cotizando por costumbre', 'La lista de precios está al día', 'Dar acceso a la lista de precios', 'Revisar las primeras cinco cotizaciones', 'Cotizaciones sin el dueño, de cada 10', true)`,
      [ACC_A, EMP_A, lb.rows[0].id, PART_A]
    );
    await base().query("insert into accion_historial (action_id, accion, antes, despues, motivo, actor_rol) values ($1, 'proponer', null, '{\"estado\":\"propuesto\"}'::jsonb, 'propuesta del planificador', 'sistema')", [ACC_A]);
    const r = await base().query<{ estado: string; version: number; nombre: string; aprobador_id: string | null }>(
      "select a.estado, m.version, p.nombre, a.aprobador_id from actions a join mediciones m on m.id = a.linea_base_id join participants p on p.id = a.responsable_participant_id where a.id = $1",
      [ACC_A]
    );
    expect(r.rows[0]).toEqual({ estado: "propuesto", version: 1, nombre: "Carlos Quispe", aprobador_id: null });
  });

  it("aprobar: la fila cambia (estado, aprobador, fecha) y el historial dice quién, por qué y qué implica, sin pisar la propuesta", async () => {
    await base().query("update actions set estado = 'aprobado', aprobador_id = $2, aprobado_at = now() where id = $1", [ACC_A, U_C]);
    await base().query(
      "insert into accion_historial (action_id, accion, antes, despues, motivo, implica, actor_id, actor_rol) values ($1, 'aprobar', '{\"estado\":\"propuesto\"}'::jsonb, '{\"estado\":\"aprobado\"}'::jsonb, 'los seis campos están y Carlos existe', 'ocupa 1 de 3 frentes', $2, 'consultor')",
      [ACC_A, U_C]
    );
    const h = await base().query<{ accion: string; antes: { estado: string }; despues: { estado: string }; motivo: string | null; implica: string | null; actor_id: string | null }>(
      "select accion, antes, despues, motivo, implica, actor_id from accion_historial where action_id = $1 order by created_at",
      [ACC_A]
    );
    expect(h.rows.map((x) => x.accion)).toEqual(["proponer", "aprobar"]);
    expect(h.rows[1]).toMatchObject({ antes: { estado: "propuesto" }, despues: { estado: "aprobado" }, motivo: "los seis campos están y Carlos existe", implica: "ocupa 1 de 3 frentes", actor_id: U_C });
    const a = await base().query<{ estado: string; aprobador_id: string; tiene_fecha: boolean }>("select estado, aprobador_id, aprobado_at is not null as tiene_fecha from actions where id = $1", [ACC_A]);
    expect(a.rows[0]).toEqual({ estado: "aprobado", aprobador_id: U_C, tiene_fecha: true });
  });

  it("la línea base que referencia la acción sigue siendo la versión 1 aunque se vuelva a congelar: la corrección no altera la referencia", async () => {
    await base().query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 45000}'::jsonb, '{}'::jsonb, 'costos completos tras conciliar', null)", [EMP_A]);
    const r = await base().query<{ version: number; vigente: boolean }>("select m.version, m.vigente from actions a join mediciones m on m.id = a.linea_base_id where a.id = $1", [ACC_A]);
    expect(r.rows[0]).toEqual({ version: 1, vigente: false });
  });
});

describe("Postgres embebido (PGlite), no Supabase: los checks y las claves foráneas", () => {
  it("un estado inventado no entra; los ocho de Dirección y los cuatro antiguos sí", async () => {
    expect(await rechaza("insert into actions (company_id, accion, estado) values ($1, 'x', 'terminada')", [EMP_A])).toMatch(/check/i);
    for (const e of ["propuesto", "aprobado", "en_ejecucion", "reportado", "verificado", "rechazado", "pospuesto", "bloqueado", "pendiente", "en_curso", "hecho", "descartado"]) {
      await base().query("insert into actions (company_id, accion, estado) values ($1, $2, $3)", [EMP_B, `prueba ${e}`, e]);
    }
    const n = await base().query<{ n: number }>("select count(*)::int as n from actions where company_id = $1 and accion like 'prueba %'", [EMP_B]);
    expect(n.rows[0].n).toBe(12);
  });
  it("una acción de historial inventada no entra", async () => {
    expect(await rechaza("insert into accion_historial (action_id, accion) values ($1, 'borrar')", [ACC_A])).toMatch(/check/i);
  });
  it("el responsable tiene que existir en participants y la línea base en mediciones", async () => {
    expect(await rechaza("insert into actions (company_id, accion, responsable_participant_id) values ($1, 'x', '00000000-0000-4000-8000-00000000dead')", [EMP_A])).toMatch(/foreign key/i);
    expect(await rechaza("insert into actions (company_id, accion, linea_base_id) values ($1, 'x', '00000000-0000-4000-8000-00000000dead')", [EMP_A])).toMatch(/foreign key/i);
  });
  it("companies.limite_frentes nace en 3 y solo admite de 1 a 10", async () => {
    const r = await base().query<{ limite_frentes: number }>("select limite_frentes from companies where id = $1", [EMP_A]);
    expect(r.rows[0].limite_frentes).toBe(3);
    expect(await rechaza("update companies set limite_frentes = 0 where id = $1", [EMP_A])).toMatch(/check/i);
    expect(await rechaza("update companies set limite_frentes = 11 where id = $1", [EMP_A])).toMatch(/check/i);
    await base().query("update companies set limite_frentes = 5 where id = $1", [EMP_A]);
    await base().query("update companies set limite_frentes = 3 where id = $1", [EMP_A]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: el dueño lee su historial y no el ajeno (RLS)", () => {
  it("preparación: una acción con historial en la empresa B", async () => {
    await base().query("insert into actions (id, company_id, accion, estado) values ($1, $2, 'Cobrar a los 30 días', 'aprobado')", [ACC_B, EMP_B]);
    await base().query("insert into accion_historial (action_id, accion, antes, despues, motivo, actor_rol) values ($1, 'aprobar', '{\"estado\":\"propuesto\"}'::jsonb, '{\"estado\":\"aprobado\"}'::jsonb, 'motivo de B', 'consultor')", [ACC_B]);
  });
  it("la dueña de A ve las 2 filas de su acción y ninguna de B; el dueño de B, la suya", async () => {
    const a = await consultarComo<{ action_id: string; accion: string }>(base(), "authenticated", U_A, "select action_id, accion from accion_historial order by created_at");
    expect(a.map((f) => f.action_id)).toEqual([ACC_A, ACC_A]);
    const b = await consultarComo<{ action_id: string; motivo: string }>(base(), "authenticated", U_B, "select action_id, motivo from accion_historial");
    expect(b).toEqual([{ action_id: ACC_B, motivo: "motivo de B" }]);
  });
  it("el dueño no escribe en el historial (la ruta lo hace con la service role); la consultora y la service role ven todo", async () => {
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into accion_historial (action_id, accion, motivo, actor_rol) values ($1, 'comentar', 'colado', 'cliente')", [ACC_A])
    ).rejects.toThrow(/row-level security|permission denied/); // desde migracion-acciones-solo-por-la-api.sql el rechazo llega antes: el rol del navegador ni siquiera tiene permiso de escritura
    const c = await consultarComo<{ n: number }>(base(), "authenticated", U_C, "select count(*)::int as n from accion_historial");
    expect(c[0].n).toBe(3);
    const s = await consultarComo<{ n: number }>(base(), "service_role", null, "select count(*)::int as n from accion_historial");
    expect(s[0].n).toBe(3);
    const anon = await consultarComo<{ n: number }>(base(), "anon", null, "select count(*)::int as n from accion_historial");
    expect(anon[0].n).toBe(0);
  });
});

describe("Postgres embebido (PGlite), no Supabase: lo que decide la máquina de estados se escribe tal cual en el esquema real", () => {
  const CONSULTORA: Actor = { id: U_C, rol: "consultor" };
  const ACC_V = "000000aa-0000-4000-8000-00000000aaa2"; // reportada, a la espera de que la consultora la compruebe
  const ACC_P = "000000aa-0000-4000-8000-00000000aaa3"; // aprobada sin la marca de prioridad
  type Frente = Pick<AccionPlan, "id" | "accion" | "estado" | "es_prioridad" | "verificado_at">;

  /** Escribe en SQL exactamente lo que devolvió la regla pura: las mismas columnas y la misma fila de historial. */
  async function escribir(r: Extract<ResultadoTransicion, { ok: true }>): Promise<void> {
    const columnas = Object.keys(r.cambios);
    await base().query(
      `update actions set ${columnas.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
      [r.historial.action_id, ...columnas.map((c) => r.cambios[c])]
    );
    await base().query(
      "insert into accion_historial (action_id, accion, antes, despues, motivo, implica, actor_id, actor_rol) values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)",
      [r.historial.action_id, r.historial.accion, JSON.stringify(r.historial.antes), JSON.stringify(r.historial.despues), r.historial.motivo, r.historial.implica, r.historial.actor_id, r.historial.actor_rol]
    );
  }

  /** Las acciones de la empresa y su límite, leídos de esta base: lo mismo que `leerFrentes` pide por PostgREST. */
  async function frentesDe(empresa: string): Promise<{ acciones: Frente[]; limite: number }> {
    const filas = await base().query<Frente>("select id, accion, estado, es_prioridad, verificado_at from actions where company_id = $1", [empresa]);
    const lim = await base().query<{ limite_frentes: number }>("select limite_frentes from companies where id = $1", [empresa]);
    return { acciones: filas.rows, limite: lim.rows[0].limite_frentes };
  }

  it("verificar: sin prueba la regla no devuelve nada que escribir; con prueba la fila queda verificada con quién, cuándo y la nota, y el historial lo dice", async () => {
    await base().query("insert into actions (id, company_id, accion, estado, reportado_at, reportado_por) values ($1, $2, 'Cerrar caja a diario', 'reportado', now(), $3)", [ACC_V, EMP_A, U_A]);
    const a = accionVacia({ id: ACC_V, company_id: EMP_A, accion: "Cerrar caja a diario", estado: "reportado" });
    expect(transicion(a, "verificar", CONSULTORA, { evidencia: { pruebas: 0, indicadorPosterior: false } })).toEqual({ ok: false, error: "reportado no es verificado: falta evidencia" });

    const con = transicion(a, "verificar", CONSULTORA, { evidencia: { pruebas: 1, indicadorPosterior: false }, motivo: "la foto muestra el cuaderno de caja firmado" });
    if (!con.ok) throw new Error(con.error);
    await escribir(con);
    const fila = await base().query<{ estado: string; verificado_por: string; con_fecha: boolean; verificado_nota: string }>(
      "select estado, verificado_por, verificado_at is not null as con_fecha, verificado_nota from actions where id = $1",
      [ACC_V]
    );
    expect(fila.rows[0]).toEqual({ estado: "verificado", verificado_por: U_C, con_fecha: true, verificado_nota: "la foto muestra el cuaderno de caja firmado" });
    const h = await base().query<{ accion: string; antes: { estado: string }; despues: { estado: string; verificado_por: string }; actor_id: string; actor_rol: string }>(
      "select accion, antes, despues, actor_id, actor_rol from accion_historial where action_id = $1",
      [ACC_V]
    );
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ accion: "verificar", antes: { estado: "reportado" }, despues: { estado: "verificado", verificado_por: U_C }, actor_id: U_C, actor_rol: "consultor" });
  });

  it("quien verifica tiene que ser una persona que existe: un identificador inventado no entra", async () => {
    expect(await rechaza("update actions set verificado_por = '00000000-0000-4000-8000-00000000dead' where id = $1", [ACC_V])).toMatch(/foreign key/i);
  });

  it("marcar prioridad una acción ya aprobada: con tres frentes abiertos en esta base la regla la para y los nombra; con límite 5 entra y deja su fila de historial", async () => {
    await base().query(
      "insert into actions (id, company_id, accion, estado, es_prioridad) values ($1, $2, 'Poner precios a la vista', 'aprobado', false), (gen_random_uuid(), $2, 'Separar la cuenta personal', 'en_ejecucion', true), (gen_random_uuid(), $2, 'Cobrar al entregar', 'reportado', true)",
      [ACC_P, EMP_A]
    );
    const a = accionVacia({ id: ACC_P, company_id: EMP_A, accion: "Poner precios a la vista", estado: "aprobado", es_prioridad: false });
    const pedido = { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", cambios: { es_prioridad: true } };

    const lleno = transicion(a, "modificar", CONSULTORA, { ...pedido, frentes: await frentesDe(EMP_A) });
    expect(lleno.ok).toBe(false);
    if (!lleno.ok) {
      expect(lleno.error).toMatch(/Ya hay 3 prioridades abiertas y el límite es 3/);
      for (const nombre of ["«Cotizar sin el dueño»", "«Separar la cuenta personal»", "«Cobrar al entregar»"]) expect(lleno.error).toContain(nombre);
    }
    const intacta = await base().query<{ es_prioridad: boolean; n: number }>("select es_prioridad, (select count(*)::int from accion_historial where action_id = $1) as n from actions where id = $1", [ACC_P]);
    expect(intacta.rows[0]).toEqual({ es_prioridad: false, n: 0 });

    await base().query("update companies set limite_frentes = 5 where id = $1", [EMP_A]);
    const cabe = transicion(a, "modificar", CONSULTORA, { ...pedido, frentes: await frentesDe(EMP_A) });
    if (!cabe.ok) throw new Error(cabe.error);
    await escribir(cabe);
    const marcada = await base().query<{ estado: string; es_prioridad: boolean }>("select estado, es_prioridad from actions where id = $1", [ACC_P]);
    expect(marcada.rows[0]).toEqual({ estado: "aprobado", es_prioridad: true });
    const h = await base().query<{ accion: string; antes: Record<string, unknown>; despues: Record<string, unknown>; motivo: string; implica: string }>(
      "select accion, antes, despues, motivo, implica from accion_historial where action_id = $1",
      [ACC_P]
    );
    expect(h.rows).toEqual([{ accion: "modificar", antes: { estado: "aprobado", es_prioridad: false }, despues: { estado: "aprobado", es_prioridad: true }, motivo: "el dueño la quiere primero", implica: "ocupa un frente más" }]);
    await base().query("update companies set limite_frentes = 3 where id = $1", [EMP_A]);
  });

  it("la puerta por «bloqueado»: aprobada sin marca → bloquear → marcar prioridad → desbloquear. Con los frentes de esta base llenos no vuelve; con límite 5 vuelve, y el esquema acepta cada paso con su fila de historial", async () => {
    const ACC_D = "000000aa-0000-4000-8000-00000000aaa4";
    const DUENA: Actor = { id: U_A, rol: "cliente" };
    await base().query("insert into actions (id, company_id, accion, estado, es_prioridad) values ($1, $2, 'Ordenar el almacén', 'aprobado', false)", [ACC_D, EMP_A]);
    let a = accionVacia({ id: ACC_D, company_id: EMP_A, accion: "Ordenar el almacén", estado: "aprobado", es_prioridad: false });
    /** Escribe lo que decidió la regla y deja `a` como quedó la fila, igual que hace escribirTransicion. */
    const aplicar = async (r: ResultadoTransicion): Promise<void> => {
      if (!r.ok) throw new Error(r.error);
      await escribir(r);
      a = { ...a, ...(r.cambios as Partial<AccionPlan>) };
    };

    // La dueña la bloquea; bloqueada, la consultora la marca prioridad (no ocupa frente todavía: entra sin contar).
    await aplicar(transicion(a, "bloquear", DUENA, { motivo: "falta la llave del almacén" }));
    await aplicar(transicion(a, "modificar", CONSULTORA, { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", cambios: { es_prioridad: true } }));
    const bloqueada = await base().query<{ estado: string; es_prioridad: boolean; bloqueo: string | null }>("select estado, es_prioridad, bloqueo from actions where id = $1", [ACC_D]);
    expect(bloqueada.rows[0]).toEqual({ estado: "bloqueado", es_prioridad: true, bloqueo: "falta la llave del almacén" });

    // El estado previo sale del historial, con la misma pregunta que hace aplicarTransicion por PostgREST.
    const previo = await base().query<{ estado: Estado }>("select antes->>'estado' as estado from accion_historial where action_id = $1 and accion = 'bloquear' order by created_at desc limit 1", [ACC_D]);
    expect(previo.rows[0].estado).toBe("aprobado");

    // En esta base ya hay cuatro prioridades abiertas (la prueba anterior marcó una con el límite en 5): no cabe.
    const lleno = transicion(a, "desbloquear", DUENA, { estadoPrevio: previo.rows[0].estado, frentes: await frentesDe(EMP_A) });
    expect(lleno.ok).toBe(false);
    if (!lleno.ok) {
      expect(lleno.error).toMatch(/^Ya hay 4 prioridades abiertas y el límite es 3: /);
      for (const nombre of ["«Cotizar sin el dueño»", "«Separar la cuenta personal»", "«Cobrar al entregar»", "«Poner precios a la vista»"]) expect(lleno.error).toContain(nombre);
      // A la dueña no se le manda a quitar una marca que no está en su pantalla.
      expect(lleno.error).toMatch(/escríbele a tu consultora para decidir cuál va primero\.$/);
    }
    const intacta = await base().query<{ estado: string; n: number }>("select estado, (select count(*)::int from accion_historial where action_id = $1) as n from actions where id = $1", [ACC_D]);
    expect(intacta.rows[0]).toEqual({ estado: "bloqueado", n: 2 });

    await base().query("update companies set limite_frentes = 5 where id = $1", [EMP_A]);
    await aplicar(transicion(a, "desbloquear", DUENA, { estadoPrevio: previo.rows[0].estado, frentes: await frentesDe(EMP_A) }));
    const vuelta = await base().query<{ estado: string; es_prioridad: boolean; bloqueo: string | null; bloqueado_at: string | null }>("select estado, es_prioridad, bloqueo, bloqueado_at from actions where id = $1", [ACC_D]);
    expect(vuelta.rows[0]).toEqual({ estado: "aprobado", es_prioridad: true, bloqueo: null, bloqueado_at: null });
    const h = await base().query<{ accion: string; actor_rol: string }>("select accion, actor_rol from accion_historial where action_id = $1 order by created_at", [ACC_D]);
    expect(h.rows).toEqual([{ accion: "bloquear", actor_rol: "cliente" }, { accion: "modificar", actor_rol: "consultor" }, { accion: "desbloquear", actor_rol: "cliente" }]);
    await base().query("update companies set limite_frentes = 3 where id = $1", [EMP_A]);
  });
});

/**
 * FINANZAS SOBRE POSTGRES EMBEBIDO (PGlite), NO SUPABASE (19-10-2026).
 *
 * Lo que tiene que ser verdad en la base, sin pasar por la aplicación:
 *  - el navegador no lee ni escribe nada de fin_* ni ejecuta sus funciones;
 *  - LA CAJA ALIMENTA A «TUS NÚMEROS»: cada movimiento recalcula en company_metricas las cifras de su mes (origen
 *    'caja') según el destino de su categoría, y las de hoy (caja, lo que te deben, lo que debes);
 *  - nunca se suman soles con dólares: los dólares de un mes entran en soles solo con el mes cerrado y su tipo de cambio;
 *  - un mes cerrado no se mueve (ni cambiándole la fecha a un movimiento), no se cierra el mes en curso y reabrir pide motivo;
 *  - LA CAJA MANDA: un documento o un formulario no pisa una cifra que sale de la caja; lo otro queda al lado;
 *  - pagar un cobro o algo que se repite es una sola operación: el pago y su movimiento nacen y mueren juntos;
 *  - la reversión retira sin perder filas y la migración vuelve a aplicar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { aplicarArchivo, baseConEsquema, consultarComo, CARPETA_SUPABASE } from "./aplicar";

const MIGRACION = path.join(CARPETA_SUPABASE, "migracion-finanzas.sql");
const REVERSION = path.join(CARPETA_SUPABASE, "revertir", "migracion-finanzas.sql");
const TABLAS = ["fin_categorias", "fin_saldos_iniciales", "fin_movimientos", "fin_cierres", "fin_cobros", "fin_cobro_pagos", "fin_pagos_recurrentes", "fin_pagos_hechos"] as const;

const U_ROSA = "00000000-0000-4000-8000-0000000000f1";
const EMP = "0000000f-0000-4000-8000-00000000000a";
const EMP_B = "0000000f-0000-4000-8000-00000000000b";

let pg: PGlite;
const uno = async <T,>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0]!;
const cat = async (empresa: string, nombre: string) => (await uno<{ id: string }>("select id from fin_categorias where company_id = $1 and nombre = $2", [empresa, nombre])).id;
const metrica = async (empresa: string, clave: string, periodo: string) =>
  (await pg.query<{ valor: string | null; origen: string | null; estado: string; nota: string | null; cifra_desplazada: Record<string, unknown> | null }>(
    "select valor::text as valor, origen, estado, nota, cifra_desplazada from company_metricas where company_id = $1 and clave = $2 and periodo = $3",
    [empresa, clave, periodo]
  )).rows;
const mover = (empresa: string, fecha: string, tipo: "ingreso" | "egreso", categoria: string, monto: number, moneda = "PEN") =>
  pg.query<{ id: string }>("insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto, moneda) values ($1, $2, $3, $4, $5, $6) returning id", [empresa, fecha, tipo, categoria, monto, moneda]);
const falla = async (p: Promise<unknown>, patron: RegExp) => {
  await expect(p).rejects.toThrow(patron);
};

let HOY: string;

beforeAll(async () => {
  ({ pg } = await baseConEsquema());
  HOY = (await uno<{ hoy: string }>("select ((now() at time zone 'America/Lima')::date)::text as hoy")).hoy;
  await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'rosa@fin.prueba', '{}')", [U_ROSA]);
  await pg.query("insert into companies (id, nombre) values ($1, 'Distribuidora Ficticia'), ($2, 'Textiles Ficticios')", [EMP, EMP_B]);
  await pg.query("select fin_asegurar_categorias($1)", [EMP]);
  await pg.query("select fin_asegurar_categorias($1)", [EMP_B]);
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe("Finanzas en Postgres embebido: tablas y permisos", () => {
  it("las 8 tablas fin_* existen con RLS y el navegador no las lee ni las escribe", async () => {
    for (const t of TABLAS) {
      expect((await uno<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = $1", [t])).rls, t).toBe(true);
      await falla(consultarComo(pg, "authenticated", U_ROSA, `select * from ${t}`), /permission denied/);
      await falla(consultarComo(pg, "anon", null, `select * from ${t}`), /permission denied/);
    }
  });

  it("las operaciones solo las ejecuta el servidor", async () => {
    await falla(consultarComo(pg, "authenticated", U_ROSA, "select fin_cerrar_mes($1, '2026-01-01', null, null, null)", [EMP]), /permission denied/);
    await falla(consultarComo(pg, "authenticated", U_ROSA, "select fin_registrar_pago_cobro(gen_random_uuid(), 1, current_date, null, null)"), /permission denied/);
  });

  it("las categorías iniciales se crean una sola vez, con su destino en «Tus números»", async () => {
    await pg.query("select fin_asegurar_categorias($1)", [EMP]);
    const { rows } = await pg.query<{ destino: string; n: number }>("select destino, count(*)::int as n from fin_categorias where company_id = $1 group by destino order by destino", [EMP]);
    expect(rows).toEqual([
      { destino: "costo_variable", n: 3 },
      { destino: "gasto_fijo", n: 6 },
      { destino: "ninguno", n: 5 },
      { destino: "venta", n: 2 },
    ]);
    // Un ingreso no es costo ni gasto, y un egreso no es venta.
    await falla(pg.query("insert into fin_categorias (company_id, nombre, tipo, destino) values ($1, 'Raro', 'ingreso', 'gasto_fijo')", [EMP]), /check/);
    await falla(pg.query("insert into fin_categorias (company_id, nombre, tipo, destino) values ($1, 'Raro', 'egreso', 'venta')", [EMP]), /check/);
  });
});

describe("La caja alimenta a «Tus números»", () => {
  it("cada movimiento recalcula las cifras de su mes según el destino de su categoría", async () => {
    await mover(EMP, "2026-08-05", "ingreso", await cat(EMP, "Venta en tienda"), 1000);
    await mover(EMP, "2026-08-06", "egreso", await cat(EMP, "Mercadería e insumos"), 400);
    await mover(EMP, "2026-08-07", "egreso", await cat(EMP, "Alquiler"), 200);
    await mover(EMP, "2026-08-08", "egreso", await cat(EMP, "Retiro del dueño"), 100); // no es gasto
    await mover(EMP, "2026-08-09", "ingreso", await cat(EMP, "Préstamo recibido"), 500); // no es venta
    const venta = await metrica(EMP, "venta_mes", "2026-08");
    expect(venta).toHaveLength(1);
    expect(venta[0]).toMatchObject({ valor: "1000.00", origen: "caja", estado: "contado" });
    expect((await metrica(EMP, "costo_variable_mes", "2026-08"))[0]!.valor).toBe("400.00");
    expect((await metrica(EMP, "gasto_fijo_mes", "2026-08"))[0]!.valor).toBe("200.00");
    expect((await metrica(EMP, "ganancia_mes", "2026-08"))[0]!.valor).toBe("400.00");
  });

  it("los dólares no se suman con soles: entran en soles al cerrar el mes con su tipo de cambio", async () => {
    await mover(EMP, "2026-08-10", "ingreso", await cat(EMP, "Venta al por mayor"), 100, "USD");
    const abierta = (await metrica(EMP, "venta_mes", "2026-08"))[0]!;
    expect(abierta.valor).toBe("1000.00");
    expect(abierta.nota).toMatch(/Sin los dólares/);
    await falla(pg.query("select fin_cerrar_mes($1, '2026-08-01', null, null, null)", [EMP]), /tuvo dólares/);
    await pg.query("select fin_cerrar_mes($1, '2026-08-01', 3.75, 'SBS 31/08', $2)", [EMP, U_ROSA]);
    expect((await metrica(EMP, "venta_mes", "2026-08"))[0]!.valor).toBe("1375.00");
    expect((await metrica(EMP, "ganancia_mes", "2026-08"))[0]!.valor).toBe("775.00");
  });

  it("un mes cerrado no se mueve, ni cambiándole la fecha a un movimiento; reabrir pide un motivo escrito", async () => {
    await falla(mover(EMP, "2026-08-20", "ingreso", await cat(EMP, "Venta en tienda"), 50), /está cerrado/);
    const sep = (await mover(EMP, "2026-09-03", "ingreso", await cat(EMP, "Venta en tienda"), 300)).rows[0]!.id;
    await falla(pg.query("update fin_movimientos set fecha = '2026-08-30' where id = $1", [sep]), /está cerrado/);
    await falla(pg.query("delete from fin_movimientos where company_id = $1 and fecha = '2026-08-05'", [EMP]), /está cerrado/);
    await falla(pg.query("select fin_cerrar_mes($1, '2026-08-01', 3.8, 'SBS', null)", [EMP]), /ya está cerrado/);
    await falla(pg.query("select fin_reabrir_mes($1, '2026-08-01', 'corto', null)", [EMP]), /al menos diez/);
    await pg.query("select fin_reabrir_mes($1, '2026-08-01', 'Faltó registrar una venta del 20', $2)", [EMP, U_ROSA]);
    // Reabierto, los dólares vuelven a quedar fuera hasta el próximo cierre.
    expect((await metrica(EMP, "venta_mes", "2026-08"))[0]!.valor).toBe("1000.00");
    await mover(EMP, "2026-08-20", "ingreso", await cat(EMP, "Venta en tienda"), 50);
    expect((await metrica(EMP, "venta_mes", "2026-08"))[0]!.valor).toBe("1050.00");
  });

  it("el mes en curso no se cierra", async () => {
    await falla(pg.query("select fin_cerrar_mes($1, $2::date, null, null, null)", [EMP, HOY]), /no ha terminado/);
  });

  it("un mes que se queda sin movimientos deja de salir de la caja", async () => {
    const id = (await mover(EMP_B, "2026-06-15", "ingreso", await cat(EMP_B, "Venta en tienda"), 800)).rows[0]!.id;
    expect((await metrica(EMP_B, "venta_mes", "2026-06"))[0]!.origen).toBe("caja");
    await pg.query("delete from fin_movimientos where id = $1", [id]);
    expect(await metrica(EMP_B, "venta_mes", "2026-06")).toEqual([]);
  });
});

describe("La caja manda", () => {
  it("un documento no pisa la cifra de la caja: queda al lado como extraída", async () => {
    await pg.query(
      "update company_metricas set valor = 999, estado = 'extraido', origen = 'extraido', nota = 'leído del estado de cuenta' where company_id = $1 and clave = 'venta_mes' and periodo = '2026-08'",
      [EMP]
    );
    const fila = (await metrica(EMP, "venta_mes", "2026-08"))[0]!;
    expect(fila).toMatchObject({ valor: "1050.00", origen: "caja", estado: "contado" });
    expect(fila.cifra_desplazada).toMatchObject({ lado: "extraido", valor: 999 });
  });

  it("una fila nueva para el mismo número y mes no entra: si es de un documento, queda al lado", async () => {
    await pg.query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'costo_variable_mes', '2026-08', 444, 'extraido', 'extraido')", [EMP]);
    const filas = await metrica(EMP, "costo_variable_mes", "2026-08");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ valor: "400.00", origen: "caja" });
    expect(filas[0]!.cifra_desplazada).toMatchObject({ lado: "extraido", valor: 444 });
  });

  it("confirmar la misma cifra (conciliarla) sí se deja", async () => {
    await pg.query("update company_metricas set estado = 'verificado', origen = 'conciliado' where company_id = $1 and clave = 'gasto_fijo_mes' and periodo = '2026-08'", [EMP]);
    expect((await metrica(EMP, "gasto_fijo_mes", "2026-08"))[0]).toMatchObject({ valor: "200.00", origen: "conciliado", estado: "verificado" });
  });

  it("la cifra de un documento que ya estaba se conserva al lado, y vuelve a su sitio si el mes se queda sin caja", async () => {
    await pg.query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen, nota) values ($1, 'venta_mes', '2026-07', 5000, 'extraido', 'extraido', 'del libro de ventas')", [EMP_B]);
    const id = (await mover(EMP_B, "2026-07-10", "ingreso", await cat(EMP_B, "Venta en tienda"), 4200)).rows[0]!.id;
    const con = (await metrica(EMP_B, "venta_mes", "2026-07"))[0]!;
    expect(con).toMatchObject({ valor: "4200.00", origen: "caja" });
    expect(con.cifra_desplazada).toMatchObject({ lado: "extraido", valor: 5000 });
    await pg.query("delete from fin_movimientos where id = $1", [id]);
    expect((await metrica(EMP_B, "venta_mes", "2026-07"))[0]).toMatchObject({ valor: "5000", origen: "extraido", estado: "extraido", nota: "del libro de ventas", cifra_desplazada: null });
  });
});

describe("Pagar es una sola operación", () => {
  let cobro: string;

  it("el pago de un cobro entra solo a la caja y baja lo que te deben", async () => {
    cobro = (await uno<{ id: string }>(
      "insert into fin_cobros (company_id, cliente, concepto, total, emitido, vence, categoria_id) values ($1, 'Ferretería El Sol', 'pedido 2231', 1000, '2026-09-01', '2026-09-30', $2) returning id",
      [EMP, await cat(EMP, "Venta al por mayor")]
    )).id;
    expect((await metrica(EMP, "deuda_clientes", "actual"))[0]!.valor).toBe("1000.00");
    const pago = (await uno<{ id: string }>("select fin_registrar_pago_cobro($1, 400, '2026-09-10', 'transferencia', $2) as id", [cobro, U_ROSA])).id;
    const mov = await uno<{ tipo: string; origen: string; monto: string; moneda: string }>(
      "select m.tipo, m.origen, m.monto::text as monto, m.moneda from fin_cobro_pagos p join fin_movimientos m on m.id = p.movimiento_id where p.id = $1",
      [pago]
    );
    expect(mov).toEqual({ tipo: "ingreso", origen: "cobro", monto: "400.00", moneda: "PEN" });
    expect((await metrica(EMP, "deuda_clientes", "actual"))[0]!.valor).toBe("600.00");
    expect((await metrica(EMP, "venta_mes", "2026-09"))[0]!.valor).toBe("700.00"); // 300 de tienda + 400 cobrados
  });

  it("no se cobra de más, ni con fecha futura, ni antes de emitir", async () => {
    await falla(pg.query("select fin_registrar_pago_cobro($1, 700, '2026-09-11', null, null)", [cobro]), /más que el total/);
    await falla(pg.query("select fin_registrar_pago_cobro($1, 10, ($2::date + 1), null, null)", [cobro, HOY]), /futura/);
    await falla(pg.query("select fin_registrar_pago_cobro($1, 10, '2026-08-31', null, null)", [cobro]), /anterior a la emisión/);
    await falla(pg.query("select fin_registrar_pago_cobro($1, 10.555, '2026-09-11', null, null)", [cobro]), /dos decimales/);
  });

  it("lo que entró solo no se escribe ni se borra a mano en la caja; el detalle sí se corrige", async () => {
    const mov = (await uno<{ id: string }>("select movimiento_id as id from fin_cobro_pagos where cobro_id = $1", [cobro])).id;
    await falla(pg.query("insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto, origen) values ($1, '2026-09-12', 'ingreso', $2, 5, 'cobro')", [EMP, await cat(EMP, "Venta al por mayor")]), /lo pone el sistema/);
    await falla(pg.query("update fin_movimientos set monto = 1 where id = $1", [mov]), /los manda ese pago/);
    await falla(pg.query("delete from fin_movimientos where id = $1", [mov]), /anulando ese pago/);
    await pg.query("update fin_movimientos set detalle = 'Abono de El Sol' where id = $1", [mov]);
  });

  it("anular el pago se lleva su ingreso y lo que te deben vuelve a subir", async () => {
    const pago = (await uno<{ id: string }>("select id from fin_cobro_pagos where cobro_id = $1", [cobro])).id;
    await pg.query("select fin_anular_pago_cobro($1)", [pago]);
    expect((await uno<{ n: number }>("select count(*)::int as n from fin_movimientos where origen = 'cobro' and company_id = $1", [EMP])).n).toBe(0);
    expect((await metrica(EMP, "deuda_clientes", "actual"))[0]!.valor).toBe("1000.00");
    expect((await metrica(EMP, "venta_mes", "2026-09"))[0]!.valor).toBe("300.00");
  });

  it("pagar algo que se repite: egreso, ciclo pagado y próximo vencimiento juntos (el 31 cae en el último día del mes)", async () => {
    const pago = (await uno<{ id: string }>(
      "insert into fin_pagos_recurrentes (company_id, nombre, monto, categoria_id, dia, proximo_vencimiento) values ($1, 'Alquiler del local', 300, $2, 31, '2026-08-31') returning id",
      [EMP_B, await cat(EMP_B, "Alquiler")]
    )).id;
    await pg.query("select fin_pagar_recurrente($1, 300, '2026-08-31', null)", [pago]);
    expect((await uno<{ v: string }>("select proximo_vencimiento::text as v from fin_pagos_recurrentes where id = $1", [pago])).v).toBe("2026-09-30");
    expect((await metrica(EMP_B, "gasto_fijo_mes", "2026-08"))[0]!.valor).toBe("300.00");
    const segundo = (await uno<{ id: string }>("select fin_pagar_recurrente($1, 300, '2026-09-30', null) as id", [pago])).id;
    expect((await uno<{ v: string }>("select proximo_vencimiento::text as v from fin_pagos_recurrentes where id = $1", [pago])).v).toBe("2026-10-31");
    const primero = (await uno<{ id: string }>("select id from fin_pagos_hechos where pago_id = $1 and ciclo = '2026-08-31'", [pago])).id;
    await falla(pg.query("select fin_anular_pago_hecho($1)", [primero]), /último pago/);
    await pg.query("select fin_anular_pago_hecho($1)", [segundo]);
    expect((await uno<{ v: string }>("select proximo_vencimiento::text as v from fin_pagos_recurrentes where id = $1", [pago])).v).toBe("2026-09-30");
    expect(await metrica(EMP_B, "gasto_fijo_mes", "2026-09")).toEqual([]);
    expect((await metrica(EMP_B, "deuda_propia", "actual"))[0]!.origen).toBe("caja");
  });

  it("el dinero en caja hoy sale del saldo inicial más lo que entró menos lo que salió, en soles", async () => {
    await pg.query("insert into fin_saldos_iniciales (company_id, moneda, monto, fecha) values ($1, 'PEN', 5000, '2026-08-01')", [EMP]);
    const esperado = await uno<{ v: string }>(
      "select (5000 + sum(case when tipo = 'ingreso' then monto else -monto end))::numeric(14,2)::text as v from fin_movimientos where company_id = $1 and moneda = 'PEN' and fecha >= '2026-08-01'",
      [EMP]
    );
    expect((await metrica(EMP, "caja_hoy", "actual"))[0]).toMatchObject({ valor: esperado.v, origen: "caja" });
  });
});

describe("Aplicar dos veces, retirar y volver a aplicar", () => {
  it("la migración se aplica otra vez sin error y sin duplicar nada", async () => {
    const antes = (await uno<{ n: number }>("select count(*)::int as n from fin_movimientos")).n;
    await aplicarArchivo(pg, MIGRACION);
    expect((await uno<{ n: number }>("select count(*)::int as n from fin_movimientos")).n).toBe(antes);
  });

  it("la reversión retira las tablas sin perder filas, quita que la caja mande, y la migración vuelve a aplicar", async () => {
    const antes = (await uno<{ n: number }>("select count(*)::int as n from fin_movimientos")).n;
    await aplicarArchivo(pg, REVERSION);
    expect((await uno<{ n: number }>("select count(*)::int as n from fin_movimientos_retirada")).n).toBe(antes);
    // Sin el disparador, una cifra que salía de la caja ya se puede corregir como cualquier otra.
    await pg.query("update company_metricas set valor = 1, origen = 'declarado' where company_id = $1 and clave = 'venta_mes' and periodo = '2026-08'", [EMP]);
    expect((await metrica(EMP, "venta_mes", "2026-08"))[0]!.valor).toBe("1");
    await aplicarArchivo(pg, MIGRACION);
    expect((await uno<{ n: number }>("select count(*)::int as n from fin_movimientos")).n).toBe(0);
  });
});

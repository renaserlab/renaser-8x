/**
 * FINANZAS · UNA EMPRESA QUE USÓ FINANZAS SE PUEDE ELIMINAR (PGlite, no Supabase; 19-10-2026).
 *
 * Lo encontró la semilla demo al volver a sembrar: borrar la empresa (DELETE en companies, como hacen
 * src/app/api/companies/[id]/route.ts y eliminar-lote) se llevaba en cascada sus movimientos, y los disparadores de la
 * caja lo frenaban: «El mes de 09/2026 está cerrado» (un mes cerrado no se mueve) o «Este movimiento entró solo desde
 * un cobro» (lo automático no se borra desde la caja). Y al borrar, las sincronizaciones querían volver a escribir sus
 * números en «Tus números» de una empresa que ya no existe.
 *
 * Ahora: con la empresa borrándose (ya no está en companies), todo lo suyo se va; con la empresa viva, las dos reglas
 * siguen igual.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema } from "./aplicar";

const U = "00000000-0000-4000-8000-0000000000f1";
const EMP = "0000000f-0000-4000-8000-0000000000c1";
const OTRA = "0000000f-0000-4000-8000-0000000000c2";
const TABLAS = ["fin_categorias", "fin_saldos_iniciales", "fin_movimientos", "fin_cierres", "fin_cobros", "fin_cobro_pagos", "fin_pagos_recurrentes", "fin_pagos_hechos"];

let pg: PGlite;
const uno = async <T,>(sql: string, p: unknown[] = []) => (await pg.query<T>(sql, p)).rows[0]!;
const cat = async (empresa: string, nombre: string) => (await uno<{ id: string }>("select id from fin_categorias where company_id = $1 and nombre = $2", [empresa, nombre])).id;
const cuantas = async (tabla: string, empresa: string) => (await uno<{ n: number }>(`select count(*)::int as n from ${tabla} where company_id = $1`, [empresa])).n;

/** Una empresa con todo lo que frenaba el borrado: saldo inicial, un mes cerrado con movimientos, un cobro pagado y un pago hecho. */
async function empresaConFinanzas(id: string, nombre: string): Promise<{ mesPasado: string; movimientoDeCobro: string }> {
  await pg.query("insert into companies (id, nombre) values ($1, $2)", [id, nombre]);
  await pg.query("select fin_asegurar_categorias($1)", [id]);
  const { mesPasado } = await uno<{ mesPasado: string }>("select (date_trunc('month', (now() at time zone 'America/Lima')::date) - interval '1 month')::date::text as \"mesPasado\"");
  await pg.query("insert into fin_saldos_iniciales (company_id, moneda, monto, fecha) values ($1, 'PEN', 1000, $2)", [id, mesPasado]);
  await pg.query("insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto) values ($1, $2, 'ingreso', $3, 500)", [id, mesPasado, await cat(id, "Venta en tienda")]);
  const cobro = (await uno<{ id: string }>("insert into fin_cobros (company_id, cliente, total, emitido, vence, categoria_id) values ($1, 'Ferretería El Sol', 300, $2, $2, $3) returning id", [id, mesPasado, await cat(id, "Venta en tienda")])).id;
  await pg.query("select fin_registrar_pago_cobro($1, 100, $2, 'efectivo', $3)", [cobro, mesPasado, U]);
  const pago = (await uno<{ id: string }>("insert into fin_pagos_recurrentes (company_id, nombre, monto, categoria_id, dia, proximo_vencimiento) values ($1, 'Alquiler', 200, $2, 5, $3) returning id", [id, await cat(id, "Alquiler"), mesPasado])).id;
  await pg.query("select fin_pagar_recurrente($1, 200, $2, $3)", [pago, mesPasado, U]);
  await pg.query("select fin_cerrar_mes($1, $2, null, null, $3)", [id, mesPasado, U]);
  const movimientoDeCobro = (await uno<{ id: string }>("select movimiento_id as id from fin_cobro_pagos where cobro_id = $1", [cobro])).id;
  return { mesPasado, movimientoDeCobro };
}

beforeAll(async () => {
  ({ pg } = await baseConEsquema());
  await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'rosa@fin.prueba', '{}')", [U]);
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe("Finanzas en Postgres embebido: borrar una empresa que usó Finanzas", () => {
  it("con la empresa viva, las reglas siguen: el mes cerrado no se mueve y lo automático no se borra desde la caja", async () => {
    const { movimientoDeCobro } = await empresaConFinanzas(OTRA, "Sigue viva");
    await expect(pg.query("delete from fin_movimientos where company_id = $1 and origen = 'manual'", [OTRA])).rejects.toThrow(/está cerrado/);
    await pg.query("select fin_reabrir_mes($1, (select mes from fin_cierres where company_id = $1 and reabierto_at is null), 'Probar que lo automático no se borra', $2)", [OTRA, U]);
    await expect(pg.query("delete from fin_movimientos where id = $1", [movimientoDeCobro])).rejects.toThrow(/entró solo desde un cobro/);
  });

  it("la empresa se elimina con todo lo suyo, aunque tenga un mes cerrado y movimientos de cobros y pagos", async () => {
    const { mesPasado } = await empresaConFinanzas(EMP, "Para borrar");
    expect(await cuantas("fin_movimientos", EMP)).toBe(3);
    expect(await uno<{ n: number }>("select count(*)::int as n from company_metricas where company_id = $1 and origen = 'caja' and periodo = $2", [EMP, mesPasado.slice(0, 7)])).toEqual({ n: 4 });
    await pg.query("delete from companies where id = $1", [EMP]);
    for (const t of [...TABLAS, "company_metricas"]) expect(await cuantas(t, EMP), t).toBe(0);
    // La otra empresa no se tocó.
    expect(await cuantas("fin_movimientos", OTRA)).toBe(3);
    expect(await cuantas("fin_cierres", OTRA)).toBe(1);
  });
});

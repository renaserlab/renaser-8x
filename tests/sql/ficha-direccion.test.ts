/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LA FICHA DE DIRECCIÓN SE VERSIONA SIN BORRAR Y EL DUEÑO SOLO VE LO ACORDADO.
 *
 * migracion-entrada-y-direccion.sql crea `ficha_direccion` con versión, estado (borrador, acordada, reemplazada),
 * quién la acordó y a cuál reemplaza. Aquí se comprueba sobre una base vacía, con el SQL real del repositorio:
 *
 *  - que el código de src/lib/ficha-direccion.ts (guardar un borrador, acordarlo, abrir otro y volver a acordar)
 *    escribe filas que la tabla acepta, con sus claves foráneas y su jsonb, y que nada se borra en el camino;
 *  - que unique(company_id, version) y el check de estado rechazan lo que deben;
 *  - que la revisión del borrador, guardada dentro del jsonb `dependencia`, hace de cerradura de verdad: un
 *    guardado con la revisión vieja no toca ninguna fila;
 *  - que las políticas RLS dejan al dueño leer solo las versiones ACORDADAS de SU empresa, y no escribir.
 *
 * Cómo corre el código real sin Supabase. `acordar` y `guardarBorrador` reciben un cliente con `.from()`. Aquí
 * se les da un adaptador mínimo que traduce las formas de consulta que usan (select con eq/order/limit,
 * insert … returning, update … where, y el filtro sobre un campo json `dependencia->>revision`, con eq o con
 * is null) a SQL sobre PGlite, con el rol de servicio (sin RLS), como lo haría `supabaseAdmin()`. Es un
 * adaptador de prueba: no es PostgREST y no prueba la capa HTTP ni Auth. Que PostgREST traduzca ese filtro json
 * igual que este adaptador NO está probado aquí: lo probado es que el SQL resultante cierra en Postgres.
 * Las políticas se prueban aparte con `consultarComo`, que pone el rol y los claims del JWT como haría PostgREST.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseConEsquema, consultarComo } from "./aplicar";
import {
  guardarBorrador, guardarFicha, actualizarBorrador, acordar, borradorVigente, acordadaVigente, historial, fichaVacia, agregarItem, descartarItem, editarDimension, vistaCliente,
  ReglaDeFicha, BorradorCambio, type Ficha,
} from "@/lib/ficha-direccion";
import { AccesoDenegado, type Perfil } from "@/lib/auth";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";

const CONSULTORA: Perfil = { id: U_C, email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor", autoridad: ["aprobar_hallazgo"] };
const DUENA: Perfil = { id: U_A, email: "duena-a@prueba.local", nombre: "Dueña A", rol: "cliente", autoridad: [] };

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
    await pg.query("insert into companies (id, nombre) values ($1, 'Taller Rojas (sintético)'), ($2, 'Estudio jurídico (sintético)')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
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

type Resultado = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Lo mínimo de `.from()` que usa la ficha, traducido a SQL. Los objetos van como JSON (la base los recibe en una
 * columna jsonb); los errores de Postgres vuelven en `error`, como en supabase-js, no como excepción.
 */
function clienteSobre(db: PGlite): Pick<SupabaseClient, "from"> {
  class Consulta implements PromiseLike<Resultado> {
    private op: "select" | "insert" | "update" = "select";
    private columnas = "*";
    private devuelve = "*";
    private fila: Record<string, unknown> = {};
    private filtros: [string, unknown, "eq" | "is"][] = [];
    private orden = "";
    private tope = "";
    private unico: "single" | "maybe" | null = null;
    constructor(private tabla: string) {}
    select(cols = "*") {
      if (this.op === "select") this.columnas = cols;
      else this.devuelve = cols;
      return this;
    }
    insert(f: Record<string, unknown>) { this.op = "insert"; this.fila = f; return this; }
    update(f: Record<string, unknown>) { this.op = "update"; this.fila = f; return this; }
    eq(c: string, v: unknown) { this.filtros.push([c, v, "eq"]); return this; }
    is(c: string, v: unknown) { this.filtros.push([c, v, "is"]); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.orden = ` order by ${c} ${o?.ascending === false ? "desc" : "asc"}`; return this; }
    limit(n: number) { this.tope = ` limit ${Number(n)}`; return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A = Resultado, B = never>(res?: ((v: Resultado) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return this.ejecutar().then(res, rej);
    }
    private async ejecutar(): Promise<Resultado> {
      const params: unknown[] = [];
      const p = (v: unknown) => {
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `$${params.length}`;
      };
      const claves = Object.keys(this.fila);
      let sql: string;
      if (this.op === "insert") sql = `insert into ${this.tabla} (${claves.join(", ")}) values (${claves.map((k) => p(this.fila[k])).join(", ")}) returning ${this.devuelve}`;
      else {
        const set = this.op === "update" ? `update ${this.tabla} set ${claves.map((k) => `${k} = ${p(this.fila[k])}`).join(", ")}` : `select ${this.columnas} from ${this.tabla}`;
        // `dependencia->>revision` (como lo escribe PostgREST) es `dependencia->>'revision'` en SQL; `is null` no lleva parámetro.
        const columna = (c: string) => {
          const partes = /^([a-z_]+)->>([a-z_]+)$/.exec(c);
          return partes ? `${partes[1]}->>'${partes[2]}'` : c;
        };
        const condicion = ([c, v, op]: [string, unknown, "eq" | "is"]) => (op === "is" && v === null ? `${columna(c)} is null` : `${columna(c)} = ${p(v)}`);
        const where = this.filtros.length ? ` where ${this.filtros.map(condicion).join(" and ")}` : "";
        sql = `${set}${where}${this.op === "select" ? `${this.orden}${this.tope}` : " returning *"}`;
      }
      try {
        const filas = (await db.query<Record<string, unknown>>(sql, params)).rows;
        if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `se esperaba una fila y hay ${filas.length}` } };
        if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
        return { data: filas, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code } };
      }
    }
  }
  return { from: (tabla: string) => new Consulta(tabla) } as unknown as Pick<SupabaseClient, "from">;
}

/** Una ficha con contenido de verdad: una frase que dijo el dueño, un acuerdo, una frase quitada y una dimensión descrita. */
function fichaDePrueba(): Ficha {
  let f = agregarItem(fichaVacia(), "limites", { texto: "No despido a nadie para crecer", tipo: "declaracion", actorId: U_C });
  f = agregarItem(f, "decisiones_pendientes", { texto: "Decidir si contrata un jefe de taller antes de marzo", tipo: "acuerdo", actorId: U_C });
  f = agregarItem(f, "fortalezas", { texto: "Frase que la consultora quitará", tipo: "interpretacion", actorId: U_C });
  f = descartarItem(f, "fortalezas", f.bloques.fortalezas[0].id, U_C);
  return editarDimension(f, "comercial", { que_se_detiene: "Las cotizaciones", aporta_valor: "Conoce a cada cliente de flota" }, U_C);
}

type FilaFicha = { id: string; version: number; estado: string; acordada_por: string | null; acordada_at: unknown; reemplaza_a: string | null; creada_por: string | null };
const filasDe = async (empresa: string) =>
  (await base().query<FilaFicha>("select id, version, estado, acordada_por, acordada_at, reemplaza_a, creada_por from ficha_direccion where company_id = $1 order by version", [empresa])).rows;

async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("Postgres embebido (PGlite), no Supabase: el código de la ficha contra la tabla real", () => {
  it("insertar el borrador: nace la versión 1 en borrador y el jsonb vuelve igual a como se guardó", async () => {
    const sb = clienteSobre(base());
    const ficha = fichaDePrueba();
    const r = await guardarBorrador(EMP_A, ficha, sb, { creadaPor: U_C });
    expect(r).toMatchObject({ version: 1, creada: true });
    expect(await filasDe(EMP_A)).toMatchObject([{ id: r.id, version: 1, estado: "borrador", creada_por: U_C, acordada_por: null, acordada_at: null, reemplaza_a: null }]);
    const leida = await borradorVigente(EMP_A, sb);
    expect(leida?.bloques).toEqual(ficha.bloques);
    // La revisión viaja dentro del jsonb, pero quien lee la ficha la recibe aparte: la dependencia vuelve igual.
    expect(leida?.dependencia).toEqual(ficha.dependencia);
    expect(leida?.revision).toBe(1);
    // Guardar de nuevo es el MISMO borrador, más completo: no nace otra versión, y sube de revisión.
    const otra = agregarItem(ficha, "proposito", { texto: "Que el cliente se vaya tranquilo", tipo: "declaracion", actorId: U_C });
    expect(await guardarBorrador(EMP_A, otra, sb)).toMatchObject({ id: r.id, version: 1, creada: false });
    expect(await filasDe(EMP_A)).toHaveLength(1);
    const despues = await borradorVigente(EMP_A, sb);
    expect(despues?.bloques.proposito).toHaveLength(1);
    expect(despues?.revision).toBe(2);
  });

  it("sin autoridad no se acuerda y la tabla queda como estaba", async () => {
    const sb = clienteSobre(base());
    const borrador = (await borradorVigente(EMP_A, sb))!;
    await expect(acordar(borrador.id, DUENA, sb)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await filasDe(EMP_A)).toMatchObject([{ version: 1, estado: "borrador" }]);
  });

  it("acordar: nace la versión 2 acordada, con quién y cuándo, y la anterior queda reemplazada sin borrarse", async () => {
    const sb = clienteSobre(base());
    const borrador = (await borradorVigente(EMP_A, sb))!;
    const r = await acordar(borrador.id, CONSULTORA, sb, new Date("2026-10-13T17:00:00Z"));
    expect(r).toMatchObject({ version: 2, reemplazo_a: [borrador.id] });

    const filas = await filasDe(EMP_A);
    expect(filas).toMatchObject([
      { id: borrador.id, version: 1, estado: "reemplazada", acordada_por: null },
      { id: r.id, version: 2, estado: "acordada", acordada_por: U_C, reemplaza_a: borrador.id, creada_por: U_C },
    ]);
    expect(new Date(filas[1].acordada_at as string | Date).toISOString()).toBe("2026-10-13T17:00:00.000Z");

    // La versión 1 conserva todo, también la frase quitada; la 2 lleva solo lo vigente.
    const v1 = await base().query<{ n: number }>("select jsonb_array_length(bloques->'fortalezas') as n from ficha_direccion where id = $1", [borrador.id]);
    const v2 = await base().query<{ n: number; limite: string; detiene: string }>(
      "select jsonb_array_length(bloques->'fortalezas') as n, bloques->'limites'->0->>'texto' as limite, dependencia->'dimensiones'->'comercial'->>'que_se_detiene' as detiene from ficha_direccion where id = $1",
      [r.id]
    );
    expect(v1.rows[0].n).toBe(1);
    expect(v2.rows[0]).toEqual({ n: 0, limite: "No despido a nadie para crecer", detiene: "Las cotizaciones" });
    expect((await acordadaVigente(EMP_A, sb))?.version).toBe(2);
    expect(await borradorVigente(EMP_A, sb)).toBeNull();
  });

  it("una versión acordada no se reescribe ni se acuerda dos veces", async () => {
    const sb = clienteSobre(base());
    const acordada = (await acordadaVigente(EMP_A, sb))!;
    // Solo actualiza donde estado = 'borrador': aquí, ninguna fila. Y no se calla: dice que ya no es un borrador.
    await expect(guardarFicha(acordada.id, fichaVacia(), sb)).rejects.toMatchObject({ name: "BorradorCambio", causa: "reemplazado" });
    expect((await acordadaVigente(EMP_A, sb))?.bloques.limites).toHaveLength(1);
    await expect(acordar(acordada.id, CONSULTORA, sb)).rejects.toBeInstanceOf(ReglaDeFicha);
    expect(await filasDe(EMP_A)).toHaveLength(2);
  });

  it("el ciclo siguiente: borrador 3, acordada 4, y la 2 pasa a reemplazada; las cuatro filas siguen ahí", async () => {
    const sb = clienteSobre(base());
    const anterior = (await acordadaVigente(EMP_A, sb))!;
    const nuevo = await guardarBorrador(EMP_A, agregarItem(anterior, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: U_C }), sb, { creadaPor: U_C });
    expect(nuevo).toMatchObject({ version: 3, creada: true });
    const r = await acordar(nuevo.id, CONSULTORA, sb);
    expect(r).toMatchObject({ version: 4, reemplazo_a: [nuevo.id, anterior.id] });
    expect((await filasDe(EMP_A)).map((f) => [f.version, f.estado])).toEqual([[1, "reemplazada"], [2, "reemplazada"], [3, "reemplazada"], [4, "acordada"]]);
    expect((await historial(EMP_A, sb)).map((v) => [v.version, v.estado])).toEqual([[4, "acordada"], [3, "reemplazada"], [2, "reemplazada"], [1, "reemplazada"]]);
    // Lo que el dueño leería de la versión vigente sale de la fila real, ya traducido.
    const vista = vistaCliente((await acordadaVigente(EMP_A, sb))!);
    expect(vista.version).toBe(4);
    expect(vista.bloques.map((b) => b.titulo)).toEqual(["Para qué existe tu empresa", "Lo que no se negocia", "Lo que ya te sale bien", "Decisiones que tienes pendientes"]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: la revisión del borrador cierra en la base", () => {
  const EMP_D = "0000000d-0000-4000-8000-00000000000d";
  const revisionEnBase = async (id: string) =>
    (await base().query<{ revision: string | null; frases: number }>("select dependencia->>'revision' as revision, jsonb_array_length(bloques->'fortalezas') as frases from ficha_direccion where id = $1", [id])).rows[0];

  it("un guardado con la revisión vieja no toca la fila; aplicando el cambio sobre lo que hay, quedan las dos ediciones", async () => {
    await base().query("insert into companies (id, nombre) values ($1, 'Empresa con dos consultoras (sintética)')", [EMP_D]);
    const sb = clienteSobre(base());
    const r = await guardarBorrador(EMP_D, fichaVacia(), sb, { creadaPor: U_C });
    expect(await revisionEnBase(r.id)).toEqual({ revision: "1", frases: 0 });

    // Dos sesiones leen la misma revisión. La primera guarda…
    const leida = (await borradorVigente(EMP_D, sb))!;
    expect(leida.revision).toBe(1);
    const deUna = agregarItem(leida, "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: U_C });
    expect(await guardarFicha(r.id, deUna, sb, { revision: leida.revision })).toBe(2);
    // …y la segunda, con su copia vieja, no pisa: el `where dependencia->>'revision' = '1'` ya no encuentra la fila.
    const deOtra = agregarItem(leida, "fortalezas", { texto: "Los clientes vuelven", tipo: "interpretacion", actorId: U_C });
    const pisar = guardarFicha(r.id, deOtra, sb, { revision: leida.revision });
    await expect(pisar).rejects.toBeInstanceOf(BorradorCambio);
    await expect(pisar).rejects.toMatchObject({ causa: "revision" });
    expect(await revisionEnBase(r.id)).toEqual({ revision: "2", frases: 1 });
    expect((await borradorVigente(EMP_D, sb))?.bloques.fortalezas.map((i) => i.texto)).toEqual(["Cumple los plazos que promete"]);

    // Releyendo y aplicando encima, las dos frases quedan.
    const hecho = await actualizarBorrador(EMP_D, r.id, sb, (actual) => agregarItem(actual, "fortalezas", { texto: "Los clientes vuelven", tipo: "interpretacion", actorId: U_C }));
    expect(hecho.revision).toBe(3);
    expect(await revisionEnBase(r.id)).toEqual({ revision: "3", frases: 2 });
    // Sobre un borrador que no es el vigente de esa empresa no se escribe.
    await expect(actualizarBorrador(EMP_B, r.id, sb, (actual) => actual)).rejects.toMatchObject({ causa: "reemplazado" });
  });

  it("una fila sin revisión (creada a mano, con el jsonb por defecto) vale cero y se guarda con «is null»", async () => {
    const EMP_E = "0000000e-0000-4000-8000-00000000000e";
    await base().query("insert into companies (id, nombre) values ($1, 'Empresa con fila a mano (sintética)')", [EMP_E]);
    const { rows } = await base().query<{ id: string }>("insert into ficha_direccion (company_id) values ($1) returning id", [EMP_E]);
    const sb = clienteSobre(base());
    expect((await borradorVigente(EMP_E, sb))?.revision).toBe(0);
    expect(await guardarFicha(rows[0].id, agregarItem(fichaVacia(), "fortalezas", { texto: "Cumple los plazos que promete", tipo: "interpretacion", actorId: U_C }), sb)).toBe(1);
    expect(await revisionEnBase(rows[0].id)).toEqual({ revision: "1", frases: 1 });
    // Quien todavía cree que la fila no tiene revisión llega tarde: no pisa.
    await expect(guardarFicha(rows[0].id, fichaVacia(), sb, { revision: 0 })).rejects.toMatchObject({ causa: "revision" });
    expect(await revisionEnBase(rows[0].id)).toEqual({ revision: "1", frases: 1 });
  });
});

describe("Postgres embebido (PGlite), no Supabase: lo que la tabla no deja entrar", () => {
  it("unique(company_id, version): la misma versión dos veces en una empresa no entra; en otra empresa, sí", async () => {
    expect(await rechaza("insert into ficha_direccion (company_id, version) values ($1, 4)", [EMP_A])).toMatch(/duplicate key|unique/i);
    await base().query("insert into ficha_direccion (company_id, version, estado) values ($1, 4, 'acordada')", [EMP_B]);
    await base().query("insert into ficha_direccion (company_id, version, estado) values ($1, 5, 'borrador')", [EMP_B]);
    expect((await filasDe(EMP_B)).map((f) => [f.version, f.estado])).toEqual([[4, "acordada"], [5, "borrador"]]);
    // El código recibe el rechazo como error legible, no como una fila fantasma.
    const sb = clienteSobre(base());
    const { error } = await sb.from("ficha_direccion").insert({ company_id: EMP_A, version: 1, estado: "borrador" }).select("id").single();
    expect(error?.message).toMatch(/duplicate key|unique/i);
  });

  it("un estado inventado no entra, y quien acuerda y la versión reemplazada tienen que existir", async () => {
    expect(await rechaza("insert into ficha_direccion (company_id, version, estado) values ($1, 9, 'publicada')", [EMP_A])).toMatch(/check/i);
    expect(await rechaza("insert into ficha_direccion (company_id, version, acordada_por) values ($1, 9, $2)", [EMP_A, "00000000-0000-4000-8000-00000000ffff"])).toMatch(/foreign key/i);
    expect(await rechaza("insert into ficha_direccion (company_id, version, reemplaza_a) values ($1, 9, $2)", [EMP_A, "00000000-0000-4000-8000-00000000ffff"])).toMatch(/foreign key/i);
    expect(await rechaza("insert into ficha_direccion (version) values (9)", [])).toMatch(/null value|not-null/i);
    expect(await filasDe(EMP_A)).toHaveLength(4);
  });

  it("los valores por defecto: versión 1, borrador, jsonb vacío", async () => {
    const EMP_C = "0000000c-0000-4000-8000-00000000000c";
    await base().query("insert into companies (id, nombre) values ($1, 'Empresa sin ficha (sintética)')", [EMP_C]);
    const r = await base().query<{ version: number; estado: string; bloques: unknown; dependencia: unknown }>("insert into ficha_direccion (company_id) values ($1) returning version, estado, bloques, dependencia", [EMP_C]);
    expect(r.rows[0]).toEqual({ version: 1, estado: "borrador", bloques: {}, dependencia: {} });
    // Una fila mínima no rompe al código: lo que falta en el jsonb se completa vacío.
    expect((await borradorVigente(EMP_C, clienteSobre(base())))?.bloques.limites).toEqual([]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: RLS · el dueño solo ve las versiones acordadas de su empresa", () => {
  const ver = (sub: string | null, rol: "authenticated" | "anon" | "service_role" = "authenticated") =>
    consultarComo<{ company_id: string; version: number; estado: string }>(base(), rol, sub, "select company_id, version, estado from ficha_direccion order by company_id, version");

  it("la dueña de A ve la versión acordada de A y nada más: ni sus borradores, ni lo reemplazado, ni lo de B", async () => {
    // Para que haya un borrador de A que NO deba ver.
    await base().query("insert into ficha_direccion (company_id, version, estado) values ($1, 5, 'borrador')", [EMP_A]);
    expect(await ver(U_A)).toEqual([{ company_id: EMP_A, version: 4, estado: "acordada" }]);
  });

  it("el dueño de B ve solo la acordada de B, no su borrador", async () => {
    expect(await ver(U_B)).toEqual([{ company_id: EMP_B, version: 4, estado: "acordada" }]);
  });

  it("la consultora y la service role lo ven todo; un anónimo y una sesión sin empresa, nada", async () => {
    const todas = await ver(U_C);
    expect(todas.filter((f) => f.company_id === EMP_A).map((f) => [f.version, f.estado])).toEqual([[1, "reemplazada"], [2, "reemplazada"], [3, "reemplazada"], [4, "acordada"], [5, "borrador"]]);
    expect(todas.filter((f) => f.company_id === EMP_B)).toHaveLength(2);
    expect(await ver(null, "service_role")).toHaveLength(todas.length);
    expect(await ver(null, "anon")).toEqual([]);
    expect(await ver("00000000-0000-4000-8000-00000000ffff")).toEqual([]);
  });

  it("el dueño no escribe: no inserta, y un update o un delete suyos no tocan ninguna fila", async () => {
    await expect(consultarComo(base(), "authenticated", U_A, "insert into ficha_direccion (company_id, version, estado) values ($1, 6, 'acordada')", [EMP_A])).rejects.toThrow(/row-level security/);
    const tocadas = await consultarComo(base(), "authenticated", U_A, "update ficha_direccion set estado = 'acordada' where company_id = $1 returning id", [EMP_A]);
    expect(tocadas).toEqual([]);
    const borradas = await consultarComo(base(), "authenticated", U_A, "delete from ficha_direccion where company_id = $1 returning id", [EMP_A]);
    expect(borradas).toEqual([]);
    expect((await filasDe(EMP_A)).map((f) => [f.version, f.estado])).toEqual([[1, "reemplazada"], [2, "reemplazada"], [3, "reemplazada"], [4, "acordada"], [5, "borrador"]]);
  });

  it("la consultora sí escribe con su sesión: la política de consultor cubre insertar y actualizar", async () => {
    const r = await consultarComo<{ estado: string }>(base(), "authenticated", U_C, "update ficha_direccion set bloques = '{}'::jsonb where company_id = $1 and version = 5 returning estado", [EMP_A]);
    expect(r).toEqual([{ estado: "borrador" }]);
  });
});

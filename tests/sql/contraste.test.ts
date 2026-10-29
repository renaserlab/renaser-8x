/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LO QUE DIJO EL DUEÑO Y LO QUE DICE SU EXCEL, LOS DOS EN LA BASE.
 *
 * company_metricas guarda una fila por clave y periodo. Hasta el cierre Z1 (13-10-2026) el número que llegaba
 * segundo pisaba al primero y el contraste «como 40.000» frente a 79.782 no existía en producto, aunque la regla
 * estuviera escrita. Aquí el código REAL que guarda números escribe en el esquema real (todas las migraciones del
 * repo, incluida migracion-cifra-desplazada.sql), a través de un adaptador mínimo que traduce a SQL las llamadas
 * que hace:
 *  - `guardarMetricas` (src/lib/jobs/handlers/extraer.ts): declarar 40.000 → extraer 79.782 → UNA fila con las dos
 *    cifras → `emparejarDeclaradoExtraido` da la contradicción. En los dos órdenes de llegada.
 *  - el mismo recorrido en una base a la que TODAVÍA NO se le aplicó la migración de la columna: Postgres responde
 *    42703, el número nuevo se guarda igual y se avisa. Nunca se pierde un número por una migración pendiente.
 *  - el espejo de indicadores (`guardarValor`, src/app/api/companies/[id]/kpis/_registro.ts) cuando la clave del
 *    indicador es uno de los nueve números del negocio: escribe en SU periodo, no reemplaza lo verificado ni lo
 *    conciliado de ese periodo, y la respuesta dice que un número vital cambió por ese camino. Una lectura
 *    aceptada «sin cifra» (sin dato, conciliada) no es un valor verificado: ahí lo registrado sí entra.
 *    Con un sinónimo de la clave (`ventas_mes`) escribe en la fila canónica de ese mes, no en otra al lado. Y
 *    sobre una cifra EXTRAÍDA sin revisar no toca el número: guarda lo registrado al lado, como declarado, y
 *    el contraste ya tiene par (antes la pantalla decía «falta la cifra declarada»).
 *  - segunda vuelta: la cifra del documento que queda al lado de un «no lo sé» posterior sigue contando como
 *    extraída pendiente (`ladosDisponibles`, `cifrasSoloAlLado`): antes no salía en ninguna pantalla.
 *
 * Qué no prueba: PostgREST, Auth ni que producción tenga la migración aplicada. La ruta del portal se prueba con
 * base falsa en tests/contradiccion-numerica.test.ts (necesita la sesión, que aquí no hay).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseConEsquema, crearBase, aplicarTodo, ordenSin } from "./aplicar";
import { guardarMetricas } from "@/lib/jobs/handlers/extraer";
import { emparejarDeclaradoExtraido, contrasteNumerico, ladosDisponibles, cifrasSoloAlLado, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";
import { guardarValor, rastroDeValor } from "@/app/api/companies/[id]/kpis/_registro";
import { desdeFila } from "@/lib/kpis";
import { valoresActuales } from "@/lib/medicion";
import type { Metrica } from "@/lib/metricas";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña
const EMP = "0000000a-0000-4000-8000-00000000000a";
const EMP_SIN = "0000000b-0000-4000-8000-00000000000b"; // la empresa de la base sin migrar
const EMP_K = "0000000c-0000-4000-8000-00000000000c"; // la empresa de los indicadores: sus números no se mezclan con los de arriba
const P_A = "000000a1-0000-4000-8000-0000000000a1";
const SES = "000000c1-0000-4000-8000-0000000000c1";
const R1 = "000000d1-0000-4000-8000-0000000000d1"; // la respuesta donde la dueña dijo «como 40,000»
const R2 = "000000d2-0000-4000-8000-0000000000d2";
const S1 = "000000e1-0000-4000-8000-0000000000e1"; // ventas-e-inventario.xlsx
const S_K = "000000e2-0000-4000-8000-0000000000e2"; // el documento de la empresa de los indicadores
const S_K2 = "000000e3-0000-4000-8000-0000000000e3"; // ventas-abril.xlsx: su cifra sigue extraída, sin revisar
const I_SIN = "0000001d-0000-4000-8000-00000000001d"; // el indicador de la empresa en la base sin migrar
const I_VENTA = "0000001a-0000-4000-8000-00000000001a"; // indicador con la clave de un número vital: venta_mes
const I_SINONIMO = "0000001b-0000-4000-8000-00000000001b"; // indicador con un sinónimo: ventas_mes
const I_PROPIO = "0000001c-0000-4000-8000-00000000001c"; // indicador propio: devoluciones_mes

type Res = { data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null };

/**
 * Un PostgREST mínimo sobre PGlite, con el rol que crea la base (como la service role del servidor): solo lo que
 * llaman `guardarMetricas` y el espejo. select + eq/in + order + maybeSingle, update + eq e insert. Un objeto se
 * manda como JSON (jsonb). Un fallo vuelve con el código de Postgres, como lo devuelve PostgREST.
 */
function sobrePg(db: PGlite): SupabaseClient {
  const aParametro = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);
  const from = (tabla: string) => {
    let modo: "select" | "update" | "insert" = "select";
    let columnas = "*";
    let cuerpo: Record<string, unknown> = {};
    let orden = "";
    const filtros: { columna: string; valores: unknown[]; lista: boolean }[] = [];
    const donde = (desde: number): { sql: string; valores: unknown[] } => {
      const valores: unknown[] = [];
      const partes = filtros.map((f) => {
        const marcas = f.valores.map((v) => {
          valores.push(v);
          return `$${desde + valores.length}`;
        });
        return f.lista ? `${f.columna} in (${marcas.join(", ")})` : `${f.columna} = ${marcas[0]}`;
      });
      return { sql: partes.length ? ` where ${partes.join(" and ")}` : "", valores };
    };
    const ejecutar = async (): Promise<Res> => {
      try {
        const cols = Object.keys(cuerpo);
        if (modo === "insert") {
          await db.query(`insert into ${tabla} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => aParametro(cuerpo[c])));
          return { data: null, error: null };
        }
        if (modo === "update") {
          const w = donde(cols.length);
          await db.query(`update ${tabla} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}${w.sql}`, [...cols.map((c) => aParametro(cuerpo[c])), ...w.valores]);
          return { data: null, error: null };
        }
        const w = donde(0);
        const r = await db.query<Record<string, unknown>>(`select ${columnas} from ${tabla}${w.sql}${orden}`, w.valores);
        return { data: r.rows, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code } };
      }
    };
    const q = {
      select: (cols = "*") => { if (modo === "select") columnas = cols; return q; },
      eq: (k: string, v: unknown) => { filtros.push({ columna: k, valores: [v], lista: false }); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push({ columna: k, valores: vs, lista: true }); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { orden = ` order by ${k} ${o?.ascending === false ? "desc" : "asc"}`; return q; },
      update: (datos: Record<string, unknown>) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: Record<string, unknown>) => { modo = "insert"; cuerpo = datos; return q; },
      // Como PostgREST: con más de una fila, maybeSingle es un error, no «la primera».
      maybeSingle: async () => {
        const r = await ejecutar();
        if (r.error) return { data: null, error: r.error };
        if ((r.data ?? []).length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        return { data: r.data?.[0] ?? null, error: null };
      },
      then: (res: (v: Res) => unknown, rej?: (e: unknown) => unknown) => ejecutar().then(res, rej),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

/** Los números de una empresa tal como los lee el producto: la fila entera. */
async function numerosDe(db: PGlite, empresa: string, clave: string): Promise<(MetricaGuardada & { id: string })[]> {
  const r = await db.query<MetricaGuardada & { id: string }>("select * from company_metricas where company_id = $1 and clave = $2 order by periodo", [empresa, clave]);
  return r.rows;
}

const COMO_40 = { clave: "stock_a_costo", periodo: "actual", valor: 40_000, valor_texto: "como 40,000", estado: "contado" as const };
const DEL_EXCEL = { clave: "stock_a_costo", periodo: "actual", valor: 79_782, estado: "verificado" as const, nota: "Inventario!F2:F121" };

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena@prueba.local', $2::jsonb)", [U_A, JSON.stringify({ nombre: "Dueña" })]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Bodega con indicadores (sintética)')", [EMP, EMP_K]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2)", [U_A, EMP]);
    await pg.query("insert into participants (id, company_id, nombre, puesto, rol) values ($1, $2, 'Lucero Quintana', 'Gerente general', 'dueno')", [P_A, EMP]);
    await pg.query("insert into interview_sessions (id, company_id, participant_id, tipo) values ($1, $2, $3, 'empresa_dueno')", [SES, EMP, P_A]);
    await pg.query(
      "insert into interview_responses (id, session_id, pregunta, respuesta, orden) values ($1, $3, '¿Cuánto tienes en mercadería?', 'Tengo como 40,000 en mercadería.', 1), ($2, $3, '¿Y hoy?', 'No lo sé.', 2)",
      [R1, R2, SES]
    );
    await pg.query("insert into sources (id, company_id, tipo, nombre, origen, estado) values ($1, $2, 'dato', 'ventas-e-inventario.xlsx', 'cliente', 'leido')", [S1, EMP]);
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
const sb = () => sobrePg(base());
const guardar = (m: Parameters<typeof guardarMetricas>[2], ref: Parameters<typeof guardarMetricas>[3], empresa = EMP, cliente: SupabaseClient = sb()) =>
  guardarMetricas(cliente as never, empresa, m, ref);

describe("Postgres embebido (PGlite), no Supabase: la fila conserva lo declarado y lo extraído", () => {
  it("la columna existe en el esquema que dejan las migraciones del repo, y es jsonb", async () => {
    const r = await base().query<{ data_type: string }>("select data_type from information_schema.columns where table_name = 'company_metricas' and column_name = 'cifra_desplazada'");
    expect(r.rows).toEqual([{ data_type: "jsonb" }]);
  });

  it("declarar 40.000 → extraer 79.782: UNA fila con las dos cifras, y el contraste da la contradicción", async () => {
    await guardar([COMO_40], { response_id: R1, origen: "declarado" });
    let filas = await numerosDe(base(), EMP, "stock_a_costo");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ valor: "40000", estado: "contado", origen: "declarado", response_id: R1, cifra_desplazada: null });
    // Con una sola cifra todavía no hay nada que poner al lado.
    expect(emparejarDeclaradoExtraido(filas)).toEqual([]);

    await guardar([DEL_EXCEL], { source_id: S1, origen: "extraido" });
    filas = await numerosDe(base(), EMP, "stock_a_costo");
    expect(filas).toHaveLength(1);
    // El número del documento es el de la fila, EXTRAÍDO (nunca verificado por haberse leído); el de la dueña, al lado.
    expect(filas[0]).toMatchObject({ valor: "79782", estado: "extraido", origen: "extraido", source_id: S1, response_id: null, nota: "Inventario!F2:F121" });
    expect(filas[0].cifra_desplazada).toEqual({ lado: "declarado", valor: "40000", valor_texto: "como 40,000", nota: null, response_id: R1, source_id: null });

    const [par] = emparejarDeclaradoExtraido(filas, { declarantes: new Map([[R1, "dueno" as const]]) });
    expect(par.veredicto).toMatchObject({ tipo: "CONTRADICCION", clase: "aproximada", tolerancia_pct: 20 });
    expect([par.veredicto.declarado.valor, par.veredicto.extraido.valor]).toEqual([40_000, 79_782]);
    expect([par.veredicto.declarado.estado, par.veredicto.extraido.estado]).toEqual(["pendiente", "pendiente"]);
    expect(par.declarado.response_id).toBe(R1);
    expect(par.extraido.source_id).toBe(S1);
    expect(par.pregunta).toMatch(/^Sobre «Stock a costo»: nos dijiste aproximadamente 40[\s.,]?000 y el documento que nos entregaste muestra 79[\s.,]?782\./);
    expect(JSON.stringify(par)).not.toMatch(/verificad[ao]/i);

    // Y la pregunta va a la afirmación de la dueña que dijo esa cifra en esa respuesta.
    const plan = contrasteNumerico(filas, [
      { id: "c1", texto: "La dueña tiene como 40,000 soles en mercadería.", estado: "confirmado", response_id: R1, participants: { rol: "dueno" } },
      { id: "c2", texto: "Rosa lleva cinco años en la tienda.", estado: "confirmado", response_id: R1, participants: { rol: "dueno" } },
    ]);
    expect(plan).toMatchObject({ contradicciones: 1, sin_pares: null, lados: { declarados: 1, extraidos: 1 } });
    expect(plan.escrituras.map((e) => e.claim_id)).toEqual(["c1"]);
  });

  it("otra lectura del mismo documento no borra lo declarado; y si la dueña vuelve a hablar, se compara su cifra nueva con la del documento", async () => {
    await guardar([{ ...DEL_EXCEL, valor: 79_900 }], { source_id: S1, origen: "extraido" });
    let [fila] = await numerosDe(base(), EMP, "stock_a_costo");
    expect(fila).toMatchObject({ valor: "79900", estado: "extraido" });
    expect(fila.cifra_desplazada).toMatchObject({ lado: "declarado", valor: "40000" });

    await guardar([{ clave: "stock_a_costo", periodo: "actual", valor: 78_000, valor_texto: "78 mil", estado: "contado" }], { response_id: R1, origen: "declarado" });
    [fila] = await numerosDe(base(), EMP, "stock_a_costo");
    expect(fila).toMatchObject({ valor: "78000", estado: "contado", origen: "declarado", response_id: R1 });
    expect(fila.cifra_desplazada).toMatchObject({ lado: "extraido", valor: "79900", source_id: S1 });
    const [par] = emparejarDeclaradoExtraido([fila]);
    expect(par.veredicto).toMatchObject({ tipo: "COINCIDE", clase: "exacta" }); // 2,4 % < 5 %
  });

  it("extraer primero y declarar después: el mismo par, en el otro orden de llegada", async () => {
    await guardar([{ clave: "venta_mes", periodo: "2026-09", valor: 86_900, estado: "verificado" }], { source_id: S1, origen: "extraido" });
    await guardar([{ clave: "ventas_mes", periodo: "2026-09", valor: 60_000, estado: "contado" }], { response_id: R1, origen: "declarado" });
    const filas = await numerosDe(base(), EMP, "venta_mes");
    expect(filas).toHaveLength(1); // el sinónimo `ventas_mes` cae en la misma fila
    expect(filas[0]).toMatchObject({ valor: "60000", estado: "contado", periodo: "2026-09" });
    expect(filas[0].cifra_desplazada).toMatchObject({ lado: "extraido", valor: "86900", source_id: S1 });
    const [par] = emparejarDeclaradoExtraido(filas);
    expect(par.veredicto.tipo).toBe("CONTRADICCION");
    expect([par.veredicto.declarado.valor, par.veredicto.extraido.valor]).toEqual([60_000, 86_900]);
    expect([par.periodo, par.periodo_extraido]).toEqual(["2026-09", "2026-09"]);
  });

  it("«no lo sé» después de haber declarado: el número queda sin dato (nunca cero), y la cifra del documento no se pierde", async () => {
    await guardar([{ clave: "venta_mes", periodo: "2026-09", valor: null, estado: "sin_dato", nota: "No lo sé." }], { response_id: R2, origen: "declarado" });
    const [fila] = await numerosDe(base(), EMP, "venta_mes");
    expect(fila).toMatchObject({ valor: null, estado: "sin_dato" });
    expect(fila.cifra_desplazada).toMatchObject({ lado: "extraido", valor: "86900" });
    // Sin dato no hay par: no se compara un «no lo sé» con nada.
    expect(emparejarDeclaradoExtraido([fila])).toEqual([]);
    // Pero la cifra del documento sigue pendiente y se cuenta: no queda escondida detrás del «no lo sé».
    expect(ladosDisponibles([fila])).toEqual({ declarados: 0, extraidos: 1 });
    expect(contrasteNumerico([fila], []).sin_pares).toMatch(/hay 1 número extraído de un documento y ninguno declarado\. Falta la cifra declarada\./);
    const [suelta] = cifrasSoloAlLado([fila]);
    expect(suelta).toMatchObject({ clave: "venta_mes", nombre: "Ventas del mes", periodo: "2026-09", lado: "extraido", figura: "sin_dato", source_id: S1 });
    expect(suelta.texto).toMatch(/^S\/ 86[\s.,]?900$/);
  });

  it("NEGATIVO · lo que el consultor ya concilió no lo toca ninguna extracción, ni se le cuelga una cifra desplazada", async () => {
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'caja_hoy', 'actual', 15000, 'verificado', 'conciliado')", [EMP]);
    await guardar([{ clave: "caja_hoy", periodo: "actual", valor: 9_000, estado: "verificado" }], { source_id: S1, origen: "extraido" });
    await guardar([{ clave: "caja_hoy", periodo: "actual", valor: 12_000, estado: "contado" }], { response_id: R1, origen: "declarado" });
    const filas = await numerosDe(base(), EMP, "caja_hoy");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ valor: "15000", estado: "verificado", origen: "conciliado", cifra_desplazada: null });
  });
});

describe("Postgres embebido (PGlite), no Supabase: el espejo de indicadores y los nueve números del negocio", () => {
  const HOY = new Date("2026-10-13T12:00:00Z");
  const duena = { id: U_A, rol: "cliente" };
  const kpi = async (id: string) => desdeFila((await base().query<Record<string, unknown>>("select * from indicadores where id = $1", [id])).rows[0]!);
  const ventas = async () => (await numerosDe(base(), EMP_K, "venta_mes")).map((f) => ({ periodo: f.periodo, valor: f.valor, estado: f.estado }));
  const comoMetricas = async (): Promise<Metrica[]> =>
    (await base().query<{ clave: string; periodo: string; valor: string | null; estado: string }>("select clave, periodo, valor, estado from company_metricas where company_id = $1", [EMP_K])).rows.map((f) => ({
      clave: f.clave, periodo: f.periodo, valor: f.valor === null ? null : Number(f.valor), estado: f.estado,
    }));

  beforeAll(async () => {
    await base().query(
      `insert into indicadores (id, company_id, clave, nombre, como_se_mide, unidad, mejor_si, frecuencia, estado, fuente, tipo_indicador) values
         ($1, $4, 'venta_mes', 'Ventas del mes', 'Sumar las ventas del cuaderno', 'soles', 'sube', 'mensual', 'activo', 'Cuaderno de ventas', 'resultado'),
         ($2, $4, 'ventas_mes', 'Ventas (otra forma de llamarlo)', 'Sumar las ventas del cuaderno', 'soles', 'sube', 'mensual', 'activo', 'Cuaderno de ventas', 'resultado'),
         ($3, $4, 'devoluciones_mes', 'Devoluciones al mes', 'Contar las prendas devueltas', 'numero', 'baja', 'mensual', 'activo', 'Cuaderno de caja', 'resultado')`,
      [I_VENTA, I_SINONIMO, I_PROPIO, EMP_K]
    );
    // El estado de partida de la sonda del verificador: agosto verificado en 50.000.
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'venta_mes', '2026-08', 50000, 'verificado', 'conciliado')", [EMP_K]);
  });

  it("escribe en SU periodo y lo dice: registrar 30.000 en setiembre no toca el agosto verificado, y la respuesta avisa de que un número vital cambió", async () => {
    expect(valoresActuales(await comoMetricas()).venta_mes).toBe(50_000);
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-09", valor: 30_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    expect(r).toMatchObject({ espejo: "reflejado", pendiente: null, numero_vital: { clave: "venta_mes", nombre: "Ventas del mes", periodo: "2026-09", antes: null } });
    expect(r.aviso).toBe(
      "«Ventas del mes» es uno de los nueve números del negocio: lo que registraste quedó también como ese número en Setiembre 2026 de «Tus números», contado de memoria (no verificado). Si es el mes más reciente, es el que toman los cortes."
    );
    // Agosto, intacto y verificado; setiembre, nuevo y «contado»: registrar en un indicador no verifica nada.
    expect(await ventas()).toEqual([
      { periodo: "2026-08", valor: "50000", estado: "verificado" },
      { periodo: "2026-09", valor: "30000", estado: "contado" },
    ]);
    // Por qué hace falta el aviso: el mes más reciente manda en lo que un corte congela. Ya no cambia en silencio.
    expect(valoresActuales(await comoMetricas()).venta_mes).toBe(30_000);
    expect(rastroDeValor(await kpi(I_VENTA), r).detalle).toMatchObject({ espejo: "reflejado", numero_vital: "venta_mes", numero_vital_antes: null });
  });

  it("NEGATIVO · no reemplaza el valor verificado del MISMO periodo: queda intacto, se avisa, y no se dice que el número vital cambió", async () => {
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-08", valor: 31_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse en la historia del indicador");
    expect(r).toMatchObject({ espejo: "intacto", pendiente: null });
    expect(r.aviso).toBe("En «Tus números», Agosto 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.");
    expect(r).not.toHaveProperty("numero_vital");
    expect((await ventas())[0]).toEqual({ periodo: "2026-08", valor: "50000", estado: "verificado" });
  });

  it("NEGATIVO · tampoco con un sinónimo de la clave: un indicador `ventas_mes` no deja otra fila al lado del agosto verificado", async () => {
    const r = await guardarValor(sb(), await kpi(I_SINONIMO), { periodo: "2026-08", valor: 31_500 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "intacto" });
    expect(await numerosDe(base(), EMP_K, "ventas_mes")).toEqual([]);
    expect(valoresActuales((await comoMetricas()).filter((m) => m.periodo === "2026-08")).venta_mes).toBe(50_000);
  });

  it("NEGATIVO · una fila conciliada no se reemplaza aunque su estado no diga «verificado»", async () => {
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'venta_mes', '2026-07', 45000, 'contado', 'conciliado')", [EMP_K]);
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-07", valor: 20_000 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "intacto" });
    expect((await ventas())[0]).toEqual({ periodo: "2026-07", valor: "45000", estado: "contado" });
  });

  it("corregir el mismo mes: el aviso dice qué decía antes, y lo que la fila guardaba de un documento sigue al lado", async () => {
    // El número de setiembre venía de una entrevista («como 30 mil») y tenía al lado la cifra del Excel.
    await base().query(
      "update company_metricas set valor_texto = 'como 30 mil', nota = 'de memoria', response_id = $2, cifra_desplazada = $3::jsonb where company_id = $1 and clave = 'venta_mes' and periodo = '2026-09'",
      [EMP_K, R1, JSON.stringify({ lado: "extraido", valor: 41_000, source_id: S1 })]
    );
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-09", valor: 32_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    expect(r).toMatchObject({ espejo: "reflejado", corregido: true, numero_vital: { clave: "venta_mes", periodo: "2026-09", antes: 30_000 } });
    expect(r.aviso).toMatch(/contado de memoria \(no verificado\)\. Antes decía S\/ 30[\s.,]?000\. Si es el mes más reciente/);
    const [, , setiembre] = await numerosDe(base(), EMP_K, "venta_mes");
    // El texto, la nota y la respuesta hablaban del 30.000: no se quedan pegados al 32.000.
    expect(setiembre).toMatchObject({ periodo: "2026-09", valor: "32000", estado: "contado", valor_texto: null, nota: null, response_id: null });
    expect(setiembre.cifra_desplazada).toMatchObject({ lado: "extraido", valor: 41_000, source_id: S1 });
    const [par] = emparejarDeclaradoExtraido([setiembre]);
    expect(par.veredicto).toMatchObject({ tipo: "CONTRADICCION", clase: "exacta" });
    expect([par.veredicto.declarado.valor, par.veredicto.extraido.valor]).toEqual([32_000, 41_000]);
    expect(par.declarante).toBeNull(); // lo que se registra en un indicador no se le atribuye a nadie
  });

  it("un indicador propio (no es de los nueve) se refleja como siempre, sin aviso", async () => {
    const r = await guardarValor(sb(), await kpi(I_PROPIO), { periodo: "2026-09", valor: 12 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "reflejado", aviso: null });
    expect(r).not.toHaveProperty("numero_vital");
    expect(await numerosDe(base(), EMP_K, "devoluciones_mes")).toHaveLength(1);
  });

  it("una lectura aceptada «sin cifra» (sin dato, conciliada) no es un valor verificado: lo registrado entra como contado y la fila deja de figurar como conciliada", async () => {
    await base().query("insert into sources (id, company_id, tipo, nombre, origen, estado) values ($1, $2, 'dato', 'ventas-junio.xlsx', 'cliente', 'leido')", [S_K, EMP_K]);
    // Lo que deja la ruta de consolidar cuando el consultor acepta una lectura que no traía el número.
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen, source_id) values ($1, 'venta_mes', '2026-06', null, 'sin_dato', 'conciliado', $2)", [EMP_K, S_K]);
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-06", valor: 28_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    // Antes: espejo «intacto» y el aviso «ya tiene un dato que no se reemplaza desde aquí (verificado)», que era falso.
    expect(r).toMatchObject({ espejo: "reflejado", pendiente: null, numero_vital: { clave: "venta_mes", periodo: "2026-06", antes: null } });
    expect(r.aviso).not.toMatch(/no se reemplaza/);
    const junio = (await numerosDe(base(), EMP_K, "venta_mes")).filter((f) => f.periodo === "2026-06");
    expect(junio).toHaveLength(1);
    // Contado y declarado: lo que alguien registró no figura como conciliado ni como leído del documento.
    expect(junio[0]).toMatchObject({ valor: "28000", estado: "contado", origen: "declarado", source_id: null });
  });

  it("un indicador con un sinónimo (`ventas_mes`) escribe en la fila `venta_mes` de ese mes: una sola fila, el aviso dice qué decía antes y los cortes toman la cifra nueva", async () => {
    // La sonda del verificador: ese mes ya tenía 40.000 contados con la clave canónica.
    await base().query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'venta_mes', '2026-03', 40000, 'contado', 'declarado')", [EMP_K]);
    const deMarzo = async () => valoresActuales((await comoMetricas()).filter((m) => m.periodo === "2026-03")).venta_mes;
    expect(await deMarzo()).toBe(40_000);
    const r = await guardarValor(sb(), await kpi(I_SINONIMO), { periodo: "2026-03", valor: 30_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    // Antes: «antes: null» (decía que no había nada) y una segunda fila `ventas_mes` junto a la de 40.000.
    expect(r).toMatchObject({ espejo: "reflejado", pendiente: null, numero_vital: { clave: "venta_mes", nombre: "Ventas del mes", periodo: "2026-03", antes: 40_000 } });
    expect(r.aviso).toMatch(/contado de memoria \(no verificado\)\. Antes decía S\/ 40[\s.,]?000\. Si es el mes más reciente/);
    const marzo = (await numerosDe(base(), EMP_K, "venta_mes")).filter((f) => f.periodo === "2026-03");
    expect(marzo).toHaveLength(1);
    expect(marzo[0]).toMatchObject({ clave: "venta_mes", valor: "30000", estado: "contado" });
    expect(await numerosDe(base(), EMP_K, "ventas_mes")).toEqual([]);
    // El número de ese mes es el nuevo: antes, con las dos filas, seguía saliendo 40.000.
    expect(await deMarzo()).toBe(30_000);
  });

  it("y si ese mes no tenía fila, la crea con la clave canónica, no con el sinónimo", async () => {
    const r = await guardarValor(sb(), await kpi(I_SINONIMO), { periodo: "2026-05", valor: 22_000 }, duena, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "reflejado", numero_vital: { clave: "venta_mes", periodo: "2026-05", antes: null } });
    const mayo = (await numerosDe(base(), EMP_K, "venta_mes")).filter((f) => f.periodo === "2026-05");
    expect(mayo).toEqual([expect.objectContaining({ clave: "venta_mes", valor: "22000", estado: "contado" })]);
    expect(await numerosDe(base(), EMP_K, "ventas_mes")).toEqual([]);
  });

  it("sobre una cifra EXTRAÍDA sin revisar: el número del documento no se toca, lo registrado queda al lado como declarado y el contraste ya tiene par", async () => {
    await base().query("insert into sources (id, company_id, tipo, nombre, origen, estado) values ($1, $2, 'dato', 'ventas-abril.xlsx', 'cliente', 'leido')", [S_K2, EMP_K]);
    await base().query(
      "insert into company_metricas (company_id, clave, periodo, valor, estado, origen, source_id, nota) values ($1, 'venta_mes', '2026-04', 79782, 'extraido', 'extraido', $2, 'Ventas!F2:F31')",
      [EMP_K, S_K2]
    );
    const deAbril = async () => (await numerosDe(base(), EMP_K, "venta_mes")).filter((f) => f.periodo === "2026-04") as (MetricaGuardada & { id: string; updated_at?: unknown })[];
    const [antes] = await deAbril();
    // Antes de registrar no hay cifra declarada, y decirlo es verdad.
    expect(contrasteNumerico([antes], []).sin_pares).toMatch(/Falta la cifra declarada/);

    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-04", valor: 40_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse en la historia del indicador");
    expect(r).toMatchObject({ espejo: "intacto", pendiente: null, declarado_al_lado: true });
    expect(r).not.toHaveProperty("numero_vital"); // el número del mes no cambió
    expect(r.aviso).toBe(
      "En «Tus números», Abril 2026 ya tiene un dato que no se reemplaza desde aquí (extraído, pendiente de conciliar). Lo que registraste quedó en la historia del indicador. También quedó guardado junto a esa cifra, como lo declarado, para que se comparen las dos antes de dar una por buena."
    );
    expect(rastroDeValor(await kpi(I_VENTA), r).detalle).toMatchObject({ espejo: "intacto", declarado_al_lado: true });

    let abril = await deAbril();
    expect(abril).toHaveLength(1);
    // Ni el valor, ni el estado, ni la fuente, ni la nota, ni la fecha de la cifra del documento cambian: nunca verificada.
    expect(abril[0]).toMatchObject({ valor: "79782", estado: "extraido", origen: "extraido", source_id: S_K2, nota: "Ventas!F2:F31" });
    expect(abril[0].updated_at).toEqual(antes.updated_at);
    expect(abril[0].cifra_desplazada).toEqual({ lado: "declarado", valor: 40_000, valor_texto: null, nota: null, response_id: null, source_id: null });
    // Los cortes siguen leyendo la cifra del documento para ese mes: lo registrado no la reemplazó.
    expect(valoresActuales((await comoMetricas()).filter((m) => m.periodo === "2026-04")).venta_mes).toBe(79_782);

    // Antes: «hay 1 número extraído y ninguno declarado. Falta la cifra declarada». Ahora hay par, y no cuadra.
    const plan = contrasteNumerico(abril, []);
    expect(plan).toMatchObject({ contradicciones: 1, sin_pares: null, lados: { declarados: 1, extraidos: 1 } });
    expect(plan.pares[0].veredicto).toMatchObject({ tipo: "CONTRADICCION", clase: "exacta", tolerancia_pct: 5 });
    expect([plan.pares[0].veredicto.declarado.valor, plan.pares[0].veredicto.extraido.valor]).toEqual([40_000, 79_782]);
    expect([plan.pares[0].veredicto.declarado.estado, plan.pares[0].veredicto.extraido.estado]).toEqual(["pendiente", "pendiente"]);
    expect(plan.pares[0]).toMatchObject({ periodo: "2026-04", periodo_extraido: "2026-04", declarante: null, extraido_al_lado: false });
    expect(plan.pares[0].extraido.source_id).toBe(S_K2);

    // Corregir lo registrado reemplaza la cifra de al lado (no se apila), y el indicador del sinónimo va a la MISMA fila.
    const r2 = await guardarValor(sb(), await kpi(I_SINONIMO), { periodo: "2026-04", valor: 78_000 }, duena, { hoy: HOY });
    expect(r2).toMatchObject({ ok: true, sin_dato: false, espejo: "intacto", declarado_al_lado: true });
    abril = await deAbril();
    expect(abril).toHaveLength(1);
    expect(abril[0]).toMatchObject({ valor: "79782", estado: "extraido", source_id: S_K2 });
    expect(abril[0].cifra_desplazada).toEqual({ lado: "declarado", valor: 78_000, valor_texto: null, nota: null, response_id: null, source_id: null });
    expect(await numerosDe(base(), EMP_K, "ventas_mes")).toEqual([]);
    expect(emparejarDeclaradoExtraido(abril)[0].veredicto).toMatchObject({ tipo: "COINCIDE", clase: "exacta" }); // 2,3 % < 5 %
  });

  it("NEGATIVO · lo verificado no recibe nada al lado: ni se toca la fila ni se dice que quedó guardado junto a ella", async () => {
    const r = await guardarValor(sb(), await kpi(I_VENTA), { periodo: "2026-08", valor: 33_000 }, duena, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse en la historia del indicador");
    expect(r).toMatchObject({ espejo: "intacto", pendiente: null });
    expect(r).not.toHaveProperty("declarado_al_lado");
    expect(r.aviso).toBe("En «Tus números», Agosto 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.");
    const agosto = (await numerosDe(base(), EMP_K, "venta_mes")).filter((f) => f.periodo === "2026-08");
    expect(agosto).toEqual([expect.objectContaining({ valor: "50000", estado: "verificado", origen: "conciliado", cifra_desplazada: null })]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: una base a la que todavía no se le aplicó migracion-cifra-desplazada.sql", () => {
  let vieja: PGlite | undefined;
  let falloVieja: unknown;

  beforeAll(async () => {
    try {
      vieja = await crearBase();
      // Todo el esquema del repo MENOS la migración de la columna: así está una base que aún no la recibió.
      await aplicarTodo(vieja, { orden: ordenSin(["migracion-cifra-desplazada.sql"]) });
      await vieja.query("insert into companies (id, nombre) values ($1, 'Empresa en la base sin migrar (sintética)')", [EMP_SIN]);
    } catch (e) {
      falloVieja = e;
    }
  }, 180_000);

  afterAll(async () => {
    await vieja?.close();
  });

  it("el número nuevo se guarda igual, sin la columna y con un aviso en consola: nunca se pierde por una migración pendiente", async () => {
    if (falloVieja) throw falloVieja;
    const db = vieja!;
    const columna = await db.query("select 1 from information_schema.columns where table_name = 'company_metricas' and column_name = 'cifra_desplazada'");
    expect(columna.rows).toEqual([]);

    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cliente = sobrePg(db);
      await guardar([{ ...COMO_40 }], { origen: "declarado" }, EMP_SIN, cliente);
      expect(aviso).not.toHaveBeenCalled(); // la primera escritura no desplaza nada: no nombra la columna
      await guardar([{ ...DEL_EXCEL }], { origen: "extraido" }, EMP_SIN, cliente);
      const filas = await numerosDe(db, EMP_SIN, "stock_a_costo");
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ valor: "79782", estado: "extraido", origen: "extraido" });
      expect(filas[0]).not.toHaveProperty("cifra_desplazada");
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(String(aviso.mock.calls[0][0])).toMatch(/stock_a_costo\/actual.*falta aplicar supabase\/migracion-cifra-desplazada\.sql/);
      // En esa base el par no existe: no hay nada que comparar, y eso no es que cuadren.
      expect(emparejarDeclaradoExtraido(filas)).toEqual([]);
      expect(contrasteNumerico(filas, []).sin_pares).toMatch(/Falta la cifra declarada/);
    } finally {
      aviso.mockRestore();
    }
  });

  it("el espejo sobre una cifra extraída, en esa misma base: el número del documento sigue intacto, lo registrado queda en el indicador, no se promete «al lado» y se avisa en consola", async () => {
    if (falloVieja) throw falloVieja;
    const db = vieja!;
    await db.query(
      `insert into indicadores (id, company_id, clave, nombre, como_se_mide, unidad, mejor_si, frecuencia, estado, fuente, tipo_indicador) values
         ($1, $2, 'stock_a_costo', 'Stock a costo', 'Sumar el inventario a costo', 'soles', 'sube', 'mensual', 'activo', 'Inventario', 'resultado')`,
      [I_SIN, EMP_SIN]
    );
    await db.query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'stock_a_costo', '2026-09', 79782, 'extraido', 'extraido')", [EMP_SIN]);
    const indicador = desdeFila((await db.query<Record<string, unknown>>("select * from indicadores where id = $1", [I_SIN])).rows[0]!);

    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await guardarValor(sobrePg(db), indicador, { periodo: "2026-09", valor: 40_000 }, { id: null, rol: "cliente" }, { hoy: new Date("2026-10-13T12:00:00Z") });
      if (!r.ok || r.sin_dato) throw new Error("debió guardarse en la historia del indicador");
      // No es un fallo: el valor está en el indicador. Lo que esa base no puede guardar es la cifra de al lado.
      expect(r).toMatchObject({ valor: 40_000, espejo: "intacto", pendiente: null });
      expect(r).not.toHaveProperty("declarado_al_lado");
      expect(r.aviso).toBe("En «Tus números», Setiembre 2026 ya tiene un dato que no se reemplaza desde aquí (extraído, pendiente de conciliar). Lo que registraste quedó en la historia del indicador.");
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(String(aviso.mock.calls[0][0])).toMatch(/stock_a_costo\/2026-09.*falta aplicar supabase\/migracion-cifra-desplazada\.sql/);
      const filas = (await numerosDe(db, EMP_SIN, "stock_a_costo")).filter((f) => f.periodo === "2026-09");
      expect(filas).toEqual([expect.objectContaining({ valor: "79782", estado: "extraido", origen: "extraido" })]);
      const historia = await db.query<{ valor: string }>("select valor::text as valor from indicador_valores where indicador_id = $1 and periodo = '2026-09'", [I_SIN]);
      expect(historia.rows).toEqual([{ valor: "40000" }]);
    } finally {
      aviso.mockRestore();
    }
  });
});

/**
 * LO QUE LA CONSULTORA PIDE Y LO QUE EL CLIENTE LLENA · LAS RUTAS, CON DOBLES (16-10-2026).
 *
 * `supabaseAdmin()` es una base en memoria (tests/fixtures/base-falsa.ts) y la sesión la pone la prueba. Lo que se fija:
 *  - la consultora activa y retira; el cliente no activa (403);
 *  - el cliente escribe solo con su sección abierta, y nunca la decisión ni «comprobado»;
 *  - 409 sobre lo que la consultora ya comprobó con un documento; el cliente borra solo lo suyo;
 *  - «Listo, ya lo llené» completa el pedido una vez, y después la sección queda cerrada;
 *  - la historia siembra el mejor mes en los 9 números SIN pisar uno que ya existe;
 *  - los días de cobro salen de las fechas; el veredicto de una compuerta exige su motivo;
 *  - todo deja rastro.
 * Lo que es Postgres (checks, RLS, cascadas) está en tests/sql/entrar-hoy.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { crearBaseFalsa, type Fila, type BaseFalsa } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { TEXTO_SECCION_CERRADA, TEXTO_YA_LISTO } from "@/lib/solicitudes";
import { TEXTO_VEREDICTO_SIN_MOTIVO } from "@/lib/esquemas-negocio";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a";
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "duena@prueba.local", nombre: "Dueña", rol: "cliente" };
const PARTICIPANTE: Perfil = { id: "00000000-0000-4000-8000-0000000000a2", email: "equipo@prueba.local", nombre: "Equipo", rol: "cliente" };
const L_CONSULTORA = "11111111-1111-4111-8111-111111111111";

type Respuesta = { status: number; body: Fila };
type Manejador = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Llama a una ruta como lo haría Next: la petición y sus parámetros como promesa. */
async function llamar(modulo: string, metodo: "GET" | "POST" | "PATCH" | "DELETE", params: Record<string, string>, cuerpo?: unknown, ruta = "x"): Promise<Respuesta> {
  const m = (await import(/* @vite-ignore */ modulo)) as Record<string, Manejador>;
  const req = new Request(`http://8x.test/api/companies/${params.id}/${ruta}`, {
    method: metodo,
    ...(cuerpo !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : {}),
  });
  const res = await m[metodo]!(req, { params: Promise.resolve(params) });
  return { status: res.status, body: (await res.json()) as Fila };
}

const SOLICITUDES = "@/app/api/companies/[id]/solicitudes/route";
const SOLICITUD = "@/app/api/companies/[id]/solicitudes/[sid]/route";
const PRODUCTO = "@/app/api/companies/[id]/producto/route";
const LINEA = "@/app/api/companies/[id]/producto/[lid]/route";
const COSTOS = "@/app/api/companies/[id]/costos/route";
const COSTO = "@/app/api/companies/[id]/costos/[cid]/route";
const NEGOCIO = "@/app/api/companies/[id]/negocio/route";
const MONEDA = "@/app/api/companies/[id]/moneda/route";
const RUTA = "@/app/api/companies/[id]/ruta/route";

/** Una empresa con su dueña, una participante y una línea anotada por la consultora con el precio ya comprobado. */
function base(extra: Record<string, Fila[]> = {}): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", zona_horaria: "America/Lima", modelo_negocio: null, tipo_trabajo: "estructurar", ruta_inicio: "2026-10-19", hora_cierre: null, modelo_operativo: ["produccion"] }],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }, { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" }],
    lineas_producto: [
      { id: L_CONSULTORA, company_id: EMP, codigo: "J-01", nombre: "Jean Clásico", tipo: "producto", precio: 80, costo_variable_unitario: 35, unidades_periodo: null, periodo: null, origen: "conciliado", decision: "mejorar", decision_motivo: "INTERNO", estados: { precio: "comprobado" }, componentes_costo: [], creada_por: CONSULTORA.id },
    ],
    ...extra,
  });
  estado.base = b;
  return b;
}
const como = (p: Perfil) => vi.mocked(perfilApi).mockResolvedValue(p);
const activar = async (...secciones: string[]) => {
  como(CONSULTORA);
  const r = await llamar(SOLICITUDES, "POST", { id: EMP }, { secciones: secciones.map((seccion) => ({ seccion })) });
  expect(r.status).toBe(201);
  return r;
};

beforeAll(async () => {
  await Promise.all([SOLICITUDES, SOLICITUD, PRODUCTO, LINEA, COSTOS, COSTO, NEGOCIO, MONEDA, RUTA].map((m) => import(/* @vite-ignore */ m)));
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
});

describe("activar para el cliente: es de la consultora", () => {
  it("la consultora activa dos secciones con su nota; volver a activar una activa cambia la nota, no crea otra", async () => {
    const b = base();
    como(CONSULTORA);
    const r = await llamar(SOLICITUDES, "POST", { id: EMP }, { secciones: [{ seccion: "productos", nota: "Tus tres jeans más vendidos" }, { seccion: "costos" }] });
    expect(r.status).toBe(201);
    expect(b.tablas.solicitudes_cliente).toHaveLength(2);
    expect(b.tablas.solicitudes_cliente!.every((s) => s.estado === "activa" && s.activada_por === CONSULTORA.id)).toBe(true);
    const otra = await llamar(SOLICITUDES, "POST", { id: EMP }, { secciones: [{ seccion: "productos", nota: "Solo los de mujer" }] });
    expect(otra.status).toBe(201);
    expect(b.tablas.solicitudes_cliente).toHaveLength(2);
    expect(b.tablas.solicitudes_cliente!.find((s) => s.seccion === "productos")!.nota).toBe("Solo los de mujer");
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: EMP, actor: CONSULTORA, accion: "crear", entidad: "solicitud_cliente", detalle: expect.objectContaining({ seccion: "costos" }) }));
  });

  it("una sección que no existe se dice en palabras: 400", async () => {
    base();
    como(CONSULTORA);
    const r = await llamar(SOLICITUDES, "POST", { id: EMP }, { secciones: [{ seccion: "contabilidad" }] });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/^No conocemos la sección «contabilidad»/);
  });

  it("el cliente no activa: 403", async () => {
    const b = base();
    como(DUENA);
    expect((await llamar(SOLICITUDES, "POST", { id: EMP }, { secciones: [{ seccion: "productos" }] })).status).toBe(403);
    expect(b.tablas.solicitudes_cliente ?? []).toHaveLength(0);
  });

  it("la consultora retira; el dueño ya no la ve; el dueño no retira", async () => {
    const b = base();
    await activar("productos", "historia");
    const historia = b.tablas.solicitudes_cliente!.find((s) => s.seccion === "historia")!;
    como(DUENA);
    expect((await llamar(SOLICITUD, "PATCH", { id: EMP, sid: String(historia.id) }, { estado: "retirada" })).status).toBe(403);
    como(CONSULTORA);
    const r = await llamar(SOLICITUD, "PATCH", { id: EMP, sid: String(historia.id) }, { estado: "retirada" });
    expect(r.status).toBe(200);
    expect(historia.estado).toBe("retirada");
    como(DUENA);
    const lista = await llamar(SOLICITUDES, "GET", { id: EMP });
    expect((lista.body.solicitudes as Fila[]).map((s) => s.seccion)).toEqual(["productos"]);
    // Al dueño ni se le piden quién activó ni cuándo se retiró: se filtra en la consulta.
    const consulta = b.pedidos.filter((p) => p.tabla === "solicitudes_cliente" && p.op === "select").pop()!;
    expect(consulta.columnas).not.toMatch(/activada_por|retirada_at/);
  });
});

describe("el cliente llena SOLO lo que su consultora abrió", () => {
  it("sin la sección abierta: 403 con el texto de siempre; con ella abierta, crea su línea como declarada y suya", async () => {
    const b = base();
    como(DUENA);
    const cerrado = await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Pantalón Cargo", precio: 90 });
    expect(cerrado).toEqual({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
    await activar("productos");
    como(DUENA);
    const r = await llamar(PRODUCTO, "POST", { id: EMP }, {
      nombre: "Pantalón Cargo", modelo: "fabrica_y_vende", precio: 90, precio_segundo: 70, segundo_precio_es: "por_mayor", de_cada_10_segundo: 3,
      componentes_costo: [{ nombre: "tela", valor: 20, estado: "contado" }, { nombre: "costura", desde: 8, hasta: 10, estado: "estimado" }],
      unidades_mes_desde: 90, unidades_mes_hasta: 130, estados: { precio: "contado", unidades: "estimado" },
    });
    expect(r.status).toBe(201);
    const fila = b.tablas.lineas_producto!.find((l) => l.nombre === "Pantalón Cargo")!;
    // Con todas las partes con número: costo = centro de 28 a 30 = 29, y su estado el más débil (estimado).
    expect(fila).toMatchObject({ origen: "declarado", creada_por: DUENA.id, tipo: "producto", costo_variable_unitario: 29, estados: { precio: "contado", unidades: "estimado", costo: "estimado" } });
    expect(fila).not.toHaveProperty("decision");
  });

  it("una parte sin número deja el costo vacío (no en cero)", async () => {
    const b = base();
    await activar("productos");
    como(DUENA);
    await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Short", precio: 45, componentes_costo: [{ nombre: "tela", valor: 10, estado: "contado" }, { nombre: "lavado", estado: "no_lo_se" }] });
    expect(b.tablas.lineas_producto!.find((l) => l.nombre === "Short")).toMatchObject({ costo_variable_unitario: null });
  });

  it("un participante (ni dueño ni líder) no escribe aunque la sección esté abierta", async () => {
    base();
    await activar("productos");
    como(PARTICIPANTE);
    expect((await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Polo" })).status).toBe(403);
  });

  it("el cliente no manda la decisión, ni el código, ni «comprobado»: 400", async () => {
    base();
    await activar("productos", "costos");
    como(DUENA);
    expect((await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Polo", decision: "retirar", decision_motivo: "x" })).status).toBe(400);
    expect((await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Polo", codigo: "P-1" })).status).toBe(400);
    expect((await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Polo", estados: { precio: "comprobado" } })).status).toBe(400);
    expect((await llamar(LINEA, "PATCH", { id: EMP, lid: L_CONSULTORA }, { decision: "conservar", decision_motivo: "porque sí" })).status).toBe(400);
    expect((await llamar(COSTOS, "POST", { id: EMP }, { tipo: "fijo", nombre: "Alquiler", dato: { valor: 2500, estado: "comprobado" } })).status).toBe(400);
  });

  it("lo comprobado con un documento no lo cambia el dueño (409); lo demás de la misma línea, sí", async () => {
    const b = base();
    await activar("productos");
    como(DUENA);
    const r = await llamar(LINEA, "PATCH", { id: EMP, lid: L_CONSULTORA }, { precio: 85 });
    expect(r).toEqual({ status: 409, body: { error: "«El precio» ya está comprobado con un documento y no se cambió. Si cambió, díselo a tu consultora." } });
    expect(b.tablas.lineas_producto![0]!.precio).toBe(80);
    const ok = await llamar(LINEA, "PATCH", { id: EMP, lid: L_CONSULTORA }, { unidades_mes: 300, estados: { unidades: "contado" } });
    expect(ok.status).toBe(200);
    // Los estados se mezclan: el «comprobado» del precio no se pierde por mandar el de las unidades.
    expect(b.tablas.lineas_producto![0]).toMatchObject({ unidades_mes: 300, estados: { precio: "comprobado", unidades: "contado" }, decision: "mejorar" });
    // La consultora sí puede corregirlo.
    como(CONSULTORA);
    expect((await llamar(LINEA, "PATCH", { id: EMP, lid: L_CONSULTORA }, { precio: 85 })).status).toBe(200);
  });

  it("el dueño borra solo lo que él anotó", async () => {
    const b = base();
    await activar("productos");
    como(DUENA);
    const nueva = await llamar(PRODUCTO, "POST", { id: EMP }, { nombre: "Gorra" });
    const lid = String((nueva.body.linea as Fila).id);
    expect(await llamar(LINEA, "DELETE", { id: EMP, lid: L_CONSULTORA })).toEqual({ status: 403, body: { error: "Este producto lo anotó tu consultora: pídele que lo quite." } });
    expect((await llamar(LINEA, "DELETE", { id: EMP, lid })).status).toBe(200);
    expect(b.tablas.lineas_producto!.map((l) => l.id)).toEqual([L_CONSULTORA]);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ accion: "eliminar", entidad: "linea_producto", entidadId: lid, actor: DUENA }));
  });

  it("«Listo, ya lo llené»: una vez; después la sección queda cerrada para escribir", async () => {
    const b = base();
    await activar("costos");
    const sid = String(b.tablas.solicitudes_cliente![0]!.id);
    como(DUENA);
    expect((await llamar(COSTOS, "POST", { id: EMP }, { tipo: "fijo", nombre: "Alquiler", dato: { valor: 2500, estado: "contado" } })).status).toBe(201);
    const listo = await llamar(SOLICITUD, "PATCH", { id: EMP, sid }, { estado: "completada" });
    expect(listo.status).toBe(200);
    expect(b.tablas.solicitudes_cliente![0]).toMatchObject({ estado: "completada", completada_por: DUENA.id });
    expect(await llamar(SOLICITUD, "PATCH", { id: EMP, sid }, { estado: "completada" })).toEqual({ status: 409, body: { error: TEXTO_YA_LISTO } });
    expect((await llamar(COSTOS, "POST", { id: EMP }, { tipo: "fijo", nombre: "Luz", dato: { valor: 300, estado: "contado" } })).status).toBe(403);
    // La consultora no lo marca como listo por él.
    como(CONSULTORA);
    expect((await llamar(SOLICITUD, "PATCH", { id: EMP, sid }, { estado: "completada" })).status).toBe(400);
  });
});

describe("gastos, ficha del negocio y ventas en otra moneda", () => {
  it("un gasto en rango se guarda como rango; uno comprobado no lo cambia el dueño; borrar lo de la consultora, no", async () => {
    const b = base({ costos_mes: [{ id: "c-comprobado", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", monto: 6000, monto_desde: null, monto_hasta: null, estado: "comprobado", orden: 0, creado_por: CONSULTORA.id }] });
    await activar("costos");
    como(DUENA);
    const r = await llamar(COSTOS, "POST", { id: EMP }, { tipo: "comercializacion", nombre: "Publicidad", dato: { desde: 400, hasta: 600, estado: "estimado" } });
    expect(r.status).toBe(201);
    expect(b.tablas.costos_mes!.find((c) => c.nombre === "Publicidad")).toMatchObject({ monto: null, monto_desde: 400, monto_hasta: 600, estado: "estimado", creado_por: DUENA.id });
    expect((await llamar(COSTO, "PATCH", { id: EMP, cid: "c-comprobado" }, { dato: { valor: 5000, estado: "contado" } })).status).toBe(409);
    expect((await llamar(COSTO, "DELETE", { id: EMP, cid: "c-comprobado" })).status).toBe(409);
    const lista = await llamar(COSTOS, "GET", { id: EMP });
    expect((lista.body.costos as Fila[]).map((c) => c.nombre).sort()).toEqual(["Publicidad", "Sueldos"]);
  });

  it("la historia siembra el mejor mes en los 9 números; si ya había uno, no lo pisa", async () => {
    const b = base();
    await activar("historia");
    como(DUENA);
    const r = await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { mejor_epoca: { cuando: "2019, antes de la pandemia", venta_mes: { desde: 50000, hasta: 70000, estado: "estimado" }, que_pasaba: "Vendíamos a tiendas de provincia" } } });
    expect(r.status).toBe(200);
    expect(r.body.sembrado).toBe(true);
    expect(b.tablas.company_metricas).toEqual([expect.objectContaining({ company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado", origen: "declarado" })]);
    expect(String(b.tablas.company_metricas![0]!.nota)).toMatch(/^De la historia del negocio \(dijo entre/);
    // Otra respuesta después: la historia se guarda (mezclada), el número no se toca.
    const otra = await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { mejor_epoca: { cuando: "2019", venta_mes: { valor: 90000, estado: "contado" } }, hoy_distinto: { texto: "Vendemos por Instagram" } } });
    expect(otra.body.sembrado).toBe(false);
    expect(b.tablas.company_metricas).toHaveLength(1);
    expect(b.tablas.company_metricas![0]!.valor).toBe(60000);
    expect(b.tablas.ficha_negocio![0]!.historia).toMatchObject({ mejor_epoca: { cuando: "2019" }, hoy_distinto: { texto: "Vendemos por Instagram" } });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: "ficha_negocio", detalle: expect.objectContaining({ bloque: "historia", sembrado: true }) }));
  });

  it("cada bloque con su sección: la historia no abre la moneda; los módulos, con cualquiera de las suyas", async () => {
    base();
    await activar("historia");
    como(DUENA);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "moneda", datos: { vende_en: ["CLP"] } })).status).toBe(403);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modulos", datos: { moneda: true } })).status).toBe(403);
    await activar("credito");
    como(DUENA);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modulos", datos: { credito: true } })).status).toBe(200);
  });

  it("cómo gana dinero: el dueño lo elige solo si está vacío y con «productos» abierta", async () => {
    const b = base();
    await activar("productos");
    como(DUENA);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modelo_negocio", datos: ["fabrica_y_vende"] })).status).toBe(200);
    expect(b.tablas.companies![0]!.modelo_negocio).toEqual(["fabrica_y_vende"]);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modelo_negocio", datos: ["compra_y_revende"] })).status).toBe(403);
    const lectura = await llamar(NEGOCIO, "GET", { id: EMP });
    expect(lectura.body.trabajo).toMatchObject({ modelo_negocio: ["fabrica_y_vende"], tipo_trabajo: "estructurar", ruta_inicio: "2026-10-19", modelo_operativo: ["produccion"] });
  });

  it("una venta en otra moneda: los días de cobro salen de las fechas, y la respuesta trae lo que se quedó en el camino", async () => {
    const b = base();
    como(CONSULTORA);
    const r = await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 1000000, fecha_venta: "2026-09-01", fecha_cobro: "2026-09-25", tc_cotizado: 0.0041, tc_cobro: 0.0039, recibido: 3750, comisiones: 60, conversiones: 2, estado: "comprobado" });
    expect(r.status).toBe(201);
    expect(b.tablas.operaciones_moneda![0]).toMatchObject({ dias_cobro: 24, estado: "comprobado", creado_por: CONSULTORA.id });
    expect((r.body.fuga as Fila).total).toBeCloseTo(350, 6);
    // El dueño, sin «moneda» abierta, no anota; con ella abierta no puede marcar «comprobado».
    como(DUENA);
    expect((await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 100 })).status).toBe(403);
    await activar("moneda");
    como(DUENA);
    expect((await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 100, estado: "comprobado" })).status).toBe(400);
    expect((await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 100, fecha_venta: "2026-09-10", fecha_cobro: "2026-09-01" })).status).toBe(400);
  });
});

describe("lo comprobado de la ficha no lo pisa el dueño, y los módulos se encienden con una pregunta", () => {
  const MONEDA_OP = "@/app/api/companies/[id]/moneda/[oid]/route";

  it("un dato de la ficha comprobado por la consultora: 409 con qué dato es; omitido, se conserva; lo demás se guarda", async () => {
    const b = base({
      ficha_negocio: [{
        company_id: EMP,
        historia: { anio_inicio: { valor: 2015, estado: "comprobado" }, mejor_epoca: { cuando: "2019", venta_mes: { valor: 60000, estado: "comprobado" }, que_pasaba: "Vendíamos a provincia" } },
        modulos: {}, totales: { grupos: { Pantalones: { valor: 300, estado: "comprobado" } } }, moneda: {}, credito: { dias: { valor: 45, estado: "comprobado" } }, inventario: {},
      }],
    });
    await activar("historia", "productos", "credito");
    como(DUENA);
    // Pisar el año comprobado: 409, y la ficha queda igual.
    const pisa = await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { anio_inicio: { valor: 2016, estado: "contado" } } });
    expect(pisa).toMatchObject({ status: 409, body: { error: "El año en que empezó el negocio ya está comprobado con un documento y no se cambió. Si cambió, díselo a tu consultora." } });
    expect(b.tablas.ficha_negocio![0]!.historia).toMatchObject({ anio_inicio: { valor: 2015, estado: "comprobado" } });
    // La mejor época SIN su venta (la pantalla no la manda): se guarda lo demás y la venta comprobada se conserva.
    const resto = await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { mejor_epoca: { cuando: "2019, antes de la pandemia", que_pasaba: "Vendíamos a tiendas" } } });
    expect(resto.status).toBe(200);
    expect(b.tablas.ficha_negocio![0]!.historia).toMatchObject({ mejor_epoca: { cuando: "2019, antes de la pandemia", que_pasaba: "Vendíamos a tiendas", venta_mes: { valor: 60000, estado: "comprobado" } } });
    // La mejor época con OTRA venta: 409.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { mejor_epoca: { cuando: "2019", venta_mes: { valor: 90000, estado: "contado" } } } })).status).toBe(409);
    // Un total por grupo comprobado (los grupos se mezclan uno por uno): pisarlo, 409; otro grupo, sí.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "totales", datos: { grupos: { Pantalones: { valor: 250, estado: "estimado" } } } })).status).toBe(409);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "totales", datos: { grupos: { Polos: { valor: 120, estado: "estimado" } } } })).status).toBe(200);
    // Crédito: los días comprobados no; de cada 10, sí.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "credito", datos: { dias: { estado: "no_lo_se" } } })).status).toBe(409);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "credito", datos: { de_cada_10: { valor: 3, estado: "estimado" } } })).status).toBe(200);
    expect(b.tablas.ficha_negocio![0]!.credito).toMatchObject({ dias: { valor: 45, estado: "comprobado" }, de_cada_10: { valor: 3 } });
    // La consultora sí lo cambia.
    como(CONSULTORA);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "historia", datos: { anio_inicio: { valor: 2016, estado: "comprobado" } } })).status).toBe(200);
  });

  it("con «productos» abierta: el dueño contesta los sí/no, y un «sí» le deja llenar ese bloque (moneda, crédito, inventario); sin el «sí», no", async () => {
    const b = base();
    await activar("productos");
    como(DUENA);
    // Antes de decir que sí: el bloque y las ventas en otra moneda siguen cerrados.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "moneda", datos: { vende_en: ["CLP"] } })).status).toBe(403);
    expect((await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 1000000 })).status).toBe(403);
    // «Sí, me pagan en otra moneda»: ya puede llenar ese bloque y anotar sus ventas.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modulos", datos: { moneda: true } })).status).toBe(200);
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "moneda", datos: { vende_en: ["CLP"], costos_en: "PEN" } })).status).toBe(200);
    const op = await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 1000000, tc_cotizado: 0.0041 });
    expect(op.status).toBe(201);
    const oid = String((op.body.operacion as Fila).id);
    expect((await llamar(MONEDA_OP, "PATCH", { id: EMP, oid }, { recibido: 3700 })).status).toBe(200);
    // El crédito no se contestó: sigue cerrado.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "credito", datos: { de_cada_10: { valor: 3, estado: "estimado" } } })).status).toBe(403);
    // Si después dice que no, se vuelve a cerrar.
    expect((await llamar(NEGOCIO, "PATCH", { id: EMP }, { bloque: "modulos", datos: { moneda: false } })).status).toBe(200);
    expect((await llamar(MONEDA, "POST", { id: EMP }, { moneda: "CLP", monto: 500000 })).status).toBe(403);
    expect(b.tablas.operaciones_moneda).toHaveLength(1);
  });

  it("cobrando por hora, lo que la consultora comprobó del precio tampoco cambia por la puerta de datos_modelo o de las horas", async () => {
    const L_HORA = "22222222-2222-4222-8222-222222222222";
    base({
      lineas_producto: [
        { id: L_HORA, company_id: EMP, codigo: null, nombre: "Asesoría laboral", tipo: "servicio", precio: 150, horas_por_unidad: 6, costo_variable_unitario: 300, origen: "declarado", decision: null, decision_motivo: null, estados: { precio: "comprobado" }, componentes_costo: [], datos_modelo: { por_hora: true }, creada_por: DUENA.id },
      ],
    });
    await activar("productos");
    como(DUENA);
    expect((await llamar(LINEA, "PATCH", { id: EMP, lid: L_HORA }, { datos_modelo: { por_hora: null } })).status).toBe(409);
    expect((await llamar(LINEA, "PATCH", { id: EMP, lid: L_HORA }, { horas_por_unidad: 8 })).status).toBe(409);
    // Lo que no es del precio, sí: el costo, aunque datos_modelo viaje entero con lo del precio igual.
    expect((await llamar(LINEA, "PATCH", { id: EMP, lid: L_HORA }, { costo_variable_unitario: 280, datos_modelo: { por_hora: true, rango_costo: null } })).status).toBe(200);
  });
});

describe("la ruta: la consultora marca; el dueño ve sus etapas", () => {
  it("el veredicto exige su motivo; con motivo se guarda y la etapa pasa; el dueño no marca", async () => {
    const b = base();
    como(CONSULTORA);
    expect(await llamar(RUTA, "PATCH", { id: EMP }, { veredicto: { etapa: "diagnostico", valor: "verde" } })).toEqual({ status: 400, body: { error: TEXTO_VEREDICTO_SIN_MOTIVO } });
    expect((await llamar(RUTA, "PATCH", { id: EMP }, { marca: { clave: "diagnostico.numeros", valor: "cumple" } })).status).toBe(400);
    const r = await llamar(RUTA, "PATCH", { id: EMP }, { hora_cierre: "19:00", marca: { clave: "diagnostico.fugas", valor: "cumple", nota: "cuatro fugas con su cuenta" }, veredicto: { etapa: "diagnostico", valor: "verde", nota: "Firmado el día 5" } });
    expect(r.status).toBe(200);
    expect(b.tablas.companies![0]!.hora_cierre).toBe("19:00");
    expect(b.tablas.ruta_marcas!.map((m) => [m.clave, m.valor])).toEqual([["diagnostico.fugas", "cumple"], ["diagnostico.compuerta", "verde"]]);
    expect(((r.body.avance as Fila).etapas as Fila[]).map((e) => e.estado)).toEqual(["pasada", "en_curso"]);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: "ruta", accion: "editar" }));
    como(DUENA);
    expect((await llamar(RUTA, "PATCH", { id: EMP }, { tipo_trabajo: "sistematizar_directo" })).status).toBe(403);
  });

  it("el dueño lee sus etapas: sin criterios, sin notas, sin veredictos", async () => {
    base({ ruta_marcas: [{ id: "m1", company_id: EMP, clave: "diagnostico.compuerta", valor: "ambar", nota: "NOTA-INTERNA", marcado_at: "2026-10-23T15:00:00Z" }] });
    como(DUENA);
    const r = await llamar(RUTA, "GET", { id: EMP });
    expect(r.status).toBe(200);
    const avance = r.body.avance as Fila;
    expect(Object.keys(avance).sort()).toEqual(["actual", "dia", "etapas", "hastaDia"]);
    expect(JSON.stringify(avance)).not.toMatch(/NOTA-INTERNA|criterios|veredicto|compuerta/);
    como(CONSULTORA);
    const c = await llamar(RUTA, "GET", { id: EMP });
    expect(((c.body.avance as Fila).etapas as Fila[])[0]).toMatchObject({ clave: "diagnostico", compuerta: expect.objectContaining({ veredicto: "ambar" }) });
  });
});

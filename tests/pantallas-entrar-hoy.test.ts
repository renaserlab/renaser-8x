/**
 * LAS PANTALLAS DE «QUE EL CLIENTE ENTRE HOY» (16-10-2026), RENDERIZADAS A HTML EN NODE.
 *
 * Lo que se fija:
 *  - «Lo que te pidió tu consultora» muestra solo lo activo, nunca lo retirado, y a la base solo se le piden las
 *    activas y completadas;
 *  - «Lo que vendes» es editable solo con la sección abierta (y prellenada con lo que ya hay); sin la sección no hay un
 *    solo control de escribir; sin datos nuevos queda exactamente como antes;
 *  - ninguna pantalla del dueño dice «contribución», «costo variable», «SKU», «matriz», «KPI», «claim», «extraído»
 *    ni «IA», ni pinta un «S/ 0» inventado;
 *  - «Tus gastos del mes» muestra el gasto fijo de los 9 números al lado, sin elegir uno;
 *  - «Cobros y mercadería» abre cada bloque solo con su «sí»;
 *  - el tablero de la consultora pinta los cuatro cuadrantes con datos de una empresa ficticia, «sin dato» rayado, y la
 *    ruta dice «no se pudo leer» donde no pudo leer;
 *  - «Activar para el cliente» lista las 11 secciones.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts; la sesión y el contexto del portal los pone la prueba. Las pantallas se renderizan a
 * HTML con renderToStaticMarkup: nadie las abrió en un navegador, y lo que pasa al tocar un botón (guardar al salir de
 * la tarjeta, copiar el enlace) no se ejecuta aquí. Todas las empresas y productos son FICTICIOS (regla del 70a3701).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {}, usePathname: () => "/portal" }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));

import { tableroRentabilidad, FICHA_VACIA } from "@/lib/rentabilidad";
import { avanceRuta, type HechosRuta } from "@/lib/ruta";
import { SECCIONES, SECCIONES_QUE_ACTIVA_LA_CONSULTORA, SECCION, TEXTO_SECCION_CERRADA, type Solicitud } from "@/lib/secciones";
import { TEXTO_CERRADA_VACIA } from "@/components/negocio/datos";
import { porDefecto } from "@/lib/formato";
import type { LineaProducto } from "@/lib/producto";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Dueña" };
const PARTICIPANTE = { id: "00000000-0000-4000-8000-0000000000a2", rol: "cliente", nombre: "Equipo" };
const AHORA = "2026-10-16T15:00:00.000Z";

/** Lo que el dueño nunca lee: palabras del método y de la base. */
const PROHIBIDAS = /contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|decisi[oó]n|INTERNO/i;
/** Un cero en dinero que nadie dijo: «S/ 0» seguido de algo que no es un decimal. */
const CERO_INVENTADO = /S\/\s0(?![.,]?\d)/;

const sol = (seccion: string, estadoSol: "activa" | "completada" | "retirada", extra: Fila = {}): Fila => ({
  id: `s-${seccion}-${estadoSol}`,
  company_id: EMP,
  seccion,
  nota: null,
  estado: estadoSol,
  activada_at: "2026-10-16T13:00:00.000Z",
  completada_at: estadoSol === "completada" ? "2026-10-17T15:00:00.000Z" : null,
  retirada_at: estadoSol === "retirada" ? "2026-10-16T14:00:00.000Z" : null,
  activada_por: "00000000-0000-4000-8000-0000000000c1",
  ...extra,
});

const JEAN: Fila = {
  id: "11111111-1111-4111-8111-000000000001",
  company_id: EMP,
  codigo: null,
  nombre: "Jean Clásico",
  tipo: "producto",
  precio: 80,
  costo_variable_unitario: 35,
  unidades_periodo: null,
  periodo: null,
  origen: "declarado",
  decision: "retirar",
  decision_motivo: "INTERNO",
  modelo: "fabrica_y_vende",
  grupo: "Pantalones",
  componentes_costo: [{ nombre: "tela", valor: 20, estado: "contado" }, { nombre: "costura", valor: 15, estado: "estimado" }],
  unidades_mes: 120,
  estados: { precio: "contado", costo: "estimado", unidades: "estimado" },
  creada_por: DUENA.id,
  created_at: "2026-10-16T13:30:00.000Z",
};

/** Una empresa con su dueña, una participante y lo que se le pase. */
function base(extra: Record<string, Fila[]> = {}): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", modelo_negocio: ["fabrica_y_vende"], tipo_trabajo: "estructurar", ruta_inicio: "2026-10-12", hora_cierre: null, modelo_operativo: ["produccion"] }],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }, { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" }],
    ...extra,
  });
  estado.base = b;
  return b;
}
const comoDuena = () => (estado.portal = { companyId: EMP, queFalta: "", u: DUENA });

const html = async (pagina: () => Promise<React.ReactElement> | React.ReactElement) => renderToStaticMarkup(await pagina());

beforeAll(async () => {
  await Promise.all([
    import("@/app/(cliente)/portal/pedidos/page"),
    import("@/app/(cliente)/portal/producto/page"),
    import("@/app/(cliente)/portal/costos/page"),
    import("@/app/(cliente)/portal/historia/page"),
    import("@/app/(cliente)/portal/cobros/page"),
    import("@/components/negocio/TableroRentabilidad"),
    import("@/components/consultor/MarcarCompuerta"),
    import("@/components/consultor/ActivarParaCliente"),
  ]);
}, 180_000);

// ─────────────────────── Lo que te pidió tu consultora ───────────────────────

describe("dueño · /portal/pedidos", () => {
  it("solo lo activo, en el orden de SECCIONES, con la nota tal cual; lo retirado no aparece ni se pide a la base", async () => {
    const b = base({
      solicitudes_cliente: [
        sol("costos", "activa"),
        sol("productos", "activa", { nota: "Empieza por los jeans, después los polos." }),
        sol("historia", "completada"),
        sol("moneda", "retirada"),
        { ...sol("credito", "activa"), company_id: OTRA },
      ],
    });
    comoDuena();
    const { default: Pedidos } = await import("@/app/(cliente)/portal/pedidos/page");
    const h = await html(Pedidos);
    expect(h).toContain("Lo que te pidió tu consultora");
    expect(h).toContain(SECCION.productos.paraDueno);
    expect(h).toContain(SECCION.costos.paraDueno);
    expect(h.indexOf(SECCION.productos.paraDueno)).toBeLessThan(h.indexOf(SECCION.costos.paraDueno));
    expect(h).toContain("«Empieza por los jeans, después los polos.»");
    expect(h).toContain('href="/portal/producto"');
    expect(h).toContain('href="/portal/costos"');
    expect(h.match(/>Empezar</g) ?? []).toHaveLength(2);
    // Lo entregado, abajo y plegado; lo retirado y lo de otra empresa, en ningún lado.
    expect(h).toContain("Ya entregaste (1)");
    expect(h).not.toContain(SECCION.moneda.paraDueno);
    expect(h).not.toContain(SECCION.credito.paraDueno);
    // Se filtra en la consulta: sin retiradas y sin quién activó.
    const consulta = b.pedidos.find((p) => p.tabla === "solicitudes_cliente" && p.op === "select")!;
    expect(consulta.columnas).not.toMatch(/activada_por|retirada_at/);
    expect(consulta.filtros).toContainEqual(["in", "estado", ["activa", "completada"]]);
    expect(h).not.toMatch(PROHIBIDAS);
  });

  it("sin pedidos lo dice en una frase; si la tabla no existe, no lo disfraza de «no te pidió nada»", async () => {
    base({ solicitudes_cliente: [] });
    comoDuena();
    const { default: Pedidos } = await import("@/app/(cliente)/portal/pedidos/page");
    expect(await html(Pedidos)).toContain("Tu consultora no te ha pedido nada por ahora.");
    estado.base = crearBaseFalsa({ companies: [{ id: EMP }] }, { solicitudes_cliente: { code: "42P01", message: 'relation "solicitudes_cliente" does not exist' } });
    const h = await html(Pedidos);
    expect(h).toContain("Todavía no podemos mostrarte esta parte");
    expect(h).not.toContain("no te ha pedido nada");
    expect(h).not.toMatch(/migraci[oó]n|tabla|supabase/i);
  });
});

// ─────────────────────── Lo que vendes ───────────────────────

describe("dueño · /portal/producto «Lo que vendes»", () => {
  it("con «productos» abierta: la tabla editable, prellenada con lo que ya hay, y «Listo, ya lo llené»", async () => {
    base({ solicitudes_cliente: [sol("productos", "activa", { nota: "Anota los tres que más vendes." })], lineas_producto: [JEAN] });
    comoDuena();
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const h = await html(LoQueVendes);
    expect(h).toContain("Jean Clásico");
    expect(h).toContain("Pantalones");
    expect(h).toContain("S/ 80");
    expect(h).toContain(">120<");
    expect(h).toContain("Al mes te deja S/ 5,400.");
    expect(h).toContain("Tu consultora te dice: «Anota los tres que más vendes.»");
    expect(h).toContain(">Llenar<");
    expect(h).toContain("Agregar un producto o servicio");
    expect(h).toContain("Agregar varios de una vez");
    expect(h).toContain("Listo, ya lo llené");
    expect(h).not.toMatch(PROHIBIDAS);
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("con la sección abierta y sin saber cómo gana dinero, primero esa pregunta (los seis modelos)", async () => {
    const b = base({ solicitudes_cliente: [sol("productos", "activa")], lineas_producto: [] });
    b.tablas.companies![0]!.modelo_negocio = null;
    comoDuena();
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const h = await html(LoQueVendes);
    expect(h).toContain("¿Cómo gana dinero tu negocio?");
    for (const m of ["Fabrico y vendo", "Compro y revendo", "Cobro por hora o por caso", "Vendo proyectos", "Intermedio y cobro comisión", "Preparo y sirvo"]) expect(h).toContain(m);
    expect(h).not.toContain("Agregar un producto o servicio");
    // Sin nada anotado no hay qué avisarle a la consultora: «Listo» no aparece mientras elige cómo gana dinero.
    expect(h).not.toContain("Listo, ya lo llené");
  });

  it("una participante con la sección abierta ve la tabla, pero no escribe", async () => {
    base({ solicitudes_cliente: [sol("productos", "activa")], lineas_producto: [JEAN] });
    estado.portal = { companyId: EMP, queFalta: "", u: PARTICIPANTE };
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const h = await html(LoQueVendes);
    expect(h).toContain("Jean Clásico");
    expect(h).toContain("Esto lo llena el dueño de la empresa");
    expect(h).toContain(">Ver<");
    expect(h).not.toContain("Agregar un producto o servicio");
    expect(h).not.toContain("Listo, ya lo llené");
  });

  it("cerrada y con datos nuevos: para leer, sin un solo control de escribir", async () => {
    base({ solicitudes_cliente: [sol("productos", "completada")], lineas_producto: [JEAN] });
    comoDuena();
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const h = await html(LoQueVendes);
    expect(h).toContain("Lo que más te deja al mes");
    expect(h).toContain("Jean Clásico: S/ 5,400 al mes");
    expect(h).toContain("Se lo hiciste saber a tu consultora el 17 de octubre.");
    expect(h).not.toMatch(/<button|<input|<textarea|<select/);
    expect(h).not.toMatch(PROHIBIDAS);
  });

  it("cerrada y sin datos nuevos: exactamente la vista de antes", async () => {
    const viejo = { ...JEAN, modelo: null, grupo: null, componentes_costo: [], unidades_mes: null, estados: {}, unidades_periodo: 30, periodo: "2026-09" };
    base({ lineas_producto: [viejo] });
    comoDuena();
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const h = await html(LoQueVendes);
    expect(h).toContain("Tus productos y servicios");
    expect(h).toContain("todavía no descuenta el alquiler, los sueldos ni los demás gastos del mes");
    expect(h).toContain("Te deja S/ 45 por unidad.");
    expect(h).not.toMatch(/<button|<input/);
  });
});

// ─────────────────────── Gastos, historia, cobros ───────────────────────

describe("dueño · /portal/costos, /portal/historia, /portal/cobros", () => {
  const COSTOS: Fila[] = [
    { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler", monto: 2000, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1, creado_por: DUENA.id },
    { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", monto: null, monto_desde: 3000, monto_hasta: 3500, estado: "estimado", nota: null, orden: 2, creado_por: DUENA.id },
    { id: "c3", company_id: EMP, periodo: "mes_tipico", tipo: "comercializacion", nombre: "Publicidad", monto: null, monto_desde: null, monto_hasta: null, estado: "no_lo_se", nota: null, orden: 1, creado_por: DUENA.id },
  ];

  it("costos: el gasto fijo de los 9 números al lado, sin elegir; lo que no se sabe no se suma como cero", async () => {
    base({
      solicitudes_cliente: [sol("costos", "activa")],
      costos_mes: COSTOS,
      company_metricas: [{ company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 4000, estado: "contado" }],
    });
    comoDuena();
    const { default: TusGastos } = await import("@/app/(cliente)/portal/costos/page");
    const h = await html(TusGastos);
    expect(h).toContain("Lo que pagas sí o sí, vendas o no vendas");
    expect(h).toContain("Lo que gastas para vender");
    expect(h).toContain("En Tus números dijiste S/ 4,000 de gastos fijos; aquí suman entre S/ 5,000 y S/ 5,500.");
    expect(h).toContain("Sin el monto de Publicidad no hay total.");
    expect(h).not.toMatch(/elegimos|nos quedamos con|se usa el/i);
    expect(h).toContain("Listo, ya lo llené");
    expect(h).not.toMatch(PROHIBIDAS);
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("costos, historia y cobros cerrados y vacíos: qué es y que la abre la consultora, sin botones de escribir", async () => {
    base({ solicitudes_cliente: [], costos_mes: [], ficha_negocio: [], operaciones_moneda: [] });
    comoDuena();
    const PAGINAS = {
      costos: (await import("@/app/(cliente)/portal/costos/page")).default,
      historia: (await import("@/app/(cliente)/portal/historia/page")).default,
      cobros: (await import("@/app/(cliente)/portal/cobros/page")).default,
    };
    for (const [ruta, Pagina] of Object.entries(PAGINAS)) {
      const h = await html(Pagina);
      // Cerrada y vacía: no hay nada que corregir, así que no se invita a «corregir algo» (texto cambiado el 16-10).
      expect(h, ruta).toContain(TEXTO_CERRADA_VACIA);
      expect(h, ruta).not.toContain(TEXTO_SECCION_CERRADA);
      expect(h, ruta).not.toMatch(/<button|<input|<textarea|<select/);
      expect(h, ruta).not.toMatch(PROHIBIDAS);
    }
  });

  it("historia abierta: cinco preguntas, la venta de la mejor época traída de los 9 números", async () => {
    base({
      solicitudes_cliente: [sol("historia", "activa")],
      ficha_negocio: [{ company_id: EMP, historia: { anio_inicio: { valor: 2012, estado: "contado" } }, modulos: {}, totales: {}, moneda: {}, credito: {}, inventario: {} }],
      company_metricas: [{ company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado" }],
    });
    comoDuena();
    const { default: TuHistoria } = await import("@/app/(cliente)/portal/historia/page");
    const h = await html(TuHistoria);
    for (const p of ["¿En qué año empezó tu negocio?", "En tu primer mes completo, ¿cuánto vendiste?", "¿Cuál fue el mes que más vendiste en toda la historia del negocio?", "¿Cuánto vendiste ese mes?", "Ese mes, ¿qué estaba pasando en el negocio?", "¿En qué mes notaste que empezaba a bajar?", "Ese mes, ¿qué cambió?", "¿Qué haces hoy distinto a como lo hacías en tu mejor época?"]) expect(h).toContain(p);
    expect(h).toContain('value="2012"');
    expect(h).toContain('value="60000"');
    expect(h).toContain("Lo trajimos de Tus números.");
    expect(h).toContain("No ha bajado");
    expect(h).not.toMatch(PROHIBIDAS);
  });

  it("cobros: cada bloque se abre solo con su «sí»; por venta, lo que esperaba y lo que le llegó", async () => {
    const b = base({
      solicitudes_cliente: [sol("moneda", "activa"), sol("credito", "activa")],
      ficha_negocio: [{ company_id: EMP, historia: {}, modulos: { moneda: true, credito: false }, totales: {}, moneda: { vende_en: ["CLP"] }, credito: {}, inventario: {} }],
      operaciones_moneda: [
        { id: "o1", company_id: EMP, fecha_venta: "2026-09-01", fecha_cobro: "2026-09-20", dias_cobro: 19, moneda: "CLP", monto: 1000000, tc_cotizado: 0.004, tc_cobro: 0.0038, recibido: 3650, comisiones: 50, conversiones: 2, estado: "contado", creado_por: DUENA.id, created_at: AHORA },
      ],
    });
    comoDuena();
    const { default: Cobros } = await import("@/app/(cliente)/portal/cobros/page");
    let h = await html(Cobros);
    expect(h).toContain('id="moneda"');
    expect(h).toContain('id="credito"');
    expect(h).toContain('id="inventario"');
    expect(h).toContain("Tus ventas cobradas en otra moneda");
    expect(h).toContain("Esperabas S/ 4,000 y te llegaron S/ 3,650: S/ 350 se quedaron en el camino.");
    // Crédito dijo «no» e inventario no respondió: sus preguntas no aparecen.
    expect(h).not.toContain("De tus últimas 10 ventas, ¿cuántas fiaste?");
    expect(h).not.toContain("¿Cuánto dinero tienes hoy en mercadería o materiales guardados?");
    expect(h).not.toMatch(PROHIBIDAS);
    expect(h).not.toMatch(CERO_INVENTADO);

    b.tablas.ficha_negocio![0]!.modulos = { moneda: false, credito: true };
    h = await html(Cobros);
    expect(h).toContain("De tus últimas 10 ventas, ¿cuántas fiaste?");
    expect(h).toContain("De las últimas 10 ventas que fiaste, ¿cuántas nunca llegaste a cobrar?");
    expect(h).not.toContain("Tus ventas cobradas en otra moneda");
    expect(h).not.toContain("Tu última venta en otra moneda, ¿en cuántos días te la pagaron?");
  });

  it("cobros con solo «Lo que vendes» abierta: las tres preguntas de sí o no se contestan; un «sí» deja llenar su bloque", async () => {
    const b = base({
      solicitudes_cliente: [sol("productos", "activa")],
      ficha_negocio: [{ company_id: EMP, historia: {}, modulos: {}, totales: {}, moneda: {}, credito: {}, inventario: {} }],
      operaciones_moneda: [],
    });
    comoDuena();
    const { default: Cobros } = await import("@/app/(cliente)/portal/cobros/page");
    let h = await html(Cobros);
    expect(h).not.toContain(TEXTO_SECCION_CERRADA);
    for (const p of ["¿Te pagan en otra moneda?", "¿Vendes al crédito o fías?", "¿Guardas mercadería o materiales?"]) expect(h).toContain(p);
    // Los sí/no son botones (se pueden contestar), no texto de solo lectura.
    expect(h.match(/aria-pressed=/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(h).not.toContain("Sin responder");
    // Dijo que sí le pagan en otra moneda: el bloque se llena (cajas, no solo lectura); el crédito, sin responder, no.
    b.tablas.ficha_negocio![0]!.modulos = { moneda: true };
    h = await html(Cobros);
    expect(h).toContain('aria-label="En qué moneda te pagan"');
    expect(h).toContain("Anotar una venta");
    expect(h).not.toContain("De tus últimas 10 ventas, ¿cuántas fiaste?");
  });
});

describe("dueño · la tabla de lo que vende, sin tedio", () => {
  it("«Copiar las partes con sus montos» aparece si el producto anterior tiene montos; precio y «de cada 10» aceptan rango", async () => {
    const { TablaProductos } = await import("@/components/negocio/TablaProductos");
    const { desdeFila } = await import("@/lib/producto");
    const otro: Fila = { ...JEAN, id: "11111111-1111-4111-8111-000000000002", nombre: "Pantalón Cargo", componentes_costo: [], datos_modelo: { rango_precio: { desde: 62, hasta: 66 }, rango_de_cada_10: { desde: 3, hasta: 4 } }, precio: null, unidades_mes: null };
    const lineas = [desdeFila(JEAN), desdeFila(otro)];
    const h = renderToStaticMarkup(
      createElement(TablaProductos, { companyId: EMP, modo: "dueno", lineas, modelos: ["fabrica_y_vende"], totales: {}, editable: true, usuarioId: DUENA.id, config: porDefecto, deja: {} })
    );
    // La fila lee el rango como rango, nunca su centro.
    expect(h).toContain("entre S/ 62 y S/ 66");
    expect(h).toContain("3 a 4 de cada 10 Pantalones");
    expect(h).not.toContain("S/ 64");
    expect(h).not.toMatch(PROHIBIDAS);
  });

  it("quien cobra por hora lo dice: el precio se pregunta por hora y la fila lo muestra con las horas de un caso", async () => {
    const { MODELO } = await import("@/lib/negocio");
    expect(MODELO.vende_horas_o_casos.preguntaPrecio).toBe("¿Cuánto cobraste por el último caso?");
    expect(MODELO.vende_horas_o_casos.preguntaPrecioPorHora).toBe("¿Cuánto cobraste por hora la última vez?");
    const { TablaProductos } = await import("@/components/negocio/TablaProductos");
    const { desdeFila } = await import("@/lib/producto");
    const hora: Fila = { ...JEAN, id: "11111111-1111-4111-8111-000000000003", nombre: "Asesoría laboral", tipo: "servicio", modelo: "vende_horas_o_casos", grupo: null, precio: 150, horas_por_unidad: 6, componentes_costo: [], costo_variable_unitario: 300, datos_modelo: { por_hora: true } };
    const h = renderToStaticMarkup(
      createElement(TablaProductos, { companyId: EMP, modo: "dueno", lineas: [desdeFila(hora)], modelos: ["vende_horas_o_casos"], totales: {}, editable: true, usuarioId: DUENA.id, config: porDefecto, deja: {} })
    );
    expect(h).toContain("S/ 150 por hora · 6 h por caso");
  });
});

// ─────────────────────── La consultora ───────────────────────

/** Una línea ficticia con datos completos (o sin costo, si se pide). */
const linea = (id: string, nombre: string, precio: number, costo: number | null, unidades: number): LineaProducto => ({
  id, company_id: EMP, codigo: null, nombre, tipo: "producto", cliente_objetivo: null, necesidad: null, promesa: null,
  precio, costo_variable_unitario: costo, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null,
  decision: null, decision_motivo: null, modelo: "fabrica_y_vende", grupo: null, componentes_costo: [], unidades_mes: unidades,
  unidades_mes_desde: null, unidades_mes_hasta: null, participacion_de_10: null, estados: { precio: "contado", costo: "estimado", unidades: "estimado" },
});

describe("consultora · tablero de rentabilidad, ruta y activación", () => {
  it("el tablero pinta los cuatro cuadrantes con los umbrales de la empresa, y lo que no tiene datos va rayado", async () => {
    // Umbral de margen = 7.150 / 220 = 32,5 por unidad; de volumen = 220 / 4 = 55 al mes.
    const lineas = [
      linea("a", "Jean Clásico", 100, 40, 100), // deja 60 y se vende 100: estrella
      linea("b", "Polo Básico", 50, 45, 100), // deja 5 y se vende 100: caballo de trabajo
      linea("c", "Casaca de Cuero", 100, 40, 10), // deja 60 y se vende 10: joya escondida
      linea("d", "Short Playero", 50, 45, 10), // deja 5 y se vende 10: hueso
      linea("e", "Chaleco", 70, null, 20), // sin costo: sin dato
    ];
    const t = tableroRentabilidad({ lineas, costos: [], ficha: { ...FICHA_VACIA }, operaciones: [], metricas: [], config: porDefecto });
    expect(t.matriz.estrella).toEqual(["a"]);
    expect(t.matriz.caballo).toEqual(["b"]);
    expect(t.matriz.joya).toEqual(["c"]);
    expect(t.matriz.hueso).toEqual(["d"]);
    expect(t.matriz.sin_dato).toEqual(["e"]);
    const { TableroRentabilidad } = await import("@/components/negocio/TableroRentabilidad");
    const h = renderToStaticMarkup(createElement(TableroRentabilidad, { t, config: porDefecto, noLeido: ["los gastos del mes"], operaciones: [], pct: { precio: 5, parte: 10, volumen: 10 }, conservar: {} }));
    for (const c of ["Estrella", "Caballo de trabajo", "Joya escondida", "Hueso"]) expect(h).toContain(c);
    expect(h).toContain("umbral: S/ 32.50 por unidad");
    expect(h).toContain("umbral: 55 al mes");
    expect(h).toContain("no es la regla del 70 % de la ingeniería de menú");
    expect(h).toContain('class="sin-dato"');
    expect(h).toContain("1 sin dato para la matriz");
    expect(h).toContain("No se pudo leer: los gastos del mes.");
    // 90/10, equilibrio sin gastos y palancas, con su cuenta a la vista.
    expect(h).toContain("90/10");
    expect(h).toContain("Cómo se calculó");
    expect(h).toContain("Si subes el precio un 5 % y vendes lo mismo,");
    expect(h).not.toMatch(/vas a ganar/i);
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("la ruta dice «no se pudo leer» donde no pudo leer, rayado, y nunca sugiere verde", async () => {
    const hechos: HechosRuta = {
      tipo: "estructurar", inicio: "2026-10-12", zona: "America/Lima",
      numeros: null, lineaBase: null, productos: { lineas: 3, completas: 3 }, costos: { conMonto: 2 }, historia: { respondidas: 5 },
      pedidos: { activadas: 0, completadas: 0, abiertas: 0 }, planAceptado: null, indicadores: null, revisiones: null, plan: null,
      organigrama: null, procesos: null, cortes: null, marcas: {},
    };
    const avance = avanceRuta(hechos, new Date(AHORA));
    const { MarcarCompuerta } = await import("@/components/consultor/MarcarCompuerta");
    const h = renderToStaticMarkup(createElement(MarcarCompuerta, { companyId: EMP, avance }));
    expect(h).toContain('<span class="sin-dato">no se pudo leer</span>');
    expect(h).toContain("8X no sugiere color: hay datos que no se pudieron leer");
    expect(h).not.toContain("8X sugiere verde");
    expect(h).toContain("Diagnóstico y plan");
    expect(h).toContain("Cumple");
    expect(h).toContain("Guardar el veredicto");
    // Sin avance (migración pendiente) o sin tipo de trabajo: una frase, no una ruta vacía.
    expect(renderToStaticMarkup(createElement(MarcarCompuerta, { companyId: EMP, avance: null }))).toContain("La ruta todavía no está habilitada en esta base.");
  });

  it("«Activar para el cliente» lista las 11 secciones en tres grupos, con su estado", async () => {
    const { ActivarParaCliente } = await import("@/components/consultor/ActivarParaCliente");
    const vacio = renderToStaticMarkup(createElement(ActivarParaCliente, { companyId: EMP, solicitudes: [], contexto: { porConfirmar: 3, faltanNumeros: 4 } }));
    for (const s of SECCIONES_QUE_ACTIVA_LA_CONSULTORA) expect(vacio).toContain(SECCION[s].paraConsultora);
    expect(SECCIONES_QUE_ACTIVA_LA_CONSULTORA).toHaveLength(11);
    // «preguntas_estrategia» es la duodécima y no lleva casilla: la abre solo el envío de las preguntas (spec-estrategia-8x.md §7.4).
    expect(SECCIONES).toHaveLength(12);
    expect(vacio).not.toContain(SECCION.preguntas_estrategia.paraConsultora);
    expect(vacio.match(/type="checkbox"/g) ?? []).toHaveLength(11);
    for (const g of ["Datos del negocio", "Confirmar", "Subir archivos"]) expect(vacio).toContain(g);
    expect(vacio).toContain("Hoy hay 3 puntos marcados para confirmar.");
    expect(vacio).toContain("Faltan 4 de los 9 números.");
    expect(vacio).toContain("Activar las marcadas");

    const conPedidos: Solicitud[] = [
      { id: "s1", company_id: EMP, seccion: "productos", nota: "Los tres que más vendes", estado: "activa", activada_at: "2026-10-16T13:00:00.000Z", completada_at: null },
      { id: "s2", company_id: EMP, seccion: "historia", nota: null, estado: "completada", activada_at: "2026-10-15T13:00:00.000Z", completada_at: "2026-10-17T15:00:00.000Z" },
    ];
    const h = renderToStaticMarkup(createElement(ActivarParaCliente, { companyId: EMP, solicitudes: conPedidos, contexto: { porConfirmar: null, faltanNumeros: null } }));
    expect(h).toContain("Activa desde el 16-10");
    expect(h).toContain("Completada el 17-10");
    expect(h).toContain("Retirar");
    expect(h).toContain("Volver a pedir");
    expect(h).toContain('value="Los tres que más vendes"');
    // La activa no se vuelve a marcar: 10 casillas.
    expect(h.match(/type="checkbox"/g) ?? []).toHaveLength(10);
  });
});

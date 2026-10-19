/**
 * SEMBRAR LA DEMO DE RENASER OS EN EL SUPABASE LOCAL (Docker). NUNCA EN UN PROYECTO REMOTO.
 *
 *   npm run sembrar:os-demo        (node --env-file=.env.local --import=tsx scripts/os/sembrar-demo.mts)
 *
 * Deja «Distribuidora Andina (demo)» como si su equipo llevara dos semanas usando RENASER OS: la dueña con su cuenta
 * (rosa@andina.demo), seis personas con cuenta y una sin cuenta todavía, y los últimos 10 días hábiles con aperturas,
 * cierres, tareas en todos los estados, tramos de cronómetro (uno corriendo ahora y otro olvidado desde ayer),
 * bloqueos, prórrogas y un aplazamiento, tres proyectos, el objetivo de la semana, un legajo, dos acompañamientos, un
 * ciclo 360 a medias, dos entregables y los avisos que las reglas de la base habrían dejado.
 *
 * Reglas que cumple y por qué:
 *  - EL CANDADO VA PRIMERO (src/lib/entorno.ts): con ENTORNO=local, DESTINOS_PRUEBA=local y una URL local pasa; con
 *    cualquier otra cosa aborta sin escribir. Y además exige destino «local»: una demo con contraseña conocida no va a
 *    ningún proyecto remoto, ni siquiera al de prueba.
 *  - Es idempotente y solo toca lo suyo: si la empresa demo ya existe, la borra a ELLA (y, en cascada, todo lo suyo, y
 *    sus archivos del bucket os-entregables) y la vuelve a crear. Las cuentas @andina.demo se reutilizan y se les
 *    repone la contraseña de la demo. No toca ninguna otra empresa ni corre las reglas de la base (que avisarían a
 *    todas las empresas): los avisos de la demo se escriben con las mismas claves que usan las reglas, así pg_cron no
 *    los repite.
 *  - Las horas son de Lima (UTC−5 todo el año, sin horario de verano): «09:00» de un día es 09:00-05:00.
 *
 * FINANZAS (19-10-2026): además, la caja de la demo, para ver cómo alimenta a «Tus números» (ver `sembrarFinanzas`):
 * el saldo inicial en soles el día 1 del mes pasado, los movimientos del mes pasado (con una venta en dólares, y el mes
 * cerrado con su tipo de cambio) y los de este mes hasta hoy, cinco cobros y seis pagos que se repiten. Los cobros y
 * los pagos se pagan con las funciones de la base (como lo hace la aplicación): el pago y su movimiento nacen juntos.
 * Los tres meses anteriores quedan «contados de memoria» en «Tus números»: así se ve qué sale de la caja y qué no.
 */
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirDestinoEscritura, DestinoNoAutorizado, type Variables } from "../../src/lib/entorno";
import { hoyEn, sumarDias, lunesDe, siguienteDiaHabil } from "../../src/lib/os/calculos";
import { sumarMeses } from "../../src/lib/fin/calculos";

export const EMPRESA_DEMO = "Distribuidora Andina (demo)";
export const CLAVE_DEMO = "andina-demo-2026";
const BUCKET = "os-entregables";
const ZONA = "America/Lima";

type Admin = SupabaseClient;
type Rol = "dueno" | "gerente" | "operaciones" | "talento" | "persona";
type Quien = "rosa" | "carla" | "luis" | "maria" | "jose" | "jorge" | "ana" | "pedro";

/** El equipo. Pedro no tiene cuenta: muestra la ficha que espera a que su dueño de correo entre. */
export const EQUIPO: { clave: Quien; nombre: string; email: string; rol: Rol; puesto: string; area: string; cuenta: boolean }[] = [
  { clave: "rosa", nombre: "Rosa Quispe", email: "rosa@andina.demo", rol: "dueno", puesto: "Gerente general", area: "Dirección", cuenta: true },
  { clave: "carla", nombre: "Carla Mendoza", email: "carla@andina.demo", rol: "persona", puesto: "Ejecutiva de ventas", area: "Ventas", cuenta: true },
  { clave: "luis", nombre: "Luis Huamán", email: "luis@andina.demo", rol: "persona", puesto: "Contador", area: "Contabilidad", cuenta: true },
  { clave: "maria", nombre: "María Torres", email: "maria@andina.demo", rol: "operaciones", puesto: "Jefa de operaciones", area: "Operaciones", cuenta: true },
  { clave: "jose", nombre: "José Ramírez", email: "jose@andina.demo", rol: "persona", puesto: "Despachador", area: "Despacho", cuenta: true },
  { clave: "jorge", nombre: "Jorge Salazar", email: "jorge@andina.demo", rol: "persona", puesto: "Almacenero", area: "Almacén", cuenta: true },
  { clave: "ana", nombre: "Ana Flores", email: "ana@andina.demo", rol: "talento", puesto: "Administración y RR.HH.", area: "Administración", cuenta: true },
  { clave: "pedro", nombre: "Pedro Rojas", email: "pedro@andina.demo", rol: "persona", puesto: "Vendedor", area: "Ventas", cuenta: false },
];

/** Lo que cada uno hace en un día normal: de aquí salen las tareas ya terminadas de los días pasados. */
const RUTINA: Record<Exclude<Quien, "pedro">, string[]> = {
  rosa: ["Revisar el flujo de caja", "Aprobar compras de la semana", "Reunión con proveedores", "Visitar a un cliente mayorista"],
  carla: ["Cotización a cliente nuevo", "Seguimiento de pedidos por WhatsApp", "Visita a ferretería del Cono Norte", "Actualizar cartera de clientes"],
  luis: ["Registrar facturas de compra", "Cuadre de caja del día", "Declaración de detracciones", "Conciliar cuenta del banco"],
  maria: ["Programar despachos del día", "Revisar stock crítico", "Coordinar con transporte", "Control de calidad de recepción"],
  jose: ["Armar ruta del día", "Despachar pedidos de Lima Sur", "Guías de remisión", "Confirmar entregas con clientes"],
  jorge: ["Recepción de mercadería", "Ordenar ubicaciones del almacén 1", "Conteo cíclico de pinturas", "Preparar pedidos para despacho"],
  ana: ["Planilla de la quincena", "Archivar contratos", "Coordinar exámenes médicos", "Registro de asistencia"],
};

const ANIMO: Record<string, number[]> = {
  rosa: [4, 4, 3, 4, 5, 4, 3, 4, 4, 4],
  carla: [4, 5, 4, 3, 4, 5, 4, 4, 3, 4],
  luis: [3, 3, 4, 3, 2, 3, 4, 3, 3, 3],
  maria: [5, 4, 5, 5, 4, 5, 4, 5, 5, 5],
  jose: [3, 2, 3, 2, 3, 3, 2, 3, 2, 2],
  jorge: [3, 4, 3, 3, 4, 3, 3, 4, 3, 3],
  ana: [4, 3, 4, 4, 3, 4, 3, 4, 4, 3],
};

/** Un instante de Lima: «2026-10-19» + «09:05» → ISO con −05:00. */
export function enLima(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-05:00`).toISOString();
}

/** Los últimos `n` días hábiles (lunes a viernes) que terminan en `hasta` (incluido si es hábil). */
export function diasHabilesHasta(hasta: string, n: number): string[] {
  const dias: string[] = [];
  for (let d = hasta; dias.length < n; d = sumarDias(d, -1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) dias.unshift(d);
  }
  return dias;
}

function fallo(que: string, e: { message: string } | null | undefined): never {
  throw new Error(`No se pudo ${que}: ${e?.message ?? "sin respuesta"}`);
}

async function insertar(sb: Admin, tabla: string, filas: Record<string, unknown>[], columnas = "id"): Promise<Record<string, string>[]> {
  if (!filas.length) return [];
  // defaultToNull: false → una columna que una fila no trae toma su valor por defecto (no NULL) aunque otra fila sí la traiga.
  const { data, error } = await sb.from(tabla).insert(filas, { defaultToNull: false }).select(columnas);
  if (error) fallo(`sembrar ${tabla}`, error);
  return (data ?? []) as unknown as Record<string, string>[];
}

async function asegurarCuenta(sb: Admin, email: string, nombre: string): Promise<string> {
  const { data: ya, error: e0 } = await sb.from("users").select("id").eq("email", email).maybeSingle();
  if (e0) fallo(`leer users (${email})`, e0);
  if (ya) {
    // Ya existía de una corrida anterior: se le repone la contraseña de la demo para que el ingreso impreso funcione.
    const { error } = await sb.auth.admin.updateUserById(ya.id, { password: CLAVE_DEMO, user_metadata: { nombre } });
    if (error) fallo(`reponer la contraseña de ${email}`, error);
    await sb.from("users").update({ nombre, rol: "cliente" }).eq("id", ya.id);
    return ya.id;
  }
  const { data, error } = await sb.auth.admin.createUser({ email, password: CLAVE_DEMO, email_confirm: true, user_metadata: { nombre } });
  if (error || !data?.user) fallo(`crear la cuenta ${email}`, error);
  // El disparador handle_new_user crea la fila en users; el upsert la asegura aunque el disparador no estuviera.
  const { error: e2 } = await sb.from("users").upsert({ id: data.user.id, email, nombre, rol: "cliente" }, { onConflict: "id" });
  if (e2) fallo(`asegurar users (${email})`, e2);
  return data.user.id;
}

/** Borra la empresa demo (y en cascada todo lo suyo) y sus archivos del bucket. Solo la que se llama EMPRESA_DEMO. */
async function borrarDemoAnterior(sb: Admin): Promise<number> {
  const { data: viejas, error } = await sb.from("companies").select("id").eq("nombre", EMPRESA_DEMO);
  if (error) fallo("buscar la demo anterior", error);
  for (const { id } of viejas ?? []) {
    const { data: carpetas } = await sb.storage.from(BUCKET).list(id, { limit: 1000 });
    for (const c of carpetas ?? []) {
      const { data: archivos } = await sb.storage.from(BUCKET).list(`${id}/${c.name}`, { limit: 1000 });
      const rutas = (archivos ?? []).map((a) => `${id}/${c.name}/${a.name}`);
      if (rutas.length) await sb.storage.from(BUCKET).remove(rutas);
    }
    const { error: e } = await sb.from("companies").delete().eq("id", id).eq("nombre", EMPRESA_DEMO);
    if (e) fallo(`borrar la demo anterior (${id})`, e);
  }
  return (viejas ?? []).length;
}

export type ResultadoDemo = {
  destino: string; companyId: string; reemplazadas: number; personas: number; tareas: number; avisos: number;
  finanzas: ResultadoFinanzas;
};

export type ResultadoFinanzas = { movimientos: number; cobros: number; pagos: number; pagosHechos: number; mesCerrado: string };

/** «2026-10» y un día → «2026-10-05»; un día que el mes no tiene, su último día (el 31 de un mes de 30 es el 30). */
function diaDelMes(mes: string, dia: number): string {
  const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Un movimiento escrito a mano: [día del mes, categoría, monto, detalle, moneda]. El tipo lo dice la categoría. */
type Mov = [dia: number, categoria: string, monto: number, detalle: string, moneda?: "PEN" | "USD"];

/** Lo que entra y sale a mano el mes pasado: ventas 41,000 en soles + US$ 600; costos variables 24,800; un retiro. */
const MOVIMIENTOS_MES_PASADO: Mov[] = [
  [2, "Venta al por mayor", 6800, "Pedido Constructora Lima Sur"],
  [3, "Mercadería e insumos", 9800, "Compra de pinturas al proveedor"],
  [5, "Venta en tienda", 3950, "Ventas de la semana"],
  [8, "Fletes y envíos", 700, "Flete a Huacho"],
  [9, "Venta al por mayor", 7200, "Ferretería Huáscar"],
  [11, "Mercadería e insumos", 7200, "Herramientas y fijaciones"],
  [12, "Venta en tienda", 4100, "Ventas de la semana"],
  [16, "Venta al por mayor", 5600, "Pinturas Rímac"],
  [18, "Venta al por mayor", 600, "Pedido de un cliente que paga en dólares", "USD"],
  [19, "Venta en tienda", 3850, "Ventas de la semana"],
  [20, "Mercadería e insumos", 5500, "Reposición de stock"],
  [22, "Fletes y envíos", 800, "Flete a Chimbote"],
  [23, "Venta al por mayor", 4700, "Ferretería El Progreso"],
  [26, "Venta en tienda", 4800, "Ventas de la semana"],
  [28, "Retiro del dueño", 3000, "Retiro de Rosa"],
  [29, "Comisiones de venta", 800, "Comisiones de Carla"],
];

/** Lo de este mes hasta el día 18 (lo que caiga después de hoy no se siembra): ventas 43,520 + US$ 250, costos 26,740. */
const MOVIMIENTOS_MES_ACTUAL: Mov[] = [
  [1, "Venta al por mayor", 7400, "Pedido Constructora Lima Sur"],
  [2, "Mercadería e insumos", 10400, "Compra de pinturas al proveedor"],
  [3, "Venta en tienda", 4250, "Ventas de la semana"],
  [6, "Fletes y envíos", 820, "Flete a Huaral"],
  [7, "Venta al por mayor", 8100, "Ferretería Huáscar"],
  [9, "Mercadería e insumos", 8300, "Herramientas y fijaciones"],
  [10, "Venta en tienda", 4420, "Ventas de la semana"],
  [13, "Venta al por mayor", 6900, "Pinturas Rímac"],
  [14, "Fletes y envíos", 820, "Flete a Chimbote"],
  [14, "Venta al por mayor", 250, "Pedido de un cliente que paga en dólares", "USD"],
  [15, "Venta en tienda", 4050, "Ventas de la semana"],
  [15, "Retiro del dueño", 3000, "Retiro de Rosa"],
  [16, "Mercadería e insumos", 5500, "Reposición de stock"],
  [17, "Venta al por mayor", 5200, "Ferretería El Progreso"],
  [17, "Comisiones de venta", 900, "Comisiones de Carla"],
  [18, "Venta en tienda", 3200, "Ventas de la semana"],
];

/** Los seis pagos que se repiten: día del mes en que vencen, monto y su categoría de egreso. */
const PAGOS_QUE_SE_REPITEN: { nombre: string; monto: number; categoria: string; dia: number }[] = [
  { nombre: "Publicidad en redes", monto: 350, categoria: "Publicidad", dia: 1 },
  { nombre: "Alquiler del local", monto: 4500, categoria: "Alquiler", dia: 5 },
  { nombre: "Contador", monto: 600, categoria: "Contador y trámites", dia: 10 },
  { nombre: "Planilla (quincena)", monto: 2900, categoria: "Sueldos y planilla", dia: 15 },
  { nombre: "Luz, agua e internet", monto: 680, categoria: "Luz, agua e internet", dia: 20 },
  { nombre: "Cuota del préstamo", monto: 1200, categoria: "Pago de préstamo", dia: 25 },
  { nombre: "Planilla (fin de mes)", monto: 2900, categoria: "Sueldos y planilla", dia: 30 },
];

/**
 * LA CAJA DE LA DEMO. Con lo de arriba, hoy (19-10-2026) «Tus números» recibe de la caja: el mes pasado ventas 45,900
 * (con los US$ 600 al 3.75 del cierre), costos variables 24,800, gastos fijos 11,930 y 9,170 de lo que quedó; este mes,
 * ventas 48,320 (sin los US$ 250: el mes sigue abierto), y hoy S/ 21,600 en caja, S/ 9,750 que te deben y S/ 4,780 que
 * vence hasta fin de mes. Todo con fechas relativas a hoy: el mes pasado es el anterior al de hoy.
 */
export async function sembrarFinanzas(sb: Admin, E: string, rosa: string, hoy: string): Promise<ResultadoFinanzas> {
  const mesActual = hoy.slice(0, 7);
  const mesPasado = sumarMeses(mesActual, -1);
  const hastaHoy = (fecha: string) => fecha <= hoy;

  // Los tres meses de antes, contados de memoria (como si la dueña los hubiera dicho antes de usar Finanzas), y el
  // precio de lo que más vende. Antes que la caja: lo de la caja no se pisa, y lo contado de otros meses se queda.
  await insertar(sb, "company_metricas", [
    { company_id: E, clave: "venta_mes", periodo: sumarMeses(mesActual, -4), valor: 39800, estado: "contado", origen: "declarado" },
    { company_id: E, clave: "venta_mes", periodo: sumarMeses(mesActual, -3), valor: 41500, estado: "contado", origen: "declarado" },
    { company_id: E, clave: "venta_mes", periodo: sumarMeses(mesActual, -2), valor: 43200, estado: "contado", origen: "declarado" },
    { company_id: E, clave: "precio_producto_estrella", periodo: "actual", valor: 38, estado: "contado", origen: "declarado", nota: "Galón de pintura látex" },
  ]);

  // Las categorías con que arranca toda empresa (las mismas que pone la aplicación al abrir Finanzas).
  const { error: eC } = await sb.rpc("fin_asegurar_categorias", { p_company: E });
  if (eC) fallo("crear las categorías de Finanzas", eC);
  const { data: cats, error: eL } = await sb.from("fin_categorias").select("id,nombre,tipo").eq("company_id", E);
  if (eL || !cats) fallo("leer las categorías de Finanzas", eL);
  const categoria = new Map(cats.map((c) => [c.nombre as string, { id: c.id as string, tipo: c.tipo as string }] as const));
  const cat = (nombre: string) => categoria.get(nombre) ?? fallo(`encontrar la categoría «${nombre}»`, null);

  await insertar(sb, "fin_saldos_iniciales", [{ company_id: E, moneda: "PEN", monto: 8650, fecha: diaDelMes(mesPasado, 1), registrado_por: rosa }]);

  const movimientos = (mes: string, lista: Mov[]) =>
    lista
      .map(([dia, nombre, monto, detalle, moneda]) => ({
        company_id: E, fecha: diaDelMes(mes, dia), tipo: cat(nombre).tipo, categoria_id: cat(nombre).id, monto, moneda: moneda ?? "PEN", detalle, registrado_por: rosa,
      }))
      .filter((m) => hastaHoy(m.fecha));

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await sb.rpc(fn, args);
    if (error) fallo(`ejecutar ${fn}`, error);
  };

  // Los cobros: uno pagado el mes pasado, uno pagado este mes, uno con un pago a cuenta y vencido, uno al día y otro
  // que vence en cuatro días. Los que se emiten después de hoy no se siembran.
  const venta = cat("Venta al por mayor").id;
  const cobros = [
    { cliente: "Ferretería San Martín", concepto: "Factura F001-2287", total: 2650, emitido: diaDelMes(mesPasado, 15), vence: diaDelMes(mesPasado, 30), pagos: [[diaDelMes(mesPasado, 28), 2650, "transferencia"]] },
    { cliente: "Ferretería El Sol", concepto: "Factura F001-2301", total: 3800, emitido: diaDelMes(mesPasado, 10), vence: diaDelMes(mesActual, 10), pagos: [[diaDelMes(mesActual, 8), 3800, "transferencia"]] },
    { cliente: "Bodega Rosita", concepto: "Pedido de pinturas", total: 2400, emitido: diaDelMes(mesPasado, 20), vence: diaDelMes(mesActual, 5), pagos: [[diaDelMes(mesActual, 3), 1000, "efectivo"]] },
    { cliente: "Constructora Huaraz", concepto: "Obra de Independencia", total: 6500, emitido: diaDelMes(mesActual, 1), vence: diaDelMes(mesActual, 31), pagos: [] },
    { cliente: "Pinturas del Norte", concepto: "Factura F001-2334", total: 1850, emitido: diaDelMes(mesActual, 6) < hoy ? diaDelMes(mesActual, 6) : hoy, vence: sumarDias(hoy, 4), pagos: [] },
  ].filter((c) => hastaHoy(c.emitido)) as { cliente: string; concepto: string; total: number; emitido: string; vence: string; pagos: [string, number, string][] }[];
  const filasCobro = await insertar(
    sb, "fin_cobros",
    cobros.map((c) => ({ company_id: E, cliente: c.cliente, concepto: c.concepto, total: c.total, emitido: c.emitido, vence: c.vence, categoria_id: venta, creado_por: rosa })),
    "id,cliente"
  );
  const idCobro = new Map(filasCobro.map((c) => [c.cliente, c.id]));

  const pagos = await insertar(
    sb, "fin_pagos_recurrentes",
    PAGOS_QUE_SE_REPITEN.map((p) => ({ company_id: E, nombre: p.nombre, monto: p.monto, categoria_id: cat(p.categoria).id, dia: p.dia, proximo_vencimiento: diaDelMes(mesPasado, p.dia) })),
    "id,nombre"
  );
  const idPago = new Map(pagos.map((p) => [p.nombre, p.id]));

  /** Lo de un mes, en el orden en que pasó: los movimientos a mano, los pagos de cobros y los pagos que se repiten. */
  let pagosHechos = 0;
  const sembrarMes = async (mes: string, lista: Mov[]) => {
    const filas = movimientos(mes, lista);
    await insertar(sb, "fin_movimientos", filas);
    for (const c of cobros) {
      for (const [fecha, monto, medio] of c.pagos) {
        if (fecha.slice(0, 7) !== mes || !hastaHoy(fecha)) continue;
        await rpc("fin_registrar_pago_cobro", { p_cobro: idCobro.get(c.cliente), p_monto: monto, p_fecha: fecha, p_medio: medio, p_por: rosa });
      }
    }
    for (const p of PAGOS_QUE_SE_REPITEN) {
      const ciclo = diaDelMes(mes, p.dia);
      if (!hastaHoy(ciclo) || ciclo === hoy) continue; // lo que vence hoy o después, todavía no se pagó
      await rpc("fin_pagar_recurrente", { p_pago: idPago.get(p.nombre), p_monto: p.monto, p_fecha: ciclo, p_por: rosa });
      pagosHechos++;
    }
    return filas.length;
  };

  let n = await sembrarMes(mesPasado, MOVIMIENTOS_MES_PASADO);
  // El mes pasado se cierra con su tipo de cambio (tuvo dólares): desde ese momento sus dólares cuentan en soles.
  await rpc("fin_cerrar_mes", { p_company: E, p_mes: diaDelMes(mesPasado, 1), p_tipo_cambio: 3.75, p_fuente: "SBS, tipo de cambio de cierre", p_por: rosa });
  n += await sembrarMes(mesActual, MOVIMIENTOS_MES_ACTUAL);

  return { movimientos: n, cobros: cobros.length, pagos: pagos.length, pagosHechos, mesCerrado: mesPasado };
}

export async function sembrarDemo(opciones: { env?: Variables; log?: (l: string) => void; ahora?: Date } = {}): Promise<ResultadoDemo> {
  const env = opciones.env ?? process.env;
  const log = opciones.log ?? (() => {});
  const ahora = opciones.ahora ?? new Date();

  // EL CANDADO VA PRIMERO. Y solo el Supabase local: una demo con contraseña conocida no sale de esta máquina.
  const destino = exigirDestinoEscritura("script", env);
  if (destino !== "local") throw new Error(`La demo de RENASER OS solo se siembra en el Supabase local; el destino es «${destino}». No se escribió nada.`);
  log(`Candado: destino de escritura autorizado «${destino}».`);

  const { supabaseAdmin } = await import("../../src/lib/supabase/admin");
  const sb = supabaseAdmin();

  const reemplazadas = await borrarDemoAnterior(sb);
  if (reemplazadas) log(`Demo anterior borrada (${reemplazadas}).`);

  // ---- La empresa, las cuentas y el equipo ----
  const { data: empresa, error: eE } = await sb
    .from("companies")
    .insert({ nombre: EMPRESA_DEMO, sector: "Distribución mayorista de ferretería y pinturas", estado_admision: "admitida", zona_horaria: ZONA })
    .select("id")
    .single();
  if (eE || !empresa) fallo("crear la empresa demo", eE);
  const E = empresa.id as string;

  const usuario: Partial<Record<Quien, string>> = {};
  for (const p of EQUIPO.filter((x) => x.cuenta)) usuario[p.clave] = await asegurarCuenta(sb, p.email, p.nombre);
  const { error: eM } = await sb.from("memberships").upsert({ user_id: usuario.rosa!, company_id: E, nivel: "dueno" }, { onConflict: "user_id,company_id" });
  if (eM) fallo("dar la membresía a la dueña", eM);

  const fichas = await insertar(
    sb,
    "os_personas",
    EQUIPO.map((p) => ({ company_id: E, user_id: usuario[p.clave] ?? null, email: p.email, nombre: p.nombre, puesto: p.puesto, area: p.area, rol: p.rol })),
    "id,email"
  );
  const P = Object.fromEntries(EQUIPO.map((p) => [p.clave, fichas.find((f) => f.email === p.email)!.id])) as Record<Quien, string>;
  log(`Empresa ${E} con ${EQUIPO.length} personas (${EQUIPO.filter((p) => p.cuenta).length} con cuenta).`);

  // ---- El calendario ----
  const hoy = hoyEn(ZONA, ahora);
  const dowHoy = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const hoyHabil = dowHoy !== 0 && dowHoy !== 6;
  const dias = diasHabilesHasta(hoyHabil ? hoy : sumarDias(hoy, -1), 10);
  const pasados = hoyHabil ? dias.slice(0, -1) : dias;
  const ayer = pasados[pasados.length - 1]!;
  const lunes = lunesDe(hoy);
  const lunesAnterior = sumarDias(lunes, -7);
  const hace = (min: number) => new Date(ahora.getTime() - min * 60000).toISOString();

  // ---- Proyectos y objetivo ----
  const proyectos = await insertar(sb, "os_proyectos", [
    { company_id: E, nombre: "Mayoristas Q4", descripcion: "Abrir 12 ferreterías mayoristas antes de fin de año.", responsable_id: P.carla, fecha_entrega: sumarDias(hoy, 40) },
    { company_id: E, nombre: "Ordenar el almacén 2", descripcion: "Ubicaciones, rótulos y conteo cíclico.", responsable_id: P.maria, fecha_entrega: sumarDias(hoy, 6) },
    { company_id: E, nombre: "Rutas de despacho Lima Norte", descripcion: "Dos rutas fijas por semana con camión asignado.", responsable_id: P.jose, fecha_entrega: sumarDias(hoy, 12) },
  ], "id,nombre");
  const PRY = Object.fromEntries(proyectos.map((p) => [p.nombre, p.id])) as Record<string, string>;
  await insertar(sb, "os_objetivos", [{ company_id: E, semana: lunes, texto: "Cerrar 12 pedidos mayoristas", meta: 12, logrado: 7, fijado_por: usuario.rosa }]);
  await insertar(sb, "os_objetivos", [{ company_id: E, semana: lunesAnterior, texto: "Bajar los atrasos de despacho a menos de 3", meta: 3, logrado: 2, fijado_por: usuario.rosa }]);

  // ---- Los días pasados: apertura, dos tareas terminadas con su cronómetro, y el cierre ----
  type Fila = Record<string, unknown>;
  const aperturas: Fila[] = [];
  const cierres: Fila[] = [];
  const terminadas: Fila[] = [];
  const sinAbrir: Record<string, number[]> = { ana: [3, 7], jorge: [5], jose: [8] };
  const sinCerrar: Record<string, number[]> = { luis: [4], jose: [2, 6], carla: [pasados.length - 3] };
  const atrasos: Record<string, number[]> = { jose: [1, 4, 7], luis: [5], ana: [6] };
  for (const [i, dia] of pasados.entries()) {
    for (const q of Object.keys(RUTINA) as (keyof typeof RUTINA)[]) {
      if (sinAbrir[q]?.includes(i)) continue;
      const minuto = String((i * 7 + q.length * 3) % 25).padStart(2, "0");
      aperturas.push({ company_id: E, persona_id: P[q], fecha: dia, animo: ANIMO[q]![i % 10], compromiso: `Sacar «${RUTINA[q][i % 4]}» antes del mediodía.`, created_at: enLima(dia, `08:${minuto}`) });
      if (!sinCerrar[q]?.includes(i)) cierres.push({ company_id: E, persona_id: P[q], fecha: dia, hecho: `${RUTINA[q][i % 4]} y ${RUTINA[q][(i + 1) % 4].toLowerCase()}.`, pendiente: i % 3 ? null : "Quedó un pendiente para mañana.", created_at: enLima(dia, "18:05") });
      for (const k of [0, 1]) {
        const tarde = atrasos[q]?.includes(i) && k === 1;
        terminadas.push({
          company_id: E, persona_id: P[q], titulo: RUTINA[q][(i + k) % 4], estado: "completada", prioridad: k ? "media" : "alta",
          fecha_inicio: dia, fecha_limite: dia, completada_at: tarde ? enLima(sumarDias(dia, 1), "10:30") : enLima(dia, k ? "16:40" : "11:50"),
          proyecto_id: q === "carla" ? PRY["Mayoristas Q4"] : q === "maria" ? PRY["Ordenar el almacén 2"] : q === "jose" && k ? PRY["Rutas de despacho Lima Norte"] : null,
          created_at: enLima(dia, "08:30"), updated_at: enLima(dia, "17:00"),
        });
      }
    }
  }
  await insertar(sb, "os_aperturas", aperturas);
  await insertar(sb, "os_cierres", cierres);
  const filasTerminadas = await insertar(sb, "os_tareas", terminadas, "id,persona_id,fecha_inicio,prioridad");
  // Un tramo de cronómetro por tarea terminada: mañana la primera, tarde la segunda.
  await insertar(sb, "os_registros_tiempo", filasTerminadas.map((t) => {
    const manana = t.prioridad === "alta";
    return {
      company_id: E, tarea_id: t.id, persona_id: t.persona_id,
      inicio: enLima(t.fecha_inicio, manana ? "09:00" : "14:10"), fin: enLima(t.fecha_inicio, manana ? "11:40" : "16:35"),
      nota: manana ? null : "Avancé lo que faltaba.",
    };
  }));

  // ---- Lo que está abierto hoy ----
  const manana = siguienteDiaHabil(hoy);
  const abiertas = await insertar(sb, "os_tareas", [
    { company_id: E, persona_id: P.carla, proyecto_id: PRY["Mayoristas Q4"], titulo: "Cotización mayorista · Ferretería El Sol", estado: "en_curso", prioridad: "alta", fecha_inicio: hoy, fecha_limite: hoy, updated_at: hace(47) },
    { company_id: E, persona_id: P.carla, titulo: "Llamar a 5 clientes con pedidos atrasados", estado: "pendiente", prioridad: "media", fecha_inicio: hoy, fecha_limite: sumarDias(hoy, 2) },
    { company_id: E, persona_id: P.carla, titulo: "Seguimiento a cobranza Bodega Rosita", estado: "pendiente", prioridad: "alta", fecha_inicio: pasados[pasados.length - 3], fecha_limite: pasados[pasados.length - 3] },
    { company_id: E, persona_id: P.carla, titulo: "Actualizar lista de precios de pinturas", estado: "pendiente", prioridad: "baja", fecha_inicio: sumarDias(lunes, 7), fecha_limite: sumarDias(lunes, 11) },
    { company_id: E, persona_id: P.carla, proyecto_id: PRY["Mayoristas Q4"], titulo: "Preparar muestras para Constructora Lima Norte", estado: "en_revision", prioridad: "media", fecha_inicio: ayer, fecha_limite: ayer },
    { company_id: E, persona_id: P.luis, titulo: "Conciliar pagos de Yape de la semana", estado: "bloqueada", prioridad: "alta", fecha_inicio: hoy, fecha_limite: hoy, updated_at: hace(48) },
    { company_id: E, persona_id: P.luis, titulo: "Cierre de caja semanal", estado: "pendiente", prioridad: "media", fecha_inicio: hoy, fecha_limite: sumarDias(hoy, 1) },
    { company_id: E, persona_id: P.maria, proyecto_id: PRY["Ordenar el almacén 2"], titulo: "Inventario del almacén 2", estado: "en_curso", prioridad: "alta", fecha_inicio: hoy, fecha_limite: sumarDias(hoy, 3), updated_at: hace(20) },
    { company_id: E, persona_id: P.maria, proyecto_id: PRY["Ordenar el almacén 2"], titulo: "Rotular estantes del pasillo B", estado: "pendiente", prioridad: "media", fecha_inicio: manana, fecha_limite: sumarDias(hoy, 5) },
    { company_id: E, persona_id: P.jose, proyecto_id: PRY["Rutas de despacho Lima Norte"], titulo: "Ruta Lima Norte: asignar camión", estado: "bloqueada", prioridad: "alta", fecha_inicio: hoy, fecha_limite: hoy, updated_at: hace(45) },
    { company_id: E, persona_id: P.jose, titulo: "Despachar pedido #2231", estado: "pendiente", prioridad: "media", fecha_inicio: hoy, fecha_limite: hoy },
    { company_id: E, persona_id: P.jorge, titulo: "Recepción de mercadería del proveedor de pinturas", estado: "en_curso", prioridad: "media", fecha_inicio: ayer, fecha_limite: hoy, updated_at: enLima(ayer, "18:40") },
    { company_id: E, persona_id: P.ana, titulo: "Planilla de la segunda quincena", estado: "pendiente", prioridad: "alta", fecha_inicio: hoy, fecha_limite: sumarDias(hoy, 4) },
    { company_id: E, persona_id: P.ana, titulo: "Renovar contratos que vencen este mes", estado: "pendiente", prioridad: "media", fecha_inicio: null, fecha_limite: null },
    { company_id: E, persona_id: P.rosa, titulo: "Revisar cotizaciones mayoristas", estado: "pendiente", prioridad: "alta", fecha_inicio: hoy, fecha_limite: hoy },
    { company_id: E, persona_id: P.rosa, proyecto_id: PRY["Mayoristas Q4"], titulo: "Negociar crédito con el proveedor de pinturas", estado: "pendiente", prioridad: "media", fecha_inicio: manana, fecha_limite: sumarDias(hoy, 7) },
  ], "id,titulo,persona_id");
  const T = Object.fromEntries(abiertas.map((t) => [t.titulo, t.id])) as Record<string, string>;

  // Aperturas de hoy (Ana todavía no abre; Pedro no tiene cuenta).
  if (hoyHabil) {
    await insertar(sb, "os_aperturas", (["rosa", "carla", "luis", "maria", "jose", "jorge"] as const).map((q, i) => ({
      company_id: E, persona_id: P[q], fecha: hoy, animo: [4, 4, 3, 5, 2, 3][i], compromiso: i === 1 ? "Dejar enviada la cotización de El Sol antes del mediodía." : null,
      created_at: enLima(hoy, `08:0${i}`),
    })));
  }

  // Cronómetros: Carla y María corriendo ahora; Jorge olvidado desde ayer a las 18:40; Luis con un tramo de hoy cerrado.
  const olvidado = await insertar(sb, "os_registros_tiempo", [
    { company_id: E, tarea_id: T["Recepción de mercadería del proveedor de pinturas"], persona_id: P.jorge, inicio: enLima(ayer, "18:40"), fin: null },
  ]);
  await insertar(sb, "os_registros_tiempo", [
    { company_id: E, tarea_id: T["Cotización mayorista · Ferretería El Sol"], persona_id: P.carla, inicio: hace(47), fin: null },
    { company_id: E, tarea_id: T["Inventario del almacén 2"], persona_id: P.maria, inicio: hace(20), fin: null },
    { company_id: E, tarea_id: T["Conciliar pagos de Yape de la semana"], persona_id: P.luis, inicio: hace(75), fin: hace(48), nota: "Crucé lo que había; faltan 14 pagos sin reporte." },
    { company_id: E, tarea_id: T["Cotización mayorista · Ferretería El Sol"], persona_id: P.carla, inicio: enLima(pasados[pasados.length - 1]!, "15:05"), fin: enLima(pasados[pasados.length - 1]!, "16:33"), nota: "Primer borrador con precios de lista." },
  ]);

  // Bloqueos abiertos (el de José ya avisado; el de Luis lo avisará pg_cron) y uno ya resuelto.
  const bloqueos = await insertar(sb, "os_bloqueos", [
    { company_id: E, tarea_id: T["Ruta Lima Norte: asignar camión"], persona_id: P.jose, causa: "No hay camión asignado", depende_de: "María Torres (Operaciones)", desde: hace(45), avisado_at: hace(12) },
    { company_id: E, tarea_id: T["Conciliar pagos de Yape de la semana"], persona_id: P.luis, causa: "Falta el reporte de movimientos del banco", depende_de: "Ana Flores (Administración)", desde: hace(48) },
  ], "id,persona_id");
  await insertar(sb, "os_bloqueos", [
    { company_id: E, tarea_id: filasTerminadas.find((t) => t.persona_id === P.jose)!.id, persona_id: P.jose, causa: "El cliente no estaba en el local", desde: enLima(pasados[1]!, "11:00"), hasta: enLima(pasados[1]!, "12:30"), avisado_at: enLima(pasados[1]!, "11:35") },
  ]);

  // Prórrogas y un aplazamiento (Bodega Rosita, prorrogada tres veces: la que el diagnóstico señala).
  await insertar(sb, "os_reprogramaciones", [
    { company_id: E, tarea_id: T["Cotización mayorista · Ferretería El Sol"], tipo: "prorroga", antes: ayer, despues: hoy, motivo: "El cliente cambió las cantidades del pedido.", por: usuario.carla },
    ...["La dueña estaba de viaje.", "Sin respuesta al WhatsApp.", "Pidió que volvamos a llamar el lunes."].map((motivo, i) => ({
      company_id: E, tarea_id: T["Seguimiento a cobranza Bodega Rosita"], tipo: "prorroga", antes: pasados[Math.max(0, pasados.length - 6 + i)], despues: pasados[pasados.length - 5 + i], motivo, por: usuario.carla,
    })),
    { company_id: E, tarea_id: T["Actualizar lista de precios de pinturas"], tipo: "aplazamiento", antes: hoy, despues: sumarDias(lunes, 7), motivo: "Primero cerrar los mayoristas.", por: usuario.carla },
  ]);

  // Cierres semanales de la semana pasada (José y Ana no cerraron).
  await insertar(sb, "os_cierres_semanales", [
    { company_id: E, persona_id: P.carla, semana: lunesAnterior, logros: "Salieron 9 pedidos mayoristas.", trabas: "Dos clientes sin respuesta.", compromiso: "Arrancar el lunes con El Sol." },
    { company_id: E, persona_id: P.maria, semana: lunesAnterior, logros: "El almacén 2 ya tiene ubicaciones.", trabas: "Faltan rótulos.", compromiso: "Rotular el pasillo B." },
    { company_id: E, persona_id: P.luis, semana: lunesAnterior, logros: "Caja cuadrada todos los días.", trabas: "El banco demora los reportes.", compromiso: "Pedir el reporte el lunes temprano." },
    { company_id: E, persona_id: P.rosa, semana: lunesAnterior, logros: "Cerramos el crédito con el banco.", trabas: null, compromiso: "Acompañar a Carla a dos visitas." },
    { company_id: E, persona_id: P.jorge, semana: lunesAnterior, logros: "Conteo de pinturas sin diferencias.", trabas: "El montacargas falla.", compromiso: "Pedir el mantenimiento." },
  ]);

  // ---- Talento: un legajo, dos acompañamientos y un ciclo 360 a medias ----
  await insertar(sb, "os_legajos", [
    { persona_id: P.maria, company_id: E, ingreso: "2024-03-11", contrato: "Plazo indeterminado", telefono: "999 111 222", documento: "DNI 45678912", notas: "Encargada del almacén 2 desde octubre." },
  ], "persona_id");
  await insertar(sb, "os_acompanamientos", [
    { company_id: E, persona_id: P.jose, fecha: enLima(sumarDias(hoy, 2), "16:00"), tema: "Rutas y despacho", acuerdos: "Avisar el bloqueo apenas pase, no al final del día.", hecho: false, por: usuario.ana },
    { company_id: E, persona_id: P.ana, fecha: enLima(pasados[pasados.length - 2]!, "11:00"), tema: "Apertura del día", acuerdos: "Abrir el día antes de las 8:30 y poner sus tareas la tarde anterior.", hecho: true, por: usuario.rosa },
  ]);
  const ciclo = hoy.slice(0, 7);
  const puntaje = (a: number, b: number, c: number, d: number, e: number) => ({ compromiso: a, calidad: b, equipo: c, comunicacion: d, orden: e });
  await insertar(sb, "os_evaluaciones", [
    { company_id: E, ciclo, evaluado_id: P.carla, evaluador_id: P.carla, relacion: "auto", puntajes: puntaje(4, 4, 5, 4, 3), comentario: "Me falta ordenar mejor mis llamadas.", respondida_at: hace(60 * 26) },
    { company_id: E, ciclo, evaluado_id: P.carla, evaluador_id: P.rosa, relacion: "jefe", puntajes: puntaje(5, 4, 4, 4, 4), comentario: "Cumple y empuja al equipo.", respondida_at: hace(60 * 20) },
    { company_id: E, ciclo, evaluado_id: P.carla, evaluador_id: P.luis, relacion: "par", puntajes: puntaje(4, 5, 4, 3, 4), comentario: null, respondida_at: hace(60 * 5) },
    { company_id: E, ciclo, evaluado_id: P.carla, evaluador_id: P.maria, relacion: "par" },
    { company_id: E, ciclo, evaluado_id: P.luis, evaluador_id: P.luis, relacion: "auto", puntajes: puntaje(4, 4, 3, 3, 4), comentario: "Necesito los reportes del banco a tiempo.", respondida_at: hace(60 * 30) },
    { company_id: E, ciclo, evaluado_id: P.luis, evaluador_id: P.rosa, relacion: "jefe" },
    { company_id: E, ciclo, evaluado_id: P.luis, evaluador_id: P.carla, relacion: "par" },
    { company_id: E, ciclo, evaluado_id: P.jose, evaluador_id: P.jose, relacion: "auto" },
    { company_id: E, ciclo, evaluado_id: P.jose, evaluador_id: P.maria, relacion: "jefe" },
  ]);

  // ---- Dos entregables con su archivo (misma ruta que arma la aplicación: <empresa>/<persona>/<uuid>-<nombre>) ----
  const entregables = [
    { quien: "carla" as const, titulo: "Cotización Ferretería El Sol (borrador)", nombre: "cotizacion-el-sol.txt", texto: "Cotización mayorista · Ferretería El Sol\nBorrador para revisión de Rosa.\n" },
    { quien: "maria" as const, titulo: "Plano de ubicaciones del almacén 2", nombre: "ubicaciones-almacen-2.txt", texto: "Pasillo A: pinturas · Pasillo B: herramientas · Pasillo C: fijaciones\n" },
  ];
  for (const e of entregables) {
    const ruta = `${E}/${P[e.quien]}/${randomUUID()}-${e.nombre}`;
    const cuerpo = Buffer.from(e.texto, "utf8");
    const { error } = await sb.storage.from(BUCKET).upload(ruta, cuerpo, { contentType: "text/plain", upsert: false });
    if (error) fallo(`subir ${e.nombre}`, error);
    await insertar(sb, "os_entregables", [{ company_id: E, persona_id: P[e.quien], titulo: e.titulo, ruta, mime: "text/plain", tamano: cuerpo.byteLength, created_at: hace(60 * 24 * (e.quien === "carla" ? 1 : 3)) }]);
  }

  // ---- Los avisos que las reglas habrían dejado, con sus mismas claves (pg_cron no los repite) ----
  // El diagnóstico se cuenta como lo cuenta os_regla_diagnostico, sobre lo que acaba de quedar abierto.
  const [{ data: abiertasHoy, error: eA }, { data: prorrogas, error: eP }] = await Promise.all([
    sb.from("os_tareas").select("id,estado,fecha_limite").eq("company_id", E).neq("estado", "completada"),
    sb.from("os_reprogramaciones").select("tarea_id").eq("company_id", E).eq("tipo", "prorroga"),
  ]);
  if (eA || eP) fallo("contar el diagnóstico de la demo", eA ?? eP);
  const porTarea = new Map<string, number>();
  for (const r of prorrogas ?? []) porTarea.set(r.tarea_id, (porTarea.get(r.tarea_id) ?? 0) + 1);
  const diag = {
    vencidas: (abiertasHoy ?? []).filter((x) => x.fecha_limite && x.fecha_limite < hoy).length,
    sinFecha: (abiertasHoy ?? []).filter((x) => !x.fecha_limite).length,
    prorrogadas: (abiertasHoy ?? []).filter((x) => (porTarea.get(x.id) ?? 0) >= 3).length,
    bloqueadas: (abiertasHoy ?? []).filter((x) => x.estado === "bloqueada").length,
  };
  const avisos: Fila[] = [
    { persona_id: null, para_gestion: true, regla: "bloqueos", titulo: "«Ruta Lima Norte: asignar camión» lleva 33 min bloqueada", detalle: "José Ramírez · causa: No hay camión asignado. Depende de: María Torres (Operaciones).", enlace: "/os/equipo", clave: `bloqueo:${bloqueos.find((b) => b.persona_id === P.jose)!.id}`, created_at: hace(12) },
    { persona_id: P.jorge, para_gestion: true, regla: "inactividad", titulo: "Cronómetro olvidado: Jorge Salazar", detalle: `Corre desde el ${ayer.slice(8, 10)}/${ayer.slice(5, 7)} a las 18:40 en «Recepción de mercadería del proveedor de pinturas».`, enlace: "/os/equipo", clave: `cronometro:${olvidado[0]!.id}`, created_at: enLima(sumarDias(ayer, 1), "04:45") },
    { persona_id: null, para_gestion: true, regla: "diagnostico", titulo: "Diagnóstico de tareas de hoy", detalle: `${diag.vencidas} vencidas, ${diag.sinFecha} sin fecha límite, ${diag.prorrogadas} prorrogadas tres veces o más y ${diag.bloqueadas} bloqueadas.`, enlace: "/os/equipo", clave: `diagnostico:${E}:${hoy}`, created_at: enLima(hoy, "06:00") },
    { persona_id: null, para_gestion: true, regla: "plan", titulo: `Plan de mañana: 1 persona sin tareas para el ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`, detalle: "Jorge Salazar.", enlace: "/os/equipo", clave: `plan_equipo:${E}:${hoy}`, created_at: enLima(ayer, "17:30"), leido_at: enLima(ayer, "18:10") },
    { persona_id: P.jorge, para_gestion: false, regla: "plan", titulo: `Pon tu trabajo para el ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`, detalle: "Todavía no tienes tareas para ese día. Elige en qué vas a trabajar antes de irte.", enlace: "/os/mi-trabajo", clave: `plan_manana:${P.jorge}:${hoy}`, created_at: enLima(ayer, "17:30") },
    { persona_id: null, para_gestion: true, regla: "cierre_semanal", titulo: "Cierre semanal pendiente: 2 personas", detalle: "Ana Flores, José Ramírez. Se les recordó el viernes y el sábado.", enlace: "/os/reporte", clave: `cierre_equipo:${E}:${lunesAnterior}`, created_at: enLima(sumarDias(lunesAnterior, 5), "18:00"), leido_at: enLima(lunes, "08:40") },
    ...(["jose", "ana"] as const).flatMap((q) => [5, 6].map((d) => ({
      persona_id: P[q], para_gestion: false, regla: "cierre_semanal", titulo: "Falta tu cierre de la semana", detalle: "Logros, trabas y tu compromiso para la semana que viene. Son tres respuestas.", enlace: "/os/apertura",
      clave: `cierre_semanal:${P[q]}:${lunesAnterior}:${d}`, created_at: enLima(sumarDias(lunesAnterior, d - 1), "18:00"),
    }))),
  ];
  await insertar(sb, "os_avisos", avisos.map((a) => ({ company_id: E, ...a })));

  // ---- Finanzas: la caja que alimenta a «Tus números» ----
  const finanzas = await sembrarFinanzas(sb, E, usuario.rosa!, hoy);

  const { count: tareas } = await sb.from("os_tareas").select("id", { count: "exact", head: true }).eq("company_id", E);
  return { destino, companyId: E, reemplazadas, personas: EQUIPO.length, tareas: tareas ?? 0, avisos: avisos.length, finanzas };
}

async function main() {
  try {
    const r = await sembrarDemo({ log: (l) => console.log(l) });
    console.log("");
    console.log(`Demo sembrada en «${r.destino}»: ${EMPRESA_DEMO} (${r.companyId}) · ${r.personas} personas · ${r.tareas} tareas · ${r.avisos} avisos.`);
    const f = r.finanzas;
    console.log(`Finanzas: ${f.movimientos} movimientos a mano · ${f.cobros} cobros · ${f.pagos} pagos que se repiten (${f.pagosHechos} pagados) · ${f.mesCerrado} cerrado.`);
    console.log("Cuentas (todas con la misma contraseña, solo para este Supabase local):");
    for (const p of EQUIPO) console.log(`  ${p.email.padEnd(20)} ${p.nombre} · ${p.rol}${p.cuenta ? "" : " · SIN CUENTA (su ficha espera a que entre con ese correo)"}`);
    console.log(`  Contraseña: ${CLAVE_DEMO}`);
    console.log("Entra como la dueña en http://localhost:3000/entrar y abre /os (Finanzas: /os/finanzas; lo que alimenta: /portal/numeros).");
  } catch (e) {
    if (e instanceof DestinoNoAutorizado) {
      console.error(`\nCANDADO (${e.clase}): ${e.message}\nNo se escribió nada.`);
      process.exit(2);
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

// Solo arranca cuando se ejecuta directamente. Importado desde una prueba, no hace nada.
const ejecutadoDirectamente = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (ejecutadoDirectamente) void main();

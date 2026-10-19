/**
 * FINANZAS · LAS CUENTAS, SIN BASE DE DATOS (19-10-2026). Formatos, estados y totales que usan las pantallas y las rutas;
 * los prueba tests/fin-calculos.test.ts. Las reglas que no pueden fallar (mes cerrado, la caja manda, pagar en una sola
 * operación) viven en la base (supabase/migracion-finanzas.sql); aquí solo lo que se muestra.
 *
 * Nunca se suman soles con dólares: todo total va por moneda. Las fechas son texto AAAA-MM-DD en el reloj de la empresa.
 */
import { sumarDias } from "@/lib/revision-semanal";

export type Moneda = "PEN" | "USD";
export type TipoMovimiento = "ingreso" | "egreso";
export type Destino = "venta" | "costo_variable" | "gasto_fijo" | "ninguno";

export type Categoria = { id: string; nombre: string; tipo: TipoMovimiento; destino: Destino; archivada: boolean; orden: number };
export type Movimiento = {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  categoria_id: string;
  monto: number | string;
  moneda: Moneda;
  detalle: string | null;
  origen: "manual" | "cobro" | "pago";
  created_at: string;
};
export type Cobro = {
  id: string;
  cliente: string;
  concepto: string | null;
  total: number | string;
  moneda: Moneda;
  emitido: string;
  vence: string;
  categoria_id: string;
  anulado_at: string | null;
};
export type PagoRecurrente = {
  id: string;
  nombre: string;
  monto: number | string;
  moneda: Moneda;
  categoria_id: string;
  dia: number;
  proximo_vencimiento: string;
  activo: boolean;
};

/** El número que «Tus números» recibe de cada destino. */
export const NUMERO_DE_DESTINO: Record<Destino, string> = {
  venta: "Ventas del mes",
  costo_variable: "Costos variables",
  gasto_fijo: "Gastos fijos",
  ninguno: "No es venta ni gasto",
};

/** Clave de company_metricas que alimenta cada destino (el que no va a ninguno, no alimenta nada). */
export const CLAVE_DE_DESTINO: Record<Destino, string | null> = {
  venta: "venta_mes",
  costo_variable: "costo_variable_mes",
  gasto_fijo: "gasto_fijo_mes",
  ninguno: null,
};

const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

/** «S/ 1,250.50» o «US$ 1,200»: dos decimales solo cuando hay céntimos. */
export function textoMonto(monto: number | string | null | undefined, moneda: Moneda = "PEN"): string {
  const v = n(monto);
  const conCentimos = Math.round(v * 100) % 100 !== 0;
  const cifra = v.toLocaleString("en-US", { minimumFractionDigits: conCentimos ? 2 : 0, maximumFractionDigits: 2 });
  return `${moneda === "USD" ? "US$" : "S/"} ${cifra}`;
}

/** El primer día del mes de una fecha («2026-10-19» → «2026-10-01»). */
export function inicioDeMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/** El mes siguiente o anterior, en forma AAAA-MM. */
export function sumarMeses(mes: string, k: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-10» → «octubre 2026». */
export function nombreDeMes(mes: string, conAnio = true): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return conAnio ? `${nombre} ${mes.slice(0, 4)}` : nombre;
}

/** Totales de un conjunto de movimientos, POR MONEDA y por destino de su categoría. */
export function totalesPorMoneda(movimientos: readonly Movimiento[], categorias: readonly Categoria[]) {
  const destinoDe = new Map(categorias.map((c) => [c.id, c.destino]));
  const vacio = () => ({ entro: 0, salio: 0, venta: 0, costo_variable: 0, gasto_fijo: 0, ninguno_ingreso: 0, ninguno_egreso: 0 });
  const t: Record<Moneda, ReturnType<typeof vacio>> = { PEN: vacio(), USD: vacio() };
  for (const m of movimientos) {
    const x = t[m.moneda];
    const monto = n(m.monto);
    const destino = destinoDe.get(m.categoria_id) ?? "ninguno";
    if (m.tipo === "ingreso") x.entro += monto;
    else x.salio += monto;
    if (destino === "ninguno") {
      if (m.tipo === "ingreso") x.ninguno_ingreso += monto;
      else x.ninguno_egreso += monto;
    } else x[destino] += monto;
  }
  const redondo = (v: number) => Math.round(v * 100) / 100;
  for (const moneda of ["PEN", "USD"] as const) for (const k of Object.keys(t[moneda]) as (keyof ReturnType<typeof vacio>)[]) t[moneda][k] = redondo(t[moneda][k]);
  return t;
}

/** Lo que te quedó libre con los totales de una moneda: ventas menos costos variables menos gastos fijos. */
export function libre(t: { venta: number; costo_variable: number; gasto_fijo: number }): number {
  return Math.round((t.venta - t.costo_variable - t.gasto_fijo) * 100) / 100;
}

export type EstadoCobro = "pagado" | "vencido" | "vence_pronto" | "al_dia" | "anulado";

export const NOMBRE_ESTADO_COBRO: Record<EstadoCobro, string> = {
  pagado: "Pagado",
  vencido: "Vencido",
  vence_pronto: "Vence pronto",
  al_dia: "Al día",
  anulado: "Anulado",
};

/** Lo que falta cobrar de un cobro: el total menos sus pagos (nunca negativo). */
export function saldoDeCobro(total: number | string, pagado: number): number {
  return Math.max(0, Math.round((n(total) - pagado) * 100) / 100);
}

/** El estado de un cobro hoy: «vence pronto» es dentro de los próximos 7 días. */
export function estadoCobro(c: Pick<Cobro, "vence" | "anulado_at" | "total">, pagado: number, hoy: string): EstadoCobro {
  if (c.anulado_at) return "anulado";
  if (saldoDeCobro(c.total, pagado) === 0) return "pagado";
  if (c.vence < hoy) return "vencido";
  if (c.vence <= sumarDias(hoy, 7)) return "vence_pronto";
  return "al_dia";
}

/** Días de atraso de un cobro vencido (0 si no está vencido). */
export function diasDeAtraso(vence: string, hoy: string): number {
  if (vence >= hoy) return 0;
  return Math.round((new Date(`${hoy}T12:00:00Z`).getTime() - new Date(`${vence}T12:00:00Z`).getTime()) / 86400000);
}

/**
 * Lo que dice la base cuando se niega (un mes cerrado, un pago de más…): sus mensajes ya están escritos para el dueño.
 * Aquí solo se les quita el ruido técnico; si no hay mensaje, una frase genérica.
 */
export function mensajeDeLaBase(error: { message?: string } | null | undefined, porDefecto = "No se pudo guardar. Vuelve a intentarlo."): string {
  const m = error?.message?.replace(/^ERROR:\s*/i, "").trim();
  return m || porDefecto;
}

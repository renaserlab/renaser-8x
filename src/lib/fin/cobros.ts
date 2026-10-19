/**
 * FINANZAS · COBROS Y PAGOS QUE SE REPITEN, LAS CUENTAS (19-10-2026). Solo funciones puras (sin base de datos), para que
 * las usen las páginas y las pruebe tests/fin-cobros.test.ts. Las reglas que no pueden fallar (no cobrar de más, no
 * pagar con fecha futura, el pago y su movimiento juntos) viven en la base: supabase/migracion-finanzas.sql.
 *
 * Todo total va POR MONEDA: soles y dólares nunca se suman. Las fechas son texto AAAA-MM-DD en el reloj de la empresa.
 */
import { diasDeAtraso, estadoCobro, saldoDeCobro, type Cobro, type EstadoCobro, type Moneda } from "./calculos";

export type PagoDeCobro = { id: string; cobro_id: string; monto: number | string; fecha: string; medio: string | null; created_at: string };
export type PagoHecho = { id: string; pago_id: string; ciclo: string; monto: number | string; fecha: string; created_at: string };

export const MEDIOS_DE_PAGO = ["Transferencia", "Yape / Plin", "Efectivo", "Otro"] as const;

const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const redondo = (v: number) => Math.round(v * 100) / 100;
const porMoneda = () => ({ PEN: 0, USD: 0 }) as Record<Moneda, number>;

/** Cuánto lleva pagado cada cobro (suma de sus pagos). */
export function pagadoPorCobro(pagos: readonly Pick<PagoDeCobro, "cobro_id" | "monto">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pagos) m.set(p.cobro_id, redondo((m.get(p.cobro_id) ?? 0) + n(p.monto)));
  return m;
}

export type CobroConEstado<T extends Cobro = Cobro> = T & { pagado: number; saldo: number; estado: EstadoCobro; atraso: number };

/** Cada cobro con lo pagado, lo que falta, su estado de hoy y sus días de atraso. */
export function conEstado<T extends Cobro>(cobros: readonly T[], pagado: Map<string, number>, hoy: string): CobroConEstado<T>[] {
  return cobros.map((c) => {
    const p = pagado.get(c.id) ?? 0;
    const estado = estadoCobro(c, p, hoy);
    return { ...c, pagado: p, saldo: c.anulado_at ? 0 : saldoDeCobro(c.total, p), estado, atraso: estado === "vencido" ? diasDeAtraso(c.vence, hoy) : 0 };
  });
}

/** Orden para la lista: primero lo vencido (lo más atrasado arriba), después lo que vence antes. */
export function ordenarCobros<T extends { estado: EstadoCobro; vence: string; atraso: number }>(cobros: readonly T[]): T[] {
  const peso: Record<EstadoCobro, number> = { vencido: 0, vence_pronto: 1, al_dia: 2, pagado: 3, anulado: 4 };
  return [...cobros].sort((a, b) => peso[a.estado] - peso[b.estado] || b.atraso - a.atraso || a.vence.localeCompare(b.vence));
}

/** Lo que te deben y lo vencido, por moneda, con cuántos cobros y cuántos clientes atrasados. */
export function totalesDeCobros(cobros: readonly CobroConEstado[]) {
  const deben = porMoneda();
  const vencido = porMoneda();
  let abiertos = 0;
  const atrasados = new Set<string>();
  for (const c of cobros) {
    if (c.estado === "anulado" || c.estado === "pagado") continue;
    abiertos++;
    deben[c.moneda] = redondo(deben[c.moneda] + c.saldo);
    if (c.estado === "vencido") {
      vencido[c.moneda] = redondo(vencido[c.moneda] + c.saldo);
      atrasados.add(c.cliente.trim().toLowerCase());
    }
  }
  return { deben, vencido, abiertos, clientesAtrasados: atrasados.size };
}

/** Lo cobrado en un mes (AAAA-MM), por moneda: los pagos con fecha en ese mes. Ya está en la caja. */
export function cobradoEnMes(pagos: readonly Pick<PagoDeCobro, "cobro_id" | "monto" | "fecha">[], cobros: readonly Pick<Cobro, "id" | "moneda">[], mes: string) {
  const monedaDe = new Map(cobros.map((c) => [c.id, c.moneda]));
  const t = porMoneda();
  for (const p of pagos) {
    if (p.fecha.slice(0, 7) !== mes) continue;
    const m = monedaDe.get(p.cobro_id) ?? "PEN";
    t[m] = redondo(t[m] + n(p.monto));
  }
  return t;
}

const dias = (desde: string, hasta: string) => Math.round((new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 86400000);

/**
 * CUÁNTO TARDAS EN COBRAR, en días, mirando los últimos 90 días. Entran dos clases de cobro:
 *  - los que terminaste de cobrar en esos 90 días: desde que los emitiste hasta su último pago;
 *  - los que siguen abiertos y ya vencieron: desde que los emitiste hasta hoy, porque siguen sin cobrarse.
 * Así un cliente que nunca paga también sube el promedio (si solo se contaran los pagados, el que no paga no
 * empeoraría nada: es la falla que la auditoría del 19-10-2026 encontró en la versión multiempresa). Sin ningún cobro
 * que medir, null: no hay promedio, nunca un cero inventado.
 */
export function diasPromedioDeCobro(cobros: readonly CobroConEstado[], pagos: readonly Pick<PagoDeCobro, "cobro_id" | "fecha">[], hoy: string): { dias: number | null; cobros: number } {
  const desde = new Date(`${hoy}T12:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 90);
  const corte = desde.toISOString().slice(0, 10);
  const ultimoPago = new Map<string, string>();
  for (const p of pagos) if (!ultimoPago.has(p.cobro_id) || p.fecha > ultimoPago.get(p.cobro_id)!) ultimoPago.set(p.cobro_id, p.fecha);
  const medidas: number[] = [];
  for (const c of cobros) {
    if (c.estado === "anulado") continue;
    if (c.estado === "pagado") {
      const fin = ultimoPago.get(c.id);
      if (fin && fin >= corte) medidas.push(Math.max(0, dias(c.emitido, fin)));
    } else if (c.estado === "vencido") {
      medidas.push(Math.max(0, dias(c.emitido, hoy)));
    }
  }
  if (!medidas.length) return { dias: null, cobros: 0 };
  return { dias: Math.round(medidas.reduce((a, b) => a + b, 0) / medidas.length), cobros: medidas.length };
}

// ———————————————————————————————— PAGOS QUE SE REPITEN ————————————————————————————————

export type EstadoPago = "vencido" | "vence_hoy" | "vence_pronto" | "al_dia";

/** El estado de un pago que se repite según su próximo vencimiento: «vence pronto» es dentro de los próximos 7 días. */
export function estadoPago(proximo: string, hoy: string): EstadoPago {
  if (proximo < hoy) return "vencido";
  if (proximo === hoy) return "vence_hoy";
  return dias(hoy, proximo) <= 7 ? "vence_pronto" : "al_dia";
}

/** Lo que se lee junto al pago: «Venció hace 3 días», «Vence hoy», «Vence en 9 días», «Vence el 5 nov». */
export function textoVencimiento(proximo: string, hoy: string): string {
  const d = dias(hoy, proximo);
  if (d < 0) return d === -1 ? "Venció ayer" : `Venció hace ${-d} días`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  if (d <= 14) return `Vence en ${d} días`;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `Vence el ${Number(proximo.slice(8, 10))} ${meses[Number(proximo.slice(5, 7)) - 1]}`;
}

/** El primer día del mes que viene (el tope de «lo que vence hasta fin de mes», igual que la base). */
function inicioDelMesSiguiente(hoy: string): string {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Lo que vence hasta fin de este mes (incluido lo ya vencido sin pagar), por moneda. Mismo criterio que deuda_propia. */
export function porPagarHastaFinDeMes(pagos: readonly { monto: number | string; moneda: Moneda; proximo_vencimiento: string; activo: boolean }[], hoy: string) {
  const tope = inicioDelMesSiguiente(hoy);
  const t = porMoneda();
  let cuantos = 0;
  for (const p of pagos) {
    if (!p.activo || p.proximo_vencimiento >= tope) continue;
    t[p.moneda] = redondo(t[p.moneda] + n(p.monto));
    cuantos++;
  }
  return { total: t, cuantos };
}

/** Lo pagado en un mes (AAAA-MM), por moneda: los pagos hechos con fecha en ese mes. */
export function pagadoEnMes(hechos: readonly Pick<PagoHecho, "pago_id" | "monto" | "fecha">[], pagos: readonly { id: string; moneda: Moneda }[], mes: string) {
  const monedaDe = new Map(pagos.map((p) => [p.id, p.moneda]));
  const t = porMoneda();
  for (const h of hechos) {
    if (h.fecha.slice(0, 7) !== mes) continue;
    const m = monedaDe.get(h.pago_id) ?? "PEN";
    t[m] = redondo(t[m] + n(h.monto));
  }
  return t;
}

/** El último pago hecho de algo que se repite: el único que se puede anular (la base exige lo mismo). */
export function ultimoHecho<T extends { ciclo: string }>(hechos: readonly T[]): T | null {
  return hechos.reduce<T | null>((u, h) => (!u || h.ciclo > u.ciclo ? h : u), null);
}

/** «2026-10-19» → «19 oct». */
export function textoFechaCorta(dia: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(dia.slice(8, 10))} ${meses[Number(dia.slice(5, 7)) - 1]}`;
}

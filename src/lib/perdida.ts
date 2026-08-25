/**
 * PROYECCIÓN DE PÉRDIDA — cuánto dinero podría estar perdiendo la empresa, calculado SOLO con
 * sus propios números contados o verificados. Cada fuga muestra de dónde sale la cifra.
 * Regla sagrada: la máquina nunca inventa un monto; sin dato no hay fuga.
 */
import type { Metrica } from "./rules/anomalias";

export type Fuga = { concepto: string; monto: number; base: string; mensual: boolean };

const MES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const nombreMes = (p: string) => MES[Number(p.slice(5, 7))] ?? p;

export function proyeccionPerdida(metricas: Metrica[]): { fugas: Fuga[]; totalMensual: number } {
  const fugas: Fuga[] = [];
  const serie = (clave: string) =>
    metricas
      .filter((m) => m.clave === clave && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo))
      .map((m) => ({ periodo: m.periodo, valor: Number(m.valor) }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

  // 1. Lo vendido que no se cobró (el mes más reciente con ambos datos).
  const ventas = serie("venta_mes");
  for (const v of [...ventas].reverse()) {
    const c = metricas.find((m) => m.clave === "cobrado_mes" && m.periodo === v.periodo && m.valor != null);
    if (c && Number(c.valor) < Number(v.valor)) {
      fugas.push({ concepto: "Vendido y no cobrado", monto: Number(v.valor) - Number(c.valor), base: `en ${nombreMes(v.periodo)} vendiste ${soles(Number(v.valor))} y cobraste ${soles(Number(c.valor))}`, mensual: true });
      break;
    }
    if (c) break;
  }

  // 2. Lo que te deben los clientes (plata parada, no mensual).
  const deuda = metricas.find((m) => m.clave === "deuda_clientes" && m.valor != null);
  if (deuda) fugas.push({ concepto: "Te deben tus clientes", monto: Number(deuda.valor), base: "según lo que contaste, plata tuya que aún no entra", mensual: false });

  // 3. La brecha con la mejor época (si vendía bastante más).
  const dorada = metricas.find((m) => (m.clave === "venta_epoca_dorada" || (m.clave === "venta_mes" && m.periodo === "epoca_dorada")) && m.valor != null);
  const actual = ventas[ventas.length - 1];
  if (dorada && actual && Number(dorada.valor) > actual.valor * 1.25) {
    fugas.push({ concepto: "La brecha con tu mejor época", monto: Number(dorada.valor) - actual.valor, base: `en tu mejor época vendías ${soles(Number(dorada.valor))} al mes; en ${nombreMes(actual.periodo)}, ${soles(actual.valor)}`, mensual: true });
  }

  return { fugas, totalMensual: fugas.filter((f) => f.mensual).reduce((a, f) => a + f.monto, 0) };
}

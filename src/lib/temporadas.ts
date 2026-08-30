/**
 * EL CALENDARIO COMERCIAL PERUANO.
 *
 * Sin esto, una caída de ventas en agosto se lee como un problema cuando muchas veces es el bajón
 * normal después de Fiestas Patrias. Sirve para dos cosas: ayudar al dueño a reconocer su patrón
 * sin hacerle memoria en frío, y para que el diagnóstico no confunda estacionalidad con deterioro.
 */
export type Mes = { n: number; clave: string; nombre: string; corto: string; nota: string };

export const MESES: Mes[] = [
  { n: 1, clave: "01", nombre: "Enero", corto: "Ene", nota: "Consumo bajo tras las fiestas; arranca campaña escolar" },
  { n: 2, clave: "02", nombre: "Febrero", corto: "Feb", nota: "Carnavales; mes corto" },
  { n: 3, clave: "03", nombre: "Marzo", corto: "Mar", nota: "Campaña escolar fuerte: útiles, uniformes, movilidad" },
  { n: 4, clave: "04", nombre: "Abril", corto: "Abr", nota: "Semana Santa: sube turismo y pescado, baja carne roja" },
  { n: 5, clave: "05", nombre: "Mayo", corto: "May", nota: "Día de la Madre: uno de los picos del año en comercio" },
  { n: 6, clave: "06", nombre: "Junio", corto: "Jun", nota: "Día del Padre; Inti Raymi en Cusco" },
  { n: 7, clave: "07", nombre: "Julio", corto: "Jul", nota: "Fiestas Patrias más gratificación: suele ser el pico más alto" },
  { n: 8, clave: "08", nombre: "Agosto", corto: "Ago", nota: "Bajón después de julio; Santa Rosa" },
  { n: 9, clave: "09", nombre: "Setiembre", corto: "Set", nota: "Primavera; mes tranquilo en la mayoría de rubros" },
  { n: 10, clave: "10", nombre: "Octubre", corto: "Oct", nota: "Señor de los Milagros; turrón y gastronomía" },
  { n: 11, clave: "11", nombre: "Noviembre", corto: "Nov", nota: "Todos los Santos; Black Friday empuja el comercio" },
  { n: 12, clave: "12", nombre: "Diciembre", corto: "Dic", nota: "Navidad más gratificación: el otro pico grande del año" },
];

/** Los últimos N meses cerrados, del más reciente al más antiguo. Nunca incluye el mes en curso. */
export function mesesRecientes(cantidad = 12) {
  return ultimosMeses(new Date(), cantidad);
}

export function ultimosMeses(desde: Date, cantidad = 12): { periodo: string; etiqueta: string }[] {
  const salida: { periodo: string; etiqueta: string }[] = [];
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  for (let i = 1; i <= cantidad; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const mes = MESES[m.getMonth()]!;
    salida.push({ periodo: `${m.getFullYear()}-${mes.clave}`, etiqueta: `${mes.nombre} ${m.getFullYear()}` });
  }
  return salida;
}

/** "2026-07" → "Julio 2026". Para que ninguna pantalla muestre un código al dueño. */
export function nombreDePeriodo(periodo: string): string {
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(periodo);
  if (!m) return periodo === "epoca_dorada" ? "Su mejor época" : "Hoy";
  const mes = MESES.find((x) => x.clave === m[2]);
  return mes ? `${mes.nombre} ${m[1]}` : periodo;
}

/** El último mes cerrado: es el periodo que se le ofrece anotar al dueño, nunca el mes en curso. */
export function mesCerradoMasReciente(): string {
  return mesesRecientes(1)[0]!.periodo;
}

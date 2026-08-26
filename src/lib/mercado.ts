/**
 * LO QUE COSTARÍA AFUERA: referencia de mercado (consultoría tradicional pyme, Perú) por documento.
 * Rangos REFERENCIALES en soles y semanas — se muestran siempre como rango y con su descargo.
 * El valor del aplicativo se ve al sumar: lo que 8X acompaña incluido, afuera se cobra por pieza.
 */
import { BLOQUES_ACTIVOS } from "./activos";
import { bibliotecaEsperada } from "./biblioteca";

type Rango = { soles: [number, number]; semanas: [number, number] };

const MERCADO: Record<string, Rango> = {
  "personas.organigrama": { soles: [500, 1500], semanas: [1, 1] },
  "personas.funciones": { soles: [1200, 3500], semanas: [2, 3] },
  "personas.mvv": { soles: [800, 2500], semanas: [1, 2] },
  "personas.seleccion": { soles: [1000, 3000], semanas: [2, 3] },
  "personas.onboarding": { soles: [800, 2000], semanas: [1, 2] },
  "personas.evaluacion": { soles: [1500, 4000], semanas: [2, 3] },
  "personas.plan_personal": { soles: [800, 2000], semanas: [1, 2] },
  "personas.reglamento": { soles: [1000, 3000], semanas: [2, 3] },
  "personas.cultura": { soles: [1500, 4500], semanas: [2, 4] },
  "procesos.mapa_procesos": { soles: [1500, 4000], semanas: [2, 3] },
  "procesos.procedimientos": { soles: [600, 1500], semanas: [1, 2] },
  "procesos.politicas": { soles: [800, 2000], semanas: [1, 2] },
  "procesos.indicadores": { soles: [1200, 3500], semanas: [2, 3] },
  "producto.calidad": { soles: [1000, 3000], semanas: [2, 3] },
  "marketing.proceso_comercial": { soles: [1500, 4500], semanas: [2, 3] },
  "marketing.oferta": { soles: [1200, 3500], semanas: [2, 3] },
  "direccion.estrategia": { soles: [3000, 8000], semanas: [3, 4] },
  "direccion.plan_empresarial": { soles: [5000, 15000], semanas: [4, 8] },
};
const POR_DEFECTO: Rango = { soles: [800, 2500], semanas: [1, 2] };

const NOMBRES: Record<string, string> = Object.fromEntries(
  BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => [`${b.clave}.${a.clave}`, a.nombre]))
);

/** Estados que cuentan como "documento ya trabajado". Lo contado o a medio construir sigue en la brecha. */
const HECHO = new Set(["lo_tengo", "construido", "en_uso"]);
const A_MEDIO = new Set(["incompleto", "contado", "borrador_generado", "construyendo"]);

export type ItemBrecha = { clave: string; nombre: string; soles: [number, number]; semanas: [number, number]; medio: boolean };

export function brechaMercado(personas: number | null | undefined, assets: { clave: string; estado: string | null }[]): {
  items: ItemBrecha[];
  totalSoles: [number, number];
  totalSemanas: [number, number];
} {
  const estadoPor = new Map(assets.map((a) => [a.clave, a.estado ?? ""]));
  const items: ItemBrecha[] = [];
  for (const clave of bibliotecaEsperada(personas)) {
    const estado = estadoPor.get(clave) ?? "";
    if (HECHO.has(estado)) continue;
    const r = MERCADO[clave] ?? POR_DEFECTO;
    items.push({ clave, nombre: NOMBRES[clave] ?? clave, soles: r.soles, semanas: r.semanas, medio: A_MEDIO.has(estado) });
  }
  const suma = (i: 0 | 1, k: "soles" | "semanas") => items.reduce((a, x) => a + x[k][i], 0);
  return { items, totalSoles: [suma(0, "soles"), suma(1, "soles")], totalSemanas: [suma(0, "semanas"), suma(1, "semanas")] };
}

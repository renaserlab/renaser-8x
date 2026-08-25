/**
 * EL DIAGNÓSTICO DICTA LA BIBLIOTECA — la metodología anti copia-pega.
 * No todas las empresas necesitan todos los documentos: la restricción y las brechas encontradas
 * deciden cuáles construir primero, y la etapa del negocio ajusta el resto.
 */
import { BLOQUES_ACTIVOS } from "./activos";

export type FindingLite = { patron: string | null; pilar: string; titulo: string; impacto: string | null; estado_revision?: string };
export type DocRecomendado = { clave: string; razon: string };

const CLAVES_VALIDAS = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/** Qué documentos ataca cada tipo de hallazgo. El orden dentro de cada lista es prioridad. */
const POR_PATRON: [RegExp, string[]][] = [
  [/fundador|dependencia|decision|aprobacion/, ["personas.funciones", "procesos.politicas", "personas.plan_personal"]],
  [/know_how|una_persona|punto_unico/, ["personas.plan_personal", "personas.onboarding"]],
  [/seguimiento|leads|interesad|conversion|comercial/, ["marketing.proceso_comercial"]],
  [/calidad|reclamo|entrega/, ["producto.calidad", "procesos.procedimientos"]],
  [/rotacion|contratacion|personal|equipo/, ["personas.seleccion", "personas.plan_personal", "personas.reglamento"]],
  [/cultura|valores|conflicto|clima/, ["personas.cultura", "personas.reglamento"]],
  [/precio|margen|rentabilidad/, ["marketing.oferta", "resultados.margen"]],
];

const POR_PILAR: Record<string, string[]> = {
  personas: ["personas.funciones", "personas.plan_personal"],
  procesos: ["procesos.procedimientos", "procesos.politicas"],
  producto: ["producto.calidad"],
  marketing: ["marketing.proceso_comercial"],
};

/**
 * Los 3 documentos que ESTA empresa debe construir primero, cada uno con el hallazgo que lo pide.
 * Solo hallazgos vivos (no rechazados); el impacto alto pesa primero.
 */
export function bibliotecaRecomendada(findings: FindingLite[], etapaNegocio?: string | null): DocRecomendado[] {
  const vivos = findings.filter((f) => f.estado_revision !== "rechazado");
  const orden = [...vivos].sort((a, b) => (a.impacto === "alto" ? -1 : 1) - (b.impacto === "alto" ? -1 : 1));
  const out: DocRecomendado[] = [];
  const ya = new Set<string>();
  const agregar = (clave: string, razon: string) => {
    if (ya.has(clave) || !CLAVES_VALIDAS.has(clave) || out.length >= 3) return;
    ya.add(clave);
    out.push({ clave, razon });
  };
  for (const f of orden) {
    const texto = `${f.patron ?? ""} ${f.titulo}`.toLowerCase();
    const regla = POR_PATRON.find(([re]) => re.test(texto));
    for (const clave of regla?.[1] ?? POR_PILAR[f.pilar] ?? []) agregar(clave, f.titulo);
    if (out.length >= 3) break;
  }
  // Etapa como respaldo: si el diagnóstico aún no llena los 3, la madurez del negocio sugiere el resto.
  if (out.length < 3) {
    const base = etapaNegocio === "madura" || etapaNegocio === "estructura" ? ["personas.funciones", "personas.reglamento", "procesos.procedimientos"] : ["procesos.mapa_procesos", "personas.funciones", "personas.plan_personal"];
    for (const clave of base) agregar(clave, "por la etapa de tu negocio");
  }
  return out;
}

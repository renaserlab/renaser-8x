/**
 * Condiciones de suficiencia (7.9, 13, P1-04). El sistema avanza por condiciones, no por calendario.
 * Sin IA. Se usa en el entrevistador (cierre), en la bandeja ("lista para diagnosticar") y en el avance de etapa.
 */
import { TIPOS_CRITICOS } from "./vigencia";

export type ClaimS = { tipo: string | null; estado: string; pilar: string | null; participant_id: string | null };
export type SesionS = { tipo: string; estado: string; rol: string | null };

export const MIN_CONFIRMADAS_POR_PILAR = 5;
export const PILARES = ["personas", "procesos", "producto", "marketing"] as const;

export type Suficiencia = {
  completo: boolean;
  criticas_pendientes: number;
  contradicciones_abiertas: number;
  sesiones_dueno_incompletas: number;
  pilares_desconocidos: string[];
  equipo_entrevistado: boolean;
  motivos: string[];
};

/** ¿El levantamiento está completo? Ninguna afirmación crítica sin verificar ni contradicha; sesiones del dueño cerradas; cada pilar con un mínimo confirmado. */
export function levantamientoCompleto(claims: ClaimS[], sesiones: SesionS[]): Suficiencia {
  const criticas = claims.filter((c) => c.tipo && TIPOS_CRITICOS.includes(c.tipo) && (c.estado === "sin_verificar" || c.estado === "contradicho")).length;
  const contradicciones = claims.filter((c) => c.estado === "contradicho").length;
  const duenoInc = sesiones.filter((s) => ["sueno_dueno", "empresa_dueno"].includes(s.tipo) && s.estado !== "completa").length;
  const porPilar = new Map<string, number>();
  for (const c of claims) if (c.estado === "confirmado" && c.pilar) porPilar.set(c.pilar, (porPilar.get(c.pilar) ?? 0) + 1);
  const desconocidos = PILARES.filter((p) => (porPilar.get(p) ?? 0) < MIN_CONFIRMADAS_POR_PILAR);
  const haySesionesEquipo = sesiones.some((s) => ["lider", "personal"].includes(s.tipo));
  const equipo = sesiones.some((s) => ["lider", "personal"].includes(s.tipo) && s.estado === "completa");
  const motivos: string[] = [];
  if (criticas) motivos.push(`${criticas} afirmación(es) crítica(s) sin verificar o contradichas`);
  if (duenoInc) motivos.push(`${duenoInc} sesión(es) del dueño sin completar`);
  if (desconocidos.length) motivos.push(`pilares con información insuficiente: ${desconocidos.join(", ")}`);
  // Empresa de un solo dueño (o sin equipo entrevistable): no se exige lo imposible. La versión del dueño
  // se valida con casos concretos, números y documentos — no con entrevistas que no existen.
  if (haySesionesEquipo && !equipo) motivos.push("ninguna entrevista del equipo completada: solo se tiene la versión del dueño");
  return { completo: motivos.length === 0, criticas_pendientes: criticas, contradicciones_abiertas: contradicciones, sesiones_dueno_incompletas: duenoInc, pilares_desconocidos: desconocidos, equipo_entrevistado: equipo, motivos };
}

/** Modo intensivo condicionado (15): orientativo, no promesa. */
export function cabeEnUnDia(o: { personas: number; sedes: number; fuentes: number; procesos_estimados: number; bloque_agendado: boolean }): { cabe: boolean; motivos: string[] } {
  const m: string[] = [];
  if (o.personas > 30) m.push("más de 30 personas: se necesitan más sesiones de levantamiento");
  if (o.sedes > 2) m.push("más de dos sedes");
  if (o.fuentes > 40) m.push("volumen documental alto");
  if (o.procesos_estimados > 15) m.push("más de 15 procesos: el AS-IS no cabe en una tarde");
  if (!o.bloque_agendado) m.push("sin bloque agendado con dueño y equipo disponibles");
  return { cabe: m.length === 0, motivos: m };
}

/** ¿El diagnóstico está listo para El Espejo? Todo hallazgo que se va a mostrar está revisado y ninguno exige validación. */
export function diagnosticoListo(findings: { estado_revision: string; requiere_validacion?: boolean | null }[]): { listo: boolean; pendientes: number; por_validar: number } {
  const pendientes = findings.filter((f) => f.estado_revision === "pendiente").length;
  const porValidar = findings.filter((f) => f.requiere_validacion && f.estado_revision !== "rechazado").length;
  return { listo: findings.length > 0 && pendientes === 0 && porValidar === 0, pendientes, por_validar: porValidar };
}

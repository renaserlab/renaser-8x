import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * "Mi empresa hoy": el diagnóstico vivo que el empresario recibe sin esperar publicación.
 * Todo es mecánico (consultas, no IA): se arma desde claims, contradicciones, diagnósticos,
 * hallazgos sustentados (requiere_validacion = false), Caleta y procesos. Lo que pide validación
 * humana NO aparece: mejor decir "nos faltan piezas" que inventar. Capítulos: Espejo, Lo que no
 * estás viendo, fortalezas, restricción, qué sistematizar, plan tentativo.
 */

export type EvidenciaHoy = { texto: string; fuente: string; fecha: string | null };
export type LadoEspejo = { texto: string; fuente: string; fecha: string | null; clase: "documento" | "equipo" | "datos" | "dueno" };
export type Espejo = { declarado: LadoEspejo; contraste: LadoEspejo; explicacion: string | null; resuelto: boolean };
export type HallazgoHoy = {
  id: string;
  titulo: string;
  causa: string | null;
  impacto: string | null;
  pilar: string;
  patron: string | null;
  preserva: boolean;
  recomendacion: string | null;
  costo_posible: string | null;
  evidencia: EvidenciaHoy[];
};
export type PrioridadHoy = { n: number; problema: string; porQue: string; primerMovimiento: string; indicador: string | null };

const CLASE_FUENTE = (tipo: string | null, rol: string | null): LadoEspejo["clase"] => {
  if (rol === "dueno" || rol === "socio") return "dueno";
  if (rol) return "equipo";
  if (tipo === "dato") return "datos";
  return "documento";
};

/** El nombre de una persona nunca viaja al cliente: solo su puesto o su rol (frontera P0-03). */
const fuenteAnonima = (c: { sources: { nombre: string; tipo: string | null } | null; participants: { rol: string | null; puesto: string | null } | null }): string => {
  if (c.participants) return c.participants.rol === "dueno" ? "lo que tú nos contaste" : `${c.participants.puesto ?? "una persona del equipo"} (conversación)`;
  if (c.sources) return c.sources.nombre;
  return "una fuente";
};

export async function empresaHoy(companyId: string) {
  const sb = supabaseAdmin();
  const [{ data: claims }, { data: diagnoses }, { data: findings }, { data: procesos }, { data: kh }, { data: fuentes }, { data: acciones }] = await Promise.all([
    sb.from("claims").select("id,texto,estado,pilar,fecha_afirmacion,contradice_a,explicacion_contradiccion,prioridad_validacion, sources(nombre,tipo), participants(rol,puesto)").eq("company_id", companyId),
    sb.from("diagnoses").select("pilar,estado,resumen").eq("company_id", companyId),
    sb.from("findings").select("id,titulo,causa_raiz,impacto,pilar,patron,veredicto,recomendacion,requiere_validacion,estado_revision,filtros, finding_evidence(relacion, claims(texto,fecha_afirmacion, sources(nombre,tipo), participants(rol,puesto)))").eq("company_id", companyId).neq("estado_revision", "rechazado"),
    sb.from("processes").select("id,nombre,area, process_nodes(etiqueta,problema,tipo)").eq("company_id", companyId).eq("version", "as_is"),
    sb.from("know_how").select("puesto,criticidad,documentado,situacion,senal,regla_practica").eq("company_id", companyId),
    sb.from("sources").select("id,estado").eq("company_id", companyId),
    sb.from("actions").select("accion,kpi,finding_id,prioridad").eq("company_id", companyId).order("prioridad"),
  ]);

  const confirmadas = (claims ?? []).filter((c) => c.estado === "confirmado").length;
  const porValidar = (claims ?? []).filter((c) => c.estado === "contradicho" || (c.estado === "sin_verificar" && c.prioridad_validacion)).length;

  // EL ESPEJO: cada punto donde una fuente dice una cosa y otra dice otra (abierto o ya resuelto).
  const porId = new Map((claims ?? []).map((c) => [c.id, c]));
  const espejo: Espejo[] = [];
  for (const c of claims ?? []) {
    if (!c.contradice_a) continue;
    const otro = porId.get(c.contradice_a);
    if (!otro) continue;
    const lado = (x: typeof c): LadoEspejo => ({ texto: x.texto, fuente: fuenteAnonima(x as unknown as Parameters<typeof fuenteAnonima>[0]), fecha: x.fecha_afirmacion, clase: CLASE_FUENTE((x.sources as unknown as { tipo: string | null } | null)?.tipo ?? null, (x.participants as unknown as { rol: string | null } | null)?.rol ?? null) });
    espejo.push({ declarado: lado(otro as typeof c), contraste: lado(c), explicacion: c.explicacion_contradiccion ?? null, resuelto: c.estado !== "contradicho" && otro.estado !== "contradicho" });
  }

  // Hallazgos que se pueden mostrar sin consultor: sustentados por el auditor y la evidencia (sin validación pendiente).
  const mostrables: HallazgoHoy[] = (findings ?? [])
    .filter((f) => !f.requiere_validacion)
    .map((f) => ({
      id: f.id,
      titulo: f.titulo.replace(/^Fortaleza: /, ""),
      causa: f.causa_raiz,
      impacto: f.impacto,
      pilar: f.pilar,
      patron: f.patron,
      preserva: f.veredicto === "keep" || !!(f.filtros as { preserva?: boolean } | null)?.preserva,
      recomendacion: f.recomendacion,
      costo_posible: ((f.filtros as { costo_posible?: string } | null)?.costo_posible ?? null) as string | null,
      evidencia: ((f.finding_evidence as unknown as { relacion: string; claims: { texto: string; fecha_afirmacion: string | null; sources: { nombre: string; tipo: string | null } | null; participants: { rol: string | null; puesto: string | null } | null } }[]) ?? [])
        .filter((e) => e.relacion === "sustenta")
        .map((e) => ({ texto: e.claims.texto, fuente: fuenteAnonima(e.claims), fecha: e.claims.fecha_afirmacion })),
    }));

  // Misma consolidación que el worker, aplicada al mostrar (protege contra hallazgos históricos duplicados):
  // misma naturaleza con evidencia idéntica o subconjunto → queda el más evidenciado.
  const evidenciaClave = (h: HallazgoHoy) => h.evidencia.map((e) => e.texto).sort().join("|");
  const esDuplicadoHoy = (h: HallazgoHoy) => mostrables.some((g) => g !== h && g.preserva === h.preserva && (
    (evidenciaClave(g) === evidenciaClave(h) && mostrables.indexOf(g) < mostrables.indexOf(h)) ||
    (h.evidencia.length < g.evidencia.length && h.evidencia.every((e) => g.evidencia.some((x) => x.texto === e.texto)))
  ));
  const unicos = mostrables.filter((h) => !esDuplicadoHoy(h));
  const fortalezas = unicos.filter((h) => h.preserva);
  const problemas = unicos.filter((h) => !h.preserva);
  const peso = (h: HallazgoHoy) => (h.impacto === "alto" ? 3 : h.impacto === "medio" ? 2 : 1) + Math.min(h.evidencia.length, 3);
  const noVes = [...problemas].sort((a, b) => peso(b) - peso(a));

  // Restricción principal (tentativa): el problema de más peso; secundarias, los siguientes de peso alto.
  const restriccion = noVes[0] ?? null;
  const secundarias = noVes.slice(1).filter((h) => h.impacto === "alto").slice(0, 2);

  // Qué sistematizar primero: procesos con trabas marcadas + criterios de la Caleta sin escribir.
  const sistematizar: { nombre: string; motivo: string }[] = [];
  for (const p of procesos ?? []) {
    const trabas = ((p.process_nodes as { etiqueta: string; problema: string | null }[]) ?? []).filter((n) => n.problema);
    if (trabas.length) sistematizar.push({ nombre: p.nombre, motivo: `tiene ${trabas.length} punto(s) marcados con problema (${trabas.slice(0, 2).map((t) => t.etiqueta).join(", ")})` });
  }
  const caletaSinEscribir = (kh ?? []).filter((k) => !k.documentado);
  if (caletaSinEscribir.length) {
    const criticos = caletaSinEscribir.filter((k) => k.criticidad === "alta");
    sistematizar.push({ nombre: "La Caleta del equipo", motivo: `${caletaSinEscribir.length} criterio(s) valiosos viven solo en la cabeza de alguien${criticos.length ? `, ${criticos.length} crítico(s)` : ""}: si esa persona falta, se pierden` });
  }

  // Plan tentativo — "Por dónde empezaría": 3 a 5 prioridades desde los hallazgos de más peso.
  const kpiDe = new Map((acciones ?? []).filter((a) => a.finding_id).map((a) => [a.finding_id as string, a.kpi as string | null]));
  const tentativo: PrioridadHoy[] = [];
  for (const h of [...fortalezas.filter((f) => f.recomendacion), ...noVes].slice(0, 6)) {
    if (tentativo.length >= 5) break;
    if (!h.recomendacion) continue;
    tentativo.push({
      n: tentativo.length + 1,
      problema: h.titulo,
      porQue: h.causa ?? (h.preserva ? "Es una fortaleza que no debe depender de una sola persona." : ""),
      primerMovimiento: h.recomendacion,
      indicador: kpiDe.get(h.id) ?? null,
    });
  }

  // La Caleta capturada, como valor propio (anonima: solo el puesto).
  const caleta = (kh ?? []).map((k) => ({ puesto: (k.puesto ?? null) as string | null, situacion: ((k as { situacion?: string | null }).situacion ?? null), senal: ((k as { senal?: string | null }).senal ?? null), regla: ((k as { regla_practica?: string | null }).regla_practica ?? null), documentado: !!k.documentado, critico: k.criticidad === "alta" }));

  // Nivel de la experiencia (valor progresivo).
  const hayDiagnostico = (diagnoses ?? []).some((d) => d.estado !== "desconocido");
  const nivel = tentativo.length >= 3 && hayDiagnostico ? 4 : hayDiagnostico ? 3 : espejo.length > 0 || mostrables.length > 0 || (kh ?? []).length > 0 ? 2 : (claims ?? []).length > 0 ? 1 : 0;

  return {
    caleta,
    stats: { fuentes: (fuentes ?? []).length, afirmaciones: (claims ?? []).length, confirmadas, porValidar, espejo: espejo.length },
    pilares: ["personas", "procesos", "producto", "marketing"].map((p) => (diagnoses ?? []).find((d) => d.pilar === p) ?? { pilar: p, estado: "desconocido", resumen: null }),
    espejo,
    fortalezas,
    noVes,
    restriccion,
    secundarias,
    sistematizar,
    tentativo,
    nivel,
  };
}
export type EmpresaHoy = Awaited<ReturnType<typeof empresaHoy>>;

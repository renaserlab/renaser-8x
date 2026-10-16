import { supabaseAdmin } from "@/lib/supabase/admin";
import { nivelConfianza, esRiesgoGravePendiente, esProvisional } from "@/lib/rules/evidencia";
import { MIN_CONFIRMADAS_POR_PILAR } from "@/lib/rules/suficiencia";

/**
 * "Mi empresa hoy": el diagnóstico vivo que el empresario recibe sin esperar publicación.
 * Todo es mecánico (consultas, no IA): se arma desde claims, contradicciones, diagnósticos,
 * hallazgos sustentados (requiere_validacion = false), Caleta y procesos. Lo que pide validación
 * humana NO aparece: mejor decir "nos faltan piezas" que inventar. Capítulos: Espejo, Lo que no
 * estás viendo, fortalezas, restricción, qué sistematizar, plan tentativo.
 *
 * PROVISIONAL NUNCA ES CONCLUSIÓN (Dirección 13-10-2026, R10.4). Un hallazgo formado solo con afirmaciones
 * que nadie confirmó (findings.provisional = true) no entra en "lo que te frena" ni en el plan tentativo:
 * se devuelve aparte, en `porConfirmar`, para que la página lo pinte como lo que es —algo visto en sus
 * documentos que conviene revisar juntos— y avise cuando sería grave de confirmarse. Esta función solo lo
 * calcula: que llegue a la pantalla del empresario depende de que la página del portal lo pinte.
 *
 * Y NO TODO LO PROVISIONAL LO ES POR LO MISMO. Un hallazgo puede seguir sin ser conclusión aunque lo que lo sostiene
 * ya esté confirmado, porque del área entera se sabe poco (el candado del pilar). Decirle a ese dueño «sale de
 * documentos que nadie confirmó» y debajo «lo que tú nos contaste» es un origen falso y una tarea que no puede hacer.
 * Cada punto lleva su `motivo`, y cada motivo su texto.
 *
 * CIERRE DEL 13-10-2026. Cuatro cosas que el texto todavía decía de más:
 *  - «Lo que lo sostiene ya está confirmado» se le decía a un hallazgo con 1 afirmación confirmada y 3 papeles sin
 *    confirmar. El porqué de cada punto sale ahora de su evidencia real: cuántas confirmadas, cuántas por confirmar.
 *  - Un hallazgo de la IA en un área con menos información confirmada que la mínima no es conclusión, diga lo que diga
 *    la columna: el candado se lee aquí con los hechos de hoy, igual que al releer la evidencia (releerEvidencia).
 *  - «De tu parte no hay nada pendiente» no se dice si el área tiene un punto donde dos fuentes se contradicen: mientras
 *    siga abierto nadie vuelve a revisar nada, y aclararlo le toca al dueño.
 *  - Una fortaleza provisional no se veía en ningún lado. Va aparte, en `fortalezasPorConfirmar`.
 */

export type EvidenciaHoy = { texto: string; fuente: string; fecha: string | null };
/**
 * Por qué un punto todavía no es conclusión:
 *  - documentos_sin_confirmar: salió solo de papeles del dueño (archivo, foto, tabla de datos) y nadie lo confirmó.
 *  - sin_confirmar: nadie confirmó lo que lo sostiene y no viene solo de sus papeles (algo dicho que quedó en duda o
 *    venció, lo visto en una visita), o ya no queda a la vista de dónde salió.
 *  - area_con_poca_informacion: lo que lo sostiene SÍ está confirmado, pero el área tiene menos información confirmada
 *    que la mínima para concluir. No hay nada que confirmar en este punto: hace falta saber más del área.
 *  - pendiente_de_releer: lo que lo sostiene ya está confirmado y el área tiene información suficiente; el rótulo es
 *    del día en que se revisó y se levanta en la próxima lectura. El dueño no tiene que hacer nada.
 */
export type MotivoPorConfirmar = "documentos_sin_confirmar" | "sin_confirmar" | "area_con_poca_informacion" | "pendiente_de_releer";
/** La evidencia que sostiene un punto, contada: cuántas afirmaciones están confirmadas y cuántas siguen sin confirmar. */
export type SustentoHoy = { confirmadas: number; porConfirmar: number };
/**
 * Lo que todavía no es conclusión: se ofrece como pregunta, no como veredicto, y dice por qué.
 * `porQue` es el texto que lee el dueño, armado con la cuenta real de su evidencia (`sustento`) y con si el área tiene
 * una contradicción abierta (`contradiccionAbierta`).
 */
export type PorConfirmarHoy = { id: string; titulo: string; pilar: string; graveSiSeConfirma: boolean; confianza: "alta" | "media" | "baja" | "desconocida"; motivo: MotivoPorConfirmar; deDonde: string; fuentes: number; sustento: SustentoHoy; contradiccionAbierta: boolean; porQue: string };

/**
 * El porqué de cada motivo en su caso limpio (toda la evidencia del mismo lado y ninguna contradicción abierta), en
 * palabras de dueño. El texto que se pinta es `porQue` de cada punto (porQueNoEsConclusion), que parte de estos.
 */
export const POR_QUE_NO_ES_CONCLUSION: Record<MotivoPorConfirmar, string> = {
  documentos_sin_confirmar: "Sale de documentos que aún nadie confirmó.",
  sin_confirmar: "Lo que lo sostiene todavía no está confirmado.",
  area_con_poca_informacion: "Lo que lo sostiene ya está confirmado, pero de esta área todavía hay poca información confirmada: cuando sepamos más, se vuelve conclusión o se descarta.",
  pendiente_de_releer: "Lo que lo sostiene ya está confirmado. Falta volver a revisarlo para darlo por conclusión: de tu parte no hay nada pendiente.",
};
/** El rótulo corto de cada motivo. */
export const ROTULO_POR_CONFIRMAR: Record<MotivoPorConfirmar, string> = {
  documentos_sin_confirmar: "por confirmar",
  sin_confirmar: "por confirmar",
  area_con_poca_informacion: "falta conocer más el área",
  pendiente_de_releer: "por revisar de nuevo",
};
/** Cuánta de la evidencia que lo sostiene está confirmada, con su cuenta. Nunca «ya está confirmado» si algo falta. */
function cuentaDelSustento(s: SustentoHoy): string {
  if (s.confirmadas === 0) return "Lo que lo sostiene todavía no está confirmado";
  if (s.porConfirmar === 0) return "Lo que lo sostiene ya está confirmado";
  const total = s.confirmadas + s.porConfirmar;
  return `De ${total} cosas que lo sostienen, ${s.confirmadas} ${s.confirmadas === 1 ? "está confirmada" : "están confirmadas"} y ${s.porConfirmar} ${s.porConfirmar === 1 ? "sigue" : "siguen"} por confirmar`;
}

/**
 * Por qué un punto todavía no es conclusión, con los hechos de hoy. Una sola redacción para Mi empresa hoy y el informe.
 *  - La parte de la evidencia sale de su cuenta real (cuentaDelSustento).
 *  - Con una contradicción abierta en el área no se promete «de tu parte no hay nada pendiente»: el diagnóstico espera
 *    a que se aclare (no corre con contradicciones abiertas), así que ese punto es justamente lo pendiente.
 */
export function porQueNoEsConclusion(p: Pick<PorConfirmarHoy, "motivo" | "sustento" | "contradiccionAbierta">): string {
  const todoConfirmado = p.sustento.confirmadas > 0 && p.sustento.porConfirmar === 0;
  if (p.motivo === "documentos_sin_confirmar" || p.motivo === "sin_confirmar") return POR_QUE_NO_ES_CONCLUSION[p.motivo];
  const cuenta = cuentaDelSustento(p.sustento);
  if (p.motivo === "area_con_poca_informacion") {
    const base = todoConfirmado ? POR_QUE_NO_ES_CONCLUSION.area_con_poca_informacion : `${cuenta}. Además, de esta área todavía hay poca información confirmada: cuando sepamos más, se vuelve conclusión o se descarta.`;
    return p.contradiccionAbierta ? `${base} Y hay un punto de esta área donde dos fuentes dicen cosas distintas: falta aclararlo.` : base;
  }
  if (p.contradiccionAbierta) return `${cuenta}. Falta volver a revisarlo para darlo por conclusión, y eso espera a que se aclare un punto de esta área donde dos fuentes dicen cosas distintas.`;
  return todoConfirmado ? POR_QUE_NO_ES_CONCLUSION.pendiente_de_releer : `${cuenta}. Falta volver a revisarlo para darlo por conclusión.`;
}

/**
 * El resumen de un área sin conclusión solo llega al dueño si es una de las frases fijas del diagnóstico, que empiezan
 * así (RESUMEN_MODO_PROVISIONAL y RESUMEN_SIN_INFORMACION, en jobs/handlers/diagnostico.ts). Lo guardado antes era la
 * cuenta interna («Solo 2 definiciones confirmadas sobre personas… hay que levantar más») o la lectura del modelo sobre
 * papeles sin confirmar: eso no se pinta; la página dice con sus palabras que falta información.
 */
const INICIO_RESUMEN_SIN_CONCLUSION = "Todavía no hay una conclusión sobre esta área";

/** Los que salen solo de papeles sin confirmar van en su propia sección: son los únicos de los que es cierto «lo vimos en tus documentos». */
export const esDeDocumentos = (p: Pick<PorConfirmarHoy, "motivo">): boolean => p.motivo === "documentos_sin_confirmar";
/** Lo que el dueño llama «mis documentos»: un archivo, una foto del cuaderno, una tabla de datos. Una visita del consultor o un audio no lo son. */
const TIPOS_DE_PAPEL = new Set(["documento", "foto", "dato"]);
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
  /** Se formó solo con afirmaciones sin confirmar. Los mostrables nacen en false (se filtran antes); el campo viaja para que quien pinte un hallazgo pueda rotularlo sin volver a la base. */
  provisional?: boolean;
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
    sb.from("findings").select("id,titulo,causa_raiz,impacto,pilar,patron,veredicto,recomendacion,requiere_validacion,estado_revision,origen,filtros,impacto_potencial,confianza,provisional, finding_evidence(relacion, claims(texto,estado,fecha_afirmacion, sources(nombre,tipo), participants(rol,puesto)))").eq("company_id", companyId).neq("estado_revision", "rechazado"),
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
  const paresVistos = new Set<string>(); // A↔B y B↔A son el MISMO punto: se muestra una sola vez
  for (const c of claims ?? []) {
    if (!c.contradice_a) continue;
    const otro = porId.get(c.contradice_a);
    if (!otro) continue;
    const par = [c.id, otro.id].sort().join("|");
    if (paresVistos.has(par)) continue;
    paresVistos.add(par);
    const lado = (x: typeof c): LadoEspejo => ({ texto: x.texto, fuente: fuenteAnonima(x as unknown as Parameters<typeof fuenteAnonima>[0]), fecha: x.fecha_afirmacion, clase: CLASE_FUENTE((x.sources as unknown as { tipo: string | null } | null)?.tipo ?? null, (x.participants as unknown as { rol: string | null } | null)?.rol ?? null) });
    espejo.push({ declarado: lado(otro as typeof c), contraste: lado(c), explicacion: c.explicacion_contradiccion ?? null, resuelto: c.estado !== "contradicho" && otro.estado !== "contradicho" });
  }

  type EvidenciaCruda = { relacion: string; claims: { texto: string; estado?: string | null; fecha_afirmacion: string | null; sources: { nombre: string; tipo: string | null } | null; participants: { rol: string | null; puesto: string | null } | null } };
  const sustentos = (f: { finding_evidence: unknown }) => ((f.finding_evidence as unknown as EvidenciaCruda[]) ?? []).filter((e) => e.relacion === "sustenta");
  // Confirmadas de un área, contadas como las cuenta el diagnóstico: las del pilar y las transversales.
  const confirmadasDelArea = (pilar: string) => (claims ?? []).filter((c) => c.estado === "confirmado" && (c.pilar === pilar || c.pilar === "transversal")).length;
  // Puntos del área donde dos fuentes se contradicen y nadie lo aclaró: mientras haya uno, el área no se vuelve a diagnosticar.
  const contradiccionesDelArea = (pilar: string) => (claims ?? []).filter((c) => c.estado === "contradicho" && (c.pilar === pilar || c.pilar === "transversal")).length;
  type FilaHallazgo = NonNullable<typeof findings>[number];
  // EL CANDADO DEL ÁREA, LEÍDO HOY. Un hallazgo de la IA en un área con menos confirmadas que el mínimo no es conclusión
  // aunque su columna diga provisional = false (un pendiente nacido cuando el área tenía más, o antes del candado). Es la
  // misma regla que releerEvidencia: lo escrito por el consultor responde solo por su propia evidencia.
  const areaCorta = (f: FilaHallazgo) => f.origen === "ia" && confirmadasDelArea(f.pilar) < MIN_CONFIRMADAS_POR_PILAR;
  const noEsConclusion = (f: FilaHallazgo) => !!f.provisional || areaCorta(f);
  const esFortaleza = (f: FilaHallazgo) => f.veredicto === "keep" || !!(f.filtros as { preserva?: boolean } | null)?.preserva;

  // POR CONFIRMAR: provisionales que el candado de validación dejaría pasar. Se muestran como lo que son —algo que
  // todavía no es conclusión— y nunca como veredicto. Los que además piden validación del consultor siguen sin
  // aparecer, como siempre. El motivo se lee de los hechos de HOY (el estado de su evidencia y cuánto se sabe del
  // área), no del texto que dejó escrito el diagnóstico.
  const comoPorConfirmar = (f: FilaHallazgo): PorConfirmarHoy => {
    const ev = sustentos(f);
    const fuentesVistas = [...new Set(ev.map((e) => fuenteAnonima(e.claims)))];
    // Misma regla que al nacer el hallazgo: sin ninguna afirmación confirmada, es provisional por su propia evidencia.
    const sinConfirmar = esProvisional(ev.map((e) => ({ estado: e.claims.estado ?? "" })));
    const soloPapeles = ev.length > 0 && ev.every((e) => !e.claims.participants && TIPOS_DE_PAPEL.has(e.claims.sources?.tipo ?? ""));
    const motivo: MotivoPorConfirmar = sinConfirmar
      ? soloPapeles ? "documentos_sin_confirmar" : "sin_confirmar"
      : areaCorta(f) ? "area_con_poca_informacion" : "pendiente_de_releer";
    const lista = fuentesVistas.slice(0, 3).join(", ");
    const confirmadasDelSustento = ev.filter((e) => e.claims.estado === "confirmado").length;
    const sustento: SustentoHoy = { confirmadas: confirmadasDelSustento, porConfirmar: ev.length - confirmadasDelSustento };
    // Abierta en el área, o en lo mismo que lo sostiene (una afirmación suya puede ser de otra área).
    const contradiccionAbierta = contradiccionesDelArea(f.pilar) > 0 || ev.some((e) => e.claims.estado === "contradicho");
    const fortaleza = esFortaleza(f);
    return {
      id: f.id,
      titulo: fortaleza ? f.titulo.replace(/^Fortaleza: /, "") : f.titulo,
      pilar: f.pilar,
      // De una fortaleza no se dice «grave si se confirma»: que resulte cierta es una buena noticia.
      graveSiSeConfirma: !fortaleza && esRiesgoGravePendiente({ impacto_potencial: f.impacto_potencial, confianza: f.confianza }),
      confianza: nivelConfianza(f.confianza),
      motivo,
      // «Lo vimos en» solo es cierto de un papel. De lo demás se dice de dónde sale; y si no queda rastro, se dice eso.
      deDonde: !fuentesVistas.length ? "No quedó a la vista de dónde salió." : soloPapeles ? `Lo vimos en: ${lista}.` : `Sale de: ${lista}.`,
      fuentes: fuentesVistas.length,
      sustento,
      contradiccionAbierta,
      porQue: porQueNoEsConclusion({ motivo, sustento, contradiccionAbierta }),
    };
  };
  const sinConcluir = (findings ?? []).filter((f) => !f.requiere_validacion && noEsConclusion(f));
  const porConfirmar: PorConfirmarHoy[] = sinConcluir
    .filter((f) => !esFortaleza(f))
    .map(comoPorConfirmar)
    .sort((a, b) => Number(b.graveSiSeConfirma) - Number(a.graveSiSeConfirma));
  // UNA FORTALEZA PROVISIONAL TAMBIÉN SE VE. Hasta el 13-10-2026 no entraba en ninguna lista: ni fortaleza (no es
  // conclusión) ni por confirmar (se excluían). El dueño no sabía que algo suyo parecía funcionar bien. Va aparte,
  // rotulada «por confirmar», y nunca entra en «lo que no debes romper» ni en el plan tentativo.
  const fortalezasPorConfirmar: PorConfirmarHoy[] = sinConcluir.filter(esFortaleza).map(comoPorConfirmar);

  // Hallazgos que se pueden mostrar sin consultor: sustentados por el auditor y la evidencia (sin validación
  // pendiente) y que SÍ son conclusión: ni provisionales, ni de la IA en un área que todavía no puede concluir.
  const mostrables: HallazgoHoy[] = (findings ?? [])
    .filter((f) => !f.requiere_validacion && !noEsConclusion(f))
    .map((f) => ({
      id: f.id,
      titulo: f.titulo.replace(/^Fortaleza: /, ""),
      causa: f.causa_raiz,
      impacto: f.impacto,
      pilar: f.pilar,
      patron: f.patron,
      preserva: esFortaleza(f),
      recomendacion: f.recomendacion,
      costo_posible: ((f.filtros as { costo_posible?: string } | null)?.costo_posible ?? null) as string | null,
      evidencia: sustentos(f).map((e) => ({ texto: e.claims.texto, fuente: fuenteAnonima(e.claims), fecha: e.claims.fecha_afirmacion })),
      // Siempre false aquí (se filtró arriba); viaja para que quien pinte un hallazgo pueda rotularlo sin volver a la base.
      provisional: noEsConclusion(f),
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
    sistematizar.push({ nombre: "El saber del equipo", motivo: `${caletaSinEscribir.length} criterio(s) valiosos viven solo en la cabeza de alguien${criticos.length ? `, ${criticos.length} crítico(s)` : ""}: si esa persona falta, se pierden` });
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
  const nivel = tentativo.length >= 3 && hayDiagnostico ? 4 : hayDiagnostico ? 3 : espejo.length > 0 || mostrables.length > 0 || porConfirmar.length > 0 || fortalezasPorConfirmar.length > 0 || (kh ?? []).length > 0 ? 2 : (claims ?? []).length > 0 ? 1 : 0;

  return {
    caleta,
    stats: { fuentes: (fuentes ?? []).length, afirmaciones: (claims ?? []).length, confirmadas, porValidar, espejo: espejo.length, porConfirmar: porConfirmar.length, fortalezasPorConfirmar: fortalezasPorConfirmar.length },
    pilares: ["personas", "procesos", "producto", "marketing"].map((p) => {
      const d: { pilar: string; estado: string; resumen: string | null } = (diagnoses ?? []).find((x) => x.pilar === p) ?? { pilar: p, estado: "desconocido", resumen: null };
      // De un área sin conclusión solo se pinta una de las frases fijas; un texto viejo de la base no llega al dueño.
      return d.estado === "desconocido" && d.resumen && !String(d.resumen).startsWith(INICIO_RESUMEN_SIN_CONCLUSION) ? { ...d, resumen: null } : d;
    }),
    espejo,
    porConfirmar,
    fortalezasPorConfirmar,
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

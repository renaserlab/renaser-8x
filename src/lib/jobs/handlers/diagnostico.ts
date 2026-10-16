import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrDiagnosticador, correrAuditor } from "@/lib/ai/agents/diagnosticador";
import { claimsDeEmpresa, claimsComoTexto, procesoComoJSON, registrarLlamada, claimComoEvidencia } from "@/lib/db/queries";
import { progreso, encolar, PRIORIDAD, claveIdempotente } from "../queue";
import { calibrarImpacto, aplicarFiltros, estadoPilar, naturalezaDeHallazgo, confianzaDeHallazgo, type ClaimEvidencia } from "@/lib/rules/evidencia";
import { MIN_CONFIRMADAS_POR_PILAR } from "@/lib/rules/suficiencia";
import { detectarAnomalias, tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";
import { comoDato } from "@/lib/rules/patrones";
import { anotarFuentesDeClaims } from "../contexto";
import { preguntaRepetida } from "./entrevista";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

const PILARES = ["personas", "procesos", "producto", "marketing"] as const;

/** Fuentes cuyas afirmaciones sin verificar entran como evidencia PROVISIONAL: papeles y lo visto. Las de entrevista no: su camino es la validación con el dueño. */
const FUENTES_PROVISIONALES = new Set(["documento", "foto", "dato", "observacion"]);

type ClaimDiag = Awaited<ReturnType<typeof claimsDeEmpresa>>[number];
/** Lo mínimo de una afirmación para saber si entra al diagnóstico: vale para la fila completa y para una consulta corta (estado y tipo de la fuente). */
type AfirmacionConFuente = { estado: string; sources?: { tipo?: string | null } | null };

/**
 * Qué afirmaciones ve el diagnóstico. Hasta el 13-10-2026 solo las confirmadas, contradichas o caducadas:
 * 186 de 192 afirmaciones de documentos de clientes reales nunca llegaron a él, porque nadie las confirma una
 * por una. Ahora las sin verificar de documentos y observaciones también entran, rotuladas: el hallazgo que
 * solo se apoye en ellas se guarda como PROVISIONAL, con confianza baja y su motivo (Dirección, R10.4).
 */
const entraAlDiagnostico = (c: AfirmacionConFuente): boolean =>
  c.estado === "confirmado" || c.estado === "contradicho" || c.estado === "caducado" || (c.estado === "sin_verificar" && FUENTES_PROVISIONALES.has(c.sources?.tipo ?? ""));

/**
 * Afirmación sin verificar que entra como evidencia provisional (cuenta para la segunda puerta del candado).
 * Exportada junto a puertaDelCandado para que quien decida si un pilar se diagnostica cuente lo mismo que el
 * manejador: si cada uno contara a su manera, el disparo y el diagnóstico abrirían puertas distintas.
 */
export const esProvisionalDeDocumento = (c: AfirmacionConFuente): boolean => c.estado === "sin_verificar" && entraAlDiagnostico(c);

/**
 * Techo de confianza de un hallazgo nacido en MODO PROVISIONAL (pilar con menos de MIN_CONFIRMADAS_POR_PILAR
 * afirmaciones confirmadas): queda por debajo del umbral de «media» (0,50 en nivelConfianza) con margen, para
 * que ningún hallazgo del pilar pueda leerse como seguro mientras lo que lo sostiene son papeles sin confirmar.
 */
export const TOPE_CONFIANZA_MODO_PROVISIONAL = 0.4;

/**
 * El candado de suficiencia tiene dos puertas (Dirección, R10.4):
 *  - normal:      confirmadas ≥ mínimo → se diagnostica; cada hallazgo decide su provisionalidad por su propia evidencia.
 *  - provisional: confirmadas < mínimo pero confirmadas + provisionales ≥ mínimo → se diagnostica, y TODOS los
 *                 hallazgos nacen provisional = true con confianza baja. El estado del pilar sigue «desconocido»:
 *                 lo provisional nunca es conclusión, pero sí se ve (porConfirmar en el portal, por corroborar en el tablero).
 *                 Aprobarlos no los vuelve conclusión (releerEvidencia): dejan de ser provisionales cuando el pilar
 *                 llega al mínimo de confirmadas y su propia evidencia está confirmada.
 *  - desconocido: ni así llega al mínimo → no se gasta una llamada en lo que no se puede sostener.
 */
export function puertaDelCandado(confirmadas: number, provisionales: number, minimo = MIN_CONFIRMADAS_POR_PILAR): "normal" | "provisional" | "desconocido" {
  if (confirmadas >= minimo) return "normal";
  if (confirmadas + provisionales >= minimo) return "provisional";
  return "desconocido";
}

/**
 * Lo ÚNICO que se guarda en diagnoses.resumen cuando el pilar se leyó en modo provisional. Esa columna llega tal cual
 * al empresario (Mi empresa hoy, el informe) y al contexto del modelo de alto rendimiento. Hasta el 13-10-2026 llevaba
 * la lectura del diagnosticador: una conclusión en prosa escrita sobre papeles que nadie confirmó, con la cuenta interna
 * delante («2 de 5 afirmaciones confirmadas»). Lo provisional alimentaba una decisión por otra puerta. Ahora es una
 * frase fija, en palabras de dueño y sin cifras internas, cierta en todo modo provisional (hay menos confirmadas que el
 * mínimo y al menos un papel sin confirmar). Lo que escribió el modelo viaja aparte, en el resultado del trabajo
 * (jobs.resultado.lectura_provisional_del_modelo): lo lee la consultora y nadie más.
 */
export const RESUMEN_MODO_PROVISIONAL = "Todavía no hay una conclusión sobre esta área: hay poca información confirmada y parte de lo que vimos sale de documentos que falta confirmar.";

/**
 * Lo que se guarda en diagnoses.resumen cuando el pilar queda DESCONOCIDO sin diagnosticarse (ni con los papeles llega
 * al mínimo). Hasta el 13-10-2026 era «Solo 2 definiciones confirmadas sobre personas. No hay información suficiente
 * para diagnosticar: hay que levantar más»: la cuenta interna y palabras de la casa, puestas tal cual delante del
 * empresario. Es una frase fija, de dueño, sin cifras; cuántas confirmadas hay viaja en el resultado del trabajo.
 * Las dos frases fijas empiezan igual a propósito: Mi empresa hoy solo deja pasar el resumen de un pilar sin conclusión
 * si empieza así (hoy.ts), para que un texto viejo guardado en la base no llegue al dueño.
 */
export const RESUMEN_SIN_INFORMACION = "Todavía no hay una conclusión sobre esta área: nos falta información para darla.";

/** Lo que un hallazgo dice de su propia certeza: tres columnas de findings que siempre viajan juntas. */
export type LecturaDeEvidencia = { provisional: boolean; confianza: number; confianza_motivo: string };

/**
 * El modo provisional del pilar aplicado a UN hallazgo: provisional = true, confianza bajo el tope y el porqué escrito.
 * Es una sola función para el nacimiento (handleDiagnosticar) y para la relectura (releerEvidencia): el rótulo y el
 * número no cambian según quién los calcule.
 */
export function conModoProvisional(l: LecturaDeEvidencia, confirmadasDelPilar: number, minimo = MIN_CONFIRMADAS_POR_PILAR): LecturaDeEvidencia {
  const n = confirmadasDelPilar;
  return {
    provisional: true,
    confianza: Math.min(l.confianza, TOPE_CONFIANZA_MODO_PROVISIONAL),
    confianza_motivo: `${l.confianza_motivo}; el pilar tiene ${n} afirmaci${n === 1 ? "ón" : "ones"} confirmada${n === 1 ? "" : "s"} de las ${minimo} que exige una conclusión: todo el diagnóstico es provisional`,
  };
}

/** Lo que el auditor dejó escrito en findings.auditoria, en lo que toca a la confianza. */
export type AuditoriaGuardada = { sustentado?: boolean; culpa_persona_sin_auditar?: boolean; benchmark_como_hecho?: boolean } | null;

/** Mismo techo que aplica calibrarImpacto cuando el auditor no sustenta: releer la evidencia no lo levanta. */
const TOPE_SIN_SUSTENTO_DEL_AUDITOR = 0.25;

/**
 * Provisional y confianza de un hallazgo QUE YA EXISTE, releídos con la evidencia que lo sustenta HOY (R10.4).
 * La usan la ruta de revisión (al aprobar o corregir) y el rediagnóstico (para lo ya revisado): las mismas reglas
 * de evidencia (confianzaDeHallazgo) que al nacer, para que el número no salte por quién lo calcula.
 *  - Sin evidencia enlazada no hay con qué releer: devuelve null y quien llama no toca nada (la falta de dato no es cero).
 *  - Si el auditor no lo sustentó, la confianza conserva su techo.
 *  - EL CANDADO DEL PILAR SIGUE VALIENDO: un hallazgo de la IA en un pilar con menos confirmadas que el mínimo sigue
 *    provisional aunque cite una afirmación confirmada. Aprobar no es confirmar: si bastara aprobar, la segunda puerta
 *    del candado sería un atajo para sacar conclusiones de un pilar que todavía no las sostiene. El rótulo se levanta
 *    cuando el pilar llega al mínimo. Los hallazgos escritos por el consultor no pasaron por el candado al nacer y aquí
 *    tampoco: responden solo por su propia evidencia. Si no se sabe cuántas confirmadas tiene el pilar, no se supone.
 */
export function releerEvidencia(evidencia: ClaimEvidencia[], o: { auditoria?: AuditoriaGuardada; origen?: string | null; confirmadasDelPilar?: number | null; hoy?: string | Date } = {}): LecturaDeEvidencia | null {
  if (evidencia.length === 0) return null;
  const conf = confianzaDeHallazgo(evidencia, o.hoy);
  const au = o.auditoria ?? null;
  const noSustenta = !!au && (au.sustentado === false || !!au.culpa_persona_sin_auditar || !!au.benchmark_como_hecho);
  const propia: LecturaDeEvidencia = {
    provisional: conf.provisional,
    confianza: noSustenta ? Math.min(conf.confianza, TOPE_SIN_SUSTENTO_DEL_AUDITOR) : conf.confianza,
    confianza_motivo: noSustenta ? `${conf.motivo}; el auditor no lo sustenta` : conf.motivo,
  };
  const pilarCorto = o.origen === "ia" && o.confirmadasDelPilar != null && o.confirmadasDelPilar < MIN_CONFIRMADAS_POR_PILAR;
  return pilarCorto ? conModoProvisional(propia, o.confirmadasDelPilar as number) : propia;
}

/** Lo mínimo de un hallazgo guardado para saber si un trabajo de diagnóstico lo relee. */
export type HallazgoGuardado = { origen: string | null; estado_revision: string | null; confianza: number | string | null };

/**
 * QUÉ HALLAZGOS RELEE UN TRABAJO DE DIAGNÓSTICO. Una sola regla, exportada, para el manejador (releerRevisados) y para
 * el disparo automático (jobs/auto.ts, que con ella decide si hay un rótulo desfasado que amerite un trabajo): si cada
 * uno eligiera por su cuenta, el disparo encolaría sin fin relecturas que el manejador no hace.
 *  - Lo aprobado o corregido, lo haya escrito la IA o la consultora, si ya tiene una lectura (confianza escrita). Uno
 *    aprobado antes de que existieran estas columnas no la tiene, y una máquina no le cambia el rótulo a lo que una
 *    persona aprobó sin él: la recibe cuando alguien lo revise.
 *  - Lo pendiente de la IA, cuando nadie lo va a recrear en ese trabajo (`conPendientes`): en toda salida que no
 *    llama al modelo (pilar desconocido, contradicción abierta, solo releer), tenga o no el área su mínimo de
 *    confirmadas. A un pendiente no lo aprobó nadie: se relee tenga o no una lectura.
 */
export function seRelee(f: HallazgoGuardado, conPendientes: boolean): boolean {
  if (f.estado_revision === "pendiente") return conPendientes && f.origen === "ia";
  return (f.estado_revision === "aprobado" || f.estado_revision === "corregido") && f.confianza != null;
}

/** Qué pasó con el rótulo de los pendientes releídos: cuántos pasaron a provisional, cuántos dejaron de serlo y cuántos lo conservaron con otra confianza. */
type PendientesReleidos = { aProvisional: number; levantados: number; conOtraConfianza: number };

type HallazgoRevisado = HallazgoGuardado & { id: string; auditoria: AuditoriaGuardada; provisional: boolean | null; confianza_motivo: string | null; finding_evidence: { claim_id: string; relacion: string }[] | null };

/**
 * LO YA REVISADO TAMBIÉN SE RELEE. El rediagnóstico borra y recrea los hallazgos pendientes, pero los aprobados y
 * corregidos se quedaban con el rótulo del día en que se revisaron: el consultor aprobaba un hallazgo provisional, el
 * dueño confirmaba después sus afirmaciones, y en su portal seguía «por confirmar» para siempre. Cada trabajo de
 * diagnóstico del pilar relee lo ya revisado con las afirmaciones de ese momento (qué se relee: seRelee).
 *
 * TAMBIÉN LO QUE ESCRIBIÓ LA CONSULTORA. Desde que su hallazgo nace leyendo su evidencia (POST /api/findings), el que
 * escribe sobre papeles sin confirmar nace provisional y queda fuera del plan, los entregables y los indicadores. Hasta
 * el 13-10-2026 aquí solo se releían los de la IA: el dueño confirmaba esos papeles y nada le levantaba el rótulo; en
 * su portal leía «falta volver a revisarlo» sin fin. Se relee igual que al nacer: responde por su propia evidencia y el
 * candado del área no lo alcanza (releerEvidencia).
 * Si la lectura falla no se adivina ni se tumba el diagnóstico: se devuelve el motivo y viaja en el resultado del trabajo.
 *
 * `conPendientes`: LOS PENDIENTES QUE NADIE VA A RECREAR TAMBIÉN SE RELEEN. Cuando el pilar se diagnostica, los
 * pendientes se borran y se recrean con su rótulo del día. Cuando el trabajo no llama al modelo no se recrea nada, y
 * el pendiente se quedaba con el rótulo del día en que nació. Dos casos reales:
 *  - Área con menos confirmadas que el mínimo: un pendiente de la IA nacido cuando el pilar tenía sus confirmadas (o
 *    antes de que existiera el candado) se quedaba con provisional = false, y el plan estratégico y los indicadores lo
 *    leían como conclusión de un área de la que ya no se puede concluir. Pasa a provisional con el porqué del candado.
 *  - Área con su mínimo: un pendiente nacido provisional sobre papeles que el dueño confirmó después. Hasta el
 *    13-10-2026 no lo releía nadie: seguía provisional, fuera del plan estratégico y de los indicadores, hasta que el
 *    área sumara confirmadas para otro diagnóstico, y el dueño leía «falta volver a revisarlo» sin plazo. Ahora se
 *    relee por su propia evidencia, en los dos sentidos: confirmado lo que lo sostiene deja de ser provisional, y si
 *    lo que lo sostenía dejó de estar confirmado, vuelve a serlo.
 * De los pendientes se cuenta qué pasó con su rótulo (PendientesReleidos), no un «cambiados» a secas.
 */
async function releerRevisados(sb: ReturnType<typeof supabaseAdmin>, companyId: string, pilar: string, todas: ClaimDiag[], confirmadasDelPilar: number, conPendientes = false): Promise<{ releidos: number; cambiados: number; pendientes: PendientesReleidos; error: string | null }> {
  const { data, error } = await sb
    .from("findings")
    .select("id,origen,estado_revision,auditoria,provisional,confianza,confianza_motivo, finding_evidence(claim_id,relacion)")
    .eq("company_id", companyId)
    .eq("pilar", pilar)
    .in("estado_revision", conPendientes ? ["pendiente", "aprobado", "corregido"] : ["aprobado", "corregido"]);
  const pendientes: PendientesReleidos = { aProvisional: 0, levantados: 0, conOtraConfianza: 0 };
  if (error) return { releidos: 0, cambiados: 0, pendientes, error: error.message };
  const porId = new Map(todas.map((c) => [c.id, c]));
  let releidos = 0, cambiados = 0;
  let fallo: string | null = null;
  for (const f of (data ?? []) as unknown as HallazgoRevisado[]) {
    if (!seRelee(f, conPendientes)) continue;
    const esPendiente = f.estado_revision === "pendiente";
    const evidencia = (f.finding_evidence ?? []).filter((e) => e.relacion === "sustenta").map((e) => porId.get(e.claim_id)).filter((c): c is ClaimDiag => !!c).map(claimComoEvidencia);
    const lectura = releerEvidencia(evidencia, { auditoria: f.auditoria ?? null, origen: f.origen, confirmadasDelPilar });
    if (!lectura) continue;
    if (!esPendiente) releidos++;
    const igual = !!f.provisional === lectura.provisional && f.confianza != null && Number(f.confianza) === lectura.confianza && f.confianza_motivo === lectura.confianza_motivo;
    if (igual) continue;
    // El rótulo de antes se anota antes de escribir: lo que se cuenta es qué le pasó, no cómo quedó.
    const eraProvisional = !!f.provisional;
    const { error: errUpd } = await sb.from("findings").update(lectura).eq("id", f.id);
    if (errUpd) fallo = errUpd.message;
    else if (!esPendiente) cambiados++;
    else if (lectura.provisional === eraProvisional) pendientes.conOtraConfianza++;
    else if (lectura.provisional) pendientes.aProvisional++;
    else pendientes.levantados++;
  }
  return { releidos, cambiados, pendientes, error: fallo };
}

/**
 * payload: { pilar, forzar?, solo_releer? } → DIAGNOSTICADOR + AUDITOR para un pilar. Con contradicciones abiertas espera.
 *
 * Hay tres salidas que NO llaman al modelo: el pilar desconocido (ni con los papeles llega al mínimo), la contradicción
 * abierta (espera a la persona) y `solo_releer` (el disparo automático lo pide cuando un rótulo guardado ya no es el
 * que da la evidencia de hoy). Las tres pasan antes por la relectura de lo ya revisado y de los pendientes de la IA
 * (que en ellas nadie recrea), y si el pilar tiene menos
 * confirmadas que el mínimo dejan escrito que no hay conclusión. Hasta el 13-10-2026 la contradicción abierta salía
 * antes de releer: un área que bajaba del mínimo con un punto por aclarar seguía como conclusión en el plan y en «Lo
 * que encontramos», y como «todavía no es conclusión» en Mi empresa hoy, que lee el candado en vivo.
 */
export async function handleDiagnosticar(job: Job) {
  const sb = supabaseAdmin();
  const pilar = String(job.payload.pilar);
  if (!(PILARES as readonly string[]).includes(pilar)) throw new Error("Pilar inválido");

  const todas = await claimsDeEmpresa(job.company_id);
  const delPilar = todas.filter((c) => c.pilar === pilar || c.pilar === "transversal");
  const abiertas = delPilar.filter((c) => c.estado === "contradicho");
  // Espera limpia, no fallo: el diagnóstico se re-dispara solo cuando el dueño valida (dispararDiagnosticoSiListo
  // corre en la ruta de validación). Un job "fallido" aquí sería ruido: el sistema está esperando a la persona.
  const esperaValidacion = abiertas.length > 0 && !job.payload.forzar;
  const soloReleer = !!job.payload.solo_releer;
  const confirmadas = delPilar.filter((c) => c.estado === "confirmado");
  const utiles = delPilar.filter(entraAlDiagnostico);
  const provisionalesEnContexto = utiles.filter(esProvisionalDeDocumento).length;

  // DESCONOCIDO es un resultado válido y honesto. Antes el candado corría ANTES de mirar los provisionales, así que
  // un pilar con 2 confirmadas y 40 afirmaciones de documentos no se diagnosticaba nunca. Ahora los papeles abren
  // la segunda puerta: se diagnostica en modo provisional, con todo rotulado como tal.
  const puerta = puertaDelCandado(confirmadas.length, provisionalesEnContexto);
  // ¿Este trabajo llama al modelo y recrea los pendientes? Solo si la puerta abre, nadie espera y no es una relectura.
  const seDiagnostica = puerta !== "desconocido" && !esperaValidacion && !soloReleer;
  // Menos confirmadas que el mínimo: del pilar no hay conclusión, abra o no la segunda puerta.
  const pilarCorto = puerta !== "normal";

  // Lo ya revisado relee su evidencia con las afirmaciones de hoy (ver releerRevisados) ANTES de cualquier salida:
  // la del pilar desconocido, la de la contradicción abierta y la de solo releer. Si se releyera solo al diagnosticar,
  // un pilar con 4 confirmadas y un papel bajaría lo aprobado a provisional, y otro con 4 y ningún papel lo dejaría
  // como conclusión: la misma falta de información con dos rótulos. No cuesta ninguna llamada al modelo.
  // Si este trabajo no diagnostica, también los pendientes de la IA: nadie los va a recrear, tenga o no el área su
  // mínimo. En un área corta pasan a provisional; en una con su mínimo responden por su propia evidencia de hoy.
  const revisados = await releerRevisados(sb, job.company_id, pilar, todas, confirmadas.length, !seDiagnostica);
  // Cuántos hallazgos ya revisados se releyeron y cuántos cambiaron de rótulo o de confianza, y qué pasó con el rótulo
  // de los pendientes. Si no se pudo, se dice.
  const relectura: Record<string, unknown> = {
    revisados_releidos: revisados.releidos, revisados_cambiados: revisados.cambiados,
    ...(revisados.pendientes.aProvisional ? { pendientes_pasados_a_provisional: revisados.pendientes.aProvisional } : {}),
    ...(revisados.pendientes.levantados ? { pendientes_que_dejan_de_ser_provisionales: revisados.pendientes.levantados } : {}),
    ...(revisados.pendientes.conOtraConfianza ? { pendientes_con_otra_confianza: revisados.pendientes.conOtraConfianza } : {}),
    ...(revisados.error ? { revisados_error: revisados.error } : {}),
  };

  if (pilarCorto && !seDiagnostica) {
    // EL ÁREA DEJA ESCRITO QUE NO TIENE CONCLUSIÓN, también cuando espera a que se aclare una contradicción: si la
    // tarjeta conservara el estado y el resumen del día en que tenía sus confirmadas, diría una conclusión que ya nadie
    // sostiene. La frase que lee el empresario es fija y de dueño; la cuenta interna viaja en el resultado del trabajo.
    const { error: errDiagnostico } = await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado: "desconocido", resumen: puerta === "provisional" ? RESUMEN_MODO_PROVISIONAL : RESUMEN_SIN_INFORMACION }, { onConflict: "company_id,pilar" });
    if (errDiagnostico) relectura.diagnostico_error = errDiagnostico.message;
  }
  if (puerta === "desconocido") return { estado: "desconocido", confirmadas: confirmadas.length, afirmaciones_provisionales: provisionalesEnContexto, ...(abiertas.length ? { contradicciones_abiertas: abiertas.length } : {}), ...relectura };
  if (esperaValidacion) return { estado: "esperando_validacion", contradicciones_abiertas: abiertas.length, pilar, ...relectura };
  // Solo releer: lo pidió el disparo automático porque un rótulo guardado ya no era el de hoy. Sin modelo y sin
  // recrear nada: los pendientes siguen siendo los mismos hallazgos pendientes, con el rótulo de su evidencia de hoy.
  if (soloReleer) return { estado: "releido", pilar, confirmadas: confirmadas.length, ...relectura };
  const modoProvisional = puerta === "provisional";

  await progreso(job.id, `Diagnosticando ${pilar}: ${utiles.length} definiciones${provisionalesEnContexto ? ` (${provisionalesEnContexto} sin confirmar, entran como provisionales)` : ""}${modoProvisional ? ` · MODO PROVISIONAL: solo ${confirmadas.length} confirmadas de las ${MIN_CONFIRMADAS_POR_PILAR} que exige una conclusión` : ""}`);

  // Las dimensiones de cada fuente (autor, período, fidelidad) ya vienen con cada afirmación (claimsDeEmpresa);
  // claimComoEvidencia las traduce a la forma que leen las reglas de evidencia.

  // Procesos (solo para 'procesos'), know-how y sueño del dueño (para personas y transversal)
  let procesosTxt = "(sin procesos dibujados)";
  if (pilar === "procesos") {
    const { data: procs } = await sb.from("processes").select("id,nombre,area").eq("company_id", job.company_id).eq("version", "as_is");
    const partes: string[] = [];
    for (const p of procs ?? []) {
      const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
      partes.push(`PROCESO "${p.nombre}" (${p.area ?? "—"}):\n${procesoComoJSON(n ?? [], e ?? [])}`);
    }
    if (partes.length) procesosTxt = partes.join("\n\n");
  }
  // Know-how con la persona y sus afirmaciones: sin ids citables el modelo no puede sustentar (ni preservar) ese know-how.
  const { data: kh } = await sb.from("know_how").select("participant_id,puesto,situacion,senal,decision,regla_practica,criticidad,documentado, participants(nombre)").eq("company_id", job.company_id);
  const idsDe = (pid: string | null) => (pid ? todas.filter((c) => c.participant_id === pid).map((c) => c.id) : []);
  // Las afirmaciones de quien tiene el know-how entran al contexto del pilar (con su texto): sin ellas el modelo no puede conectar el síntoma con su causa.
  const idsKnowHow = new Set((kh ?? []).flatMap((k) => idsDe(k.participant_id)));
  // Procedencia: el diagnostico no lee documentos, lee afirmaciones. Sus fuentes son las de esas
  // afirmaciones, y ese es el rastro que permite volver del hallazgo al papel que lo sostiene.
  const conKnowHow = [...utiles, ...todas.filter((c) => idsKnowHow.has(c.id) && !utiles.some((u) => u.id === c.id) && entraAlDiagnostico(c))];
  const { data: sueno } = await sb.from("interview_responses").select("bloque,pregunta,respuesta, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", job.company_id).eq("interview_sessions.tipo", "sueno_dueno").not("respuesta", "is", null);
  const { data: empresa } = await sb.from("companies").select("nombre,sector,modelo_operativo,etapa_negocio").eq("id", job.company_id).single();
  const { data: metricasRaw } = await sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", job.company_id).limit(80);
  // RAG de la Base Maestra: el motor del pilar (preguntas diagnósticas, evidencias mínimas y KPI del método)
  // se recupera de conocimiento_base y entra al contexto — el conocimiento vive en la base, no clavado al código.
  const { data: conocimiento } = await sb.from("conocimiento_base").select("seccion,contenido").eq("fuente", "base-maestra-renaser").contains("ejes", [pilar]).order("orden");
  const trozosBase = (conocimiento ?? [])
    .sort((a, b) => Number(b.seccion.startsWith("Motor")) - Number(a.seccion.startsWith("Motor")))
    .slice(0, 3)
    .map((k) => `## ${k.seccion}\n${String(k.contenido).slice(0, 3500)}`);
  const metricas = (metricasRaw ?? []) as Metrica[];
  const senales = detectarAnomalias(metricas);
  const contexto = [
    `EMPRESA: ${empresa?.nombre} · sector: ${empresa?.sector ?? "desconocido"}${empresa?.modelo_operativo?.length ? ` · modelo operativo: ${(empresa.modelo_operativo as string[]).join(", ")}` : ""}${empresa?.etapa_negocio ? ` · etapa del negocio: ${empresa.etapa_negocio}` : ""}`,
    `PILAR: ${pilar}`,
    trozosBase.length ? `BASE DE CONOCIMIENTO RENASER — el motor de este pilar (criterios, evidencias mínimas y KPI del método; guía tu análisis, pero solo AFIRMAS con la evidencia de ESTA empresa):\n${trozosBase.join("\n\n")}` : null,
    // TODO LO QUE VIENE DE LA EMPRESA VA ACOTADO. Antes entraba crudo en el mismo plano que estas
    // etiquetas, así que un documento con órdenes incrustadas le hablaba al diagnosticador igual que
    // nosotros. La única parte que NO se acota es la base de conocimiento RENASER, porque es nuestra.
    metricas.length ? comoDato("TABLA DE RESULTADOS (contado por la empresa o verificado en sus registros)", tablaResultadosComoTexto(metricas)) : null,
    senales.length ? comoDato("SEÑALES DETECTADAS POR EL MOTOR DE ANOMALÍAS", senales.map((s) => `- [${s.regla}] ${s.titulo}: ${s.detalle}`).join("\n")) : null,
    comoDato(`AFIRMACIONES (${conKnowHow.length})`, claimsComoTexto(conKnowHow)),
    comoDato("PROCESOS", procesosTxt),
    comoDato(
      `KNOW-HOW MINADO (${kh?.length ?? 0})`,
      (kh ?? []).map((k) => { const nombre = (k.participants as unknown as { nombre: string } | null)?.nombre; const ids = idsDe(k.participant_id); return `- ${nombre ? `${nombre} (${k.puesto})` : k.puesto} [${k.criticidad}${k.documentado ? "" : ", no documentado"}]: ${k.situacion ?? ""} · señal: ${k.senal ?? ""} · regla: ${k.regla_practica ?? ""}${ids.length ? ` · afirmaciones de esta persona: ${ids.join(", ")}` : ""}`; }).join("\n") || "(ninguno)"
    ),
    comoDato(
      `SUEÑO DEL DUEÑO (${sueno?.length ?? 0} respuestas)`,
      (sueno ?? []).map((s) => `- [${s.bloque}] ${s.pregunta} → ${String(s.respuesta).slice(0, 300)}`).join("\n") || "(sin sesión de sueño completada)"
    ),
  ].filter(Boolean).join("\n\n");

  void anotarFuentesDeClaims(conKnowHow.map((c) => c.id));
  const d = await correrDiagnosticador(contexto);
  await registrarLlamada(job.company_id, job.id, "diagnosticador", d);

  const validIds = new Set(todas.map((c) => c.id));
  const hallazgos = d.data.hallazgos
    .map((h) => ({ ...h, claim_ids: h.claim_ids.filter((id) => validIds.has(id)), claims_contrarios: (h.claims_contrarios ?? []).filter((id) => validIds.has(id)) }))
    .filter((h) => h.claim_ids.length > 0); // sin evidencia no entra

  await progreso(job.id, `${hallazgos.length} hallazgos. Auditando`);

  const conIdx = hallazgos.map((h, i) => ({ id: `h${i + 1}`, ...h }));
  let auditorias: Record<string, { sustentado: boolean; evidencia_contraria: string[]; es_sintoma: boolean; culpa_persona_sin_auditar?: boolean; benchmark_como_hecho?: boolean; duplicado_de?: string | null; causa_corregida?: string | null; observacion: string }> = {};
  if (conIdx.length) {
    const ctxA = [`HALLAZGOS:`, JSON.stringify(conIdx.map((h) => ({ id: h.id, titulo: h.titulo, causa_raiz: h.causa_raiz, impacto: h.impacto, preserva: !!h.preserva, veredicto: h.veredicto ?? null, claim_ids: h.claim_ids })), null, 1), comoDato("TODAS LAS AFIRMACIONES", claimsComoTexto(todas))].join("\n\n");
    const a = await correrAuditor(ctxA);
    await registrarLlamada(job.company_id, job.id, "auditor", a);
    auditorias = Object.fromEntries(a.data.auditorias.map((x) => [x.id, x]));
  }

  await sb.from("findings").delete().eq("company_id", job.company_id).eq("pilar", pilar).eq("origen", "ia").eq("estado_revision", "pendiente");

  let altos = 0, medios = 0, provisionales = 0;
  for (const h of conIdx) {
    const au = auditorias[h.id];
    if (au?.duplicado_de) continue;
    // Bucle de reparacion: el auditor corrigio la causa; el hallazgo sigue vivo con la causa correcta.
    if (au?.causa_corregida?.trim()) h.causa_raiz = au.causa_corregida.trim();
    const evidencia = h.claim_ids.map((id) => todas.find((c) => c.id === id)).filter((c): c is ClaimDiag => !!c).map(claimComoEvidencia);
    const sustentado = au ? au.sustentado && !au.culpa_persona_sin_auditar && !au.benchmark_como_hecho : null;
    // Sobre qué concluye el hallazgo decide qué vale cada fuente: una visita del consultor prueba lo operativo, no el margen.
    const cal = calibrarImpacto(h.impacto, evidencia, sustentado, { naturaleza: naturalezaDeHallazgo({ pilar, patron: h.patron, dimension: h.dimension ?? null }) });
    // En modo provisional NINGÚN hallazgo del pilar es conclusión, ni el que cite una de las pocas confirmadas:
    // el pilar entero se sostiene en papeles sin confirmar. Provisional = true y confianza baja, con el porqué escrito.
    const propia: LecturaDeEvidencia = { provisional: cal.provisional, confianza: cal.confianza, confianza_motivo: cal.confianza_motivo };
    const { provisional, confianza, confianza_motivo } = modoProvisional ? conModoProvisional(propia, confirmadas.length) : propia;
    const filtros = aplicarFiltros(h.filtros, h.recomendacion);
    const { data: f } = await sb
      .from("findings")
      .insert({
        company_id: job.company_id,
        pilar,
        patron: h.patron,
        titulo: h.informacion_insuficiente ? `Información insuficiente: ${h.titulo}` : h.preserva ? `Fortaleza: ${h.titulo}` : h.titulo,
        causa_raiz: h.causa_raiz,
        impacto: cal.impacto,
        veredicto: h.preserva ? "keep" : h.veredicto,
        recomendacion: filtros.recomendacion,
        filtros: { ...h.filtros, bloqueada: filtros.bloqueada, tension: filtros.tension, dimension: h.dimension ?? null, preserva: !!h.preserva, fuerza_maxima: cal.fuerza_maxima, fuentes_independientes: cal.fuentes, costo_posible: h.costo_posible ?? null },
        auditoria: au ?? null,
        origen: "ia",
        estado_revision: "pendiente",
        requiere_validacion: cal.requiere_validacion || !!h.informacion_insuficiente,
        motivo_validacion: cal.motivo ?? (h.informacion_insuficiente ? "Información insuficiente" : null),
        // Impacto potencial ≠ confianza, guardados siempre y por separado. Provisional = ninguna afirmación confirmada
        // (o pilar en modo provisional): se muestra con su incertidumbre, no se esconde. Al rediagnosticar (el delete
        // de arriba) se recalcula; al aprobar o corregir, la ruta de revisión lo relee con la evidencia de ese momento;
        // y lo ya revisado se relee en cada rediagnóstico (releerRevisados).
        impacto_potencial: cal.impacto_potencial,
        confianza,
        confianza_motivo,
        provisional,
      })
      .select("id")
      .single();
    if (!f) continue;
    if (provisional && !h.preserva) provisionales++;
    const evid = [
      ...h.claim_ids.map((id) => ({ finding_id: f.id, claim_id: id, relacion: "sustenta" })),
      ...[...new Set([...h.claims_contrarios, ...(au?.evidencia_contraria ?? []).filter((id) => validIds.has(id))])].filter((id) => !h.claim_ids.includes(id)).map((id) => ({ finding_id: f.id, claim_id: id, relacion: "contradice" })),
    ];
    await sb.from("finding_evidence").upsert(evid, { onConflict: "finding_id,claim_id" });
    // Un hallazgo provisional no decide el estado del pilar: es una señal por corroborar, no una conclusión.
    if (!cal.requiere_validacion && !provisional && !h.preserva) {
      if (cal.impacto === "alto") altos++;
      if (cal.impacto === "medio") medios++;
    }
  }

  // Preguntas pendientes (lentes sin evidencia) → vuelven al levantamiento como preguntas para el dueño/líder.
  // El bloque corto de validación SIEMPRE llega: si no hay sesión abierta del tipo pedido, se abre (o reutiliza)
  // una sesión de validación con el dueño. Así el sistema diagnostica con lo que hay y pide lo que falta,
  // en vez de quedarse esperando entrevistas que quizá no existen (empresa de un solo dueño).
  let sesionValidacion: string | null = null;
  const abrirValidacion = async () => {
    if (sesionValidacion) return sesionValidacion;
    const { data: existente } = await sb.from("interview_sessions").select("id").eq("company_id", job.company_id).eq("tipo", "validacion").neq("estado", "completa").limit(1).maybeSingle();
    if (existente) return (sesionValidacion = existente.id);
    const { data: dueno } = await sb.from("participants").select("id").eq("company_id", job.company_id).in("rol", ["dueno", "socio"]).order("created_at").limit(1).maybeSingle();
    if (!dueno) return null;
    const { data: nueva } = await sb.from("interview_sessions").insert({ company_id: job.company_id, participant_id: dueno.id, tipo: "validacion" }).select("id").single();
    return (sesionValidacion = nueva?.id ?? null);
  };
  // CANDADO DE REDUNDANCIA también aquí: las preguntas pendientes del diagnóstico entraban a la
  // conversación SIN pasar por el filtro — al re-diagnosticar, la misma pregunta llegaba dos veces
  // (queja real: "me volvió a preguntar sobre TikTok y costos"). Nada se inserta si ya se preguntó.
  const { data: todasPreguntas } = await sb.from("interview_responses").select("pregunta, interview_sessions!inner(company_id)").eq("interview_sessions.company_id", job.company_id).limit(400);
  const yaPreguntadas = (todasPreguntas ?? []).map((x) => String(x.pregunta));
  // Máximo 3 por pilar, y nunca más de 6 abiertas en total: cuatro pilares no pueden bombardear
  // al dueño con veinte preguntas de golpe.
  const { count: abiertasTotal } = await sb.from("interview_responses").select("id, interview_sessions!inner(company_id)", { count: "exact", head: true }).eq("interview_sessions.company_id", job.company_id).is("respuesta", null);
  let cupo = Math.max(0, 6 - (abiertasTotal ?? 0));
  for (const q of d.data.preguntas_pendientes.slice(0, 3)) {
    if (cupo <= 0) break;
    if (preguntaRepetida(q.texto, yaPreguntadas)) continue;
    const tipoSesion = q.para === "lider" ? "lider" : q.para === "personal" ? "personal" : "empresa_dueno";
    const { data: ses } = await sb.from("interview_sessions").select("id").eq("company_id", job.company_id).eq("tipo", tipoSesion).neq("estado", "completa").limit(1).maybeSingle();
    const destino = ses?.id ?? (await abrirValidacion());
    if (destino) {
      const { data: ult } = await sb.from("interview_responses").select("orden").eq("session_id", destino).order("orden", { ascending: false }).limit(1);
      await sb.from("interview_responses").insert({ session_id: destino, bloque: ses ? pilar : "validacion", pilar, pregunta: q.texto, orden: (ult?.[0]?.orden ?? 0) + 1 });
      yaPreguntadas.push(q.texto); // tampoco dos parecidas dentro del mismo lote
      cupo--;
    }
  }

  // En modo provisional estadoPilar devuelve «desconocido» (confirmadas < mínimo): el pilar tiene hallazgos, todos por
  // corroborar, pero ninguna conclusión. El resumen que se guarda es la frase fija (RESUMEN_MODO_PROVISIONAL), no la
  // lectura del modelo: esa columna la lee el empresario y entra al modelo de alto rendimiento.
  let estado = estadoPilar([...Array(altos).fill("alto"), ...Array(medios).fill("medio")], confirmadas.length, MIN_CONFIRMADAS_POR_PILAR);
  // Un pilar con hallazgos esperando validacion o provisionales no puede leerse "solido": hay algo en revision.
  const { count: enRevision } = await sb.from("findings").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("pilar", pilar).eq("requiere_validacion", true).neq("estado_revision", "rechazado");
  if (estado === "solido" && ((enRevision ?? 0) > 0 || provisionales > 0)) estado = "mejorable";
  const resumen = modoProvisional ? RESUMEN_MODO_PROVISIONAL : d.data.resumen_pilar ?? null;
  await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado, resumen }, { onConflict: "company_id,pilar" });

  // ¿Terminaron los 4 pilares? → consolidación cross-pilar (P1-19). Una relectura en cola (solo_releer) no es un
  // diagnóstico pendiente: sale sin consolidar, y si se la esperase la consolidación de esta ronda no llegaría nunca.
  const { data: otros } = await sb.from("jobs").select("id,payload").eq("company_id", job.company_id).eq("tipo", "diagnosticar").in("estado", ["pendiente", "corriendo"]).neq("id", job.id);
  const diagnosticosEnCurso = (otros ?? []).filter((j) => !(j.payload as { solo_releer?: boolean } | null)?.solo_releer).length;
  if (!diagnosticosEnCurso) await encolar({ company_id: job.company_id, tipo: "consolidar", payload: {}, prioridad: PRIORIDAD.diagnosticar, idempotency_key: claveIdempotente(["consolidar", job.company_id, job.id]) });

  return {
    estado, modo_provisional: modoProvisional, confirmadas: confirmadas.length, hallazgos: conIdx.length, provisionales, afirmaciones_provisionales: provisionalesEnContexto,
    preguntas_pendientes: d.data.preguntas_pendientes.length, dimensiones_sin_evidencia: d.data.dimensiones_sin_evidencia,
    ...relectura,
    // La lectura del modelo en modo provisional no se guarda en diagnoses.resumen: queda aquí, para la consultora.
    ...(modoProvisional ? { lectura_provisional_del_modelo: d.data.resumen_pilar ?? null } : {}),
  };
}

/** Consolidación (pasadas B y F): dedupe de hallazgos que comparten la misma evidencia entre pilares; orden por multiplicación. Sin IA. */
export async function handleConsolidar(job: Job) {
  const sb = supabaseAdmin();
  const { data: fs } = await sb.from("findings").select("id,pilar,titulo,impacto,veredicto,patron,created_at, finding_evidence(claim_id,relacion)").eq("company_id", job.company_id).eq("estado_revision", "pendiente").eq("origen", "ia");
  const filas = (fs ?? []).map((f) => ({
    id: f.id,
    fortaleza: f.veredicto === "keep",
    patron: (f.patron as string | null) ?? null,
    ids: new Set(((f.finding_evidence as { claim_id: string; relacion: string }[]) ?? []).filter((e) => e.relacion === "sustenta").map((e) => e.claim_id)),
  })).filter((f) => f.ids.size > 0);
  const duplicadoDe = (f: (typeof filas)[number]) =>
    filas.find((g) => g !== f && g.fortaleza === f.fortaleza && (
      // misma evidencia exacta (gana el de mayor evidencia; a igual evidencia, el otro si aún no fue eliminado)
      ([...f.ids].sort().join("|") === [...g.ids].sort().join("|") && filas.indexOf(g) < filas.indexOf(f)) ||
      // mismo patrón (o ambas fortalezas: el patrón es de problemas) con evidencia subconjunto estricto: mismo hallazgo con menos sustento
      (((f.patron !== null && f.patron === g.patron) || (f.fortaleza && g.fortaleza)) && f.ids.size < g.ids.size && [...f.ids].every((id) => g.ids.has(id)))
    ));
  let eliminados = 0;
  const borrar = filas.filter((f) => duplicadoDe(f));
  for (const f of borrar) {
    await sb.from("findings").delete().eq("id", f.id);
    eliminados++;
  }
  await sb.from("companies").update({ etapa: "diagnostico" }).eq("id", job.company_id).in("etapa", ["levantamiento", "contraste"]);
  return { duplicados_eliminados: eliminados, hallazgos: (fs?.length ?? 0) - eliminados };
}

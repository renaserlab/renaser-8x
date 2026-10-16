import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "./queue";
import { puertaDelCandado, esProvisionalDeDocumento, seRelee, releerEvidencia } from "./handlers/diagnostico";
import { registrarError } from "@/lib/errores";

/** Cada cuántas afirmaciones nuevas amerita el pilar una mirada fresca: confirmadas, y papeles sin confirmar. */
const PASO_CONFIRMADAS = 3;
const PASO_PAPELES = 10;

type Afirmacion = { pilar: string | null; estado: string; sources: { tipo: string | null } | null };
/** Un hallazgo guardado, con el estado de HOY de lo que lo sostiene: lo justo para saber si su rótulo sigue siendo cierto. */
export type HallazgoConSustento = {
  pilar?: string | null; origen: string | null; estado_revision: string | null; provisional: boolean | null; confianza: number | string | null;
  finding_evidence: { relacion: string; claims: { estado: string; vigente_hasta?: string | null } | null }[] | null;
};

/**
 * Cuántos hallazgos guardados de un pilar llevan un rótulo «provisional» que ya no es el que da su evidencia de hoy.
 * No decide con una regla propia: pregunta lo mismo que el manejador. Qué hallazgos se releen (seRelee) y qué rótulo
 * les toca (releerEvidencia, con el candado del área para los de la IA). De la lectura aquí solo se usa el rótulo: la
 * confianza necesita las dimensiones de cada fuente, y esas las lee el trabajo cuando corre.
 * Un hallazgo sin evidencia que lo sostenga no tiene con qué releerse y no cuenta: la falta de dato no es cero.
 *
 * LOS PENDIENTES DE LA IA CUENTAN SIEMPRE, tenga o no el área su mínimo de confirmadas. Lo que aquí se decide es si
 * hace falta un trabajo que SOLO RELEE, y ese trabajo no recrea ningún pendiente: el manejador los relee todos
 * (seRelee con `conPendientes`). Hasta el 13-10-2026 solo se contaban los de un área corta: un pendiente nacido
 * provisional en un área con sus cinco confirmadas, sobre papeles que el dueño confirmó después, no lo releía nadie
 * hasta que el área sumara confirmadas para otro diagnóstico.
 */
export function rotulosDesfasados(hallazgos: HallazgoConSustento[], confirmadasDelPilar: number): number {
  return hallazgos.filter((f) => {
    if (!seRelee(f, true)) return false;
    const sustento = (f.finding_evidence ?? []).filter((e) => e.relacion === "sustenta" && e.claims).map((e) => ({ id: "", source_id: "", participant_id: null, estado: e.claims!.estado, vigente_hasta: e.claims!.vigente_hasta ?? null }));
    const lectura = releerEvidencia(sustento, { origen: f.origen, confirmadasDelPilar });
    return !!lectura && lectura.provisional !== !!f.provisional;
  }).length;
}

/**
 * Autonomía del producto: si un pilar ya tiene con qué diagnosticarse y ninguna contradicción abierta, el
 * diagnóstico se dispara solo (idempotente por nivel de información: al crecer la evidencia se vuelve a
 * diagnosticar). Así el empresario recibe "Mi empresa hoy" sin que un consultor tenga que operar la herramienta.
 *
 * LAS DOS PUERTAS DEL CANDADO SE ABREN SOLAS (Dirección, R10.4). Hasta el 13-10-2026 aquí se exigían 5 confirmadas:
 * el manejador ya sabía diagnosticar en modo provisional (confirmadas + papeles sin confirmar ≥ 5), pero nadie lo
 * llamaba salvo que la consultora lo pidiera a mano, y un pilar con 2 confirmadas y 40 afirmaciones de documentos se
 * quedaba sin mirar. Quién decide es la misma regla que usa el manejador (puertaDelCandado, esProvisionalDeDocumento):
 * si cada uno contara a su manera, el disparo y el diagnóstico abrirían puertas distintas.
 *
 * Y LO QUE YA ESTÁ GUARDADO NO SE QUEDA CON EL RÓTULO DE AYER. El plan, los entregables, «Lo que encontramos» y los
 * indicadores leen la columna `provisional`; Mi empresa hoy lee el candado en vivo. Si la evidencia cambia y ningún
 * diagnóstico toca (el área bajó del mínimo, hay una contradicción abierta, o el nivel de información no cambió y la
 * cola ya tiene hecho ese diagnóstico), el mismo hallazgo decía una cosa en una pantalla y otra en la de al lado, y no
 * se curaba solo. Tres casos reales: el área que baja de 5 confirmadas después de diagnosticarse; el hallazgo que la
 * consultora escribe sobre papeles sin confirmar, que el dueño confirma después; y el pendiente de la IA de un área
 * con su mínimo, nacido provisional sobre papeles que el dueño confirma sin que el área cambie de nivel (nadie lo
 * recreaba: seguía fuera del plan estratégico y de los indicadores). Cuando un rótulo guardado ya no es
 * el de hoy (rotulosDesfasados), o la tarjeta de un área que no llega al mínimo sigue diciendo una conclusión, se
 * encola un trabajo que SOLO RELEE (payload.solo_releer): no llama al modelo. Sin clave propia: mientras esté vivo,
 * repetirlo es el mismo trabajo; terminado, la cola abre la ronda siguiente (queue.ts), así que vuelve a correr cada
 * vez que haga falta y nunca en bucle, porque lo que el trabajo deja escrito es justo lo que aquí se compara.
 *
 * Devuelve los pilares cuyo DIAGNÓSTICO se disparó; las relecturas no cuentan: no son un diagnóstico.
 *
 * Si las afirmaciones no se pueden leer no se concluye en silencio «no hay nada que diagnosticar»: queda escrito en el
 * registro de errores que ve la consultora. Lo mismo si no se puede leer lo guardado: no se sabe si algo quedó
 * desfasado, se dice, y los diagnósticos siguen su curso. No se lanza: quien llama (la validación del dueño, el
 * contraste) ya hizo su trabajo, y tumbarlo por esto lo repetiría entero.
 */
export async function dispararDiagnosticoSiListo(companyId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  const [{ data: claims, error }, { data: pendientes }, { data: guardados, error: errGuardados }, { data: tarjetas, error: errTarjetas }] = await Promise.all([
    // El tipo de la fuente viaja con cada afirmación: de él depende que una sin verificar cuente como papel.
    sb.from("claims").select("pilar,estado, sources(tipo)").eq("company_id", companyId),
    // COLAPSO DE DUPLICADOS: si un pilar ya tiene diagnóstico EN COLA, no se apila otro — el
    // pendiente leerá la evidencia más fresca cuando corra. (Caso real: una empresa respondiendo
    // cada minuto apilaba 3 diagnósticos del mismo pilar más rápido de lo que se procesaban.)
    sb.from("jobs").select("payload").eq("company_id", companyId).eq("tipo", "diagnosticar").eq("estado", "pendiente"),
    // Lo guardado, para saber si algo quedó desfasado: cada hallazgo vivo con el estado de hoy de lo que lo sostiene…
    sb.from("findings").select("pilar,origen,estado_revision,provisional,confianza, finding_evidence(relacion, claims(estado,vigente_hasta))").eq("company_id", companyId).in("estado_revision", ["pendiente", "aprobado", "corregido"]),
    // …y lo que dice la tarjeta de cada área.
    sb.from("diagnoses").select("pilar,estado").eq("company_id", companyId),
  ]);
  if (error) {
    await registrarError({ ruta: "jobs/auto", mensaje: "No se pudo leer las afirmaciones para decidir qué diagnosticar: ningún diagnóstico se disparó solo", detalle: error.message, companyId });
    return [];
  }
  const errGuardado = errGuardados ?? errTarjetas;
  if (errGuardado) await registrarError({ ruta: "jobs/auto", mensaje: "No se pudo leer los hallazgos guardados o el estado de las áreas para saber si algún rótulo quedó desfasado: ninguna relectura se disparó sola", detalle: errGuardado.message, companyId });
  const todas = (claims ?? []) as unknown as Afirmacion[];
  const hallazgos = (guardados ?? []) as unknown as HallazgoConSustento[];
  const enCola = (pendientes ?? []).map((j) => (j.payload ?? {}) as { pilar?: string; solo_releer?: boolean });
  // Cualquier trabajo del pilar en cola relee al correr; pero solo uno que diagnostica evita apilar otro diagnóstico.
  const diagnosticoEnCola = new Set(enCola.filter((p) => !p.solo_releer).map((p) => p.pilar).filter(Boolean));
  const relecturaEnCola = new Set(enCola.map((p) => p.pilar).filter(Boolean));
  const disparados: string[] = [];
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
    const del = todas.filter((c) => c.pilar === pilar || c.pilar === "transversal");
    const confirmadas = del.filter((c) => c.estado === "confirmado").length;
    const papeles = del.filter(esProvisionalDeDocumento).length;
    const abiertas = del.filter((c) => c.estado === "contradicho").length;
    const puerta = puertaDelCandado(confirmadas, papeles);
    let relecturaCubierta = relecturaEnCola.has(pilar);
    if (puerta !== "desconocido" && abiertas === 0 && !diagnosticoEnCola.has(pilar)) {
      // Idempotencia por "nivel" de evidencia: cada ~3 confirmadas nuevas amerita una mirada fresca. La clave de la
      // puerta normal es la de siempre. En modo provisional también cuentan los papeles, de diez en diez: un documento
      // trae sus afirmaciones de golpe, y volver a diagnosticar con cada una gastaría llamadas sin saber nada nuevo.
      const nivel = Math.floor(confirmadas / PASO_CONFIRMADAS);
      const clave = puerta === "normal" ? ["auto-diag", companyId, pilar, nivel] : ["auto-diag", companyId, pilar, "provisional", nivel, Math.floor(papeles / PASO_PAPELES)];
      const encolado = await encolar({ company_id: companyId, tipo: "diagnosticar", payload: { pilar }, prioridad: PRIORIDAD.diagnosticar, idempotency_key: claveIdempotente(clave) }).catch(() => null);
      disparados.push(pilar);
      // Un diagnóstico recién encolado relee al correr. Si la cola respondió «ese nivel ya se diagnosticó», no corre nada.
      if (encolado && !encolado.duplicado) relecturaCubierta = true;
    }
    if (relecturaCubierta || errGuardado) continue;
    // Menos confirmadas que el mínimo: del área no hay conclusión, abra o no la segunda puerta.
    const pilarCorto = puerta !== "normal";
    const desfasados = rotulosDesfasados(hallazgos.filter((f) => f.pilar === pilar), confirmadas);
    const tarjeta = (tarjetas ?? []).find((d) => d.pilar === pilar);
    const tarjetaVieja = pilarCorto && !!tarjeta && tarjeta.estado !== "desconocido";
    if (!desfasados && !tarjetaVieja) continue;
    try {
      await encolar({ company_id: companyId, tipo: "diagnosticar", payload: { pilar, solo_releer: true }, prioridad: PRIORIDAD.diagnosticar });
    } catch (e) {
      await registrarError({ ruta: "jobs/auto", mensaje: `No se pudo encolar la relectura de ${pilar}: sus hallazgos guardados siguen con un rótulo que ya no es el de hoy`, detalle: e instanceof Error ? e.message : String(e), companyId });
    }
  }
  return disparados;
}

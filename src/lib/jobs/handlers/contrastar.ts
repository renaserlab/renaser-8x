import { dispararDiagnosticoSiListo } from "../auto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrContrastador } from "@/lib/ai/agents/contrastador";
import { claimsDeEmpresa, etiquetaFuente, registrarLlamada, type ClaimRow } from "@/lib/db/queries";
import { candidatasAContradiccion, brechasEstrategicas, clavePar } from "@/lib/rules/contradiccion";
import { contrasteNumerico, TOPE_METRICAS, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";
import { progreso } from "../queue";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** Hubo pares y ninguno contradice: cuántos se compararon de verdad y cuántos no se pudieron comparar. */
function sinContradicciones(coincidencias: number, noComparables: number): string {
  const comparados = coincidencias
    ? `se ${coincidencias === 1 ? "comparó 1 par y cuadra" : `compararon ${coincidencias} pares y cuadran`} dentro de la tolerancia`
    : "no se comparó ningún par";
  const aparte = noComparables ? `; ${noComparables === 1 ? "1 no se pudo comparar" : `${noComparables} no se pudieron comparar`} por ser de periodos distintos` : "";
  return `${comparados}${aparte}. Comparar no verifica: las cifras siguen pendientes de conciliar.`;
}

/**
 * Remate 4: el contraste declarado/extraído sobre NÚMEROS es determinista y no pasa por el modelo
 * (rules/contradiccion-numerica.ts). Lo que el dueño declaró (company_metricas, estado contado) se pone
 * al lado de lo que un documento mostró (estado extraído) para la misma clave y el mismo periodo. Una
 * contradicción deja la pregunta sugerida y la prioridad en la afirmación de quien lo declaró, igual que
 * hace el modelo en P1-15: nunca su estado, nunca su texto. La escritura lleva su condición (la afirmación
 * sigue sin pregunta, o tiene la pregunta vieja de este mismo número), así que repetir el trabajo no vuelve
 * a marcar lo ya preguntado ni pisa una pregunta que llegó entretanto. Si no hay afirmación donde dejarla,
 * o la afirmación cambió mientras se comparaba, la pregunta queda escrita en el resultado del trabajo
 * (`sin_afirmacion`, `preguntas_no_dejadas` y `errores`), y la Matriz de Realidad la calcula igual a
 * partir de los números. Nada de lo que no se escribió se calla.
 *
 * Corre ANTES que el modelo: no necesita crédito ni proveedor, y un trabajo en pausa por crédito no
 * debe dejar sin hacer lo que no depende de él. Un error de lectura no tumba el resto del contraste:
 * se anota en el progreso y en el resultado.
 *
 * DE DÓNDE SALE EL PAR (cierre Z1, 13-10-2026): company_metricas guarda un número por (clave, periodo),
 * y los tres que guardan (`guardarMetricas`, api/portal/numeros y el espejo de indicadores) conservan en
 * `cifra_desplazada` la cifra del otro lado que reemplazan. Con eso el declarado y el extraído del mismo
 * periodo llegan aquí en una sola fila. En una base sin esa columna (migración sin aplicar) el par no
 * existe: los que guardan lo avisan en consola y este trabajo lo dice en su resultado.
 *
 * CERO PARES NO ES «TODO CUADRA»: si no hubo nada que poner al lado, el resultado trae `sin_pares` con el
 * porqué (falta la cifra declarada o la del documento) y el progreso lo dice. Si los hubo y ninguno
 * contradice, se dice cuántos se compararon y cuántos no se pudieron comparar.
 */
async function contrasteNumericoDeEmpresa(sb: ReturnType<typeof supabaseAdmin>, job: Job, claims: ClaimRow[]) {
  // `*` y no una lista: así la falta de una columna nueva (origen, cifra_desplazada) no impide leer lo que sí hay.
  const { data, error } = await sb.from("company_metricas").select("*").eq("company_id", job.company_id).order("updated_at", { ascending: false }).limit(TOPE_METRICAS);
  if (error) {
    await progreso(job.id, `Contraste de números no corrido: ${error.message}`);
    return { corrido: false as const, error: error.message };
  }
  const filas = (data ?? []) as MetricaGuardada[];
  const r = contrasteNumerico(filas, claims);
  // ¿Puede esta base tener a la vez la cifra declarada y la extraída del mismo periodo? Solo con la columna.
  const sinColumna = filas.length > 0 && !filas.some((f) => "cifra_desplazada" in f);
  const avisoColumna = sinColumna
    ? "La base todavía no guarda la cifra declarada y la del documento del mismo periodo a la vez (falta aplicar supabase/migracion-cifra-desplazada.sql): esos pares no se pueden comparar aquí."
    : null;
  const sinPares = r.sin_pares ? `${r.sin_pares} No se comparó nada: esto no significa que cuadren.` : null;
  if (sinPares) await progreso(job.id, `Contraste de números: ${sinPares}${avisoColumna ? ` ${avisoColumna}` : ""}`);
  else if (!r.contradicciones) await progreso(job.id, `Contraste de números: ${sinContradicciones(r.coincidencias, r.no_comparables)}`);
  let dejadas = 0;
  const errores: string[] = [];
  const noDejadas: { clave: string; periodo: string; pregunta: string }[] = [];
  for (const e of r.escrituras) {
    // Solo pregunta y prioridad, y solo si la afirmación sigue como estaba cuando se armó el plan: sin
    // pregunta (null), con la cadena vacía que a veces deja el modelo, o con la pregunta vieja de este número.
    const cambio = sb.from("claims").update({ pregunta_sugerida: e.pregunta_sugerida, prioridad_validacion: true }).eq("id", e.claim_id);
    const { data: tocadas, error: eUpd } = await (e.reemplaza === null ? cambio.is("pregunta_sugerida", null) : cambio.eq("pregunta_sugerida", e.reemplaza)).select("id");
    if (!eUpd && tocadas?.length) {
      dejadas++;
      continue;
    }
    // Lo que no se escribió no se calla: la pregunta queda en el resultado del trabajo, con su porqué.
    noDejadas.push({ clave: e.clave, periodo: e.periodo, pregunta: e.pregunta_sugerida });
    errores.push(`${e.clave}/${e.periodo}: ${eUpd ? eUpd.message : "la afirmación cambió mientras se comparaba; la pregunta no se dejó en ella"}`);
  }
  return {
    corrido: true as const,
    contradicciones: r.contradicciones,
    coincidencias: r.coincidencias,
    no_comparables: r.no_comparables,
    // Cuántos números había de cada lado, hubiera par o no; y, si no hubo ninguno, por qué.
    lados: r.lados,
    ...(sinPares ? { sin_pares: sinPares } : {}),
    ...(avisoColumna ? { aviso_columna: avisoColumna } : {}),
    preguntas_dejadas: dejadas,
    ya_preguntadas: r.ya_preguntadas,
    con_otra_pregunta: r.con_otra_pregunta,
    // La pregunta que no encontró afirmación del dueño no se pierde: queda aquí, con su número.
    sin_afirmacion: r.sin_afirmacion.slice(0, 20),
    ...(noDejadas.length ? { preguntas_no_dejadas: noDejadas.slice(0, 20) } : {}),
    pares: r.pares.slice(0, 50).map((p) => ({ clave: p.clave, periodo: p.periodo, periodo_extraido: p.periodo_extraido, tipo: p.veredicto.tipo, declarado: p.veredicto.declarado.valor, extraido: p.veredicto.extraido.valor })),
    ...(filas.length >= TOPE_METRICAS ? { aviso: `Se leyeron los ${TOPE_METRICAS} números más recientes de la empresa; puede haber más sin comparar.` } : {}),
    ...(errores.length ? { errores } : {}),
  };
}

/** Reglas mecánicas → pares candidatos → juicio del modelo (ante la duda, false) → relaciones (1.12). Capítulo 8. */
export async function handleContrastar(job: Job) {
  const sb = supabaseAdmin();
  const claims = await claimsDeEmpresa(job.company_id);
  const porId = new Map(claims.map((c) => [c.id, c]));

  // Pares ya juzgados: tabla claim_relations + jobs previos (compatibilidad)
  const juzgadas = new Set<string>();
  const { data: rels } = await sb.from("claim_relations").select("claim_id,related_id").eq("company_id", job.company_id);
  for (const r of rels ?? []) juzgadas.add(clavePar(r.claim_id, r.related_id));
  const { data: previos } = await sb.from("jobs").select("resultado").eq("company_id", job.company_id).eq("tipo", "contrastar").eq("estado", "hecho");
  for (const p of previos ?? []) for (const k of ((p.resultado as { pares?: string[] })?.pares ?? [])) juzgadas.add(k);

  // Regla mecánica 8.1: aspiracional sin ninguna actual del mismo tipo → brecha estratégica → validación prioritaria.
  const brechas = brechasEstrategicas(claims).filter((c) => c.estado === "sin_verificar");
  if (brechas.length) await sb.from("claims").update({ prioridad_validacion: true }).in("id", brechas.map((c) => c.id));

  // La regla determinista sobre números (declarado frente a extraído) va primero: no depende del modelo.
  const numerico = await contrasteNumericoDeEmpresa(sb, job, claims);
  if (numerico.corrido && numerico.contradicciones) await progreso(job.id, `${numerico.contradicciones} número(s) declarado(s) no cuadra(n) con lo extraído de documentos.`);

  const pares = candidatasAContradiccion(claims, juzgadas);
  await progreso(job.id, `Comparando ${pares.length} pares de definiciones`);

  const paresJuzgados: string[] = [];
  let contradicciones = 0, relaciones = 0;
  const tope = 4;
  for (let i = 0; i < pares.length; i += tope) {
    const lote = pares.slice(i, i + tope);
    await Promise.all(
      lote.map(async ({ a, b }) => {
        const ca = porId.get(a.id) as ClaimRow, cb = porId.get(b.id) as ClaimRow;
        const r = await correrContrastador(
          { id: ca.id, texto: ca.texto, fuente: etiquetaFuente(ca), fecha: ca.fecha_afirmacion, temporalidad: ca.temporalidad },
          { id: cb.id, texto: cb.texto, fuente: etiquetaFuente(cb), fecha: cb.fecha_afirmacion, temporalidad: cb.temporalidad }
        );
        await registrarLlamada(job.company_id, job.id, "contrastador", r);
        paresJuzgados.push(clavePar(a.id, b.id));
        const tipo = r.data.se_contradicen ? "contradicts" : r.data.relacion === "ninguna" ? null : r.data.relacion;
        if (tipo) {
          relaciones++;
          await sb.from("claim_relations").upsert({ company_id: job.company_id, claim_id: ca.id, related_id: cb.id, tipo, explicacion: r.data.explicacion, origen: "ia" }, { onConflict: "claim_id,related_id,tipo" });
        } else {
          // se registra que el par fue juzgado sin relación, para no volver a pagar la llamada
          await sb.from("claim_relations").upsert({ company_id: job.company_id, claim_id: ca.id, related_id: cb.id, tipo: "supports", explicacion: `sin relación: ${r.data.explicacion}`, origen: "regla" }, { onConflict: "claim_id,related_id,tipo" }).then(() => {});
        }
        if (r.data.se_contradicen) {
          contradicciones++;
          const vigente = r.data.cual_parece_vigente;
          const marcar = vigente === ca.id ? [cb] : vigente === cb.id ? [ca] : [ca, cb];
          for (const c of marcar) {
            // P1-15: lo que una persona validó (dueño, consultor o quien lo dijo) no se pisa: se pregunta.
            if (c.estado === "confirmado" && (c.participant_id || c.validado_por)) {
              await sb.from("claims").update({ pregunta_sugerida: r.data.pregunta_sugerida, prioridad_validacion: true }).eq("id", c.id);
              continue;
            }
            await sb.from("claims").update({ estado: "contradicho", contradice_a: c.id === ca.id ? cb.id : ca.id, explicacion_contradiccion: r.data.explicacion, pregunta_sugerida: r.data.pregunta_sugerida, prioridad_validacion: true }).eq("id", c.id);
          }
          if (marcar.length === 1) {
            const otra = marcar[0].id === ca.id ? cb : ca;
            await sb.from("claims").update({ contradice_a: marcar[0].id, pregunta_sugerida: r.data.pregunta_sugerida }).eq("id", otra.id).is("contradice_a", null);
          }
        } else if (r.data.relacion === "updates" && r.data.cual_parece_vigente) {
          // La más reciente reemplaza sin negar: la anterior pasa a validación (¿sigue vigente?), nunca a caducado automático.
          const vieja = r.data.cual_parece_vigente === ca.id ? cb : ca;
          if (vieja.estado === "sin_verificar") await sb.from("claims").update({ prioridad_validacion: true, pregunta_sugerida: r.data.pregunta_sugerida }).eq("id", vieja.id);
        }
      })
    );
    await progreso(job.id, `Comparadas ${Math.min(i + tope, pares.length)} de ${pares.length}. ${contradicciones} contradicciones, ${relaciones} relaciones.`);
  }
  // Con el contraste al día, los pilares listos se diagnostican solos (autonomía del producto).
  const auto = await dispararDiagnosticoSiListo(job.company_id);
  return { pares: paresJuzgados, contradicciones, relaciones, brechas: brechas.length, contraste_numerico: numerico, diagnostico_auto: auto };
}

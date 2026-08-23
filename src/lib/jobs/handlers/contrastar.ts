import { dispararDiagnosticoSiListo } from "../auto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrContrastador } from "@/lib/ai/agents/contrastador";
import { claimsDeEmpresa, etiquetaFuente, registrarLlamada, type ClaimRow } from "@/lib/db/queries";
import { candidatasAContradiccion, brechasEstrategicas, clavePar } from "@/lib/rules/contradiccion";
import { progreso } from "../queue";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

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
  return { pares: paresJuzgados, contradicciones, relaciones, brechas: brechas.length, diagnostico_auto: auto };
}

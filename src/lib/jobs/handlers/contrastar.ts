import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrContrastador } from "@/lib/ai/agents/contrastador";
import { claimsDeEmpresa, etiquetaFuente, registrarTokens, type ClaimRow } from "@/lib/db/queries";
import { candidatasAContradiccion, clavePar } from "@/lib/rules/contradiccion";
import { progreso } from "../queue";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** Reglas mecánicas → pares candidatos → juicio del modelo (ante la duda, false). Capítulo 8. */
export async function handleContrastar(job: Job) {
  const sb = supabaseAdmin();
  const claims = await claimsDeEmpresa(job.company_id);
  const porId = new Map(claims.map((c) => [c.id, c]));

  // Pares ya juzgados (guardados en jobs.resultado de corridas anteriores)
  const { data: previos } = await sb.from("jobs").select("resultado").eq("company_id", job.company_id).eq("tipo", "contrastar").eq("estado", "hecho");
  const juzgadas = new Set<string>();
  for (const p of previos ?? []) for (const k of ((p.resultado as { pares?: string[] })?.pares ?? [])) juzgadas.add(k);

  const pares = candidatasAContradiccion(claims, juzgadas);
  await progreso(job.id, `Comparando ${pares.length} pares de definiciones`);

  const paresJuzgados: string[] = [];
  let contradicciones = 0;
  const tope = 4;
  for (let i = 0; i < pares.length; i += tope) {
    const lote = pares.slice(i, i + tope);
    await Promise.all(
      lote.map(async ({ a, b }) => {
        const ca = porId.get(a.id) as ClaimRow, cb = porId.get(b.id) as ClaimRow;
        const r = await correrContrastador(
          { id: ca.id, texto: ca.texto, fuente: etiquetaFuente(ca), fecha: ca.fecha_afirmacion },
          { id: cb.id, texto: cb.texto, fuente: etiquetaFuente(cb), fecha: cb.fecha_afirmacion }
        );
        await registrarTokens(job.company_id, job.id, "contrastador", r.tokens_entrada, r.tokens_salida);
        paresJuzgados.push(clavePar(a.id, b.id));
        if (r.data.se_contradicen) {
          contradicciones++;
          // Se marca contradicha la que NO parece vigente (o ambas si no sabe). El dueño resuelve.
          const vigente = r.data.cual_parece_vigente;
          const marcar = vigente === ca.id ? [cb] : vigente === cb.id ? [ca] : [ca, cb];
          for (const c of marcar) {
            if (c.estado === "confirmado" && c.participant_id) continue; // lo que el dueño confirmó hoy no se pisa: se pregunta
            await sb
              .from("claims")
              .update({ estado: "contradicho", contradice_a: c.id === ca.id ? cb.id : ca.id, explicacion_contradiccion: r.data.explicacion, pregunta_sugerida: r.data.pregunta_sugerida, prioridad_validacion: true })
              .eq("id", c.id);
          }
          if (marcar.length === 1) {
            const otra = marcar[0].id === ca.id ? cb : ca;
            await sb.from("claims").update({ contradice_a: marcar[0].id, pregunta_sugerida: r.data.pregunta_sugerida }).eq("id", otra.id).is("contradice_a", null);
          }
        }
      })
    );
    await progreso(job.id, `Comparadas ${Math.min(i + tope, pares.length)} de ${pares.length}. ${contradicciones} contradicciones.`);
  }
  return { pares: paresJuzgados, contradicciones };
}

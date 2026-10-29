import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrRevisor } from "@/lib/ai/agents/revisor";
import { registrarLlamada } from "@/lib/db/queries";
import { vara } from "@/lib/metodo/varas";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * REVISAR UN DOCUMENTO CONTRA SU VARA.
 *
 * Lo que el cliente entrega es materia prima. Este trabajo lo mide contra la vara de su tipo y
 * guarda un veredicto por cada exigencia, con su evidencia. NO reescribe el documento: propone.
 *
 * Lo vigente viaja como contexto: un documento nuevo no puede contradecir lo que la empresa ya
 * aprobó, y si lo contradice hay que decirlo en vez de dejar dos reglas conviviendo.
 */
export async function handleRevisarDocumento(job: Job) {
  const sb = supabaseAdmin();
  const documentoId = String(job.payload.documento_id ?? "");
  if (!documentoId) throw new Error("falta documento_id en el trabajo");

  const { data: doc } = await sb
    .from("expediente_documental")
    .select("id,nombre,clave_vara,entregable,origen,estado,contenido,source_id")
    .eq("id", documentoId)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (!doc) throw new Error("el documento no está en el expediente de esta empresa");

  const claveVara = String(doc.clave_vara ?? "");
  if (!claveVara) {
    throw new Error(
      "el documento no tiene vara asignada: sin vara no se puede medir, y medir sin vara es opinar. Asigna su tipo antes de revisarlo."
    );
  }
  const v = vara(claveVara);

  // El texto: el que ya está guardado, o el de la fuente de la que salió.
  let texto = doc.contenido ?? "";
  if (!texto && doc.source_id) {
    const { data: fuente } = await sb.from("sources").select("contenido").eq("id", doc.source_id).maybeSingle();
    texto = fuente?.contenido ?? "";
  }
  if (texto.trim().length < 200) {
    throw new Error(
      `el documento no tiene texto suficiente para revisarlo (${texto.trim().length} caracteres). Puede que la extracción del archivo haya fallado: revísala antes de medir.`
    );
  }

  // LO VIGENTE: contra esto se contrasta. Es lo que impide que un documento nuevo contradiga en
  // silencio algo que la empresa ya aprobó.
  const { data: vigentes } = await sb
    .from("expediente_documental")
    .select("nombre,entregable,vigente_desde,contenido")
    .eq("company_id", job.company_id)
    .eq("estado", "vigente")
    .neq("id", documentoId);

  const loVigente = (vigentes ?? [])
    .map((d) => {
      const cuerpo = String(d.contenido ?? "").slice(0, 6000);
      return `— ${d.nombre}${d.entregable ? ` (${d.entregable})` : ""}, rige desde ${d.vigente_desde ?? "sin fecha"}:\n${cuerpo || "(sin texto cargado)"}`;
    })
    .join("\n\n");

  // La empresa, para que el revisor pueda ver si el documento contradice la realidad.
  const [{ data: c }, { data: puestos }, { data: metricas }] = await Promise.all([
    sb.from("companies").select("nombre,sector,ficha").eq("id", job.company_id).single(),
    sb.from("org_puestos").select("nombre,persona,decide,reporta_a").eq("company_id", job.company_id).order("orden"),
    sb.from("company_metricas").select("clave,valor,estado").eq("company_id", job.company_id).limit(20),
  ]);

  const contexto = [
    c ? `${c.nombre} · rubro: ${c.sector ?? "sin definir"}` : "",
    (puestos ?? []).length
      ? `PUESTOS QUE LA EMPRESA TIENE HOY (${(puestos ?? []).length}):\n${(puestos ?? [])
          .map((p) => `- ${p.nombre}${p.persona ? "" : " (VACANTE)"}${p.decide ? ` — decide: ${String(p.decide).slice(0, 180)}` : ""}`)
          .join("\n")}`
      : "",
    (metricas ?? []).length
      ? `NÚMEROS DECLARADOS (con su estado — «contado» es dicho de memoria, no medido):\n${(metricas ?? [])
          .map((m) => `- ${m.clave} = ${m.valor ?? "sin valor"} [${m.estado}]`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await correrRevisor({ claveVara, documento: texto, loVigente, contexto });
  await registrarLlamada(job.company_id, job.id, "revisor", r);

  const cumple = r.data.verdictos.filter((x) => x.cumple === "si").length;

  const { error } = await sb.from("revision_documental").insert({
    company_id: job.company_id,
    documento_id: documentoId,
    clave_vara: claveVara,
    contenido: r.data,
    veredicto: r.data.veredicto,
    exigencias_total: v.exigencias.length,
    exigencias_cumple: cumple,
  });
  if (error) throw new Error(error.message);

  // Revisado deja de ser «recibido»: pasa a revisión, esperando la decisión de la consultora.
  if (doc.estado === "recibido") {
    await sb.from("expediente_documental").update({ estado: "en_revision", updated_at: new Date().toISOString() }).eq("id", documentoId);
  }

  return {
    documento: doc.nombre,
    vara: claveVara,
    veredicto: r.data.veredicto,
    cumple: `${cumple} de ${v.exigencias.length} exigencias`,
    se_conserva: r.data.que_se_conserva.length,
    contradicciones: r.data.contradicciones_con_lo_vigente.length,
    mejoras: r.data.mejoras_propuestas.length,
    para_asesor_legal: r.data.para_asesor_legal.length,
  };
}

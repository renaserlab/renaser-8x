import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrSelector } from "@/lib/ai/agents/selector";
import { comoDato } from "@/lib/rules/patrones";
import { registrarLlamada } from "@/lib/db/queries";
import { PROCESOS } from "@/lib/metodo";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * POR DÓNDE SE EMPIEZA (pedido de Kelin, 18-10-2026).
 *
 * El paso que faltaba entre la vara del rubro y el dibujo de un proceso. Toma el modelo de alto
 * rendimiento del rubro, el diagnóstico y lo que la empresa ya tiene levantado, y elige: hasta
 * ocho procesos para pedirle que nos los cuente, y de uno a tres donde intervenir de verdad.
 *
 * NACE EN ESTADO «propuesta». La consultora la aprueba antes de que el cliente la vea: el cliente
 * recibe «vamos a conocer estos cinco procesos» ya decidido, no una lista de opciones.
 */
export async function handleSeleccionProcesos(job: Job) {
  const sb = supabaseAdmin();
  const [{ data: c }, { data: modelo }, { data: procesos }, { data: hallazgos }, { data: metricas }] = await Promise.all([
    sb.from("companies").select("nombre,sector,etapa_negocio,ficha").eq("id", job.company_id).single(),
    sb.from("modelo_alto_rendimiento").select("contenido").eq("company_id", job.company_id).maybeSingle(),
    sb.from("processes").select("nombre,responsable,confirmacion").eq("company_id", job.company_id).eq("version", "as_is"),
    // Lo rechazado y lo provisional no dirige una selección: no es conclusión.
    sb
      .from("findings")
      .select("titulo,impacto,causa_raiz")
      .eq("company_id", job.company_id)
      .neq("estado_revision", "rechazado")
      .or("provisional.is.null,provisional.eq.false")
      .order("impacto", { ascending: true })
      .limit(12),
    sb.from("company_metricas").select("clave,valor,estado").eq("company_id", job.company_id).limit(20),
  ]);

  if (!c) throw new Error("empresa no encontrada");
  // Sin la vara del rubro no hay de dónde elegir: el selector no inventa procesos.
  if (!modelo?.contenido) {
    throw new Error(
      "falta el modelo de alto rendimiento del rubro: la selección se hace eligiendo de esa lista, no inventando procesos. Corre primero modelo_alto_rendimiento."
    );
  }

  const m = modelo.contenido as {
    procesos_imprescindibles?: { nombre: string; por_que: string; la_empresa_lo_tiene: string }[];
    las_tres_brechas_mayores?: string[];
  };
  const delRubro = m.procesos_imprescindibles ?? [];
  const levantados = procesos ?? [];

  const contexto = comoDato(
    "LO QUE HAY QUE USAR PARA ELEGIR",
    [
      `EMPRESA: ${c.nombre} · rubro: ${c.sector ?? "sin definir"} · etapa: ${c.etapa_negocio ?? "sin definir"}`,

      `LOS PROCESOS QUE EL RUBRO EXIGE (${delRubro.length}) — de aquí se elige, y cada uno dice si ESTA empresa lo tiene:\n${delRubro
        .map((p) => `- ${p.nombre} [la empresa lo tiene: ${p.la_empresa_lo_tiene}] — ${p.por_que}`)
        .join("\n")}`,

      levantados.length
        ? `PROCESOS QUE LA EMPRESA YA TIENE LEVANTADOS (${levantados.length}) — no los vuelvas a pedir salvo que haya que rehacerlos:\n${levantados
            .map((p) => `- ${p.nombre}${p.responsable ? ` (responde: ${p.responsable})` : " (SIN DUEÑO)"}${p.confirmacion === "confirmado" ? " · confirmado" : ""}`)
            .join("\n")}`
        : `PROCESOS LEVANTADOS: ninguno. La empresa no tiene nada escrito, así que para_contar es lo primero que va a ver de nuestro criterio.`,

      (hallazgos ?? []).length
        ? `HALLAZGOS DEL DIAGNÓSTICO (${(hallazgos ?? []).length}) — el dolor confirmado pesa más que una brecha del rubro:\n${(hallazgos ?? [])
            .map((h) => `- [${h.impacto}] ${h.titulo}${h.causa_raiz ? ` · causa: ${String(h.causa_raiz).slice(0, 160)}` : ""}`)
            .join("\n")}`
        : "HALLAZGOS: todavía ninguno. Elige por lo que el rubro exige y por lo que la empresa no tiene.",

      (m.las_tres_brechas_mayores ?? []).length
        ? `BRECHAS MAYORES CONTRA EL RUBRO:\n${(m.las_tres_brechas_mayores ?? []).map((b) => `- ${b}`).join("\n")}`
        : "",

      (metricas ?? []).length
        ? `NÚMEROS QUE LA EMPRESA YA DIO (con su estado — «contado» es dicho de memoria, no medido):\n${(metricas ?? [])
            .map((x) => `- ${x.clave} = ${x.valor ?? "sin valor"} [${x.estado}]`)
            .join("\n")}`
        : "",

      `RECORDATORIO DE LOS TOPES: para_contar máximo ${PROCESOS.captura.tope}; mueven_las_ruedas de ${PROCESOS.intervencion.minimo} a ${PROCESOS.intervencion.tope}. Traer el tope lleno porque cabe es no haber elegido.`,
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  const r = await correrSelector(contexto);
  await registrarLlamada(job.company_id, job.id, "selector", r);

  // Las anteriores propuestas sin aprobar dejan de competir: solo una propuesta viva por empresa.
  await sb.from("seleccion_procesos").update({ estado: "descartada", updated_at: new Date().toISOString() }).eq("company_id", job.company_id).eq("estado", "propuesta");

  const { error } = await sb.from("seleccion_procesos").insert({
    company_id: job.company_id,
    contenido: r.data,
    estado: "propuesta",
  });
  if (error) throw new Error(error.message);

  return {
    para_contar: r.data.para_contar.length,
    mueven_las_ruedas: r.data.mueven_las_ruedas.length,
    se_deja_fuera: r.data.lo_que_no_se_pide.length,
    estado: "propuesta — espera la aprobación de la consultora",
  };
}

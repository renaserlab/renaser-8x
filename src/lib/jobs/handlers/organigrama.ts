import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrOrganizador } from "@/lib/ai/agents/organizador";
import { comoDato } from "@/lib/rules/patrones";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * EL ESTUDIO DE ORGANIGRAMA por empresa (pedido de Kelin): qué quiere lograr y qué estructura
 * necesita construir. Junta la evidencia REAL — sueño del dueño, ficha, gente y puestos actuales,
 * hallazgos, procesos — y el ORGANIZADOR la convierte en estudio. Se guarda en org_estudio y el
 * consultor decide qué puestos siembra en el organigrama.
 */
export async function handleEstudioOrganigrama(job: Job) {
  const sb = supabaseAdmin();
  const [{ data: c }, { data: claims }, { data: parts }, { data: puestos }, { data: hallazgos }, { data: procesos }] = await Promise.all([
    sb.from("companies").select("nombre,sector,etapa_negocio,ficha").eq("id", job.company_id).single(),
    sb.from("claims").select("texto,pilar,estado").eq("company_id", job.company_id).in("estado", ["confirmado", "sin_verificar"]).order("created_at", { ascending: false }).limit(80),
    sb.from("participants").select("nombre,puesto,rol").eq("company_id", job.company_id),
    sb.from("org_puestos").select("nombre,mision,decide,persona,respaldo,reporta_a,origen").eq("company_id", job.company_id),
    sb.from("findings").select("pilar,titulo,causa_raiz,impacto").eq("company_id", job.company_id).neq("estado_revision", "rechazado").limit(20),
    sb.from("processes").select("nombre,version,confirmacion").eq("company_id", job.company_id).eq("version", "as_is"),
  ]);
  if (!c) throw new Error("empresa no encontrada");

  const ficha = (c.ficha ?? {}) as Record<string, string>;
  const sueno = (claims ?? []).filter((x) => /suen|meta|quiere llegar|aspir|vision|local(es)? nuevos|crecer/i.test(x.texto)).slice(0, 8);
  const gente = (parts ?? []).map((p) => `- ${p.nombre} (${p.puesto || p.rol})`);
  const declarados = (puestos ?? []).filter((p) => p.origen === "cliente");
  const actuales = (puestos ?? []).map((p) => `- ${p.nombre}${p.persona ? ` — lo ocupa ${p.persona}` : " — VACANTE"}${p.mision ? ` · hace: ${p.mision}` : ""}${p.respaldo ? "" : " · SIN RESPALDO"}${p.origen === "cliente" ? " · (declarado por el propio cliente)" : ""}`);
  const halls = (hallazgos ?? []).map((h) => `- [${h.pilar}/${h.impacto}] ${h.titulo}${h.causa_raiz ? ` (causa: ${h.causa_raiz})` : ""}`);
  const procs = (procesos ?? []).map((p) => `- ${p.nombre} (${p.confirmacion === "confirmado" ? "confirmado" : "por confirmar"})`);

  const contexto = comoDato(
    "LA EMPRESA",
    [
      `${c.nombre} · ${c.sector ?? "sector sin definir"} · etapa: ${c.etapa_negocio ?? "sin definir"}`,
      `Ficha: ${ficha.personas ?? "?"} personas, ${ficha.locales ?? "?"} local(es), ${ficha.antiguedad ?? "?"} años, ciudad ${ficha.ciudad ?? "?"}. Venta mensual declarada: ${ficha.venta_mensual ?? "sin dato"}.`,
      sueno.length ? `LO QUE EL DUEÑO DECLARÓ QUERER (citas textuales):\n${sueno.map((s) => `«${s.texto}»`).join("\n")}` : "SUEÑO/META: aún no declarada en el levantamiento.",
      gente.length ? `LA GENTE REAL:\n${gente.join("\n")}` : "",
      actuales.length
        ? `LA ESTRUCTURA ACTUAL (${declarados.length ? `${declarados.length} puesto(s) declarados por el propio cliente` : "dibujada por el consultor"}):\n${actuales.join("\n")}`
        : "ESTRUCTURA ACTUAL: el cliente aún no declara sus puestos — ese es el primer faltante.",
      halls.length ? `HALLAZGOS DEL DIAGNÓSTICO:\n${halls.join("\n")}` : "",
      procs.length ? `PROCESOS LEVANTADOS (${procs.length}):\n${procs.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  const r = await correrOrganizador(contexto);
  // El vigente se reemplaza; la historia se conserva: cada estudio es una versión documental.
  const { error } = await sb.from("org_estudio").upsert(
    { company_id: job.company_id, contenido: r.data, updated_at: new Date().toISOString() },
    { onConflict: "company_id" }
  );
  if (error) throw new Error(error.message);
  const { error: eV } = await sb.from("org_estudio_versiones").insert({ company_id: job.company_id, contenido: r.data });
  if (eV) throw new Error(eV.message);
  return { opciones: 2, faltantes: r.data.faltantes.length };
}

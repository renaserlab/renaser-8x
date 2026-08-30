import { supabaseAdmin } from "./supabase/admin";
import { levantamientoCompleto, diagnosticoListo, type Suficiencia } from "./rules/suficiencia";
import { radiografia, type Metrica as MetricaVital, type Radiografia } from "./metricas";

export type ItemBandeja = { tipo: string; titulo: string; detalle: string; company_id: string; empresa: string; href: string; urgencia: 1 | 2 | 3 };

const DIAS_TRABADA = Number(process.env.BANDEJA_DIAS_TRABADA ?? 5);
const DIAS_SIN_CORTE = 16;
/** Un mes es el ciclo natural: los números del negocio se cierran por mes. */
const DIAS_ENTRE_CORTES = Number(process.env.DIAS_ENTRE_CORTES ?? 30);

/** Condiciones de suficiencia de una empresa (P1-04). Consulta, no IA. */
export async function suficienciaDeEmpresa(companyId: string): Promise<Suficiencia> {
  const sb = supabaseAdmin();
  const [{ data: claims }, { data: sesiones }] = await Promise.all([
    sb.from("claims").select("tipo,estado,pilar,participant_id").eq("company_id", companyId),
    sb.from("interview_sessions").select("tipo,estado, participants(rol)").eq("company_id", companyId),
  ]);
  return levantamientoCompleto(claims ?? [], (sesiones ?? []).map((s) => ({ tipo: s.tipo, estado: s.estado, rol: (s.participants as unknown as { rol: string | null } | null)?.rol ?? null })));
}

/** Qué requiere atención hoy. Lee de company_stats (refrescada cada minuto) y, si está vacía, cuenta directo. Capítulo 33 y 37. */
export async function bandeja() {
  const sb = supabaseAdmin();
  const [{ data: empresas }, { data: statsRows }, { data: metricasRows }, { data: medicionesRows }] = await Promise.all([
    sb.from("companies").select("id,nombre,etapa,estado_admision,created_at").order("created_at", { ascending: false }),
    sb.from("company_stats").select("*"),
    // Los nueve números de TODAS las empresas de una sola vez: una consulta, no una por empresa.
    sb.from("company_metricas").select("company_id,clave,periodo,valor,estado").limit(4000),
    // Las mediciones de todas las empresas de una sola vez, igual que las métricas.
    sb.from("mediciones").select("company_id,tipo,numero,fecha").order("fecha", { ascending: false }).limit(2000),
  ]);
  const medicionesPor = new Map<string, { tipo: string; fecha: string }[]>();
  for (const m of medicionesRows ?? []) {
    const l = medicionesPor.get(m.company_id as string) ?? [];
    l.push({ tipo: m.tipo as string, fecha: m.fecha as string });
    medicionesPor.set(m.company_id as string, l);
  }
  const metricasPor = new Map<string, MetricaVital[]>();
  for (const m of metricasRows ?? []) {
    const lista = metricasPor.get(m.company_id as string) ?? [];
    lista.push(m as unknown as MetricaVital);
    metricasPor.set(m.company_id as string, lista);
  }
  const radiografiaPor = new Map<string, Radiografia>();
  const statsPor = new Map((statsRows ?? []).map((s) => [s.company_id as string, s as Record<string, number | string>]));
  const items: ItemBandeja[] = [];
  const hoy = Date.now();
  const hoyISO = new Date().toISOString().slice(0, 10);
  for (const e of empresas ?? []) {
    const s = statsPor.get(e.id) ?? null;
    const base = `/empresa/${e.id}`;
    if (e.estado_admision === "candidata") items.push({ tipo: "admision", titulo: "Decidir admisión", detalle: "Cuestionario por evaluar", company_id: e.id, empresa: e.nombre, href: base, urgencia: 2 });
    if (!s) {
      items.push({ tipo: "nueva", titulo: "Empresa recién creada", detalle: "Todavía sin actividad. Sube la primera fuente o agrega personas.", company_id: e.id, empresa: e.nombre, href: `${base}/fuentes`, urgencia: 3 });
      continue;
    }
    if (Number(s.trabajos_fallidos) > 0) items.push({ tipo: "fallidos", titulo: `${s.trabajos_fallidos} trabajo(s) fallido(s)`, detalle: "Nunca desaparecen en silencio. Revisa el error y reintenta.", company_id: e.id, empresa: e.nombre, href: `${base}/fuentes`, urgencia: 1 });
    if (Number(s.hallazgos_por_revisar) > 0) items.push({ tipo: "revisar", titulo: `${s.hallazgos_por_revisar} hallazgo(s) por revisar`, detalle: "Ningún hallazgo llega al cliente sin pasar por ti.", company_id: e.id, empresa: e.nombre, href: `${base}/diagnostico`, urgencia: 1 });
    if (Number(s.contradichas) > 0) items.push({ tipo: "contradicciones", titulo: `${s.contradichas} contradicción(es) sin resolver`, detalle: "El dueño las resuelve con tres botones.", company_id: e.id, empresa: e.nombre, href: `${base}/realidad?estado=contradicho`, urgencia: 2 });
    if (Number(s.frentes_vencidos) > 0) items.push({ tipo: "vencidos", titulo: `${s.frentes_vencidos} frente(s) vencido(s)`, detalle: "Lo que se traba dos semanas seguidas escala aquí.", company_id: e.id, empresa: e.nombre, href: `${base}/plan`, urgencia: 1 });

    // LOS NUEVE NÚMEROS: pedido de Kelin — "como consultora debería ver cuánto le falta a mi cliente".
    const radio = radiografia(metricasPor.get(e.id) ?? []);
    radiografiaPor.set(e.id, radio);
    if (radio.faltan.length > 0 && !["cerrada", "monitoreo"].includes(e.etapa)) {
      items.push({
        tipo: "numeros",
        titulo: `Le faltan ${radio.faltan.length} de los 9 números`,
        detalle: `Sin ellos el diagnóstico es opinión. Falta: ${radio.faltan.slice(0, 3).map((v) => v.nombre.toLowerCase()).join(", ")}${radio.faltan.length > 3 ? "…" : ""}`,
        company_id: e.id, empresa: e.nombre, href: `${base}/realidad`, urgencia: radio.faltan.length >= 5 ? 2 : 3,
      });
    }

    // ¿MEJORÓ? Sin línea base la pregunta no tiene respuesta; con línea base pero sin corte hace
    // meses, tampoco. Las dos cosas se avisan aquí, que es donde la consultora mira.
    const meds = medicionesPor.get(e.id) ?? [];
    const tieneBase = meds.some((m) => m.tipo === "linea_base");
    const cortesDe = meds.filter((m) => m.tipo === "corte");
    if (!tieneBase && radio.listos >= 5 && !["candidata"].includes(e.estado_admision ?? "")) {
      items.push({
        tipo: "linea_base", titulo: "Ya se puede fijar el punto de partida",
        detalle: `Tiene ${radio.listos} de 9 números. Sin punto de partida no habrá con qué comparar después.`,
        company_id: e.id, empresa: e.nombre, href: `${base}/realidad`, urgencia: 2,
      });
    } else if (tieneBase) {
      const ultima = cortesDe[0]?.fecha ?? meds.find((m) => m.tipo === "linea_base")!.fecha;
      const diasSin = Math.floor((hoy - new Date(ultima).getTime()) / 86_400_000);
      if (diasSin >= DIAS_ENTRE_CORTES) {
        items.push({
          tipo: "medir", titulo: `Toca medir: ${diasSin} días sin corte`,
          detalle: cortesDe.length ? "Actualiza sus números y registra un corte para ver qué se movió." : "Nunca se ha medido contra el punto de partida.",
          company_id: e.id, empresa: e.nombre, href: `${base}/plan`, urgencia: 2,
        });
      }
    }

    if (["levantamiento", "contraste"].includes(e.etapa)) {
      const suf = await suficienciaDeEmpresa(e.id);
      if (suf.completo) items.push({ tipo: "diagnosticar", titulo: "Levantamiento completo: lista para diagnosticar", detalle: "Ninguna afirmación crítica pendiente; dueño y equipo entrevistados.", company_id: e.id, empresa: e.nombre, href: `${base}/diagnostico`, urgencia: 2 });
      else if (Number(s.afirmaciones) > 0 && suf.motivos.length) items.push({ tipo: "suficiencia", titulo: "Le falta para diagnosticar", detalle: suf.motivos.join(" · "), company_id: e.id, empresa: e.nombre, href: `${base}`, urgencia: 3 });
    }
    if (e.etapa === "diagnostico") {
      const { data: fs } = await sb.from("findings").select("estado_revision,requiere_validacion").eq("company_id", e.id);
      const d = diagnosticoListo(fs ?? []);
      if (d.por_validar > 0) items.push({ tipo: "validar", titulo: `${d.por_validar} hallazgo(s) necesitan más evidencia`, detalle: "Una sola opinión no sostiene un hallazgo crítico: valida con otra fuente o baja el impacto.", company_id: e.id, empresa: e.nombre, href: `${base}/diagnostico`, urgencia: 2 });
      if (d.listo) items.push({ tipo: "espejo", titulo: "Diagnóstico revisado: listo para El Espejo", detalle: "Genera TO-BE, plan y paquete.", company_id: e.id, empresa: e.nombre, href: `${base}/realidad`, urgencia: 2 });
    }
    if (["implementacion", "monitoreo"].includes(e.etapa)) {
      const { data: acc } = await sb.from("actions").select("estado,vence_at,semana_cierre").eq("company_id", e.id);
      const semanaCerradaConPendientes = (acc ?? []).filter((a) => a.estado !== "hecho" && a.estado !== "descartado" && a.vence_at && a.vence_at < hoyISO);
      const dosSemanas = semanaCerradaConPendientes.filter((a) => (hoy - new Date(a.vence_at!).getTime()) / 86_400_000 >= 14);
      if (dosSemanas.length) items.push({ tipo: "escalado", titulo: `${dosSemanas.length} frente(s) trabados dos semanas`, detalle: "Escala al consultor: nada muere en silencio.", company_id: e.id, empresa: e.nombre, href: `${base}/plan`, urgencia: 1 });
      if (e.etapa === "monitoreo") {
        const { data: cortes } = await sb.from("checkpoints").select("fecha").eq("company_id", e.id).order("fecha", { ascending: false }).limit(1);
        const ultimo = cortes?.[0]?.fecha ? new Date(cortes[0].fecha).getTime() : new Date(e.created_at).getTime();
        if ((hoy - ultimo) / 86_400_000 >= DIAS_SIN_CORTE) items.push({ tipo: "corte", titulo: "Toca un corte quincenal", detalle: "¿El proceso nuevo se usa? ¿El indicador se movió? ¿Alguien volvió a lo antiguo?", company_id: e.id, empresa: e.nombre, href: `${base}/plan`, urgencia: 2 });
      }
    }
    const ultima = s.ultima_actividad ? new Date(String(s.ultima_actividad)).getTime() : new Date(e.created_at).getTime();
    const dias = Math.floor((hoy - ultima) / 86_400_000);
    if (["levantamiento", "contraste"].includes(e.etapa) && dias >= DIAS_TRABADA) items.push({ tipo: "trabada", titulo: `Sin actividad hace ${dias} días`, detalle: "Riesgo 1: el cliente no llena nada. Llámalo o llena por él.", company_id: e.id, empresa: e.nombre, href: `${base}/fuentes`, urgencia: 2 });
  }
  items.sort((a, b) => a.urgencia - b.urgencia);
  return {
    items,
    empresas: (empresas ?? []).map((e) => ({
      id: e.id, nombre: e.nombre, etapa: e.etapa, estado_admision: e.estado_admision,
      stats: statsPor.get(e.id) ?? null,
      radiografia: radiografiaPor.get(e.id) ?? null,
    })),
  };
}

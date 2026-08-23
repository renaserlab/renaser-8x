import { supabaseAdmin } from "./supabase/admin";

export type ItemBandeja = { tipo: string; titulo: string; detalle: string; company_id: string; empresa: string; href: string; urgencia: 1 | 2 | 3 };

const DIAS_TRABADA = 5;

/** Qué requiere atención hoy. Lee de company_stats (refrescada cada minuto por el worker). Capítulo 33. */
export async function bandeja() {
  const sb = supabaseAdmin();
  const [{ data: empresas }, { data: statsRows }] = await Promise.all([
    sb.from("companies").select("id,nombre,etapa,estado_admision,created_at").order("created_at", { ascending: false }),
    sb.from("company_stats").select("*"),
  ]);
  const statsPor = new Map((statsRows ?? []).map((s) => [s.company_id as string, s as Record<string, number | string>]));
  const items: ItemBandeja[] = [];
  const hoy = Date.now();
  for (const e of empresas ?? []) {
    const s = statsPor.get(e.id) ?? null;
    if (!s) continue;
    const base = `/empresa/${e.id}`;
    if (e.estado_admision === "candidata") items.push({ tipo: "admision", titulo: "Decidir admisión", detalle: "Cuestionario por evaluar", company_id: e.id, empresa: e.nombre, href: base, urgencia: 2 });
    if (Number(s.trabajos_fallidos) > 0) items.push({ tipo: "fallidos", titulo: `${s.trabajos_fallidos} trabajo(s) fallido(s)`, detalle: "Nunca desaparecen en silencio. Revisa el error y reintenta.", company_id: e.id, empresa: e.nombre, href: `${base}/fuentes`, urgencia: 1 });
    if (Number(s.hallazgos_por_revisar) > 0) items.push({ tipo: "revisar", titulo: `${s.hallazgos_por_revisar} hallazgo(s) por revisar`, detalle: "Ningún hallazgo llega al cliente sin pasar por ti.", company_id: e.id, empresa: e.nombre, href: `${base}/diagnostico`, urgencia: 1 });
    if (Number(s.contradichas) > 0) items.push({ tipo: "contradicciones", titulo: `${s.contradichas} contradicción(es) sin resolver`, detalle: "El dueño las resuelve con tres botones.", company_id: e.id, empresa: e.nombre, href: `${base}/realidad?estado=contradicho`, urgencia: 2 });
    if (Number(s.frentes_vencidos) > 0) items.push({ tipo: "vencidos", titulo: `${s.frentes_vencidos} frente(s) vencido(s)`, detalle: "Lo que se traba dos semanas seguidas escala aquí.", company_id: e.id, empresa: e.nombre, href: `${base}/plan`, urgencia: 1 });
    const listaParaDiagnosticar = ["levantamiento", "contraste"].includes(e.etapa) && Number(s.sin_verificar) === 0 && Number(s.contradichas) === 0 && Number(s.confirmadas) >= 20;
    if (listaParaDiagnosticar) items.push({ tipo: "diagnosticar", titulo: "Levantamiento completo: lista para diagnosticar", detalle: `${s.confirmadas} definiciones confirmadas, ninguna pendiente.`, company_id: e.id, empresa: e.nombre, href: `${base}/diagnostico`, urgencia: 2 });
    const ultima = s.ultima_actividad ? new Date(String(s.ultima_actividad)).getTime() : new Date(e.created_at).getTime();
    const dias = Math.floor((hoy - ultima) / 86_400_000);
    if (["levantamiento", "contraste"].includes(e.etapa) && dias >= DIAS_TRABADA) items.push({ tipo: "trabada", titulo: `Sin actividad hace ${dias} días`, detalle: "Riesgo 1: el cliente no llena nada. Llámalo o llena por él.", company_id: e.id, empresa: e.nombre, href: `${base}/fuentes`, urgencia: 2 });
  }
  items.sort((a, b) => a.urgencia - b.urgencia);
  return { items, empresas: (empresas ?? []).map((e) => ({ id: e.id, nombre: e.nombre, etapa: e.etapa, estado_admision: e.estado_admision, stats: statsPor.get(e.id) ?? null })) };
}

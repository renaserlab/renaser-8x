import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Dato } from "@/components/base/Vacio";
import { Admision } from "@/components/consultor/Admision";
import { Participantes } from "@/components/consultor/Participantes";
import { Etapa } from "@/components/consultor/Etapa";
import { PILAR, ESTADO_PILAR, ETAPA } from "@/lib/textos";
import { tokensUsados } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const COLOR_PILAR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };

/** Panorama: 4 pilares + avance. */
export default async function Panorama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: c }, { data: diag }, { data: parts }, { data: sesiones }, { data: stats }, usados] = await Promise.all([
    sb.from("companies").select("*").eq("id", id).single(),
    sb.from("diagnoses").select("pilar,estado,resumen").eq("company_id", id),
    sb.from("participants").select("id,nombre,puesto,rol,token_expira_at,token_revocado_at,token_canjeado_at").eq("company_id", id).order("created_at"),
    sb.from("interview_sessions").select("id,tipo,estado,participant_id").eq("company_id", id),
    sb.from("company_stats").select("*").eq("company_id", id).maybeSingle(),
    tokensUsados(id),
  ]);
  if (!c) return null;
  const porPilar = Object.fromEntries((diag ?? []).map((d) => [d.pilar, d]));
  const participantes = (parts ?? []).map((p) => ({ ...p, sesiones: (sesiones ?? []).filter((s) => s.participant_id === p.id) }));
  const { data: claimsPilar } = await sb.from("claims").select("pilar,estado").eq("company_id", id);
  const conteo: Record<string, { total: number; confirmadas: number }> = {};
  for (const cl of claimsPilar ?? []) {
    const k = cl.pilar ?? "transversal";
    conteo[k] = conteo[k] ?? { total: 0, confirmadas: 0 };
    conteo[k].total++;
    if (cl.estado === "confirmado") conteo[k].confirmadas++;
  }
  const admision = c.admision as (Record<string, string> & { evaluacion?: { admisible: boolean; motivo: string; senales: string[] } }) | null;

  return (
    <>
      <Encabezado titulo={c.nombre} sub={`${c.sector ?? "sector sin definir"} · ${ETAPA[c.etapa] ?? c.etapa}`} acciones={<Etapa companyId={id} etapa={c.etapa} />} />

      <Admision companyId={id} estado={c.estado_admision} evaluacion={admision?.evaluacion} respuestas={admision} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        {["personas", "procesos", "producto", "marketing"].map((p) => {
          const d = porPilar[p];
          const n = conteo[p] ?? { total: 0, confirmadas: 0 };
          return (
            <Link key={p} href={`/empresa/${id}/diagnostico?pilar=${p}`} className="panel p-5 aparece" style={{ borderTop: `3px solid ${d ? COLOR_PILAR[d.estado] : "var(--linea)"}` }}>
              <div className="t-etiqueta">{PILAR[p]}</div>
              <div className="t-seccion mt-2" style={{ color: d ? COLOR_PILAR[d.estado] : "var(--grafito)" }}>{d ? ESTADO_PILAR[d.estado] : "Sin diagnosticar"}</div>
              <div className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
                {n.confirmadas} confirmadas de {n.total}
              </div>
              {d?.resumen && <p className="t-dato mt-2">{d.resumen}</p>}
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        <Dato etiqueta="Fuentes" valor={stats?.fuentes ?? 0} />
        <Dato etiqueta="Definiciones" valor={stats?.afirmaciones ?? 0} />
        <Dato etiqueta="Sin verificar" valor={stats?.sin_verificar ?? 0} />
        <Dato etiqueta="Contradichas" valor={stats?.contradichas ?? 0} />
        <Dato etiqueta="Por revisar" valor={stats?.hallazgos_por_revisar ?? 0} />
        <Dato etiqueta="Tokens usados" valor={`${Math.round(usados / 1000)}k / ${Math.round((c.tope_tokens ?? 0) / 1000)}k`} />
      </section>

      <Participantes companyId={id} participantes={participantes} />
    </>
  );
}

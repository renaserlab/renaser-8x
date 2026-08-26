import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Dato } from "@/components/base/Vacio";
import { Admision } from "@/components/consultor/Admision";
import { Participantes } from "@/components/consultor/Participantes";
import { Etapa } from "@/components/consultor/Etapa";
import { PILAR, ESTADO_PILAR, ETAPA } from "@/lib/textos";
import { tokensUsados } from "@/lib/db/queries";
import { cumplimientoLegal } from "@/lib/biblioteca";

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

  // SALUD EMPRESARIAL: promedio de los pilares diagnosticados (madurez Base RENASER: sin evidencia no puntúa).
  const PUNTAJE: Record<string, number> = { solido: 85, mejorable: 60, critico: 35 };
  const puntuados = (diag ?? []).map((d) => PUNTAJE[d.estado]).filter((n): n is number => n != null);
  const salud = puntuados.length ? Math.round(puntuados.reduce((a, b) => a + b, 0) / puntuados.length) : null;
  const { data: restricciones } = await sb
    .from("findings")
    .select("id,titulo,impacto,pilar,patron")
    .eq("company_id", id)
    .neq("estado_revision", "rechazado")
    .eq("impacto", "alto")
    .order("created_at", { ascending: false })
    .limit(3);

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        sub={`${c.sector ?? "sector sin definir"} · ${ETAPA[c.etapa] ?? c.etapa}`}
        acciones={
          <span className="flex items-center gap-3 flex-wrap">
            <a href={`/api/consultor/ver-portal?empresa=${id}`} className="boton boton--secundario" style={{ minHeight: 40 }}>Ver como el empresario</a>
            <Etapa companyId={id} etapa={c.etapa} />
          </span>
        }
      />

      <Admision companyId={id} estado={c.estado_admision} evaluacion={admision?.evaluacion} respuestas={admision} />

      {/* Las 3 capas del método: dónde está esta empresa (maqueta aprobada). */}
      {await (async () => {
        const [{ count: propuestas }, { count: porValidar }] = await Promise.all([
          sb.from("company_assets").select("id", { count: "exact", head: true }).eq("company_id", id).not("propuesta_estado", "is", null),
          sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", id).eq("estado", "contradicho"),
        ]);
        const hayDiag = (diag ?? []).some((d) => d.estado !== "desconocido");
        const capa = (propuestas ?? 0) > 0 ? 3 : hayDiag ? 2 : 1;
        const paso = (n: number, nombre: string, detalle: string) => {
          const hecho = capa > n;
          const act = capa === n;
          return (
            <span key={n} className="flex items-center gap-2" style={{ flex: "none" }}>
              <span className="t-dato" style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, background: hecho ? "var(--confirmado)" : act ? "var(--marca)" : "var(--suave)", color: hecho || act ? "var(--papel)" : "var(--grafito)", border: "1.5px solid " + (hecho ? "var(--confirmado)" : act ? "var(--marca)" : "var(--linea)") }}>{n}</span>
              <span>
                <span className="t-dato" style={{ fontWeight: 600 }}>{nombre}</span>
                <span className="block t-dato" style={{ color: "var(--grafito)", fontSize: 12 }}>{detalle}</span>
              </span>
            </span>
          );
        };
        return (
          <section className="panel p-5 mb-6 flex flex-wrap items-center gap-6">
            {paso(1, "Diagnóstico", hayDiag ? "corrido" : "en levantamiento")}
            {paso(2, "Profundización", (porValidar ?? 0) > 0 ? `${porValidar} contradicción(es) por resolver` : "validaciones al día")}
            {paso(3, "Creación y sistematización", (propuestas ?? 0) > 0 ? `${propuestas} documento(s) en trabajo` : "aún sin documentos trabajados")}
          </section>
        );
      })()}

      {/* Salud + restricciones principales + qué hacer hoy (maqueta aprobada) */}
      <section className="grid gap-4 lg:grid-cols-[220px_1fr_1fr] mb-6">
        <div className="panel p-5" style={{ textAlign: "center" }}>
          <p className="t-etiqueta mb-2">Salud empresarial</p>
          {salud != null ? (
            <>
              <svg viewBox="0 0 120 70" style={{ width: 120, margin: "0 auto", display: "block" }} role="img" aria-label={`Salud ${salud} de 100`}>
                <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--linea)" strokeWidth="9" strokeLinecap="round" />
                <path d={`M10 62 A50 50 0 ${salud > 50 ? 1 : 0} 1 ${(60 + 50 * Math.cos(Math.PI * (1 - salud / 100))).toFixed(1)} ${(62 - 50 * Math.sin(Math.PI * (1 - salud / 100))).toFixed(1)}`} fill="none" stroke={salud >= 70 ? "var(--confirmado)" : salud >= 50 ? "var(--caducado)" : "var(--contradicho)"} strokeWidth="9" strokeLinecap="round" />
                <text x="60" y="56" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--tinta)">{salud}</text>
              </svg>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>de 100 · con evidencia</p>
            </>
          ) : (
            <p className="t-dato" style={{ color: "var(--grafito)", marginTop: 16 }}>Sin diagnóstico aún — la salud se calcula con evidencia, no con impresiones.</p>
          )}
        </div>
        <div className="panel p-5">
          <p className="t-etiqueta mb-3">Principales restricciones</p>
          {(restricciones ?? []).length ? (
            <ul className="flex flex-col gap-2">
              {(restricciones ?? []).map((r) => (
                <li key={r.id} className="t-dato">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--contradicho)", marginRight: 8 }} aria-hidden="true" />
                  <Link href={`/empresa/${id}/diagnostico?pilar=${r.pilar}`} style={{ fontWeight: 550 }}>{r.titulo}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin restricciones de impacto alto todavía.</p>
          )}
        </div>
        <div className="panel p-5">
          <p className="t-etiqueta mb-3">¿Qué quieres hacer hoy?</p>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/consultor/ver-portal?empresa=${id}`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Ver como el empresario</a>
            <Link href={`/empresa/${id}/diagnostico`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Diagnosticar</Link>
            <Link href={`/empresa/${id}/afirmaciones?estado=contradicho`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Resolver contradicciones</Link>
            <Link href={`/empresa/${id}/procesos`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Sistematizar procesos</Link>
            <Link href={`/empresa/${id}/plan-estrategico`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Plan estratégico</Link>
            <Link href={`/empresa/${id}/plan`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Armar el plan</Link>
          </div>
          <details className="mt-4">
            <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Cumplimiento legal (Perú) · {(c.ficha as { personas?: string } | null)?.personas ?? "?"} trabajadores</summary>
            <ul className="lista-editorial mt-2">
              {cumplimientoLegal(Number((c.ficha as { personas?: string } | null)?.personas)).map((o) => (
                <li key={o.obligacion} style={{ padding: "8px 0" }}>
                  <span style={{ fontWeight: 550, fontSize: 13.5 }}>{o.obligacion}</span>
                  <span className="t-dato" style={{ color: "var(--grafito)", display: "block" }}>{o.detalle}</span>
                </li>
              ))}
            </ul>
            <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>La exigencia exacta depende del sector y régimen: verificar con asesoría laboral.</p>
          </details>
        </div>
      </section>

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

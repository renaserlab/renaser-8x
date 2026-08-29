import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { Admision } from "@/components/consultor/Admision";
import { Participantes } from "@/components/consultor/Participantes";
import { Etapa } from "@/components/consultor/Etapa";
import { PILAR, ESTADO_PILAR, ETAPA } from "@/lib/textos";
import { tokensUsados } from "@/lib/db/queries";
import { cumplimientoLegal } from "@/lib/biblioteca";
import { tableroEmpresario } from "@/lib/tablero";
import { Franja, Lectura } from "@/components/base/Franja";
import { AdministrarEmpresa } from "@/components/consultor/AdministrarEmpresa";
import { coberturaSesion } from "@/lib/rules/cobertura";
import { TIPO_SESION } from "@/lib/textos";

export const dynamic = "force-dynamic";

const COLOR_PILAR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };
const PUNTAJE: Record<string, number> = { solido: 85, mejorable: 60, critico: 35 };
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function Sparkline({ serie }: { serie: { valor: number }[] }) {
  if (serie.length < 2) return null;
  const vals = serie.slice(-6).map((p) => p.valor);
  const max = Math.max(...vals), min = Math.min(...vals);
  const x = (i: number) => 4 + (112 * i) / (vals.length - 1);
  const y = (v: number) => 30 - (24 * (v - min)) / (max - min || 1);
  return (
    <svg viewBox="0 0 120 34" style={{ width: 120, marginTop: 2 }} role="img" aria-label="Tendencia de ventas">
      <polyline points={vals.map((v, i) => `${x(i)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--marca)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="3.5" fill="var(--marca)" />
    </svg>
  );
}

/** Panorama: el tablero del consultor — números arriba, mapa con color, restricciones y acciones. */
export default async function Panorama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: c }, { data: diag }, { data: parts }, { data: sesiones }, { data: stats }, usados, t] = await Promise.all([
    sb.from("companies").select("*").eq("id", id).single(),
    sb.from("diagnoses").select("pilar,estado,resumen").eq("company_id", id),
    sb.from("participants").select("id,nombre,puesto,rol,token_expira_at,token_revocado_at,token_canjeado_at").eq("company_id", id).order("created_at"),
    sb.from("interview_sessions").select("id,tipo,estado,participant_id,bloques_cubiertos").eq("company_id", id),
    sb.from("company_stats").select("*").eq("company_id", id).maybeSingle(),
    tokensUsados(id),
    tableroEmpresario(id),
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
  const ficha = c.ficha as { personas?: string; ciudad?: string; whatsapp?: string } | null;

  const puntuados = (diag ?? []).map((d) => PUNTAJE[d.estado]).filter((n): n is number => n != null);
  const salud = puntuados.length ? Math.round(puntuados.reduce((a, b) => a + b, 0) / puntuados.length) : null;
  const colorSalud = salud == null ? "var(--grafito)" : salud >= 70 ? "var(--confirmado)" : salud >= 50 ? "var(--caducado)" : "var(--contradicho)";
  const { data: restricciones } = await sb
    .from("findings")
    .select("id,titulo,impacto,pilar,patron")
    .eq("company_id", id)
    .neq("estado_revision", "rechazado")
    .eq("impacto", "alto")
    .order("created_at", { ascending: false })
    .limit(3);
  const porRevisar = stats?.hallazgos_por_revisar ?? 0;

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        sub={`${c.sector ?? "sector sin definir"}${ficha?.ciudad ? ` · ${ficha.ciudad}` : ""} · ${ETAPA[c.etapa] ?? c.etapa}`}
        acciones={
          <span className="flex items-center gap-3 flex-wrap">
            <AdministrarEmpresa companyId={id} nombre={c.nombre} sector={c.sector} />
            {ficha?.whatsapp && (
              <a href={`https://wa.me/${ficha.whatsapp.replace(/\D/g, "").replace(/^9/, "519")}`} target="_blank" rel="noreferrer" className="boton boton--secundario" style={{ minHeight: 40 }}>WhatsApp del dueño</a>
            )}
            <a href={`/api/consultor/ver-portal?empresa=${id}`} className="boton boton--secundario" style={{ minHeight: 40 }}>Ver como el empresario</a>
            <Etapa companyId={id} etapa={c.etapa} />
          </span>
        }
      />

      <Admision companyId={id} estado={c.estado_admision} evaluacion={admision?.evaluacion} respuestas={admision} />

      {/* INSTRUMENTOS de la empresa: la franja híbrida, no tarjetas */}
      <div className="mb-5">
        <Franja columnas={4}>
          <Lectura
            divisor={false}
            valor={t.kpis.venta ? soles(t.kpis.venta.valor) : "—"}
            etiqueta={t.kpis.venta ? `ventas · ${t.kpis.venta.estado === "verificado" ? "verificado" : "contado"}` : "ventas sin dato"}
            extra={t.kpis.venta ? <Sparkline serie={t.serieVentas} /> : undefined}
          />
          <Lectura valor={salud != null ? String(salud) : "—"} unidad={salud != null ? "/100" : undefined} etiqueta={salud != null ? "salud con evidencia" : "salud sin diagnóstico"} color={colorSalud} />
          <Lectura valor={String(porRevisar)} etiqueta={porRevisar > 0 ? "hallazgos por revisar" : "bandeja al día"} color={porRevisar > 0 ? "var(--contradicho)" : "var(--tinta)"} />
          <Lectura valor={ficha?.personas ?? "?"} unidad="personas" etiqueta={`${participantes.length} con acceso`} />
        </Franja>
      </div>

      {/* FILA 2 · Mapa de la empresa (4P con puntaje y color) + restricciones */}
      <section className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className="panel p-5">
          <p className="t-etiqueta mb-3">Mapa de tu empresa</p>
          <div className="grid grid-cols-2 gap-3">
            {["personas", "procesos", "producto", "marketing"].map((p) => {
              const d = porPilar[p];
              const color = d ? COLOR_PILAR[d.estado] : "var(--linea)";
              const n = conteo[p] ?? { total: 0, confirmadas: 0 };
              return (
                <Link
                  key={p}
                  href={`/empresa/${id}/diagnostico?pilar=${p}`}
                  className="aparece"
                  style={{ borderRadius: "var(--radio)", border: `1.5px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, var(--papel))`, padding: "14px 16px", textDecoration: "none", display: "block" }}
                >
                  <span className="t-etiqueta" style={{ display: "block" }}>{PILAR[p]}</span>
                  <span className="num-grande" style={{ fontSize: 26, color: d ? color : "var(--grafito)" }}>{d ? PUNTAJE[d.estado] : "—"}</span>
                  <span className="t-dato" style={{ display: "block", color: "var(--grafito)", fontSize: 13 }}>{d ? ESTADO_PILAR[d.estado] : "Sin diagnosticar"} · {n.confirmadas}/{n.total}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="panel p-5">
          <p className="t-etiqueta mb-3">Principales restricciones</p>
          {(restricciones ?? []).length ? (
            <ul className="flex flex-col gap-3">
              {(restricciones ?? []).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3">
                  <Link href={`/empresa/${id}/diagnostico?pilar=${r.pilar}`} className="t-dato" style={{ fontWeight: 550, minWidth: 0 }}>{r.titulo}</Link>
                  <span className="t-dato" style={{ flex: "none", fontSize: 12, fontWeight: 700, color: "var(--contradicho)", border: "1px solid var(--contradicho)", borderRadius: "var(--radio)", padding: "2px 10px" }}>Crítico</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin restricciones de impacto alto todavía.</p>
          )}
          <details className="mt-4">
            <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Cumplimiento legal (Perú) · {ficha?.personas ?? "?"} trabajadores</summary>
            <ul className="lista-editorial mt-2">
              {cumplimientoLegal(Number(ficha?.personas)).map((o) => (
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

      {/* SEGUIMIENTO DE LA CONVERSACIÓN: cómo va el cliente, qué falta y DÓNDE PROFUNDIZAR */}
      {await (async () => {
        const [{ data: respuestas }, { data: abiertas }] = await Promise.all([
          sb.from("interview_responses").select("session_id,bloque,pregunta,respuesta").in("session_id", (sesiones ?? []).map((s) => s.id)),
          sb.from("interview_responses").select("session_id,pregunta").in("session_id", (sesiones ?? []).map((s) => s.id)).is("respuesta", null),
        ]);
        const porSesion = new Map<string, { bloque: string | null; respuesta: string | null }[]>();
        for (const r of respuestas ?? []) {
          if (!porSesion.has(r.session_id)) porSesion.set(r.session_id, []);
          porSesion.get(r.session_id)!.push(r);
        }
        const abiertaPor = new Map((abiertas ?? []).map((a) => [a.session_id, a.pregunta]));
        const SUFICIENCIA = 5;
        const flacos = ["personas", "procesos", "producto", "marketing"]
          .map((p) => ({ pilar: p, confirmadas: conteo[p]?.confirmadas ?? 0 }))
          .filter((x) => x.confirmadas < SUFICIENCIA);
        const conSesiones = (sesiones ?? []).length > 0;
        if (!conSesiones) return null;
        return (
          <section className="panel p-5 mb-4">
            <p className="t-etiqueta mb-3">Seguimiento de la conversación</p>
            <div className="flex flex-col gap-4">
              {(sesiones ?? []).map((s) => {
                const resp = porSesion.get(s.id) ?? [];
                const contestadas = resp.filter((r) => r.respuesta !== null);
                const cob = coberturaSesion(s.tipo, contestadas, ((s as unknown as { bloques_cubiertos?: string[] }).bloques_cubiertos ?? []) as string[]);
                const abierta = abiertaPor.get(s.id);
                const faltan = cob.areas.filter((a) => !a.cubierta);
                return (
                  <div key={s.id} style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="t-dato" style={{ fontWeight: 600 }}>{TIPO_SESION[s.tipo] ?? s.tipo}</span>
                      <span className="t-dato" style={{ color: "var(--grafito)" }}>{contestadas.length} respondidas · {cob.areas.length ? `${cob.areas.filter((a) => a.cubierta).length} de ${cob.areas.length} áreas` : s.estado}</span>
                    </div>
                    {cob.areas.length > 0 && (
                      <div className="flex items-center mt-2" aria-hidden="true">
                        {cob.areas.map((a, i) => (
                          <span key={a.clave} className="flex items-center" style={{ flex: i === cob.areas.length - 1 ? "none" : 1, minWidth: 0 }}>
                            <span title={a.nombre} style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: a.cubierta ? "var(--confirmado)" : "var(--papel)", border: `2px solid ${a.cubierta ? "var(--confirmado)" : "var(--linea)"}` }} />
                            {i < cob.areas.length - 1 && <span style={{ height: 2, flex: 1, background: a.cubierta ? "var(--confirmado)" : "var(--linea)" }} />}
                          </span>
                        ))}
                      </div>
                    )}
                    {abierta && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Parado en: «{abierta.slice(0, 90)}{abierta.length > 90 ? "…" : ""}»</p>}
                    {faltan.length > 0 && (
                      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                        Falta cubrir: <span style={{ color: "var(--tinta)", fontWeight: 550 }}>{faltan.map((f) => f.nombre).join(" · ")}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* DÓNDE PROFUNDIZAR: la evidencia manda — pilares bajo el piso de suficiencia */}
            {flacos.length > 0 && (
              <div className="mt-4 p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
                <p className="t-etiqueta mb-2">Dónde profundizar</p>
                {flacos.map((f) => (
                  <p key={f.pilar} className="t-dato" style={{ marginBottom: 4 }}>
                    <Link href={`/empresa/${id}/entrevista`} style={{ fontWeight: 600, textDecoration: "underline" }}>{PILAR[f.pilar]}</Link>
                    <span style={{ color: "var(--grafito)" }}> — {f.confirmadas} de {SUFICIENCIA} afirmaciones confirmadas: el diagnóstico de esta área pisa débil.</span>
                  </p>
                ))}
                <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Entra a Entrevista y pregunta ahí, o pide al dueño completar esa área en su portal.</p>
              </div>
            )}
          </section>
        );
      })()}

      {/* FILA 3 · Acciones */}
      <section className="panel p-5 mb-4">
        <p className="t-etiqueta mb-3">¿Qué quieres hacer hoy?</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/empresa/${id}/diagnostico`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Diagnosticar</Link>
          <Link href={`/empresa/${id}/afirmaciones?estado=contradicho`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Resolver contradicciones</Link>
          <Link href={`/empresa/${id}/procesos`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Sistematizar procesos</Link>
          <Link href={`/empresa/${id}/plan-estrategico`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Plan estratégico</Link>
          <Link href={`/empresa/${id}/plan`} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Armar el plan</Link>
        </div>
      </section>

      {/* Dónde está en el método (3 capas) */}
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

      <details className="mb-8">
        <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Datos del expediente</summary>
        <section className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6 mt-4">
          {([["Fuentes", stats?.fuentes ?? 0], ["Definiciones", stats?.afirmaciones ?? 0], ["Sin verificar", stats?.sin_verificar ?? 0], ["Contradichas", stats?.contradichas ?? 0], ["Por revisar", porRevisar], ["Tokens", `${Math.round(usados / 1000)}k / ${Math.round((c.tope_tokens ?? 0) / 1000)}k`]] as [string, string | number][]).map(([e, v]) => (
            <div key={e}>
              <p className="t-etiqueta mb-1">{e}</p>
              <p className="t-seccion">{v}</p>
            </div>
          ))}
        </section>
      </details>

      <Participantes companyId={id} participantes={participantes} />
    </>
  );
}

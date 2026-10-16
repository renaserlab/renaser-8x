import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { coberturaSesion } from "@/lib/rules/cobertura";
import { PILAR, TIPO_SESION } from "@/lib/textos";

/**
 * SEGUIMIENTO DE LA CONVERSACIÓN: cómo va cada sesión del cliente, qué áreas faltan cubrir, en qué pregunta quedó
 * parada y DÓNDE PROFUNDIZAR (los pilares con menos de cinco afirmaciones confirmadas: ahí el diagnóstico pisa débil).
 * Movido tal cual del Panorama al Expediente el 16-10-2026, cuando la portada de la empresa pasó a ser el tablero de
 * diagnóstico. La lectura va aparte (leerSeguimiento) para que la página diga «sin sesiones» o «no se pudo leer» con
 * su nombre, en vez de esconder el bloque.
 */

/** Piso de suficiencia: con menos afirmaciones confirmadas en un pilar, el diagnóstico de esa área pisa débil. */
export const SUFICIENCIA = 5;
const PILARES = ["personas", "procesos", "producto", "marketing"] as const;

export type SesionSeguida = { id: string; tipo: string; estado: string; bloques_cubiertos: string[] | null };
export type RespuestaSeguida = { session_id: string; bloque: string | null; pregunta: string | null; respuesta: string | null };
export type DatosSeguimiento = {
  sesiones: SesionSeguida[];
  respuestas: RespuestaSeguida[];
  /** Afirmaciones confirmadas por pilar. */
  confirmadas: Record<string, number>;
};

/** Lo que el seguimiento necesita. null si algo no se pudo leer: no es lo mismo que «sin sesiones». */
export async function leerSeguimiento(companyId: string): Promise<DatosSeguimiento | null> {
  const sb = supabaseAdmin();
  const [sesiones, claims] = await Promise.all([
    sb.from("interview_sessions").select("id,tipo,estado,bloques_cubiertos").eq("company_id", companyId),
    sb.from("claims").select("pilar,estado").eq("company_id", companyId),
  ]);
  if (sesiones.error || claims.error) return null;
  const lista = (sesiones.data ?? []) as SesionSeguida[];
  let respuestas: RespuestaSeguida[] = [];
  if (lista.length) {
    const r = await sb.from("interview_responses").select("session_id,bloque,pregunta,respuesta").in("session_id", lista.map((s) => s.id));
    if (r.error) return null;
    respuestas = (r.data ?? []) as RespuestaSeguida[];
  }
  const confirmadas: Record<string, number> = {};
  for (const c of (claims.data ?? []) as { pilar: string | null; estado: string }[]) {
    if (c.estado !== "confirmado") continue;
    const k = c.pilar ?? "transversal";
    confirmadas[k] = (confirmadas[k] ?? 0) + 1;
  }
  return { sesiones: lista, respuestas, confirmadas };
}

export function SeguimientoConversacion({ companyId, datos }: { companyId: string; datos: DatosSeguimiento }) {
  const porSesion = new Map<string, RespuestaSeguida[]>();
  for (const r of datos.respuestas) porSesion.set(r.session_id, [...(porSesion.get(r.session_id) ?? []), r]);
  const flacos = PILARES.map((p) => ({ pilar: p, confirmadas: datos.confirmadas[p] ?? 0 })).filter((x) => x.confirmadas < SUFICIENCIA);

  return (
    <div className="flex flex-col gap-4" style={{ marginTop: 14 }}>
      {datos.sesiones.map((s) => {
        const resp = porSesion.get(s.id) ?? [];
        const contestadas = resp.filter((r) => r.respuesta !== null);
        // En la pregunta que quedó abierta (la última sin respuesta) es donde se paró la conversación.
        const abierta = resp.filter((r) => r.respuesta === null && r.pregunta).at(-1)?.pregunta ?? null;
        const cob = coberturaSesion(s.tipo, contestadas, s.bloques_cubiertos ?? []);
        const faltan = cob.areas.filter((a) => !a.cubierta);
        return (
          <div key={s.id} style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="t-dato" style={{ fontWeight: 600 }}>{TIPO_SESION[s.tipo] ?? s.tipo}</span>
              <span className="t-dato" style={{ color: "var(--grafito)" }}>
                {contestadas.length} respondidas · {cob.areas.length ? `${cob.areas.filter((a) => a.cubierta).length} de ${cob.areas.length} áreas` : s.estado}
              </span>
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
            {abierta && (
              <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                Parado en: «{abierta.slice(0, 90)}{abierta.length > 90 ? "…" : ""}»
              </p>
            )}
            {faltan.length > 0 && (
              <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                Falta cubrir: <span style={{ color: "var(--tinta)", fontWeight: 550 }}>{faltan.map((f) => f.nombre).join(" · ")}</span>
              </p>
            )}
          </div>
        );
      })}
      {/* DÓNDE PROFUNDIZAR: la evidencia manda — pilares bajo el piso de suficiencia */}
      {flacos.length > 0 && (
        <div className="p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
          <p className="t-etiqueta mb-2">Dónde profundizar</p>
          {flacos.map((f) => (
            <p key={f.pilar} className="t-dato" style={{ marginBottom: 4 }}>
              <Link href={`/empresa/${companyId}/entrevista`} style={{ fontWeight: 600, textDecoration: "underline" }}>{PILAR[f.pilar]}</Link>
              <span style={{ color: "var(--grafito)" }}> — {f.confirmadas} de {SUFICIENCIA} afirmaciones confirmadas: el diagnóstico de esta área pisa débil.</span>
            </p>
          ))}
          <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Entra a Entrevista y pregunta ahí, o pide al dueño completar esa área en su portal.</p>
        </div>
      )}
    </div>
  );
}

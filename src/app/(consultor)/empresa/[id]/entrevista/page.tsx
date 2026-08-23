import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { EntrevistaConsultor } from "@/components/consultor/EntrevistaConsultor";
import { BotonJob } from "@/components/consultor/BotonJob";
import { TIPO_SESION } from "@/lib/textos";
import { hayTranscriptor } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Entrevista guiada. Una sesión a la vez; transcripción al lado. */
export default async function EntrevistaPag({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sesion?: string }> }) {
  const { id } = await params;
  const { sesion } = await searchParams;
  const sb = supabaseAdmin();
  const { data: sesiones } = await sb.from("interview_sessions").select("id,tipo,estado, participants(nombre,puesto,rol)").eq("company_id", id).order("created_at");
  const activa = sesion ?? sesiones?.[0]?.id;
  const { data: resp } = activa ? await sb.from("interview_responses").select("id,pregunta,respuesta,bloque,orden").eq("session_id", activa).order("orden") : { data: [] };
  const { data: kh } = await sb.from("know_how").select("*").eq("company_id", id).order("created_at", { ascending: false });

  return (
    <>
      <Encabezado titulo="Entrevista" sub="El sistema entrevista a las tres versiones de la empresa: documentos, dueño y equipo. La profundidad sale del contraste." />
      {!sesiones?.length ? (
        <Vacio texto="Sin sesiones. Agrega personas en el panorama: cada una recibe sus sesiones y su enlace." accion="Ir al panorama" href={`/empresa/${id}`} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[280px_1fr_1fr]">
          <nav className="flex flex-col gap-1">
            {sesiones.map((s) => {
              const p = s.participants as unknown as { nombre: string; puesto: string | null; rol: string | null } | null;
              return (
                <Link key={s.id} href={`/empresa/${id}/entrevista?sesion=${s.id}`} className="panel p-3" style={{ borderColor: s.id === activa ? "var(--marca)" : "var(--linea)" }}>
                  <div className="t-dato">{p?.nombre}</div>
                  <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>
                    {TIPO_SESION[s.tipo] ?? s.tipo} · {s.estado}
                  </div>
                </Link>
              );
            })}
          </nav>

          <section>{activa && <EntrevistaConsultor companyId={id} sessionId={activa} transcriptor={hayTranscriptor()} />}</section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="t-etiqueta">Transcripción</h2>
              {activa && <BotonJob url={`/api/interviews/${activa}/knowhow`} texto="Minar know-how" secundario />}
            </div>
            <ol className="flex flex-col gap-4">
              {(resp ?? []).map((r) => (
                <li key={r.id}>
                  <p className="t-dato">{r.pregunta}</p>
                  <p className="t-cuerpo" style={{ color: r.respuesta ? "var(--tinta)" : "var(--grafito)" }}>{r.respuesta ?? "(sin responder)"}</p>
                </li>
              ))}
            </ol>
            {(kh ?? []).length > 0 && (
              <>
                <h2 className="t-etiqueta mt-10 mb-3">Know-how minado ({kh!.length})</h2>
                <ul className="flex flex-col gap-3">
                  {kh!.map((k) => (
                    <li key={k.id} className="panel p-3">
                      <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{k.puesto} · destino: {k.destino}</div>
                      {k.situacion && <p className="t-dato mt-1"><strong>Situación:</strong> {k.situacion}</p>}
                      {k.senal && <p className="t-dato"><strong>Señal:</strong> {k.senal}</p>}
                      {k.decision && <p className="t-dato"><strong>Decisión:</strong> {k.decision}</p>}
                      {k.regla_practica && <p className="t-dato"><strong>Regla práctica:</strong> {k.regla_practica}</p>}
                      {k.error_frecuente && <p className="t-dato"><strong>Error frecuente:</strong> {k.error_frecuente}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

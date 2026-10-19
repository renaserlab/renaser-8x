import { contextoOS, NOMBRE_ROL } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cumplimiento, hoyEn, iniciales, minutosTotales, sumarDias, textoDuracion } from "@/lib/os/calculos";
import { registrosDesde, tareasDe } from "@/lib/os/datos";
import { diaDeSemana } from "@/lib/os/dia";
import { NOMBRE_RELACION } from "@/lib/os/evaluaciones";
import { diaEnZona } from "@/lib/revision-semanal";
import { EditarPerfil, Responder360 } from "@/components/os/dia/Perfil";
import { Vacio } from "@/components/base/Vacio";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * MI PERFIL: la ficha de quien entra (nombre, puesto y área los corrige la persona; el rol, la gestión), sus números
 * del mes y las evaluaciones 360 que le toca responder. Lo que otros dijeron de ella no se muestra aquí: lo ve RR.HH.
 */
export default async function PerfilPag() {
  const c = await contextoOS();
  if (!c.persona) {
    return (
      <>
      <h1 className="t-titulo mb-4">Mi perfil</h1>
      <Vacio texto="Estás mirando RENASER OS como consultora: no tienes ficha en el equipo de esta empresa. Las fichas de todos están en «Equipo y talento»." accion="Ver Equipo y talento" href="/os/talento" />
    </>
    );
  }
  const p = c.persona;
  const hoy = hoyEn(c.zona);
  const primero = `${hoy.slice(0, 8)}01`;
  const sb = supabaseAdmin();
  const [tareas, registros, { data: aperturas }, { data: evaluaciones }, { data: companeros }] = await Promise.all([
    tareasDe(c.companyId, [p.id]),
    registrosDesde(c.companyId, new Date(Date.parse(`${sumarDias(primero, -1)}T00:00:00Z`)).toISOString(), [p.id]),
    sb.from("os_aperturas").select("fecha").eq("persona_id", p.id).gte("fecha", primero).lte("fecha", hoy),
    sb.from("os_evaluaciones").select("id,ciclo,evaluado_id,relacion,respondida_at").eq("company_id", c.companyId).eq("evaluador_id", p.id).order("created_at"),
    sb.from("os_personas").select("id,nombre").eq("company_id", c.companyId),
  ]);
  const enMes = (instante: string | null) => {
    const d = instante ? diaEnZona(instante, c.zona) : null;
    return !!d && d >= primero && d <= hoy;
  };
  const completadas = tareas.filter((t) => t.estado === "completada" && enMes(t.completada_at)).length;
  const cumple = cumplimiento(tareas, primero, hoy, hoy, c.zona);
  const minutos = minutosTotales(registros.filter((r) => enMes(r.inicio)));
  let habiles = 0;
  for (let d = primero; d <= hoy; d = sumarDias(d, 1)) if (diaDeSemana(d) <= 5) habiles++;
  const nombreDe = new Map((companeros ?? []).map((x) => [x.id as string, x.nombre as string]));
  const pendientes = (evaluaciones ?? []).filter((e) => !e.respondida_at);
  const respondidas = (evaluaciones ?? []).length - pendientes.length;
  const mes = MESES[Number(hoy.slice(5, 7)) - 1];

  return (
    <>
      <header className="os-d-cabeza">
        <div className="os-d-cabeza__texto" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <span className="os-d-avatar" style={{ width: 56, height: 56, fontSize: 17 }}>{iniciales(p.nombre)}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 className="t-titulo" style={{ margin: 0 }}>{p.nombre}</h1>
            <span className="t-dato os-d-tenue">
              {[NOMBRE_ROL[p.rol], p.puesto, p.area, c.empresa].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      </header>

      <div className="os-d-rejilla">
        <div className="os-d-rejilla__principal">
          <section aria-labelledby="titulo-mes" className="os-d-bloque" style={{ padding: 0 }}>
            <h2 id="titulo-mes" className="t-seccion" style={{ margin: 0 }}>Tu {mes}, hasta hoy</h2>
            <div className="os-d-cifras">
              <div className="os-d-cifra"><span className="t-etiqueta">Tareas completadas</span><span className="os-d-cifra__valor">{completadas}</span></div>
              <div className="os-d-cifra">
                <span className="t-etiqueta">A tiempo</span>
                <span className="os-d-cifra__valor">{cumple.pct != null ? `${cumple.pct}%` : "—"}</span>
                {cumple.pct == null && <span className="t-dato os-d-tenue">Sin tareas que vencieran</span>}
              </div>
              <div className="os-d-cifra"><span className="t-etiqueta">Horas de foco</span><span className="os-d-cifra__valor">{minutos ? textoDuracion(minutos) : "0 min"}</span></div>
              <div className="os-d-cifra"><span className="t-etiqueta">Días que abriste</span><span className="os-d-cifra__valor">{(aperturas ?? []).length} <span className="t-dato os-d-tenue">de {habiles}</span></span></div>
            </div>
          </section>

          <section aria-labelledby="titulo-360" className="os-d-bloque" style={{ padding: 0 }}>
            <h2 id="titulo-360" className="t-seccion" style={{ margin: 0 }}>Evaluaciones 360 que te tocan</h2>
            {pendientes.length ? (
              <>
                <p className="t-dato os-d-tenue" style={{ margin: 0 }}>
                  Tu respuesta es confidencial: la ve RR.HH. junto con las demás, no la persona evaluada.
                </p>
                {pendientes.map((e) => (
                  <Responder360
                    key={e.id}
                    id={e.id}
                    evaluado={e.relacion === "auto" ? "Tú mismo" : (nombreDe.get(e.evaluado_id) ?? "Un compañero")}
                    relacion={`${NOMBRE_RELACION[e.relacion as keyof typeof NOMBRE_RELACION]} · ciclo ${e.ciclo}`}
                  />
                ))}
              </>
            ) : (
              <p className="t-cuerpo os-d-tenue" style={{ margin: 0 }}>
                {respondidas ? `No tienes evaluaciones pendientes. Ya respondiste ${respondidas}.` : "No tienes evaluaciones pendientes."}
              </p>
            )}
          </section>
        </div>

        <aside className="os-d-rejilla__lado">
          <section className="panel os-d-bloque" aria-labelledby="titulo-ficha">
            <h2 id="titulo-ficha" className="t-seccion" style={{ margin: 0 }}>Tu ficha</h2>
            <EditarPerfil nombre={p.nombre} puesto={p.puesto} area={p.area} />
            <p className="t-dato os-d-tenue" style={{ margin: 0 }}>
              Tu rol es «{NOMBRE_ROL[p.rol]}» y tu capacidad, {textoDuracion(p.capacidad_min)} por día. Los cambia la gestión de tu empresa.
              {p.email ? ` Entras con ${p.email}.` : ""}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

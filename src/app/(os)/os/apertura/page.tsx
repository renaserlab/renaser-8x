import Link from "next/link";
import { contextoOS } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { esParaHoy, hoyEn, lunesDe, sumarDias, vieneDeAntes, ordenarTareas, NOMBRE_PRIORIDAD } from "@/lib/os/calculos";
import { tareasDe } from "@/lib/os/datos";
import { desdeCuando, diaDeSemana, fechaLarga, horaLocal, puedeCerrarDia, puedeCerrarSemana, racha, textoHora, viernesDe, HORA_CIERRE_DIA } from "@/lib/os/dia";
import { AbrirDia, type TareaParaHoy } from "@/components/os/dia/AbrirDia";
import { CerrarDia, CerrarSemana } from "@/components/os/dia/Cierres";
import { Vacio } from "@/components/base/Vacio";

export const dynamic = "force-dynamic";

const ANIMO = ["", "muy bajo", "bajo", "normal", "bien", "muy bien"];

/**
 * APERTURA RENASER (prototipo aprobado el 19-10-2026). El ritual de cada día: abrir (ánimo, compromiso y en qué se
 * enfoca), cerrar desde las 17:00 (lo hecho y lo pendiente) y, de viernes a domingo, cerrar la semana. Al lado, cómo
 * fue la semana pasada. Es de cada persona: la consultora, que mira sin ser del equipo, ve un aviso.
 */
export default async function AperturaPag() {
  const c = await contextoOS();
  if (!c.persona) {
    return (
      <>
      <h1 className="t-titulo mb-4">Apertura</h1>
      <Vacio texto="La apertura es de cada persona del equipo. Para ver quién abrió hoy, entra a «Equipo en vivo»." accion="Ver Equipo en vivo" href="/os/equipo" />
    </>
    );
  }
  const persona = c.persona;
  const ahora = new Date();
  const hoy = hoyEn(c.zona, ahora);
  const lunes = lunesDe(hoy);
  const lunesPasado = sumarDias(lunes, -7);
  const sb = supabaseAdmin();
  const [{ data: aperturas }, { data: cierres }, { data: semanal }, tareas] = await Promise.all([
    sb.from("os_aperturas").select("fecha,animo,compromiso,created_at").eq("persona_id", persona.id).gte("fecha", sumarDias(hoy, -120)).order("fecha"),
    sb.from("os_cierres").select("fecha,hecho,pendiente,created_at").eq("persona_id", persona.id).gte("fecha", lunesPasado),
    sb.from("os_cierres_semanales").select("semana,logros,trabas,compromiso").eq("persona_id", persona.id).eq("semana", lunes).maybeSingle(),
    tareasDe(c.companyId, [persona.id]),
  ]);
  const deHoy = (aperturas ?? []).find((a) => a.fecha === hoy) ?? null;
  const cierreHoy = (cierres ?? []).find((x) => x.fecha === hoy) ?? null;
  const diasAbiertos = new Set((aperturas ?? []).map((a) => a.fecha as string));
  const diasCerrados = new Set((cierres ?? []).map((x) => x.fecha as string));
  const seguidos = racha(diasAbiertos, hoy);

  const paraHoy: TareaParaHoy[] = ordenarTareas(tareas.filter((t) => esParaHoy(t, hoy)), hoy).map((t) => {
    const antes = vieneDeAntes(t, hoy);
    return {
      id: t.id,
      titulo: t.titulo,
      tono: antes ? "antes" : "hoy",
      marcada: !antes,
      etiqueta: antes ? `Pendiente desde ${desdeCuando((t.fecha_inicio ?? t.fecha_limite)!, hoy)}` : `Para hoy · ${NOMBRE_PRIORIDAD[t.prioridad].toLowerCase()}`,
    };
  });
  const semanaPasada = [0, 1, 2, 3, 4].map((i) => {
    const dia = sumarDias(lunesPasado, i);
    return { dia, abrio: diasAbiertos.has(dia), cerro: diasCerrados.has(dia) };
  });
  const abiertos = semanaPasada.filter((d) => d.abrio).length;
  const cerrados = semanaPasada.filter((d) => d.cerro).length;
  const sinCierre = semanaPasada.filter((d) => d.abrio && !d.cerro).map((d) => ["el lunes", "el martes", "el miércoles", "el jueves", "el viernes"][diaDeSemana(d.dia) - 1]);
  const nombre = persona.nombre.split(/\s+/)[0];
  const horaActual = horaLocal(ahora, c.zona).h;
  const saludo = horaActual < 12 ? "Buenos días" : horaActual < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <header className="os-d-cabeza">
        <div className="os-d-cabeza__texto">
          <span className="t-rotulo">
            {fechaLarga(hoy)} · {textoHora(ahora, c.zona)}
          </span>
          <h1 className="t-titulo" style={{ margin: 0 }}>
            {saludo}, {nombre}
          </h1>
          <p className="t-cuerpo os-d-tenue" style={{ margin: 0 }}>
            {deHoy ? "Tu día ya está abierto." : "Abre tu día: dos preguntas y eliges en qué te enfocas."}
          </p>
        </div>
        {seguidos > 1 && <span className="os-d-chip os-d-chip--contorno">{seguidos} días hábiles seguidos abriendo tu día</span>}
      </header>

      <div className="os-d-rejilla">
        <div className="os-d-rejilla__principal">
          {deHoy ? (
            <div className="os-d-confirmado" role="status">
              <p>
                Abriste tu día a las {textoHora(deHoy.created_at, c.zona)} · ánimo {deHoy.animo} de 5 ({ANIMO[deHoy.animo]}).
                {deHoy.compromiso ? <span style={{ display: "block", fontWeight: 500, marginTop: 4 }}>Tu compromiso: «{deHoy.compromiso}»</span> : null}
              </p>
              <Link href="/os/mi-trabajo" className="boton">
                Ir a Mi trabajo
              </Link>
            </div>
          ) : (
            <AbrirDia tareas={paraHoy} hora={textoHora(ahora, c.zona)} />
          )}

          {deHoy && (
            <section className="panel os-d-bloque" aria-labelledby="titulo-cierre">
              <h2 className="t-seccion" id="titulo-cierre" style={{ margin: 0 }}>
                Cierre del día
              </h2>
              {cierreHoy ? (
                <p className="t-cuerpo" style={{ margin: 0 }}>
                  Cerraste tu día a las {textoHora(cierreHoy.created_at, c.zona)}. Terminaste: «{cierreHoy.hecho}».
                  {cierreHoy.pendiente ? ` Quedó pendiente: «${cierreHoy.pendiente}».` : ""}
                </p>
              ) : puedeCerrarDia(ahora, c.zona) ? (
                <CerrarDia />
              ) : (
                <>
                  <p className="t-dato os-d-tenue" style={{ margin: 0 }}>
                    Se abre a las {HORA_CIERRE_DIA}:00: qué terminaste, qué quedó pendiente y por qué.
                  </p>
                  <button className="boton boton--secundario" disabled style={{ alignSelf: "flex-start" }}>
                    Cerrar mi día · {HORA_CIERRE_DIA}:00
                  </button>
                </>
              )}
            </section>
          )}
        </div>

        <aside className="os-d-rejilla__lado">
          <section className="panel os-d-bloque" aria-labelledby="titulo-semana-pasada">
            <h2 className="t-seccion" id="titulo-semana-pasada" style={{ margin: 0, fontSize: 16 }}>
              La semana pasada
            </h2>
            <div className="os-d-semana">
              {semanaPasada.map((d, i) => (
                <div key={d.dia} className="os-d-semana__dia">
                  <span>{["L", "M", "X", "J", "V"][i]} {Number(d.dia.slice(8))}</span>
                  <span className={`os-d-marca${d.abrio ? " os-d-marca--abrio" : ""}`} role="img" aria-label={d.abrio ? "Abrió" : "No abrió"} />
                  <span
                    className={`os-d-marca ${d.cerro ? "os-d-marca--cerro" : d.abrio ? "os-d-marca--sin-cierre" : ""}`}
                    role="img"
                    aria-label={d.cerro ? "Cerró" : "Sin cierre"}
                  />
                </div>
              ))}
            </div>
            <div className="os-d-leyenda">
              <span><span className="os-d-marca os-d-marca--abrio" />Abrió</span>
              <span><span className="os-d-marca os-d-marca--cerro" />Cerró</span>
              <span><span className="os-d-marca os-d-marca--sin-cierre" />Sin cierre</span>
            </div>
            <p className="t-dato" style={{ margin: 0 }}>
              {abiertos ? `Abriste ${abiertos} de 5 días y cerraste ${cerrados}.` : "La semana pasada no abriste ningún día."}
              {sinCierre.length ? ` Quedó sin cierre ${unir(sinCierre)}.` : ""}
            </p>
          </section>

          {semanal ? (
            <section className="os-d-bloque--noche" aria-labelledby="titulo-semanal">
              <span className="os-d-rotulo-oro">Esta semana</span>
              <h2 id="titulo-semanal" className="t-seccion" style={{ margin: 0, fontSize: 16 }}>
                Cerraste tu semana
              </h2>
              <p className="t-dato" style={{ margin: 0 }}>Logros: «{semanal.logros}»</p>
              {semanal.compromiso && <p className="t-dato" style={{ margin: 0 }}>Para la próxima: «{semanal.compromiso}»</p>}
            </section>
          ) : puedeCerrarSemana(hoy) ? (
            <section className="panel os-d-bloque" aria-labelledby="titulo-semanal">
              <span className="os-d-chip os-d-chip--contorno" style={{ alignSelf: "flex-start" }}>Hasta el domingo</span>
              <h2 id="titulo-semanal" className="t-seccion" style={{ margin: 0, fontSize: 16 }}>
                Cierre semanal
              </h2>
              <CerrarSemana />
            </section>
          ) : (
            <section className="os-d-bloque--noche" aria-labelledby="titulo-semanal">
              <span className="os-d-rotulo-oro">{fechaLarga(viernesDe(lunes))}</span>
              <h2 id="titulo-semanal" className="t-seccion" style={{ margin: 0, fontSize: 16 }}>
                Cierre semanal
              </h2>
              <p className="t-dato" style={{ margin: 0 }}>
                Logros, trabas y tu compromiso para la semana siguiente. Si no lo haces el viernes, el sábado te lo recordamos.
              </p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function unir(partes: string[]): string {
  return partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

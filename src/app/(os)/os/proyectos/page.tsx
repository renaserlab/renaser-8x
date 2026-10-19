import Link from "next/link";
import { contextoGestionOS } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn, lunesDe, iniciales, textoDia } from "@/lib/os/calculos";
import { personasDeLaEmpresa, tareasDe } from "@/lib/os/datos";
import { avanceDe, estadoProyecto, pideAtencion, lunesAnterior, NOMBRE_ESTADO_PROYECTO, type Proyecto } from "@/lib/os/proyectos";
import { nombreDeSemana } from "@/lib/revision-semanal";
import { EditarObjetivo, Logrado } from "@/components/os/equipo/Objetivo";
import { FormProyecto } from "@/components/os/equipo/FormProyecto";

export const dynamic = "force-dynamic";

type Objetivo = { semana: string; texto: string; meta: number | null; logrado: number; fijado_por: string | null; created_at: string };

/**
 * PROYECTOS Y OBJETIVO DE LA SEMANA (RENASER OS, 19-10-2026). Arriba, lo que la empresa persigue esta semana (uno solo,
 * con su meta y lo logrado); abajo, los proyectos con su avance (sus tareas completadas sobre sus tareas) y su estado
 * calculado. «En riesgo» junta los en riesgo y los atrasados. Solo la gestión.
 */
export default async function Proyectos({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const c = await contextoGestionOS();
  const sp = await searchParams;
  const soloRiesgo = sp.filtro === "riesgo";
  const sb = supabaseAdmin();
  const hoy = hoyEn(c.zona);
  const lunes = lunesDe(hoy);
  const anterior = lunesAnterior(lunes);

  const [personas, tareas, { data: objetivos }, { data: proyectosRaw }] = await Promise.all([
    personasDeLaEmpresa(c.companyId),
    tareasDe(c.companyId),
    sb.from("os_objetivos").select("semana,texto,meta,logrado,fijado_por,created_at").eq("company_id", c.companyId).in("semana", [lunes, anterior]),
    sb.from("os_proyectos").select("id,nombre,descripcion,responsable_id,fecha_entrega,cerrado_at,created_at").eq("company_id", c.companyId).order("created_at"),
  ]);
  const actual = ((objetivos ?? []) as Objetivo[]).find((o) => o.semana === lunes) ?? null;
  const previo = ((objetivos ?? []) as Objetivo[]).find((o) => o.semana === anterior) ?? null;
  const nombreDe = new Map(personas.map((p) => [p.id, p.nombre]));
  const nombreDeCuenta = new Map(personas.filter((p) => p.user_id).map((p) => [p.user_id!, p.nombre]));
  const proyectos = ((proyectosRaw ?? []) as Proyecto[]).map((p) => {
    const avance = avanceDe(tareas.filter((t) => t.proyecto_id === p.id));
    return { ...p, avance, estado: estadoProyecto(p, avance, hoy) };
  });
  const abiertos = proyectos.filter((p) => p.estado !== "cerrado");
  const enRiesgo = abiertos.filter((p) => pideAtencion(p.estado));
  const visibles = soloRiesgo ? enRiesgo : abiertos;
  const cerrados = proyectos.filter((p) => p.estado === "cerrado");
  const pct = actual?.meta ? Math.min(100, Math.round((actual.logrado * 100) / actual.meta)) : null;
  const opciones = personas.map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi equipo · {nombreDeSemana(lunes)}</p>
          <h1 className="t-titulo">Proyectos y objetivo</h1>
        </div>
      </header>

      <section className="os-tarjeta os-tarjeta--noche os-objetivo" aria-label="Objetivo de la semana">
        <div className="os-objetivo__texto">
          <span className="t-rotulo">Objetivo de la semana</span>
          {actual ? (
            <>
              <h2>{actual.texto}</h2>
              <span className="t-dato">
                Lo fijó {actual.fijado_por ? nombreDeCuenta.get(actual.fijado_por) ?? "la gestión" : "la gestión"} · {textoDia(actual.created_at.slice(0, 10))}.
              </span>
            </>
          ) : (
            <h2>Todavía no hay objetivo para esta semana</h2>
          )}
          {previo && (
            <span className="t-dato" style={{ color: "var(--luna-rotulo)" }}>
              La semana pasada: «{previo.texto}»{previo.meta ? ` · ${previo.logrado} de ${previo.meta}${previo.logrado >= previo.meta ? ", logrado" : ""}` : ""}.
            </span>
          )}
          <EditarObjetivo key={actual?.texto ?? "nuevo"} semana={lunes} texto={actual?.texto ?? null} meta={actual?.meta ?? null} />
        </div>
        {actual && (
          <div className="os-objetivo__cifra">
            <span className="os-kpi__cifra" style={{ color: "var(--luna)", fontSize: 44 }}>
              {actual.logrado}{actual.meta ? <small style={{ color: "var(--luna-tenue)" }}> de {actual.meta}</small> : null}
            </span>
            {pct != null && (
              <div className="os-barra os-barra--gruesa os-barra--noche" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
            )}
            {actual.meta ? <span className="t-dato">{actual.logrado >= actual.meta ? "Logrado." : `Faltan ${actual.meta - actual.logrado}.`}</span> : null}
            <Logrado semana={lunes} logrado={actual.logrado} meta={actual.meta} />
          </div>
        )}
      </section>

      <div className="os-cabeza">
        <h2 className="t-seccion">Proyectos</h2>
        <nav className="os-filtros" aria-label="Filtrar proyectos">
          <Link className="os-pildora" href="/os/proyectos" aria-current={!soloRiesgo ? "page" : undefined} scroll={false}>Todos · {abiertos.length}</Link>
          <Link className="os-pildora" href="/os/proyectos?filtro=riesgo" aria-current={soloRiesgo ? "page" : undefined} scroll={false}>En riesgo · {enRiesgo.length}</Link>
        </nav>
      </div>

      {visibles.length === 0 ? (
        <div className="vacio">
          <p className="vacio__texto">{soloRiesgo ? "Ningún proyecto en riesgo. Bien." : "Todavía no hay proyectos. Crea uno abajo y asigna tareas a ese proyecto desde «Mi trabajo»: su avance sale de ahí."}</p>
        </div>
      ) : (
        <div className="os-proyectos">
          {visibles.map((p) => (
            <article key={p.id} className="os-proyecto">
              <div className="os-proyecto__cabeza">
                <h3>{p.nombre}</h3>
                <span className={`os-chip os-chip--${p.estado}`}>{NOMBRE_ESTADO_PROYECTO[p.estado]}</span>
              </div>
              {p.responsable_id && (
                <span className="os-persona">
                  <span className="os-avatar" aria-hidden="true" style={{ width: 30, height: 30 }}>{iniciales(nombreDe.get(p.responsable_id))}</span>
                  <span className="t-dato">{nombreDe.get(p.responsable_id) ?? "—"}</span>
                </span>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between t-dato">
                  <span style={{ color: "var(--grafito)" }}>Avance</span>
                  <b>{p.avance.pct == null ? "Sin tareas" : `${p.avance.pct}%`}</b>
                </div>
                <div className="os-barra" aria-hidden="true"><span style={{ width: `${p.avance.pct ?? 0}%` }} /></div>
              </div>
              <div className="os-proyecto__datos">
                <span>{p.avance.total - p.avance.completadas} {p.avance.total - p.avance.completadas === 1 ? "tarea abierta" : "tareas abiertas"}{p.avance.bloqueadas ? ` · ${p.avance.bloqueadas} bloqueada${p.avance.bloqueadas === 1 ? "" : "s"}` : ""}</span>
                <span>Entrega: {p.fecha_entrega ? textoDia(p.fecha_entrega) : "sin fecha"}</span>
              </div>
              {p.descripcion && <p className="t-dato" style={{ margin: 0, color: "var(--tinta-suave)" }}>{p.descripcion}</p>}
              <details className="os-plegable">
                <summary>Editar o cerrar</summary>
                <FormProyecto personas={opciones} inicial={p} />
              </details>
            </article>
          ))}
        </div>
      )}

      <section className="os-tarjeta">
        <h2 className="t-seccion">Nuevo proyecto</h2>
        <FormProyecto personas={opciones} />
      </section>

      {cerrados.length > 0 && (
        <details className="os-tarjeta os-plegable">
          <summary>Proyectos cerrados · {cerrados.length}</summary>
          {cerrados.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3" style={{ borderTop: "1px solid var(--linea)", paddingTop: 10 }}>
              <b style={{ flex: 1 }}>{p.nombre}</b>
              <span className="t-dato" style={{ color: "var(--grafito)" }}>{p.avance.pct == null ? "Sin tareas" : `${p.avance.pct}%`}</span>
              <details className="os-plegable">
                <summary>Reabrir o editar</summary>
                <FormProyecto personas={opciones} inicial={p} />
              </details>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

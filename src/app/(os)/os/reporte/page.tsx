import Link from "next/link";
import { contextoGestionOS } from "@/lib/os/acceso";
import { hoyEn, lunesDe, sumarDias, textoDia, textoDuracion } from "@/lib/os/calculos";
import { esLunes } from "@/lib/revision-semanal";
import { leerReporte } from "@/lib/os/reporte";

export const dynamic = "force-dynamic";

/**
 * REPORTE SEMANAL, DE LUNES A VIERNES (RENASER OS, 19-10-2026). Por defecto la semana que corre; con ?semana=<lunes>,
 * cualquiera anterior. La matriz alterna horas registradas y tareas terminadas (?vista=tareas); cada celda dice si la
 * persona abrió y cerró ese día. Se descarga en Excel con las mismas cuentas. Solo la gestión.
 */
export default async function Reporte({ searchParams }: { searchParams: Promise<{ semana?: string; vista?: string }> }) {
  const c = await contextoGestionOS();
  const sp = await searchParams;
  const hoy = hoyEn(c.zona);
  const estaSemana = lunesDe(hoy);
  const lunes = sp.semana && esLunes(sp.semana) && sp.semana <= estaSemana ? sp.semana : estaSemana;
  const vista = sp.vista === "tareas" ? "tareas" : "horas";
  const r = await leerReporte(c.companyId, c.zona, lunes, hoy);
  const anterior = sumarDias(lunes, -7);
  const siguiente = sumarDias(lunes, 7);
  const q = (semana: string, v = vista) => `/os/reporte?semana=${semana}${v === "tareas" ? "&vista=tareas" : ""}`;
  const rango = `lunes ${Number(lunes.slice(8))} a viernes ${Number(sumarDias(lunes, 4).slice(8))}`;

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi equipo · {rango}{lunes === estaSemana ? " · esta semana" : ""}</p>
          <h1 className="t-titulo">Reporte semanal</h1>
        </div>
        <div className="os-cabeza__acciones">
          <Link className="boton boton--secundario" href={q(anterior)} aria-label="Semana anterior">← Anterior</Link>
          {lunes < estaSemana && <Link className="boton boton--secundario" href={q(siguiente)} aria-label="Semana siguiente">Siguiente →</Link>}
          <a className="boton" href={`/api/os/reporte/excel?semana=${lunes}`} download>Descargar en Excel</a>
        </div>
      </header>

      <div className="os-kpis">
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Tareas terminadas</span>
          <span className="os-kpi__cifra">{r.terminadas}</span>
          <span className="os-kpi__sub">de lunes a domingo</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Cumplimiento</span>
          <span className={`os-kpi__cifra${r.cumplimiento.pct != null && r.cumplimiento.pct >= 85 ? " os-cifra--bien" : r.cumplimiento.pct != null && r.cumplimiento.pct < 70 ? " os-cifra--atento" : ""}`}>
            {r.cumplimiento.pct == null ? "—" : `${r.cumplimiento.pct}%`}
          </span>
          <span className="os-kpi__sub">{r.cumplimiento.pct == null ? "Ninguna tarea vencía esta semana" : "a tiempo sobre lo que vencía"}</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Horas registradas</span>
          <span className="os-kpi__cifra">{textoDuracion(r.minutos)}</span>
          <span className="os-kpi__sub">con el cronómetro de foco</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Tiempo bloqueado</span>
          <span className={`os-kpi__cifra${r.minutosBloqueado ? " os-cifra--mal" : ""}`}>{textoDuracion(r.minutosBloqueado)}</span>
          <span className="os-kpi__sub">{r.bloqueos ? `en ${r.bloqueos} ${r.bloqueos === 1 ? "bloqueo" : "bloqueos"}` : "sin bloqueos"}</span>
        </div>
        <div className="os-kpi os-kpi--noche">
          <span className="os-kpi__rotulo">Cierre semanal</span>
          <span className="os-kpi__cifra">{r.cierresHechos} <small style={{ color: "var(--luna-tenue)" }}>de {r.filas.length}</small></span>
          <span className="os-kpi__sub">{r.faltanCierre.length ? `Faltan ${r.faltanCierre.slice(0, 3).map((n) => n.split(" ")[0]).join(", ")}${r.faltanCierre.length > 3 ? "…" : ""}` : "Todos cerraron"}</span>
        </div>
      </div>

      <section className="os-tarjeta" aria-label="Día por día">
        <div className="os-cabeza">
          <h2 className="t-seccion">Día por día</h2>
          <nav className="os-pestanas" aria-label="Qué mostrar por día">
            <Link className="os-pestana" href={q(lunes, "horas")} aria-current={vista === "horas" ? "page" : undefined} scroll={false}>Horas</Link>
            <Link className="os-pestana" href={q(lunes, "tareas")} aria-current={vista === "tareas" ? "page" : undefined} scroll={false}>Tareas terminadas</Link>
          </nav>
        </div>
        {r.filas.length === 0 ? (
          <p className="t-cuerpo">Todavía no hay nadie en tu equipo.</p>
        ) : (
          <div className="os-tabla-caja">
            <div className="os-matriz" role="table" aria-label={`Reporte de la semana del ${rango}`}>
              <div className="os-matriz__fila" role="row">
                <span className="os-matriz__cabeza" role="columnheader">Persona</span>
                {r.dias.map((d) => (
                  <span key={d} className="os-matriz__cabeza" role="columnheader">{textoDia(d)}</span>
                ))}
                <span className="os-matriz__cabeza" role="columnheader">Semana</span>
              </div>
              {r.filas.map((f) => (
                <div key={f.persona.id} className="os-matriz__fila" role="row">
                  <span className="os-persona__textos" role="rowheader" style={{ justifyContent: "center", minHeight: 56 }}>
                    <span className="os-persona__nombre">{f.persona.nombre}</span>
                    <span className="os-persona__sub">{f.persona.puesto ?? ""}</span>
                  </span>
                  {f.dias.map((d) => {
                    const futuro = d.dia > hoy;
                    const valor = futuro ? "—" : !d.abrio && !d.minutos && !d.terminadas ? "No abrió" : vista === "horas" ? textoDuracion(d.minutos) : `${d.terminadas} ${d.terminadas === 1 ? "tarea" : "tareas"}`;
                    return (
                      <span key={d.dia} className="os-matriz__celda" role="cell" data-sin-apertura={!d.abrio ? "" : undefined}>
                        {valor}
                        {!futuro && (
                          <span className="os-marcas">
                            <span className={`os-marca${d.abrio ? " os-marca--abrio" : ""}`} aria-label={d.abrio ? "Abrió" : "No abrió"} role="img" />
                            <span className={`os-marca${d.cerro ? " os-marca--cerro" : d.abrio && d.dia < hoy ? " os-marca--sin-cierre" : ""}`} aria-label={d.cerro ? "Cerró" : "Sin cierre"} role="img" />
                          </span>
                        )}
                      </span>
                    );
                  })}
                  <span className="os-matriz__total" role="cell">{vista === "horas" ? textoDuracion(f.minutos) : `${f.terminadas} ${f.terminadas === 1 ? "tarea" : "tareas"}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="os-leyenda">
          <span><span className="os-marca os-marca--abrio" />Abrió el día</span>
          <span><span className="os-marca os-marca--cerro" />Cerró el día</span>
          <span><span className="os-marca os-marca--sin-cierre" />Abrió y no cerró</span>
        </div>
      </section>

      <div className="os-dos">
        <section className="os-tarjeta">
          <h2 className="t-seccion">Lo que más se trabó</h2>
          {r.trabas.length === 0 ? (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguna tarea se bloqueó esta semana.</p>
          ) : (
            r.trabas.map((t, i) => (
              <span key={i} className="os-linea os-linea--roja">
                {t.tarea} · {t.veces} {t.veces === 1 ? "bloqueo" : "bloqueos"}, {textoDuracion(t.minutos)}
                <small>{t.persona}</small>
              </span>
            ))
          )}
        </section>
        <aside>
          <section className="os-tarjeta">
            <h2 className="t-seccion">Dicho en los cierres semanales</h2>
            {r.dichos.length === 0 ? (
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Todavía nadie hizo su cierre de esta semana. Se hace el viernes desde «Apertura».</p>
            ) : (
              r.dichos.map((d, i) => (
                <span key={i} className="os-linea">
                  {d.logros ? `«${d.logros}»` : d.trabas ? `Se trabó: «${d.trabas}»` : `«${d.compromiso}»`}
                  <small>{d.nombre}{d.trabas && d.logros ? ` · se trabó: ${d.trabas}` : ""}{d.compromiso && (d.logros || d.trabas) ? ` · para la próxima: ${d.compromiso}` : ""}</small>
                </span>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

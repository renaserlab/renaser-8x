import Link from "next/link";
import { fechaDia } from "@/lib/medicion";
import { SIN_CONSULTOR, type Compromiso, type FilaCartera } from "@/lib/cartera";
import { AsignarCartera, type Opcion } from "./AsignarCartera";
import { contar } from "./Celda";

const gris = { color: "var(--grafito)" } as const;
const rojo = { color: "var(--contradicho)" } as const;
const aviso = { color: "var(--caducado)" } as const;

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ minWidth: 0 }}>
      <h3 className="t-etiqueta mb-2">{titulo}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

/** «vence el 20 oct 2026, en 3 días», «venció el 2 oct 2026, hace 11 días», «sin fecha». */
export function cuandoVence(c: Pick<Compromiso, "vence_at" | "vencido" | "diasDeAtraso">): string {
  if (!c.vence_at || c.diasDeAtraso == null) return "sin fecha";
  if (c.vencido) return `venció el ${fechaDia(c.vence_at)}, hace ${contar(c.diasDeAtraso, "día", "días")}`;
  if (c.diasDeAtraso === 0) return "vence hoy";
  return `vence el ${fechaDia(c.vence_at)}, en ${contar(-c.diasDeAtraso, "día", "días")}`;
}

function ListaCompromisos({ lista }: { lista: readonly Compromiso[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lista.map((c) => (
        <li key={c.id} className="t-dato" style={{ overflowWrap: "anywhere" }}>
          {c.obligacion}
          <span style={{ display: "block", ...gris }}>en «{c.accion}»</span>
          <span style={{ display: "block", ...(c.vencido ? rojo : c.vence_at ? gris : aviso) }}>{cuandoVence(c)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * EL DETALLE DE UNA EMPRESA EN LA CARTERA: lo que hay detrás de cada cuenta de la fila, con el enlace para ir a
 * decidir, y el formulario para asignar consultor, nivel, alcance y próxima decisión. Aquí tampoco hay
 * porcentajes: listas de cosas con su fecha.
 */
export function DetalleFila({ f, consultores, niveles }: { f: FilaCartera; consultores: readonly Opcion[]; niveles: readonly Opcion[] }) {
  const d = f.proximaDecision;
  const b = f.bloqueos;
  const r = f.resultados;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" style={{ padding: "4px 0 24px" }}>
      <Bloque titulo="Próxima decisión">
        <p className="t-dato" style={{ overflowWrap: "anywhere" }}>{d.texto}</p>
        <p className="t-dato" style={gris}>{d.nota}</p>
        {d.tambien.length > 0 && <p className="t-dato" style={gris}>También en espera: {d.tambien.join("; ")}.</p>}
        {d.sinDato.length > 0 && <p className="t-dato" style={aviso}>No se pudo mirar: {d.sinDato.join(", ")}.</p>}
        {d.origen !== "ninguna" && (
          <p>
            <Link href={d.href} className="t-dato" style={{ color: "var(--marca)" }}>Ir a decidir</Link>
          </p>
        )}
      </Bloque>

      <Bloque titulo="Consultor, nivel y alcance">
        {f.asignacionSinDato ? (
          <p className="t-dato" style={aviso}>{f.asignacionSinDato}</p>
        ) : (
          <>
            <p className="t-dato">{f.consultor ? f.consultor.nombre : SIN_CONSULTOR}{f.consultor && !f.consultor.conocido ? " (ya no figura como consultor)" : ""}</p>
            <p className="t-dato">{f.nivel.nombre}</p>
            <p className="t-dato" style={{ ...(f.alcance ? {} : gris), overflowWrap: "anywhere" }}>{f.alcance ?? "Alcance sin escribir"}</p>
          </>
        )}
        <p className="t-dato" style={gris}>Fase: {f.fase.nombre}. {f.fase.porQue}</p>
      </Bloque>

      <Bloque titulo="Prioridades">
        {f.prioridades.sinDato ? (
          <p className="t-dato" style={aviso}>Sin dato. {f.prioridades.sinDato}</p>
        ) : f.prioridades.cuantas === 0 ? (
          <p className="t-dato" style={gris}>Ninguna prioridad abierta.</p>
        ) : (
          <>
            <p className="t-dato" style={gris}>
              {contar(f.prioridades.abiertas, "abierta", "abiertas")}
              {f.prioridades.limite != null ? ` (el límite de esta empresa es ${f.prioridades.limite})` : ""}
              {f.prioridades.trabadas > 0 ? ` y ${contar(f.prioridades.trabadas, "trabada", "trabadas")}` : ""}.
            </p>
            <ul className="flex flex-col gap-1">
              {f.prioridades.cuales.map((p) => (
                <li key={p.id} className="t-dato" style={{ overflowWrap: "anywhere" }}>
                  {p.accion} <span style={p.estado === "bloqueado" ? rojo : gris}>· {p.estadoNombre}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloque>

      <Bloque titulo="Compromisos de RENASER">
        {f.compromisos.sinDato ? (
          <p className="t-dato" style={aviso}>Sin dato. {f.compromisos.sinDato}</p>
        ) : f.compromisos.lista.length === 0 ? (
          <p className="t-dato" style={gris}>RENASER no tiene obligaciones abiertas en el plan de esta empresa.</p>
        ) : (
          <ListaCompromisos lista={f.compromisos.lista} />
        )}
      </Bloque>

      <Bloque titulo="Compromisos de la empresa">
        {f.compromisos.sinDato ? (
          <p className="t-dato" style={aviso}>Sin dato. {f.compromisos.sinDato}</p>
        ) : f.compromisos.deLaEmpresa.length === 0 ? (
          <p className="t-dato" style={gris}>La empresa no tiene obligaciones abiertas en el plan.</p>
        ) : (
          <ListaCompromisos lista={f.compromisos.deLaEmpresa} />
        )}
      </Bloque>

      <Bloque titulo="Entregas">
        {f.entregas.sinDato ? (
          <p className="t-dato" style={aviso}>Sin dato. {f.entregas.sinDato}</p>
        ) : f.entregas.lista.length === 0 ? (
          <p className="t-dato" style={gris}>Todavía no hay documentos de entrega.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {f.entregas.lista.map((e) => (
              <li key={e.tipo} className="t-dato">
                {e.nombre}
                <span style={{ display: "block", ...gris }}>
                  {e.versionPublicada != null ? `versión ${e.versionPublicada} publicada${e.publicadaEl ? ` el ${fechaDia(e.publicadaEl)}` : ""}` : "sin publicar"}
                  {e.versionPendiente != null ? ` · versión ${e.versionPendiente} pendiente de publicar` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href={`${f.empresa.href}/entrega`} className="t-dato" style={{ color: "var(--marca)" }}>Ver la entrega</Link>
        </p>
      </Bloque>

      <Bloque titulo="Bloqueos">
        <p className="t-dato" style={b.total > 0 ? undefined : gris}>
          {contar(b.acciones, "acción bloqueada", "acciones bloqueadas")}, {contar(b.fuentes, "fuente atascada", "fuentes atascadas")} y {contar(b.trabajos, "trabajo fallido", "trabajos fallidos")}.
        </p>
        {b.masAntiguo && (
          <p className="t-dato" style={{ overflowWrap: "anywhere" }}>
            Lo más antiguo: {b.masAntiguo.texto}
            {b.masAntiguo.desde ? <span style={gris}> (desde el {fechaDia(b.masAntiguo.desde)}{b.masAntiguo.dias != null && b.masAntiguo.dias > 0 ? `, hace ${contar(b.masAntiguo.dias, "día", "días")}` : ""})</span> : null}
          </p>
        )}
        {b.sinDato.length > 0 && <p className="t-dato" style={aviso}>No se pudo mirar: {b.sinDato.join(", ")}. La cuenta es un mínimo.</p>}
      </Bloque>

      <Bloque titulo="Resultados">
        {r.estado === "con_corte" ? (
          <>
            <p className="t-dato">{r.texto}{r.base ? `, contra el punto de partida versión ${r.base.version}` : ""}</p>
            <p className="t-dato" style={{ overflowWrap: "anywhere" }}>{r.titular}</p>
            <p className="t-dato" style={gris}>{r.detalle}</p>
          </>
        ) : (
          <p className="t-dato" style={r.estado === "sin_dato" ? aviso : gris}>{r.estado === "sin_corte" ? "Sin corte. " : ""}{r.detalle}</p>
        )}
        <p>
          <Link href={f.empresa.href} className="t-dato" style={{ color: "var(--marca)" }}>Abrir la empresa</Link>
        </p>
      </Bloque>

      <Bloque titulo="Asignar">
        <AsignarCartera
          companyId={f.empresa.id}
          empresa={f.empresa.nombre}
          guardada={f.guardado}
          consultores={consultores}
          niveles={niveles}
          motivoDeshabilitado={f.asignacionSinDato}
        />
      </Bloque>
    </div>
  );
}

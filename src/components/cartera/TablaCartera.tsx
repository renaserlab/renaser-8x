import { fechaDia } from "@/lib/medicion";
import { NOMBRE_NIVEL, NIVELES, SIN_CONSULTOR, type ConsultorBreve, type FilaCartera, type ProximaDecision } from "@/lib/cartera";
import { ANCHA_FILA, Celda, Encabezados, REJILLA_FILA, ROTULOS, contar } from "./Celda";
import { DetalleFila } from "./DetalleFila";
import type { Opcion } from "./AsignarCartera";

/** «sin dato» nunca se pinta como un cero: lleva su color y su motivo al pasar el cursor. */
function SinDato({ motivo }: { motivo: string }) {
  return <span className="t-dato" title={motivo} style={{ color: "var(--caducado)" }}>sin dato</span>;
}

const gris = { color: "var(--grafito)" } as const;
const rojo = { color: "var(--contradicho)" } as const;
const unaLinea = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/** La fecha de la próxima decisión en una frase: para cuándo es si está escrita, desde cuándo espera si se dedujo. */
export function cuandoDecision(d: ProximaDecision): string | null {
  if (!d.fecha) return null;
  if (d.origen === "escrita") {
    if (d.dias == null) return `para el ${fechaDia(d.fecha)}`;
    if (d.dias < 0) return `venció el ${fechaDia(d.fecha)}, hace ${contar(-d.dias, "día", "días")}`;
    if (d.dias === 0) return "es para hoy";
    return `para el ${fechaDia(d.fecha)}, en ${contar(d.dias, "día", "días")}`;
  }
  if (d.dias == null || d.dias < 0) return `desde el ${fechaDia(d.fecha)}`;
  if (d.dias === 0) return "desde hoy";
  return `espera desde el ${fechaDia(d.fecha)}, hace ${contar(d.dias, "día", "días")}`;
}

/** Por qué una empresa no cuenta como carga, para decirlo junto al nombre. */
function estadoDeEmpresa(f: FilaCartera): string | null {
  if (f.empresa.admision === "rechazada") return "rechazada";
  if (!f.empresa.activa) return "cerrada";
  if (f.empresa.admision === "candidata") return "candidata";
  return null;
}

function Fila({ f, consultores, niveles }: { f: FilaCartera; consultores: readonly Opcion[]; niveles: readonly Opcion[] }) {
  const estado = estadoDeEmpresa(f);
  const cuando = cuandoDecision(f.proximaDecision);
  const d = f.proximaDecision;
  const b = f.bloqueos;
  const r = f.resultados;
  return (
    <li style={{ padding: 0 }}>
      <details className="group">
        <summary className={`grid ${REJILLA_FILA}`} style={{ cursor: "pointer", padding: "14px 0", listStyle: "none" }}>
          <Celda rotulo={ROTULOS[0]} clase={ANCHA_FILA}>
            <span className="t-cuerpo" style={{ fontWeight: 600, display: "block", overflowWrap: "anywhere" }}>
              {f.empresa.nombre}
              {estado && <span className="t-dato" style={gris}> · {estado}</span>}
            </span>
            <span className="t-dato no-imprimir" style={{ color: "var(--marca)" }}>
              <span className="group-open:hidden">Ver detalle</span>
              <span className="hidden group-open:inline">Cerrar detalle</span>
            </span>
          </Celda>

          <Celda rotulo={ROTULOS[1]}>
            {f.asignacionSinDato ? (
              <SinDato motivo={f.asignacionSinDato} />
            ) : (
              <>
                <span className="t-dato" style={{ display: "block", color: f.consultor ? (f.consultor.conocido ? "var(--tinta)" : "var(--contradicho)") : "var(--caducado)" }}>
                  {f.consultor ? f.consultor.nombre : SIN_CONSULTOR}
                </span>
                <span className="t-dato" style={{ display: "block", ...gris }}>{f.nivel.nombre}</span>
                <span className="t-dato" title={f.alcance ?? undefined} style={{ display: "block", ...gris, ...unaLinea }}>{f.alcance ?? "Alcance sin escribir"}</span>
              </>
            )}
          </Celda>

          <Celda rotulo={ROTULOS[2]}>
            <span className="t-dato" title={f.fase.porQue} style={{ display: "block", fontWeight: 600, color: f.fase.clave ? "var(--tinta)" : "var(--caducado)" }}>{f.fase.nombre}</span>
            {f.fase.etapaNombre && <span className="t-dato" style={{ display: "block", ...gris }}>{f.fase.etapaNombre}</span>}
          </Celda>

          <Celda rotulo={ROTULOS[3]} clase={ANCHA_FILA}>
            <span className="t-dato" style={{ display: "block", color: d.origen === "ninguna" ? "var(--grafito)" : "var(--tinta)", overflowWrap: "anywhere" }}>{d.texto}</span>
            {cuando && <span className="t-dato" style={{ display: "block", ...(d.vencida ? rojo : gris) }}>{cuando}</span>}
            {d.tambien.length > 0 && <span className="t-dato" style={{ display: "block", ...gris }}>y {contar(d.tambien.length, "cosa más", "cosas más")} en espera</span>}
          </Celda>

          <Celda rotulo={ROTULOS[4]}>
            {f.prioridades.sinDato ? (
              <SinDato motivo={f.prioridades.sinDato} />
            ) : f.prioridades.cuantas === 0 ? (
              <span className="t-dato" style={gris}>ninguna</span>
            ) : (
              <>
                <span className="t-dato" style={{ display: "block" }}>{contar(f.prioridades.abiertas, "abierta", "abiertas")}</span>
                {f.prioridades.trabadas > 0 && <span className="t-dato" style={{ display: "block", ...rojo }}>{contar(f.prioridades.trabadas, "trabada", "trabadas")}</span>}
              </>
            )}
          </Celda>

          <Celda rotulo={ROTULOS[5]}>
            {f.compromisos.sinDato ? (
              <SinDato motivo={f.compromisos.sinDato} />
            ) : f.compromisos.cuantos === 0 ? (
              <span className="t-dato" style={gris}>ninguno</span>
            ) : (
              <>
                <span className="t-dato" style={{ display: "block" }}>{f.compromisos.cuantos} de RENASER</span>
                {f.compromisos.vencidos > 0 && <span className="t-dato" style={{ display: "block", ...rojo }}>{contar(f.compromisos.vencidos, "vencido", "vencidos")}</span>}
                {f.compromisos.sinFecha > 0 && <span className="t-dato" style={{ display: "block", color: "var(--caducado)" }}>{f.compromisos.sinFecha} sin fecha</span>}
              </>
            )}
          </Celda>

          <Celda rotulo={ROTULOS[6]}>
            {f.entregas.sinDato ? (
              <SinDato motivo={f.entregas.sinDato} />
            ) : f.entregas.lista.length === 0 ? (
              <span className="t-dato" style={gris}>ninguna</span>
            ) : (
              <>
                <span className="t-dato" style={{ display: "block" }}>{contar(f.entregas.publicadas, "publicada", "publicadas")}</span>
                <span className="t-dato" style={{ display: "block", color: f.entregas.pendientes > 0 ? "var(--caducado)" : "var(--grafito)" }}>{contar(f.entregas.pendientes, "pendiente", "pendientes")}</span>
              </>
            )}
          </Celda>

          <Celda rotulo={ROTULOS[7]}>
            {b.total === 0 ? (
              b.sinDato.length ? <SinDato motivo={`No se pudo mirar: ${b.sinDato.join(", ")}.`} /> : <span className="t-dato" style={gris}>ninguno</span>
            ) : (
              <>
                <span className="t-dato" style={{ display: "block", fontWeight: 700, ...rojo }}>{b.total}{b.sinDato.length ? " o más" : ""}</span>
                <span className="t-dato" style={{ display: "block", ...gris }}>
                  {[b.acciones ? contar(b.acciones, "acción", "acciones") : "", b.fuentes ? contar(b.fuentes, "fuente", "fuentes") : "", b.trabajos ? contar(b.trabajos, "trabajo", "trabajos") : ""].filter(Boolean).join(" · ")}
                </span>
              </>
            )}
          </Celda>

          <Celda rotulo={ROTULOS[8]} clase={ANCHA_FILA}>
            {r.estado === "sin_dato" ? (
              <SinDato motivo={r.detalle} />
            ) : r.estado === "sin_corte" ? (
              <span className="t-dato" title={r.detalle} style={gris}>{r.texto}</span>
            ) : (
              <>
                <span className="t-dato" style={{ display: "block" }}>{r.texto}</span>
                <span className="t-dato" style={{ display: "block", ...gris }}>
                  {r.esResultado
                    ? r.cuenta.movidos === 0
                      ? "sin movimiento"
                      : `${contar(r.cuenta.atribuibles, "atribuible", "atribuibles")} · ${r.cuenta.enParte} en parte · ${contar(r.cuenta.observados, "observado", "observados")}`
                    : "todavía no es un resultado"}
                </span>
              </>
            )}
          </Celda>
        </summary>
        <DetalleFila f={f} consultores={consultores} niveles={niveles} />
      </details>
    </li>
  );
}

/**
 * LA CARTERA EN UNA LISTA: una empresa por fila, ya ordenada (primero lo que exige una decisión o está
 * bloqueado). Cada fila se abre con un toque y muestra el detalle de cada cuenta y el formulario para asignar.
 * No hay porcentajes de avance: todo lo que se ve es algo que se contó.
 */
export function TablaCartera({ filas, consultores }: { filas: readonly FilaCartera[]; consultores: readonly ConsultorBreve[] }) {
  const opcionesConsultor: Opcion[] = consultores.map((c) => ({ valor: c.id, nombre: c.nombre?.trim() || c.email || "Consultor sin nombre" }));
  const opcionesNivel: Opcion[] = NIVELES.map((n) => ({ valor: n, nombre: NOMBRE_NIVEL[n] }));
  return (
    <>
      <Encabezados rejilla={REJILLA_FILA} rotulos={ROTULOS} />
      <ul className="lista-editorial">
        {filas.map((f) => (
          <Fila key={f.empresa.id} f={f} consultores={opcionesConsultor} niveles={opcionesNivel} />
        ))}
      </ul>
    </>
  );
}

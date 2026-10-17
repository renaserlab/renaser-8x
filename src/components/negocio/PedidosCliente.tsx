import Link from "next/link";
import { SECCION, abiertas, type Solicitud } from "@/lib/secciones";
import { diaLargo } from "./dato";

/**
 * LO QUE TE PIDIÓ TU CONSULTORA. Solo lo activo, en el orden en que conviene llenarlo: qué es, la nota de la
 * consultora tal cual y «Empezar». Lo ya entregado va abajo, plegado. Lo retirado no existe para el dueño (ni se lee:
 * listarSolicitudes con paraDueno lo filtra en la consulta).
 */
export function PedidosCliente({ solicitudes, zona }: { solicitudes: Solicitud[]; zona?: string }) {
  const activas = abiertas(solicitudes);
  const entregadas = solicitudes
    .filter((s) => s.estado === "completada")
    .sort((a, b) => String(b.completada_at ?? "").localeCompare(String(a.completada_at ?? "")));

  return (
    <>
      {activas.length === 0 ? (
        <p className="t-cuerpo medida">Tu consultora no te ha pedido nada por ahora.</p>
      ) : (
        <ol className="lista-editorial medida">
          {activas.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2">
              <p className="t-seccion">{SECCION[s.seccion].paraDueno}</p>
              {s.nota && <p className="t-cuerpo" style={{ whiteSpace: "pre-line" }}>«{s.nota}»</p>}
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Te lo pidió el {diaLargo(s.activada_at, zona) ?? "día que lo activó"}.</p>
              <div>
                {/* Un solo botón oscuro: el primero, por donde conviene empezar. Los demás, claros. */}
                <Link href={SECCION[s.seccion].href} className={i === 0 ? "boton" : "boton boton--secundario"}>Empezar</Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      {entregadas.length > 0 && (
        <details className="mt-8 medida">
          <summary className="plegado-enlace">
            Ya entregaste ({entregadas.length})
          </summary>
          <ul className="lista-editorial mt-2">
            {entregadas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={SECCION[s.seccion].href} className="t-dato fuerte">{SECCION[s.seccion].paraDueno}</Link>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>Avisaste el {diaLargo(s.completada_at, zona) ?? "—"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

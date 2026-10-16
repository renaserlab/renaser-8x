import Link from "next/link";
import { FILTRO_SIN_ASIGNAR, type CargaConsultor } from "@/lib/cartera";
import { ANCHA_CARGA, Celda, Encabezados, REJILLA_CARGA, ROTULOS_CARGA } from "./Celda";

/** Lo que no existe en la base se dice: nadie ha registrado cuántas empresas puede llevar cada consultor. */
export const NOTA_CAPACIDAD = "Se cuentan empresas activas por consultor. No hay capacidad registrada, así que no se calcula ocupación.";

/** Una cuenta que pide atención se pinta en rojo solo cuando no es cero. */
const rojo = (n: number) => (n > 0 ? "var(--contradicho)" : "var(--tinta)");

/**
 * LA CARGA POR CONSULTOR, arriba de todo: cuántas empresas activas lleva cada uno y, de esas, cuántas esperan
 * una decisión, cuántas tienen algo bloqueado y cuántos compromisos de RENASER ya vencieron. El nombre filtra
 * la cartera por ese consultor. Son cuentas de toda la cartera: no cambian con el filtro.
 */
export function CargaConsultores({ carga, elegido }: { carga: readonly CargaConsultor[]; elegido: string | null }) {
  if (carga.length === 0) {
    return <p className="t-dato" style={{ color: "var(--grafito)" }}>No hay consultores registrados ni empresas que repartir.</p>;
  }
  return (
    <>
      <Encabezados rejilla={REJILLA_CARGA} rotulos={ROTULOS_CARGA} />
      <ul className="lista-editorial">
        {carga.map((c) => {
          const clave = c.id ?? FILTRO_SIN_ASIGNAR;
          const activo = elegido === clave;
          return (
            <li key={clave} className={`grid ${REJILLA_CARGA}`} style={{ padding: "12px 0" }}>
              <Celda rotulo={ROTULOS_CARGA[0]} clase={ANCHA_CARGA}>
                <Link href={`/cartera?consultor=${encodeURIComponent(clave)}`} aria-current={activo ? "true" : undefined} className="t-dato" style={{ color: c.id ? "var(--tinta)" : "var(--caducado)", fontWeight: activo ? 700 : 600 }}>
                  {c.nombre}
                </Link>
                {c.empresas > c.activas && (
                  <span className="t-dato" style={{ color: "var(--grafito)" }}> · {c.empresas - c.activas} cerrada{c.empresas - c.activas === 1 ? "" : "s"} o rechazada{c.empresas - c.activas === 1 ? "" : "s"}</span>
                )}
              </Celda>
              <Celda rotulo={ROTULOS_CARGA[1]}>
                <span className="t-dato" style={{ fontWeight: 700 }}>{c.activas}</span>
              </Celda>
              <Celda rotulo={ROTULOS_CARGA[2]}>
                <span className="t-dato">{c.exigenDecision}</span>
              </Celda>
              <Celda rotulo={ROTULOS_CARGA[3]}>
                <span className="t-dato" style={{ color: rojo(c.conBloqueo) }}>{c.conBloqueo}</span>
              </Celda>
              <Celda rotulo={ROTULOS_CARGA[4]}>
                <span className="t-dato" style={{ color: rojo(c.compromisosVencidos) }}>{c.compromisosVencidos}</span>
              </Celda>
              <Celda rotulo={ROTULOS_CARGA[5]}>
                <span className="t-dato">{c.prioridades}</span>
              </Celda>
            </li>
          );
        })}
      </ul>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{NOTA_CAPACIDAD}</p>
    </>
  );
}

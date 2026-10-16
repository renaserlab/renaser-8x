import Link from "next/link";
import type { SemanaCliente as Datos } from "@/lib/revision-semanal";

function Bloque({ titulo, frases, vacio, color }: { titulo: string; frases: string[]; vacio: string; color: string }) {
  return (
    <section className="panel p-5" style={{ borderTop: `2.5px solid ${color}` }}>
      <h2 className="t-seccion">{titulo}</h2>
      {frases.length === 0 ? (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{vacio}</p>
      ) : (
        <ul className="lista-editorial mt-2 flex flex-col gap-2">
          {frases.map((f, i) => <li key={i} className="t-cuerpo">{f}</li>)}
        </ul>
      )}
    </section>
  );
}

/**
 * «ESTA SEMANA», VISTA POR EL DUEÑO. Tres bloques en frases cortas y sin culpa: qué se esperaba de ti y de tu
 * equipo, qué se hizo, qué falta. Lo que falta trae el siguiente paso, no un reproche. Sin jerga: aquí no hay
 * «KPI» ni «baseline»; se dice indicador y punto de partida. Y siempre la línea que separa trabajo cumplido
 * de resultado del negocio.
 */
export function SemanaCliente({ datos }: { datos: Datos }) {
  if (datos.vacia) {
    return (
      <div className="panel p-5" style={{ background: "var(--suave)" }}>
        <p className="t-cuerpo">Todavía no hay acciones ni indicadores acordados para tu empresa, así que esta semana no tiene nada que revisar.</p>
        <Link href="/portal/plan" className="boton boton--secundario mt-4">Ver tu plan</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo="Qué se esperaba de ti y de tu equipo" frases={datos.esperado} vacio="Nada tenía fecha esta semana." color="var(--marca)" />
      <Bloque titulo="Qué se hizo" frases={datos.hecho} vacio="No quedó registrado nada esta semana. Si hiciste algo, márcalo en Tu plan o anota el valor en Tus indicadores." color="var(--confirmado)" />
      <Bloque titulo="Qué falta" frases={datos.falta} vacio="Nada pendiente de lo que tenía fecha esta semana." color="var(--caducado)" />
      <p className="t-dato panel p-3" style={{ borderLeft: "3px solid var(--marca)", color: "var(--grafito)" }}>{datos.resultado}</p>
      {datos.explicacion && (
        <section className="panel p-5">
          <h2 className="t-seccion">Lo que dice la consultora</h2>
          <p className="t-cuerpo mt-2" style={{ whiteSpace: "pre-wrap" }}>{datos.explicacion}</p>
        </section>
      )}
      {datos.siguiente && (
        <section className="panel p-5">
          <h2 className="t-seccion">La semana que viene</h2>
          <p className="t-cuerpo mt-2" style={{ whiteSpace: "pre-wrap" }}>{datos.siguiente}</p>
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/portal/plan" className="boton boton--secundario">Ir a Tu plan</Link>
        <Link href="/portal/kpis" className="boton boton--secundario">Ir a Tus indicadores</Link>
      </div>
    </div>
  );
}

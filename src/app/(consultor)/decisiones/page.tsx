import Link from "next/link";
import { Encabezado } from "@/components/base/Vacio";
import { listarDecisiones, balanceDeCorrecciones, type Decision } from "@/lib/decisiones";
import { ordenarCola, type EnCola } from "@/lib/decisiones-cola";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * LA COLA DE DECISIONES: UNA, NO VEINTE (13-11-2026).
 *
 * Antes esto era una tabla de veinte filas iguales —«pendiente», «pendiente», «pendiente»— con una
 * columna en ámbar que decía «le falta 1». Kelin la abría y la cerraba: «necesito que me ayude a tomar
 * decisiones, nada de eso tengo». Una lista de pendientes con un reproche al lado no ayuda a decidir.
 *
 * Ahora la pantalla hace tres cosas y ninguna más: pone DELANTE la que toca ahora y dice por qué ésa;
 * deja las siguientes en una línea cada una, para que se sepa que están pero no compitan; y aparta las
 * que todavía no son decisiones —sin dos caminos o sin evidencia— con el motivo escrito, que es
 * trabajo pendiente del sistema, no de la consultora.
 *
 * El orden lo decide src/lib/decisiones-cola.ts y no se inventa ninguna cifra: sale del texto que la
 * propia decisión ya traía.
 */

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE");

/** El sello de la confianza. El oro no entra aquí: es marca, no estado (spec §1.3). */
const SELLO_CONFIANZA: Record<string, "ok" | "espera" | "alto"> = { alta: "ok", media: "espera", baja: "alto" };

function Caminos({ d }: { d: Decision }) {
  const elegida = (d.recomendacion ?? "").trim()[0]?.toUpperCase();
  return (
    <ol className="caminos">
      {d.alternativas.map((a) => {
        const esta = a.clave.toUpperCase() === elegida;
        return (
          <li key={a.clave} className={`camino${esta ? " camino--elegido" : ""}`}>
            <span className="camino__clave" aria-hidden="true">{a.clave}</span>
            <span>
              {a.titulo}
              {esta && <span className="camino__sello"> · lo que 8X recomienda</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LaDeHoy({ x, empresa, porQue }: { x: EnCola<Decision>; empresa: string; porQue: string | null }) {
  const d = x.decision;
  return (
    <section className="decision-hoy" aria-labelledby="dh-titulo">
      <p className="decision-hoy__empresa">{empresa}</p>
      <h2 id="dh-titulo" className="t-titulo decision-hoy__titulo">{d.titulo}</h2>

      {/* Por qué ahora, con la cifra que el propio texto nombra. No se calcula nada: se cita. */}
      <p className="decision-hoy__ancla">
        {x.cifra !== null && <strong>{soles(x.cifra)} · </strong>}
        {d.por_que_ahora}
      </p>

      <h3 className="t-rotulo">LOS CAMINOS</h3>
      <Caminos d={d} />

      <h3 className="t-rotulo">LO QUE 8X RECOMIENDA</h3>
      <p className="t-seccion decision-hoy__rec">{d.recomendacion}</p>
      {d.recomendacion_por_que && <p className="decision-hoy__porque">{d.recomendacion_por_que}</p>}

      <div className="decision-hoy__pie">
        <span className={`estado ${SELLO_CONFIANZA[x.confianza.nivel] ?? "espera"}`}>confianza {x.confianza.nivel}</span>
        <span className="t-dato decision-hoy__confianza">{x.confianza.porque}</span>
      </div>

      {d.faltantes.length > 0 && (
        <div className="decision-hoy__pregunta">
          <h3 className="t-rotulo">ANTES DE APROBAR, PREGÚNTALE ESTO</h3>
          <ul>{d.faltantes.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      <div className="decision-hoy__acciones">
        <Link href={`/decisiones/${d.id}`} className="boton">Decidir ésta</Link>
        {porQue && <span className="t-dato decision-hoy__por-que">{porQue}</span>}
      </div>
      {/* Lo que aprobar hace HOY, dicho sin adornos: deja constancia. Todavía no escribe el plan. */}
      <p className="nota decision-hoy__alcance">
        Al decidir queda constancia de qué elegiste y por qué. Escribir la acción en el plan todavía es un paso aparte.
      </p>
    </section>
  );
}

export default async function Decisiones() {
  const [filas, balance, { data: empresas }] = await Promise.all([
    listarDecisiones(undefined, "pendiente"),
    balanceDeCorrecciones(),
    supabaseAdmin().from("companies").select("id,nombre"),
  ]);
  const nombre = new Map((empresas ?? []).map((e) => [e.id, e.nombre]));
  const deQuien = (d: Decision) => nombre.get(d.company_id) ?? "—";
  const cola = ordenarCola(filas);
  const total = filas.length;

  return (
    <>
      <Encabezado
        titulo="Decisiones"
        sub={
          total === 0
            ? "Ninguna espera tu criterio ahora mismo."
            : `${total} esperan tu criterio. Ésta es la que toca; las demás están abajo y no se van a ningún lado.`
        }
      />

      {total === 0 ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Aparecen aquí cuando un agente propone algo que necesita tu criterio — no cuando hace su trabajo rutinario
          ya autorizado.
        </p>
      ) : (
        <>
          {cola.hoy && <LaDeHoy x={cola.hoy} empresa={deQuien(cola.hoy.decision)} porQue={cola.porQueEsaPrimero} />}

          {cola.siguen.length > 0 && (
            <section className="cola-resto" aria-label="Las que siguen">
              <h2 className="t-seccion">Después de ésta</h2>
              <ul className="cola-lista">
                {cola.siguen.map((x) => (
                  <li key={x.decision.id}>
                    <Link href={`/decisiones/${x.decision.id}`} className="cola-fila">
                      <span className="cola-fila__empresa">{deQuien(x.decision)}</span>
                      <span className="cola-fila__titulo">{x.decision.titulo}</span>
                      <span className="cola-fila__cifra t-dato">{x.cifra !== null ? soles(x.cifra) : "sin cifra"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cola.trabadas.length > 0 && (
            <section className="cola-resto" aria-label="Las que todavía no se pueden decidir">
              <h2 className="t-seccion">Todavía no son decisiones</h2>
              <p className="t-dato medida" style={{ color: "var(--grafito)", margin: "4px 0 12px" }}>
                Les falta algo que tiene que poner el sistema, no tú. Hasta entonces no se te piden.
              </p>
              <ul className="cola-lista">
                {cola.trabadas.map((x) => (
                  <li key={x.decision.id}>
                    <Link href={`/decisiones/${x.decision.id}`} className="cola-fila cola-fila--trabada">
                      <span className="cola-fila__empresa">{deQuien(x.decision)}</span>
                      <span className="cola-fila__titulo">{x.decision.titulo}</span>
                      <span className="cola-fila__motivo t-dato">{x.trabada[0]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* El balance de correcciones vive al pie: importa para medir al sistema, no para decidir hoy. */}
      <p className="nota cola-balance">
        {balance.total === 0
          ? "Todavía no has corregido al sistema ninguna vez: cuando lo hagas, aquí se verá si corregir sirvió."
          : `Corregiste al sistema ${balance.total} ${balance.total === 1 ? "vez" : "veces"} · ${balance.conResultado} con resultado ya observado, ${balance.sinResultado} sin observar.`}
      </p>
    </>
  );
}

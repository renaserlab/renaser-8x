import Link from "next/link";
import { Encabezado, Dato } from "@/components/base/Vacio";
import { agentesEnTorre, ejecuciones, totales, TOPE_LISTA, estadoCola, fuentesAtascadas, HORAS_ATASCADA } from "@/lib/torre";
import { FichaAgente, ListaEjecuciones, Cobertura, NoSonAgentes } from "@/components/consultor/Torre";
import { BotonReencolarPausados, BotonReintentarExtraccion } from "./Acciones";

export const dynamic = "force-dynamic";

const miles = (n: number) => n.toLocaleString("es-PE");
const horaLima = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

/**
 * LA TORRE DE CONTROL. Dos vistas que no se mezclan (§7) y cuatro unidades que no se confunden:
 * trabajos, reintentos, llamadas al modelo y agentes. Cada número dice de qué es.
 */
export default async function Torre({ searchParams }: { searchParams: Promise<{ vista?: string; estado?: string; agente?: string }> }) {
  const sp = await searchParams;
  const vista = sp.vista === "ejecuciones" ? "ejecuciones" : "configurado";

  const [t, { agentes, noSonAgentes }, cola, atascadas] = await Promise.all([totales(), agentesEnTorre(), estadoCola(), fuentesAtascadas()]);
  const lista = vista === "ejecuciones" ? await ejecuciones(TOPE_LISTA, { estado: sp.estado, agente: sp.agente }) : null;
  const nunca = agentes.filter((a) => a.real === null).length;

  return (
    <>
      <Encabezado
        titulo="Torre de control"
        sub="Cómo está trabajando tu consultora. Una vista es lo que el sistema tiene CONFIGURADO; la otra, lo que OCURRIÓ. No es lo mismo y aquí no se mezclan."
        acciones={
          <>
            <Link href="/torre" className={`boton ${vista === "configurado" ? "" : "boton--secundario"}`}>Sistema configurado</Link>
            <Link href="/torre?vista=ejecuciones" className={`boton ${vista === "ejecuciones" ? "" : "boton--secundario"}`}>Ejecución real</Link>
          </>
        }
      />

      {/* CUATRO UNIDADES, CADA UNA DICIENDO DE QUÉ ES. */}
      <section className="fila-numeros" style={{ marginBottom: 12 }}>
        <div>
          <div className="t-etiqueta">Trabajos</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{miles(t.trabajos)}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>{miles(t.trabajosHechos)} hechos · {t.trabajosEnCurso} en curso</div>
        </div>
        <div>
          <div className="t-etiqueta">Trabajos fallidos</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: t.trabajosFallidos > 0 ? "var(--caducado)" : "var(--confirmado)" }}>{miles(t.trabajosFallidos)}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>de {miles(t.trabajos)} trabajos</div>
        </div>
        <div>
          <div className="t-etiqueta">Reintentos</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{miles(t.reintentos)}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>en {t.trabajosConReintento} trabajos · no son trabajos nuevos</div>
        </div>
        <div>
          <div className="t-etiqueta">Llamadas al modelo</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{miles(t.llamadasModelo)}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>
            {t.llamadasConError} con error · {(t.llamadasModelo / Math.max(t.trabajos, 1)).toFixed(1)} por trabajo
          </div>
        </div>
        <div>
          <div className="t-etiqueta">Con registro recuperable</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {t.agentesConRegistroRecuperable} <span style={{ fontSize: 15, color: "var(--grafito)" }}>de {t.agentesConContrato}</span>
          </div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>{nunca} sin ejecuciones recuperables — no es lo mismo que «nunca corrieron»</div>
        </div>
      </section>

      <Cobertura cobertura={t.cobertura} />
      {noSonAgentes.length > 0 && <NoSonAgentes filas={noSonAgentes} />}

      {/* LA COLA Y EL PROVEEDOR: si hay crédito, quién espera por él y qué se puede recuperar. */}
      <section className="panel" style={{ marginTop: 20, borderTop: `2.5px solid ${cola.circuito.abierto ? "var(--caducado)" : "var(--confirmado)"}` }}>
        <h2 className="t-seccion mb-1">La cola y el proveedor</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
          Cuando el proveedor se queda sin crédito, la cola entera espera (circuito «{cola.circuito.clave}») en vez de gastar los intentos
          de cada trabajo. Un trabajo que espera no es un trabajo fallido; uno que falló por crédito se puede reencolar sin perder nada.
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <Dato
            etiqueta="Circuito de crédito"
            valor={
              cola.circuito.abierto ? (
                <span style={{ color: "var(--caducado)", fontWeight: 600 }}>ABIERTO · la cola espera hasta {horaLima(cola.circuito.cortadoHasta)}</span>
              ) : (
                <span style={{ color: "var(--confirmado)", fontWeight: 600 }}>cerrado · la cola trabaja</span>
              )
            }
          />
          <Dato etiqueta="Trabajos que esperan" valor={`${miles(cola.pendientes)} pendientes · ${miles(cola.devueltosPorPausa)} devueltos por la pausa`} />
          <Dato
            etiqueta="Perdidos por crédito, sin reencolar"
            valor={`${miles(cola.fallidosReencolables)}${cola.fallidosReencolables >= cola.topeFallidos ? ` (tope de ${cola.topeFallidos}: puede haber más)` : ""}`}
          />
          <Dato etiqueta="Última anotación del circuito" valor={horaLima(cola.circuito.actualizadoAt)} />
        </div>
        <div className="no-imprimir" style={{ marginTop: 14 }}>
          <BotonReencolarPausados cuantos={cola.fallidosReencolables} />
        </div>
      </section>

      {/* FUENTES ATASCADAS: un documento de funciones de una empresa cliente estuvo 16 días en «leyendo» sin que nadie lo viera. */}
      <section style={{ marginTop: 20 }}>
        <h2 className="t-seccion mb-1">Fuentes atascadas en lectura ({atascadas.length})</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 10 }}>
          Fuentes en estado «leyendo» desde hace más de {HORAS_ATASCADA} horas sin un trabajo de extracción vivo. Reintentar archiva las
          afirmaciones anteriores (no las borra) y vuelve a leer.
        </p>
        {atascadas.length === 0 ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguna. Todo lo que está en «leyendo» tiene un trabajo reciente detrás.</p>
        ) : (
          <ul className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {atascadas.map((f) => (
              <li key={f.id} className="panel flex flex-wrap items-center gap-3" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="t-dato" style={{ fontWeight: 600 }}>{f.nombre}</div>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>
                    <Link href={`/empresa/${f.companyId}`}>{f.empresa ?? f.companyId.slice(0, 8)}</Link> · {miles(f.horas)} h en «leyendo» desde {horaLima(f.desde)}
                  </div>
                </div>
                <BotonReintentarExtraccion sourceId={f.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {vista === "configurado" ? (
        <section style={{ marginTop: 28 }}>
          <h2 className="t-seccion mb-1">Los agentes, con la configuración que el código impone</h2>
          <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 16 }}>
            No es una descripción escrita a mano: sale del contrato que se aplica en cada llamada. Si un presupuesto dice 4.000, es porque
            el código recorta ahí. Debajo de cada ficha, lo medido — y las <strong>llamadas al modelo</strong> de un agente no son
            <strong> trabajos</strong>: el contrastador hizo 1.149 llamadas en 52 trabajos.
          </p>
          <div className="flex flex-col gap-4">
            {agentes.map((a) => (
              <FichaAgente key={a.contrato.clave} agente={a} />
            ))}
          </div>
        </section>
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 className="t-seccion mb-1">Lo que ocurrió</h2>
          <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
            {lista!.filas.length === 0
              ? "No hay trabajos con ese filtro."
              : `${lista!.filas.length} trabajos. Abre uno para ver sus llamadas al modelo, su resultado y qué NO quedó registrado.`}
          </p>
          <div className="no-imprimir flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
            <Link href="/torre?vista=ejecuciones" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }}>Todos</Link>
            <Link href="/torre?vista=ejecuciones&estado=fallido" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }}>Solo fallidos</Link>
            <Link href="/torre?vista=ejecuciones&estado=pendiente" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }}>Pendientes</Link>
          </div>
          <Cobertura cobertura={lista!.cobertura} />
          <div style={{ marginTop: 14 }}>
            <ListaEjecuciones filas={lista!.filas} />
          </div>
        </section>
      )}
    </>
  );
}

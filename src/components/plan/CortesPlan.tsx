"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";
import { indicadoresLegibles } from "@/lib/plan-reglas";
import { faltaEnPeriodo, periodoDeCorte, fechaDia, diaEnZona } from "@/lib/medicion";

export type Corte = { id: string; numero: number; fecha: string; que_se_hizo: string | null; que_se_trabo: string | null; indicadores: unknown; regresiones: unknown };

/**
 * LOS CORTES QUINCENALES, que antes vivían dentro de Plan.tsx. Se conservan aquí para que la pantalla del
 * plan no pierda la vista: qué se hizo, qué se trabó y qué indicador se movió. El resultado empresarial se
 * lee aquí y en la comparación contra el punto de partida, no en el estado de las acciones.
 *
 * EL PERÍODO SE PIDE AQUÍ TAMBIÉN (13-10-2026). Este es el camino de la consultora, y no preguntaba de qué
 * fechas eran los números: cada corte registrado desde el plan congelaba su medición sin período y quedaba
 * «sin veredicto» para siempre, sin que nadie lo dijera. Ahora se piden las dos fechas, viajan con el corte
 * y, si aun así se registra sin ellas, se dice antes (bajo las cajas) y después (el aviso que devuelve la ruta).
 */
export function CortesPlan({ companyId, cortes, puedeRegistrar }: { companyId: string; cortes: Corte[]; puedeRegistrar: boolean }) {
  const router = useRouter();
  const [corte, setCorte] = useState({ que_se_hizo: "", que_se_trabo: "", indicadores: "" });
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Lo que la ruta avisa después de guardar: el corte quedó, pero hay algo que saber de él. */
  const [avisos, setAvisos] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  // Sin ninguna fecha el corte se puede registrar (un corte sin números no mide nada), pero se avisa. Con una
  // sola, o al revés, no se manda: un período a medias no es un período.
  const sinPeriodo = !desde && !hasta;
  // Tampoco un período que termina en un día que todavía no llega (igual que en la pantalla del dueño). El día
  // de hoy solo se calcula cuando ya hay alguna fecha escrita: nada cambia al pintar la pantalla vacía.
  const faltaPeriodo = sinPeriodo ? null : faltaEnPeriodo(desde, hasta, diaEnZona());

  const registrar = async () => {
    // El período entero, nada (sin fechas) o null si está a medias: con null no se manda el corte.
    const periodo = periodoDeCorte(desde, hasta);
    if (periodo === null) return;
    setError(null);
    setAvisos([]);
    setTrabajando(true);
    try {
      const r = await pedir<{ aviso_periodo?: string; medicion?: { aviso?: string } | null } | null>(`/api/companies/${companyId}/close`, {
        json: { corte: { ...corte, indicadores: corte.indicadores ? { texto: corte.indicadores } : null, ...periodo } },
      });
      // Guardado no es lo mismo que guardado sin reparos: lo que la ruta avisa se deja a la vista.
      setAvisos([r?.aviso_periodo, r?.medicion?.aviso].filter((a): a is string => Boolean(a)));
      setCorte({ que_se_hizo: "", que_se_trabo: "", indicadores: "" });
      setDesde("");
      setHasta("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el corte.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="t-seccion mb-3">Cortes quincenales</h2>
      {cortes.length === 0 ? (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Ningún corte registrado.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-4 lista-editorial">
          {cortes.map((c) => {
            // Texto, pares «Nombre: valor» o una frase que dice a quién pedir el detalle; nunca el JSON crudo.
            const indicadores = indicadoresLegibles(c.indicadores, puedeRegistrar ? "consultor" : "cliente");
            return (
              <li key={c.id} className="panel p-4">
                <div className="t-etiqueta">Corte {c.numero} · {fechaCorta(c.fecha)}</div>
                {c.que_se_hizo && <p className="t-cuerpo mt-1"><strong>Se hizo:</strong> {c.que_se_hizo}</p>}
                {c.que_se_trabo && <p className="t-cuerpo"><strong>Se trabó:</strong> {c.que_se_trabo}</p>}
                {indicadores && <p className="t-dato" style={{ color: "var(--grafito)" }}>{indicadores.legible ? `Indicadores: ${indicadores.texto}` : `${indicadores.texto}.`}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {puedeRegistrar && (
        <div className="panel p-4 flex flex-col gap-3">
          <input className="campo" placeholder="Qué se hizo" aria-label="Qué se hizo" value={corte.que_se_hizo} onChange={(e) => setCorte({ ...corte, que_se_hizo: e.target.value })} />
          <input className="campo" placeholder="Qué se trabó" aria-label="Qué se trabó" value={corte.que_se_trabo} onChange={(e) => setCorte({ ...corte, que_se_trabo: e.target.value })} />
          <input className="campo" maxLength={2000} placeholder="Qué indicador se movió (y cuánto)" aria-label="Qué indicador se movió (y cuánto)" value={corte.indicadores} onChange={(e) => setCorte({ ...corte, indicadores: e.target.value })} />
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="t-cuerpo" style={{ fontWeight: 550, padding: 0 }}>¿De qué fechas son los números de este corte?</legend>
            <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
              El corte congela los números que la empresa tiene hoy. Sin saber de qué fechas son, no se puede comparar con el punto de partida.
            </p>
            <div className="flex gap-3 flex-wrap mt-2">
              <label className="t-dato" style={{ color: "var(--grafito)" }}>
                Desde el día
                <input className="campo" type="date" aria-label="Desde qué día son los números del corte" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ display: "block" }} />
              </label>
              <label className="t-dato" style={{ color: "var(--grafito)" }}>
                hasta el día
                <input className="campo" type="date" aria-label="Hasta qué día son los números del corte" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ display: "block" }} />
              </label>
            </div>
            {faltaPeriodo && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{faltaPeriodo}</p>}
            {sinPeriodo && (
              <p className="t-dato mt-2 medida" style={{ color: "var(--caducado)" }}>
                Sin fechas, el corte se guarda igual, pero sus números quedan como observados y sin veredicto: no se podrá decir si el negocio mejoró.
              </p>
            )}
            {!sinPeriodo && !faltaPeriodo && (
              <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Se guardan como los números del {fechaDia(desde)} al {fechaDia(hasta)}.</p>
            )}
          </fieldset>
          <button className="boton boton--secundario" onClick={registrar} disabled={trabajando || faltaPeriodo != null || (!corte.que_se_hizo && !corte.que_se_trabo)}>{trabajando ? "Registrando" : "Registrar corte"}</button>
          {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
          {avisos.map((a) => (
            <p key={a} className="t-dato medida" style={{ color: "var(--caducado)", fontWeight: 600 }} role="status">{a}</p>
          ))}
        </div>
      )}
    </section>
  );
}

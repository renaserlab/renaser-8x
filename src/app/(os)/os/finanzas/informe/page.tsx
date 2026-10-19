import Link from "next/link";
import { contextoFinanzas } from "@/lib/fin/acceso";
import { hoyEn } from "@/lib/os/calculos";
import { NUMERO_DE_DESTINO, nombreDeMes, sumarMeses, textoMonto, totalesPorMoneda, type Moneda } from "@/lib/fin/calculos";
import { cargarInforme, cifrasDelMes, estadoDelMes, fechaCorta, gastosPorCategoria, mesPedido, noEsVentaNiGasto, variacion, type FilaPorCategoria } from "@/lib/fin/caja";
import { PestanasFinanzas } from "@/components/fin/PestanasFinanzas";

export const dynamic = "force-dynamic";

/** «−S/ 1,200» para lo negativo: textoMonto no lleva signo. */
const conSigno = (v: number, m: Moneda = "PEN") => `${v < 0 ? "−" : ""}${textoMonto(Math.abs(v), m)}`;

/**
 * «Sube 12 % vs septiembre» o «Igual que septiembre». Si el mes anterior fue cero no hay porcentaje: se dice cuánto fue;
 * si no tuvo movimientos, que no hay con qué comparar.
 */
function textoVariacion(actual: number, antes: number | null | undefined, mesAnterior: string): string {
  const nombre = nombreDeMes(mesAnterior, false);
  if (antes == null) return `Sin ${nombre} para comparar`;
  const v = variacion(actual, antes);
  if (v == null) return `En ${nombre}: ${conSigno(antes)}`;
  if (v === 0) return `Igual que ${nombre}`;
  return `${v > 0 ? "Sube" : "Baja"} ${Math.abs(v)} % vs ${nombre}`;
}

function Barras({ filas, moneda }: { filas: FilaPorCategoria[]; moneda: Moneda }) {
  const mayor = Math.max(...filas.map((f) => f.monto), 0);
  return (
    <ul className="fin-barras" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {filas.map((f) => (
        <li key={f.categoria_id} className="fin-barra">
          <span className="fin-barra__nombre">
            {f.nombre}
            <small>{NUMERO_DE_DESTINO[f.destino]}</small>
          </span>
          <span className="fin-barra__pista" aria-hidden="true">
            <span className={`fin-barra__relleno fin-barra__relleno--${f.destino}`} style={{ width: `${mayor ? Math.max(2, Math.round((f.monto * 100) / mayor)) : 0}%` }} />
          </span>
          <span className="fin-barra__monto">{textoMonto(f.monto, moneda)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * FINANZAS · INFORME DEL MES (19-10-2026). Las cuatro cifras del mes en soles (ventas, costos variables, gastos fijos y
 * lo que te quedó libre), con su cambio contra el mes anterior; son las mismas que recibe «Tus números» (se leen de
 * company_metricas cuando la caja ya las escribió). Los dólares van aparte: sumados al tipo de cambio si el mes está
 * cerrado; si no, sin sumar. Debajo, en qué se fue el dinero por categoría y lo que no es venta ni gasto.
 */
export default async function Informe({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const c = await contextoFinanzas();
  const sp = await searchParams;
  const hoy = hoyEn(c.zona);
  const mes = mesPedido(sp.mes, hoy);
  const actual = hoy.slice(0, 7);
  const nombre = nombreDeMes(mes);
  const d = await cargarInforme(c.companyId, mes);
  const estado = estadoDelMes(d.cierres, mes, hoy);
  const estadoAnterior = estadoDelMes(d.cierres, d.anterior, hoy);
  const tc = estado.estado === "cerrado" && estado.cierre.tipo_cambio != null ? Number(estado.cierre.tipo_cambio) : null;
  const tcAnterior = estadoAnterior.estado === "cerrado" && estadoAnterior.cierre.tipo_cambio != null ? Number(estadoAnterior.cierre.tipo_cambio) : null;
  const cifras = cifrasDelMes(d.metricas, d.movimientos, d.categorias, tc);
  const previas = cifrasDelMes(d.metricasAnterior, d.movimientosAnterior, d.categorias, tcAnterior);
  const totales = totalesPorMoneda(d.movimientos, d.categorias);
  const usd = totales.USD;
  const tuvoDolares = d.movimientos.some((m) => m.moneda === "USD");
  const gastosPEN = gastosPorCategoria(d.movimientos, d.categorias, "PEN");
  const gastosUSD = gastosPorCategoria(d.movimientos, d.categorias, "USD");
  const aparte = (["PEN", "USD"] as const).flatMap((m) =>
    (["ingreso", "egreso"] as const).flatMap((t) => noEsVentaNiGasto(d.movimientos, d.categorias, m, t).map((f) => ({ ...f, moneda: m, tipo: t })))
  );
  const enlaceMes = (m: string) => (m === actual ? "/os/finanzas/informe" : `/os/finanzas/informe?mes=${m}`);
  const desdeNumeros = d.metricas.length > 0;

  const tarjetas = cifras
    ? [
        { rotulo: "Ventas del mes", valor: cifras.venta, antes: previas?.venta },
        { rotulo: "Costos variables", valor: cifras.costo_variable, antes: previas?.costo_variable },
        { rotulo: "Gastos fijos", valor: cifras.gasto_fijo, antes: previas?.gasto_fijo },
        { rotulo: "Te quedó libre", valor: cifras.libre, antes: previas?.libre, noche: true },
      ]
    : [];

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi negocio</p>
          <h1 className="t-titulo">Finanzas</h1>
        </div>
      </header>
      <PestanasFinanzas />
      <div className="fin-hoja">
        <div className="fin-cabeza">
          <div className="fin-cabeza__textos">
            <h2 className="fin-cabeza__titulo">Informe de {nombre}</h2>
            <span className={`fin-chip fin-chip--${estado.estado}`} style={{ alignSelf: "flex-start" }}>
              {estado.estado === "cerrado" ? `Cerrado el ${fechaCorta(hoyEn(c.zona, new Date(estado.cierre.cerrado_at)), true)}` : estado.reaperturas.length ? "Reabierto" : mes === actual ? "Mes en curso: puede cambiar" : "Abierto: puede cambiar"}
            </span>
          </div>
          <nav className="fin-mes" aria-label="Cambiar de mes">
            <Link className="fin-mes__flecha" href={enlaceMes(sumarMeses(mes, -1))} aria-label={`Ver ${nombreDeMes(sumarMeses(mes, -1))}`}>‹</Link>
            <span className="fin-mes__nombre">{nombre}</span>
            {mes < actual ? (
              <Link className="fin-mes__flecha" href={enlaceMes(sumarMeses(mes, 1))} aria-label={`Ver ${nombreDeMes(sumarMeses(mes, 1))}`}>›</Link>
            ) : (
              <span className="fin-mes__flecha" aria-disabled="true" aria-label="No hay mes siguiente todavía">›</span>
            )}
            {mes !== actual && <Link className="boton-enlace" href="/os/finanzas/informe">Ir al mes en curso</Link>}
          </nav>
        </div>

        {!cifras ? (
          <section className="fin-panel">
            <h2>Todavía no hay nada que contar</h2>
            <p className="fin-texto">
              En {nombreDeMes(mes, false)} no se registró ningún movimiento en la caja. Cuando registres lo que entra y sale, aquí verás cuánto vendiste, cuánto gastaste y cuánto te quedó.
            </p>
            <Link className="boton boton--chico" style={{ alignSelf: "flex-start" }} href={mes === actual ? "/os/finanzas" : `/os/finanzas?mes=${mes}`}>
              Ir a la caja
            </Link>
          </section>
        ) : (
          <>
            <section className="fin-cifras" aria-label={`Cifras de ${nombre}, en soles`}>
              {tarjetas.map((t) => {
                const v = textoVariacion(t.valor, t.antes, d.anterior);
                return (
                  <div key={t.rotulo} className={`fin-cifra${t.noche ? " fin-cifra--noche" : ""}`}>
                    <span className="fin-cifra__rotulo">{t.rotulo}</span>
                    <span className="fin-cifra__valor">{conSigno(t.valor)}</span>
                    <span className="fin-cifra__nota">{v}</span>
                  </div>
                );
              })}
            </section>

            {tuvoDolares && (
              <p className="fin-aviso" role="note">
                {tc != null ? (
                  <>
                    Incluye los dólares del mes en soles, al tipo de cambio del cierre: <b>{tc}</b>
                    {estado.estado === "cerrado" && estado.cierre.fuente ? ` (${estado.cierre.fuente})` : ""}. En dólares: entraron {textoMonto(usd.entro, "USD")} y salieron {textoMonto(usd.salio, "USD")}.
                  </>
                ) : (
                  <>
                    Además, en dólares entraron <b>{textoMonto(usd.entro, "USD")}</b> y salieron <b>{textoMonto(usd.salio, "USD")}</b>: van sin sumar hasta cerrar el mes con su tipo de cambio.
                  </>
                )}
              </p>
            )}

            <div className="fin-rejilla">
              <div className="fin-rejilla__principal">
                <section className="fin-panel" aria-labelledby="fin-gastos">
                  <h2 id="fin-gastos">En qué se fue el dinero</h2>
                  {gastosPEN.length === 0 && gastosUSD.length === 0 ? (
                    <p className="fin-tenue">En {nombreDeMes(mes, false)} no hubo gastos ni costos registrados.</p>
                  ) : (
                    <>
                      {gastosPEN.length > 0 && <Barras filas={gastosPEN} moneda="PEN" />}
                      {gastosUSD.length > 0 && (
                        <>
                          <h3>En dólares{tc != null ? ` (ya sumados arriba a ${tc})` : " (sin sumar hasta cerrar el mes)"}</h3>
                          <Barras filas={gastosUSD} moneda="USD" />
                        </>
                      )}
                    </>
                  )}
                </section>

                <section className="fin-panel" aria-labelledby="fin-aparte">
                  <h2 id="fin-aparte">Lo que no es venta ni gasto</h2>
                  <p className="fin-tenue">Movió tu caja, pero no cuenta en lo que te quedó libre: retiros, préstamos, aportes.</p>
                  {aparte.length === 0 ? (
                    <p className="fin-tenue">Nada en {nombreDeMes(mes, false)}.</p>
                  ) : (
                    <ul className="fin-lista" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {aparte.map((f) => (
                        <li key={`${f.categoria_id}-${f.moneda}`} className="fin-fila">
                          <span>
                            {f.nombre} <span className="fin-tenue">· {f.tipo === "ingreso" ? "entró" : "salió"}</span>
                          </span>
                          <b>{f.tipo === "ingreso" ? "+" : "−"} {textoMonto(f.monto, f.moneda)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <aside className="fin-rejilla__lado">
                <section className="fin-panel fin-panel--noche" aria-labelledby="fin-llega">
                  <h2 id="fin-llega">Así llega a «Tus números»</h2>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                    Lo que registras en la caja alimenta solo tus números de {nombreDeMes(mes, false)}: no se anota dos veces.
                  </p>
                  {[
                    ["Ventas del mes", cifras.venta],
                    ["Costos variables", cifras.costo_variable],
                    ["Gastos fijos", cifras.gasto_fijo],
                    ["Ganancia del mes", cifras.libre],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo as string} className="fin-llega">
                      <span>{rotulo}</span>
                      <b>{conSigno(valor as number)}</b>
                    </div>
                  ))}
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
                    {desdeNumeros ? "Son las cifras que ya tiene «Tus números»." : "Se escriben en «Tus números» al registrar en la caja."}
                    {estado.estado !== "cerrado" && " Mientras el mes siga abierto, pueden cambiar."}
                  </p>
                  {c.consultoria && (
                    <Link className="boton boton--luna boton--chico" style={{ alignSelf: "flex-start" }} href="/portal/numeros">
                      Ver «Tus números»
                    </Link>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

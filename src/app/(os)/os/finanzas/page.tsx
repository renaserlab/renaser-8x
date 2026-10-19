import Link from "next/link";
import { contextoFinanzas } from "@/lib/fin/acceso";
import { hoyEn } from "@/lib/os/calculos";
import { NUMERO_DE_DESTINO, nombreDeMes, sumarMeses, textoMonto, totalesPorMoneda, type Moneda } from "@/lib/fin/calculos";
import { cargarCaja, estadoDelMes, fechaCorta, fechaPropuesta, mesPedido } from "@/lib/fin/caja";
import { PestanasFinanzas } from "@/components/fin/PestanasFinanzas";
import { FormMovimiento } from "@/components/fin/caja/FormMovimiento";
import { AccionesMovimiento } from "@/components/fin/caja/AccionesMovimiento";
import { Categorias } from "@/components/fin/caja/Categorias";
import { SaldoInicial } from "@/components/fin/caja/SaldoInicial";
import { CerrarMes, ReabrirMes } from "@/components/fin/caja/CierreMes";

export const dynamic = "force-dynamic";

const NOMBRE_MONEDA: Record<Moneda, string> = { PEN: "En soles", USD: "En dólares" };

/**
 * FINANZAS · CAJA (19-10-2026): lo que entró y salió en el mes (?mes=AAAA-MM; si no, el que corre en el reloj de la
 * empresa). Arriba, por moneda, cuánto entró, cuánto salió, cuánto te quedó y el dinero en caja hoy (solo con saldo
 * inicial). Debajo los movimientos, cada uno con el número de «Tus números» al que va; a la derecha, registrar uno, el
 * saldo inicial y el cierre del mes. Un mes cerrado no se mueve. La consultora mira, no registra.
 */
export default async function Caja({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const c = await contextoFinanzas();
  const sp = await searchParams;
  const hoy = hoyEn(c.zona);
  const mes = mesPedido(sp.mes, hoy);
  const actual = hoy.slice(0, 7);
  const nombre = nombreDeMes(mes);
  const d = await cargarCaja(c.companyId, mes, hoy);
  const estado = estadoDelMes(d.cierres, mes, hoy);
  const cerrado = estado.estado === "cerrado";
  const totales = totalesPorMoneda(d.movimientos, d.categorias);
  const catDe = new Map(d.categorias.map((k) => [k.id, k]));
  const tuvoDolares = d.movimientos.some((m) => m.moneda === "USD");
  const monedas: Moneda[] = tuvoDolares || d.saldosIniciales.some((s) => s.moneda === "USD") ? ["PEN", "USD"] : ["PEN"];
  const puedeRegistrar = c.registra && !cerrado;
  const enlaceMes = (m: string) => (m === actual ? "/os/finanzas" : `/os/finanzas?mes=${m}`);

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
        {!c.registra && (
          <p className="fin-aviso" role="note">
            Estás mirando: la caja la llevan el dueño o el gerente.
          </p>
        )}

        <div className="fin-cabeza">
          <div className="fin-cabeza__textos">
            <h2 className="fin-cabeza__titulo">Caja de {nombre}</h2>
            <span className={`fin-chip fin-chip--${cerrado ? "cerrado" : "abierto"}`} style={{ alignSelf: "flex-start" }}>
              {cerrado ? `Cerrado el ${fechaCorta(hoyEn(c.zona, new Date(estado.cierre.cerrado_at)), true)}` : estado.reaperturas.length ? "Reabierto" : mes === actual ? "Mes en curso" : "Abierto"}
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
            {mes !== actual && <Link className="boton-enlace" href="/os/finanzas">Ir al mes en curso</Link>}
          </nav>
        </div>

        {estado.estado === "cerrado" ? (
          <div className="fin-aviso fin-aviso--cerrado" role="note">
            <p style={{ margin: 0 }}>
              <b>{nombre} está cerrado.</b> No se registra ni se corrige nada de este mes.
              {estado.cierre.tipo_cambio != null && ` Sus dólares se cuentan en soles a ${Number(estado.cierre.tipo_cambio)}${estado.cierre.fuente ? ` (${estado.cierre.fuente})` : ""}.`}
            </p>
            {c.registra && <div style={{ marginTop: 10 }}><ReabrirMes mes={mes} nombreMes={nombre} /></div>}
          </div>
        ) : (
          <>
            {estado.reaperturas[0] && (
              <p className="fin-aviso" role="note">
                Se reabrió el {fechaCorta(hoyEn(c.zona, new Date(estado.reaperturas[0].reabierto_at!)), true)}: «{estado.reaperturas[0].motivo_reapertura}».
                {tuvoDolares && " Sus dólares quedan fuera de «Tus números» hasta que lo cierres otra vez."}
              </p>
            )}
            {c.registra && estado.sePuedeCerrar && (
              <div className="fin-aviso" role="note">
                <p style={{ margin: "0 0 10px" }}>
                  {nombre} ya terminó. Cuando hayas registrado todo, ciérralo{tuvoDolares ? ": así sus dólares entran en soles a «Tus números»." : "."}
                </p>
                <CerrarMes mes={mes} nombreMes={nombre} tuvoDolares={tuvoDolares} />
              </div>
            )}
          </>
        )}

        <section className="fin-cifras" aria-label={`Cifras de ${nombre}`}>
          {monedas.map((m) => {
            const t = totales[m];
            const caja = d.caja[m];
            return (
              <div key={m} style={{ display: "contents" }}>
                {monedas.length > 1 && <p className="fin-cifras__rotulo">{NOMBRE_MONEDA[m]}</p>}
                <div className="fin-cifra">
                  <span className="fin-cifra__rotulo">Entró</span>
                  <span className="fin-cifra__valor fin-cifra__valor--entra">{textoMonto(t.entro, m)}</span>
                </div>
                <div className="fin-cifra">
                  <span className="fin-cifra__rotulo">Salió</span>
                  <span className="fin-cifra__valor">{textoMonto(t.salio, m)}</span>
                </div>
                <div className="fin-cifra">
                  <span className="fin-cifra__rotulo">Te quedó</span>
                  <span className="fin-cifra__valor">{t.entro - t.salio < 0 ? "−" : ""}{textoMonto(Math.abs(t.entro - t.salio), m)}</span>
                  <span className="fin-cifra__nota">Lo que entró menos lo que salió en {nombreDeMes(mes, false)}.</span>
                </div>
                <div className="fin-cifra fin-cifra--noche">
                  <span className="fin-cifra__rotulo">Dinero en caja hoy</span>
                  {caja == null ? (
                    <span className="fin-cifra__nota">
                      Para saberlo, anota con cuánto empezaste: <a href="#saldo-inicial">carga tu saldo inicial</a>.
                    </span>
                  ) : (
                    <>
                      <span className="fin-cifra__valor">{caja < 0 ? "−" : ""}{textoMonto(Math.abs(caja), m)}</span>
                      <span className="fin-cifra__nota">Saldo inicial más lo que entró menos lo que salió, hasta hoy.</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <div className="fin-rejilla">
          <section className="fin-rejilla__principal fin-panel" aria-labelledby="fin-movs">
            <h2 id="fin-movs">Movimientos de {nombre}</h2>
            {d.movimientos.length === 0 ? (
              <p className="fin-tenue">
                Todavía no hay movimientos en {nombreDeMes(mes, false)}.{puedeRegistrar ? " Registra lo primero que entró o salió." : ""}
              </p>
            ) : (
              <ul className="fin-lista" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {d.movimientos.map((m) => {
                  const cat = catDe.get(m.categoria_id);
                  const origen = d.origenes.get(m.id);
                  const entra = m.tipo === "ingreso";
                  return (
                    <li key={m.id} className="fin-mov">
                      <span className="fin-mov__fecha">{fechaCorta(m.fecha)}</span>
                      <div className="fin-mov__cuerpo">
                        <span className="fin-mov__titulo">
                          {cat?.nombre ?? "Sin categoría"}
                          {m.detalle && <span className="fin-mov__detalle"> · {m.detalle}</span>}
                        </span>
                        <span className="fin-mov__marcas">
                          <span className={`fin-chip fin-chip--${cat?.destino ?? "ninguno"}`}>→ {NUMERO_DE_DESTINO[cat?.destino ?? "ninguno"]}</span>
                          {m.moneda === "USD" && !cerrado && <span className="fin-mov__origen">en dólares: se suma al cerrar el mes</span>}
                          {origen ? (
                            <span className="fin-mov__origen">
                              {origen.texto} · <Link href={origen.href}>ver en {origen.tipo === "cobro" ? "Cobros" : "Pagos"}</Link>
                            </span>
                          ) : (
                            m.origen !== "manual" && <span className="fin-mov__origen">{m.origen === "cobro" ? "entró sola: pago de un cobro" : "salió solo: pago que se repite"}</span>
                          )}
                        </span>
                      </div>
                      <span className={`fin-mov__monto${entra ? " fin-mov__monto--entra" : ""}`}>
                        {entra ? "+" : "−"} {textoMonto(m.monto, m.moneda)}
                      </span>
                      {puedeRegistrar && (
                        <AccionesMovimiento
                          mov={{ id: m.id, fecha: m.fecha, tipo: m.tipo, categoria_id: m.categoria_id, monto: Number(m.monto), moneda: m.moneda, detalle: m.detalle, origen: m.origen }}
                          categorias={d.categorias}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="fin-rejilla__lado">
            {c.registra && (
              <section className="fin-panel" aria-labelledby="fin-registrar">
                <h2 id="fin-registrar">Registrar un movimiento</h2>
                {cerrado ? (
                  <p className="fin-tenue">{nombre} está cerrado: para registrar algo aquí, reábrelo con un motivo.</p>
                ) : (
                  <FormMovimiento key={mes} categorias={d.categorias} fecha={fechaPropuesta(mes, hoy)} nombreMes={nombreDeMes(mes, false)} />
                )}
              </section>
            )}
            <section className="fin-panel" id="saldo-inicial" aria-labelledby="fin-saldo">
              <h2 id="fin-saldo">Saldo inicial</h2>
              <p className="fin-tenue">Cuánto había en caja el día que empezaste a usar Finanzas. Con él se sabe tu dinero en caja hoy.</p>
              <SaldoInicial saldos={d.saldosIniciales} hoy={hoy} registra={c.registra} />
            </section>
          </div>
        </div>

        <details className="fin-panel fin-plegable" id="categorias">
          <summary>
            <h2>Tus categorías</h2>
            <span className="fin-tenue">Qué es cada cosa y a qué número de «Tus números» va</span>
          </summary>
          <Categorias categorias={d.categorias} registra={c.registra} />
        </details>
      </div>
    </div>
  );
}

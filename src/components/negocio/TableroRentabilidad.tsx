import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import { centro, esExacto, sumarRangos, textoRango, type Rango } from "@/lib/dato-oral";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";
import { CUADRANTE_TEXTO, type ProductoRentable, type TableroRentabilidad as Tablero } from "@/lib/rentabilidad";
import { ChipEstado, SinDato } from "./Marcas";
import { MatrizMargenVolumen } from "./MatrizMargenVolumen";
import { Palancas, type PctPalancas } from "./Palancas";
import { cantidad } from "./dato";

/** Una venta en otra moneda, lo justo para nombrarla en la tabla de lo que se quedó en el camino. */
type OperacionBreve = { id: string; fecha_venta: string | null; moneda: string; monto: number; recibido: number | null };

type Props = {
  t: Tablero;
  config: ConfigEmpresa;
  /** Lo que no se pudo leer de la base: se dice arriba, para que nadie lea un «no hay» donde hay un «no se sabe». */
  noLeido: string[];
  operaciones: OperacionBreve[];
  pct: PctPalancas;
  /** Los parámetros de la dirección que el formulario de palancas conserva (periodo, personas, horas). */
  conservar: Record<string, string>;
};

const FUENTE_UNIDADES: Record<NonNullable<ProductoRentable["fuente_unidades"]>, string> = {
  mes: "dicho al mes",
  periodo: "promedio de su periodo",
  de_cada_10: "de cada 10 de su grupo",
};

const MAX_FILAS = 25;

function ComoSeCalculo({ c }: { c: Calculo<unknown> }) {
  return (
    <details className="detalle-calculo mt-2">
      <summary>Cómo se calculó</summary>
      <dl>
        {explicarCalculo(c).map((x) => (
          <div key={x.etiqueta}>
            <dt>{x.etiqueta}</dt>
            <dd>{x.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Una barra: lo lleno en azul, el resto rayado. Sin degradados ni sombras: los pone el sistema de diseño. */
function Barra({ lleno, total, etiqueta }: { lleno: number; total: number; etiqueta: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (100 * lleno) / total)) : 0;
  return (
    <div role="img" aria-label={etiqueta} className="barra-cubierta">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function FilaProducto({ p, fmt }: { p: ProductoRentable; fmt: (n: number) => string }) {
  const pctTexto = (r: Rango | null) => (r ? textoRango({ bajo: r.bajo * 100, alto: r.alto * 100 }, (n) => `${Math.round(n)} %`) : null);
  const estados = (["precio", "costo", "unidades"] as const).filter((k) => p.estados[k]);
  return (
    <tr>
      <td style={{ minWidth: 180 }}>
        <span className="fuerte">{p.nombre}</span>
        {p.grupo && <span className="apunte block">{p.grupo}</span>}
        {p.motivos.length > 0 && <span className="apunte block" style={{ maxWidth: 260 }}>{p.motivos.join("; ")}</span>}
      </td>
      <td>{p.cuadrante ? CUADRANTE_TEXTO[p.cuadrante].nombre : <SinDato />}</td>
      <td>{p.precio_efectivo ? <span className="cifra">{textoRango(p.precio_efectivo, fmt)}</span> : <SinDato />}</td>
      <td>
        {p.costo ? <span className="cifra">{textoRango(p.costo, fmt)}</span> : <SinDato />}
        {p.costo_partes.length > 0 && (
          <span className="apunte block" style={{ maxWidth: 220 }}>
            {p.costo_partes.map((c, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {c.nombre} <span className="cifra">{c.rango ? textoRango(c.rango, fmt) : "sin dato"}</span>
              </span>
            ))}
          </span>
        )}
      </td>
      <td>
        {p.margen_unitario ? <span className="cifra">{textoRango(p.margen_unitario, fmt)}</span> : <SinDato />}
        {p.margen_pct && <span className="apunte block">{pctTexto(p.margen_pct)}</span>}
      </td>
      <td>
        {p.unidades_mes ? <span className="cifra">{textoRango(p.unidades_mes, cantidad)}</span> : <SinDato />}
        {p.fuente_unidades && <span className="apunte block">{FUENTE_UNIDADES[p.fuente_unidades]}</span>}
      </td>
      <td>{p.contribucion_mes ? <span className="cifra">{textoRango(p.contribucion_mes, fmt)}</span> : <SinDato />}</td>
      <td>
        {estados.length ? (
          <span className="flex flex-col gap-1">
            {estados.map((k) => (
              <span key={k} className="dato-chico" style={{ whiteSpace: "nowrap" }}>
                {k}: <ChipEstado estado={p.estados[k]} />
              </span>
            ))}
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function TablaPorProducto({ productos, fmt }: { productos: ProductoRentable[]; fmt: (n: number) => string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tabla" style={{ minWidth: 960 }}>
        <thead>
          <tr>
            {/* El cuadrante va segundo: a 1366 px la tabla se desplaza de lado y lo que más se lee queda a la vista. */}
            <th style={{ minWidth: 180 }}>Producto</th>
            <th>Cuadrante</th>
            <th>Precio efectivo</th>
            <th>Costo (por partes)</th>
            <th>Deja por unidad</th>
            <th>Unidades al mes</th>
            <th>Deja al mes</th>
            <th>Cómo se sabe</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <FilaProducto key={p.id} p={p} fmt={fmt} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * EL TABLERO DE RENTABILIDAD (para la consultora). Todo sale de src/lib/rentabilidad.ts, calculado con lo que la
 * empresa llenó, y cada cifra trae «Cómo se calculó». Lo que falta va rayado y nombrado; lo que no se pudo leer se
 * dice arriba. Ningún número se completa a ojo: un rango se muestra como rango.
 */
export function TableroRentabilidad({ t, config, noLeido, operaciones, pct, conservar }: Props) {
  const fmt = (n: number) => enMoneda(n, config, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
  const conDatos = t.productos.filter((p) => p.contribucion_mes);
  const orden = [...t.productos].sort((a, b) => (b.contribucion_mes ? centro(b.contribucion_mes) : -Infinity) - (a.contribucion_mes ? centro(a.contribucion_mes) : -Infinity));
  const primeras = orden.slice(0, MAX_FILAS);
  const resto = orden.slice(MAX_FILAS);
  const dejanTodas = conDatos.length ? sumarRangos(conDatos.map((p) => p.contribucion_mes)) : null;
  const nombre = (id: string) => t.productos.find((p) => p.id === id)?.nombre ?? id;
  const nd = t.noventaDiez;
  const eq = t.equilibrio;
  const faltan = t.faltan.length > 0 && (
    <section aria-labelledby="faltan-titulo">
      <h3 id="faltan-titulo" className="t-seccion">Lo que falta para completar las cuentas</h3>
      <ul className="mt-2 flex flex-col gap-1" style={{ paddingLeft: 20, listStyle: "disc" }}>
        {t.faltan.map((f) => (
          <li key={f} className="t-dato">{f}</li>
        ))}
      </ul>
    </section>
  );

  return (
    <section className="rentabilidad flex flex-col gap-8" aria-labelledby="rentabilidad-titulo">
      <div>
        <h2 id="rentabilidad-titulo" className="t-seccion">Rentabilidad</h2>
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
          Con lo que la empresa anotó: cuánto deja cada producto, cuáles sostienen el negocio y cuánto hay que vender para cubrir los gastos del mes.
        </p>
        {noLeido.length > 0 && (
          <p className="t-dato mt-2" role="status" style={{ color: "var(--caducado)" }}>
            No se pudo leer: {noLeido.join(", ")}. Lo que depende de eso puede salir incompleto; vuelve a cargar la página.
          </p>
        )}
      </div>

      {t.productos.length === 0 ? (
        <>
          <p className="t-dato" style={{ color: "var(--grafito)" }}>Todavía no hay productos ni servicios anotados.</p>
          {faltan}
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="panel p-4">
              <p className="t-etiqueta">Lo que dejan los productos al mes</p>
              <p className="cifra-media mt-1">{dejanTodas ? textoRango(dejanTodas, fmt) : <SinDato />}</p>
              <p className="apunte">{conDatos.length} de {t.productos.length} con precio, costo y unidades al mes</p>
            </div>
            <div className="panel p-4">
              <p className="t-etiqueta">Gastos del mes</p>
              <p className="cifra-media mt-1">{t.fijos.total ? textoRango(t.fijos.total, fmt) : <SinDato />}</p>
              <p className="apunte">
                {t.fijos.fuente === "costos_mes"
                  ? `de la tabla de gastos (${t.fijos.filas})${t.fijos.solo_fijos ? ` · fijos ${textoRango(t.fijos.solo_fijos, fmt)}` : ""}${t.fijos.comercializacion ? ` · para vender ${textoRango(t.fijos.comercializacion, fmt)}` : ""}`
                  : t.fijos.fuente === "vital"
                    ? "de los 9 números (gasto fijo)"
                    : "ni en la tabla de gastos ni en los 9 números"}
              </p>
              {t.fijos.diferencia_pct != null && Math.abs(t.fijos.diferencia_pct) > 10 && t.fijos.vital != null && (
                <p className="apunte texto-espera mt-1">
                  Los 9 números dicen {fmt(t.fijos.vital)} de gasto fijo: difieren {Math.abs(t.fijos.diferencia_pct)} %. No se elige: se conversa.
                </p>
              )}
            </div>
            <div className="panel p-4">
              <p className="t-etiqueta">Punto de equilibrio</p>
              {eq.valor ? (
                <>
                  <p className="cifra-media mt-1">{textoRango(eq.valor.unidades, (n) => cantidad(Math.ceil(n)))}</p>
                  <p className="apunte">unidades al mes con la mezcla de hoy · {fmt(eq.valor.soles)} de venta</p>
                </>
              ) : (
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {eq.motivo_nulo}</p>
              )}
            </div>
          </div>

          {/* Lo que falta va justo después de las tres cifras: antes quedaba al final, a unos 4.400 px. */}
          {faltan}

          <section aria-labelledby="por-producto" className="flex flex-col gap-2">
            <h3 id="por-producto" className="t-seccion">Por producto</h3>
            <TablaPorProducto productos={primeras} fmt={fmt} />
            {resto.length > 0 && (
              <details>
                <summary className="plegado-enlace">Ver los {resto.length} restantes</summary>
                <TablaPorProducto productos={resto} fmt={fmt} />
              </details>
            )}
          </section>

          <MatrizMargenVolumen t={t} config={config} />

          <section aria-labelledby="noventa-diez" className="flex flex-col gap-2">
            <h3 id="noventa-diez" className="t-seccion">90/10: los pocos que dejan casi todo</h3>
            {nd.valor ? (
              <>
                <p className="t-cuerpo">
                  <b>{nd.valor.cuantas} de {nd.valor.de}</b> productos dejan el <b>{Math.round(nd.valor.pct_contribucion * 100)} %</b> de lo que dejan al mes los que dejan algo.
                </p>
                <Barra lleno={nd.valor.cuantas} total={nd.valor.de} etiqueta={`${nd.valor.cuantas} de ${nd.valor.de} productos; el resto, rayado`} />
                <p className="t-dato" style={{ color: "var(--grafito)" }}>{nd.valor.lineas.map(nombre).join(" · ")}</p>
                {nd.valor.restan.length > 0 && <p className="t-dato" style={{ color: "var(--contradicho)" }}>Cuestan más de lo que dejan: {nd.valor.restan.map(nombre).join(" · ")}</p>}
              </>
            ) : (
              <p className="t-dato" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {nd.motivo_nulo}</p>
            )}
            <ComoSeCalculo c={nd} />
          </section>

          <section aria-labelledby="equilibrio" className="flex flex-col gap-2">
            <h3 id="equilibrio" className="t-seccion">Cuánto hay que vender para cubrir el mes</h3>
            {eq.valor ? (
              <>
                <p className="t-cuerpo">
                  Necesitas vender {esExacto(eq.valor.unidades) ? "unas " : ""}<b>{textoRango(eq.valor.unidades, (n) => cantidad(Math.ceil(n)))}</b> unidades al mes con la mezcla de hoy
                  {eq.valor.vendes_hoy ? <>; hoy vendes <b>{textoRango(eq.valor.vendes_hoy, cantidad)}</b>.</> : "."}
                </p>
                <details>
                  <summary className="plegado-enlace">Por producto</summary>
                  <ul className="mt-2 flex flex-col gap-1" style={{ listStyle: "none", padding: 0 }}>
                    {eq.valor.por_producto.map((x) => (
                      <li key={x.id} className="t-dato">{nombre(x.id)}: {textoRango(x.unidades, (n) => cantidad(Math.ceil(n)))}</li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p className="t-dato" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {eq.motivo_nulo}</p>
            )}
            <ComoSeCalculo c={eq} />
          </section>

          <Palancas t={t} config={config} pct={pct} conservar={conservar} />
        </>
      )}

      {t.moneda && (
        <section aria-labelledby="moneda-titulo" className="flex flex-col gap-2">
          <h3 id="moneda-titulo" className="t-seccion">Lo que se queda en el camino al cobrar en otra moneda</h3>
          {t.moneda.resumen.valor ? (
            <p className="t-cuerpo">
              En las ventas con lo que llegó a la cuenta, se esperaban <b>{fmt(t.moneda.resumen.valor.esperado)}</b> y llegaron <b>{fmt(t.moneda.resumen.valor.recibido)}</b>: se quedaron <b>{fmt(t.moneda.resumen.valor.perdido)}</b> ({Math.round(t.moneda.resumen.valor.pct * 1000) / 10} %).
              {t.moneda.resumen.valor.al_menos != null && <> Aparte, en las ventas sin lo que llegó se perdió al menos {fmt(t.moneda.resumen.valor.al_menos)}.</>}
              {t.moneda.resumen.valor.mes_estimado && <> Estimado de un mes normal: {textoRango(t.moneda.resumen.valor.mes_estimado, fmt)}.</>}
            </p>
          ) : (
            <p className="t-dato" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {t.moneda.resumen.motivo_nulo}</p>
          )}
          {t.moneda.operaciones.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="tabla" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Esperado</th>
                    <th>Llegó</th>
                    <th>Por el tipo de cambio</th>
                    <th>Banco</th>
                    <th>Conversión</th>
                    <th>Se quedó</th>
                  </tr>
                </thead>
                <tbody>
                  {t.moneda.operaciones.map((f) => {
                    const o = operaciones.find((x) => x.id === f.id);
                    const celda = (n: number | null) => (n == null ? <SinDato /> : <span className="cifra">{fmt(n)}</span>);
                    return (
                      <tr key={f.id}>
                        <td>
                          {o ? `${o.monto.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ${o.moneda}` : "—"}
                          {o?.fecha_venta && <span className="apunte block">{o.fecha_venta.split("-").reverse().join("/")}</span>}
                          {f.motivos.length > 0 && <span className="apunte block" style={{ maxWidth: 240 }}>{f.motivos.join("; ")}</span>}
                        </td>
                        <td>{celda(f.esperado)}</td>
                        <td>{celda(o?.recibido ?? null)}</td>
                        <td>{celda(f.por_tipo_de_cambio)}</td>
                        <td>{celda(f.por_comisiones)}</td>
                        <td>{celda(f.por_conversion)}</td>
                        <td>
                          {f.total != null && !f.completa ? <>al menos <span className="cifra">{fmt(f.total)}</span></> : celda(f.total)}
                          {f.pct != null && <span className="apunte block">{f.completa ? "" : "al menos "}{Math.round(f.pct * 1000) / 10} %</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ComoSeCalculo c={t.moneda.resumen} />
        </section>
      )}

      {(t.credito || t.inventario) && (
        <section className="grid gap-4 md:grid-cols-2">
          {t.credito && (
            <div className="panel p-4">
              <p className="t-etiqueta">Venta al crédito</p>
              {t.credito.valor ? (
                <>
                  <p className="t-cuerpo mt-1">Dinero en la calle: <b>{textoRango(t.credito.valor.dinero_en_la_calle, fmt)}</b></p>
                  <p className="t-cuerpo">Se pierde al mes: {t.credito.valor.perdida_mes ? <b>{textoRango(t.credito.valor.perdida_mes, fmt)}</b> : <SinDato />}</p>
                </>
              ) : (
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {t.credito.motivo_nulo}</p>
              )}
              <ComoSeCalculo c={t.credito} />
            </div>
          )}
          {t.inventario && (
            <div className="panel p-4">
              <p className="t-etiqueta">Mercadería guardada</p>
              {t.inventario.valor ? (
                <>
                  <p className="t-cuerpo mt-1">Dinero que no se mueve hace más de tres meses: {t.inventario.valor.dinero_parado ? <b>{textoRango(t.inventario.valor.dinero_parado, fmt)}</b> : <SinDato />}</p>
                  <p className="t-cuerpo">Alcanza para: {t.inventario.valor.meses ? <b>{textoRango(t.inventario.valor.meses, cantidad)} meses</b> : <SinDato />}</p>
                </>
              ) : (
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}><SinDato texto="sin cifra" /> · {t.inventario.motivo_nulo}</p>
              )}
              <ComoSeCalculo c={t.inventario} />
            </div>
          )}
        </section>
      )}

    </section>
  );
}

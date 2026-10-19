import Link from "next/link";
import { contextoFinanzas } from "@/lib/fin/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn } from "@/lib/os/calculos";
import { NOMBRE_ESTADO_COBRO, NUMERO_DE_DESTINO, nombreDeMes, textoMonto, type Categoria, type Cobro, type Moneda } from "@/lib/fin/calculos";
import { cobradoEnMes, conEstado, diasPromedioDeCobro, ordenarCobros, pagadoPorCobro, textoFechaCorta, totalesDeCobros, type PagoDeCobro } from "@/lib/fin/cobros";
import { PestanasFinanzas } from "@/components/fin/PestanasFinanzas";
import { AnularCobro, AnularPagoCobro, NuevoCobro, RegistrarPago } from "@/components/fin/cobros/FormulariosCobro";

export const dynamic = "force-dynamic";

type Filtro = "abiertos" | "pagados" | "anulados";

/** «S/ 18,400», y si también hay dólares, « · US$ 1,200» al lado: nunca sumados. */
function enDosMonedas(t: Record<Moneda, number>): string {
  const partes = [t.PEN || !t.USD ? textoMonto(t.PEN, "PEN") : null, t.USD ? textoMonto(t.USD, "USD") : null].filter(Boolean);
  return partes.join(" · ");
}

/**
 * FINANZAS · COBROS (19-10-2026): lo que te deben tus clientes. Arriba, cuánto te deben y cuánto está vencido (por
 * moneda), cuánto tardas en cobrar y lo cobrado este mes. A la izquierda la lista, con lo vencido arriba; a la derecha
 * el cobro elegido (?cobro=), con sus pagos y «Registrar pago». Cada pago entra solo a la caja como la categoría de
 * ingreso del cobro, y de ahí a «Tus números»: no se anota dos veces. La consultora mira, no registra.
 */
export default async function Cobros({ searchParams }: { searchParams: Promise<{ cobro?: string; filtro?: string }> }) {
  const c = await contextoFinanzas();
  const sp = await searchParams;
  const filtro: Filtro = sp.filtro === "pagados" || sp.filtro === "anulados" ? sp.filtro : "abiertos";
  const sb = supabaseAdmin();
  const hoy = hoyEn(c.zona);
  const mes = hoy.slice(0, 7);

  const [{ data: cobrosRaw }, { data: pagosRaw }, { data: catsRaw }] = await Promise.all([
    sb.from("fin_cobros").select("id,cliente,concepto,total,moneda,emitido,vence,categoria_id,anulado_at,motivo_anulacion,created_at").eq("company_id", c.companyId).order("vence"),
    sb.from("fin_cobro_pagos").select("id,cobro_id,monto,fecha,medio,created_at").eq("company_id", c.companyId).order("fecha"),
    sb.from("fin_categorias").select("id,nombre,tipo,destino,archivada,orden").eq("company_id", c.companyId).order("orden"),
  ]);
  const pagos = (pagosRaw ?? []) as PagoDeCobro[];
  const categorias = (catsRaw ?? []) as Categoria[];
  const cobros = conEstado((cobrosRaw ?? []) as (Cobro & { motivo_anulacion: string | null })[], pagadoPorCobro(pagos), hoy);
  const totales = totalesDeCobros(cobros);
  const promedio = diasPromedioDeCobro(cobros, pagos, hoy);
  const cobrado = cobradoEnMes(pagos, cobros, mes);

  const deLaLista = ordenarCobros(
    cobros.filter((x) => (filtro === "anulados" ? x.estado === "anulado" : filtro === "pagados" ? x.estado === "pagado" : x.estado !== "anulado" && x.estado !== "pagado"))
  );
  const cuantos = {
    abiertos: cobros.filter((x) => x.estado !== "anulado" && x.estado !== "pagado").length,
    pagados: cobros.filter((x) => x.estado === "pagado").length,
    anulados: cobros.filter((x) => x.estado === "anulado").length,
  };
  const elegido = cobros.find((x) => x.id === sp.cobro) ?? deLaLista[0] ?? null;
  const pagosDelElegido = elegido ? pagos.filter((p) => p.cobro_id === elegido.id) : [];
  const catDe = new Map(categorias.map((k) => [k.id, k]));
  const deIngreso = categorias
    .filter((k) => k.tipo === "ingreso" && !k.archivada)
    .sort((a, b) => Number(b.destino === "venta") - Number(a.destino === "venta") || a.orden - b.orden)
    .map((k) => ({ id: k.id, nombre: k.nombre, numero: NUMERO_DE_DESTINO[k.destino] }));
  const enlace = (q: { cobro?: string; filtro?: Filtro }) => {
    const p = new URLSearchParams();
    const f = q.filtro ?? filtro;
    if (f !== "abiertos") p.set("filtro", f);
    if (q.cobro) p.set("cobro", q.cobro);
    const s = p.toString();
    return `/os/finanzas/cobros${s ? `?${s}` : ""}`;
  };

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi negocio</p>
          <h1 className="t-titulo">Finanzas</h1>
        </div>
      </header>
      <PestanasFinanzas />
      {!c.registra && <p className="fin-c-solo-mirar" role="note">Estás mirando: los cobros los registran el dueño o el gerente.</p>}

      <section className="os-kpis" aria-label="Resumen de cobros">
        <div className="os-kpi os-kpi--noche">
          <span className="os-kpi__rotulo">Te deben</span>
          <span className="os-kpi__cifra fin-c-cifra">{enDosMonedas(totales.deben)}</span>
          <span className="os-kpi__sub">{totales.abiertos === 1 ? "en 1 cobro abierto" : `en ${totales.abiertos} cobros abiertos`}</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Vencido</span>
          <span className={`os-kpi__cifra fin-c-cifra${totales.vencido.PEN || totales.vencido.USD ? " fin-c-cifra--mal" : ""}`}>{enDosMonedas(totales.vencido)}</span>
          <span className="os-kpi__sub">{totales.clientesAtrasados === 0 ? "nadie atrasado" : totales.clientesAtrasados === 1 ? "1 cliente atrasado" : `${totales.clientesAtrasados} clientes atrasados`}</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Tardas en cobrar</span>
          <span className="os-kpi__cifra fin-c-cifra">{promedio.dias == null ? "—" : promedio.dias === 1 ? "1 día" : `${promedio.dias} días`}</span>
          <span className="os-kpi__sub">{promedio.dias == null ? "todavía sin cobros que medir" : "en promedio, últimos 90 días"}</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Cobrado en {nombreDeMes(mes, false)}</span>
          <span className={`os-kpi__cifra fin-c-cifra${cobrado.PEN || cobrado.USD ? " fin-c-cifra--bien" : ""}`}>{enDosMonedas(cobrado)}</span>
          <span className="os-kpi__sub">ya está en tu caja</span>
        </div>
      </section>
      <details className="fin-c-como">
        <summary>¿Cómo se calcula «tardas en cobrar»?</summary>
        <p>
          Se miran los últimos 90 días. Cada cobro que terminaste de cobrar cuenta los días desde que lo emitiste hasta su último pago; cada cobro vencido que
          sigue abierto cuenta desde que lo emitiste hasta hoy. Así un cliente que no paga también sube el promedio.
          {promedio.cobros ? ` Hoy entran ${promedio.cobros} ${promedio.cobros === 1 ? "cobro" : "cobros"}.` : ""}
        </p>
      </details>

      <div className="fin-c-rejilla">
        <section className="os-tarjeta fin-c-lista" aria-label="Lo que te deben">
          <div className="os-cabeza">
            <h2 className="t-seccion">Lo que te deben</h2>
            <nav className="os-filtros" aria-label="Filtrar cobros">
              <Link className="os-pildora" href={enlace({ filtro: "abiertos" })} aria-current={filtro === "abiertos" ? "page" : undefined} scroll={false}>Abiertos · {cuantos.abiertos}</Link>
              <Link className="os-pildora" href={enlace({ filtro: "pagados" })} aria-current={filtro === "pagados" ? "page" : undefined} scroll={false}>Pagados · {cuantos.pagados}</Link>
              <Link className="os-pildora" href={enlace({ filtro: "anulados" })} aria-current={filtro === "anulados" ? "page" : undefined} scroll={false}>Anulados · {cuantos.anulados}</Link>
            </nav>
          </div>
          {deLaLista.length === 0 ? (
            <div className="vacio">
              <p className="vacio__texto">
                {filtro === "abiertos"
                  ? cobros.length === 0
                    ? "Todavía no registras cobros. Cuando un cliente te quede debiendo, créalo abajo: sus pagos entrarán solos a tu caja."
                    : "Nadie te debe nada ahora mismo."
                  : filtro === "pagados"
                    ? "Todavía no hay cobros pagados por completo."
                    : "No hay cobros anulados."}
              </p>
            </div>
          ) : (
            <div className="os-tabla-caja">
              <table className="tabla fin-c-tabla">
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col" className="fin-c-num">Total</th>
                    <th scope="col" className="fin-c-num">Falta</th>
                    <th scope="col">Vence</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {deLaLista.map((x) => (
                    <tr key={x.id} aria-current={elegido?.id === x.id ? "true" : undefined}>
                      <td>
                        <Link className="fin-c-fila-enlace" href={enlace({ cobro: x.id })} scroll={false}>
                          <b>{x.cliente}</b>
                          {x.concepto && <span>{x.concepto}</span>}
                        </Link>
                      </td>
                      <td className="fin-c-num">{textoMonto(x.total, x.moneda)}</td>
                      <td className="fin-c-num"><b>{textoMonto(x.saldo, x.moneda)}</b></td>
                      <td>{textoFechaCorta(x.vence)}</td>
                      <td>
                        <span className={`fin-c-chip fin-c-chip--${x.estado}`}>
                          {NOMBRE_ESTADO_COBRO[x.estado]}
                          {x.atraso ? ` · ${x.atraso} ${x.atraso === 1 ? "día" : "días"}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="os-tarjeta fin-c-detalle" aria-label="Cobro elegido">
          {!elegido ? (
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Elige un cobro de la lista para ver sus pagos y registrar uno nuevo.</p>
          ) : (
            <>
              <div className="fin-c-detalle__cabeza">
                <span className={`fin-c-chip fin-c-chip--${elegido.estado}`}>{NOMBRE_ESTADO_COBRO[elegido.estado]}</span>
                <h2>{elegido.cliente}</h2>
                <p className="t-dato">
                  {elegido.concepto ? `${elegido.concepto} · ` : ""}total {textoMonto(elegido.total, elegido.moneda)} · pagado {textoMonto(elegido.pagado, elegido.moneda)}
                </p>
                <p className="t-dato" style={{ color: "var(--grafito)" }}>
                  Emitido el {textoFechaCorta(elegido.emitido)} · vence el {textoFechaCorta(elegido.vence)} · sus pagos entran como «{catDe.get(elegido.categoria_id)?.nombre ?? "—"}»
                </p>
                {elegido.estado === "anulado" && elegido.motivo_anulacion && <p className="t-dato">Anulado: {elegido.motivo_anulacion}</p>}
              </div>
              {c.registra && elegido.estado !== "anulado" && (
                <RegistrarPago key={`pagar-${elegido.id}`} cobroId={elegido.id} falta={elegido.saldo} moneda={elegido.moneda} hoy={hoy} />
              )}
              <div className="fin-c-pagos">
                <h3>Pagos de este cobro</h3>
                {pagosDelElegido.length === 0 ? (
                  <p className="t-dato" style={{ color: "var(--grafito)" }}>Todavía sin pagos.</p>
                ) : (
                  <ul>
                    {pagosDelElegido.map((p) => (
                      <li key={p.id}>
                        <span>
                          {textoFechaCorta(p.fecha)} · <b>{textoMonto(p.monto, elegido.moneda)}</b>
                          {p.medio ? ` · ${p.medio}` : ""} · entró a la caja
                        </span>
                        {c.registra && <AnularPagoCobro pagoId={p.id} texto={`${textoMonto(p.monto, elegido.moneda)} del ${textoFechaCorta(p.fecha)}`} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {c.registra && elegido.estado !== "anulado" && (
                pagosDelElegido.length === 0 ? <AnularCobro key={`anular-${elegido.id}`} cobroId={elegido.id} /> : <p className="t-dato" style={{ color: "var(--grafito)" }}>Para anular este cobro, anula primero sus pagos.</p>
              )}
            </>
          )}
        </aside>
      </div>

      {c.registra && (
        <details className="os-tarjeta fin-c-nuevo">
          <summary className="fin-c-nuevo__boton">Nuevo cobro</summary>
          {deIngreso.length ? (
            <NuevoCobro categorias={deIngreso} hoy={hoy} />
          ) : (
            <p className="t-dato">No hay categorías de ingreso activas. Crea una en la caja para poder registrar cobros.</p>
          )}
        </details>
      )}
    </div>
  );
}

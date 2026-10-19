import { contextoFinanzas } from "@/lib/fin/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn } from "@/lib/os/calculos";
import { NUMERO_DE_DESTINO, nombreDeMes, textoMonto, type Categoria, type Moneda, type PagoRecurrente } from "@/lib/fin/calculos";
import { estadoPago, pagadoEnMes, porPagarHastaFinDeMes, textoFechaCorta, textoVencimiento, ultimoHecho, type PagoHecho } from "@/lib/fin/cobros";
import { PestanasFinanzas } from "@/components/fin/PestanasFinanzas";
import { AnularPagoHecho, EditarPago, NuevoPago, Pagar } from "@/components/fin/cobros/FormulariosPago";

export const dynamic = "force-dynamic";

type Pago = PagoRecurrente & { motivo_baja: string | null; created_at: string };

/** «S/ 3,530», y si también hay dólares, « · US$ 50» al lado: nunca sumados. */
function enDosMonedas(t: Record<Moneda, number>): string {
  const partes = [t.PEN || !t.USD ? textoMonto(t.PEN, "PEN") : null, t.USD ? textoMonto(t.USD, "USD") : null].filter(Boolean);
  return partes.join(" · ");
}

/**
 * FINANZAS · PAGOS (19-10-2026): lo que pagas cada mes (alquiler, servicios, contador…). Cada uno con su próximo
 * vencimiento y su estado; «Pagar» hace en una sola operación el gasto en la caja, el ciclo pagado y el vencimiento
 * siguiente, y de la caja va a «Tus números». Debajo de cada uno, su historial (solo el último pago se anula), editar y
 * dar de baja. La consultora mira, no registra.
 */
export default async function Pagos() {
  const c = await contextoFinanzas();
  const sb = supabaseAdmin();
  const hoy = hoyEn(c.zona);
  const mes = hoy.slice(0, 7);

  const [{ data: pagosRaw }, { data: hechosRaw }, { data: catsRaw }] = await Promise.all([
    sb.from("fin_pagos_recurrentes").select("id,nombre,monto,moneda,categoria_id,dia,proximo_vencimiento,activo,motivo_baja,created_at").eq("company_id", c.companyId).order("proximo_vencimiento"),
    sb.from("fin_pagos_hechos").select("id,pago_id,ciclo,monto,fecha,created_at").eq("company_id", c.companyId).order("ciclo", { ascending: false }),
    sb.from("fin_categorias").select("id,nombre,tipo,destino,archivada,orden").eq("company_id", c.companyId).order("orden"),
  ]);
  const pagos = (pagosRaw ?? []) as Pago[];
  const hechos = (hechosRaw ?? []) as PagoHecho[];
  const categorias = (catsRaw ?? []) as Categoria[];
  const activos = pagos.filter((p) => p.activo);
  const deBaja = pagos.filter((p) => !p.activo);
  const porPagar = porPagarHastaFinDeMes(pagos, hoy);
  const pagado = pagadoEnMes(hechos, pagos, mes);
  const catDe = new Map(categorias.map((k) => [k.id, k]));
  const deEgreso = categorias
    .filter((k) => k.tipo === "egreso" && !k.archivada)
    .sort((a, b) => Number(b.destino === "gasto_fijo") - Number(a.destino === "gasto_fijo") || a.orden - b.orden)
    .map((k) => ({ id: k.id, nombre: k.nombre, numero: NUMERO_DE_DESTINO[k.destino] }));

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi negocio</p>
          <h1 className="t-titulo">Finanzas</h1>
        </div>
      </header>
      <PestanasFinanzas />
      {!c.registra && <p className="fin-c-solo-mirar" role="note">Estás mirando: los pagos los registran el dueño o el gerente.</p>}

      <section className="os-kpis" aria-label="Resumen de pagos">
        <div className="os-kpi os-kpi--noche">
          <span className="os-kpi__rotulo">Por pagar hasta fin de mes</span>
          <span className="os-kpi__cifra fin-c-cifra">{enDosMonedas(porPagar.total)}</span>
          <span className="os-kpi__sub">{porPagar.cuantos === 0 ? "nada pendiente este mes" : porPagar.cuantos === 1 ? "1 pago, incluido lo vencido" : `${porPagar.cuantos} pagos, incluido lo vencido`}</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Pagado en {nombreDeMes(mes, false)}</span>
          <span className="os-kpi__cifra fin-c-cifra">{enDosMonedas(pagado)}</span>
          <span className="os-kpi__sub">ya salió de tu caja</span>
        </div>
        <div className="os-kpi">
          <span className="os-kpi__rotulo">Pagos que se repiten</span>
          <span className="os-kpi__cifra fin-c-cifra">{activos.length}</span>
          <span className="os-kpi__sub">{activos.length ? activos.slice(0, 3).map((p) => p.nombre.toLowerCase()).join(", ") + (activos.length > 3 ? "…" : "") : "todavía ninguno"}</span>
        </div>
      </section>

      <section className="os-tarjeta fin-c-pagos-lista" aria-label="Lo que pagas cada mes">
        <h2 className="t-seccion">Lo que pagas cada mes</h2>
        {activos.length === 0 ? (
          <div className="vacio">
            <p className="vacio__texto">Todavía no registras pagos que se repiten. Anota abajo el alquiler, los servicios o el contador: al pagarlos saldrán solos de tu caja.</p>
          </div>
        ) : (
          <ul className="fin-c-recurrentes">
            {activos.map((p) => {
              const estado = estadoPago(p.proximo_vencimiento, hoy);
              const susHechos = hechos.filter((h) => h.pago_id === p.id);
              const ultimo = ultimoHecho(susHechos);
              const cat = catDe.get(p.categoria_id);
              return (
                <li key={p.id} className="fin-c-recurrente">
                  <div className="fin-c-recurrente__fila">
                    <span className="fin-c-recurrente__nombre">
                      <b>{p.nombre}</b>
                      <span>
                        cada mes, el {p.dia} · {cat ? `${cat.nombre} → ${NUMERO_DE_DESTINO[cat.destino]}` : "sin categoría"}
                      </span>
                    </span>
                    <span className="fin-c-recurrente__monto">{textoMonto(p.monto, p.moneda)}</span>
                    <span className={`fin-c-chip fin-c-chip--${estado}`}>{textoVencimiento(p.proximo_vencimiento, hoy)}</span>
                    <span className="fin-c-recurrente__accion">
                      {c.registra ? <Pagar pagoId={p.id} monto={Number(p.monto)} hoy={hoy} /> : null}
                    </span>
                  </div>
                  <details className="fin-c-recurrente__mas">
                    <summary>Historial{c.registra ? " y cambios" : ""}</summary>
                    <div className="fin-c-recurrente__cuerpo">
                      {susHechos.length === 0 ? (
                        <p className="t-dato" style={{ color: "var(--grafito)" }}>Todavía sin pagos registrados.</p>
                      ) : (
                        <ul className="fin-c-historial">
                          {susHechos.slice(0, 8).map((h) => (
                            <li key={h.id}>
                              <span>
                                Vencimiento del {textoFechaCorta(h.ciclo)} · pagado el {textoFechaCorta(h.fecha)} · <b>{textoMonto(h.monto, p.moneda)}</b> · salió de la caja
                              </span>
                              {c.registra && ultimo?.id === h.id && <AnularPagoHecho hechoId={h.id} texto={`${textoMonto(h.monto, p.moneda)} del ${textoFechaCorta(h.fecha)}`} />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {c.registra && (
                        <EditarPago
                          pago={{ id: p.id, nombre: p.nombre, monto: Number(p.monto), categoria_id: p.categoria_id, dia: p.dia }}
                          categorias={deEgreso.some((k) => k.id === p.categoria_id) ? deEgreso : [...(cat ? [{ id: cat.id, nombre: cat.nombre, numero: NUMERO_DE_DESTINO[cat.destino] }] : []), ...deEgreso]}
                        />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Al pagar, el gasto sale solo de tu caja con su categoría y el vencimiento pasa al mes siguiente. No hay que anotarlo dos veces.</p>
      </section>

      {deBaja.length > 0 && (
        <details className="os-tarjeta fin-c-baja">
          <summary>Dados de baja · {deBaja.length}</summary>
          <ul className="fin-c-historial">
            {deBaja.map((p) => (
              <li key={p.id}>
                <span>
                  <b>{p.nombre}</b> · {textoMonto(p.monto, p.moneda)}
                  {p.motivo_baja ? ` · ${p.motivo_baja}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {c.registra && (
        <details className="os-tarjeta fin-c-nuevo">
          <summary className="fin-c-nuevo__boton">Nuevo pago que se repite</summary>
          {deEgreso.length ? (
            <NuevoPago categorias={deEgreso} hoy={hoy} />
          ) : (
            <p className="t-dato">No hay categorías de gasto activas. Crea una en la caja para poder registrar pagos.</p>
          )}
        </details>
      )}
    </div>
  );
}

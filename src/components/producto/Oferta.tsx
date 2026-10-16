"use client";
import { Fragment, useState } from "react";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";
import { moneda, numero, type ConfigEmpresa } from "@/lib/formato";
import type { Evaluacion, EvaluacionLinea, LineaProducto } from "@/lib/producto";
import { Dato } from "@/components/base/Vacio";
import { FormularioLinea } from "./FormularioLinea";
import { DecisionLinea, type OpcionDecision } from "./DecisionLinea";

const ORIGEN_TEXTO: Record<string, string> = {
  declarado: "declarado",
  extraido: "extraído, pendiente de conciliar",
  conciliado: "conciliado",
};

/** Lo que se revisa va en color de alerta; lo que no tiene datos, en gris: no es bueno ni malo, es desconocido. */
const COLOR_SUGERENCIA: Record<EvaluacionLinea["sugerencia"]["clave"], string> = {
  sin_datos: "var(--grafito)",
  sin_ventas: "var(--caducado)",
  contribucion_negativa: "var(--contradicho)",
  contribucion_cero: "var(--caducado)",
  con_datos: "var(--tinta)",
};

const SIN_DATO = <span style={{ color: "var(--grafito)" }}>sin dato</span>;

/** El detalle desplegable de un cálculo: fórmula, periodo, de dónde sale, lo que asume y lo que no dice. */
function ComoSeCalcula({ titulo, calculo }: { titulo: string; calculo: Calculo<unknown> }) {
  return (
    <details className="mt-2">
      <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)" }}>{titulo}</summary>
      <dl className="grid gap-2 mt-2 medida">
        {explicarCalculo(calculo).map((l) => (
          <div key={l.etiqueta}>
            <dt className="t-etiqueta">{l.etiqueta}</dt>
            <dd className="t-dato" style={{ margin: 0, color: "var(--grafito)" }}>{l.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** La celda de evaluación de una línea: lo que la cuenta dice, lo que falta y la sugerencia. Nunca un cero por un hueco. */
function Evaluada({ e, config }: { e: EvaluacionLinea; config: ConfigEmpresa }) {
  const dinero = (n: number) => moneda(n, config, { decimales: Number.isInteger(n) ? 0 : 2 });
  const servicio = e.tipo === "servicio";
  const unidad = servicio ? "caso" : "unidad";
  const deja =
    e.contribucion != null
      ? `deja ${dinero(e.contribucion)}${e.contribucion_unitaria != null ? ` (${dinero(e.contribucion_unitaria)} por ${unidad})` : ""}`
      : e.contribucion_unitaria != null
        ? `deja ${dinero(e.contribucion_unitaria)} por ${unidad}; el total del periodo no se sabe`
        : "lo que deja no se sabe";
  return (
    <>
      <div className="t-dato">
        {e.ingreso != null ? `Ingreso ${dinero(e.ingreso)}` : "Ingreso: sin dato"} · {deja}
        {e.participacion != null ? ` · ${numero(e.participacion * 100, config, { decimales: 1 })} % de la venta` : ""}
      </div>
      {servicio && (
        <div className="t-dato" style={{ color: "var(--grafito)" }}>
          Horas: {e.horas != null ? `${numero(e.horas, config)} h` : "sin dato"}
          {e.ingreso_por_hora != null ? ` · ${dinero(e.ingreso_por_hora)} por hora` : ""}
        </div>
      )}
      <div className="t-dato mt-1" style={{ color: COLOR_SUGERENCIA[e.sugerencia.clave], fontWeight: 600 }}>{e.sugerencia.texto}</div>
      {e.motivos.length > 0 && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{e.motivos.join(" · ")}</div>}
    </>
  );
}

/**
 * LO QUE VENDE LA EMPRESA, vista de la consultora: cada línea con sus datos, lo que la cuenta dice de
 * ella y la decisión. La evaluación es aritmética y se calcula en el servidor; aquí solo se muestra.
 * La decisión nunca viene marcada por el sistema: la fija la consultora, con su motivo.
 */
export function Oferta({
  companyId,
  lineas,
  evaluacion,
  dePeriodo,
  config,
  decisiones,
}: {
  companyId: string;
  lineas: LineaProducto[];
  evaluacion: Evaluacion;
  /** El periodo evaluado, listo para la frase («de septiembre de 2026», «del primer semestre de 2026»); null cuando las líneas no declaran periodo. */
  dePeriodo: string | null;
  config: ConfigEmpresa;
  decisiones: OpcionDecision[];
}) {
  const [abierta, setAbierta] = useState<{ id: string; que: "editar" | "decidir" } | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const porId = new Map(evaluacion.lineas.map((e) => [e.id, e]));
  const textoDecision = new Map(decisiones.map((d) => [d.clave, d.texto]));
  const dinero = (n: number | null) => (n == null ? SIN_DATO : moneda(n, config, { decimales: Number.isInteger(n) ? 0 : 2 }));
  const cantidad = (n: number | null) => (n == null ? SIN_DATO : numero(n, config));
  const t = evaluacion.totales;
  const h = evaluacion.horas;
  const hayServicios = lineas.some((l) => l.tipo === "servicio");
  const cerrar = () => setAbierta(null);

  return (
    <div className="flex flex-col gap-8">
      {lineas.length > 0 && (
        <section>
          <div className="fila-numeros">
            <Dato etiqueta={dePeriodo ? `Líneas ${dePeriodo}` : "Líneas, sin periodo declarado"} valor={`${t.de}${t.fuera_de_periodo ? ` (y ${t.fuera_de_periodo} de otro periodo)` : ""}`} />
            <Dato etiqueta="Con precio, costo y vendido" valor={`${t.completas} de ${t.de}`} />
            <Dato etiqueta={t.parcial ? "Lo que dejan las completas" : "Lo que dejan en el periodo"} valor={dinero(t.contribucion)} />
          </div>
          {t.aviso && <p className="t-dato mt-3" style={{ color: "var(--caducado)" }}>{t.aviso}.</p>}
          <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>
            «Lo que deja» es el precio menos el costo variable de cada unidad, por lo vendido. No descuenta alquiler, planilla ni otros gastos fijos: no es la utilidad.
          </p>
          {evaluacion.calculos.sku && <ComoSeCalcula titulo="Cómo se calcula lo que deja cada línea" calculo={evaluacion.calculos.sku} />}
          {hayServicios && (
            <div className="mt-4">
              <p className="t-dato">
                Horas que piden los servicios: {h.total != null ? `${numero(h.total, config)} h` : "sin dato"}
                {h.disponibles != null ? ` · disponibles: ${numero(h.disponibles, config)} h` : ""}
                {h.utilizacion_pct != null ? ` · uso de la capacidad: ${numero(h.utilizacion_pct, config, { decimales: 0 })} %` : ""}
              </p>
              {h.motivo && <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>{h.motivo}</p>}
              {evaluacion.calculos.servicio && <ComoSeCalcula titulo="Cómo se calcula el uso de la capacidad" calculo={evaluacion.calculos.servicio} />}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="t-seccion">Líneas</h2>
          <button type="button" className="boton boton--secundario" onClick={() => setAnadiendo((v) => !v)}>
            {anadiendo ? "Cerrar" : "Añadir producto o servicio"}
          </button>
        </div>
        {anadiendo && (
          <div className="mb-5">
            <FormularioLinea companyId={companyId} alCerrar={() => setAnadiendo(false)} />
          </div>
        )}

        {lineas.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto o servicio</th>
                  <th>Precio</th>
                  <th>Costo por unidad o caso</th>
                  <th>Vendido</th>
                  <th>Evaluación</th>
                  <th>Decisión</th>
                  <th aria-label="Acciones"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const e = porId.get(l.id);
                  const detalle = [l.codigo, l.tipo === "servicio" ? "servicio" : "producto", l.origen ? ORIGEN_TEXTO[l.origen] : null].filter(Boolean).join(" · ");
                  return (
                    <Fragment key={l.id}>
                      <tr>
                        <td className="t-dato" style={{ minWidth: 200 }}>
                          {l.nombre}
                          <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{detalle}</div>
                        </td>
                        <td className="t-dato">{dinero(l.precio)}</td>
                        <td className="t-dato">{dinero(l.costo_variable_unitario)}</td>
                        <td className="t-dato">
                          {cantidad(l.unidades_periodo)}
                          {l.unidades_periodo != null && <span style={{ color: "var(--grafito)" }}> {l.tipo === "servicio" ? "casos" : "unid."}</span>}
                        </td>
                        <td style={{ minWidth: 280 }}>{e ? <Evaluada e={e} config={config} /> : SIN_DATO}</td>
                        <td style={{ minWidth: 190 }}>
                          {l.decision ? (
                            <>
                              <div className="t-dato" style={{ fontWeight: 600 }}>{textoDecision.get(l.decision) ?? l.decision}</div>
                              <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{l.decision_motivo}</div>
                            </>
                          ) : (
                            <span className="t-dato" style={{ color: "var(--grafito)" }}>Sin decidir</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--marca)", padding: 0 }} onClick={() => setAbierta({ id: l.id, que: "decidir" })}>
                              {l.decision ? "Cambiar decisión" : "Decidir"}
                            </button>
                            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }} onClick={() => setAbierta({ id: l.id, que: "editar" })}>
                              Editar datos
                            </button>
                          </div>
                        </td>
                      </tr>
                      {abierta?.id === l.id && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--papel)" }}>
                            {abierta.que === "editar" ? (
                              <FormularioLinea companyId={companyId} linea={l} alCerrar={cerrar} />
                            ) : (
                              <DecisionLinea companyId={companyId} linea={l} opciones={decisiones} sugerencia={e?.sugerencia ?? null} alCerrar={cerrar} />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

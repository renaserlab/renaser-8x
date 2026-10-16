"use client";
import { useState } from "react";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { numeroEscrito } from "@/lib/numero-escrito";
import { nombreDePeriodo } from "@/lib/temporadas";
import { FRECUENCIA_TEXTO, TEXTO_FALTA_MOTIVO, motivoSuficiente, periodoCerradoMasReciente, zonaDe, type Frecuencia } from "@/lib/kpis";
import { MotivoArchivo } from "@/components/kpis/MotivoArchivo";

export type Indicador = {
  id: string;
  clave: string;
  nombre: string;
  como_se_mide: string;
  unidad: string;
  mejor_si: "sube" | "baja" | "neutro";
  meta_valor: number | null;
  meta_texto: string | null;
  frecuencia: string;
  origen_texto: string | null;
  estado: "propuesto" | "activo" | "archivado";
};

export type ValorIndicador = { clave: string; periodo: string; valor: number };

/** Cada cuánto se anota, con las cinco frecuencias que existen (antes faltaban quincenal y trimestral). */
const cadaCuanto = (frecuencia: string): string => FRECUENCIA_TEXTO[frecuencia as Frecuencia] ?? frecuencia;

function comoTexto(unidad: string, n: number): string {
  if (unidad === "soles") return `S/${Math.round(n).toLocaleString("es-PE")}`;
  if (unidad === "de_cada_10") return `${n} de cada 10`;
  if (unidad === "porcentaje") return `${n}%`;
  if (unidad === "dias") return `${n} días`;
  return String(n);
}

/**
 * LO QUE SE REPITE SE MIDE. En el catálogo estaba escrito que "las incidencias son la mina de KPIs"
 * y no había una sola línea que las extrajera: lo que salía mal seguido se quedaba en un párrafo.
 *
 * Nacen PROPUESTOS y el dueño decide cuáles adopta. Un número que él no eligió no lo va a contar, y
 * un indicador que nadie cuenta es peor que ninguno: aparenta control sin darlo.
 *
 * Desde el 13-10-2026 este bloque ya no anota por su cuenta: la ruta a la que llama pasa por el mismo
 * camino que «Tus indicadores» (registrarValor). Consecuencias a la vista: «Este no me sirve» pide el
 * motivo antes de archivar, y un indicador que no se anota cada mes se registra en «Tus indicadores»,
 * porque aquí solo se ofrece el mes que cerró.
 *
 * QUÉ MES CERRÓ lo dice el reloj de la EMPRESA (`zona`), no el del servidor. Antes llegaba calculado por la
 * página con el reloj del servidor (UTC en producción): entre las 19:00 y las 24:00 de Lima del último día
 * del mes el botón ofrecía un mes que todavía no había cerrado, y la ruta lo rechazaba.
 *
 * LO QUE ESTA LISTA NO PROMETE. Un corte guarda solo los nueve números (`valoresActuales`, en
 * src/lib/medicion.ts): un indicador propio no entra en los cortes, y el texto ya no dice que sí. La serie
 * que se ve aquí sale de «Tus números» (`company_metricas`), donde queda todo valor MENSUAL, se anote en esta
 * lista o en «Tus indicadores». Lo que no es mensual no vive en esa tabla: se registra y se ve allá.
 *
 * EL TEXTO DEPENDE DE LA FRECUENCIA (cierre Z5). «Anota cada uno cuando cierre el mes» se decía de todos, también
 * de los que se anotan cada semana; y de esos no se decía que sus valores no llegan a los cortes (no se reflejan
 * en «Tus números», que es de donde lee un corte). Ahora la cabecera habla de los mensuales y de los demás por
 * separado, con la frecuencia de cada uno, y cada fila no mensual dice dónde se registra y que no entra en los cortes.
 */
export function Indicadores({
  companyId,
  indicadores,
  valores,
  zona,
}: {
  companyId: string;
  indicadores: Indicador[];
  valores: ValorIndicador[];
  /**
   * @deprecated Lo calculaba la página con el reloj del servidor. Ya no decide nada: el mes que cerró se
   * calcula aquí, con el reloj de la empresa. Se sigue aceptando para no romper a quien todavía lo pasa.
   */
  periodoActual?: string;
  /** companies.zona_horaria. Si la página no la pasa, o viene vacía o inventada, America/Lima: nunca UTC. */
  zona?: string | null;
}) {
  const [anotando, setAnotando] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Sin fecha explícita: «ahora», leído en el reloj de la empresa. Es el mismo mes que la ruta va a aceptar.
  const periodoActual = periodoCerradoMasReciente("mensual", undefined, zonaDe(zona));

  const propuestos = indicadores.filter((i) => i.estado === "propuesto");
  const activos = indicadores.filter((i) => i.estado === "activo");
  // Qué se le dice de cómo se anotan: los mensuales aquí; los demás, con su frecuencia, en «Tus indicadores».
  const hayMensuales = activos.some((i) => i.frecuencia === "mensual");
  const otrasFrecuencias = [...new Set(activos.filter((i) => i.frecuencia !== "mensual").map((i) => cadaCuanto(i.frecuencia)))];
  const comoSeAnotan = [
    hayMensuales
      ? otrasFrecuencias.length
        ? "Los que se anotan cada mes se anotan aquí, cuando cierre el mes; aquí los ves junto a los meses anteriores."
        : "Anota cada uno cuando cierre el mes; aquí lo ves junto a los meses anteriores."
      : null,
    otrasFrecuencias.length ? `Los que se anotan ${otrasFrecuencias.join(" o ")} se registran en «Tus indicadores»: no se ven en esta lista ni entran en tus cortes.` : null,
    hayMensuales ? "Tus cortes comparan solo los nueve números de tu negocio: lo que anotes aquí no entra en ellos, salvo que el indicador sea uno de esos nueve." : null,
  ].filter(Boolean).join(" ");

  const cambiar = async (id: string, cuerpo: Record<string, unknown>) => {
    // Sin motivo no se archiva: ni siquiera se le pregunta al servidor (que también lo exige).
    if (cuerpo.estado === "archivado" && !motivoSuficiente(typeof cuerpo.motivo === "string" ? cuerpo.motivo : null)) {
      setError(TEXTO_FALTA_MOTIVO);
      return;
    }
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await pedir<{ listo?: boolean; aviso?: string | null } | null>(`/api/companies/${companyId}/indicadores`, { method: "PATCH", json: { indicador_id: id, ...cuerpo } });
      if (r?.aviso) {
        // Hay algo que decirle a quien anotó (el valor entró, pero «Tus números» no cambió): no se recarga encima.
        setAviso(r.aviso);
        setAnotando(null);
        setTrabajando(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo.");
      setTrabajando(false);
    }
  };

  const pedirPropuesta = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/indicadores`, { method: "POST", json: {} });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos pedirlo.");
      setTrabajando(false);
    }
  };

  const serieDe = (clave: string) =>
    valores.filter((v) => v.clave === clave).sort((a, b) => b.periodo.localeCompare(a.periodo)).slice(0, 4);

  if (indicadores.length === 0)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Los números que hay que vigilar</h2>
        <p className="t-cuerpo medida mb-4">
          Lo que sale mal una y otra vez es lo que hay que medir. Cuando nos cuentes qué se repite en tu día a día,
          sacamos de ahí los pocos números que avisan si el problema vuelve.
        </p>
        {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={pedirPropuesta}>
          {trabajando ? "Buscando" : "Sacar los números de lo que ya contamos"}
        </button>
      </section>
    );

  return (
    <section className="flex flex-col gap-6">
      {propuestos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Números que te proponemos vigilar</h2>
          <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
            Salen de lo que tú mismo contaste que sale mal. Quédate solo con los que de verdad vayas a contar:
            un número que nadie cuenta es peor que ninguno.
          </p>
          <ul className="flex flex-col gap-3">
            {propuestos.map((i) => (
              <li key={i.id} className="panel p-4">
                <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                {i.origen_texto && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Sale de: {i.origen_texto}</p>}
                <p className="t-dato mt-2">Cómo se mide: {i.como_se_mide}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                  Se anota {cadaCuanto(i.frecuencia)}
                  {i.meta_texto ? ` · Meta: ${i.meta_texto}` : i.meta_valor != null ? ` · Meta: ${comoTexto(i.unidad, i.meta_valor)}` : ""}
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando} onClick={() => cambiar(i.id, { estado: "activo" })}>
                    Vigilar este
                  </button>
                  <button
                    type="button" className="t-dato" disabled={trabajando}
                    style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }}
                    onClick={() => { setDescartando(i.id); setError(null); }}
                  >
                    Este no me sirve
                  </button>
                </div>
                {descartando === i.id && (
                  <MotivoArchivo nombre={i.nombre} trabajando={trabajando} alConfirmar={(motivo) => cambiar(i.id, { estado: "archivado", motivo })} alCancelar={() => setDescartando(null)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Los que estás vigilando</h2>
          <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
            {comoSeAnotan} El punto de partida, la meta y la historia de cada uno están en{" "}
            <Link href="/portal/kpis" style={{ textDecoration: "underline" }}>Tus indicadores</Link>.
          </p>
          <ul className="flex flex-col gap-3">
            {activos.map((i) => {
              const serie = serieDe(i.clave);
              const ultimo = serie[0];
              const anterior = serie[1];
              const delta = ultimo && anterior ? ultimo.valor - anterior.valor : null;
              const mejoro = delta == null || delta === 0 || i.mejor_si === "neutro" ? null : i.mejor_si === "sube" ? delta > 0 : delta < 0;
              return (
                <li key={i.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div style={{ minWidth: 0 }}>
                      <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{i.como_se_mide}</p>
                    </div>
                    {ultimo && (
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <p style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: mejoro === true ? "var(--confirmado)" : mejoro === false ? "var(--contradicho)" : "var(--tinta)", lineHeight: 1.1 }}>
                          {comoTexto(i.unidad, ultimo.valor)}
                        </p>
                        <p className="t-dato" style={{ color: "var(--grafito)" }}>{nombreDePeriodo(ultimo.periodo)}</p>
                      </div>
                    )}
                  </div>

                  {serie.length > 1 && (
                    <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                      Antes: {serie.slice(1).map((v) => `${nombreDePeriodo(v.periodo)} ${comoTexto(i.unidad, v.valor)}`).join(" · ")}
                    </p>
                  )}
                  {(i.meta_texto || i.meta_valor != null) && (
                    <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                      Meta: {i.meta_texto ?? comoTexto(i.unidad, i.meta_valor!)}
                    </p>
                  )}

                  {i.frecuencia !== "mensual" ? (
                    <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
                      Este se anota {cadaCuanto(i.frecuencia)}, no por mes:{" "}
                      <Link href="/portal/kpis" style={{ textDecoration: "underline" }}>regístralo en Tus indicadores</Link>.
                      Lo que anotes allí se ve allí, no en esta lista. Tampoco entra en tus cortes.
                    </p>
                  ) : anotando === i.id ? (
                    <div className="flex gap-2 mt-3 flex-wrap items-center">
                      <input
                        className="campo" style={{ maxWidth: 160 }} inputMode="decimal" autoFocus
                        placeholder={`¿Cuánto en ${nombreDePeriodo(periodoActual)}?`}
                        value={monto} onChange={(e) => setMonto(e.target.value)}
                        aria-label={`Valor de ${i.nombre}`}
                      />
                      <button
                        type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando || !monto.trim()}
                        onClick={() => {
                          const n = numeroEscrito(monto, { negativo: true });
                          if (typeof n !== "number") { setError("Escribe solo el número."); return; }
                          cambiar(i.id, { valor: n, periodo: periodoActual });
                        }}
                      >
                        Guardar
                      </button>
                      <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => setAnotando(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button" className="boton boton--secundario mt-3" style={{ minHeight: 34, fontSize: 13 }}
                      onClick={() => { setAnotando(i.id); setMonto(""); setError(null); }}
                    >
                      Anotar el de {nombreDePeriodo(periodoActual)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {aviso && <p className="t-cuerpo medida" style={{ color: "var(--caducado)" }} role="status">{aviso}</p>}
      {propuestos.length === 0 && (
        <div>
          <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 14 }} disabled={trabajando} onClick={pedirPropuesta}>
            {trabajando ? "Buscando" : "Buscar más números en lo que contamos"}
          </button>
        </div>
      )}
    </section>
  );
}

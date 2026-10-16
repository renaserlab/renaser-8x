"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { rotuloFidelidad, citaDe, afirmacionYaDecidida, numeroYaDecidido, resumenLecturaEnParte, type FragmentoCitado } from "@/lib/documentos/fidelidad";
import { VITAL_POR_CLAVE, RECONOCIDA_POR_CLAVE } from "@/lib/metricas";
import { nombreDePeriodo } from "@/lib/temporadas";
import { PILAR, ESTADO_CONSULTOR } from "@/lib/textos";

/**
 * REVISA LO QUE LEÍMOS ANTES DE QUE CUENTE (R10.2).
 *
 * Lo extraído de un PDF, Word, Excel o CSV se muestra fila por fila con el trozo del documento del que
 * salió (página, párrafo y título, hoja y celda) y la fidelidad de la lectura. El consultor decide cada
 * fila: nada queda confirmado por omisión, y «Consolidar» solo se habilita cuando todas tienen decisión.
 * Lo que aún no se revisó NO está oculto: existe en la base como «extraido» y se ve en la radiografía y
 * en el portal con ese rótulo (metricas.ts: «extraído, pendiente de conciliar»). Lo que esta pantalla
 * decide es qué pasa a conciliado y qué se descarta; decir que «no cuenta» sería falso.
 *
 * No hay atajo para «confirmar el resto»: confirmar sin mirar no es confirmar.
 *
 * Solo se pide decidir lo que aún no tiene decisión. Si la ruta responde que la fuente sigue pendiente (llegaron
 * filas nuevas mientras se revisaba: otra pestaña, una reextracción), la pantalla no se cierra ni se bloquea:
 * muestra las que faltan y deja consolidar otra vez. Lo que ya se decidió en una tanda anterior no se vuelve a
 * pedir ni a enviar; se cuenta en una línea para que se sepa que está. La regla de «ya decidido» es la misma
 * que usa la ruta (fidelidad.ts · afirmacionYaDecidida, numeroYaDecidido).
 *
 * Una fuente grande viaja en varias tandas y TODAS se envían: ninguna decisión se queda en la pantalla porque
 * una tanda anterior ya «cerró». Para eso solo la última pide cerrar (`cerrar: true`); las demás guardan y nada más.
 *
 * Una lectura en curso no se revisa: si la página avisa de que la fuente todavía se está leyendo (`leyendo`), el
 * botón no se ofrece; y si no lo avisa, la ruta lo comprueba igual y responde con el motivo en vez de cerrar.
 * Si la lectura no terminó y ya nadie la lee (`lecturaCortada`), se dice eso y no que «se está leyendo».
 * Y si la página no pudo mirar la cola de trabajos (`lecturaSinComprobar`), no afirma ni lo uno ni lo otro: dice que
 * no se pudo comprobar y deja revisar, porque la ruta lo comprueba por su cuenta al consolidar y, si la lectura
 * sigue en curso, responde con el motivo en vez de cerrar. Cerrar el botón aquí dejaría sin poder consolidar a
 * nadie mientras esa consulta fallara.
 *
 * Una lectura EN PARTE se dice arriba, antes que nada: si un tramo de la fuente falló, la nota de la lectura
 * empieza por «Se leyó en parte» y lo que hay en esta pantalla es solo lo que se leyó. Se puede revisar y
 * consolidar, pero sabiendo que falta una parte; al consolidar, la ruta lo deja anotado en la fuente y la
 * pantalla repite el aviso junto al resultado.
 *
 * Nada interno a la vista: los números se nombran como se le nombran al dueño (metricas.ts · VITALES y
 * RECONOCIDAS), los periodos en palabras (temporadas.ts) y los pilares, tipos y estados con sus nombres
 * (textos.ts). Las claves (venta_mes, 2026-09, marketing, kpi) son del sistema, no del consultor.
 */

// El rótulo de fidelidad y la cita del fragmento viven en @/lib/documentos/fidelidad (sin "use client"),
// porque la página de servidor también los necesita y de un módulo de cliente no puede leer valores.
export type { FragmentoCitado };
export type ClaimPorRevisar = { id: string; texto: string; tipo: string | null; pilar: string | null; estado: string | null; fragmento: FragmentoCitado | null };
/** `estado` es opcional: si la página lo trae, un número descartado se reconoce por él; si no, por su nota. */
export type MetricaPorRevisar = { id: string; clave: string; periodo: string; valor: number | null; valor_texto: string | null; nota: string | null; estado?: string | null };

type AccionClaim = "confirmar" | "descartar" | "corregir";
type AccionMetrica = "aceptar" | "descartar" | "corregir";

/** Los tipos de afirmación del extractor (schemas · TipoClaim), en palabras. Lo que no esté aquí se muestra con espacios, nunca con guiones bajos. */
const TIPO_AFIRMACION: Record<string, string> = {
  vision: "Visión",
  proposito: "Propósito",
  meta: "Meta",
  proceso: "Proceso",
  rol: "Rol o puesto",
  kpi: "Indicador",
  precio: "Precio",
  politica: "Política",
  cliente: "Cliente",
  producto: "Producto o servicio",
  canal: "Canal de venta",
  otro: "Otro",
};

const enPalabras = (codigo: string | null | undefined, mapa: Record<string, string>): string | null => {
  if (!codigo) return null;
  return mapa[codigo] ?? codigo.replace(/_/g, " ");
};

/** «Ventas del mes», «Costos variables del mes»; una clave propia de la empresa (merma_mes) sale como «merma mes». */
export function nombreDeNumero(clave: string): string {
  return VITAL_POR_CLAVE.get(clave)?.nombre ?? RECONOCIDA_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");
}

type RespuestaConsolidar = {
  revision: "consolidada" | "pendiente";
  pendientes?: number;
  ya_decididas?: number;
  /** La fuente se consolidó con la lectura en parte: la ruta lo dejó anotado y manda el aviso para repetirlo aquí. */
  lectura_en_parte?: boolean;
  aviso?: string;
  claims: { confirmadas: number; corregidas: number; descartadas: number };
  metricas: { aceptadas: number; corregidas: number; descartadas: number };
};

/**
 * La ruta admite hasta 500 afirmaciones y 500 números por llamada, pero una llamada es una función con tiempo
 * contado y cada corrección o descarte con motivo es una escritura propia: 100 por tanda deja margen de sobra.
 */
export const FILAS_POR_TANDA = 100;

/**
 * Parte las decisiones en tandas que la ruta acepta. Siempre devuelve al menos una (vacía si no hay nada que
 * decidir): consolidar una lectura que no encontró nada también es una llamada. Sin esto, una fuente con más
 * de 500 filas se revisaba entera y luego no se podía consolidar nunca.
 */
export function tandasDeRevision<C, M>(claims: C[], metricas: M[], porTanda = FILAS_POR_TANDA): { claims: C[]; metricas: M[] }[] {
  const tandas: { claims: C[]; metricas: M[] }[] = [];
  for (let i = 0; i === 0 || i < Math.max(claims.length, metricas.length); i += porTanda) tandas.push({ claims: claims.slice(i, i + porTanda), metricas: metricas.slice(i, i + porTanda) });
  return tandas;
}

export function RevisarExtraccion({
  sourceId,
  nombre,
  fidelidad,
  fidelidadNota,
  claims: todasLasAfirmaciones,
  metricas: todosLosNumeros,
  leyendo = false,
  lecturaCortada = false,
  lecturaSinComprobar = false,
}: {
  sourceId: string;
  nombre: string;
  fidelidad: string | null;
  fidelidadNota: string | null;
  claims: ClaimPorRevisar[];
  metricas: MetricaPorRevisar[];
  /** true si la fuente todavía se está leyendo (o se pidió reextraerla): se dice, y no se ofrece consolidar. Si la página no lo sabe, la ruta lo comprueba. */
  leyendo?: boolean;
  /** true si la lectura empezó, no terminó y ya no hay ningún trabajo leyéndola: no «se está leyendo», se cortó. */
  lecturaCortada?: boolean;
  /** true si la página no pudo comprobar si la fuente se está leyendo: se dice, y consolidar se ofrece porque la ruta lo comprueba. */
  lecturaSinComprobar?: boolean;
}) {
  const router = useRouter();
  const [dc, setDc] = useState<Record<string, { accion: AccionClaim; texto: string }>>({});
  const [dm, setDm] = useState<Record<string, { accion: AccionMetrica; valor: string }>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Consolidada: la revisión terminó y el botón se cierra. */
  const [listo, setListo] = useState<string | null>(null);
  /** Guardado pero la fuente sigue pendiente: se dice, y se puede seguir. */
  const [aviso, setAviso] = useState<string | null>(null);

  // Lo que ya tiene decisión (de una tanda anterior) no se vuelve a pedir ni a enviar.
  const claims = todasLasAfirmaciones.filter((c) => !afirmacionYaDecidida(c.estado));
  const metricas = todosLosNumeros.filter((m) => !numeroYaDecidido(m));
  const yaDecididas = todasLasAfirmaciones.length - claims.length + (todosLosNumeros.length - metricas.length);

  const pendientes = claims.filter((c) => !dc[c.id]).length + metricas.filter((m) => !dm[m.id]).length;
  const fid = rotuloFidelidad(fidelidad) ?? { texto: "Fidelidad sin registrar", color: "var(--grafito)" };
  /** «Se leyó en parte: falló el tramo 2 de 3», o null si la lectura salió entera. */
  // Mientras la fuente se vuelve a leer no se muestra: esa nota es de la lectura anterior y pediría «vuelve a leerla» a quien ya lo hizo.
  const enParte = leyendo && !lecturaCortada ? null : resumenLecturaEnParte(fidelidadNota);

  const decidirClaim = (id: string, accion: AccionClaim) => setDc((d) => ({ ...d, [id]: { accion, texto: d[id]?.texto ?? claims.find((c) => c.id === id)?.texto ?? "" } }));
  const decidirMetrica = (id: string, accion: AccionMetrica) => setDm((d) => ({ ...d, [id]: { accion, valor: d[id]?.valor ?? String(metricas.find((m) => m.id === id)?.valor ?? "") } }));

  const consolidar = async () => {
    setError(null);
    setAviso(null);
    for (const c of claims) {
      const d = dc[c.id];
      if (d?.accion === "corregir" && !d.texto.trim()) return setError(`Escribe cómo debe decir la afirmación «${c.texto.slice(0, 60)}».`);
    }
    for (const m of metricas) {
      const d = dm[m.id];
      if (d?.accion === "corregir" && (d.valor.trim() === "" || !Number.isFinite(Number(d.valor)))) return setError(`Escribe el valor correcto para «${nombreDeNumero(m.clave)}» (${nombreDePeriodo(m.periodo)}).`);
    }
    setEnviando(true);
    const tandas = tandasDeRevision(
      claims.map((c) => ({ id: c.id, accion: dc[c.id].accion, texto: dc[c.id].accion === "corregir" ? dc[c.id].texto.trim() : undefined })),
      metricas.map((m) => ({ id: m.id, accion: dm[m.id].accion, valor: dm[m.id].accion === "corregir" ? Number(dm[m.id].valor) : undefined }))
    );
    const suma = { confirmadas: 0, afirmacionesDescartadas: 0, conciliados: 0, numerosDescartados: 0, yaDecididas: 0 };
    try {
      let r: RespuestaConsolidar | null = null;
      // Todas las tandas se envían, sin atajos: solo la última pide cerrar, así que ninguna anterior puede
      // dejar la fuente consolidada con decisiones todavía en la pantalla.
      for (let i = 0; i < tandas.length; i++) {
        r = await pedir<RespuestaConsolidar>(`/api/sources/${sourceId}/consolidar`, { json: { ...tandas[i], cerrar: i === tandas.length - 1 } });
        suma.confirmadas += r.claims.confirmadas + r.claims.corregidas;
        suma.afirmacionesDescartadas += r.claims.descartadas;
        suma.conciliados += r.metricas.aceptadas + r.metricas.corregidas;
        suma.numerosDescartados += r.metricas.descartadas;
        suma.yaDecididas += r.ya_decididas ?? 0;
      }
      const resumen = `${suma.confirmadas} afirmaciones confirmadas, ${suma.afirmacionesDescartadas} descartadas; ${suma.conciliados} números conciliados, ${suma.numerosDescartados} descartados.`;
      const saltadas = suma.yaDecididas ? ` ${suma.yaDecididas} fila(s) ya tenían decisión y se dejaron como estaban.` : "";
      // Si mientras tanto llegaron filas nuevas (otra pestaña, una reextracción), la fuente sigue pendiente: se dice
      // y NO se cierra el botón, porque al refrescar aparecen las que faltan y hay que poder consolidarlas.
      if (r?.revision === "consolidada") setListo(`Consolidado: ${resumen}${saltadas}${r.aviso ? ` ${r.aviso}` : ""}`);
      else setAviso(`Guardado: ${resumen}${saltadas} Quedan ${r?.pendientes ?? 0} fila(s) por revisar; la fuente sigue pendiente.`);
    } catch (e) {
      // Si falló a media revisión, las tandas anteriores ya se guardaron: se dice, y al refrescar esas filas dejan de pedirse.
      const hecho = suma.confirmadas + suma.afirmacionesDescartadas + suma.conciliados + suma.numerosDescartados;
      setError(`${e instanceof Error ? e.message : "No pudimos consolidar."}${hecho ? ` Se guardaron ${hecho} decisión(es) antes del fallo; el resto sigue por revisar.` : ""}`);
    } finally {
      setEnviando(false);
      router.refresh();
    }
  };

  const botonFila = (activo: boolean, texto: string, alHacer: () => void, peligro = false) => (
    <button type="button" className={`boton ${activo ? "" : peligro ? "boton--peligro" : "boton--secundario"}`} style={{ minHeight: 32, padding: "0 10px", opacity: activo ? 1 : 0.85 }} aria-pressed={activo} onClick={alHacer} disabled={enviando}>
      {texto}
    </button>
  );

  return (
    <section className="panel p-5 mb-6" style={{ borderColor: "var(--marca)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h3 className="t-seccion">Revisa lo que leímos antes de que cuente</h3>
        <span className="t-dato" style={{ color: fid.color }}>{fid.texto}</span>
      </div>
      {enParte && (
        <p className="t-cuerpo mb-3" role="alert" style={{ color: "var(--contradicho)" }}>
          {enParte}. Lo que traía esa parte no está aquí: lo que ves es solo lo que se leyó. Vuelve a leer la fuente para tenerla entera; si la consolidas así, quedará anotado en la fuente que se revisó una lectura en parte.
        </p>
      )}
      <p className="t-dato mb-1" style={{ color: "var(--grafito)" }}>
        {nombre}. Mientras no lo revises, lo leído ya se ve en la empresa rotulado como «extraído, pendiente de conciliar»: cuenta con esa marca, no como verificado. Al confirmar o corregir pasa a conciliado; lo que descartes queda guardado como descartado, con tu motivo: no desaparece.
      </p>
      {fidelidadNota && <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>Cómo se leyó: {fidelidadNota}</p>}

      {leyendo && !lecturaCortada && <p className="t-cuerpo" role="status">Esta fuente todavía se está leyendo. Lo que encuentre aparecerá aquí; se revisa y se consolida cuando la lectura termine, no antes.</p>}
      {leyendo && lecturaCortada && (
        <p className="t-cuerpo" role="alert" style={{ color: "var(--contradicho)" }}>
          La lectura de esta fuente se cortó antes de terminar y ya no hay nada leyéndola. Vuelve a leerla: se revisa y se consolida cuando una lectura termine entera, no antes.
        </p>
      )}
      {!leyendo && lecturaSinComprobar && (
        <p className="t-cuerpo mb-3" role="status" style={{ color: "var(--caducado)" }}>
          No pudimos comprobar si esta fuente todavía se está leyendo. Puedes revisar lo que hay; al consolidar se comprueba otra vez y, si la lectura sigue en curso, no se cerrará y te lo diremos.
        </p>
      )}
      {!leyendo && !claims.length && !metricas.length && yaDecididas === 0 && (
        <p className="t-cuerpo">No hay afirmaciones ni números por decidir. Si la lectura ya terminó y no encontró nada, consolida para dejar constancia de que la revisaste; si sigue en curso, no se cerrará hasta que termine.</p>
      )}
      {!leyendo && !claims.length && !metricas.length && yaDecididas > 0 && <p className="t-cuerpo">No queda nada por decidir. Consolida para cerrar la revisión.</p>}
      {yaDecididas > 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>{yaDecididas} fila(s) ya tienen decisión de una revisión anterior: no se vuelven a pedir.</p>}

      {claims.length > 0 && (
        <>
          <h4 className="t-etiqueta mt-4 mb-2">Afirmaciones ({claims.length})</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Lo que dice</th>
                  <th>De dónde salió</th>
                  <th>Tu decisión</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => {
                  const d = dc[c.id];
                  const rotulos = [enPalabras(c.pilar, PILAR), enPalabras(c.tipo, TIPO_AFIRMACION), c.estado && c.estado !== "sin_verificar" ? enPalabras(c.estado, ESTADO_CONSULTOR) : null].filter(Boolean);
                  return (
                    <tr key={c.id}>
                      <td>
                        {d?.accion === "corregir" ? (
                          <textarea className="campo" rows={2} value={d.texto} aria-label="Texto corregido" onChange={(e) => setDc((x) => ({ ...x, [c.id]: { accion: "corregir", texto: e.target.value } }))} />
                        ) : (
                          <span className="t-cuerpo" style={{ textDecoration: d?.accion === "descartar" ? "line-through" : "none" }}>{c.texto}</span>
                        )}
                        {rotulos.length > 0 && (
                          <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>
                            {rotulos.join(" · ")}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="t-dato">{citaDe(c.fragmento)}</div>
                        {c.fragmento?.texto && <div className="t-dato" style={{ color: "var(--grafito)", fontStyle: "italic" }}>«{c.fragmento.texto.slice(0, 220)}{c.fragmento.texto.length > 220 ? "…" : ""}»</div>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {botonFila(d?.accion === "confirmar", "Confirmar", () => decidirClaim(c.id, "confirmar"))}
                          {botonFila(d?.accion === "corregir", "Corregir", () => decidirClaim(c.id, "corregir"))}
                          {botonFila(d?.accion === "descartar", "Descartar", () => decidirClaim(c.id, "descartar"), true)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {metricas.length > 0 && (
        <>
          <h4 className="t-etiqueta mt-5 mb-2">Números ({metricas.length})</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Período</th>
                  <th>Valor leído</th>
                  <th>Tu decisión</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => {
                  const d = dm[m.id];
                  return (
                    <tr key={m.id}>
                      <td className="t-dato">
                        {nombreDeNumero(m.clave)}
                        {m.nota && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{m.nota}</div>}
                      </td>
                      <td className="t-dato">{nombreDePeriodo(m.periodo)}</td>
                      <td className="t-dato">
                        {d?.accion === "corregir" ? (
                          <input className="campo" type="number" step="any" value={d.valor} aria-label="Valor corregido" onChange={(e) => setDm((x) => ({ ...x, [m.id]: { accion: "corregir", valor: e.target.value } }))} style={{ maxWidth: 160 }} />
                        ) : (
                          <span style={{ textDecoration: d?.accion === "descartar" ? "line-through" : "none" }}>{m.valor === null ? "sin dato" : m.valor.toLocaleString("es-PE")}</span>
                        )}
                        {m.valor_texto && <div style={{ color: "var(--grafito)", fontStyle: "italic" }}>«{m.valor_texto}»</div>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {botonFila(d?.accion === "aceptar", "Aceptar", () => decidirMetrica(m.id, "aceptar"))}
                          {botonFila(d?.accion === "corregir", "Corregir", () => decidirMetrica(m.id, "corregir"))}
                          {botonFila(d?.accion === "descartar", "Descartar", () => decidirMetrica(m.id, "descartar"), true)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button type="button" className="boton" disabled={pendientes > 0 || enviando || !!listo || leyendo} onClick={consolidar}>
          {enviando ? "Consolidando" : "Consolidar"}
        </button>
        {pendientes > 0 && <span className="t-dato" style={{ color: "var(--grafito)" }}>{pendientes} fila(s) sin decidir. Cada fila se mira y se decide; no hay confirmación en bloque.</span>}
        {listo && <span className="t-dato" role="status" style={{ color: "var(--confirmado)" }}>{listo}</span>}
        {aviso && <span className="t-dato" role="status" style={{ color: "var(--caducado)" }}>{aviso}</span>}
        {error && <span className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>{error}</span>}
      </div>
    </section>
  );
}

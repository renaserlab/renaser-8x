"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import {
  nombreMedicion, etiquetaAtribucion, fechaDia, faltaEnPeriodo, pedidoDeMedicion, diasDePeriodo, duracionesEquivalentes, ordenDePeriodos, fraseProvisionales,
  type Medicion, type LecturaCorte, type TonoAtribucion,
} from "@/lib/medicion";
import { ROTULO_CIFRA_PROVISIONAL } from "@/lib/metricas";

/** El sello de cada lectura (.estado del sistema): atribuible en ok, parcial en espera, lo demás neutro. */
const SELLO_TONO: Record<TonoAtribucion, "ok" | "espera" | "neutro"> = { atribuible: "ok", parcial: "espera", neutro: "neutro" };

/**
 * ¿FUNCIONÓ LO QUE HICIMOS? La pregunta que hasta hoy era incontestable: el diagnóstico era una foto
 * única y los cortes guardaban texto libre. Aquí el dueño fija su punto de partida y, cada cierto
 * tiempo, registra un corte que se compara solo contra él.
 *
 * CON VERSIONES (13-10-2026): `base` es el punto de partida VIGENTE; `lectura.base`, la versión exacta
 * contra la que se midió el último corte (puede ser una anterior). Se dice siempre contra qué versión se
 * mide. Volver a fijar el punto de partida lo hace el consultor con su motivo: aquí solo se fija la primera vez.
 *
 * LA LECTURA NO SE CALCULA AQUÍ. `lectura` viene de `lecturaDeCorte` (src/lib/medicion.ts), la misma que
 * usa «Tus resultados»: el titular, si los períodos son comparables y qué parte de lo observado se puede
 * atribuir al trabajo. Si los períodos no son equivalentes —o no se sabe de qué fechas son— el titular lo
 * dice y no se pinta «mejoraron».
 *
 * EL PERÍODO SE PIDE ANTES DE CONGELAR. Hasta el 13-10-2026 esta pantalla congelaba sin preguntar de qué
 * fechas eran los números, así que ninguna comparación podía saber si medía un mes contra un mes. Ahora
 * el punto de partida y cada corte se guardan con sus fechas: el dueño las elige con un toque («son del
 * mes pasado») o las escribe. Las cajas nacen vacías; nada se da por contestado.
 */
export function Avance({
  companyId,
  base,
  ultimoCorte,
  lectura = null,
  cortes,
  numerosListos,
  mesPasado = null,
  hoy = null,
}: {
  companyId: string;
  base: Medicion | null;
  ultimoCorte: Medicion | null;
  /** La lectura del último corte contra SU versión del punto de partida. null mientras no haya corte. */
  lectura?: LecturaCorte | null;
  cortes: Medicion[];
  numerosListos: number;
  /** El último mes cerrado en el calendario de la empresa: se ofrece con un toque, nunca se rellena solo. */
  mesPasado?: { desde: string; hasta: string } | null;
  /** El día de hoy (AAAA-MM-DD) en el calendario de la empresa, para no aceptar un período que aún no termina. */
  hoy?: string | null;
}) {
  const [trabajando, setTrabajando] = useState<null | "linea_base" | "corte">(null);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  // La medición ya quedó congelada aunque algo falló después: no se ofrece congelar otra hasta recargar.
  const [yaCongelada, setYaCongelada] = useState(false);

  const ocupado = trabajando !== null || yaCongelada;
  const falta = faltaEnPeriodo(desde, hasta, hoy);
  const empezado = Boolean(desde || hasta);
  const dias = falta ? null : diasDePeriodo({ periodo_desde: desde, periodo_hasta: hasta });
  // Antes de congelar: si el punto de partida cubre 30 días y estas fechas 90, se avisa. No se impide.
  const diasBase = base ? diasDePeriodo(base) : null;
  const duracionDistinta = dias != null && diasBase != null && !duracionesEquivalentes(diasBase, dias);
  // Y tiene que venir DESPUÉS: con dos toques a «son del mes pasado» en el mismo mes, el corte saldría con las
  // mismas fechas que el punto de partida y no habría antes y después. Se avisa antes de congelar.
  const orden = !falta && base ? ordenDePeriodos(base, { periodo_desde: desde, periodo_hasta: hasta }) : null;
  // Lo que se congeló como provisional en el punto de partida: se dice con su nombre, no se deja pasar por firme.
  // La frase es una sola para todas las pantallas (`fraseProvisionales`); null si nada era provisional.
  const provisionalBase = base ? fraseProvisionales(base, "esa foto") : null;

  const congelar = async (tipo: "linea_base" | "corte") => {
    // Sin el período entero no se manda nada: el botón está apagado, y esto lo vuelve a comprobar.
    const pedido = pedidoDeMedicion(tipo, desde, hasta, hoy);
    if (!pedido) return;
    setTrabajando(tipo);
    setError(null);
    try {
      const r = await pedir<{ aviso_guardado?: string } | null>(`/api/companies/${companyId}/medicion`, { method: "POST", json: pedido });
      // Quedó congelada pero sin sus fechas: se dice, no se recarga encima como si nada, y los botones se
      // quedan apagados para que un segundo toque no congele otra igual. (Lo provisional no detiene la recarga:
      // la página que vuelve lo dice junto al punto de partida y junto a cada número que se movió.)
      if (r?.aviso_guardado) {
        setError(`${r.aviso_guardado} Recarga la página para verla.`);
        setYaCongelada(true);
        setTrabajando(null);
        return;
      }
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos guardar la medición.";
      // Ya hay un punto de partida que esta pantalla no vio (otra pestaña, el consultor): no se vuelve a
      // fijar desde aquí sin motivo; se recarga para verlo.
      setError(/ya hay un punto de partida/i.test(msg) ? `${msg} Recarga la página para verlo.` : msg);
      setTrabajando(null);
    }
  };

  // DE QUÉ FECHAS SON LOS NÚMEROS. Va antes de cada botón que congela.
  const periodo = (para: "linea_base" | "corte") => (
    <fieldset className="mb-4" style={{ border: 0, padding: 0, marginInline: 0, minWidth: 0 }}>
      <legend className="t-cuerpo fuerte" style={{ padding: 0 }}>¿De qué fechas son estos números?</legend>
      <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
        Así comparamos un mes con un mes, y no un mes con tres. Sin las fechas no podremos decirte después si el negocio mejoró.
      </p>
      {mesPasado && (
        <button
          type="button"
          className="boton boton--secundario mt-2 boton--chico"
          disabled={ocupado}
          aria-pressed={desde === mesPasado.desde && hasta === mesPasado.hasta}
          onClick={() => { setDesde(mesPasado.desde); setHasta(mesPasado.hasta); }}
        >
          Son del mes pasado: del {fechaDia(mesPasado.desde)} al {fechaDia(mesPasado.hasta)}
        </button>
      )}
      <div className="flex gap-3 flex-wrap mt-2">
        <label className="etiqueta-campo">
          {mesPasado ? "O desde el día" : "Desde el día"}
          <input className="campo" type="date" aria-label="Desde qué día son los números" value={desde} max={hoy ?? undefined} disabled={ocupado} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="etiqueta-campo">
          hasta el día
          <input className="campo" type="date" aria-label="Hasta qué día son los números" value={hasta} max={hoy ?? undefined} disabled={ocupado} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>
      {empezado && falta && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{falta}</p>}
      {!falta && (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          Se guardan como los números del {fechaDia(desde)} al {fechaDia(hasta)}{dias != null ? ` (${dias} ${dias === 1 ? "día" : "días"})` : ""}.
        </p>
      )}
      {para === "corte" && orden && base && (
        <p className="t-dato mt-1 medida texto-alto" role="alert">
          {orden === "mismo_periodo"
            ? `Estas son las mismas fechas de tu punto de partida (del ${fechaDia(base.periodo_desde)} al ${fechaDia(base.periodo_hasta)}): no habría antes y después, y el corte no se podría leer como resultado. Elige fechas posteriores.`
            : `Estas fechas no vienen después de las de tu punto de partida (del ${fechaDia(base.periodo_desde)} al ${fechaDia(base.periodo_hasta)}): no habría antes y después, y el corte no se podría leer como resultado. Elige fechas posteriores.`}
        </p>
      )}
      {para === "corte" && !orden && duracionDistinta && (
        <p className="t-dato mt-1 medida" style={{ color: "var(--caducado)" }}>
          Tu punto de partida cubre {diasBase} días y estas fechas, {dias}: no se van a poder comparar tal cual. Si puedes, elige un período que dure lo mismo.
        </p>
      )}
    </fieldset>
  );

  // SIN PUNTO DE PARTIDA: no se puede medir nada todavía, y se dice por qué.
  if (!base)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Tu punto de partida</h2>
        <p className="t-cuerpo medida mb-4">
          Para poder decirte más adelante si el negocio mejoró, primero hay que dejar guardado cómo está hoy.
          Es una foto de tus números con la fecha de hoy: el «antes» contra el que vamos a comparar todo.
        </p>
        {numerosListos < 5 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
            Todavía no. Con {numerosListos} de 9 números la foto saldría en blanco. Completa al menos 5 y vuelve aquí.
          </p>
        ) : (
          <>
            {periodo("linea_base")}
            {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            <button type="button" className="boton boton--secundario" disabled={ocupado || falta != null} onClick={() => congelar("linea_base")}>
              {trabajando === "linea_base" ? "Guardando" : "Fijar mi punto de partida"}
            </button>
            {!empezado && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Elige primero de qué fechas son tus números.</p>}
          </>
        )}
      </section>
    );

  // CON PUNTO DE PARTIDA PERO SIN CORTE: se explica qué sigue.
  if (!ultimoCorte || !lectura)
    return (
      <section className="panel p-5">
        <h2 className="t-seccion mb-2">Tu punto de partida</h2>
        <p className="t-cuerpo medida mb-2">
          Quedó fijado el <strong>{fechaDia(base.fecha)}</strong> con {Object.keys(base.valores).length} números (versión {base.version ?? 1}).{" "}
          {diasBase != null
            ? `Son los números del ${fechaDia(base.periodo_desde)} al ${fechaDia(base.periodo_hasta)}.`
            : "No quedó anotado de qué fechas son esos números."}{" "}
          A partir de aquí, todo lo que hagamos se mide contra esa foto.
        </p>
        {provisionalBase && <p className="t-dato medida mb-2 texto-espera">{provisionalBase}</p>}
        <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
          Cuando pase un mes, actualiza tus números arriba y registra un corte: ahí vas a ver, en soles, qué se movió.
          Si hubiera que corregir el punto de partida, lo hace tu consultor diciendo por qué: queda una versión nueva y la anterior se conserva.
        </p>
        {periodo("corte")}
        {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <button type="button" className="boton boton--secundario" disabled={ocupado || falta != null} onClick={() => congelar("corte")}>
          {trabajando === "corte" ? "Guardando" : "Registrar un corte ahora"}
        </button>
        {!empezado && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Elige primero de qué fechas son tus números.</p>}
      </section>
    );

  // CON COMPARACIÓN: el titular primero, el detalle después. Siempre contra la versión exacta con la que se midió.
  const v = lectura.veredicto;
  const contra = lectura.base ?? base;
  const noComparable = lectura.noComparable;
  const periodos = lectura.periodos;
  const grave = periodos?.veredicto === "no_equivalentes";
  return (
    <section className="flex flex-col gap-5">
      <div className="panel p-5">
        <p className="t-etiqueta">Tu avance</p>
        <p className="t-hero mt-2" style={{ maxWidth: lectura.esResultado ? "26ch" : "40ch" }}>{lectura.titular}</p>
        {noComparable ? (
          <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
            {nombreMedicion(ultimoCorte)} del {fechaDia(ultimoCorte.fecha)} · tu punto de partida de hoy es la versión {base.version ?? 1}, del {fechaDia(base.fecha)}
          </p>
        ) : (
          <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
            {nombreMedicion(ultimoCorte)} del {fechaDia(ultimoCorte.fecha)}, medido contra la versión {contra.version ?? 1} de tu punto de partida ({fechaDia(contra.fecha)})
            {v.dias != null && v.dias > 0 && ` · ${v.dias} días`}
          </p>
        )}
        {lectura.avisoVersion && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{lectura.avisoVersion}</p>}
        {!noComparable && contra.id !== base.id && (
          <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
            Hoy rige la versión {base.version ?? 1} del {fechaDia(base.fecha)}; esta comparación no cambia por eso. El próximo corte se medirá contra la versión de hoy.
          </p>
        )}
        {/* ¿SE PUEDEN COMPARAR LOS PERÍODOS? El mismo veredicto que lee en «Tus resultados», aquí también. */}
        {periodos && (
          <p className={grave ? "t-dato mt-2 medida fuerte" : "t-dato mt-2 medida"} style={{ color: grave ? "var(--contradicho)" : periodos.veredicto === "sin_periodo" ? "var(--caducado)" : "var(--grafito)" }}>
            {periodos.texto}
          </p>
        )}
        {/* OBSERVADO NO ES ATRIBUIBLE: qué parte de lo que se movió se puede adjudicar al trabajo. */}
        {lectura.lecturaAtribucion && <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>{lectura.lecturaAtribucion}</p>}
        {/* «Mejoraron / empeoraron» es un veredicto: solo se pinta cuando la comparación vale. */}
        {lectura.esResultado && (
          <div className="flex gap-5 mt-4 flex-wrap">
            {[
              { n: v.mejoraron, t: "mejoraron", c: "var(--confirmado)" },
              { n: v.empeoraron, t: "empeoraron", c: "var(--contradicho)" },
              { n: v.sinCambio, t: "sin cambio", c: "var(--grafito)" },
            ].map((x) => (
              <div key={x.t}>
                <p className="cifra-media" style={{ color: x.c }}>{x.n}</p>
                <p className="t-dato" style={{ color: "var(--grafito)" }}>{x.t}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {lectura.atribuciones.length > 0 && (
      <div>
        <h2 className="t-seccion mb-1">Qué se movió</h2>
        <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>
          {lectura.esResultado ? "Primero lo que necesita atención. Al lado de cada número, si se puede decir que fue por el trabajo que hicimos." : "Lo que cambió en tus números, sin sacar conclusiones todavía."}
        </p>
        <ul className="lista-editorial">
          {lectura.atribuciones.map((a) => {
            const e = etiquetaAtribucion(a);
            // Si la comparación no es un resultado, subir o bajar no es mejorar ni empeorar: el punto no se pinta de verde ni de rojo.
            const punto = !lectura.esResultado ? "var(--linea)" : a.mejoro === true ? "var(--confirmado)" : a.mejoro === false ? "var(--contradicho)" : "var(--linea)";
            return (
              <li key={a.clave} style={{ padding: "11px 0" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span aria-hidden="true" className="punto-fila" style={{ background: punto }} />
                  <span className="t-cuerpo fuerte">{a.nombre}</span>
                  <span className={`estado ${SELLO_TONO[e.tono]}`}>{e.etiqueta}</span>
                  {/* Lo provisional se rotula junto al número, no solo dentro de la frase. */}
                  {a.provisional && <span className="estado espera">{ROTULO_CIFRA_PROVISIONAL}</span>}
                </div>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)", paddingLeft: 20 }}>{a.observado}</p>
                {a.delta != null && a.delta !== 0 && <p className="apunte" style={{ paddingLeft: 20 }}>{a.motivo}</p>}
              </li>
            );
          })}
        </ul>
      </div>
      )}

      <div className="panel p-5">
        <h2 className="t-seccion mb-2">El próximo corte</h2>
        <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
          Actualiza primero tus números arriba: el corte guarda lo que haya en ese momento.
        </p>
        {periodo("corte")}
        {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <button type="button" className="boton boton--secundario" disabled={ocupado || falta != null} onClick={() => congelar("corte")}>
          {trabajando === "corte" ? "Guardando" : "Registrar un corte nuevo"}
        </button>
        {!empezado && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Elige primero de qué fechas son tus números.</p>}
      </div>

      {cortes.length > 1 && (
        <details>
          <summary className="plegado-enlace">Cortes anteriores ({cortes.length - 1})</summary>
          <ul className="lista-editorial mt-2">
            {cortes.slice(1).map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3" style={{ padding: "7px 0" }}>
                <span className="t-dato">{nombreMedicion(c)}</span>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>{fechaDia(c.fecha)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

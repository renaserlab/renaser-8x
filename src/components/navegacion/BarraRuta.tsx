import Link from "next/link";
import { TEXTO_NO_SE_PUDO_LEER, type AvanceRuta, type CriterioEvaluado, type EtapaEvaluada } from "@/lib/ruta";
import { fechaDia } from "@/lib/medicion";

/**
 * LA BARRA DE AVANCE DE LA EMPRESA (pedido de Kelin, 16-10-2026: «arriba la barra de proceso y avance con cada
 * empresa»). No es navegación: dice en qué etapa de su ruta va la empresa y cuánto le falta para la compuerta.
 * Un tramo por etapa, de ancho proporcional a sus días: la pasada llena, la en curso con su % y su compuerta
 * marcada al final, las por venir claras. El calendario informa, nunca bloquea: pasarse de días se dice en
 * grafito, no en rojo. Lo que 8X no pudo leer se dibuja rayado y se nombra «no se pudo leer»; un % que no se
 * pudo calcular es «sin medir», nunca «0 %».
 * Presentacional: recibe el avance ya calculado (avanceDeEmpresa de src/lib/ruta-datos.ts).
 */

/** Un tramo de la barra: una etapa de la ruta. */
export type Tramo = {
  clave: string;
  nombre: string;
  estado: EtapaEvaluada["estado"];
  pct: number | null;
  /** Días que la etapa tiene previstos: fija el ancho del tramo. */
  dias: number;
  compuerta?: { nombre: string; veredicto: EtapaEvaluada["compuerta"]["veredicto"] };
};

/** El % de una etapa en palabras. Sin medir no es cero. */
export function textoPct(pct: number | null): string {
  return pct === null ? "sin medir" : `${pct} %`;
}

/** «Día 9 · la etapa prevé hasta el día 7»; antes de empezar, la fecha de inicio; sin día, nada. */
export function lineaDia(dia: number | null, inicio: string | null, hastaDia: number | null): string | null {
  if (dia === null) return null;
  if (dia < 1) return inicio ? `La ruta empieza el ${fechaDia(inicio)}` : null;
  return hastaDia === null ? `Día ${dia}` : `Día ${dia} · la etapa prevé hasta el día ${hastaDia}`;
}

const ESTADO_TRAMO: Record<Exclude<EtapaEvaluada["estado"], "en_curso">, string> = { pasada: "hecha", por_venir: "por venir" };

/** Los tramos, compartidos por la barra de la consultora y la del dueño (BarraRutaCliente). */
export function Tramos({ tramos }: { tramos: Tramo[] }) {
  return (
    <ol className="tramos">
      {tramos.map((t) => {
        const sinMedir = t.estado === "en_curso" && t.pct === null;
        const dato = t.estado === "en_curso" ? `en curso · ${textoPct(t.pct)}` : ESTADO_TRAMO[t.estado];
        return (
          <li key={t.clave} className="tramo" data-estado={t.estado} style={{ flexGrow: Math.max(1, t.dias) }} title={`${t.nombre}: ${dato}`}>
            <span className={sinMedir ? "pista sin-medir" : "pista"} aria-hidden="true">
              {t.estado === "en_curso" && t.pct !== null && <span className="relleno" style={{ width: `${Math.min(100, Math.max(0, t.pct))}%` }} />}
              {t.compuerta && <span className="compuerta" data-veredicto={t.compuerta.veredicto ?? "sin"} />}
            </span>
            <span className="tramo__texto">
              <span className="tramo__nombre">{t.nombre}</span>
              <span className="tramo__dato">{dato}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const SUGERIDO: Record<EtapaEvaluada["compuerta"]["sugerido"], string> = {
  verde: "8X sugiere verde",
  ambar: "8X sugiere ámbar",
  rojo: "8X sugiere rojo",
  no_se_pudo_leer: "8X no sugiere color: hay datos que no se pudieron leer",
};

/** Por qué un criterio todavía no está hecho, en una frase. */
function porQue(c: CriterioEvaluado): string {
  if (c.estado === "sin_medir") return TEXTO_NO_SE_PUDO_LEER;
  if (c.detalle) return c.detalle;
  return c.fuente === "marca" ? "falta marcarlo" : "falta";
}

export function BarraRuta({
  avance,
  para,
  enlace,
  fallo = false,
}: {
  avance: AvanceRuta | null;
  para: "consultora";
  enlace?: string;
  /** La lectura del avance falló (no es lo mismo que una base sin la ruta): se dice y se dice qué hacer. */
  fallo?: boolean;
}) {
  if (fallo) {
    return (
      <p className="barra-ruta barra-ruta--linea no-imprimir" data-para={para}>
        No se pudo leer el avance de la ruta. Vuelve a cargar la página; si sigue igual, revisa la Salud del sistema.
      </p>
    );
  }
  // La base todavía no tiene las columnas de la ruta (migración sin aplicar): se dice, en una línea.
  if (!avance) {
    return (
      <p className="barra-ruta barra-ruta--linea no-imprimir" data-para={para}>
        La ruta todavía no está habilitada en esta base.
      </p>
    );
  }

  // Sin tipo de trabajo o sin fecha de inicio no hay ruta que dibujar: se dice qué falta y dónde se completa.
  if (!avance.tipo || !avance.inicio) {
    return (
      <div className="barra-ruta barra-ruta--linea no-imprimir" data-para={para}>
        <span>{avance.aviso ?? (!avance.tipo ? "Falta elegir el tipo de trabajo" : "Falta la fecha de inicio de la ruta")}</span>
        {enlace && (
          <Link href={enlace} className="enlace-azul">
            Completar la ficha de trabajo
          </Link>
        )}
      </div>
    );
  }

  const indice = avance.etapas.findIndex((e) => e.clave === avance.actual);
  const actual = indice >= 0 ? avance.etapas[indice]! : null;
  const linea = lineaDia(avance.dia, avance.inicio, actual?.hastaDia ?? null);
  const falta = avance.faltaParaLaCompuerta;

  return (
    <section className="barra-ruta no-imprimir" data-para={para} aria-label="Avance de la ruta">
      <div className="barra-ruta__cabeza">
        <p className="barra-ruta__titulo">
          {actual ? (
            <>
              Etapa {indice + 1} de {avance.etapas.length} · <b>{actual.nombre}</b> · {textoPct(actual.pct)}
            </>
          ) : (
            <b>Ruta completa: todas las compuertas pasaron en verde</b>
          )}
        </p>
        <p className="barra-ruta__dia">
          {linea && <span>{linea}</span>}
          {enlace && (
            <Link href={enlace} className="enlace-azul">
              Ver la ruta
            </Link>
          )}
        </p>
      </div>

      <Tramos
        tramos={avance.etapas.map((e) => ({
          clave: e.clave,
          nombre: e.nombre,
          estado: e.estado,
          pct: e.pct,
          dias: e.hastaDia - e.desdeDia + 1,
          compuerta: { nombre: e.compuerta.nombre, veredicto: e.compuerta.veredicto },
        }))}
      />

      {actual && (
        <details className="barra-ruta__falta">
          <summary>
            {falta.length === 0 ? `Todo listo para la compuerta «${actual.compuerta.nombre}»` : `Falta para la compuerta «${actual.compuerta.nombre}»: ${falta.length}`}
            <span className="barra-ruta__sugerido"> · {SUGERIDO[actual.compuerta.sugerido]}</span>
          </summary>
          {falta.length > 0 && (
            <ul>
              {falta.map((c) => (
                <li key={c.clave} data-estado={c.estado}>
                  <span className={c.estado === "sin_medir" ? "senal sin-medir" : "senal"} aria-hidden="true" />
                  <span>
                    <b>{c.texto}</b> · {porQue(c)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}

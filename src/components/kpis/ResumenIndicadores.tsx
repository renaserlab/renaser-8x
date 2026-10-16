import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import { Segmentos } from "@/components/tablero/Piezas";
import { GraficoLinea, type PuntoLinea } from "@/components/tablero/GraficoLinea";
import { preparacion, periodosRecientes, nombreDePeriodoKpi, textoValor, UNIDADES_MONETARIAS, type Kpi, type Unidad } from "@/lib/kpis";

/**
 * LOS INDICADORES EN UNA TARJETA (revisión del 16-10-2026). La línea del primer indicador de resultado que ya tiene dos
 * valores, en sus últimos ocho periodos (un periodo sin anotar va rayado, nunca como cero), su último valor y cuántos
 * indicadores activos están listos, esperan su primer valor o están por definir. Kelin nombró «indicadores» entre sus
 * cuatro cosas: la tarjeta abre la vista Indicadores (arriba de la lista) y resume en Avance.
 *
 * Presentacional y de servidor: recibe los indicadores activos y sus valores ya leídos. `error`: no se pudieron leer
 * (se dice, distinto de «no hay»). `ir`: a dónde lleva su flecha (en la propia vista Indicadores, a ningún lado).
 */

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const PUNTOS_INDICADOR = 8;
/** Lo que va junto a la cifra en el globo del gráfico, para las unidades que no son dinero. */
const SUFIJO: Partial<Record<Unidad, string>> = { de_cada_10: "de cada 10", dias: "días", personas: "personas", porcentaje: "%", horas: "horas", unidades: "unidades" };

/** La etiqueta corta de un periodo de indicador, para el eje: «set», «S41», «3 oct», «1.ª q. oct», «T3». */
export function cortoDePeriodo(p: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})$/.exec(p))) return MES[+m[2]! - 1] ?? p;
  if ((m = /^\d{4}-S(\d{2})$/.exec(p))) return `S${+m[1]!}`;
  if ((m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p))) return `${+m[2]!} ${MES[+m[1]! - 1] ?? ""}`.trim();
  if ((m = /^\d{4}-(\d{2})-Q([12])$/.exec(p))) return `${m[2]}.ª q. ${MES[+m[1]! - 1] ?? ""}`.trim();
  if ((m = /^\d{4}-T([1-4])$/.exec(p))) return `T${m[1]}`;
  return p;
}

export type ValorDeIndicador = { indicador_id: string; periodo: string; valor: number | null; estado_validacion: string | null };

const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function ResumenIndicadores({
  activos,
  valores,
  hoy,
  zona,
  error = false,
  ir,
}: {
  activos: Kpi[];
  valores: ValorDeIndicador[];
  hoy: Date;
  zona: string;
  error?: boolean;
  ir?: string;
}) {
  const conDato = (v: ValorDeIndicador) => v.valor != null && v.estado_validacion !== "sin_dato" && Number.isFinite(Number(v.valor));
  const elegido = activos.find((k) => k.tipo_indicador === "resultado" && valores.filter((v) => v.indicador_id === k.id && conDato(v)).length >= 2) ?? null;
  const puntos: PuntoLinea[] = elegido
    ? periodosRecientes(elegido.frecuencia, PUNTOS_INDICADOR, hoy, zona)
        .reverse()
        .map((p) => {
          const v = valores.find((x) => x.indicador_id === elegido.id && x.periodo === p && conDato(x));
          return { corto: cortoDePeriodo(p), largo: nombreDePeriodoKpi(p), valor: v ? Number(v.valor) : null };
        })
    : [];
  const ultimo = [...puntos].reverse().find((p) => p.valor != null) ?? null;
  const prep = { listo: 0, espera_primer_valor: 0, por_definir: 0 };
  for (const k of activos) prep[preparacion(k)]++;
  const monetario = elegido ? UNIDADES_MONETARIAS.has(elegido.unidad) : false;

  return (
    <section className="tarjeta linea-tarjeta a-lo-ancho" aria-labelledby="t-indicadores">
      <div className="cabeza">
        <div>
          <h2 id="t-indicadores">Indicadores</h2>
          <p className="sub">
            {error || activos.length === 0
              ? "Lo que se mide para saber si la empresa mejora"
              : `${activos.length} ${activos.length === 1 ? "activo" : "activos"}${elegido ? ` · la línea es ${elegido.nombre} · rayado: un periodo sin valor anotado` : ""}`}
          </p>
        </div>
        {ir && (
          <Link className="ir" href={ir} aria-label="Ir a Indicadores" title="Ir a Indicadores">
            <Icono nombre="diagonal" />
          </Link>
        )}
      </div>
      <div className="resumen">
        {error ? (
          <p className="sin-dato">No se pudieron leer los indicadores</p>
        ) : activos.length === 0 ? (
          <p className="sin-dato">Todavía no hay indicadores activos</p>
        ) : (
          <>
            {ultimo && elegido && (
              <>
                <span className="num">{textoValor(elegido.unidad, ultimo.valor!, elegido.moneda)}</span>
                <p>{ultimo.largo}</p>
              </>
            )}
            <Segmentos
              etiqueta={`${prep.listo} listos, ${prep.espera_primer_valor} esperan su primer valor, ${prep.por_definir} por definir`}
              partes={[
                { n: prep.listo, texto: pl(prep.listo, "listo", "listos"), tipo: "s1" },
                { n: prep.espera_primer_valor, texto: pl(prep.espera_primer_valor, "espera su primer valor", "esperan su primer valor"), tipo: "s2" },
                { n: prep.por_definir, texto: "por definir", tipo: "s4" },
              ]}
            />
          </>
        )}
      </div>
      {elegido && puntos.length > 0 ? (
        <GraficoLinea puntos={puntos} formato={monetario ? "soles" : "cuenta"} sufijo={monetario ? undefined : SUFIJO[elegido.unidad]} etiqueta={`${elegido.nombre}, últimos ${PUNTOS_INDICADOR} periodos`} />
      ) : (
        <div className="grafico-vacio">
          <span className="sin-dato">Ningún indicador tiene dos valores anotados todavía</span>
        </div>
      )}
    </section>
  );
}

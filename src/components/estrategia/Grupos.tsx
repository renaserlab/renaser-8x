import Link from "next/link";
import type { ReactNode } from "react";
import { fecha } from "@/lib/formato";
import { configDeCalculos } from "@/lib/estrategia/calculos";
import { ESTADO_VERSION, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import type { ResumenVersion } from "@/lib/estrategia/datos";
import { MOTOR, PANTALLA } from "@/lib/estrategia/textos";
import { Icono } from "@/components/base/Icono";
import { Cifra, T } from "./Texto";
import { ActualizarNumeros, BotonGenerar } from "./Acciones";

/**
 * LOS CUATRO GRUPOS PLEGADOS (spec-estrategia-8x.md §8.1, punto 3: «quince pliegues sueltos marean»): lo de los
 * primeros 14 días, el análisis, cómo se armó y las versiones. Cada grupo es una tarjeta con su título y una línea de
 * lo que trae; se abre entero.
 */

export function Grupo({ id, titulo, sub, children, abierto = false }: { id: string; titulo: string; sub: string; children: ReactNode; abierto?: boolean }) {
  return (
    <section className="tarjeta a-lo-ancho grupo" aria-labelledby={`t-${id}`}>
      <details id={id} className="plegado grupo__plegado" open={abierto || undefined}>
        <summary>
          <span>
            <span id={`t-${id}`} className="grupo__titulo">{titulo}</span>
            <small className="grupo__sub">{sub}</small>
          </span>
          <Icono nombre="abajo" />
        </summary>
        <div className="grupo__cuerpo">{children}</div>
      </details>
    </section>
  );
}

/** Qué mueve una victoria: lo que entra a la caja de una vez, lo que deja de salir cada mes, o un número que se cuenta. */
const tipoDeVictoria = (v: VistaEstrategia["e"]["victorias_14_dias"][number]): "entra" | "deja" | "cuenta" =>
  !v.efecto ? "cuenta" : v.efecto.tipo === "cierre_fuga" ? "deja" : "entra";

/**
 * Lo de los primeros 14 días: las victorias de la primera semana —cada una con lo que mueve (lo que entra, lo que deja
 * de salir) y su cifra, y el total de las dos semanas— y qué se mide desde el día 1 (revisión del 17-10: las victorias no
 * traían cifra ni tipo, ni había un total).
 */
export function PrimerosDias({ x }: { x: VistaEstrategia }) {
  const e = x.e;
  const caja = x.refs.get("R:v.total.caja")?.valor;
  const mes = x.refs.get("R:v.total.mes")?.valor;
  return (
    <Grupo id="primeros-dias" titulo={PANTALLA.grupo_14} sub={PANTALLA.grupo_14_sub}>
      <h3 className="t-etiqueta">{PANTALLA.victorias}</h3>
      <ol className="victorias">
        {e.victorias_14_dias.map((v, i) => {
          const tipo = tipoDeVictoria(v);
          const id = tipo === "deja" ? `R:v.${i + 1}.mes` : `R:v.${i + 1}.caja`;
          return (
            <li key={i} className="victoria">
              <span className="jugada__n" aria-hidden="true">{i + 1}</span>
              <span className="victoria__cuerpo">
                <T x={x} p={`/victorias_14_dias/${i}/que`} />
                <small>
                  {PANTALLA.desde_el_dia(v.desde_dia)} · <T x={x} p={`/victorias_14_dias/${i}/responsable`} />
                </small>
                {!v.responsable_encontrado && <span className="estado espera">{PANTALLA.por_definir}</span>}
              </span>
              <span className="victoria__cifra">
                {tipo !== "cuenta" && <Cifra x={x} id={id} donde={`victoria-${i}`} />}
                <small>{PANTALLA.victoria_tipo[tipo]}</small>
              </span>
            </li>
          );
        })}
      </ol>
      {(caja || mes) && (
        <p className="victorias__total">
          {caja && (
            <>
              {PANTALLA.victorias_total_1} <Cifra x={x} id="R:v.total.caja" donde="victorias-caja" /> {PANTALLA.victorias_total_2}
            </>
          )}
          {caja && mes ? " " : ""}
          {mes && (
            <>
              {caja ? PANTALLA.victorias_total_3 : `${PANTALLA.victorias_total_1.replace(/ entran$/, "")} ${PANTALLA.victorias_total_3.replace(/^y /, "")}`} <Cifra x={x} id="R:v.total.mes" donde="victorias-mes" /> {PANTALLA.victorias_total_4}
            </>
          )}
          . <small>{PANTALLA.victorias_aparte}</small>
        </p>
      )}
      <h3 className="t-etiqueta">{PANTALLA.medir}</h3>
      <div className="envoltura-tabla">
        <table className="tabla tabla-medir">
          <thead>
            <tr>
              {PANTALLA.medir_columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {e.medir_desde_el_dia_1.map((m, i) => (
              <tr key={i}>
                <td>
                  <T x={x} p={`/medir_desde_el_dia_1/${i}/nombre`} />
                </td>
                <td>
                  <T x={x} p={`/medir_desde_el_dia_1/${i}/como_se_mide`} />
                </td>
                <td>
                  <T x={x} p={`/medir_desde_el_dia_1/${i}/quien_anota`} />
                </td>
                <td>{PANTALLA.frecuencia[m.frecuencia] ?? m.frecuencia}</td>
                <td>{m.base ? <Cifra x={x} id={m.base} donde={`medir-${i}-base`} /> : <span className="t-dato tenue">{PANTALLA.meta_por_definir}</span>}</td>
                <td>{m.meta_30 ? <Cifra x={x} id={m.meta_30} donde={`medir-${i}-m30`} /> : <span className="t-dato tenue">{PANTALLA.meta_por_definir}</span>}</td>
                <td>{m.meta_90 ? <Cifra x={x} id={m.meta_90} donde={`medir-${i}-m90`} /> : <span className="t-dato tenue">{PANTALLA.meta_por_definir}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Grupo>
  );
}

/** La línea de una versión en el selector y en la lista: «Versión 3 · 16/10/2026 · aprobada». */
export function textoDeVersion(v: ResumenVersion, zona: string, conEstado = true): string {
  const cfg = configDeCalculos({ moneda: "PEN", zona });
  return `${PANTALLA.version(v.version)} · ${fecha(v.created_at, cfg)}${conEstado ? ` · ${ESTADO_VERSION[v.estado].texto}` : ""}`;
}

/** Las versiones de la empresa, con la que se está viendo marcada; «Actualizar números» y volver a generar, discretos. */
export function Versiones({ x, versiones, zona, companyId, hayEnCurso, acciones = true }: { x: VistaEstrategia | null; versiones: ResumenVersion[]; zona: string; companyId: string; hayEnCurso: boolean; acciones?: boolean }) {
  const actual = x?.v.version ?? null;
  return (
    <Grupo id="versiones" titulo={PANTALLA.grupo_versiones} sub={PANTALLA.versiones_n(versiones.length)}>
      <ul className="versiones">
        {versiones.map((v) => (
          <li key={v.id} className="version" data-actual={v.version === actual ? "" : undefined}>
            <Link href={`?v=${v.version}`} className="version__enlace" aria-current={v.version === actual ? "page" : undefined}>
              {PANTALLA.version(v.version)}
            </Link>
            <span className="t-dato">{fecha(v.created_at, configDeCalculos({ moneda: "PEN", zona }))}</span>
            <span className={`estado ${ESTADO_VERSION[v.estado].clase}`}>{ESTADO_VERSION[v.estado].texto}</span>
            <small>{PANTALLA.origen_version[v.origen] ?? ""}</small>
            {v.version === actual && <small className="version__esta">{PANTALLA.esta}</small>}
          </li>
        ))}
      </ul>
      {acciones && !hayEnCurso && (
        <div className="versiones__acciones">
          {x && x.v.salida && (
            <p className="nota-accion">
              {PANTALLA.actualizar_nota} <ActualizarNumeros companyId={companyId} eid={x.v.id} secundario />
            </p>
          )}
          <BotonGenerar companyId={companyId} texto={PANTALLA.generar_de_nuevo} nota={MOTOR.generar_nota} secundario />
        </div>
      )}
    </Grupo>
  );
}

import {
  BLOQUES_FICHA, NOMBRE_BLOQUE, DIMENSIONES_DEPENDENCIA, NOMBRE_DIMENSION, CAMPOS_DIMENSION, NOMBRE_CAMPO, CIFRAS_DE_DIRECCION, ETIQUETA_TIPO, ETIQUETA_DOCUMENTO, TIPOS_ITEM,
  TEXTO_ASISTENTE_EN_PAUSA, etiquetaDe, esPropuestaSinRevisar, dimensionConTexto, vigentes,
  type BloqueFicha, type DimensionClave, type FichaGuardada, type Item,
} from "@/lib/ficha-direccion";
import { fechaCorta } from "@/lib/textos";
import { fechaDia } from "@/lib/medicion";
import { AccionesItem, AgregarFrase, AnotarNumero, EditarDimension } from "./AccionesDireccion";

/**
 * LA FICHA DE DIRECCIÓN COMO LA TRABAJA LA CONSULTORA: los diez bloques en una página y, debajo, de quién depende
 * la empresa. Cada frase lleva su etiqueta (Dijo el dueño / Interpretamos / Acordado; «Dice un documento de la
 * empresa» para lo que salió de un papel; Número, Cálculo o Aviso para lo que no es una frase) y su fuente. Solo
 * va entre comillas lo que el dueño dijo palabra por palabra. Es un componente de servidor: pinta lo que hay;
 * los botones y formularios son islas de cliente (AccionesDireccion).
 *
 * `editable` es verdadero solo para el borrador vigente. Una versión acordada o reemplazada se lee, no se toca.
 */

type Fuentes = Record<string, string>;

/** Una fecha sin hora (la de una afirmación) se escribe tal cual; con hora, en la hora local. Así el día no se corre. */
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? fechaDia(iso) : fechaCorta(iso));

/** De dónde sale una frase, con su fecha, en una línea. */
function lineaDeFuente(i: Item, fuentes: Fuentes): string {
  const deDonde = i.fuentes.map((f) => fuentes[f] ?? f);
  const partes = [deDonde.length ? `Fuente: ${deDonde.join(" · ")}` : "Sin fuente que citar: es una cuenta hecha en código."];
  if (i.fecha) partes.push(fecha(i.fecha));
  if (i.sabida_por) partes.push(`ya lo sabíamos por ${i.sabida_por}`);
  return partes.join(" · ");
}

/** Lo que el dueño dijo o escribió palabra por palabra va entre comillas; un resumen, un número o un cálculo, no. */
function Texto({ i }: { i: Item }) {
  return (
    <>
      <p className="t-cuerpo mt-1 medida">{i.textual ? `«${i.texto}»` : i.texto}</p>
      {i.cita && !i.textual && (
        <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
          En sus palabras: «{i.cita}»
        </p>
      )}
    </>
  );
}

/** Qué se le dice a la consultora cuando un bloque está vacío: de dónde saldría, no un «sin datos» a secas. */
const VACIO_BLOQUE: Record<BloqueFicha, string> = {
  proposito: "Todavía no hay nada sobre para qué existe la empresa. Sale de la entrevista del dueño (propósito) o de lo que anotes aquí.",
  empresa_deseada: "Todavía no hay nada sobre la empresa que quiere. Sale de la entrada breve (el negocio dentro de tres años), de la entrevista o de su aspiración escrita.",
  clientes_reputacion: "Todavía no hay nada sobre a quién quiere venderle ni cómo quiere que lo conozcan. Sale de la entrevista o de lo que anotes aquí.",
  rol_futuro: "Todavía no hay nada sobre qué hará él y qué dejará de hacer. Sale de la entrada breve o de la entrevista.",
  resultados_deseados: "Todavía no hay números ni frases sobre lo que quiere lograr. Puedes anotar la meta en número.",
  tiempo: "Todavía no hay nada sobre su tiempo. Puedes anotar las horas que trabaja hoy y las que quiere trabajar.",
  limites: "Todavía no hay nada sobre lo que no está dispuesto a sacrificar. Sale de la entrada breve o de la entrevista.",
  fortalezas: "Todavía no hay nada sobre lo que ya funciona bien. Sale de la entrada breve o de la entrevista.",
  distancia: "Todavía no se puede medir la distancia: falta un número de hoy y su meta, o lo que el dueño dice que lo frena.",
  decisiones_pendientes: "Todavía no hay decisiones pendientes anotadas. Salen de la entrevista o de lo que anotes aquí.",
};

function colorDe(i: Item): string {
  if (i.aviso) return "var(--caducado)";
  if (i.calculo) return "var(--marca)";
  if (esPropuestaSinRevisar(i)) return "var(--caducado)";
  if (i.tipo === "acuerdo") return "var(--confirmado)";
  return "var(--grafito)";
}

/**
 * Las clases que una frase puede tener: «Dijo el dueño» solo si lo dijo él o lo anotó la consultora de su boca.
 * Si la frase salió de un papel de la empresa, esa clase se llama como su etiqueta: no se le atribuye a su boca.
 */
function tiposPara(i: Item): [string, string][] {
  const loDijo = i.tipo === "declaracion" || i.origen === "consultor";
  const nombre = (t: (typeof TIPOS_ITEM)[number]) => (t === "declaracion" && i.medio === "material" ? ETIQUETA_DOCUMENTO : ETIQUETA_TIPO[t]);
  return TIPOS_ITEM.filter((t) => t !== "declaracion" || loDijo).map((t) => [t, nombre(t)]);
}

const TODOS_LOS_TIPOS: [string, string][] = TIPOS_ITEM.map((t) => [t, ETIQUETA_TIPO[t]]);

function Frase({ i, fuentes, bloque, companyId, fichaId, editable }: { i: Item; fuentes: Fuentes; bloque: BloqueFicha; companyId: string; fichaId: string; editable: boolean }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-etiqueta" style={{ color: colorDe(i) }}>{etiquetaDe(i)}</span>
        {i.certeza === "aproximada" && <span className="t-etiqueta">dato aproximado</span>}
        {i.certeza === "no_lo_se" && <span className="t-etiqueta" style={{ color: "var(--caducado)" }}>respondió que no lo sabe: no es un dato</span>}
        {i.interno && <span className="t-etiqueta">nota de trabajo: el dueño no la ve</span>}
      </div>
      <Texto i={i} />
      {i.original && i.original !== i.cita && (
        <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
          Antes de corregirla decía: «{i.original}»
        </p>
      )}
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{lineaDeFuente(i, fuentes)}</p>
      {editable && (
        <AccionesItem
          companyId={companyId}
          fichaId={fichaId}
          bloque={bloque}
          nombreBloque={NOMBRE_BLOQUE[bloque]}
          itemId={i.id}
          texto={i.texto}
          tipo={i.tipo}
          tipos={tiposPara(i)}
          sinRevisar={esPropuestaSinRevisar(i)}
          descartado={!!i.descartado}
          sePuedeCorregir={!i.momento && !i.calculo}
        />
      )}
    </li>
  );
}

function Bloque({ clave, numero, ficha, fuentes, companyId, editable }: { clave: BloqueFicha; numero: number; ficha: FichaGuardada; fuentes: Fuentes; companyId: string; editable: boolean }) {
  const todos = ficha.bloques[clave] ?? [];
  const visibles = vigentes(todos);
  const descartados = todos.filter((i) => i.descartado);
  const cifras: [string, string][] = CIFRAS_DE_DIRECCION.filter((c) => c.bloque === clave).map((c) => [c.clave, c.etiqueta]);
  return (
    <section className="panel p-5" aria-labelledby={`bloque-${clave}`}>
      <h2 id={`bloque-${clave}`} className="t-seccion">
        <span style={{ color: "var(--grafito)", fontWeight: 500 }}>{numero}. </span>
        {NOMBRE_BLOQUE[clave]}
      </h2>
      {visibles.length === 0 ? (
        <p className="t-dato mt-3 medida" style={{ color: "var(--grafito)" }}>{VACIO_BLOQUE[clave]}</p>
      ) : (
        <ul className="lista-editorial mt-3">
          {visibles.map((i) => (
            <Frase key={i.id} i={i} fuentes={fuentes} bloque={clave} companyId={companyId} fichaId={ficha.id} editable={editable} />
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2 mt-4">
          <AgregarFrase companyId={companyId} fichaId={ficha.id} bloque={clave} nombreBloque={NOMBRE_BLOQUE[clave]} tipos={TODOS_LOS_TIPOS} />
          <AnotarNumero companyId={companyId} fichaId={ficha.id} nombreBloque={NOMBRE_BLOQUE[clave]} cifras={cifras} />
        </div>
      )}
      {descartados.length > 0 && (
        <details className="mt-4">
          <summary className="t-dato" style={{ color: "var(--grafito)", cursor: "pointer" }}>
            {descartados.length === 1 ? "1 frase quitada" : `${descartados.length} frases quitadas`}: siguen guardadas y no pasan a la versión acordada
          </summary>
          <ul className="lista-editorial mt-3">
            {descartados.map((i) => (
              <Frase key={i.id} i={i} fuentes={fuentes} bloque={clave} companyId={companyId} fichaId={ficha.id} editable={editable} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Dimension({ clave, ficha, fuentes, companyId, editable }: { clave: DimensionClave; ficha: FichaGuardada; fuentes: Fuentes; companyId: string; editable: boolean }) {
  const d = ficha.dependencia.dimensiones[clave];
  const sinRevisar = d.origen === "director" && !d.revisado_por && dimensionConTexto(d);
  const estado = sinRevisar ? "propuesta del asistente, sin revisar" : d.revisado_por || d.origen === "consultor" ? "revisada por la consultora" : null;
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-dato" style={{ fontWeight: 650, fontSize: 15 }}>{NOMBRE_DIMENSION[clave]}</h3>
        {estado && <span className="t-etiqueta" style={{ color: sinRevisar ? "var(--caducado)" : "var(--confirmado)" }}>{estado}</span>}
      </div>
      {dimensionConTexto(d) ? (
        <dl className="mt-2 flex flex-col gap-2">
          {CAMPOS_DIMENSION.filter((c) => d[c]?.trim()).map((c) => (
            <div key={c}>
              <dt className="t-etiqueta">{NOMBRE_CAMPO[c]}</dt>
              <dd className="t-dato" style={{ margin: 0 }}>{d[c]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          {d.nota ? `${d.nota[0].toUpperCase()}${d.nota.slice(1)}: con lo que el dueño ha contado no se puede describir.` : "Sin describir todavía."}
        </p>
      )}
      {d.evidencia.length > 0 && (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          Se apoya en: {d.evidencia.map((f) => fuentes[f] ?? f).join(" · ")}
        </p>
      )}
      {dimensionConTexto(d) && d.nota && <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>{d.nota}</p>}
      {editable && (
        <EditarDimension
          companyId={companyId}
          fichaId={ficha.id}
          dimension={clave}
          nombre={NOMBRE_DIMENSION[clave]}
          campos={CAMPOS_DIMENSION.map((c) => ({ clave: c, etiqueta: NOMBRE_CAMPO[c], texto: d[c] ?? "" }))}
          sinRevisar={sinRevisar}
        />
      )}
    </article>
  );
}

export function FichaDireccion({ companyId, ficha, fuentes, editable }: { companyId: string; ficha: FichaGuardada; fuentes: Fuentes; editable: boolean }) {
  const dep = ficha.dependencia;
  const dichas = vigentes(dep.declaraciones);
  return (
    <div className="flex flex-col gap-5">
      {BLOQUES_FICHA.map((clave, n) => (
        <Bloque key={clave} clave={clave} numero={n + 1} ficha={ficha} fuentes={fuentes} companyId={companyId} editable={editable} />
      ))}

      <section className="panel p-5" aria-labelledby="capacidad-direccion">
        <h2 id="capacidad-direccion" className="t-seccion">Capacidad de dirección: de quién depende la empresa</h2>
        <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
          Se describe, no se puntúa: aquí no hay índice ni porcentaje de dependencia. Donde la participación del dueño aporta valor, se dice.
        </p>

        <h3 className="t-etiqueta mt-5">El dueño en los procesos del mapa</h3>
        <p className="t-cuerpo mt-1 medida">El dueño {dep.procesos.texto}.</p>
        {dep.procesos.nombres_con_dueno.length > 0 && (
          <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
            Participa en: {dep.procesos.nombres_con_dueno.join(", ")}.
            {dep.procesos.nombres_decide_solo.length > 0 ? ` Solo él decide en: ${dep.procesos.nombres_decide_solo.join(", ")}.` : ""}
          </p>
        )}
        <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
          Es un conteo hecho en código sobre los responsables de cada paso: sirve para conversar, no es una medida.
        </p>

        <h3 className="t-etiqueta mt-5">Lo que el dueño dijo sobre qué pasa cuando no está</h3>
        {dichas.length === 0 ? (
          <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
            Todavía no lo ha contado. Sale de la entrada breve («si no vas una semana, ¿qué se detiene?») o de la entrevista.
          </p>
        ) : (
          <ul className="lista-editorial mt-2">
            {dichas.map((i) => (
              <li key={i.id}>
                <span className="t-etiqueta">{etiquetaDe(i)}</span>
                <Texto i={i} />
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{lineaDeFuente(i, fuentes)}</p>
              </li>
            ))}
          </ul>
        )}

        <h3 className="t-etiqueta mt-5">Las ocho dimensiones</h3>
        {dep.interpretaciones.pendiente && (
          <p className="t-dato mt-1 medida" role="status" style={{ color: "var(--caducado)" }}>
            {dep.interpretaciones.motivo === TEXTO_ASISTENTE_EN_PAUSA ? "Interpretaciones pendientes: asistente en pausa." : `Interpretaciones pendientes: ${dep.interpretaciones.motivo ?? "sin detalle"}.`}{" "}
            El borrador con lo que el dueño ya contó está guardado; las propuestas llegarán solas cuando el asistente vuelva. Mientras tanto puedes describir cada dimensión a mano.
          </p>
        )}
        <div className="grid gap-3 mt-3 md:grid-cols-2">
          {DIMENSIONES_DEPENDENCIA.map((clave) => (
            <Dimension key={clave} clave={clave} ficha={ficha} fuentes={fuentes} companyId={companyId} editable={editable} />
          ))}
        </div>
      </section>
    </div>
  );
}

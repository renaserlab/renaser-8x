"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import {
  VITALES, RECONOCIDA_POR_CLAVE, cuerpoDeNumeros, costoVariableDeclarado, revisarNumerosEscritos, campoDeValor, campoDeMes,
  AVISO_NUMERO_NO_ENTENDIDO, AVISO_NUMERO_NEGATIVO, AVISO_PERDIDA, AVISO_FALTA_EL_MES, CLAVE_QUE_PUEDE_SER_PERDIDA, ROTULO_CIFRA_PROVISIONAL,
  AVISO_CONTEO, claveDeConteo, esCampoDeConteo, lecturaDeCampo,
  type Radiografia, type Vital,
} from "@/lib/metricas";
import { MESES, nombreDePeriodo } from "@/lib/temporadas";

/** `provisional`: esa venta salió de un documento que nadie revisó todavía. Se rotula junto a la cifra. */
type Serie = { periodo: string; valor: number; provisional?: boolean }[];

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * EL ÚNICO NÚMERO QUE FALTA PARA EL EQUILIBRIO (D5). No es de los nueve, pero sin él no se puede
 * decir desde qué venta se cubren los costos, y hasta hoy el dueño no tenía dónde ponerlo. Se
 * pregunta como se habla y se guarda en el mes pasado, igual que la venta que se contesta en «Lo
 * que falta»: la cuenta solo existe con ventas y costos variables del MISMO mes. Qué va a qué mes
 * lo decide `cuerpoDeNumeros` (lib/metricas), que es lo que se prueba sin navegador.
 */
const RECONOCIDA_COSTO_VARIABLE = RECONOCIDA_POR_CLAVE.get("costo_variable_mes");
const CAMPO_COSTO_VARIABLE: Vital | null = RECONOCIDA_COSTO_VARIABLE
  ? { ...RECONOCIDA_COSTO_VARIABLE, pregunta: "El mes pasado, ¿cuánto te costó lo que vendiste?" }
  : null;
/** Una sola frase: qué entra, qué no, y que «no lo sé» vale más que un cero puesto por poner. */
/**
 * LO QUE VA DENTRO DE UNA CAJA DE NÚMERO (revisión del 16-10-2026). Antes decía «p. ej. 8 mil» o «p. ej. 3», y una
 * cifra dentro de la caja se devuelve como respuesta. Ahora la caja dice qué va, sin ninguna cifra.
 */
const PISTA_CIFRA = "Escribe la cifra";
const AYUDA_COSTO_VARIABLE =
  "Cuenta solo lo que sube y baja con la venta, no el alquiler ni los sueldos; si no lo sabes, marca «No lo sé» en vez de poner cero.";

export function MisNumeros({
  radiografia,
  serieVenta,
  soloDeDocumento = [],
  temporadasAltas,
  mesesDisponibles,
  conRadiografia = true,
}: {
  radiografia: Radiografia;
  /**
   * false cuando la pantalla ya muestra arriba cuántos de los nueve hay (el tablero de «Tus números»): la radiografía
   * «5 de 9» no se repite debajo con otro color y otra barra (revisión del 16-10-2026). Quedan las preguntas.
   */
  conRadiografia?: boolean;
  serieVenta: Serie;
  /** Claves de los vitales de los que solo hay un número leído de un documento sin revisar (`vitalesSoloDeDocumento`). */
  soloDeDocumento?: string[];
  temporadasAltas: string[];
  mesesDisponibles: { periodo: string; etiqueta: string }[];
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [sinDato, setSinDato] = useState<Set<string>>(new Set());
  const [meses, setMeses] = useState<Record<string, string>>({});
  const [mejor, setMejor] = useState({ periodo: "", monto: "" });
  const [peor, setPeor] = useState({ periodo: "", monto: "" });
  const [altas, setAltas] = useState<Set<string>>(new Set(temporadasAltas));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mesPasado = mesesDisponibles[0];

  // LO QUE SE VA A ENVIAR, calculado en cada pintada con la misma función que usa «Guardar». Las
  // preguntas que hablan del mes pasado (ventas, lo que quedó libre, costos variables) quedan en ese
  // mes: antes la venta de «Lo que falta» iba a «hoy» y el costo variable al mes pasado, y la cuenta
  // nunca salía. Tenerlo ya calculado permite avisar ANTES de guardar si al costo le falta su venta.
  const cuerpo = cuerpoDeNumeros({
    valores, meses, mejor, peor,
    sinDato: [...sinDato],
    mesPasado: mesPasado?.periodo ?? null,
    mesesConVenta: serieVenta.map((s) => s.periodo),
  });

  // LO QUE NO SE ENTIENDE NO DESAPARECE. Un «8.5oo» o un «ocho mil y pico» se leían como caja vacía y se
  // perdían al guardar sin decir nada. La revisión separa lo vacío (sin dato) de lo mal escrito: lo segundo
  // se avisa bajo su caja y no se guarda nada hasta corregirlo. La regla es pura y se prueba sin navegador.
  const revision = revisarNumerosEscritos({ valores, meses, mejor, peor, sinDato: [...sinDato] });
  // Un negativo no es «no entendimos»: se dice que ahí no cabe. Y en «Lo que te quedó libre» es una pérdida: se
  // le dice qué pasa con ella (hoy no se guarda) y no se le impide guardar lo demás.
  // Un conteo bien escrito que no deja hacer la cuenta (falta el otro, o compraron más de los que preguntaron) no es
  // «no entendimos»: se dice qué falta para la cuenta.
  const avisoDe = (campo: string) =>
    revision.invalidos.includes(campo) && esCampoDeConteo(campo) && lecturaDeCampo(valores[campo.slice("valor:".length)]) !== "invalido" ? (
      <p className="t-dato mt-1 medida" style={{ color: "var(--contradicho)" }} role="alert">{AVISO_CONTEO}</p>
    ) : revision.invalidos.includes(campo) ? (
      <p className="t-dato mt-1" style={{ color: "var(--contradicho)" }} role="alert">{AVISO_NUMERO_NO_ENTENDIDO}</p>
    ) : revision.negativos.includes(campo) ? (
      <p className="t-dato mt-1" style={{ color: "var(--contradicho)" }} role="alert">{AVISO_NUMERO_NEGATIVO}</p>
    ) : revision.perdida && campo === campoDeValor(CLAVE_QUE_PUEDE_SER_PERDIDA) ? (
      <p className="t-dato mt-1 medida" style={{ color: "var(--caducado)", fontWeight: 600 }} role="alert">{AVISO_PERDIDA}</p>
    ) : null;
  const marcado = (campo: string) => revision.invalidos.includes(campo) || revision.negativos.includes(campo) || undefined;

  const guardar = async () => {
    // El botón ya está apagado; esto lo vuelve a comprobar para que nada mal escrito viaje a la base.
    if (!revision.listo) {
      setError("Hay un número por corregir. Corrígelo donde está marcado y vuelve a guardar: todavía no se guardó nada.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await pedir("/api/portal/numeros", {
        method: "POST",
        json: { ...cuerpo, temporadas: { altas: [...altas], bajas: [] } },
      });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  };

  /** Una caja de número, sin cifras de muestra. `clave` es la del vital o la de uno de sus conteos. */
  const cajaDeCifra = (v: Vital, clave: string, rotulo: string) => (
    <input
      className="campo"
      style={{ maxWidth: 200 }}
      inputMode="decimal"
      placeholder={PISTA_CIFRA}
      value={valores[clave] ?? ""}
      disabled={sinDato.has(v.clave)}
      onChange={(e) => setValores((x) => ({ ...x, [clave]: e.target.value }))}
      aria-label={rotulo}
      aria-invalid={marcado(campoDeValor(clave))}
    />
  );

  /**
   * Una pregunta hablada, su campo y el «No lo sé». `ayuda` es una frase más, para la que lo necesita. Lo que es una
   * proporción (la conversión) se pregunta en dos conteos, cada uno con su caja, y la cuenta la hace 8X
   * (`cuerpoDeNumeros`): preguntar «de cada diez» sembraba el marco en la respuesta.
   */
  const campoVital = (v: Vital, ayuda?: string) => (
    <div key={v.clave} className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
      <p className="t-cuerpo" style={{ fontWeight: 550 }}>{v.pregunta}</p>
      {ayuda && <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>{ayuda}</p>}
      {v.seguida && (
        <>
          <div className="mt-2">{cajaDeCifra(v, claveDeConteo(v.clave, "total"), `${v.nombre}: cuántas personas preguntaron`)}</div>
          {avisoDe(campoDeValor(claveDeConteo(v.clave, "total")))}
          <p className="t-cuerpo mt-3" style={{ fontWeight: 550 }}>{v.seguida}</p>
        </>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {v.seguida ? cajaDeCifra(v, claveDeConteo(v.clave, "parte"), `${v.nombre}: cuántas compraron`) : cajaDeCifra(v, v.clave, v.nombre)}
        <button
          type="button"
          className="t-dato"
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: sinDato.has(v.clave) ? "var(--marca)" : "var(--grafito)" }}
          onClick={() =>
            setSinDato((s) => {
              const n = new Set(s);
              if (n.has(v.clave)) n.delete(v.clave);
              else {
                n.add(v.clave);
                // Con «No lo sé» se vacían su caja y, si es una proporción, sus dos conteos.
                setValores((x) => ({ ...x, [v.clave]: "", [claveDeConteo(v.clave, "total")]: "", [claveDeConteo(v.clave, "parte")]: "" }));
              }
              return n;
            })
          }
        >
          {sinDato.has(v.clave) ? "Marcado: no lo sé" : "No lo sé"}
        </button>
      </div>
      {avisoDe(campoDeValor(v.clave))}
      {v.seguida && avisoDe(campoDeValor(claveDeConteo(v.clave, "parte")))}
    </div>
  );

  const puestos = VITALES.filter((v) => !radiografia.faltan.some((f) => f.clave === v.clave));
  // Lo que ya dijo de sus costos variables. Un monto manda; si no hay, un «no lo sé» declarado manda
  // sobre un cero (antes marcaba «No lo sé» y, al recargar, el aviso del cero seguía ahí).
  const costoVariableGuardado = costoVariableDeclarado(radiografia.otros, mesPasado?.periodo ?? null);
  // Un cero guardado no se usa en ningún cálculo: se trata como «no lo sé», y se le dice aquí mismo.
  const costoVariableEnCero = costoVariableGuardado?.valor != null && costoVariableGuardado.valor <= 0;
  // Lo que dio es de otro mes que el que ahora se pregunta: se le dice dónde quedará lo que escriba.
  const costoVariableDeOtroMes =
    costoVariableGuardado?.valor != null && !costoVariableEnCero && mesPasado != null && costoVariableGuardado.periodo !== mesPasado.periodo;
  // SIN LA VENTA DEL MISMO MES EL COSTO NO SIRVE PARA LA CUENTA. Pasa cuando las ventas se dieron hace
  // tiempo sin mes (en la conversación, por ejemplo). Se avisa mientras escribe, no después de guardar.
  const hayVentaDelMesPasado =
    mesPasado != null &&
    (serieVenta.some((s) => s.periodo === mesPasado.periodo) || cuerpo.meses.some((m) => m.periodo === mesPasado.periodo && m.venta != null));
  const hayCostoVariableDelMesPasado =
    mesPasado != null &&
    (cuerpo.meses.some((m) => m.periodo === mesPasado.periodo && (m.costo_variable ?? 0) > 0) ||
      (costoVariableGuardado?.periodo === mesPasado.periodo && (costoVariableGuardado.valor ?? 0) > 0));
  const faltaLaVentaDelMes = hayCostoVariableDelMesPasado && !hayVentaDelMesPasado;

  return (
    <div className="flex flex-col gap-8">
      {/* DÓNDE VA: una sola cifra, sin adornos. */}
      {conRadiografia && (
      <section className="panel p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="t-etiqueta">La radiografía de tu negocio</p>
            <p style={{ fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {radiografia.listos} <span style={{ color: "var(--grafito)", fontWeight: 500 }}>de {radiografia.total}</span>
            </p>
          </div>
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)", flex: "1 1 260px" }}>
            {radiografia.completa
              ? "Están los nueve. Con esto se calcula tu margen y cuánto aguantas si mañana no entra nada. Para saber desde qué venta cubres tus costos hace falta, además, lo que te cuesta lo que vendes: más abajo puedes darlo."
              : `Con estos nueve números se calcula tu margen y cuánto aguantas si mañana no entra nada. Sin ellos, cualquier diagnóstico es opinión. Te faltan ${radiografia.faltan.length}.`}
          </p>
        </div>
        <div className="flex gap-1 mt-4" aria-hidden="true">
          {VITALES.map((v) => (
            <span
              key={v.clave}
              style={{
                flex: 1, height: 6, borderRadius: 3,
                background: radiografia.faltan.some((f) => f.clave === v.clave) ? "var(--linea)" : "var(--confirmado)",
              }}
            />
          ))}
        </div>
      </section>
      )}

      {radiografia.faltan.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Lo que falta</h2>
          <p className="t-dato mb-1" style={{ color: "var(--grafito)" }}>
            Contesta de memoria, como si te lo preguntaran hablando. No busques papeles: si no lo sabes, dilo — eso también nos dice algo.
          </p>
          {radiografia.faltan.map((v) => campoVital(v))}
        </section>
      )}

      {/* TU AÑO EN TRES PREGUNTAS: la serie mensual que hoy no existe en ninguna empresa. */}
      <section>
        <h2 className="t-seccion mb-1">Tu año en tres preguntas</h2>
        <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
          Con tres meses ya se ve tu curva: si vienes subiendo o bajando, y cuánto pesa la temporada. No hace falta el año entero.
        </p>

        {mesPasado && (
          <div className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
            <p className="t-cuerpo" style={{ fontWeight: 550 }}>¿Cuánto vendiste en {mesPasado.etiqueta}?</p>
            <input
              className="campo mt-2" style={{ maxWidth: 200 }} inputMode="decimal" placeholder={PISTA_CIFRA}
              value={meses[mesPasado.periodo] ?? ""}
              onChange={(e) => setMeses((x) => ({ ...x, [mesPasado.periodo]: e.target.value }))}
              aria-label={`Ventas de ${mesPasado.etiqueta}`}
              aria-invalid={marcado(campoDeMes(mesPasado.periodo))}
            />
            {avisoDe(campoDeMes(mesPasado.periodo))}
          </div>
        )}

        {[
          // Una cosa por pregunta: el mes se elige en la lista y el monto va en su caja, que dice qué va.
          { t: "En los últimos doce meses, ¿cuál fue el mes que más vendiste?", v: mejor, set: setMejor, id: "mejor" as const },
          { t: "¿Y el mes que menos vendiste?", v: peor, set: setPeor, id: "peor" as const },
        ].map((f) => (
          <div key={f.id} className="py-4" style={{ borderTop: "1px solid var(--linea)" }}>
            <p className="t-cuerpo" style={{ fontWeight: 550 }}>{f.t}</p>
            <div className="flex gap-2 flex-wrap mt-2">
              <select
                className="campo" style={{ maxWidth: 200 }} value={f.v.periodo}
                onChange={(e) => f.set({ ...f.v, periodo: e.target.value })}
                aria-label={`Mes ${f.id}`}
              >
                <option value="">Elige el mes</option>
                {mesesDisponibles.map((m) => <option key={m.periodo} value={m.periodo}>{m.etiqueta}</option>)}
              </select>
              <input
                className="campo" style={{ maxWidth: 180 }} inputMode="decimal" placeholder="Cuánto vendiste ese mes"
                value={f.v.monto} onChange={(e) => f.set({ ...f.v, monto: e.target.value })}
                aria-label={`Ventas del mes ${f.id}`}
                aria-invalid={marcado(f.id)}
              />
            </div>
            {avisoDe(f.id)}
            {/* Un monto sin su mes tampoco se guardaba, y tampoco se decía. */}
            {revision.sinMes.includes(f.id) && (
              <p className="t-dato mt-1" style={{ color: "var(--contradicho)" }} role="alert">{AVISO_FALTA_EL_MES}</p>
            )}
          </div>
        ))}
      </section>

      {/* EL NÚMERO QUE FALTA PARA EL EQUILIBRIO (D5): sin costos variables no se sabe desde qué venta
          se cubren los costos, y hasta hoy el dueño no tenía dónde ponerlos. Va con el mes de su venta. */}
      {CAMPO_COSTO_VARIABLE && (
        <section>
          <h2 className="t-seccion mb-1">Para saber desde qué venta cubres tus costos</h2>
          <p className="t-dato mb-1 medida" style={{ color: "var(--grafito)" }}>
            Es el número que hace falta para esa cuenta.{mesPasado ? ` Piensa en ${mesPasado.etiqueta}, el mismo mes de tus ventas.` : ""}
          </p>
          {costoVariableGuardado && costoVariableEnCero && (
            <p className="t-dato mb-1 medida" style={{ color: "var(--caducado)" }} role="status">
              Tienes anotado cero ({nombreDePeriodo(costoVariableGuardado.periodo)}). Un cero lo tomamos como «no lo sé» y no entra en
              ninguna cuenta: escribe el monto, o marca «No lo sé» si no lo sabes.
            </p>
          )}
          {costoVariableGuardado && !costoVariableEnCero && (
            <p className="t-dato mb-1 medida" style={{ color: "var(--grafito)" }}>
              {costoVariableGuardado.valor == null
                ? "Nos dijiste que no lo sabes. Si ahora lo sabes, escríbelo aquí."
                : costoVariableDeOtroMes && mesPasado
                  ? `Ya nos contaste ${soles(costoVariableGuardado.valor)} (${nombreDePeriodo(costoVariableGuardado.periodo)}, ${costoVariableGuardado.etiquetaEstado}). Lo que escribas aquí se guarda como el de ${mesPasado.etiqueta}.`
                  : `Ya nos contaste: ${soles(costoVariableGuardado.valor)} (${nombreDePeriodo(costoVariableGuardado.periodo)}, ${costoVariableGuardado.etiquetaEstado}). Si cambió, escríbelo de nuevo.`}
            </p>
          )}
          {campoVital(CAMPO_COSTO_VARIABLE, AYUDA_COSTO_VARIABLE)}
          {faltaLaVentaDelMes && mesPasado && (
            <p className="t-dato medida" style={{ color: "var(--caducado)" }} role="status">
              Para hacer la cuenta faltan tus ventas de {mesPasado.etiqueta}: anótalas arriba, en «Tu año en tres preguntas». Los dos
              números tienen que ser del mismo mes.
            </p>
          )}
        </section>
      )}

      {/* TEMPORADAS: sin esto, un agosto bajo se lee como problema cuando es el bajón normal. */}
      <section>
        <h2 className="t-seccion mb-1">¿En qué meses vendes más?</h2>
        <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
          Marca los tuyos. Sirve para no confundir una temporada baja con un problema del negocio.
        </p>
        <div className="flex flex-wrap gap-2">
          {MESES.map((m) => {
            const activo = altas.has(m.nombre);
            return (
              <button
                key={m.clave} type="button" title={m.nota}
                onClick={() => setAltas((s) => { const n = new Set(s); if (n.has(m.nombre)) n.delete(m.nombre); else n.add(m.nombre); return n; })}
                className="t-dato"
                style={{
                  padding: "7px 13px", borderRadius: "var(--radio)", cursor: "pointer", font: "inherit", fontSize: 14,
                  border: `1px solid ${activo ? "var(--marca)" : "var(--linea)"}`,
                  background: activo ? "var(--marca)" : "var(--papel)",
                  color: activo ? "#fff" : "var(--tinta)",
                }}
                aria-pressed={activo}
              >
                {m.nombre}
              </button>
            );
          })}
        </div>
      </section>

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <div>
        <button type="button" className="boton boton--grande" disabled={guardando || !revision.listo} onClick={guardar}>
          {guardando ? "Guardando" : "Guardar mis números"}
        </button>
        {revision.listo ? (
          <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Puedes corregirlos cuando quieras. Nada se pierde.</p>
        ) : (
          <p className="t-dato mt-2 medida" style={{ color: "var(--contradicho)" }} role="status">
            Antes de guardar, corrige lo que está marcado en rojo arriba: {revision.invalidos.length > 0 ? "hay un número que no pudimos leer" : revision.negativos.length > 0 ? "hay un número con signo menos donde no puede ir" : "hay un monto sin su mes"}. Todavía no se guardó nada.
          </p>
        )}
      </div>

      {/* LO QUE YA ESTÁ: para que vea que su esfuerzo quedó guardado. */}
      {(puestos.length > 0 || serieVenta.length > 0) && (
        <section style={{ borderTop: "1px solid var(--linea)", paddingTop: 20 }}>
          <h2 className="t-seccion mb-3">Lo que ya nos contaste</h2>
          {serieVenta.length > 0 && (
            <div className="mb-4">
              <p className="t-etiqueta mb-2">Tus ventas mes a mes</p>
              <ul className="lista-editorial">
                {serieVenta.map((s) => (
                  <li key={s.periodo} className="flex items-baseline justify-between gap-3" style={{ padding: "7px 0" }}>
                    <span className="t-dato">
                      {nombreDePeriodo(s.periodo)}
                      {/* Leída de un documento que nadie revisó: no la «contó» el dueño, y se dice junto a la cifra. */}
                      {s.provisional && <span style={{ color: "var(--caducado)", fontWeight: 600 }}> · {ROTULO_CIFRA_PROVISIONAL}</span>}
                    </span>
                    <span className="t-dato" style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{soles(s.valor)}</span>
                  </li>
                ))}
              </ul>
              {serieVenta.length < 3 && (
                <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                  Con {serieVenta.length === 1 ? "un solo mes" : "dos meses"} todavía no se ve una curva. Con tres ya podemos decirte si vienes subiendo o bajando.
                </p>
              )}
            </div>
          )}
          {puestos.length > 0 && (
            <ul className="lista-editorial">
              {puestos.map((v) => (
                <li key={v.clave} style={{ padding: "6px 0" }}>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>{v.nombre}</span>
                  {soloDeDocumento.includes(v.clave) && <span className="t-dato" style={{ color: "var(--caducado)", fontWeight: 600 }}> · {ROTULO_CIFRA_PROVISIONAL}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* OTROS NÚMEROS: lo específico de esta empresa (la merma, las citas perdidas, los costos
          variables). No cierran la radiografía, pero antes se descartaban y con ellos se perdía lo
          que distingue a cada negocio. Lo que salió de un documento sin revisar se dice tal cual. */}
      {radiografia.otros.length > 0 && (
        <section style={{ borderTop: "1px solid var(--linea)", paddingTop: 20 }}>
          <h2 className="t-seccion mb-1">Otros números de tu empresa</h2>
          <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>
            No son de los nueve, pero son tuyos y se guardan. Lo que salió de un documento y nadie revisó todavía queda marcado como pendiente de conciliar.
          </p>
          <ul className="lista-editorial">
            {radiografia.otros.map((o) => (
              <li key={`${o.clave}·${o.periodo}`} className="flex items-baseline justify-between gap-3 flex-wrap" style={{ padding: "7px 0" }}>
                <span className="t-dato">
                  {o.nombre}
                  <span style={{ color: "var(--grafito)" }}> · {nombreDePeriodo(o.periodo)} · {o.etiquetaEstado}</span>
                </span>
                <span className="t-dato" style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {o.valor == null ? "sin dato" : o.reconocida ? soles(o.valor) : o.valor.toLocaleString("es-PE")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

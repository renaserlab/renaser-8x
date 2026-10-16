import {
  lecturaDeCorte, lineaBaseVigente, lineaBaseDe, versionesLineaBase,
  fechaDia, nombreVersion, textoPeriodo, textoSinVersion, fraseProvisionales, type Medicion, type AccionLigada,
} from "@/lib/medicion";
import { claseDeActa, fechaActa, type Acta } from "@/lib/actas";
import { actasDe } from "./datos";
import { AccionesMedicion } from "./AccionesMedicion";
import { FijarPuntoDePartida } from "./FijarPuntoDePartida";

/**
 * Lo que la pantalla del consultor necesita de un acta. De quién es (aceptación del dueño, constancia de la
 * consultora u otra) y el día en hora de Lima se resuelven aquí, en el servidor: el componente de cliente
 * no adivina por el rol ni formatea con la hora del navegador.
 */
const resumenActa = (a: Acta) => ({
  id: a.id,
  aceptado_nombre: a.aceptado_nombre,
  aceptado_rol: a.aceptado_rol,
  documento_path: a.documento_path,
  clase: claseDeActa(a),
  cuando: fechaActa(a.aceptado_at),
});

/**
 * EL PANEL DEL CONSULTOR: ¿MEJORÓ? Con la versión del punto de partida a la vista. Cada corte dice
 * contra qué versión se midió, si los períodos son comparables, qué cambió de condiciones y qué parte
 * del resultado se puede atribuir al trabajo (acción verificada) y cuál solo se observó. Debajo, las
 * versiones del punto de partida (vigente y anteriores, con su motivo) y el botón de acta por medición.
 *
 * LA LECTURA NO SE CALCULA AQUÍ: sale de `lecturaDeCorte`, la misma que leen «Tus números» y «Tus resultados»
 * en el portal, en voz de consultor. Hasta el 13-10-2026 este panel titulaba «El negocio deja S/2,000 más al
 * mes…» y «2 mejoraron, 0 empeoraron» con períodos no equivalentes, mientras el dueño leía «no se puede
 * comparar». Si la comparación no es un resultado (`esResultado` false), aquí tampoco se dice «mejoraron».
 */
export function PanelMediciones({ companyId, mediciones, actas, acciones, numerosListos, conVersiones = true }: {
  companyId: string;
  mediciones: Medicion[];
  actas: Acta[];
  acciones: AccionLigada[];
  numerosListos: number;
  conVersiones?: boolean;
}) {
  const vigente = lineaBaseVigente(mediciones);
  const versiones = versionesLineaBase(mediciones);
  const cortes = mediciones.filter((m) => m.tipo === "corte").sort((a, b) => b.numero - a.numero);
  const ultimo = cortes[0] ?? null;
  const { motivo: sinVersion } = lineaBaseDe(ultimo, mediciones);
  // El mismo criterio que lee el dueño en su portal: una sola función decide si esto es un resultado.
  const lectura = ultimo ? lecturaDeCorte({ corte: ultimo, mediciones, acciones, para: "consultor" }) : null;
  const baseDelCorte = lectura?.base ?? null;
  const equivalencia = lectura?.equivalencia ?? null;
  const atribs = lectura?.atribuciones ?? [];
  const cuenta = lectura?.cuenta ?? null;
  const esResultado = lectura?.esResultado ?? false;
  // «Empeoró» es un veredicto: solo se destaca cuando la comparación vale.
  const empeoraron = esResultado ? (lectura?.movimientos ?? []).filter((m) => m.mejoro === false).slice(0, 3) : [];

  return (
    <section className="panel p-5 mb-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h2 className="t-seccion">¿Mejoró?</h2>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>
          {numerosListos}/9 números · {cortes.length} corte{cortes.length === 1 ? "" : "s"}
          {vigente ? ` · punto de partida versión ${vigente.version ?? 1}` : ""}
        </span>
      </div>

      {!conVersiones && (
        <p className="t-dato mb-2" style={{ color: "var(--caducado)" }}>
          Esta base no tiene todavía las columnas de versión (migración de 13-10 sin aplicar): se muestra lo de siempre, sin versiones ni actas.
        </p>
      )}

      {!vigente ? (
        <>
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
            Sin punto de partida no hay contra qué comparar{cortes.length > 0 ? `, y ${cortes.length === 1 ? "hay un corte congelado sin él" : `hay ${cortes.length} cortes congelados sin él`}: no se comparan con nada` : ""}. {numerosListos < 5
              ? // Con versiones, FijarPuntoDePartida (debajo) ya dice cuántos tiene y cuántos hacen falta: no se repite.
                conVersiones
                ? ""
                : `Tiene ${numerosListos} de 9 números y hacen falta al menos 5 para fijarlo.`
              : "Ya tiene números suficientes: el dueño puede fijarlo desde Tus números, o se fija desde aquí."}
          </p>
          {conVersiones && <FijarPuntoDePartida companyId={companyId} vigente={null} numerosListos={numerosListos} />}
        </>
      ) : ultimo && !baseDelCorte && sinVersion === "sin_punto_de_partida" ? (
        <p className="t-cuerpo medida" style={{ color: "var(--caducado)" }}>
          Corte {ultimo.numero} del {fechaDia(ultimo.fecha)}: {textoSinVersion(sinVersion, "consultor")} El punto de partida vigente (versión {vigente.version ?? 1}) se fijó el {fechaDia(vigente.fecha)}; el próximo corte sí se medirá contra él.
        </p>
      ) : !ultimo ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Punto de partida (versión {vigente.version ?? 1}) fijado el {fechaDia(vigente.fecha)} con {Object.keys(vigente.valores).length} números, {textoPeriodo(vigente)}.
          Falta el primer corte para saber si algo se movió.
          {fraseProvisionales(vigente, "el punto de partida") ? ` ${fraseProvisionales(vigente, "el punto de partida")}` : ""}
        </p>
      ) : !lectura || lectura.noComparable ? (
        <p className="t-cuerpo medida" style={{ color: "var(--contradicho)" }}>{lectura?.noComparable ?? "Este corte no tiene punto de partida contra el que compararse."}</p>
      ) : (
        <>
          <p className="t-cuerpo" style={{ fontWeight: 550 }}>{lectura.titular}</p>
          <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
            Corte {ultimo.numero} del {fechaDia(ultimo.fecha)} · medido contra la versión {baseDelCorte?.version ?? 1} del punto de partida ({fechaDia(baseDelCorte?.fecha)})
            {lectura.veredicto.dias != null && lectura.veredicto.dias > 0 ? ` · ${lectura.veredicto.dias} días` : ""}
            {esResultado ? ` · ${lectura.veredicto.mejoraron} mejoraron, ${lectura.veredicto.empeoraron} empeoraron` : " · lo que se movió queda como observado, sin veredicto"}
          </p>
          {lectura.avisoVersion && (
            <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>{lectura.avisoVersion}</p>
          )}
          {baseDelCorte && !baseDelCorte.vigente && baseDelCorte.vigente != null && (
            <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>
              La versión {baseDelCorte.version} ya no está vigente (hoy rige la {vigente.version ?? 1}); la comparación de este corte no cambia por eso.
            </p>
          )}
          {equivalencia && (
            <p className="t-dato mt-1" style={{ color: equivalencia.equivalentes ? "var(--grafito)" : "var(--contradicho)" }}>
              {equivalencia.motivo}
              {equivalencia.avisos.length > 0 && ` ${equivalencia.avisos.join(" ")}`}
            </p>
          )}
          {cuenta && cuenta.movidos > 0 && (
            <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
              De {cuenta.movidos === 1 ? "1 número que se movió" : `${cuenta.movidos} números que se movieron`}: {cuenta.si} atribuible{cuenta.si === 1 ? "" : "s"} al trabajo (acción verificada), {cuenta.parcial} en parte, {cuenta.observados} solo observado{cuenta.observados === 1 ? "" : "s"}
              {cuenta.sinCambio > 0 ? `; ${cuenta.sinCambio} sin cambio` : ""}
              {cuenta.sinDato > 0 ? `; ${cuenta.sinDato} sin dato para comparar` : ""}.
              Reportado no es verificado, y verificado no es resultado.
            </p>
          )}
          {empeoraron.length > 0 && (
            <ul className="lista-editorial mt-3">
              {empeoraron.map((m) => (
                <li key={m.vital.clave} style={{ padding: "5px 0" }}>
                  <span className="t-dato" style={{ color: "var(--contradicho)" }}>{m.vital.nombre}: </span>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>{m.frase}</span>
                </li>
              ))}
            </ul>
          )}
          {atribs.length > 0 && (
            <details className="mt-3">
              <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Observado frente a atribuible, número por número</summary>
              <ul className="lista-editorial mt-2">
                {atribs.map((a) => (
                  <li key={a.clave} style={{ padding: "6px 0" }}>
                    <span className="t-dato" style={{ fontWeight: 600 }}>{a.nombre}</span>
                    <span className="t-dato" style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: a.atribuible === "si" ? "var(--confirmado)" : a.atribuible === "parcial" ? "var(--caducado)" : "var(--grafito)" }}>
                      {a.atribuible === "si" ? "ATRIBUIBLE" : a.atribuible === "parcial" ? "EN PARTE" : "SOLO OBSERVADO"}
                    </span>
                    <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>{a.observado} {a.motivo}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {vigente && conVersiones && (
        <details className="mt-4">
          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>
            Versiones del punto de partida ({versiones.length}) y actas
          </summary>
          <FijarPuntoDePartida companyId={companyId} vigente={{ version: vigente.version, fecha: vigente.fecha }} numerosListos={numerosListos} />
          <ul className="lista-editorial mt-2">
            {versiones.map((b) => (
              <li key={b.id} style={{ padding: "10px 0" }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="t-dato" style={{ fontWeight: 600 }}>{nombreVersion(b)}</span>
                  <span className="t-dato" style={{ fontSize: 12, fontWeight: 700, color: b.vigente === false ? "var(--grafito)" : "var(--confirmado)" }}>{b.vigente === false ? "REEMPLAZADA" : "VIGENTE"}</span>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>· fijada el {fechaDia(b.fecha)} · {Object.keys(b.valores).length} números · {textoPeriodo(b)}</span>
                </div>
                {b.motivo_version && <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Motivo de esta versión: {b.motivo_version}</p>}
                {fraseProvisionales(b, "esta versión") && <p className="t-dato" style={{ color: "var(--caducado)", margin: "2px 0 0" }}>{fraseProvisionales(b, "esta versión")}</p>}
                {b.condiciones?.temporada && <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Temporada: {b.condiciones.temporada}</p>}
                {(b.condiciones?.cambios ?? []).map((c, i) => (
                  <p key={i} className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Cambio desde el {fechaDia(c.desde)}: {c.que_cambio} — {c.efecto_esperado}</p>
                ))}
                {b.hash_contenido && <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0", fontSize: 12 }}>Huella: {b.hash_contenido.slice(0, 12)}…</p>}
                <AccionesMedicion companyId={companyId} medicionId={b.id} tipo="linea_base" actas={actasDe(actas, b.id).map(resumenActa)} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {cortes.length > 0 && conVersiones && (
        <details className="mt-3">
          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Cortes ({cortes.length}): contra qué versión, períodos, condiciones y actas</summary>
          <ul className="lista-editorial mt-2">
            {cortes.map((c) => {
              const ref = lineaBaseDe(c, mediciones);
              return (
                <li key={c.id} style={{ padding: "10px 0" }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="t-dato" style={{ fontWeight: 600 }}>Corte {c.numero}</span>
                    <span className="t-dato" style={{ color: "var(--grafito)" }}>
                      · {fechaDia(c.fecha)} ·{" "}
                      {ref.base
                        ? `medido contra la versión ${ref.base.version ?? 1}${ref.registrada ? "" : " (sin registro de versión: se asume la vigente)"}`
                        : "sin punto de partida al medir: no se compara"}{" "}
                      · {textoPeriodo(c)}
                    </span>
                  </div>
                  {!ref.registrada && <p className="t-dato" style={{ color: "var(--caducado)", margin: "2px 0 0" }}>{textoSinVersion(ref.motivo, "consultor")}</p>}
                  {c.condiciones?.temporada && <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Temporada: {c.condiciones.temporada}</p>}
                  {(c.condiciones?.cambios ?? []).map((x, i) => (
                    <p key={i} className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Cambio desde el {fechaDia(x.desde)}: {x.que_cambio} — {x.efecto_esperado}</p>
                  ))}
                  {c.nota && <p className="t-dato" style={{ color: "var(--grafito)", margin: "2px 0 0" }}>Nota: {c.nota}</p>}
                  <AccionesMedicion companyId={companyId} medicionId={c.id} tipo="corte" actas={actasDe(actas, c.id).map(resumenActa)} />
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

import Link from "next/link";
import { lineaBaseVigente, lecturaDeCorte, etiquetaAtribucion, fechaDia, textoPeriodo, fraseProvisionales, type Medicion, type AccionLigada, type TonoAtribucion } from "@/lib/medicion";
import { aceptacionDelDueno, constanciaDeLaConsultora, fechaActa, rutaActa, type Acta } from "@/lib/actas";
import { AceptarPuntoDePartida } from "./AceptarPuntoDePartida";

const COLOR_TONO: Record<TonoAtribucion, string> = { atribuible: "var(--confirmado)", parcial: "var(--caducado)", neutro: "var(--grafito)" };

/**
 * QUIÉN ACEPTÓ ESTO. La aceptación que cuenta para el dueño es la del dueño: si solo hay un acta de la
 * consultora, se muestra aparte como constancia y el botón para aceptar sigue ahí. Hasta el 13-10-2026
 * bastaba el acta de la consultora para que el dueño viera «Aceptado» y se quedara sin botón.
 */
function Aceptacion({ companyId, referenciaId, tipo, etiqueta, pendiente, actas, puedeAceptar, usuarioId }: {
  companyId: string;
  referenciaId: string;
  tipo: "linea_base" | "corte";
  etiqueta: string;
  /** Lo que lee quien no puede aceptar (no es el dueño) mientras el dueño no acepta. */
  pendiente: string;
  actas: Acta[];
  puedeAceptar: boolean;
  usuarioId: string | null;
}) {
  const delDueno = aceptacionDelDueno(actas, referenciaId);
  const constancia = constanciaDeLaConsultora(actas, referenciaId);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {delDueno ? (
        <p className="t-dato" style={{ color: "var(--confirmado)" }}>
          {usuarioId && delDueno.aceptado_por === usuarioId ? "Lo aceptaste" : `Aceptado por ${delDueno.aceptado_nombre ?? "el dueño de la empresa"}`} el {fechaActa(delDueno.aceptado_at)} ·{" "}
          <a href={delDueno.documento_path ?? rutaActa(delDueno.id)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Ver el acta</a>
        </p>
      ) : puedeAceptar ? (
        <AceptarPuntoDePartida companyId={companyId} referenciaId={referenciaId} tipo={tipo} etiqueta={etiqueta} />
      ) : (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>{pendiente}</p>
      )}
      {constancia && (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>
          Tu consultora dejó constancia el {fechaActa(constancia.aceptado_at)}
          {delDueno ? "" : puedeAceptar ? ". Eso no reemplaza tu aceptación" : ". Eso no reemplaza la aceptación del dueño"} ·{" "}
          <a href={constancia.documento_path ?? rutaActa(constancia.id)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Ver la constancia</a>
        </p>
      )}
    </div>
  );
}

/**
 * CÓMO VAMOS, PARA EL DUEÑO. Su punto de partida (qué versión y si ya lo aceptó ÉL), y cada corte con una
 * lectura honesta: qué se movió (observado), qué parte se puede atribuir al trabajo (solo con acción
 * verificada y sin otra explicación registrada) y si los períodos se pueden comparar. La lectura de cada
 * corte sale de `lecturaDeCorte`, la misma que usa «Tus números»: las dos pantallas dicen lo mismo.
 * Sin jerga: punto de partida, corte, números. Terminar tareas no es mejorar: aquí solo cuentan los números medidos.
 */
export function ComoVamos({ companyId, mediciones, actas, acciones, puedeAceptar, usuarioId = null }: {
  companyId: string;
  mediciones: Medicion[];
  actas: Acta[];
  acciones: AccionLigada[];
  /** true cuando quien mira es el dueño (membresía dueno): puede aceptar su punto de partida y sus cortes. */
  puedeAceptar: boolean;
  /** Quién mira, para decir «lo aceptaste» solo cuando el acta es suya. */
  usuarioId?: string | null;
}) {
  const vigente = lineaBaseVigente(mediciones);
  const cortes = mediciones.filter((m) => m.tipo === "corte").sort((a, b) => b.numero - a.numero);

  if (!vigente)
    return (
      <section className="panel p-5 mb-8">
        <h2 className="t-seccion mb-2">Cómo vamos</h2>
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Todavía no fijaste tu punto de partida: la foto de tus números de hoy contra la que vamos a comparar todo lo que hagamos.
          Se fija desde <Link href="/portal/numeros" style={{ textDecoration: "underline" }}>Tus números</Link> cuando tengas al menos 5 de los 9.
        </p>
      </section>
    );

  return (
    <section className="mb-10">
      <h2 className="t-seccion mb-1">Cómo vamos</h2>
      <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>
        Lo que se movió en tus números desde el punto de partida, y qué parte se puede atribuir al trabajo que hicimos juntos. Terminar tareas no es mejorar el negocio: aquí solo cuentan los números medidos.
      </p>

      {/* EL PUNTO DE PARTIDA: versión, fecha, y si el dueño lo aceptó */}
      <div className="panel p-5 mb-4">
        <p className="t-etiqueta">Tu punto de partida · versión {vigente.version ?? 1}</p>
        <p className="t-cuerpo mt-2 medida">
          Fijado el <strong>{fechaDia(vigente.fecha)}</strong> con {Object.keys(vigente.valores).length} números, {textoPeriodo(vigente)}.
          {(vigente.version ?? 1) > 1 && vigente.motivo_version && <> Se volvió a fijar porque: {vigente.motivo_version}. Las versiones anteriores se conservan.</>}
        </p>
        {/* Un número que salió de un documento sin revisar no se acepta como firme: se dice aquí, donde se acepta. */}
        {fraseProvisionales(vigente, "tu punto de partida") && (
          <p className="t-dato mt-2 medida" style={{ color: "var(--caducado)" }}>{fraseProvisionales(vigente, "tu punto de partida")}</p>
        )}
        {vigente.condiciones?.temporada && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Temporada del período: {vigente.condiciones.temporada}.</p>}
        <Aceptacion
          companyId={companyId}
          referenciaId={vigente.id}
          tipo="linea_base"
          etiqueta="Aceptar este punto de partida"
          pendiente="Pendiente de aceptación por el dueño de la empresa."
          actas={actas}
          puedeAceptar={puedeAceptar}
          usuarioId={usuarioId}
        />
      </div>

      {/* LOS CORTES, del más reciente al más antiguo */}
      {cortes.length === 0 ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Todavía no hay ningún corte. Cuando pase un mes, actualiza tus números y registra uno en <Link href="/portal/numeros" style={{ textDecoration: "underline" }}>Tus números</Link>: ahí verás qué se movió.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {cortes.map((corte, i) => {
            const l = lecturaDeCorte({ corte, mediciones, acciones });
            const grave = l.periodos?.veredicto === "no_equivalentes";
            return (
              <details key={corte.id} className="panel p-5" open={i === 0}>
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <span className="t-etiqueta">Corte {corte.numero} · {fechaDia(corte.fecha)}</span>
                  <span className="t-cuerpo mt-1" style={{ display: "block", fontWeight: 550 }}>{l.titular}</span>
                </summary>
                {l.base ? (
                  <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                    Medido contra la versión {l.base.version ?? 1} de tu punto de partida ({fechaDia(l.base.fecha)}).
                    {l.avisoVersion ? ` ${l.avisoVersion}` : ""}
                    {l.veredicto.dias != null && l.veredicto.dias > 0 ? ` Pasaron ${l.veredicto.dias} días.` : ""}
                  </p>
                ) : (
                  <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                    Tu punto de partida de hoy (versión {vigente.version ?? 1}) se fijó el {fechaDia(vigente.fecha)}; este corte no se compara con él.
                  </p>
                )}
                {l.periodos && (
                  <p className="t-dato mt-1" style={{ color: grave ? "var(--contradicho)" : l.periodos.veredicto === "sin_periodo" ? "var(--caducado)" : "var(--grafito)", fontWeight: grave ? 600 : 400 }}>
                    {l.periodos.texto}
                  </p>
                )}
                {l.lecturaAtribucion && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{l.lecturaAtribucion}</p>}
                {l.atribuciones.length > 0 && (
                  <ul className="lista-editorial mt-3">
                    {l.atribuciones.map((a) => {
                      const e = etiquetaAtribucion(a);
                      // Si la comparación no es un resultado (períodos no equivalentes o sin registrar), subir o bajar no es mejorar ni empeorar: el punto no se pinta de verde ni de rojo.
                      const punto = !l.esResultado ? "var(--linea)" : a.mejoro === true ? "var(--confirmado)" : a.mejoro === false ? "var(--contradicho)" : "var(--linea)";
                      return (
                        <li key={a.clave} style={{ padding: "9px 0" }}>
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span aria-hidden="true" style={{ flex: "none", width: 8, height: 8, borderRadius: 4, background: punto }} />
                            <span className="t-cuerpo" style={{ fontWeight: 550 }}>{a.nombre}</span>
                            <span className="t-dato" style={{ fontSize: 12.5, fontWeight: 700, color: COLOR_TONO[e.tono] }}>{e.etiqueta}</span>
                          </div>
                          <p className="t-dato mt-1" style={{ color: "var(--grafito)", paddingLeft: 20 }}>{a.observado}</p>
                          {a.delta != null && a.delta !== 0 && <p className="t-dato" style={{ color: "var(--grafito)", paddingLeft: 20, fontSize: 12.5 }}>{a.motivo}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Aceptacion
                  companyId={companyId}
                  referenciaId={corte.id}
                  tipo="corte"
                  etiqueta={`Aceptar el corte ${corte.numero}`}
                  pendiente="Este corte todavía no tiene la aceptación del dueño de la empresa."
                  actas={actas}
                  puedeAceptar={puedeAceptar}
                  usuarioId={usuarioId}
                />
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

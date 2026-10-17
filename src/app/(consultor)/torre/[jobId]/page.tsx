import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/base/Vacio";
import { ejecucion } from "@/lib/torre";

export const dynamic = "force-dynamic";

const miles = (n: number) => n.toLocaleString("es-PE");
const dur = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const fecha = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "—");

/** El sello de cada estado (.estado del sistema). */
const SELLO: Record<string, "ok" | "alto" | "neutro"> = { hecho: "ok", fallido: "alto", pendiente: "neutro", tomado: "neutro" };

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="dato">
      <div className="t-rotulo">{etiqueta}</div>
      <div className="t-dato">{children}</div>
    </div>
  );
}

/**
 * EL INSPECTOR DE UNA EJECUCIÓN (§9). Muestra todo lo que quedó registrado y, al final, nombra lo
 * que NO se registró. Ese último bloque es el que hace honesto al resto: sin él, la pantalla
 * parecería completa y cualquiera supondría que el sistema guarda cosas que no guarda.
 */
export default async function InspectorEjecucion({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const e = await ejecucion(jobId);
  if (!e) notFound();
  const { resumen: r } = e;

  return (
    <>
      <Encabezado
        titulo={`Ejecución: ${r.tipo}`}
        sub={`${r.empresa ?? "sin empresa"} · ${r.estado}`}
        acciones={<Link href="/torre?vista=ejecuciones" className="boton boton--secundario">Volver a la torre</Link>}
      />

      <section className="panel p-5" style={{ marginBottom: 24 }}>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Dato etiqueta="Estado">
            <span className={`estado ${SELLO[r.estado] ?? "neutro"}`}>{r.estado}</span>
          </Dato>
          <Dato etiqueta="Empresa">
            {r.companyId ? <Link href={`/empresa/${r.companyId}`}>{r.empresa ?? r.companyId.slice(0, 8)}</Link> : "—"}
          </Dato>
          <Dato etiqueta="Reintentos">{r.reintentos || "ninguno"}</Dato>
          <Dato etiqueta="Llamadas al modelo">{r.llamadasModelo}</Dato>
          <Dato etiqueta="Empezó">{fecha(r.tomadoAt)}</Dato>
          <Dato etiqueta="Terminó">{fecha(r.terminadoAt)}</Dato>
          <Dato etiqueta="Duró">{r.duracionSeg == null ? "—" : `${r.duracionSeg} s`}</Dato>
          <Dato etiqueta="Tokens">{r.tokens ? miles(r.tokens) : "—"}</Dato>
          <Dato etiqueta="Agentes">{r.agentes.length ? r.agentes.join(", ") : "ninguno: no llamó al modelo"}</Dato>
        </div>
        {r.progreso && (
          <p className="t-dato" style={{ marginTop: 12, color: "var(--grafito)" }}>Último avance anotado: {r.progreso}</p>
        )}
        {r.error && (
          <p className="t-cuerpo" role="alert" style={{ marginTop: 12, color: "var(--contradicho)" }}>Error: {r.error}</p>
        )}
      </section>

      {e.anteriorAlRegistro && (
        <p className="aviso" role="note" style={{ marginBottom: 20 }}>
          Esta ejecución es <strong>anterior a que se registrara la procedencia</strong>. Sus fuentes, su configuración efectiva y su
          entrega al siguiente paso no se guardaron entonces — y no se reconstruyen aquí por inferencia. El hueco es de instrumentación,
          no de trabajo.
        </p>
      )}

      {/* LAS FUENTES, POR REFERENCIA */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">Qué fuentes leyó ({e.fuentes.length})</h2>
        {e.fuentes.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
            Ninguna registrada. Se guardan <strong>referencias con su versión</strong>, nunca una copia del material: duplicarlo
            multiplicaría la superficie de exposición de los documentos del cliente sin añadir nada.
          </p>
        ) : (
          <ul className="lista-editorial">
            {e.fuentes.map((f) => (
              <li key={f.id}>
                <strong>{f.nombre}</strong>{" "}
                <span className="t-dato" style={{ color: "var(--grafito)" }}>versión {f.version ?? "sin fecha"} · {f.id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* LA TRANSFERENCIA AL SIGUIENTE PASO */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">De dónde vino y a qué entregó</h2>
        {e.cadena.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Sin cadena registrada.</p>
        ) : (
          <ul className="lista-editorial">
            {e.cadena.map((c) => (
              <li key={c.id + c.direccion}>
                <span className="t-etiqueta">{c.direccion === "vino_de" ? "VINO DE" : "ENTREGÓ A"}</span>{" "}
                <Link href={`/torre/${c.id}`}>{c.tipo}</Link>{" "}
                <span className="t-dato" style={{ color: "var(--grafito)" }}>· {c.estado} · {fecha(c.creado)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* EL DISPARADOR */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">Con qué se disparó</h2>
        {e.payload && Object.keys(e.payload).length > 0 ? (
          <pre className="codigo">
            {JSON.stringify(e.payload, null, 2)}
          </pre>
        ) : (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Sin parámetros: el trabajo se dispara sin argumentos.</p>
        )}
      </section>

      {/* LAS LLAMADAS AL MODELO, CONTRA SU CONTRATO */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">Llamadas al modelo ({e.llamadas.length})</h2>
        {e.llamadas.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
            Esta ejecución no llamó a ningún modelo. No es un error: hay trabajos que solo mueven datos.
          </p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Modelo</th>
                <th>Prompt</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Presupuesto</th>
                <th>Tardó</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {e.llamadas.map((l, i) => {
                const excedido = l.contrato != null && l.tokensSalida > l.contrato.presupuesto_tokens;
                return (
                  <tr key={i}>
                    <td>{l.agente ?? "—"}{!l.esAgenteConContrato && l.agente ? <span className="t-dato" style={{ color: "var(--caducado)" }}> · no es un agente</span> : null}</td>
                    <td className="t-dato">{l.modelo ?? "—"}</td>
                    <td className="t-dato">
                      {l.versionPrompt ?? "—"}
                      {l.contratoVersion ? (
                        <span style={{ color: l.contrato && l.contratoVersion !== l.contrato.version ? "var(--caducado)" : "var(--grafito)" }}>
                          {" "}· contrato v{l.contratoVersion}
                          {l.contrato && l.contratoVersion !== l.contrato.version ? ` (hoy v${l.contrato.version})` : ""}
                        </span>
                      ) : (
                        <span style={{ color: "var(--grafito)" }}> · contrato no registrado</span>
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{miles(l.tokensEntrada)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", color: excedido ? "var(--caducado)" : undefined }}>{miles(l.tokensSalida)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }} className="t-dato">
                      {l.contrato ? miles(l.contrato.presupuesto_tokens) : <span style={{ color: "var(--caducado)" }}>sin contrato</span>}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{dur(l.latenciaMs)}</td>
                    <td className="t-dato" style={{ color: l.error ? "var(--contradicho)" : "var(--confirmado)" }}>
                      {l.error ? l.error.slice(0, 60) : "correcta"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* LO QUE PRODUJO */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">Qué produjo</h2>
        {e.resultado != null ? (
          <pre className="codigo" style={{ maxHeight: 320 }}>
            {JSON.stringify(e.resultado, null, 2)}
          </pre>
        ) : (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>No guardó un resumen de resultado.</p>
        )}
      </section>

      {/* INTERVENCIÓN HUMANA */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-seccion mb-2">Intervención humana en esta empresa</h2>
        {e.intervenciones.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Nada registrado alrededor de esta ejecución.</p>
        ) : (
          <ul className="lista-editorial">
            {e.intervenciones.map((i, n) => (
              <li key={n}>
                <strong>{i.accion}</strong> {i.entidad ? `· ${i.entidad}` : ""}{" "}
                <span className="t-dato" style={{ color: "var(--grafito)" }}>
                  {i.actor ? `por ${i.actor}` : ""} · {fecha(i.cuando)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="t-dato" style={{ color: "var(--grafito)", marginTop: 8 }}>
          Es la auditoría de la empresa en fechas cercanas, no acciones atadas a esta ejecución en particular. La diferencia importa.
        </p>
      </section>

      {/* LOS HUECOS, NOMBRADOS */}
      <section className="panel p-5">
        <h2 className="t-seccion mb-1">Lo que NO quedó registrado de esta ejecución</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 10 }}>
          Se nombra en vez de rellenarse. Reconstruirlo por inferencia y mostrarlo como comprobado sería inventar con buena letra.
        </p>
        <ul className="lista-editorial">
          {e.noRegistrado.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

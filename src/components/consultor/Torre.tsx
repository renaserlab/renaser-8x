import Link from "next/link";
import type { AgenteEnTorre, EjecucionResumen, Cobertura as TipoCobertura, NoEsAgente } from "@/lib/torre";

/**
 * LA TORRE, EN PANTALLA. Cuatro reglas que no se rompen:
 *
 *  1. La ficha muestra la configuración EFECTIVA — la que el código impone — junto a lo medido.
 *     Nunca una descripción escrita a mano que pueda haber quedado desactualizada.
 *  2. Un agente sin filas dice «sin registro recuperable», no «nunca ha corrido». No es lo mismo, y
 *     el rastreo adversarial del 27-09 demostró por qué: `jobs` y `token_usage` cuelgan de la empresa
 *     con `on delete cascade`, y el 31-08 se eliminaron 18 de 23 empresas con todo su historial. La
 *     ausencia de filas no distingue «no corrió» de «su empresa ya no existe». Tampoco se muestra en
 *     cero, que se leería como «trabajó y le fue mal».
 *  3. Cada número dice DE QUÉ es. Un trabajo no es una llamada al modelo, y un reintento no es un
 *     trabajo nuevo. Confundirlos ya produjo dos reportes falsos.
 *  4. Todo tope de cobertura se declara en pantalla. Un recorte silencioso se lee como «esto es todo».
 */

const COLOR_ESTADO: Record<string, string> = {
  hecho: "var(--confirmado)",
  fallido: "var(--contradicho)",
  pendiente: "var(--medida)",
  tomado: "var(--medida)",
};

const miles = (n: number) => n.toLocaleString("es-PE");
const dur = (ms: number | null) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const fecha = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="t-etiqueta">{etiqueta}</div>
      <div className="t-dato">{children}</div>
    </div>
  );
}

/** El periodo consultado y los límites de cobertura. Siempre visible: no hay recortes callados. */
export function Cobertura({ cobertura }: { cobertura: TipoCobertura }) {
  return (
    <p className="t-dato" style={{ color: "var(--grafito)", borderLeft: "2px solid var(--linea)", paddingLeft: 10, margin: 0 }}>
      <strong>Periodo consultado:</strong> {cobertura.desde ? fecha(cobertura.desde) : "—"} → {cobertura.hasta ? fecha(cobertura.hasta) : "—"}.{" "}
      {cobertura.metodo}{" "}
      {cobertura.topes.length > 0 ? (
        <span style={{ color: "var(--caducado)" }}>Límites: {cobertura.topes.join(" ")}</span>
      ) : (
        <span>Sin límites de cobertura.</span>
      )}
    </p>
  );
}

/**
 * Etiquetas que están en la columna `agente` de token_usage y NO son agentes. Se muestran aparte
 * porque colarlas entre los agentes fue justo lo que hizo que la torre presentara «contrastar» y
 * «generar_proceso» —nombres de tipo de trabajo— como si fueran agentes del sistema.
 */
export function NoSonAgentes({ filas }: { filas: NoEsAgente[] }) {
  const sucias = filas.filter((f) => !f.esFalloDeTrabajo);
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="t-etiqueta" style={{ cursor: "pointer", color: sucias.length ? "var(--caducado)" : "var(--grafito)" }}>
        En la columna «agente» pero no son agentes ({filas.length})
      </summary>
      <table className="tabla" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Etiqueta</th>
            <th>Llamadas</th>
            <th>Qué es</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta}>
              <td>{f.etiqueta}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{miles(f.llamadas)}</td>
              <td className="t-dato">
                {f.esFalloDeTrabajo ? (
                  "Fallo del trabajo, no de un agente: puede ocurrir antes o después de cualquier llamada al modelo."
                ) : (
                  <span style={{ color: "var(--caducado)" }}>
                    Dato anterior a la corrección: el worker escribía aquí el tipo de trabajo sin prefijo. No se borra — es historia real.
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function FichaAgente({ agente }: { agente: AgenteEnTorre }) {
  const { contrato: c, real } = agente;
  const sinRegistro = real === null;
  return (
    <article className="panel" style={{ borderTop: `2.5px solid ${sinRegistro ? "var(--linea)" : "var(--marca)"}` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>
          {c.clave}{" "}
          <span className="t-dato" style={{ color: "var(--grafito)", fontWeight: 400 }}>v{c.version} · responde {c.responsable}</span>
        </h3>
        <span className="t-dato" style={{ color: sinRegistro ? "var(--grafito)" : "var(--confirmado)" }}>
          {sinRegistro
            ? agente.huella
              ? `sin registro recuperable · la huella cuenta ${miles(agente.huella.llamadas)} llamadas`
              : "sin ejecuciones conocidas"
            : `${miles(real.llamadasModelo)} llamadas al modelo en ${miles(real.trabajosDistintos)} trabajos`}
        </span>
      </div>
      <p className="t-cuerpo" style={{ marginTop: 6 }}>{c.proposito}</p>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 14 }}>
        <Dato etiqueta="Qué lo dispara">{c.disparador}</Dato>
        <Dato etiqueta="Qué entrega">{c.salida}</Dato>
        <Dato etiqueta="Quién aprueba">{c.aprobador === "nadie" ? "nadie: no produce nada que el dueño lea directo" : c.aprobador}</Dato>
        <Dato etiqueta="Presupuesto por ejecución">
          {miles(c.presupuesto_tokens)} tokens <span style={{ color: "var(--grafito)" }}>{c.medido ? "(medido)" : "(heredado, sin medición)"}</span>
        </Dato>
        <Dato etiqueta="Tiempo máximo">{dur(c.tiempo_max_ms)}</Dato>
        <Dato etiqueta="Reintentos permitidos">{c.reintentos}</Dato>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--linea)" }}
      >
        {sinRegistro ? (
          <>
            <Dato etiqueta="Ejecución real">
              <span style={{ color: "var(--grafito)" }}>
                Sin ejecuciones en el registro recuperable. <strong>Eso no prueba que nunca haya corrido:</strong> las ejecuciones
                se borran junto con la empresa, y el 31-08-2026 se eliminaron 18 de 23 empresas con todo su historial dentro.
              </span>
            </Dato>
            <Dato etiqueta="Huella que sobrevive al borrado">
              {agente.huella ? (
                <span style={{ color: "var(--medida)" }}>
                  {miles(agente.huella.llamadas)} llamadas · {fecha(agente.huella.primera)} → {fecha(agente.huella.ultima)}
                </span>
              ) : (
                <span style={{ color: "var(--grafito)" }}>ninguna desde que se cuenta (27-09-2026)</span>
              )}
            </Dato>
          </>
        ) : (
          <>
            <Dato etiqueta="Llamadas con error">
              {real.llamadasConError > 0 ? (
                <span style={{ color: "var(--caducado)" }}>{miles(real.llamadasConError)} de {miles(real.llamadasModelo)}</span>
              ) : (
                <span style={{ color: "var(--confirmado)" }}>ninguna de {miles(real.llamadasModelo)}</span>
              )}
            </Dato>
            <Dato etiqueta="Latencia media">
              {dur(real.latenciaMediaMs)} <span style={{ color: "var(--grafito)" }}>(máx {dur(real.latenciaMaxMs)})</span>
            </Dato>
            <Dato etiqueta="Tokens consumidos">
              {miles(real.tokensEntrada + real.tokensSalida)}{" "}
              <span style={{ color: "var(--grafito)" }}>({miles(real.tokensSalida)} de salida)</span>
            </Dato>
            <Dato etiqueta="Primera y última vez">{fecha(real.primera)} → {fecha(real.ultima)}</Dato>
            <Dato etiqueta="Modelo usado">{real.modelos.length ? real.modelos.join(" · ") : "—"}</Dato>
            <Dato etiqueta="Evaluación de calidad">
              <span style={{ color: "var(--grafito)" }}>sin evaluar</span>
            </Dato>
          </>
        )}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Sus límites y lo que no puede hacer</summary>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 10 }}>
          <Dato etiqueta="Fuentes autorizadas">{c.fuentes.join(" · ")}</Dato>
          <Dato etiqueta="Entrada obligatoria">{c.entrada}</Dato>
          <Dato etiqueta="Acciones prohibidas">
            <ul className="lista-editorial" style={{ margin: 0 }}>
              {c.acciones_prohibidas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Dato>
          <Dato etiqueta="Cuándo se considera bien hecho">{c.exito}</Dato>
          <Dato etiqueta="Cuándo para">{c.parada}</Dato>
          <Dato etiqueta="Cómo se recupera">{c.recuperacion}</Dato>
        </div>
      </details>
    </article>
  );
}

export function ListaEjecuciones({ filas }: { filas: EjecucionResumen[] }) {
  if (filas.length === 0) return null;
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Estado</th>
          <th>Trabajo</th>
          <th>Empresa</th>
          <th>Agentes</th>
          <th>Llamadas</th>
          <th>Reintentos</th>
          <th>Duró</th>
          <th>Tokens</th>
          <th>Cuándo</th>
          <th aria-label="Abrir"></th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.jobId}>
            <td style={{ color: COLOR_ESTADO[f.estado] ?? "var(--grafito)" }}>{f.estado}</td>
            <td>{f.tipo}</td>
            <td>{f.empresa ?? "—"}</td>
            <td className="t-dato">
              {f.agentes.length ? f.agentes.join(", ") : <span style={{ color: "var(--grafito)" }}>ningún agente</span>}
            </td>
            <td style={{ fontVariantNumeric: "tabular-nums" }}>{f.llamadasModelo || "—"}</td>
            <td style={{ fontVariantNumeric: "tabular-nums", color: f.reintentos > 0 ? "var(--caducado)" : undefined }}>{f.reintentos || "—"}</td>
            <td style={{ fontVariantNumeric: "tabular-nums" }}>{f.duracionSeg == null ? "—" : `${f.duracionSeg} s`}</td>
            <td style={{ fontVariantNumeric: "tabular-nums" }}>{f.tokens ? miles(f.tokens) : "—"}</td>
            <td className="t-dato">{fecha(f.terminadoAt ?? f.tomadoAt)}</td>
            <td>
              <Link href={`/torre/${f.jobId}`} className="t-dato">Abrir</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

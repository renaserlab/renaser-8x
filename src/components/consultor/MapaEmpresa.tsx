import Link from "next/link";
import { NIVELES } from "@/lib/madurez";
import { NOMBRE_PRIORIDAD, type Prioridad } from "@/lib/matriz";
import type { MapaEmpresa as Mapa, ProcesoEvaluado, EstadoDoc } from "@/lib/mapa-empresa";

/**
 * LA RADIOGRAFÍA, EN PANTALLA. Lo que convierte «te hicimos unos documentos» en «tu empresa pasó
 * de nivel 1 a nivel 3»: un número que se sustenta, y debajo el detalle de por qué es ese y no otro.
 *
 * Cada nivel muestra CON QUÉ se ganó y QUÉ FALTA para el siguiente. Un número sin sustento es una
 * opinión con decimales.
 */

/** Coma decimal, siempre. toLocaleString depende de datos de idioma que el servidor puede no tener,
 *  y un «0.3» donde debe decir «0,3» es de las cosas que hacen dudar de todo lo demás. */
const conComa = (n: number) => String(n).replace(".", ",");

const COLOR_NIVEL = ["var(--linea)", "var(--sin-verificar)", "var(--sin-verificar)", "var(--medida)", "var(--confirmado)", "var(--confirmado)"];

function Barra({ nivel }: { nivel: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ display: "block", width: 26, height: 6, borderRadius: 3, background: n <= nivel ? COLOR_NIVEL[Math.round(nivel)] ?? "var(--marca)" : "var(--linea)" }} />
      ))}
    </div>
  );
}

const ETIQUETA_DOC: Record<EstadoDoc, { texto: string; color: string }> = {
  listo: { texto: "escrito", color: "var(--confirmado)" },
  levantado: { texto: "nos lo contaron", color: "var(--medida)" },
  falta: { texto: "falta", color: "var(--grafito)" },
};

function FilaProceso({ p, base }: { p: ProcesoEvaluado; base: string }) {
  const { evaluacion: e } = p;
  return (
    <li style={{ padding: "10px 0", borderBottom: "1px solid var(--linea)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`${base}/procesos/${p.id}`} style={{ fontWeight: 500 }}>
          {p.nombre}
        </Link>
        <span className="flex items-center gap-2">
          <Barra nivel={e.nivel} />
          <span className="t-dato" style={{ color: "var(--grafito)" }}>
            {e.nivel} · {e.nombre}
          </span>
        </span>
      </div>
      {e.siguiente && (
        <div className="t-dato" style={{ marginTop: 4, color: "var(--grafito)" }}>
          Para subir: {e.siguiente}
        </div>
      )}
    </li>
  );
}

export function MapaEmpresa({ mapa, base }: { mapa: Mapa; base: string }) {
  const { perfil, empresa, documentos, partes, sinCategoria, matriz, cadena, cultura } = mapa;
  const conAlgo = partes.filter((p) => p.mapeados.length || p.faltan.length);
  const porPrioridad = (pr: Prioridad) => documentos.filter((d) => d.prioridad === pr);

  return (
    <>
      {/* EL NÚMERO, y de inmediato con qué se calculó. */}
      <section className="panel" style={{ marginBottom: 28 }}>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="t-etiqueta">Nivel de la empresa</div>
            <div className="num-grande">
              {conComa(empresa.nivel)} <span style={{ fontSize: "0.45em", color: "var(--grafito)" }}>de 5</span>
            </div>
            <div className="t-dato" style={{ color: "var(--grafito)" }}>
              {empresa.mapeados} de {empresa.esperados} procesos mapeados
            </div>
          </div>
          <div>
            <div className="t-etiqueta">Lo que ya está mapeado</div>
            <div className="num-grande" style={{ color: "var(--grafito)" }}>
              {conComa(empresa.nivelMapeados)} <span style={{ fontSize: "0.45em" }}>de 5</span>
            </div>
            <div className="t-dato" style={{ color: "var(--grafito)" }}>{empresa.nombreMapeados}</div>
          </div>
          <p className="t-cuerpo" style={{ flex: "1 1 300px", margin: 0 }}>
            El nivel de la empresa se calcula sobre los <strong>{empresa.esperados}</strong> procesos que este negocio necesita, no solo
            sobre los {empresa.mapeados} que ya contó: contar únicamente lo hecho daría un número bonito y falso. El segundo número dice
            qué tan bien está lo que sí se mapeó.
          </p>
        </div>
        <ol style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 20, padding: 0, listStyle: "none" }}>
          {NIVELES.map((n) => (
            <li key={n.nivel} style={{ flex: "1 1 150px", opacity: n.nivel <= Math.ceil(empresa.nivel) ? 1 : 0.5 }}>
              <div className="t-etiqueta">
                {n.nivel} · {n.nombre}
              </div>
              <div className="t-dato" style={{ color: "var(--grafito)" }}>{n.queSignifica}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* QUÉ CLASE DE NEGOCIO ES. De aquí sale todo lo demás. */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="t-seccion mb-1">Qué clase de negocio es</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
          Leído de lo que la empresa ya contó. No se le preguntó nada de esto en un formulario.
        </p>
        {perfil.rasgos.length === 0 ? (
          <p className="t-cuerpo">Todavía no ha contado lo suficiente como para afirmar nada. La matriz de abajo es la base que necesita cualquier negocio.</p>
        ) : (
          <ul className="lista-editorial">
            {perfil.rasgos.map((r) => (
              <li key={r.clave}>
                <strong>{r.nombre}</strong>
                <div className="t-dato" style={{ color: "var(--grafito)" }}>{r.porque}</div>
              </li>
            ))}
          </ul>
        )}
        {(perfil.personas != null || perfil.sedes != null) && (
          <p className="t-dato" style={{ color: "var(--grafito)", marginTop: 8 }}>
            {perfil.personas != null && `${perfil.personas} personas`}
            {perfil.personas != null && perfil.sedes != null && " · "}
            {perfil.sedes != null && `${perfil.sedes} ${perfil.sedes === 1 ? "sede" : "sedes"}`}
          </p>
        )}
        {matriz.porAveriguar.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="t-etiqueta" style={{ cursor: "pointer" }}>
              Falta preguntar ({matriz.porAveriguar.length})
            </summary>
            <ul className="lista-editorial" style={{ marginTop: 10 }}>
              {matriz.porAveriguar.map((r) => (
                <li key={r.nombre}>
                  <strong>{r.nombre}</strong>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>{r.porque}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* CÓMO ES ESTA EMPRESA. Solo lo que mostró con una historia. */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="t-seccion mb-1">Cómo es esta empresa</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
          Ninguna forma de ser es la buena: cada una compra algo y rompe algo. Lo que importa es si lo que el dueño dice querer
          coincide con lo que hoy premia sin darse cuenta.
        </p>
        {cultura.presentes.length === 0 ? (
          <p className="t-cuerpo">
            Todavía no contó ninguna historia que muestre cómo es su empresa. Eso no es un defecto: es lo siguiente que hay que
            preguntarle.
          </p>
        ) : (
          <ul className="lista-editorial">
            {cultura.presentes.map((c) => (
              <li key={c.clave}>
                <strong>{c.nombre}</strong>
                <div className="t-dato" style={{ color: "var(--grafito)" }}>{c.comoSeVe}</div>
                <div className="t-dato" style={{ color: "var(--grafito)", marginTop: 2 }}>
                  Lo que gana: {c.fuerza}. <span style={{ color: "var(--caducado)" }}>Lo que hay que vigilar: {c.riesgo}.</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cultura.porPreguntar.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Qué preguntarle para completarlo ({cultura.porPreguntar.length})</summary>
            <ul className="lista-editorial" style={{ marginTop: 10 }}>
              {cultura.porPreguntar.map((c) => (
                <li key={c.clave}>{c.pregunta}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* LA CADENA: donde se pierde lo prometido entre una parte y la siguiente. */}
      {(cadena.corte || cadena.traspasos.length > 0) && (
        <section style={{ marginBottom: 28 }}>
          <h2 className="t-seccion mb-1">Por dónde pasa el negocio</h2>
          <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
            Lo que se promete se pierde ENTRE una parte y la siguiente, no dentro de ellas: cada área hizo bien lo suyo y aun así
            el cliente recibió otra cosa. Nadie lo registra porque nadie se siente dueño del traspaso.
          </p>
          {cadena.corte && (
            <p className="t-cuerpo" style={{ marginBottom: 12 }}>
              <strong>La cadena se corta en «{cadena.corte.nombre}».</strong> De esa parte no ha contado nada todavía, y todo lo que
              viene después depende de ella, porque es la que entrega {cadena.corte.entrega}.
            </p>
          )}
          {cadena.traspasos.length > 0 && (
            <ul className="lista-editorial">
              {cadena.traspasos.map((t) => (
                <li key={`${t.de.clave}-${t.a.clave}`}>
                  <strong>
                    {t.de.nombre} → {t.a.nombre}
                  </strong>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>{t.pregunta}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* LA MATRIZ DE DOCUMENTACIÓN. */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="t-seccion mb-1">Lo que este negocio necesita tener escrito</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 12 }}>
          {documentos.filter((d) => d.estado === "listo").length} de {documentos.length} listos. Cada pieza dice para qué sirve: sin ese porqué, una lista de documentos es burocracia.
        </p>
        {([1, 2, 3] as Prioridad[]).map((pr) =>
          porPrioridad(pr).length ? (
            <div key={pr} style={{ marginBottom: 16 }}>
              <h3 className="t-etiqueta" style={{ marginBottom: 6 }}>{NOMBRE_PRIORIDAD[pr]}</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {porPrioridad(pr).map((d) => (
                  <li key={d.clave} style={{ padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <strong>{d.nombre}</strong>
                      <span className="t-dato" style={{ color: ETIQUETA_DOC[d.estado].color }}>{ETIQUETA_DOC[d.estado].texto}</span>
                    </div>
                    <div className="t-dato" style={{ color: "var(--grafito)" }}>{d.porque}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </section>

      {/* EL MAPA DE LAS 13 PARTES. */}
      <section>
        <h2 className="t-seccion mb-1">El negocio, parte por parte</h2>
        <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 16 }}>
          Las trece partes que tiene toda empresa. Solo se muestran aquellas donde ya hay algo mapeado o algo que falta.
        </p>
        {conAlgo.map((parte) => (
          <div key={parte.clave} style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>{parte.nombre}</h3>
            <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 8 }}>
              {parte.pregunta} <span style={{ opacity: 0.65 }}>· {parte.apqc}</span>
            </p>
            {parte.mapeados.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {parte.mapeados.map((p) => (
                  <FilaProceso key={p.id} p={p} base={base} />
                ))}
              </ul>
            )}
            {parte.faltan.length > 0 && (
              <ul className="lista-editorial" style={{ marginTop: 8 }}>
                {parte.faltan.map((f) => (
                  <li key={f.nombre}>
                    <span style={{ color: "var(--grafito)" }}>Falta contar: </span>
                    <strong>{f.nombre}</strong>
                    <div className="t-dato" style={{ color: "var(--grafito)" }}>{f.porque}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {sinCategoria.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Todavía sin ubicar</h3>
            <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 8 }}>
              Se mapearon antes de que existiera el mapa de partes. Al regenerarlos quedan en su sitio.
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {sinCategoria.map((p) => (
                <FilaProceso key={p.id} p={p} base={base} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

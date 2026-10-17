"use client";
import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MarkerType, ReactFlowProvider, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FASES, type NodoConDatos, type Arista } from "@/lib/mapa-sistema";
import { CONTRATOS, esAgenteConocido } from "@/lib/agentes/contratos";

/**
 * EL MAPA DEL SISTEMA, DIBUJADO. Se reutiliza el mismo lienzo que dibuja los procesos de las
 * empresas — el manual pide reutilizar un editor existente antes que traer otro.
 *
 * LO QUE EL COLOR SIGNIFICA, Y LO QUE NO. Verde = ese trabajo se ejecutó. Gris = nunca se ejecutó,
 * que NO es lo mismo que «no funciona»: las ejecuciones se borran junto con la empresa. Rojo = tiene
 * trabajos fallidos. Ningún color afirma calidad: nadie ha evaluado las salidas todavía.
 */

const ANCHO = 260;
const ALTO_FILA = 128;

function colorDe(n: NodoConDatos): { borde: string; fondo: string } {
  if (n.fallidos > 0) return { borde: "var(--contradicho)", fondo: "var(--papel)" };
  if (n.trabajos > 0) return { borde: "var(--confirmado)", fondo: "var(--papel)" };
  return { borde: "var(--linea)", fondo: "var(--suave)" };
}

export function MapaSistema({ nodos, aristas, autoEncola }: { nodos: NodoConDatos[]; aristas: Arista[]; autoEncola: string[] }) {
  const [abierto, setAbierto] = useState<NodoConDatos | null>(null);

  const { rfNodos, rfAristas } = useMemo(() => {
    // Columna por fase, fila por orden dentro de la fase: el recorrido se lee de izquierda a derecha.
    const porFase = new Map<string, NodoConDatos[]>();
    for (const n of nodos) porFase.set(n.fase, [...(porFase.get(n.fase) ?? []), n]);

    const rfNodos: Node[] = [];
    FASES.forEach((f, col) => {
      (porFase.get(f.clave) ?? []).forEach((n, fila) => {
        const c = colorDe(n);
        rfNodos.push({
          id: n.tipo,
          position: { x: col * (ANCHO + 56), y: fila * ALTO_FILA },
          data: {
            label: (
              <div className="nodo-mapa">
                <div className="nodo-mapa__nombre">{n.nombre}</div>
                <div className="nodo-mapa__agentes">
                  {n.agentes.length ? n.agentes.join(" · ") : "sin agente: no llama al modelo"}
                </div>
                <div className="nodo-mapa__cuenta">
                  {n.trabajos === 0 ? (
                    <span style={{ color: "var(--grafito)" }}>sin ejecuciones recuperables</span>
                  ) : (
                    <>
                      <span style={{ color: "var(--confirmado)" }}>{n.hechos} hechos</span>
                      {n.fallidos > 0 && <span style={{ color: "var(--contradicho)" }}> · {n.fallidos} fallidos</span>}
                      {n.enCurso > 0 && <span style={{ color: "var(--acero-fuerte)" }}> · {n.enCurso} en curso</span>}
                    </>
                  )}
                </div>
              </div>
            ),
          },
          style: {
            width: ANCHO,
            borderRadius: "var(--radio)",
            border: `1px solid ${c.borde}`,
            background: c.fondo,
            padding: 8,
            fontFamily: "var(--font-ui)",
          },
          sourcePosition: "right" as never,
          targetPosition: "left" as never,
        });
      });
    });

    const rfAristas: Edge[] = aristas.map((a) => ({
      id: `${a.de}->${a.a}`,
      source: a.de,
      target: a.a,
      animated: false,
      label: "encola",
      labelStyle: { fontSize: 10, fill: "var(--grafito)" },
      style: { stroke: "var(--acero-medio)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--acero-medio)" },
    }));

    return { rfNodos, rfAristas };
  }, [nodos, aristas]);

  return (
    <>
      <div className="lienzo-mapa">
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodos}
            edges={rfAristas}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: false }}
            onNodeClick={(_e, n) => setAbierto(nodos.find((x) => x.tipo === n.id) ?? null)}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* LA LEYENDA, DICIENDO LO QUE EL COLOR NO PRUEBA. */}
      <p className="t-dato" style={{ color: "var(--grafito)", marginTop: 10 }}>
        <i className="muestra-color" style={{ background: "var(--confirmado)" }} aria-hidden="true" /> se ejecutó ·{" "}
        <i className="muestra-color" style={{ background: "var(--contradicho)" }} aria-hidden="true" /> tiene fallos ·{" "}
        <i className="muestra-color" style={{ background: "var(--linea-fuerte)" }} aria-hidden="true" /> sin ejecuciones recuperables — que no es lo mismo que «no funciona»: las
        ejecuciones se borran junto con la empresa. Ningún color afirma calidad: nadie ha evaluado las salidas todavía.
      </p>
      {autoEncola.length > 0 && (
        <p className="t-dato" style={{ color: "var(--grafito)", marginTop: 4 }}>
          «{autoEncola.join(", ")}» se encola a sí mismo para trocear documentos largos. No se dibuja como flecha para no leerse como un bucle.
        </p>
      )}

      {/* AL ABRIR UN NODO: qué lo dispara, qué entrega, y el contrato de sus agentes. */}
      {abierto && (
        <section className="panel p-5 aparece" style={{ marginTop: 18 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="t-seccion">{abierto.nombre}</h3>
            <button
              className="boton-enlace boton-enlace--tenue"
              onClick={() => setAbierto(null)}
            >
              Cerrar
            </button>
          </div>
          <p className="t-cuerpo" style={{ marginTop: 4 }}>{abierto.hace}</p>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 14 }}>
            <div>
              <div className="t-etiqueta">Qué lo dispara</div>
              <div className="t-dato">
                {abierto.disparadores.length ? (
                  abierto.disparadores.map((d) => (
                    <div key={d} className="codigo-en-linea">{d}</div>
                  ))
                ) : (
                  <span style={{ color: "var(--grafito)" }}>Ninguna ruta: solo lo encola otro trabajo.</span>
                )}
              </div>
            </div>
            <div>
              <div className="t-etiqueta">Qué encola al terminar</div>
              <div className="t-dato">
                {abierto.encola.length ? abierto.encola.join(" · ") : <span style={{ color: "var(--grafito)" }}>nada: aquí se detiene la cadena</span>}
              </div>
            </div>
            <div>
              <div className="t-etiqueta">Ejecuciones registradas</div>
              <div className="t-dato" style={{ fontVariantNumeric: "tabular-nums" }}>
                {abierto.trabajos === 0 ? "ninguna recuperable" : `${abierto.trabajos} · ${abierto.hechos} hechos · ${abierto.fallidos} fallidos`}
              </div>
            </div>
          </div>

          {abierto.agentes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="t-rotulo mb-2">LOS AGENTES QUE CORREN AQUÍ</div>
              <div className="flex flex-col gap-3">
                {abierto.agentes.filter((a) => esAgenteConocido(a)).map((a) => {
                  const c = CONTRATOS[a];
                  const corrio = abierto.agentesConHuella.includes(a);
                  return (
                    <div key={a} className="panel p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <strong>
                          {c.clave} <span className="t-dato" style={{ color: "var(--grafito)" }}>v{c.version}</span>
                        </strong>
                        <span className="t-dato" style={{ color: corrio ? "var(--confirmado)" : "var(--grafito)" }}>
                          {corrio ? "ha corrido" : "sin huella de ejecución"}
                        </span>
                      </div>
                      <p className="t-cuerpo" style={{ marginTop: 4 }}>{c.proposito}</p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 10 }}>
                        <div>
                          <div className="t-etiqueta">Presupuesto</div>
                          <div className="t-dato">{c.presupuesto_tokens.toLocaleString("es-PE")} tokens</div>
                        </div>
                        <div>
                          <div className="t-etiqueta">Tiempo máximo</div>
                          <div className="t-dato">{(c.tiempo_max_ms / 1000).toFixed(0)} s</div>
                        </div>
                        <div>
                          <div className="t-etiqueta">Quién aprueba</div>
                          <div className="t-dato">{c.aprobador}</div>
                        </div>
                        <div>
                          <div className="t-etiqueta">Qué NO puede hacer</div>
                          <div className="t-dato">{c.acciones_prohibidas[0]}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, addEdge, useNodesState, useEdgesState, type Connection, type Edge, MarkerType, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TIPOS_NODO, LeyendaEjecutor, type NodoRF, type DatosNodo } from "./nodos";
import { PanelPropiedades } from "./PanelPropiedades";
import { autoLayout } from "@/lib/layout";
import { pedir } from "@/lib/cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { Progreso } from "@/components/base/Progreso";
import { TIPO_NODO } from "@/lib/textos";
import { validarFlujograma, tieneFinalMalo } from "@/lib/rules/grafo";

export type NodoDB = { id: string; tipo: DatosNodo["tipo"]; etiqueta: string; responsable: string | null; ejecutor: string | null; tiempo: string | null; herramienta: string | null; problema: string | null; veredicto: string | null; pos_x: number; pos_y: number; rol?: string | null; espera?: string | null; entrada?: string | null; salida?: string | null; evidencia?: string | null; estandar?: string | null; know_how_id?: string | null };
export type EdgeDB = { id: string; origen: string; destino: string; etiqueta: string | null };

function aRF(nodos: NodoDB[], edges: EdgeDB[]) {
  const ns: NodoRF[] = nodos.map((n) => ({ id: n.id, type: n.tipo, position: { x: n.pos_x, y: n.pos_y }, data: { etiqueta: n.etiqueta, tipo: n.tipo, comentario: (n as { comentario?: string | null }).comentario ?? null, responsable: n.responsable, ejecutor: n.ejecutor, tiempo: n.tiempo, herramienta: n.herramienta, problema: n.problema, veredicto: n.veredicto, rol: n.rol ?? null, espera: n.espera ?? null, entrada: n.entrada ?? null, salida: n.salida ?? null, evidencia: n.evidencia ?? null, estandar: n.estandar ?? null, know_how_id: n.know_how_id ?? null } }));
  const es: Edge[] = edges.map((e) => ({ id: e.id, source: e.origen, target: e.destino, label: e.etiqueta ?? undefined, markerEnd: { type: MarkerType.ArrowClosed, color: "#14171a" }, style: { stroke: "#14171a", strokeWidth: 1.5 }, labelStyle: { fontSize: 12, fill: "#6b7075" }, labelBgStyle: { fill: "#fcfcfb" } }));
  return { ns, es };
}

/**
 * El canvas. Tú dibujas o la IA dibuja. Guardado explícito. Un proceso a la vez. Capítulo 15.
 * Las posiciones se guardan en la fila del nodo.
 */
function CanvasInterno({ processId, companyId, nombre, nodos, edges, soloLectura = false, paraCliente = false, alto = "70vh" }: { processId: string; companyId: string; nombre: string; nodos: NodoDB[]; edges: EdgeDB[]; soloLectura?: boolean; paraCliente?: boolean; alto?: string }) {
  const inicial = useMemo(() => aRF(nodos, edges), [nodos, edges]);
  const [ns, setNs, onNodesChange] = useNodesState<NodoRF>(inicial.ns);
  const [es, setEs, onEdgesChange] = useEdgesState<Edge>(inicial.es);
  const [sel, setSel] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [nom, setNom] = useState(nombre);
  const contador = useRef(0);

  // Si el servidor manda datos nuevos (router.refresh), se ajusta el estado durante el render.
  const [prevInicial, setPrevInicial] = useState(inicial);
  if (prevInicial !== inicial) {
    setPrevInicial(inicial);
    setNs(inicial.ns);
    setEs(inicial.es);
    setSucio(false);
  }

  const onConnect = useCallback(
    (c: Connection) => {
      setEs((eds) => addEdge({ ...c, id: `tmp-e-${++contador.current}`, label: c.sourceHandle === "no" ? "no" : c.sourceHandle === "si" ? "sí" : undefined, markerEnd: { type: MarkerType.ArrowClosed, color: "#14171a" }, style: { stroke: "#14171a", strokeWidth: 1.5 } }, eds));
      setSucio(true);
    },
    [setEs]
  );

  const agregar = (tipo: DatosNodo["tipo"]) => {
    const id = `tmp-${++contador.current}`;
    const maxX = Math.max(0, ...ns.map((n) => n.position.x));
    setNs((l) => [...l, { id, type: tipo, position: { x: maxX + 260, y: 80 }, data: { etiqueta: TIPO_NODO[tipo], tipo, ejecutor: tipo === "actividad" ? "humano" : null } }]);
    setSel(id);
    setSucio(true);
  };

  const cambiar = (d: Partial<DatosNodo>) => {
    setNs((l) => l.map((n) => (n.id === sel ? { ...n, data: { ...n.data, ...d } } : n)));
    setSucio(true);
  };
  const eliminar = () => {
    setNs((l) => l.filter((n) => n.id !== sel));
    setEs((l) => l.filter((e) => e.source !== sel && e.target !== sel));
    setSel(null);
    setSucio(true);
  };

  const ordenar = () => {
    const pos = autoLayout(ns.map((n) => ({ id: n.id, tipo: n.type ?? "actividad" })), es.map((e) => ({ origen: e.source, destino: e.target })));
    setNs((l) => l.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    setSucio(true);
  };

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const r = await pedir<{ mapa: Record<string, string> }>(`/api/processes/${processId}`, {
        method: "PUT",
        json: {
          nombre: nom,
          nodos: ns.map((n) => ({ id: n.id.startsWith("tmp-") ? undefined : n.id, ...n.data, tipo: n.type, pos_x: Math.round(n.position.x), pos_y: Math.round(n.position.y), _tmp: n.id })),
          edges: es.map((e) => ({ origen: e.source, destino: e.target, etiqueta: typeof e.label === "string" ? e.label : null })),
        },
      });
      // Reemplaza ids temporales por los reales
      setNs((l) => l.map((n) => ({ ...n, id: r.mapa[n.id] ?? n.id })));
      setEs((l) => l.map((e) => ({ ...e, source: r.mapa[e.source] ?? e.source, target: r.mapa[e.target] ?? e.target })));
      setSucio(false);
      setAviso("Guardado");
      setTimeout(() => setAviso(null), 1500);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const generar = async () => {
    if (!descripcion.trim()) return;
    const r = await pedir<{ job_id: string }>("/api/processes/generate", { json: { company_id: companyId, descripcion, process_id: processId } });
    setJob(r.job_id);
  };

  const seleccionado = ns.find((n) => n.id === sel);
  // Validación estructural en vivo (P1-07): avisa, no bloquea.
  const flujo = useMemo(() => ({ nodos: ns.map((n) => ({ id: n.id, tipo: (n.type ?? "actividad") as DatosNodo["tipo"], etiqueta: n.data.etiqueta, veredicto: n.data.veredicto ?? null, ejecutor: n.data.ejecutor ?? null })), conexiones: es.map((e) => ({ de: e.source, a: e.target, etiqueta: typeof e.label === "string" ? e.label : null })) }), [ns, es]);
  const validacion = useMemo(() => validarFlujograma(flujo), [flujo]);
  const avisos = validacion.problemas;
  const sinFinalMalo = ns.length > 2 && !tieneFinalMalo(flujo);
  const nodeTypes = useMemo(() => TIPOS_NODO, []);

  return (
    <div className="flex flex-col gap-4">
      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-3 no-imprimir">
          <input className="campo" style={{ width: 280 }} value={nom} onChange={(e) => { setNom(e.target.value); setSucio(true); }} aria-label="Nombre del proceso" />
          <div className="flex gap-1">
            {(["inicio", "actividad", "decision", "espera", "fin"] as const).map((t) => (
              <button key={t} className="boton boton--secundario" style={{ minHeight: 40 }} onClick={() => agregar(t)}>
                + {TIPO_NODO[t]}
              </button>
            ))}
          </div>
          <button className="boton boton--secundario" style={{ minHeight: 40 }} onClick={ordenar}>Ordenar</button>
          <button className="boton" style={{ minHeight: 40 }} onClick={guardar} disabled={!sucio || guardando}>
            {guardando ? "Guardando" : sucio ? "Guardar cambios" : "Guardado"}
          </button>
          {aviso && <span className="t-dato" style={{ color: aviso === "Guardado" ? "var(--confirmado)" : "var(--contradicho)" }}>{aviso}</span>}
        </div>
      )}

      <div className="flex gap-4">
        <div style={{ flex: 1, height: alto, border: "1px solid var(--linea)", borderRadius: "var(--radio)", background: "#fff" }}>
          <ReactFlow
            nodes={ns}
            edges={es}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" || x.type === "remove")) setSucio(true); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) setSucio(true); }}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSel(n.id)}
            onPaneClick={() => setSel(null)}
            nodesDraggable={!soloLectura}
            nodesConnectable={!soloLectura}
            elementsSelectable={!soloLectura || true}
            fitView
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={soloLectura ? null : ["Backspace", "Delete"]}
          >
            <Background color="#e4e4e1" gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {seleccionado && <PanelPropiedades datos={seleccionado.data} cambiar={cambiar} eliminar={eliminar} soloLectura={soloLectura} paraCliente={paraCliente} avisos={avisos.filter((a) => a.nodo === seleccionado.id).map((a) => a.mensaje)} />}
      </div>

      <LeyendaEjecutor paraCliente={paraCliente} />
      {(avisos.length > 0 || sinFinalMalo) && (
        <ul className="t-dato flex flex-col gap-1" style={{ color: "var(--caducado)" }} aria-live="polite">
          {avisos.slice(0, 5).map((a, i) => (
            <li key={i}>{a.mensaje}</li>
          ))}
          {sinFinalMalo && <li>{paraCliente ? "Falta dibujar dónde se pierde el cliente, el pedido o el dinero." : "Sin final malo: ¿dónde se pierde el cliente, el pedido o el dinero?"}</li>}
        </ul>
      )}

      {!soloLectura && (
        <section className="panel p-4 flex flex-col gap-3 no-imprimir">
          <p className="t-etiqueta">{paraCliente ? "Cuéntanos cómo funciona y lo dibujamos" : "La IA dibuja: describe el proceso"}</p>
          <BotonGrabar grande={false} alTexto={(t) => setDescripcion((p) => (p ? p + " " + t : t))} />
          <textarea className="campo" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-label="Describe el proceso" placeholder="El lead entra por WhatsApp, un asesor lo contacta, si responde se agenda, si no se pierde…" />
          <div className="flex items-center gap-3">
            <button className="boton boton--secundario" onClick={generar} disabled={!descripcion.trim()}>Dibujar con lo descrito</button>
            <Progreso jobId={job} paraCliente={paraCliente} alTerminar={() => window.location.reload()} />
          </div>
          {ns.length > 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>Esto reemplaza el dibujo actual.</p>}
        </section>
      )}
    </div>
  );
}

export function Canvas(props: Parameters<typeof CanvasInterno>[0]) {
  return (
    <ReactFlowProvider>
      <CanvasInterno {...props} />
    </ReactFlowProvider>
  );
}

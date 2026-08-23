import { supabaseAdmin } from "@/lib/supabase/admin";
import { Documento, Sop, PlanTabla, type Redactado, type SopRow, type Accion } from "./Entregable";
import { Canvas } from "./canvas/Canvas";
import { ENTREGABLE } from "@/lib/textos";

type Deliv = { id: string; company_id: string; tipo: string; contenido: Record<string, unknown> | null; version: number; publicado: boolean };

/** Renderiza cualquier entregable en línea. Mapas y manual se arman desde datos (consulta, no IA). */
export async function VistaEntregable({ d, paraCliente = false, marca }: { d: Deliv; paraCliente?: boolean; marca?: string }) {
  const sb = supabaseAdmin();
  const titulo = ENTREGABLE[d.tipo] ?? d.tipo;

  if (["informe_realidad", "diagnostico_4p", "mapa_automatizacion"].includes(d.tipo)) {
    return <Documento contenido={d.contenido as unknown as Redactado} marca={marca} />;
  }

  if (d.tipo === "mapa_as_is" || d.tipo === "mapa_to_be") {
    const ids = ((d.contenido as { process_ids?: string[] })?.process_ids ?? []);
    const { data: procs } = ids.length ? await sb.from("processes").select("id,nombre,area").in("id", ids) : { data: [] };
    const partes = [];
    for (const p of procs ?? []) {
      const [{ data: nodos }, { data: edges }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
      partes.push({ p, nodos: nodos ?? [], edges: edges ?? [] });
    }
    return (
      <div className="flex flex-col gap-10">
        <h1 className="t-titulo">{titulo}</h1>
        {partes.length === 0 && <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Sin procesos en este mapa.</p>}
        {partes.map(({ p, nodos, edges }) => (
          <section key={p.id}>
            <h2 className="t-seccion mb-3">{p.nombre}{p.area ? ` · ${p.area}` : ""}</h2>
            <Canvas processId={p.id} companyId={d.company_id} nombre={p.nombre} nodos={nodos} edges={edges} soloLectura paraCliente={paraCliente} alto="52vh" />
          </section>
        ))}
      </div>
    );
  }

  if (d.tipo === "manual_procesos") {
    const ids = ((d.contenido as { sop_ids?: string[] })?.sop_ids ?? []);
    const { data: sops } = ids.length ? await sb.from("sops").select("*, processes(nombre,area)").in("id", ids) : { data: [] };
    return (
      <div className="flex flex-col gap-12 medida" style={{ margin: "0 auto" }}>
        <h1 className="t-titulo">{paraCliente ? "Cómo se hace cada cosa" : titulo}</h1>
        {!sops?.length && <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Todavía no hay procedimientos escritos.</p>}
        {(sops ?? []).map((s) => (
          <Sop key={s.id} sop={s as SopRow} titulo={(s.processes as unknown as { nombre: string } | null)?.nombre} />
        ))}
      </div>
    );
  }

  if (d.tipo === "plan_90") {
    const { data: acciones } = await sb.from("actions").select("*, findings(titulo)").eq("company_id", d.company_id).order("semana_inicio").order("prioridad");
    return (
      <div>
        <h1 className="t-titulo mb-6">{titulo}</h1>
        <PlanTabla acciones={(acciones ?? []) as Accion[]} paraCliente={paraCliente} />
      </div>
    );
  }
  return <pre className="t-dato">{JSON.stringify(d.contenido, null, 2)}</pre>;
}

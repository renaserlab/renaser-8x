import { supabaseAdmin } from "./supabase/admin";
import type { ProcesoResumen } from "@/components/ProcesosLista";

export async function listarProcesos(companyId: string): Promise<ProcesoResumen[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("processes").select("id,nombre,area,version,origen,padre_id, process_nodes(count), sops(count)").eq("company_id", companyId).order("created_at");
  const todos = data ?? [];
  const conToBe = new Set(todos.filter((p) => p.version === "to_be" && p.padre_id).map((p) => p.padre_id as string));
  return todos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    area: p.area,
    version: p.version,
    origen: p.origen,
    padre_id: p.padre_id,
    nodos: (p.process_nodes as unknown as { count: number }[])?.[0]?.count ?? 0,
    tiene_tobe: conToBe.has(p.id),
    tiene_sop: ((p.sops as unknown as { count: number }[])?.[0]?.count ?? 0) > 0,
  }));
}

export async function procesoConToBe(processId: string) {
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("processes").select("*").eq("id", processId).single();
  if (!p) return null;
  const cargar = async (id: string) => {
    const [{ data: nodos }, { data: edges }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", id), sb.from("process_edges").select("*").eq("process_id", id)]);
    return { nodos: nodos ?? [], edges: edges ?? [] };
  };
  const asisId = p.version === "to_be" ? (p.padre_id as string) : p.id;
  // Auditoría de latencia: esta función era una cadena de ~6 viajes a la base; el detalle de proceso
  // tardaba segundos. Ahora todo lo independiente viaja en paralelo.
  const [{ data: asisRow }, { data: tobeRow }, cuerpoAsis] = await Promise.all([
    asisId === p.id ? Promise.resolve({ data: p }) : sb.from("processes").select("*").eq("id", asisId).single(),
    sb.from("processes").select("*").eq("padre_id", asisId).eq("version", "to_be").maybeSingle(),
    cargar(asisId),
  ]);
  const [cuerpoTobe, { data: sop }] = await Promise.all([
    tobeRow ? cargar(tobeRow.id) : Promise.resolve(null),
    sb.from("sops").select("*").eq("process_id", tobeRow?.id ?? asisId).maybeSingle(),
  ]);
  const asis = { ...(asisRow ?? p), ...cuerpoAsis };
  const tobe = tobeRow && cuerpoTobe ? { ...tobeRow, ...cuerpoTobe } : null;
  return { proceso: p, asis, tobe, sop };
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoPortal } from "@/lib/portal";
import { procesoConToBe } from "@/lib/procesos";
import { Canvas } from "@/components/canvas/Canvas";
import { Comparada } from "@/components/canvas/Comparada";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ConfirmarProceso } from "@/components/cliente/ConfirmarProceso";
import { FichaProceso } from "@/components/cliente/FichaProceso";

export const dynamic = "force-dynamic";

/** El cliente ve su proceso y lo corrige con sus manos. El TO-BE solo si ya se publicó el mapa. */
export default async function ProcesoCliente({ params }: { params: Promise<{ p: string }> }) {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const { p } = await params;
  const r = await procesoConToBe(p);
  if (!r || r.proceso.company_id !== c.companyId) notFound();
  const { data: pub } = await supabaseAdmin().from("deliverables").select("id").eq("company_id", c.companyId).eq("tipo", "mapa_to_be").eq("publicado", true).limit(1);
  const sb = supabaseAdmin();
  const [{ data: conf }, { data: adjuntos }, { data: caleta }] = await Promise.all([
    sb.from("processes").select("confirmacion,deseo,responsable,objetivo,inicio,resultado,tiempo,herramientas,sale_mal,como_bien,descripcion_original").eq("id", r.asis.id).single(),
    sb.from("sources").select("id,nombre,tipo,created_at").eq("process_id", r.asis.id).order("created_at", { ascending: false }),
    sb.from("know_how").select("puesto,situacion,senal,regla_practica").eq("company_id", c.companyId).eq("process_id", r.asis.id),
  ]);
  const mostrarToBe = !!pub?.length && r.tobe;
  return (
    <>
      <Link href="/portal/procesos" className="t-dato">← Tus procesos</Link>
      <h1 className="t-titulo mt-4 mb-2">{r.asis.nombre}</h1>
      <p className="t-cuerpo mb-6 medida" style={{ color: "var(--grafito)" }}>Mueve, conecta y corrige lo que no sea así. Haz clic en un paso para decir quién lo hace y dónde se traba. Guarda al terminar.</p>
      {mostrarToBe ? (
        <Comparada companyId={c.companyId} asis={{ id: r.asis.id, nombre: r.asis.nombre, nodos: r.asis.nodos, edges: r.asis.edges }} tobe={{ id: r.tobe!.id, nombre: r.tobe!.nombre, nodos: r.tobe!.nodos, edges: r.tobe!.edges }} paraCliente />
      ) : (
        <Canvas processId={r.asis.id} companyId={c.companyId} nombre={r.asis.nombre} nodos={r.asis.nodos} edges={r.asis.edges} paraCliente alto="60vh" />
      )}
      <FichaProceso
        processId={r.asis.id}
        companyId={c.companyId}
        ficha={{ responsable: conf?.responsable ?? null, objetivo: conf?.objetivo ?? null, inicio: conf?.inicio ?? null, resultado: conf?.resultado ?? null, tiempo: conf?.tiempo ?? null, herramientas: conf?.herramientas ?? null, sale_mal: conf?.sale_mal ?? null, como_bien: conf?.como_bien ?? null, descripcion_original: conf?.descripcion_original ?? null }}
        adjuntos={(adjuntos ?? []).map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo ?? "archivo", created_at: a.created_at }))}
        caleta={caleta ?? []}
      />
      <ConfirmarProceso processId={r.asis.id} confirmacion={conf?.confirmacion ?? "borrador"} deseo={conf?.deseo ?? null} />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { contextoPortal } from "@/lib/portal";
import { procesoConToBe } from "@/lib/procesos";
import { Canvas } from "@/components/canvas/Canvas";
import { Comparada } from "@/components/canvas/Comparada";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ConfirmarProceso } from "@/components/cliente/ConfirmarProceso";
import { FichaProceso } from "@/components/cliente/FichaProceso";
import { ArchivosDelProceso } from "@/components/procesos/ArchivosDelProceso";
import { COLUMNAS_FUENTE_SUBIDA, type FuenteSubida } from "@/components/procesos/subidas";

export const dynamic = "force-dynamic";

/**
 * El cliente ve su proceso y lo corrige con sus manos. El TO-BE solo si ya se publicó el mapa.
 * Si lo subió en un archivo y todavía no está dibujado (16-10-2026), arriba ve su archivo con su estado y, cuando ya se
 * leyó, «Dibujarlo con lo que subiste»; si ya está dibujado, eso queda plegado debajo del lienzo.
 */
export default async function ProcesoCliente({ params }: { params: Promise<{ p: string }> }) {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const { p } = await params;
  const r = await procesoConToBe(p);
  if (!r || r.proceso.company_id !== c.companyId) notFound();
  const sb = supabaseAdmin();
  const [{ data: pub }, { data: conf }, { data: adjuntos }, { data: caleta }] = await Promise.all([
    sb.from("deliverables").select("id").eq("company_id", c.companyId).eq("tipo", "mapa_to_be").eq("publicado", true).limit(1),
    sb.from("processes").select("confirmacion,deseo,responsable,objetivo,inicio,resultado,tiempo,herramientas,sale_mal,como_bien,comentario,descripcion_original,indicador,meta,medicion_donde,proveedor,cliente_proceso").eq("id", r.asis.id).single(),
    // Los archivos de este proceso y de esta empresa, con su estado de lectura (sin contenido ni ruta del archivo).
    sb.from("sources").select(COLUMNAS_FUENTE_SUBIDA).eq("company_id", c.companyId).eq("process_id", r.asis.id).order("created_at", { ascending: false }).limit(200),
    sb.from("know_how").select("puesto,situacion,senal,regla_practica").eq("company_id", c.companyId).eq("process_id", r.asis.id),
  ]);
  const mostrarToBe = !!pub?.length && r.tobe;
  const fuentes = (adjuntos ?? null) as unknown as FuenteSubida[] | null;
  const dibujado = r.asis.nodos.length > 0;
  const subidos = <ArchivosDelProceso processId={r.asis.id} fuentes={fuentes} dibujado={dibujado} modo="dueno" />;
  return (
    <>
      <Link href="/portal/procesos" className="t-dato">← Tus procesos</Link>
      <h1 className="t-titulo mt-4 mb-2">{r.asis.nombre}</h1>
      <p className="t-cuerpo mb-6 medida" style={{ color: "var(--grafito)" }}>
        {dibujado
          ? "Mueve, conecta y corrige lo que no sea así. Haz clic en un paso para decir quién lo hace y dónde se traba. Guarda al terminar."
          : "Todavía no tiene pasos. Dibújalo con el archivo que subiste o hazlo tú en el lienzo: agrega los pasos, conéctalos y guarda."}
      </p>
      {!dibujado && subidos}
      {mostrarToBe ? (
        <Comparada companyId={c.companyId} asis={{ id: r.asis.id, nombre: r.asis.nombre, nodos: r.asis.nodos, edges: r.asis.edges }} tobe={{ id: r.tobe!.id, nombre: r.tobe!.nombre, nodos: r.tobe!.nodos, edges: r.tobe!.edges }} paraCliente />
      ) : (
        <Canvas processId={r.asis.id} companyId={c.companyId} nombre={r.asis.nombre} nodos={r.asis.nodos} edges={r.asis.edges} paraCliente alto="60vh" />
      )}
      {dibujado && subidos}
      <FichaProceso
        processId={r.asis.id}
        companyId={c.companyId}
        ficha={{ responsable: conf?.responsable ?? null, objetivo: conf?.objetivo ?? null, inicio: conf?.inicio ?? null, resultado: conf?.resultado ?? null, tiempo: conf?.tiempo ?? null, herramientas: conf?.herramientas ?? null, sale_mal: conf?.sale_mal ?? null, como_bien: conf?.como_bien ?? null, comentario: (conf as { comentario?: string | null } | null)?.comentario ?? null, descripcion_original: conf?.descripcion_original ?? null, indicador: (conf as { indicador?: string | null } | null)?.indicador ?? null, meta: (conf as { meta?: string | null } | null)?.meta ?? null, medicion_donde: (conf as { medicion_donde?: string | null } | null)?.medicion_donde ?? null, proveedor: (conf as { proveedor?: string | null } | null)?.proveedor ?? null, cliente_proceso: (conf as { cliente_proceso?: string | null } | null)?.cliente_proceso ?? null }}
        adjuntos={(fuentes ?? []).map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo ?? "archivo", created_at: a.created_at ?? "" }))}
        caleta={caleta ?? []}
      />
      <ConfirmarProceso processId={r.asis.id} confirmacion={conf?.confirmacion ?? "borrador"} deseo={conf?.deseo ?? null} />
    </>
  );
}

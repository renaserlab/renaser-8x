import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/base/Vacio";
import { Canvas } from "@/components/canvas/Canvas";
import { Comparada } from "@/components/canvas/Comparada";
import { BotonJob } from "@/components/consultor/BotonJob";
import { Sop } from "@/components/Entregable";
import { BotonImprimir } from "@/components/base/BotonImprimir";
import { procesoConToBe } from "@/lib/procesos";

export const dynamic = "force-dynamic";

/** El canvas de un proceso. Vista editable o comparada AS-IS / TO-BE. */
export default async function ProcesoPag({ params, searchParams }: { params: Promise<{ id: string; p: string }>; searchParams: Promise<{ vista?: string }> }) {
  const { id, p } = await params;
  const { vista } = await searchParams;
  const r = await procesoConToBe(p);
  if (!r) notFound();
  const { asis, tobe, sop } = r;
  const comparada = vista === "comparada";
  return (
    <>
      <Encabezado
        titulo={asis.nombre}
        sub={asis.area ?? undefined}
        acciones={
          <>
            <Link href={`/empresa/${id}/procesos/${asis.id}`} className={`boton ${!comparada ? "" : "boton--secundario"}`}>Editar AS-IS</Link>
            <Link href={`/empresa/${id}/procesos/${asis.id}?vista=comparada`} className={`boton ${comparada ? "" : "boton--secundario"}`}>Comparar</Link>
            <BotonJob url={`/api/processes/${asis.id}/tobe`} texto={tobe ? "Regenerar TO-BE" : "Generar TO-BE"} secundario />
            <BotonJob url={`/api/processes/${tobe?.id ?? asis.id}/sop`} texto={sop ? "Regenerar SOP" : "Generar SOP"} secundario />
          </>
        }
      />
      {comparada ? (
        <Comparada companyId={id} asis={{ id: asis.id, nombre: asis.nombre, nodos: asis.nodos, edges: asis.edges }} tobe={tobe ? { id: tobe.id, nombre: tobe.nombre, nodos: tobe.nodos, edges: tobe.edges } : null} />
      ) : (
        <Canvas processId={asis.id} companyId={id} nombre={asis.nombre} nodos={asis.nodos} edges={asis.edges} />
      )}
      {tobe && !comparada && (
        <section className="mt-10">
          <h2 className="t-seccion mb-3">TO-BE (editable)</h2>
          <Canvas processId={tobe.id} companyId={id} nombre={tobe.nombre} nodos={tobe.nodos} edges={tobe.edges} alto="56vh" />
        </section>
      )}
      {sop && (
        <section className="mt-10 medida">
          <div className="flex items-center justify-between gap-3 mb-3 no-imprimir">
            <h2 className="t-seccion">Cómo se hace (SOP)</h2>
            <BotonImprimir texto="Imprimir para la pared" />
          </div>
          <Sop sop={sop} titulo={`Cómo se hace: ${asis.nombre}`} />
        </section>
      )}
    </>
  );
}

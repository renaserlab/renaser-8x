import { notFound } from "next/navigation";
import { Encabezado } from "@/components/base/Vacio";
import { MapaEmpresa } from "@/components/consultor/MapaEmpresa";
import { mapaDe } from "@/lib/mapa-empresa";

export const dynamic = "force-dynamic";

/** LA RADIOGRAFÍA: en qué nivel está la empresa, qué necesita y qué le falta para subir. */
export default async function Madurez({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mapa = await mapaDe(id);
  if (!mapa) notFound();
  return (
    <>
      <Encabezado
        titulo="Radiografía"
        sub="En qué nivel está, qué necesita este negocio para escalar y qué le falta exactamente para subir. Cada nivel se gana con algo comprobable."
      />
      <MapaEmpresa mapa={mapa} base={`/empresa/${id}`} />
    </>
  );
}

import { Encabezado } from "@/components/base/Vacio";
import { ProcesosLista } from "@/components/ProcesosLista";
import { listarProcesos } from "@/lib/procesos";

export const dynamic = "force-dynamic";

export default async function Procesos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procesos = await listarProcesos(id);
  return (
    <>
      <Encabezado titulo="Procesos" sub="Tú dibujas o la IA dibuja. Los finales malos son obligatorios: la fuga es lo que hay que ver." />
      <ProcesosLista companyId={id} procesos={procesos} base={`/empresa/${id}/procesos`} />
    </>
  );
}

import { Encabezado } from "@/components/base/Vacio";
import { ProcesosLista } from "@/components/ProcesosLista";
import { ImportarProcesos } from "@/components/procesos/ImportarProcesos";
import { SubirProceso } from "@/components/procesos/SubirProceso";
import { porDibujar } from "@/components/procesos/datos";
import { listarProcesos } from "@/lib/procesos";

export const dynamic = "force-dynamic";

export default async function Procesos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procesos = await listarProcesos(id);
  // Lo que la empresa trajo y nadie ha dibujado: no es un AS-IS, así que la tabla de arriba no lo muestra. Lo que tiene
  // un archivo subido va en «Subir un proceso», con el estado de su archivo; lo que vino solo con su nombre (de una lista
  // importada) vive en el importador. De los dos se abre para dibujarlo.
  const { conArchivo, sinArchivo, archivosLeidos } = await porDibujar(id, procesos);
  return (
    <>
      <Encabezado titulo="Procesos" sub="Tú dibujas o la IA dibuja. Los finales malos son obligatorios: la fuga es lo que hay que ver." />
      <ProcesosLista companyId={id} procesos={procesos} base={`/empresa/${id}/procesos`} />
      {/* Debajo de la lista: subir el archivo de un proceso y traer la lista entera son para la empresa que ya lo tiene escrito; dibujar sigue siendo lo primero. */}
      <div className="mt-10">
        <SubirProceso companyId={id} base={`/empresa/${id}/procesos`} porDibujar={conArchivo} archivosLeidos={archivosLeidos} />
      </div>
      <div className="mt-10">
        <ImportarProcesos companyId={id} enLista={sinArchivo} base={`/empresa/${id}/procesos`} />
      </div>
    </>
  );
}

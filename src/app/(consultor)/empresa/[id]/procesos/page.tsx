import { Encabezado } from "@/components/base/Vacio";
import { ProcesosLista } from "@/components/ProcesosLista";
import { ImportarProcesos } from "@/components/procesos/ImportarProcesos";
import { listarProcesos } from "@/lib/procesos";

export const dynamic = "force-dynamic";

export default async function Procesos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procesos = await listarProcesos(id);
  // Lo que la empresa trajo en su lista y nadie ha dibujado: no es un AS-IS, así que la tabla de arriba no
  // lo muestra. Vive en el importador, de donde se abre para dibujarlo.
  const enLista = procesos.filter((p) => p.version === "sin_dibujar").map((p) => ({ id: p.id, nombre: p.nombre, area: p.area }));
  return (
    <>
      <Encabezado titulo="Procesos" sub="Tú dibujas o la IA dibuja. Los finales malos son obligatorios: la fuga es lo que hay que ver." />
      <ProcesosLista companyId={id} procesos={procesos} base={`/empresa/${id}/procesos`} />
      {/* Debajo de la lista: importar es para la empresa que ya trae su lista escrita; dibujar sigue siendo lo primero. */}
      <div className="mt-10">
        <ImportarProcesos companyId={id} enLista={enLista} base={`/empresa/${id}/procesos`} />
      </div>
    </>
  );
}

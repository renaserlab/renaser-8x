import { contextoPortal } from "@/lib/portal";
import { listarProcesos } from "@/lib/procesos";
import { ProcesosLista } from "@/components/ProcesosLista";

export const dynamic = "force-dynamic";

export default async function ProcesosCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const procesos = await listarProcesos(c.companyId);
  return (
    <>
      <p className="t-etiqueta">Tus procesos</p>
      <h1 className="t-titulo mt-2 mb-8">Así funciona tu empresa, dibujada</h1>
      <ProcesosLista companyId={c.companyId} procesos={procesos} base="/portal/procesos" paraCliente />
    </>
  );
}

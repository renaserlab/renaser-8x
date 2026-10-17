import { contextoPortal } from "@/lib/portal";
import { listarProcesos } from "@/lib/procesos";
import { configDeEmpresa } from "@/lib/producto";
import { ProcesosLista } from "@/components/ProcesosLista";
import { SubirProceso } from "@/components/procesos/SubirProceso";
import { ImportarProcesos } from "@/components/procesos/ImportarProcesos";
import { porDibujar } from "@/components/procesos/datos";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { pedidosDelDueno, puedeLlenar, seccionDe } from "@/components/negocio/datos";

export const dynamic = "force-dynamic";

/**
 * TUS PROCESOS. Tres maneras de traerlos, de la más rápida a la más completa (16-10-2026):
 *  - contarlo (hablando o escribiendo) y lo dibujamos: lo de siempre (ProcesosLista);
 *  - subir el archivo que ya tienes (foto, PDF, Word o Excel): queda «por dibujar» con su estado, y en su ficha se
 *    dibuja con lo que se leyó (SubirProceso → ArchivosDelProceso);
 *  - traer la lista entera en un Excel: solo cuando la consultora abrió «Subir o dibujar los procesos» (la ruta también
 *    lo exige). Con eso abierto se ven además los procesos de la lista que todavía no tienen archivo, para abrirlos.
 * Subir e importar los hace el dueño o un líder: un participante ve sus procesos y los cuenta, pero no crea por la
 * empresa. Al final, si hay pedido, «Listo, ya lo llené» para avisarle a la consultora.
 */
export default async function ProcesosCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const companyId = c.companyId;
  const u = (c as { u?: { id: string; rol: string } }).u;
  const [procesos, pedidos, quien, config] = await Promise.all([listarProcesos(companyId), pedidosDelDueno(companyId), puedeLlenar(u, companyId), configDeEmpresa(companyId)]);
  const { activa, completada } = seccionDe(pedidos.ok ? pedidos.valor : null, "subir_procesos");
  const { conArchivo, sinArchivo, archivosLeidos } = await porDibujar(companyId, procesos);

  return (
    <>
      <p className="t-etiqueta">Tus procesos</p>
      <h1 className="t-titulo mt-2 mb-8">Así funciona tu empresa, dibujada</h1>
      {activa && (
        <section className="pozo pedido mb-8 medida">
          <h2 className="t-seccion">Tu consultora te pidió tus procesos</h2>
          {activa.nota && <p className="pedido__nota">«{activa.nota}»</p>}
          <p className="pedido__como">
            Puedes contarlos y los dibujamos, subir el archivo que ya tienes de cada uno, o traer tu lista entera en un Excel. Cuando termines, avísale abajo.
          </p>
        </section>
      )}
      {/* Con el pedido abierto, lo que se pidió va primero: subir lo que ya tiene. Contarlo sigue debajo, y el Excel
          con la lista entera queda plegado (es la manera menos frecuente). Sin pedido, el orden de siempre. */}
      {activa && quien.puede && (
        <div className="mb-10">
          <SubirProceso companyId={companyId} base="/portal/procesos" paraCliente porDibujar={conArchivo} archivosLeidos={archivosLeidos} />
        </div>
      )}
      <ProcesosLista companyId={companyId} procesos={procesos} base="/portal/procesos" paraCliente />
      {!activa && quien.puede && (
        <div className="mt-10">
          <SubirProceso companyId={companyId} base="/portal/procesos" paraCliente porDibujar={conArchivo} archivosLeidos={archivosLeidos} />
        </div>
      )}
      {activa && quien.puede && (
        <details className="mt-10">
          <summary className="plegado-enlace">
            Traer la lista entera de tus procesos en un Excel{sinArchivo.length > 0 ? ` · ${sinArchivo.length} de tu lista por dibujar` : ""}
          </summary>
          <div className="mt-3">
            <ImportarProcesos companyId={companyId} base="/portal/procesos" enLista={sinArchivo} paraCliente />
          </div>
        </details>
      )}
      <ListoParaConsultora
        companyId={companyId}
        solicitudId={activa?.id ?? null}
        completadaAt={completada?.completada_at ?? null}
        puede={quien.puede}
        comoConsultora={quien.comoConsultora}
        zona={config.zona_horaria}
      />
    </>
  );
}

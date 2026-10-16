import { contextoPortal } from "@/lib/portal";
import { configDeEmpresa } from "@/lib/producto";
import { PedidosCliente } from "@/components/negocio/PedidosCliente";
import { pedidosDelDueno, TEXTO_NO_SE_PUDO, TEXTO_SIN_PREPARAR } from "@/components/negocio/datos";

export const dynamic = "force-dynamic";

/**
 * LO QUE TE PIDIÓ TU CONSULTORA (16-10-2026). Kelin: «si hay cosas por corroborar, yo activarle esa vista y que lo
 * llene; si le falta algo, yo activarlo y lo llene». Aquí el dueño ve lo que ella activó, con su nota, y entra a
 * llenarlo. Lo retirado no se le muestra: ni siquiera se le pide a la base.
 */
export default async function Pedidos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const [pedidos, config] = await Promise.all([pedidosDelDueno(c.companyId), configDeEmpresa(c.companyId)]);

  return (
    <>
      <p className="t-etiqueta">De tu consultora</p>
      <h1 className="t-titulo mt-2 mb-2">Lo que te pidió tu consultora</h1>
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Cada cosa se llena en su lugar. Si no sabes un número, escribe uno aproximado o di «No lo sé»: también sirve. Cuando termines una, avísale con «Listo, ya lo llené».
      </p>
      {pedidos.ok ? (
        <PedidosCliente solicitudes={pedidos.valor} zona={config.zona_horaria} />
      ) : (
        <p className="t-cuerpo medida">{pedidos.falta ? TEXTO_SIN_PREPARAR : TEXTO_NO_SE_PUDO}</p>
      )}
    </>
  );
}

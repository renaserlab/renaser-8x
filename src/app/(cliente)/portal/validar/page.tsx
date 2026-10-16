import { contextoPortal } from "@/lib/portal";
import { claimsDeEmpresa, etiquetaFuente } from "@/lib/db/queries";
import { Validar, type PorValidar } from "@/components/cliente/Validar";
import { pedidoDeSecciones, AvisoPedido, ListoPedido } from "@/components/negocio/PedidoDeConsultora";

export const dynamic = "force-dynamic";

/** Confirmar lo encontrado. El cliente nunca ve estados ni pilares: solo el texto y tres botones. */
export default async function ValidarPag() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  // Lo que pidió la consultora («Confirmar lo que encontramos») va arriba, con su nota; «Listo» al final.
  const [todas, pedido] = await Promise.all([claimsDeEmpresa(c.companyId), pedidoDeSecciones(c.companyId, ["corroborar_diagnostico"], c.u)]);
  const porId = new Map(todas.map((x) => [x.id, x]));
  // Primero contradicciones (una sola por par), luego las antiguas por validar. Máximo 20 por sesión: una cosa a la vez.
  const vistos = new Set<string>();
  const items: PorValidar[] = [];
  for (const x of todas.filter((x) => x.estado === "contradicho")) {
    if (vistos.has(x.id)) continue;
    const otra = x.contradice_a ? porId.get(x.contradice_a) : null;
    vistos.add(x.id);
    if (otra) vistos.add(otra.id);
    items.push({ id: x.id, texto: x.texto, fuente: etiquetaFuente(x), fecha: x.fecha_afirmacion, contradiccion: otra ? { texto: otra.texto, fuente: etiquetaFuente(otra) } : null });
  }
  for (const x of todas.filter((x) => x.estado === "sin_verificar" && x.prioridad_validacion && !x.participant_id)) {
    items.push({ id: x.id, texto: x.texto, fuente: etiquetaFuente(x), fecha: x.fecha_afirmacion });
  }
  return (
    <>
      <p className="t-etiqueta">Confirmar lo encontrado</p>
      <h1 className="t-titulo mt-2 mb-8">¿Esto sigue siendo verdad?</h1>
      <AvisoPedido p={pedido} que="Son los puntos de aquí abajo." />
      <Validar items={items.slice(0, 20)} />
      <ListoPedido p={pedido} />
    </>
  );
}

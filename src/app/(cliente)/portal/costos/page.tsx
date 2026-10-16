import { contextoPortal } from "@/lib/portal";
import { configDeEmpresa } from "@/lib/producto";
import { listarCostos } from "@/lib/negocio-datos";
import { vitalMasReciente } from "@/lib/rentabilidad";
import { CostosMes } from "@/components/negocio/CostosMes";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { pedidosDelDueno, seccionDe, puedeLlenar, leer, metricasDe, TEXTO_NO_SE_PUDO, TEXTO_SIN_PREPARAR, TEXTO_CERRADA_VACIA } from "@/components/negocio/datos";

export const dynamic = "force-dynamic";

/**
 * TUS GASTOS DEL MES (16-10-2026). Lo que se paga sí o sí y lo que se gasta para vender, con lo que se pagó el mes pasado. El dueño
 * lo llena cuando su consultora abre esta parte; si no está abierta y no hay nada, se dice qué es y que la abre ella
 * (sin botones de escribir). El gasto fijo de «Tus números» se muestra al lado: no se pisa ni se elige.
 */
export default async function TusGastos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const companyId = c.companyId;
  const u = (c as { u?: { id: string; rol: string } }).u;

  const [pedidos, quien, costos, metricas, config] = await Promise.all([
    pedidosDelDueno(companyId),
    puedeLlenar(u, companyId),
    leer("los gastos del mes", () => listarCostos(companyId)),
    metricasDe(companyId),
    configDeEmpresa(companyId),
  ]);
  const { activa, completada } = seccionDe(pedidos.ok ? pedidos.valor : null, "costos");
  const vital = metricas.ok ? vitalMasReciente(metricas.valor, "gasto_fijo_mes")?.valor ?? null : null;

  const encabezado = (
    <>
      <p className="t-etiqueta">Tu empresa</p>
      <h1 className="t-titulo mt-2 mb-2">Tus gastos del mes</h1>
    </>
  );

  if (!costos.ok) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida">{costos.falta ? TEXTO_SIN_PREPARAR : TEXTO_NO_SE_PUDO}</p>
      </>
    );
  }

  const editable = !!activa && quien.puede;
  if (!activa && costos.valor.length === 0) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
          Aquí van lo que pagas cada mes sí o sí, vendas o no vendas, y lo que gastas para vender.
        </p>
        <p className="t-cuerpo medida">{TEXTO_CERRADA_VACIA}</p>
        <ListoParaConsultora companyId={companyId} solicitudId={null} completadaAt={completada?.completada_at ?? null} puede={quien.puede} comoConsultora={quien.comoConsultora} zona={config.zona_horaria} />
      </>
    );
  }

  return (
    <>
      {encabezado}
      <div className="medida mb-7 flex flex-col gap-2">
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
          {editable
            ? "Anota lo que pagaste el mes pasado, gasto por gasto. Si no sabes cuánto, escribe un aproximado o de cuánto a cuánto, o pulsa «No lo sé». Cada gasto se guarda solo al pasar al siguiente."
            : "Tus gastos de un mes, como los anotaste."}
        </p>
        {activa?.nota && <p className="t-cuerpo">Tu consultora te dice: «{activa.nota}»</p>}
        {activa && !quien.puede && <p className="t-dato" style={{ color: "var(--grafito)" }}>Esto lo llena el dueño de la empresa o quien él designe. Tú puedes verlo.</p>}
      </div>
      <CostosMes companyId={companyId} modo="dueno" costos={costos.valor} editable={editable} usuarioId={u?.id ?? null} config={config} vital={vital} />
      <ListoParaConsultora companyId={companyId} solicitudId={activa?.id ?? null} completadaAt={completada?.completada_at ?? null} puede={quien.puede} comoConsultora={quien.comoConsultora} zona={config.zona_horaria} />
    </>
  );
}

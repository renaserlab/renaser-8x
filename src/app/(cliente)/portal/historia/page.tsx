import { contextoPortal } from "@/lib/portal";
import { configDeEmpresa } from "@/lib/producto";
import { leerFichaNegocio } from "@/lib/negocio-datos";
import { respondidasDeHistoria } from "@/lib/esquemas-negocio";
import { HistoriaNegocio } from "@/components/negocio/HistoriaNegocio";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { pedidosDelDueno, seccionDe, puedeLlenar, leer, metricasDe, ventaDorada, TEXTO_NO_SE_PUDO, TEXTO_SIN_PREPARAR, TEXTO_CERRADA_VACIA } from "@/components/negocio/datos";

export const dynamic = "force-dynamic";

/**
 * TU HISTORIA (16-10-2026). Cinco preguntas, una por tarjeta: cuándo empezó, cuánto vendía al principio, su mejor
 * época, cuándo y por qué bajó, y qué hace distinto hoy. Se responden hablando o escribiendo; «No lo sé» también
 * es una respuesta. La venta de la mejor época, si ya está en Tus números, viene puesta.
 */
export default async function TuHistoria() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const companyId = c.companyId;
  const u = (c as { u?: { id: string; rol: string } }).u;

  const [pedidos, quien, ficha, metricas, config] = await Promise.all([
    pedidosDelDueno(companyId),
    puedeLlenar(u, companyId),
    leer("la historia del negocio", () => leerFichaNegocio(companyId)),
    metricasDe(companyId),
    configDeEmpresa(companyId),
  ]);
  const { activa, completada } = seccionDe(pedidos.ok ? pedidos.valor : null, "historia");

  const encabezado = (
    <>
      <p className="t-etiqueta">Tu empresa</p>
      <h1 className="t-titulo mt-2 mb-2">Tu historia</h1>
    </>
  );
  if (!ficha.ok) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida">{ficha.falta ? TEXTO_SIN_PREPARAR : TEXTO_NO_SE_PUDO}</p>
      </>
    );
  }

  const historia = ficha.valor.historia;
  const respondidas = respondidasDeHistoria(historia);
  const editable = !!activa && quien.puede;
  if (!activa && respondidas === 0) {
    return (
      <>
        {encabezado}
        <p className="t-cuerpo medida mb-4" style={{ color: "var(--grafito)" }}>
          Cinco preguntas sobre cómo empezó tu negocio, cuál fue su mejor época, cuándo bajó y qué haces distinto hoy.
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
            ? "Cuéntalo como lo contarías en una conversación: puedes escribir o hablar. Cada respuesta se guarda sola al pasar a la siguiente."
            : `Respondiste ${respondidas} de 5.`}
        </p>
        {activa?.nota && <p className="t-cuerpo">Tu consultora te dice: «{activa.nota}»</p>}
        {activa && !quien.puede && <p className="t-dato" style={{ color: "var(--grafito)" }}>Esto lo llena el dueño de la empresa o quien él designe. Tú puedes verlo.</p>}
      </div>
      <HistoriaNegocio
        companyId={companyId}
        modo="dueno"
        historia={historia}
        editable={editable}
        config={config}
        ventaDorada={metricas.ok ? ventaDorada(metricas.valor) : null}
      />
      <ListoParaConsultora companyId={companyId} solicitudId={activa?.id ?? null} completadaAt={completada?.completada_at ?? null} puede={quien.puede} comoConsultora={quien.comoConsultora} zona={config.zona_horaria} />
    </>
  );
}

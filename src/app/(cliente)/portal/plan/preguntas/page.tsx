import { contextoPortal } from "@/lib/portal";
import { configDeEmpresa } from "@/lib/producto";
import { SECCION } from "@/lib/secciones";
import { preguntasDelDueno } from "@/lib/estrategia/portal";
import { PORTAL, PREGUNTAS } from "@/lib/estrategia/textos";
import { pedidoDeSecciones } from "@/components/negocio/PedidoDeConsultora";
import { ResponderPreguntas } from "@/components/cliente/ResponderPreguntas";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — Unas preguntas para afinar tu plan (spec-estrategia-8x.md §7.3; dentro de «Tu plan», sin
destino nuevo)
THESIS: lo que 8X no sabe de la empresa y necesita para los números del plan, preguntado una cosa a la vez; el dueño
  responde lo que sabe, dice lo que no sabe y avisa con un toque.
FINISH: solo llegan las preguntas que su consultora le ENVIÓ (y las que ya respondió), filtradas en la consulta: ni las
  propuestas que ella todavía revisa, ni el porqué que escribió 8X para ella, ni las jugadas que esperan la respuesta.
  Una persona del equipo no las lee: son de quien dirige. Las de las secciones de siempre («Tus ventas al crédito»…)
  se responden en su pantalla, no aquí.
*/

/** Las preguntas de la estrategia que la consultora le envió al dueño. Se abren con el pedido «preguntas_estrategia». */
export default async function PreguntasDelPlan() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const [pedido, config] = await Promise.all([pedidoDeSecciones(c.companyId, ["preguntas_estrategia"], c.u), configDeEmpresa(c.companyId)]);
  const { activa, completada } = pedido.porSeccion[0]!;
  // Las preguntas de su plan son de quien dirige: a una persona del equipo ni se le piden a la base.
  const lectura = pedido.quien.puede ? await preguntasDelDueno(c.companyId) : null;

  return (
    <>
      <p className="t-etiqueta">Tu plan</p>
      <h1 className="t-titulo mt-2 mb-2">{SECCION.preguntas_estrategia.paraDueno}</h1>
      {!lectura ? (
        <p className="t-cuerpo medida mt-4">{PREGUNTAS.solo_quien_dirige}</p>
      ) : !lectura.ok ? (
        <p className="t-cuerpo medida mt-4">{lectura.falta ? PORTAL.preguntas_sin_preparar : PORTAL.preguntas_no_se_pudo}</p>
      ) : !lectura.preguntas.length ? (
        <p className="t-cuerpo medida mt-4">{PORTAL.preguntas_vacia}</p>
      ) : (
        <>
          <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>{PORTAL.preguntas_intro}</p>
          <ResponderPreguntas
            companyId={c.companyId}
            preguntas={lectura.preguntas}
            config={config}
            pedido={{ solicitudId: activa?.id ?? null, completadaAt: completada?.completada_at ?? null }}
            quien={pedido.quien}
          />
        </>
      )}
    </>
  );
}

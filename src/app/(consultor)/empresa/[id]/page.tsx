import Link from "next/link";
import { leerHechosDiagnostico } from "@/lib/diagnostico-datos";
import { armarDiagnostico, comoMetricas, type ItemFalta } from "@/lib/diagnostico-tablero";
import { leerTrabajoEmpresa } from "@/lib/negocio-datos";
import { sugerirModeloNegocio } from "@/lib/negocio";
import { numerosQueFaltan } from "@/lib/siguiente-accion";
import { TIPO_TRABAJO_TEXTO } from "@/lib/ruta";
import { fechaDia } from "@/lib/medicion";
import { leer } from "@/components/negocio/datos";
import { TableroDiagnostico } from "@/components/diagnostico/TableroDiagnostico";
import { PedirAlCliente } from "@/components/diagnostico/PedirAlCliente";
import { FichaDeTrabajo } from "@/components/consultor/FichaDeTrabajo";
import { ActivarParaCliente } from "@/components/consultor/ActivarParaCliente";

export const dynamic = "force-dynamic";

/** Lo que el dueño lee junto a cada pedido, en una frase. */
const NOTA_PEDIDO: Record<string, string> = {
  incongruencias: "Revisa los datos que no cuadran en Tu diagnóstico.",
  numeros: "Completa los números que faltan; si no sabes alguno, marca «No lo sé».",
  productos: "Anota el precio, lo que te cuesta y cuánto vendes en un mes normal de lo que más vendes.",
  costos: "Anota lo que pagas sí o sí cada mes: alquiler, sueldos y servicios.",
  historia: "Cuéntanos tu mejor época y cuándo empezó a bajar.",
  procesos: "Sube fotos o archivos de cómo se hace el trabajo, o lo dibujamos juntos.",
  organigrama: "Sube tu organigrama o una foto de quién hace qué.",
  por_confirmar: "Confirma los puntos marcados: ¿siguen siendo verdad?",
};
const NOTA_INCONGRUENCIAS = NOTA_PEDIDO.incongruencias!;

/**
 * DIAGNÓSTICO: la portada de la empresa (16-10-2026, reemplaza al Panorama). Kelin: «hace rato estaba simple y fácil:
 * diagnóstico, qué hay en números, indicadores y el avance progresivo». Arriba, lo que hoy frena a la empresa y cuánto
 * cuesta; lo que no cuadra, con un botón para pedirle al dueño que lo corrija; los cuatro bloques con su gráfico; lo
 * que falta levantar, con «Pedírselo al cliente» en cada fila. Al final, plegados, la ficha de trabajo y todo lo que se
 * le puede pedir. Lo demás que tenía el Panorama se fue a su vista: la ruta y «¿Mejoró?» a Avance, la historia del
 * negocio a Números, participantes, admisión y datos del expediente a Expediente; las acciones de la cabecera, a la
 * cabecera de la empresa.
 */
export default async function Diagnostico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [h, trabajo] = await Promise.all([leerHechosDiagnostico(id, { para: "consultora" }), leer("el trabajo de la empresa", () => leerTrabajoEmpresa(id))]);
  const t = armarDiagnostico(h, "consultora");
  const base = `/empresa/${id}`;
  const zona = t.config.zona_horaria;
  const pedidoCorroborar = t.loQueFalta.find((f) => f.clave === "incongruencias")?.pedido ?? null;
  const fichaAbierta = trabajo.ok && (!trabajo.valor.tipo_trabajo || !trabajo.valor.ruta_inicio);

  const accionFalta = (f: ItemFalta) =>
    f.seccion ? (
      <PedirAlCliente companyId={id} seccion={f.seccion} nota={NOTA_PEDIDO[f.clave] ?? null} pedido={f.pedido} zona={zona} />
    ) : (
      <Link href={`${base}/entrevista`} className="boton boton--secundario" style={{ fontSize: 14 }}>
        Preguntar en la entrevista
      </Link>
    );

  return (
    <TableroDiagnostico
      t={t}
      base={base}
      accionFalta={accionFalta}
      accionLista={<PedirAlCliente companyId={id} seccion="corroborar_diagnostico" nota={NOTA_INCONGRUENCIAS} pedido={pedidoCorroborar} texto="Pedir al cliente que los corrija" zona={zona} />}
      arriba={
        h.admitida === false ? (
          <p className="nota a-lo-ancho" style={{ padding: "0 4px", fontSize: 13.5 }}>
            Admisión pendiente:{" "}
            <Link href={`${base}/expediente`} className="enlace-azul">
              revisarla en Expediente
            </Link>
          </p>
        ) : null
      }
    >
      <section className="tarjeta a-lo-ancho" aria-label="Ficha de trabajo">
        <details id="ficha" open={fichaAbierta || undefined} style={{ scrollMarginTop: 90 }}>
          <summary className="t-seccion" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Ficha de trabajo
            {trabajo.ok && trabajo.valor.tipo_trabajo && trabajo.valor.ruta_inicio ? (
              <span className="t-dato" style={{ color: "var(--grafito)", fontFamily: "var(--font-ui)" }}>
                {TIPO_TRABAJO_TEXTO[trabajo.valor.tipo_trabajo].consultora} · día 1: {fechaDia(trabajo.valor.ruta_inicio)}
              </span>
            ) : trabajo.ok ? (
              <span className="estado espera">falta {!trabajo.valor.tipo_trabajo ? "el tipo de trabajo" : "la fecha de inicio"}</span>
            ) : null}
          </summary>
          <div style={{ marginTop: 12 }}>
            {trabajo.ok ? (
              <FichaDeTrabajo companyId={id} trabajo={trabajo.valor} sugeridos={sugerirModeloNegocio(trabajo.valor.modelo_operativo)} />
            ) : (
              <p className="t-dato" style={{ color: "var(--caducado)" }}>
                {trabajo.falta ? "Falta aplicar supabase/migracion-entrar-hoy.sql: sin ella no hay ficha de trabajo ni ruta." : "No se pudo leer la ficha de trabajo de la empresa: vuelve a cargar la página."}
              </p>
            )}
          </div>
        </details>
      </section>
      <section className="tarjeta a-lo-ancho" aria-label="Todo lo que se le puede pedir">
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
            Todo lo que se le puede pedir
          </summary>
          <p className="t-dato" style={{ color: "var(--grafito)", margin: "4px 0 12px" }}>
            Marca lo que el dueño tiene que llenar, confirmar o subir. Lo ve en su Inicio y en «Lo que te pidió tu consultora».
          </p>
          <ActivarParaCliente
            companyId={id}
            solicitudes={h.solicitudes}
            contexto={{ porConfirmar: h.porConfirmar, faltanNumeros: h.metricas ? numerosQueFaltan(comoMetricas(h.metricas)).faltan : null }}
            zona={zona}
          />
        </details>
      </section>
    </TableroDiagnostico>
  );
}

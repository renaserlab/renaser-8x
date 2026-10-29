import Link from "next/link";
import { leerHechosDiagnostico } from "@/lib/diagnostico-datos";
import { armarDiagnostico, comoMetricas, type ItemFalta } from "@/lib/diagnostico-tablero";
import { leerTrabajoEmpresa } from "@/lib/negocio-datos";
import { sugerirModeloNegocio } from "@/lib/negocio";
import { numerosQueFaltan } from "@/lib/siguiente-accion";
import { TIPO_TRABAJO_TEXTO } from "@/lib/ruta";
import { fechaDia } from "@/lib/medicion";
import { leer } from "@/components/negocio/datos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ErrorDeLinea } from "@/lib/producto";
import { TableroDiagnostico } from "@/components/diagnostico/TableroDiagnostico";
import { PedirAlCliente } from "@/components/diagnostico/PedirAlCliente";
import { FichaDeTrabajo } from "@/components/consultor/FichaDeTrabajo";
import { ProximaSesion } from "@/components/consultor/ProximaSesion";
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
  const [h, trabajo, sesion] = await Promise.all([
    leerHechosDiagnostico(id, { para: "consultora" }),
    leer("el trabajo de la empresa", () => leerTrabajoEmpresa(id)),
    // Los dos campos que la consultora escribe a mano. Si la migración de las correcciones todavía
    // no está aplicada, la lectura falla y el panel lo dice en vez de mostrarse vacío.
    leer("la próxima sesión", async () => {
      const { data, error } = await supabaseAdmin().from("companies").select("proxima_sesion,enlace_reunion").eq("id", id).single();
      // Se lanza con el tipo que `leer` sabe clasificar: así, mientras la migración no esté
      // aplicada, el panel dice que falta la migración en vez de «no se pudo leer», que es un
      // mensaje que manda a buscar el problema donde no está.
      if (error) throw new ErrorDeLinea(error.message, error.code ?? null);
      return data as { proxima_sesion: string | null; enlace_reunion: string | null };
    }),
  ]);
  const t = armarDiagnostico(h, "consultora");
  const base = `/empresa/${id}`;
  const zona = t.config.zona_horaria;
  const pedidoCorroborar = t.loQueFalta.find((f) => f.clave === "incongruencias")?.pedido ?? null;
  const fichaAbierta = trabajo.ok && (!trabajo.valor.tipo_trabajo || !trabajo.valor.ruta_inicio);
  // Cuántos pedidos tiene abiertos el dueño ahora mismo, y si nunca se le pidió nada. Si no se pudo leer
  // (null) no se abre sola: abrir un panel que no sabe lo que ya está pedido invita a pedirlo dos veces.
  const activas = h.solicitudes?.filter((s) => s.estado === "activa").length ?? 0;
  const entregadas = h.solicitudes?.filter((s) => s.estado === "completada").length ?? 0;
  const sinPedirNada = h.solicitudes != null && h.solicitudes.length === 0;
  // Nada abierto es nada abierto, se le haya pedido antes o no: en los dos casos el panel se abre solo, porque en
  // los dos hay algo que hacer —pedirle lo primero, o leer lo que ya entregó—. Decir «todavía no le has pedido
  // nada» cuando entregó cinco pedidos es mentirle a la única pantalla que avisa de que hay cosas por leer.
  const nadaAbierto = h.solicitudes != null && activas === 0;

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
      <section className="tarjeta a-lo-ancho" aria-label="Próxima sesión">
        <details id="sesion" open={sesion.ok && !sesion.valor.proxima_sesion ? undefined : true} style={{ scrollMarginTop: 90 }}>
          <summary className="t-seccion" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Próxima sesión
            {sesion.ok && sesion.valor.proxima_sesion ? (
              <span className="t-dato" style={{ color: "var(--grafito)", fontFamily: "var(--font-ui)" }}>
                {fechaDia(sesion.valor.proxima_sesion)}
              </span>
            ) : sesion.ok ? (
              <span className="estado espera">sin fecha</span>
            ) : null}
          </summary>
          <div style={{ marginTop: 12 }}>
            {sesion.ok ? (
              <ProximaSesion companyId={id} proximaSesion={sesion.valor.proxima_sesion} enlaceReunion={sesion.valor.enlace_reunion} />
            ) : (
              <p className="t-dato" style={{ color: "var(--caducado)" }}>
                {sesion.falta
                  ? "Falta aplicar supabase/migracion-correcciones-auditoria.sql: sin ella no hay dónde anotar la próxima sesión ni su enlace."
                  : "No se pudo leer la próxima sesión de esta empresa: vuelve a cargar la página."}
              </p>
            )}
          </div>
        </details>
      </section>
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
      {/* LA LLAVE CON LA QUE EL DUEÑO LLENA SUS PROPIOS DATOS. Estaba aquí desde el 16-10 y no se usó nunca en
          ninguna de las cinco empresas: vivía en un plegado sin nombre propio, al pie de la pantalla, sin decir
          cuántos pedidos hay ni para qué sirve. Ahora el título dice en qué estado está y, cuando no se le ha
          pedido NADA todavía, se abre sola: ese es justo el día en que hace falta verla. */}
      <section className="tarjeta a-lo-ancho" aria-label="Lo que le pides al dueño">
        <details id="pedir" open={nadaAbierto || undefined} style={{ scrollMarginTop: 90 }}>
          <summary className="t-seccion" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Lo que le pides al dueño
            {h.solicitudes == null ? (
              <span className="estado espera">no se pudo leer</span>
            ) : activas ? (
              <span className="estado ok">{activas === 1 ? "1 pedido abierto" : `${activas} pedidos abiertos`}</span>
            ) : sinPedirNada ? (
              <span className="estado espera">todavía no le has pedido nada</span>
            ) : entregadas ? (
              <span className="estado ok">{entregadas === 1 ? "1 entregado, nada abierto" : `${entregadas} entregados, nada abierto`}</span>
            ) : (
              <span className="estado espera">nada abierto</span>
            )}
          </summary>
          <p className="t-dato" style={{ color: "var(--grafito)", margin: "4px 0 12px" }}>
            Así es como el dueño llena sus propios datos: marca lo que tiene que llenar, confirmar o subir y se le
            abre esa pantalla en su portal. Sin esto, sus pantallas de productos, gastos, historia, moneda, crédito
            e inventario están cerradas y no puede escribir en ellas.
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

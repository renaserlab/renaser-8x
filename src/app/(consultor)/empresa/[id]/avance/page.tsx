import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Icono } from "@/components/base/Icono";
import { Segmentos } from "@/components/tablero/Piezas";
import { ResumenIndicadores, type ValorDeIndicador } from "@/components/kpis/ResumenIndicadores";
import { MarcarCompuerta } from "@/components/consultor/MarcarCompuerta";
import { Tramos, FaltaCompuerta, lineaDia, textoPct } from "@/components/navegacion/BarraRuta";
import { PanelMediciones } from "@/components/medicion/PanelMediciones";
import { cargarMediciones, cargarActas, cargarAccionesLigadas } from "@/components/medicion/datos";
import { cargarTablero } from "@/app/api/companies/[id]/iniciativas/_datos";
import { avanceDeEmpresa, leerHechosRuta } from "@/lib/ruta-datos";
import { radiografia, type Metrica } from "@/lib/metricas";
import { desdeFila, zonaDe, type Kpi } from "@/lib/kpis";
import { estadoCanonico } from "@/lib/plan-reglas";
import { ESTADOS_EN_MARCHA } from "@/lib/revision-semanal";
import { ENTREGABLE } from "@/lib/textos";
import type { AvanceRuta } from "@/lib/ruta";

export const dynamic = "force-dynamic";

/*
AVANCE (vista 5 de la empresa, 16-10-2026). Pedido de Kelin: «diagnóstico, qué hay en números, indicadores y el avance
progresivo». Aquí se junta lo que antes estaba en seis pestañas: la ruta y sus compuertas, ¿mejoró?, los indicadores,
el plan, la revisión semanal, la excelencia y la entrega. Cada tarjeta dice una cifra, con su gráfico, y lleva a su
pantalla (que sigue igual, en «En esta vista»).
Arriba, UNA tarjeta para la ruta (revisión del 16-10-2026: la etapa se decía tres veces —la barra, el titular «Compuerta
5 · La Firma: faltan 8», en jerga y sin el avance, y la tarjeta «La ruta», casi vacía—): el titular con la etapa, su %
y el día; una franja de cuatro tramos; lo que falta para la compuerta, abierto; y las compuertas para marcar, plegadas.
Arriba de cada pantalla de la empresa la ruta va en una sola línea (BarraRuta compacta).
Regla de la casa: lo que no se pudo leer o todavía no existe se dice «sin dato» y va rayado; nunca un cero inventado.
*/

const DOCUMENTOS = Object.keys(ENTREGABLE);

/** El rótulo de un tramo de la barra, en singular o plural según su cuenta. */
const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Lo que dice el titular: en qué etapa va la empresa, con su %, o qué impide saberlo. */
function frase(avance: AvanceRuta | null, fallo: boolean): { texto: string; ficha: boolean; dia: string | null } {
  if (fallo) return { texto: "No se pudo leer el avance de la ruta", ficha: false, dia: null };
  if (!avance) return { texto: "La ruta todavía no está habilitada en esta base", ficha: false, dia: null };
  if (!avance.tipo || !avance.inicio) return { texto: avance.aviso ?? (!avance.tipo ? "Falta elegir el tipo de trabajo" : "Falta la fecha de inicio de la ruta"), ficha: true, dia: null };
  const indice = avance.etapas.findIndex((e) => e.clave === avance.actual);
  const actual = indice >= 0 ? avance.etapas[indice]! : null;
  if (!actual) return { texto: "Ruta completa: todas las compuertas pasaron en verde", ficha: false, dia: null };
  return {
    texto: `Etapa ${indice + 1} de ${avance.etapas.length} · ${actual.nombre} · ${textoPct(actual.pct)}`,
    ficha: false,
    dia: lineaDia(avance.dia, avance.inicio, actual.hastaDia),
  };
}


export default async function Avance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = `/empresa/${id}`;
  const sb = supabaseAdmin();
  const hoy = new Date();

  // Cada lectura por su lado: si una falla, su tarjeta lo dice y las demás abren igual.
  const [avanceLeido, hechos, empresa, indicadoresLeidos, accionesLeidas, entregablesLeidos, tablero, medicion] = await Promise.all([
    avanceDeEmpresa(id).then(
      (a) => ({ ok: true as const, a }),
      (e: unknown) => {
        console.error("[avance] no se pudo leer el avance de la ruta", id, e);
        return { ok: false as const, a: null };
      }
    ),
    leerHechosRuta(id).catch(() => null),
    sb.from("companies").select("zona_horaria").eq("id", id).maybeSingle(),
    sb.from("indicadores").select("*").eq("company_id", id).eq("estado", "activo"),
    sb.from("actions").select("estado,verificado_at").eq("company_id", id),
    sb.from("deliverables").select("tipo,publicado").eq("company_id", id),
    cargarTablero(id).catch((e: unknown) => {
      console.error("[avance] no se pudieron leer las iniciativas", id, e);
      return null;
    }),
    (async () => {
      const [meds, actas, acciones, metricas] = await Promise.all([
        cargarMediciones(sb, id),
        cargarActas(sb, id),
        cargarAccionesLigadas(sb, id),
        sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", id).limit(300),
      ]);
      return { meds, actas, acciones, listos: radiografia((metricas.data ?? []) as Metrica[]).listos };
    })().catch((e: unknown) => {
      console.error("[avance] no se pudieron leer las mediciones", id, e);
      return null;
    }),
  ]);

  const avance = avanceLeido.a;
  const cabecera = frase(avance, !avanceLeido.ok);
  const etapaActual = avance?.etapas.find((e) => e.clave === avance.actual) ?? null;
  const zona = zonaDe((empresa.data as { zona_horaria?: unknown } | null)?.zona_horaria);

  // ── Indicadores: los activos y sus valores; la tarjeta (ResumenIndicadores) elige la línea y cuenta. ──
  const activos: Kpi[] = indicadoresLeidos.error ? [] : ((indicadoresLeidos.data ?? []) as Record<string, unknown>[]).map(desdeFila);
  const ids = activos.map((k) => k.id);
  const valoresLeidos = ids.length ? await sb.from("indicador_valores").select("indicador_id,periodo,valor,estado_validacion").in("indicador_id", ids).limit(600) : { data: [] as ValorDeIndicador[], error: null };
  const valores = (valoresLeidos.data ?? []) as ValorDeIndicador[];

  // ── Plan: por resultados (HechosRuta.plan) y las acciones por estado. ──
  const acciones = accionesLeidas.error ? null : ((accionesLeidas.data ?? []) as { estado: string; verificado_at?: string | null }[]).map((a) => estadoCanonico(a));
  const verificadas = acciones?.filter((e) => e === "verificado").length ?? 0;
  const enMarcha = acciones?.filter((e) => ESTADOS_EN_MARCHA.includes(e)).length ?? 0;
  const propuestas = acciones?.filter((e) => e === "propuesto").length ?? 0;
  const reportadas = acciones?.filter((e) => e === "reportado").length ?? 0;
  const hayPlan = verificadas + enMarcha + propuestas + reportadas > 0;

  // ── Entrega: los siete documentos, cuántos tipos ya se publicaron. ──
  const publicados = entregablesLeidos.error
    ? null
    : new Set(((entregablesLeidos.data ?? []) as { tipo: string; publicado: boolean | null }[]).filter((d) => d.publicado && DOCUMENTOS.includes(d.tipo)).map((d) => d.tipo)).size;

  // ── Excelencia: lo que está en curso. ──
  const iniciativas = tablero && tablero.disponible ? tablero.iniciativas : null;
  const enCurso = iniciativas?.filter((i) => i.estado === "en_curso" || i.estado === "ajustar" || i.estado === "continuar").length ?? 0;
  const porEmpezar = iniciativas?.filter((i) => i.estado === "aprobada").length ?? 0;
  const propuestasExc = iniciativas?.filter((i) => i.estado === "propuesta").length ?? 0;

  const revisiones = hechos?.revisiones ?? null;
  const plan = hechos?.plan ?? null;

  return (
    <div className="tablero">
      {/* 1 · LA RUTA, en UNA tarjeta: la etapa con su % y el día, los cuatro tramos, lo que falta para la compuerta y,
          plegadas, las compuertas para marcar. */}
      <section id="ruta" className="tarjeta a-lo-ancho ruta-tarjeta" aria-labelledby="t-avance" style={{ scrollMarginTop: 90 }}>
        <p className="t-etiqueta" style={{ margin: 0 }}>Avance de la ruta</p>
        <h1 id="t-avance" className="t-hero" style={{ margin: "6px 0 0" }}>{cabecera.texto}</h1>
        {cabecera.ficha ? (
          <p className="sub" style={{ marginTop: 8 }}>
            <Link className="enlace-azul" href={`${base}#ficha`}>Completar la ficha de trabajo</Link> en Diagnóstico: sin tipo de trabajo y fecha de inicio no hay etapas ni compuertas.
          </p>
        ) : (
          <p className="sub" style={{ marginTop: 8 }}>
            {cabecera.dia ? `${cabecera.dia}. ` : ""}Los días son máximos: se avanza con resultados, nunca por calendario.
          </p>
        )}
        {avanceLeido.ok && avance && avance.tipo && avance.inicio && (
          <>
            <Tramos
              tramos={avance.etapas.map((e) => ({
                clave: e.clave,
                nombre: e.nombre,
                estado: e.estado,
                pct: e.pct,
                dias: e.hastaDia - e.desdeDia + 1,
                compuerta: { nombre: e.compuerta.nombre, veredicto: e.compuerta.veredicto },
              }))}
            />
            {etapaActual && <FaltaCompuerta etapa={etapaActual} falta={avance.faltaParaLaCompuerta} abierta />}
          </>
        )}
        {avanceLeido.ok ? (
          avance && avance.tipo ? (
            <details className="plegado" style={{ marginTop: 6, borderTop: "1px solid var(--linea)" }}>
              <summary>
                <span>Las compuertas: lo que mide 8X y lo que marcas tú</span>
                <Icono nombre="abajo" />
              </summary>
              <div style={{ paddingTop: 6 }}>
                <MarcarCompuerta companyId={id} avance={avance} />
              </div>
            </details>
          ) : (
            <div style={{ marginTop: 14 }}>
              <MarcarCompuerta companyId={id} avance={avance} />
            </div>
          )
        ) : (
          <p className="sin-dato" style={{ marginTop: 14 }}>No se pudo leer el avance de la ruta: vuelve a cargar la página</p>
        )}
      </section>

      {/* 2 · ¿MEJORÓ? La pregunta que el cliente paga por responder. El panel trae su propio título: la tarjeta no lo repite. */}
      <section className="tarjeta a-lo-ancho contiene-panel" aria-label="¿Mejoró?">
        {medicion ? (
          <PanelMediciones companyId={id} mediciones={medicion.meds.mediciones} actas={medicion.actas} acciones={medicion.acciones} numerosListos={medicion.listos} conVersiones={medicion.meds.conVersiones} />
        ) : (
          <>
            <div className="cabeza"><div><h2>¿Mejoró?</h2><p className="sub">Cada corte contra el punto de partida con el que se midió</p></div></div>
            <p className="sin-dato" style={{ marginTop: 14 }}>No se pudieron leer las mediciones</p>
          </>
        )}
      </section>

      {/* 3 · INDICADORES: la línea del primero de resultado que ya tiene dos valores (la misma tarjeta abre la vista Indicadores). */}
      <ResumenIndicadores activos={activos} valores={valores} hoy={hoy} zona={zona} error={!!indicadoresLeidos.error} ir={`${base}/kpis`} />

      {/* 4 · PLAN: por resultados, no por calendario. */}
      <section className="tarjeta cifra-tarjeta ancha" aria-labelledby="t-plan">
        <div className="cabeza">
          <div><h2 id="t-plan">Plan</h2><p className="sub">Acciones verificadas a tiempo</p></div>
          <Link className="ir" href={`${base}/plan`} aria-label="Ir al Plan" title="Ir al Plan"><Icono nombre="diagonal" /></Link>
        </div>
        {acciones === null ? (
          <p className="sin-dato">No se pudo leer el plan</p>
        ) : !hayPlan ? (
          <p className="sin-dato">Todavía no hay plan</p>
        ) : (
          <>
            <div className="fila-cifra">
              {plan && plan.consideradas > 0 ? (
                <span className="grande">{plan.verificadasATiempo}<small>de {plan.consideradas} a tiempo</small></span>
              ) : (
                <span className="sin-dato">{plan ? "Ninguna acción vence todavía" : "A tiempo: sin dato"}</span>
              )}
            </div>
            <Segmentos
              etiqueta={`${verificadas} verificadas, ${enMarcha} en marcha, ${propuestas} propuestas`}
              partes={[
                { n: verificadas, texto: pl(verificadas, "verificada", "verificadas"), tipo: "s1" },
                { n: enMarcha, texto: "en marcha", tipo: "s2" },
                { n: propuestas, texto: pl(propuestas, "propuesta", "propuestas"), tipo: "s4" },
              ]}
            />
            {reportadas > 0 && <p className="nota">{reportadas} reportada{reportadas === 1 ? "" : "s"}, por verificar</p>}
          </>
        )}
      </section>

      {/* 5 · REVISIÓN SEMANAL */}
      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-revision">
        <div className="cabeza">
          <div><h2 id="t-revision">Revisión semanal</h2><p className="sub">Desde el día 8 de la ruta</p></div>
          <Link className="ir" href={`${base}/revision`} aria-label="Ir a Revisión semanal" title="Ir a Revisión semanal"><Icono nombre="diagonal" /></Link>
        </div>
        {revisiones === null ? (
          <p className="sin-dato">Revisiones: sin dato</p>
        ) : revisiones.esperadas === 0 ? (
          <p className="sin-dato">Todavía no hay semanas que revisar</p>
        ) : (
          <>
            <div className="fila-cifra">
              <span className="grande">{revisiones.revisadas}<small>de {revisiones.esperadas} semanas</small></span>
            </div>
            <Segmentos
              etiqueta={`${revisiones.revisadas} revisadas, ${Math.max(0, revisiones.esperadas - revisiones.revisadas)} sin revisar`}
              partes={[
                { n: revisiones.revisadas, texto: pl(revisiones.revisadas, "revisada", "revisadas"), tipo: "s1" },
                { n: Math.max(0, revisiones.esperadas - revisiones.revisadas), texto: "sin revisar", tipo: "s2" },
              ]}
            />
          </>
        )}
      </section>

      {/* 6 · EXCELENCIA */}
      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-excelencia">
        <div className="cabeza">
          <div><h2 id="t-excelencia">Excelencia</h2><p className="sub">Iniciativas que se están probando</p></div>
          <Link className="ir" href={`${base}/excelencia`} aria-label="Ir a Excelencia" title="Ir a Excelencia"><Icono nombre="diagonal" /></Link>
        </div>
        {tablero === null ? (
          <p className="sin-dato">No se pudieron leer las iniciativas</p>
        ) : !tablero.disponible ? (
          <p className="sin-dato">{tablero.motivo}</p>
        ) : iniciativas && iniciativas.length === 0 ? (
          <p className="sin-dato">Todavía no hay iniciativas</p>
        ) : (
          <>
            <div className="fila-cifra">
              <span className="grande">{enCurso}<small>en curso</small></span>
            </div>
            <p className="nota">{porEmpezar} aprobada{porEmpezar === 1 ? "" : "s"} por empezar · {propuestasExc} propuesta{propuestasExc === 1 ? "" : "s"}</p>
          </>
        )}
      </section>

      {/* 7 · ENTREGA: los siete documentos. */}
      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-entrega">
        <div className="cabeza">
          <div><h2 id="t-entrega">Entrega</h2><p className="sub">Documentos publicados para el cliente</p></div>
          <Link className="ir" href={`${base}/entrega`} aria-label="Ir a Entrega" title="Ir a Entrega"><Icono nombre="diagonal" /></Link>
        </div>
        {publicados === null ? (
          <p className="sin-dato">No se pudieron leer los documentos</p>
        ) : (
          <>
            <div className="fila-cifra">
              <span className="grande">{publicados}<small>de {DOCUMENTOS.length} publicados</small></span>
            </div>
            <Segmentos
              etiqueta={`${publicados} publicados, ${DOCUMENTOS.length - publicados} por publicar`}
              partes={[
                { n: publicados, texto: pl(publicados, "publicado", "publicados"), tipo: "s1" },
                { n: DOCUMENTOS.length - publicados, texto: "por publicar", tipo: "s4" },
              ]}
            />
          </>
        )}
      </section>
    </div>
  );
}

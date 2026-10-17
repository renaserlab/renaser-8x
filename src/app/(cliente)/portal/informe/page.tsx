import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, esDeDocumentos, ROTULO_POR_CONFIRMAR, type HallazgoHoy, type PorConfirmarHoy } from "@/lib/hoy";
import { bolsasDeFugas, resumenDelInforme } from "@/lib/perdida";
import { monedaParaFugas } from "@/components/negocio/datos";
import { BolsasDeFugas, hayAlgoEnLasBolsas } from "@/components/cliente/BolsasDeFugas";
import type { Metrica } from "@/lib/rules/anomalias";
import { PILAR_CLIENTE, ESTADO_PILAR } from "@/lib/textos";
import { documentoQueResuelve } from "@/lib/biblioteca";
import { BotonImprimir } from "@/components/base/BotonImprimir";
import { urlDeLogo } from "@/lib/logo";
import { registrar } from "@/lib/auditoria";
import { usuarioActual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** El sello de cada área (.estado del sistema): sólida en ok, mejorable en espera, crítica en alto, sin datos en neutro. */
const SELLO_AREA: Record<string, "ok" | "espera" | "alto" | "neutro"> = { solido: "ok", mejorable: "espera", critico: "alto", desconocido: "neutro" };
const ESTADO_TEXTO: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Información insuficiente" };

/**
 * INFORME DE DIAGNÓSTICO — el documento formal de hallazgos que el dueño descarga sin depender de
 * que el consultor lo publique (pedido de Kelin: "leí el diagnóstico de la empresa pero no hay dónde
 * descargarlo"). Cada hallazgo trae su evidencia y EL DOCUMENTO QUE LO RESUELVE: el puente del "¿cómo?".
 */
export default async function Informe() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [hoy, { data: metricasRaw }, { data: empresa }, monedaFugas] = await Promise.all([
    empresaHoy(c.companyId),
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(80),
    sb.from("companies").select("nombre,sector,ficha").eq("id", c.companyId).single(),
    monedaParaFugas(c.companyId),
  ]);
  // Las fugas en sus tres bolsas, que nunca se suman (src/lib/perdida.ts): el resumen dice la caja y, aparte, lo que
  // podría vender; nunca una sola cifra «en riesgo» que mezcle las dos.
  const fugas = bolsasDeFugas((metricasRaw ?? []) as Metrica[], { moneda: monedaFugas });
  const resumenFugas = resumenDelInforme(fugas);
  const ficha = (empresa?.ficha ?? {}) as Record<string, string>;
  const logo = await urlDeLogo(ficha);
  // RASTRO: quién abrió el informe de esta empresa y cuándo (auditoría del 29-08-2026).
  void registrar({ companyId: c.companyId, actor: await usuarioActual(), accion: "ver", entidad: "informe_diagnostico", ruta: "/portal/informe" });
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  // La restricción y las secundarias ya vienen dentro de noVes: sin quitar repetidos, el informe imprimía dos veces el
  // mismo hallazgo y lo contaba dos veces en el resumen («2 hallazgos» donde había uno). Un número que se le entrega al
  // dueño no puede estar inflado; se conserva el orden (primero lo que más frena).
  const todos = [...new Map(([hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter(Boolean) as HallazgoHoy[]).map((h) => [h.id, h])).values()];
  const criticos = todos.filter((h) => h.impacto === "alto" && !h.preserva);
  const otros = todos.filter((h) => h.impacto !== "alto" && !h.preserva);
  const fortalezas = hoy.fortalezas ?? [];
  // Lo que todavía no es conclusión, separado por su razón: lo visto solo en documentos que nadie confirmó, y lo demás
  // (ya confirmado pero con poca información del área, por revisar de nuevo, o que no sale de papeles). A cada grupo su
  // texto: un informe impreso no puede decir «sale de documentos» de lo que el dueño contó y ya confirmó.
  const deDocumentos = hoy.porConfirmar.filter(esDeDocumentos);
  const sinConcluir = hoy.porConfirmar.filter((p) => !esDeDocumentos(p));
  /** «1 hallazgo», «2 hallazgos»: un número que se entrega impreso concuerda con su nombre. */
  const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  if (hoy.nivel === 0)
    return (
      <>
        <h1 className="t-titulo mb-3">Tu informe todavía no está listo</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          Necesitamos conocer tu empresa antes de escribir un informe serio. Cuéntanos cómo funciona y aquí aparecerá.
        </p>
        <Link href="/portal/conversacion" className="boton">Empezar a contar</Link>
      </>
    );

  // ROTULO PROVISIONAL (R10.4): un hallazgo formado solo con afirmaciones que nadie confirmó no se imprime como
  // conclusión. empresaHoy ya los aparta en porConfirmar; el rótulo aquí es la segunda barandilla por si uno llega.
  const ROTULO_PROVISIONAL = "Provisional: pendiente de corroborar";
  // «Pendiente de corroborar» solo es cierto si algo de lo que lo sostiene sigue sin confirmar. Cuando todo lo que lo
  // sostiene ya está confirmado, el informe imprimía ese rótulo y debajo «lo que lo sostiene ya está confirmado»: dos
  // frases que se desmienten. A ese punto se le dice por qué no es conclusión, no que falta corroborarlo.
  const rotuloDe = (p: PorConfirmarHoy) => (p.sustento.confirmadas > 0 && p.sustento.porConfirmar === 0 ? `Todavía no es conclusión: ${ROTULO_POR_CONFIRMAR[p.motivo]}` : ROTULO_PROVISIONAL);
  // El rótulo es un sello del sistema (.estado): lo provisional, con su borde punteado (aún no es conclusión).
  const Rotulo = ({ texto, tono, dashed }: { texto: string; tono: "espera" | "alto"; dashed?: boolean }) => (
    <span className={dashed ? `estado ${tono} estado--provisional` : `estado ${tono}`} style={{ flex: "none" }}>
      {texto}
    </span>
  );

  // LO PROVISIONAL SE IMPRIME COMO LO QUE ES (R10.4): aparte, rotulado, sin número de hallazgo y sin recomendación.
  // Nunca entra en el resumen ni en «por dónde empezar». `conMotivo` añade a cada punto por qué no es conclusión, y
  // nombra lo grave sin decir «si se confirma» de algo cuyo sustento ya está confirmado.
  const seccionProvisional = ({ titulo, intro, items, conMotivo }: { titulo: string; intro: string; items: PorConfirmarHoy[]; conMotivo?: boolean }) =>
    items.length === 0 ? null : (
      <section style={{ marginBottom: 24 }}>
        <h3 className="t-seccion mb-2">{titulo}</h3>
        <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>{intro}</p>
        {items.map((p) => (
          <article key={p.id} style={{ borderTop: "1px dashed var(--linea)", paddingTop: 12, marginBottom: 12, breakInside: "avoid" }}>
            <div className="flex items-start justify-between gap-3">
              <p className="t-cuerpo fuerte" style={{ minWidth: 0 }}>{p.titulo}</p>
              <span className="flex flex-wrap gap-2" style={{ flex: "none" }}>
                <Rotulo texto={rotuloDe(p)} tono="espera" dashed />
                {p.graveSiSeConfirma && <Rotulo texto={conMotivo ? "Grave si resulta ser así" : "Grave si se confirma"} tono="alto" dashed />}
              </span>
            </div>
            {conMotivo && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{p.porQue}</p>}
            <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{PILAR_CLIENTE[p.pilar] ?? p.pilar} · {p.deDonde}</p>
          </article>
        ))}
      </section>
    );

  const Hallazgo = ({ h, n }: { h: HallazgoHoy; n: number }) => {
    const doc = documentoQueResuelve(h);
    const fuentes = h.evidencia.map((e) => e.fuente).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
    return (
      <article style={{ borderTop: "1px solid var(--linea)", paddingTop: 16, marginBottom: 18, breakInside: "avoid" }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-seccion" style={{ minWidth: 0 }}>{n}. {h.titulo}</h3>
          <span className="flex flex-wrap gap-2" style={{ flex: "none" }}>
            {h.provisional && <Rotulo texto={ROTULO_PROVISIONAL} tono="espera" dashed />}
            <Rotulo texto={h.impacto === "alto" ? "Crítico" : "Atención"} tono={h.impacto === "alto" ? "alto" : "espera"} />
          </span>
        </div>
        {h.causa && <p className="t-cuerpo mt-2"><span style={{ color: "var(--grafito)" }}>Qué vemos: </span>{h.causa}</p>}
        {h.costo_posible && <p className="t-cuerpo mt-1"><span style={{ color: "var(--grafito)" }}>Qué puede estar costando: </span>{h.costo_posible}</p>}
        {h.recomendacion && <p className="t-cuerpo mt-1"><span style={{ color: "var(--grafito)" }}>Por dónde tomarlo: </span>{h.recomendacion}</p>}
        {doc && (
          <p className="t-cuerpo mt-1">
            <span style={{ color: "var(--grafito)" }}>Se resuelve con: </span>
            <strong>{doc.nombre}</strong>
            <Link href={`/portal/activos?doc=${doc.clave}`} className="no-imprimir t-dato enlace-texto enlace-texto--acero" style={{ marginLeft: 8 }}>construirlo</Link>
          </p>
        )}
        {fuentes && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Evidencia: {fuentes}</p>}
      </article>
    );
  };

  return (
    <>
      <style>{`@media print { @page { margin: 16mm; } }`}</style>

      <div className="no-imprimir flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="t-titulo">Tu informe de diagnóstico</h1>
        <BotonImprimir texto="Descargar PDF (imprimir)" />
      </div>

      <article className="panel p-6" style={{ maxWidth: 820 }}>
        <header className="informe-cabeza">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`Logo de ${empresa?.nombre}`} className="informe-cabeza__logo" />
          )}
          <p className="t-etiqueta">INFORME DE DIAGNÓSTICO EMPRESARIAL</p>
          <h2 className="t-titulo mt-2">{empresa?.nombre}</h2>
          <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
            {[empresa?.sector, ficha.ciudad, ficha.personas ? `${ficha.personas} personas` : null].filter(Boolean).join(" · ")}
          </p>
          <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Versión 1.0 · {fecha} · Elaborado por RENASER con la información de la propia empresa</p>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h3 className="t-seccion mb-2">Resumen</h3>
          {resumenFugas.caja && (
            <p className="t-cuerpo">
              {resumenFugas.caja[0]}<strong style={{ color: "var(--contradicho)" }}>{resumenFugas.caja[1]}</strong>{resumenFugas.caja[2]}
            </p>
          )}
          {resumenFugas.oportunidad && (
            <p className="t-cuerpo mt-1">
              {resumenFugas.oportunidad[0]}<strong>{resumenFugas.oportunidad[1]}</strong>{resumenFugas.oportunidad[2]}
            </p>
          )}
          <p className="t-cuerpo mt-1">
            Se encontraron <strong>{cuantos(criticos.length + otros.length, "hallazgo", "hallazgos")}</strong> ({cuantos(criticos.length, "crítico", "críticos")}) y <strong>{cuantos(fortalezas.length, "fortaleza", "fortalezas")}</strong> que conviene proteger.
            {hoy.porConfirmar.length > 0 && (
              <>
                {" "}Además hay{" "}
                {deDocumentos.length > 0 && (
                  <>
                    <strong>{cuantos(deDocumentos.length, "señal provisional", "señales provisionales")}</strong>, vista{deDocumentos.length === 1 ? "" : "s"} en documentos que nadie confirmó
                  </>
                )}
                {deDocumentos.length > 0 && sinConcluir.length > 0 && ", y "}
                {sinConcluir.length > 0 && (
                  <>
                    {/* «Por otra razón» solo si antes se dijo una: sin señales de documentos no hay primera razón. */}
                    <strong>{cuantos(sinConcluir.length, "punto", "puntos")}</strong> que todavía no {sinConcluir.length === 1 ? "es" : "son"} conclusión{deDocumentos.length > 0 ? " por otra razón" : ""}
                  </>
                )}
                {hoy.porConfirmar.length === 1 ? ": se lista aparte y no cuenta como hallazgo." : ": se listan aparte y no cuentan como hallazgos."}
              </>
            )}
          </p>
          {hoy.restriccion && (
            <p className="t-cuerpo mt-2">
              <span style={{ color: "var(--grafito)" }}>Lo que más frena el siguiente nivel: </span><strong>{hoy.restriccion.titulo}</strong>
            </p>
          )}
        </section>

        {hayAlgoEnLasBolsas(fugas) && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">De dónde sale cada cifra</h3>
            <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>Tres cuentas separadas, que no se suman.</p>
            <BolsasDeFugas fugas={fugas} Encabezado="h4" />
          </section>
        )}

        <section style={{ marginBottom: 24 }}>
          <h3 className="t-seccion mb-2">Estado por área</h3>
          <table className="tabla">
            <thead>
              <tr><th>Área</th><th>Estado</th><th>Lectura</th></tr>
            </thead>
            <tbody>
              {hoy.pilares.map((p) => (
                <tr key={p.pilar}>
                  <td className="t-dato fuerte">{PILAR_CLIENTE[p.pilar] ?? p.pilar}</td>
                  <td><span className={`estado ${SELLO_AREA[p.estado] ?? "neutro"}`}>{ESTADO_TEXTO[p.estado] ?? ESTADO_PILAR[p.estado]}</span></td>
                  <td style={{ color: "var(--grafito)" }}>{p.resumen ?? "Falta información para una conclusión responsable."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {criticos.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">Hallazgos críticos</h3>
            {criticos.map((h, i) => <Hallazgo key={h.id} h={h} n={i + 1} />)}
          </section>
        )}

        {otros.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">Otros hallazgos</h3>
            {otros.map((h, i) => <Hallazgo key={h.id} h={h} n={criticos.length + i + 1} />)}
          </section>
        )}

        {seccionProvisional({
          titulo: "Lo que vimos en los documentos y falta confirmar",
          intro: "No son conclusiones: salen de documentos que aún nadie confirmó. Se incluyen para que se revisen, no para que se actúe sobre ellas.",
          items: deDocumentos,
        })}
        {seccionProvisional({
          titulo: "Lo que todavía no se da por conclusión",
          intro: "No son conclusiones todavía: cada punto dice por qué. Se incluyen para que se sepan, no para que se actúe sobre ellos.",
          items: sinConcluir,
          conMotivo: true,
        })}

        {fortalezas.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">Fortalezas que no se deben romper</h3>
            <ul className="lista-editorial">
              {fortalezas.map((f) => (
                <li key={f.id}>
                  <span className="t-cuerpo fuerte">{f.titulo}</span>
                  {f.recomendacion && <span className="block t-dato" style={{ color: "var(--grafito)" }}>Cómo protegerla: {f.recomendacion}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Una fortaleza que todavía no es conclusión se imprime aparte, con su porqué: ni cuenta en el resumen ni se protege todavía. */}
        {seccionProvisional({
          titulo: "Fortalezas por confirmar",
          intro: "Parecen fortalezas, pero todavía no se dan por ciertas: cada una dice por qué. No cuentan entre las fortalezas del resumen.",
          items: hoy.fortalezasPorConfirmar,
          conMotivo: true,
        })}

        {hoy.tentativo.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h3 className="t-seccion mb-2">Por dónde empezar</h3>
            <ol className="lista-editorial">
              {hoy.tentativo.map((p) => (
                <li key={p.n}>
                  <span className="t-cuerpo fuerte">{p.n}. {p.problema}</span>
                  <span className="block t-dato" style={{ color: "var(--grafito)" }}>Primer movimiento: {p.primerMovimiento}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer style={{ borderTop: "1px solid var(--linea)", paddingTop: 14 }}>
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            Todo lo que dice este informe sale de lo que la empresa contó o mostró, con su fuente indicada. Donde no hubo dato,
            se dice «sin dato» en vez de suponerlo. El informe se actualiza solo con cada nueva información que entra.
          </p>
        </footer>
      </article>
    </>
  );
}

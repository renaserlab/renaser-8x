import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { proyeccionPerdida } from "@/lib/perdida";
import type { Metrica } from "@/lib/rules/anomalias";
import { PILAR_CLIENTE, ESTADO_PILAR } from "@/lib/textos";
import { documentoQueResuelve } from "@/lib/biblioteca";
import { BotonImprimir } from "@/components/base/BotonImprimir";

export const dynamic = "force-dynamic";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const ESTADO_COLOR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };
const ESTADO_TEXTO: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Información insuficiente" };

/**
 * INFORME DE DIAGNÓSTICO — el documento formal de hallazgos que el dueño descarga sin depender de
 * que el consultor lo publique (pedido de Kelin: "leí el diagnóstico de Qori pero no hay dónde
 * descargarlo"). Cada hallazgo trae su evidencia y EL DOCUMENTO QUE LO RESUELVE: el puente del "¿cómo?".
 */
export default async function Informe() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [hoy, { data: metricasRaw }, { data: empresa }] = await Promise.all([
    empresaHoy(c.companyId),
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(80),
    sb.from("companies").select("nombre,sector,ficha").eq("id", c.companyId).single(),
  ]);
  const perdida = proyeccionPerdida((metricasRaw ?? []) as Metrica[]);
  const ficha = (empresa?.ficha ?? {}) as Record<string, string>;
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const todos = [hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter(Boolean) as HallazgoHoy[];
  const criticos = todos.filter((h) => h.impacto === "alto" && !h.preserva);
  const otros = todos.filter((h) => h.impacto !== "alto" && !h.preserva);
  const fortalezas = hoy.fortalezas ?? [];

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

  const Hallazgo = ({ h, n }: { h: HallazgoHoy; n: number }) => {
    const doc = documentoQueResuelve(h);
    const color = h.impacto === "alto" ? "var(--contradicho)" : "var(--caducado)";
    const fuentes = h.evidencia.map((e) => e.fuente).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
    return (
      <article style={{ borderTop: "1px solid var(--linea)", paddingTop: 16, marginBottom: 18, breakInside: "avoid" }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-hero" style={{ fontSize: 18, minWidth: 0 }}>{n}. {h.titulo}</h3>
          <span className="t-dato" style={{ flex: "none", fontSize: 11.5, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: "var(--radio)", padding: "2px 10px" }}>
            {h.impacto === "alto" ? "Crítico" : "Atención"}
          </span>
        </div>
        {h.causa && <p className="t-cuerpo mt-2"><span style={{ color: "var(--grafito)" }}>Qué vemos: </span>{h.causa}</p>}
        {h.costo_posible && <p className="t-cuerpo mt-1"><span style={{ color: "var(--grafito)" }}>Qué puede estar costando: </span>{h.costo_posible}</p>}
        {h.recomendacion && <p className="t-cuerpo mt-1"><span style={{ color: "var(--grafito)" }}>Por dónde tomarlo: </span>{h.recomendacion}</p>}
        {doc && (
          <p className="t-cuerpo mt-1">
            <span style={{ color: "var(--grafito)" }}>Se resuelve con: </span>
            <strong>{doc.nombre}</strong>
            <Link href={`/portal/activos?doc=${doc.clave}`} className="no-imprimir t-dato" style={{ marginLeft: 8, color: "var(--marca)", textDecoration: "underline" }}>construirlo</Link>
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
        <header style={{ borderBottom: "2px solid var(--tinta)", paddingBottom: 18, marginBottom: 20 }}>
          {ficha.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ficha.logo_url} alt={`Logo de ${empresa?.nombre}`} style={{ maxHeight: 56, marginBottom: 12 }} />
          )}
          <p className="t-etiqueta" style={{ letterSpacing: "0.14em" }}>INFORME DE DIAGNÓSTICO EMPRESARIAL</p>
          <h2 className="t-hero mt-2" style={{ fontSize: "clamp(24px, 4vw, 32px)" }}>{empresa?.nombre}</h2>
          <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
            {[empresa?.sector, ficha.ciudad, ficha.personas ? `${ficha.personas} personas` : null].filter(Boolean).join(" · ")}
          </p>
          <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Versión 1.0 · {fecha} · Elaborado por RENASER con la información de la propia empresa</p>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h3 className="t-seccion mb-2">Resumen</h3>
          {perdida.totalMensual > 0 && (
            <p className="t-cuerpo">
              Según los números que la empresa contó, hay del orden de <strong style={{ color: "var(--contradicho)" }}>{soles(perdida.totalMensual)} al mes</strong> en riesgo.
            </p>
          )}
          <p className="t-cuerpo mt-1">
            Se encontraron <strong>{criticos.length + otros.length} hallazgos</strong> ({criticos.length} críticos) y <strong>{fortalezas.length} fortalezas</strong> que conviene proteger.
          </p>
          {hoy.restriccion && (
            <p className="t-cuerpo mt-2">
              <span style={{ color: "var(--grafito)" }}>Lo que más frena el siguiente nivel: </span><strong>{hoy.restriccion.titulo}</strong>
            </p>
          )}
        </section>

        {perdida.fugas.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">De dónde sale el dinero en riesgo</h3>
            <ul className="lista-editorial">
              {perdida.fugas.map((f, i) => (
                <li key={i}>
                  <span className="t-cuerpo" style={{ fontWeight: 550 }}>{f.concepto} · {soles(f.monto)}{f.mensual ? "/mes" : ""}</span>
                  <span className="block t-dato" style={{ color: "var(--grafito)" }}>De dónde sale: {f.base}.</span>
                </li>
              ))}
            </ul>
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
                  <td className="t-dato" style={{ fontWeight: 600 }}>{PILAR_CLIENTE[p.pilar] ?? p.pilar}</td>
                  <td className="t-dato" style={{ color: ESTADO_COLOR[p.estado] }}>{ESTADO_TEXTO[p.estado] ?? ESTADO_PILAR[p.estado]}</td>
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

        {fortalezas.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="t-seccion mb-2">Fortalezas que no se deben romper</h3>
            <ul className="lista-editorial">
              {fortalezas.map((f) => (
                <li key={f.id}>
                  <span className="t-cuerpo" style={{ fontWeight: 550 }}>{f.titulo}</span>
                  {f.recomendacion && <span className="block t-dato" style={{ color: "var(--grafito)" }}>Cómo protegerla: {f.recomendacion}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hoy.tentativo.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h3 className="t-seccion mb-2">Por dónde empezar</h3>
            <ol className="lista-editorial">
              {hoy.tentativo.map((p) => (
                <li key={p.n}>
                  <span className="t-cuerpo" style={{ fontWeight: 550 }}>{p.n}. {p.problema}</span>
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

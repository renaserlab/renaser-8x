import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { proyeccionPerdida } from "@/lib/perdida";
import { caminosDesdeHallazgos } from "@/lib/caminos";
import type { Metrica } from "@/lib/rules/anomalias";
import { ESTADO_PILAR, PILAR_CLIENTE, fechaMes } from "@/lib/textos";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };
const ESTADO_CLIENTE_PILAR: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Información insuficiente" };
const CLASE_NOMBRE: Record<string, string> = { documento: "Tus documentos", equipo: "Tu equipo", datos: "Tus datos", dueno: "Tú" };

/**
 * Tarjeta para el EMPRESARIO: el titular y UNA línea (lo que cuesta, o la causa en corto).
 * El expediente completo — causa, recomendación, fuentes — vive en "Ver más".
 * Feedback real: "yo como empresario no necesito tanto detalle; tú como consultor sí".
 */
function Insight({ h, n }: { h: HallazgoHoy; n?: number }) {
  const linea = h.costo_posible ?? h.causa ?? null;
  const acento = h.preserva ? "var(--confirmado)" : h.impacto === "alto" ? "var(--contradicho)" : "var(--caducado)";
  return (
    // Lista editorial: título en serif con su punto de color — sin cajitas repetidas.
    <article style={{ paddingLeft: 18, position: "relative" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 9, width: 8, height: 8, borderRadius: "50%", background: acento }} />
      <h3 className="t-hero" style={{ fontSize: 20 }}>{n ? `${n}. ` : ""}{h.titulo}</h3>
      {linea && <p className="t-cuerpo mt-1 medida" style={{ color: "var(--grafito)" }}>{linea}</p>}
      <details className="mt-1">
        <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Ver más</summary>
        <div className="mt-2 flex flex-col gap-2">
          {h.causa && h.causa !== linea && <p className="t-cuerpo medida"><span style={{ color: "var(--grafito)" }}>Qué vemos: </span>{h.causa}</p>}
          {h.costo_posible && h.costo_posible !== linea && <p className="t-cuerpo medida"><span style={{ color: "var(--grafito)" }}>Qué puede estar costando: </span>{h.costo_posible}</p>}
          {h.recomendacion && <p className="t-cuerpo medida"><span style={{ color: "var(--grafito)" }}>{h.preserva ? "Cómo protegerla: " : "Por dónde tomarlo: "}</span>{h.recomendacion}</p>}
          {h.evidencia.length > 0 && (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Según {h.evidencia.map((e) => e.fuente).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</p>
          )}
        </div>
      </details>
    </article>
  );
}

/** MI EMPRESA HOY: el diagnóstico vivo. El empresario recibe valor sin esperar a nadie. */
export default async function Hoy() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const [hoy, { data: metricasRaw }] = await Promise.all([
    empresaHoy(c.companyId),
    supabaseAdmin().from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(80),
  ]);
  const perdida = proyeccionPerdida((metricasRaw ?? []) as Metrica[]);
  const caminos = caminosDesdeHallazgos([hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter(Boolean) as HallazgoHoy[]);
  const altos = hoy.noVes.filter((h) => h.impacto === "alto" && h.id !== hoy.restriccion?.id);
  const resto = hoy.noVes.filter((h) => h.impacto !== "alto" && h.id !== hoy.restriccion?.id);

  if (hoy.nivel === 0)
    return (
      <>
        <p className="t-etiqueta">Mi empresa hoy</p>
        <h1 className="t-titulo mt-2 mb-4 medida">Todavía no tenemos con qué mirar tu empresa</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          Cuéntanos cómo funciona o sube lo que tengas —una foto del cuaderno sirve— y aquí empezará a aparecer lo que vayamos entendiendo.
        </p>
        <Link className="boton" href="/portal/conversacion">Empezar a contar</Link>
      </>
    );

  return (
    <div className="flex flex-col gap-12 lienzo">
      <header>
        <p className="t-etiqueta">Mi empresa hoy</p>
        <h1 className="t-titulo mt-2 medida">{c.empresa?.nombre}</h1>
        <p className="t-cuerpo mt-3 medida" style={{ color: "var(--grafito)" }}>
          Esto es lo que entendimos hasta ahora, con su fuente. Se actualiza con cada cosa que nos cuentas o subes.
          {hoy.stats.porValidar > 0 && (
            <> Hay <Link href="/portal/validar" style={{ textDecoration: "underline" }}>{hoy.stats.porValidar} punto(s) esperando tu confirmación</Link>: con eso la foto se afina.</>
          )}
        </p>
      </header>

      {/* LA PLATA COMO HÉROE: una afirmación en grande, no una cajita más. */}
      {perdida.fugas.length > 0 && (
        <section>
          <p className="t-etiqueta mb-2">Lo que tus números dicen que podrías estar perdiendo</p>
          {perdida.totalMensual > 0 && (
            <p className="num-grande" style={{ color: "var(--contradicho)", fontSize: "clamp(38px, 8vw, 56px)" }}>
              ~{soles(perdida.totalMensual)} <span className="t-cuerpo" style={{ color: "var(--grafito)", fontFamily: "var(--font-ui)" }}>al mes</span>
            </p>
          )}
          <ul className="lista-editorial mt-4">
            {perdida.fugas.map((f, i) => (
              <li key={i}>
                <span className="t-cuerpo" style={{ fontWeight: 550 }}>{f.concepto} · {soles(f.monto)}{f.mensual ? "/mes" : ""}</span>
                <span className="block t-dato" style={{ color: "var(--grafito)" }}>De dónde sale: {f.base}.</span>
              </li>
            ))}
          </ul>
          <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>Calculado solo con lo que tú contaste o mostraste — nada está inventado.</p>
        </section>
      )}

      {hoy.restriccion && (
        <section>
          <h2 className="t-seccion mb-1">Lo que más está frenando el siguiente nivel</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Con lo visto hasta ahora. Puede cambiar si aparece nueva información.</p>
          <Insight h={hoy.restriccion} />
          {hoy.secundarias.length > 0 && (
            <p className="t-dato mt-3 medida" style={{ color: "var(--grafito)" }}>
              También pesan: {hoy.secundarias.map((s) => s.titulo).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* LOS CAMINOS: lo que la empresa necesita, ofrecido como pregunta. */}
      {caminos.length > 0 && (
        <section>
          <h2 className="t-seccion mb-3">¿Por dónde quieres empezar?</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {caminos.map((k) => (
              <Link key={k.pregunta} href={k.href} className="panel p-5 flex flex-col gap-2" style={{ borderColor: "var(--marca)" }}>
                <span className="t-seccion" style={{ fontSize: 17 }}>{k.pregunta}</span>
                <span className="t-dato" style={{ color: "var(--grafito)" }}>{k.detalle}</span>
                <span className="t-dato" style={{ color: "var(--marca)", fontWeight: 600, marginTop: "auto" }}>Empezar →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {hoy.espejo.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>El espejo · {hoy.espejo.length} punto{hoy.espejo.length === 1 ? "" : "s"} donde una fuente contradice a otra</summary>
          <p className="t-dato mt-2 mb-4 medida" style={{ color: "var(--grafito)" }}>Aquí suele estar lo más valioso.</p>
          <div className="flex flex-col gap-4">
            {hoy.espejo.map((e, i) => (
              <div key={i} className="panel p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="t-etiqueta">{CLASE_NOMBRE[e.declarado.clase]}{e.declarado.fecha ? ` · ${fechaMes(e.declarado.fecha)}` : ""}</p>
                    <p className="t-cuerpo mt-1">{e.declarado.texto}</p>
                  </div>
                  <div>
                    <p className="t-etiqueta">{CLASE_NOMBRE[e.contraste.clase]}{e.contraste.fecha ? ` · ${fechaMes(e.contraste.fecha)}` : ""}</p>
                    <p className="t-cuerpo mt-1">{e.contraste.texto}</p>
                  </div>
                </div>
                <p className="t-dato mt-3" style={{ color: e.resuelto ? "var(--confirmado)" : "var(--caducado)" }}>
                  {e.resuelto ? "Resuelto contigo." : "Pendiente de tu confirmación."}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* SOLO LOS PROBLEMAS DE VERDAD al frente; el resto, plegado. Feedback de la demo: "no tengo tiempo de leer tanto". */}
      {altos.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Lo que de verdad importa</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Cada punto sale de tu propia información. Nada está inventado.</p>
          <div className="flex flex-col gap-4">
            {altos.map((h) => (
              <Insight key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}
      {resto.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>Ver {resto.length} hallazgo{resto.length === 1 ? "" : "s"} más</summary>
          <div className="flex flex-col gap-4 mt-4">
            {resto.map((h) => (
              <Insight key={h.id} h={h} />
            ))}
          </div>
        </details>
      )}

      {hoy.fortalezas.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>Lo que no debes romper · {hoy.fortalezas.length} fortaleza{hoy.fortalezas.length === 1 ? "" : "s"}</summary>
          <div className="flex flex-col gap-4 mt-4">
            {hoy.fortalezas.map((h) => (
              <Insight key={h.id} h={h} />
            ))}
          </div>
        </details>
      )}

      {hoy.caleta.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>Lo que tu gente sabe (y no está escrito) · {hoy.caleta.length}</summary>
          <ul className="flex flex-col gap-3 mt-4">
            {hoy.caleta.map((k, i) => (
              <li key={i} className="panel p-4">
                <p className="t-etiqueta">{k.puesto ?? "Una persona del equipo"}{k.critico ? " · crítica" : ""}{k.documentado ? "" : " · aún no escrita"}</p>
                <p className="t-cuerpo mt-1 medida">{k.situacion ?? k.regla ?? k.senal}</p>
                {k.senal && k.situacion && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>La señal: {k.senal}{k.regla ? " · La regla: " + k.regla : ""}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h2 className="t-seccion mb-2">Tu empresa, por áreas</h2>
        <div className="grid sm:grid-cols-2" style={{ columnGap: 32 }}>
          {hoy.pilares.map((p) => (
            <div key={p.pilar} style={{ borderTop: "1px solid var(--linea)", padding: "14px 0" }}>
              <div className="flex items-center justify-between gap-3">
                <span className="t-seccion" style={{ fontSize: 17 }}>{PILAR_CLIENTE[p.pilar] ?? p.pilar}</span>
                <span className="t-dato" style={{ color: ESTADO_COLOR[p.estado] }}>{ESTADO_CLIENTE_PILAR[p.estado] ?? ESTADO_PILAR[p.estado]}</span>
              </div>
              {p.resumen && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{p.resumen}</p>}
              {p.estado === "desconocido" && !p.resumen && (
                <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                  Aún nos faltan piezas para una conclusión responsable.{" "}
                  <Link href="/portal/conversacion" style={{ textDecoration: "underline", color: "var(--marca)" }}>Sigue conversando</Link> o completa{" "}
                  <Link href="/portal/activos" style={{ textDecoration: "underline", color: "var(--marca)" }}>Tu información</Link> — esta parte se llena sola con eso.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {hoy.sistematizar.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Qué ordenaría primero</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Lo que hoy depende de la memoria o de una persona, convertido en sistema.</p>
          <ul className="lista-editorial">
            {hoy.sistematizar.map((s, i) => (
              <li key={i}>
                <span className="t-cuerpo" style={{ fontWeight: 550 }}>{s.nombre}</span>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{s.motivo}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hoy.tentativo.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Por dónde empezaría</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Un punto de partida, no un plan definitivo. Pocas cosas, bien elegidas.</p>
          <ol className="lista-editorial">
            {hoy.tentativo.map((p) => (
              <li key={p.n}>
                <h3 className="t-hero" style={{ fontSize: 19 }}>{p.n}. {p.problema}</h3>
                {p.porQue && <p className="t-cuerpo mt-2 medida"><span style={{ color: "var(--grafito)" }}>Por qué importa: </span>{p.porQue}</p>}
                <p className="t-cuerpo mt-2 medida"><span style={{ color: "var(--grafito)" }}>Primer movimiento: </span>{p.primerMovimiento}</p>
                {p.indicador && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Para saber que funciona: {p.indicador}</p>}
              </li>
            ))}
          </ol>
          <div className="panel p-5 mt-8" style={{ background: "var(--suave)", border: "none" }}>
            <p className="t-cuerpo medida">Esto es un diagnóstico inicial. Convertir estas prioridades en sistemas que funcionen sin depender de la memoria es el trabajo que sigue.</p>
            <Link href="/portal/conversacion" className="boton boton--secundario mt-4" style={{ display: "inline-flex" }}>Quiero trabajar este plan</Link>
          </div>
        </section>
      )}

      {hoy.nivel < 3 && (
        <section className="panel p-5" style={{ background: "var(--suave)", border: "none" }}>
          <p className="t-cuerpo medida">
            Todavía nos faltan piezas para darte una conclusión responsable sobre {hoy.pilares.filter((p) => p.estado === "desconocido").map((p) => PILAR_CLIENTE[p.pilar] ?? p.pilar).join(", ") || "algunas áreas"}.
            {" "}Sigue <Link href="/portal/conversacion" style={{ textDecoration: "underline" }}>contándonos</Link> o <Link href="/portal/documentos" style={{ textDecoration: "underline" }}>sube lo que tengas</Link>: la foto se completa sola.
          </p>
        </section>
      )}
    </div>
  );
}

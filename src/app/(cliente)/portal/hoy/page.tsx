import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { proyeccionPerdida } from "@/lib/perdida";
import { caminosDesdeHallazgos } from "@/lib/caminos";
import type { Metrica } from "@/lib/rules/anomalias";
import { ESTADO_PILAR, PILAR_CLIENTE, fechaMes } from "@/lib/textos";
import { TarjetaHallazgo } from "@/components/cliente/TarjetaHallazgo";
import { VerMasLateral } from "@/components/base/VerMasLateral";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };
const ESTADO_CLIENTE_PILAR: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Información insuficiente" };
const CLASE_NOMBRE: Record<string, string> = { documento: "Tus documentos", equipo: "Tu equipo", datos: "Tus datos", dueno: "Tú" };


/** Caja del árbol de la venta: número contado/verificado, o la invitación a contarlo. */
function Caja({ titulo, dato, ancho }: { titulo: string; dato: { texto: string; estado: string } | null; ancho?: boolean }) {
  return (
    <div style={{ border: `1.5px solid ${dato ? "var(--marca)" : "var(--linea)"}`, borderRadius: "var(--radio)", padding: "8px 12px", textAlign: "center", background: dato ? "color-mix(in srgb, var(--marca) 6%, var(--papel))" : "var(--papel)", minWidth: 0, ...(ancho ? { maxWidth: 260, margin: "0 auto" } : {}) }}>
      <p className="t-etiqueta" style={{ fontSize: 11 }}>{titulo}</p>
      {dato ? (
        <>
          <p className="t-dato" style={{ fontWeight: 700, fontSize: 17 }}>{dato.texto}</p>
          <p className="t-dato" style={{ fontSize: 11, color: "var(--grafito)" }}>{dato.estado === "verificado" ? "verificado" : "contado"}</p>
        </>
      ) : (
        <Link href="/portal/conversacion" className="t-dato" style={{ fontSize: 12.5, color: "var(--marca)", textDecoration: "underline" }}>sin dato — cuéntanoslo</Link>
      )}
    </div>
  );
}
function Conector({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ width: "100%", height: 18, display: "block" }} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--linea)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** ÁRBOL DE TU VENTA: de dónde sale el dinero, con lo contado — y "sin dato" como invitación, nunca inventado. */
function ArbolVentas({ metricas }: { metricas: Metrica[] }) {
  const buscar = (re: RegExp) => {
    const m = [...metricas].filter((x) => re.test(x.clave.toLowerCase())).sort((a, b) => (b.periodo ?? "").localeCompare(a.periodo ?? ""))[0];
    if (!m || m.valor == null) return null;
    return { texto: soles(Number(m.valor)), estado: m.estado };
  };
  const buscarNum = (re: RegExp) => {
    const m = [...metricas].filter((x) => re.test(x.clave.toLowerCase())).sort((a, b) => (b.periodo ?? "").localeCompare(a.periodo ?? ""))[0];
    if (!m || m.valor == null) return null;
    return { texto: String(m.valor), estado: m.estado };
  };
  const venta = buscar(/venta|factur|ingreso/);
  const clientes = buscarNum(/client|pacient|atendid/);
  const ticket = buscar(/ticket|promedio/);
  const interesados = buscarNum(/lead|interesad|prospect|contact/);
  const compran = buscarNum(/conversi|cierr|compran/);
  return (
    <section className="panel p-5">
      <p className="t-etiqueta mb-3">De dónde sale tu venta</p>
      <Caja titulo="Ventas del mes" dato={venta} ancho />
      <Conector d="M50,0 V8 M25,8 H75 M25,8 V20 M75,8 V20" />
      <div className="grid grid-cols-2 gap-3">
        <Caja titulo="Clientes que te compran" dato={clientes} />
        <Caja titulo="Lo que gasta cada uno" dato={ticket} />
      </div>
      <div className="grid grid-cols-2" style={{ columnGap: 12 }}>
        <div>
          <Conector d="M50,0 V8 M25,8 H75 M25,8 V20 M75,8 V20" />
          <div className="grid grid-cols-2 gap-3">
            <Caja titulo="Interesados que llegan" dato={interesados} />
            <Caja titulo="De cada 10, compran" dato={compran} />
          </div>
        </div>
        <div aria-hidden="true" />
      </div>
      <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>Cada casilla con dato mueve la de arriba. Las vacías son lo primero que conviene contar.</p>
    </section>
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
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="t-titulo medida">{c.empresa?.nombre}</h1>
        <p className="t-cuerpo mt-3 medida" style={{ color: "var(--grafito)" }}>
          Lo que entendimos hasta ahora, con su fuente.
          {hoy.stats.porValidar > 0 && (
            <> <Link href="/portal/validar" style={{ textDecoration: "underline" }}>{hoy.stats.porValidar} punto(s) esperan tu confirmación</Link>.</>
          )}
          {" "}<Link href="/portal/resultados" style={{ textDecoration: "underline" }}>Ver el informe completo</Link>.
        </p>
      </header>

      {/* EL DINERO COMO HÉROE: una afirmación en grande, no una cajita más. */}
      {perdida.fugas.length > 0 && (
        <section>
          <p className="t-etiqueta mb-2">Lo que tus números dicen que podrías estar perdiendo</p>
          {perdida.totalMensual > 0 && (
            <p className="num-grande" style={{ color: "var(--contradicho)", fontSize: "clamp(30px, 6vw, 40px)" }}>
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
          <TarjetaHallazgo h={hoy.restriccion} />
          {hoy.secundarias.length > 0 && (
            <p className="t-dato mt-3 medida" style={{ color: "var(--grafito)" }}>
              También pesan: {hoy.secundarias.map((s) => s.titulo).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* EL ÁRBOL DE LA VENTA: gráfico, con lo contado; lo vacío invita a contarlo. */}
      {(metricasRaw ?? []).length > 0 && <ArbolVentas metricas={(metricasRaw ?? []) as Metrica[]} />}

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
          <div className="grid gap-4 lg:grid-cols-2">
            {altos.map((h) => (
              <TarjetaHallazgo key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}
      {resto.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>Ver {resto.length} hallazgo{resto.length === 1 ? "" : "s"} más</summary>
          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            {resto.map((h) => (
              <TarjetaHallazgo key={h.id} h={h} />
            ))}
          </div>
        </details>
      )}

      {hoy.fortalezas.length > 0 && (
        <details>
          <summary className="t-seccion" style={{ cursor: "pointer", fontSize: 18 }}>Lo que no debes romper · {hoy.fortalezas.length} fortaleza{hoy.fortalezas.length === 1 ? "" : "s"}</summary>
          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            {hoy.fortalezas.map((h) => (
              <TarjetaHallazgo key={h.id} h={h} />
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
        <h2 className="t-seccion mb-3">Tu empresa, por áreas</h2>
        <div className="grid grid-cols-2 gap-3">
          {hoy.pilares.map((p) => {
            const color = ESTADO_COLOR[p.estado];
            return (
              <div key={p.pilar} style={{ borderRadius: "var(--radio)", border: `1.5px solid ${p.estado === "desconocido" ? "var(--linea)" : color}`, background: p.estado === "desconocido" ? "var(--papel)" : `color-mix(in srgb, ${color} 8%, var(--papel))`, padding: "14px 16px" }}>
                <p className="t-etiqueta">{PILAR_CLIENTE[p.pilar] ?? p.pilar}</p>
                <p className="t-dato" style={{ fontWeight: 700, fontSize: 16, color: p.estado === "desconocido" ? "var(--grafito)" : color }}>{ESTADO_CLIENTE_PILAR[p.estado] ?? ESTADO_PILAR[p.estado]}</p>
                {p.resumen && <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 13 }}>{p.resumen}</p>}
                {p.estado === "desconocido" && !p.resumen && (
                  <Link href="/portal/conversacion" className="t-dato" style={{ fontSize: 13, color: "var(--marca)", textDecoration: "underline" }}>faltan piezas — conversemos</Link>
                )}
              </div>
            );
          })}
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
          <div className="flex flex-col gap-3">
            {hoy.tentativo.map((p) => (
              <article key={p.n} className="panel p-5 flex gap-4">
                <span className="t-dato" aria-hidden="true" style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, background: "var(--marca)", color: "var(--papel)" }}>{p.n}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 className="t-hero" style={{ fontSize: 18 }}>{p.problema}</h3>
                  <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Primer movimiento: {p.primerMovimiento}</p>
                  {(p.porQue || p.indicador) && (
                    <div className="mt-1">
                      <VerMasLateral titulo={p.problema}>
                        <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>Primer movimiento: {p.primerMovimiento}</p>
                        {p.porQue && <p className="t-cuerpo mb-2"><span style={{ color: "var(--grafito)" }}>Por qué importa: </span>{p.porQue}</p>}
                        {p.indicador && <p className="t-dato" style={{ color: "var(--grafito)" }}>Para saber que funciona: {p.indicador}</p>}
                      </VerMasLateral>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
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

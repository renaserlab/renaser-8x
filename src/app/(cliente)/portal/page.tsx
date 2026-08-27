import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { tableroEmpresario, type PuntoVenta } from "@/lib/tablero";
import { proyeccionPerdida } from "@/lib/perdida";
import { caminosDesdeHallazgos } from "@/lib/caminos";
import type { Metrica } from "@/lib/rules/anomalias";
import { CrearEmpresa } from "@/components/cliente/CrearEmpresa";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — híbrido (elegido por la dueña del producto, 2026-08-27)
THESIS: el despacho matinal del consultor — tres lecturas de instrumento y UNA voz que dice lo que
  el dueño no está viendo, con su número. Rechaza el inicio-catálogo de tarjetas equivalentes.
OWN-WORLD: tokens 8X — fondo gris frío, hairlines, numerales tabulares, serif solo para la voz del
  agente, un único elemento de acción en color de marca. Sin gauges, sin barras, sin tarjetas por dato.
STORY: entiendo en 10 segundos qué me está costando, decido si le dedico 10 minutos ahora.
FIRST VIEWPORT: franja de instrumentos (en riesgo · entendido · sistematizado) → lectura del agente
  en serif con su fuente → un botón. Debajo, las 3 fases del método y la gráfica real si existe.
FINISH: nada inventado; "sin dato" invita a contarlo.
*/

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const MES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const mesCorto = (p: string) => MES[Number(p.slice(5, 7))] ?? p;

/** Línea de ventas mes a mes + la referencia de la mejor época. Solo datos contados: nada decorativo. */
function GraficaVentas({ serie, dorada }: { serie: PuntoVenta[]; dorada: number | null }) {
  const W = 420, H = 172, X0 = 14, X1 = 406, YTOP = 34, YBASE = 138;
  const max = Math.max(...serie.map((p) => p.valor), dorada ?? 0) || 1;
  const min = Math.min(...serie.map((p) => p.valor));
  const x = (i: number) => (serie.length === 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * i) / (serie.length - 1));
  const y = (v: number) => YBASE - ((YBASE - YTOP) * (v - Math.min(min, 0))) / (max - Math.min(min, 0) || 1);
  const pts = serie.map((p, i) => `${x(i)},${y(p.valor).toFixed(1)}`).join(" ");
  const ult = serie[serie.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 680 }} role="img" aria-label="Ventas por mes">
      {dorada != null && (
        <>
          <line x1={X0} y1={y(dorada)} x2={X1} y2={y(dorada)} stroke="var(--caducado)" strokeWidth="1.5" strokeDasharray="6 5" />
          <text x={X0 + 2} y={y(dorada) - 6} fontSize="11" fill="var(--caducado)">tu mejor época: {soles(dorada)}</text>
        </>
      )}
      <line x1={X0} y1={YBASE} x2={X1} y2={YBASE} stroke="var(--linea)" />
      <polyline points={pts} fill="none" stroke="var(--marca)" strokeWidth="2.5" strokeLinejoin="round" />
      {serie.map((p, i) => (
        <circle key={p.periodo} cx={x(i)} cy={y(p.valor)} r={i === serie.length - 1 ? 4.5 : 4} fill="var(--marca)" />
      ))}
      {serie.map((p, i) => (
        <text key={p.periodo + "t"} x={x(i)} y={H - 14} fontSize="11" fill="var(--grafito)" textAnchor="middle">{mesCorto(p.periodo)}</text>
      ))}
      {ult && <text x={x(serie.length - 1)} y={y(ult.valor) - 10} fontSize="11.5" fontWeight="600" fill="var(--tinta)" textAnchor="end">{soles(ult.valor)}</text>}
    </svg>
  );
}

/** Una lectura de instrumento: número tabular grande, etiqueta debajo. Sin caja: la franja es el instrumento. */
function Lectura({ valor, unidad, etiqueta, color }: { valor: string; unidad?: string; etiqueta: string; color?: string }) {
  return (
    <div style={{ padding: "14px 16px", minWidth: 0 }}>
      <p style={{ fontSize: "clamp(22px, 4.5vw, 32px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: color ?? "var(--tinta)", lineHeight: 1.1 }}>
        {valor}
        {unidad && <span style={{ fontSize: 13, fontWeight: 500, color: "var(--grafito)", marginLeft: 4 }}>{unidad}</span>}
      </p>
      <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 13, marginTop: 2 }}>{etiqueta}</p>
    </div>
  );
}

/** INICIO DEL EMPRESARIO: el despacho — instrumentos, la voz del agente, una acción. */
export default async function Portal() {
  const c = await contextoPortal();
  if (!c.companyId)
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <CrearEmpresa />
      </>
    );

  const [hoy, t, { data: metricasRaw }] = await Promise.all([
    empresaHoy(c.companyId),
    tableroEmpresario(c.companyId),
    supabaseAdmin().from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(80),
  ]);

  if (hoy.nivel === 0)
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <p className="t-cuerpo medida mb-2" style={{ color: "var(--grafito)" }}>
          En 15–20 minutos tendrás tu primer diagnóstico. No necesitas documentos perfectos: puedes hablar, subir fotos o simplemente contarnos cómo lo haces.
        </p>
        <div className="mt-6">
          <Link href="/portal/conversacion" className="boton">Empezar</Link>
        </div>
      </>
    );

  const perdida = proyeccionPerdida((metricasRaw ?? []) as Metrica[]);
  const rutaContinuar = ({ 2: "/portal/activos", 3: "/portal/conversacion", 4: "/portal/validar", 5: "/portal/procesos", 6: "/portal/activos", 7: "/portal/resultados", 8: "/portal/plan" } as Record<number, string>)[c.paso] ?? "/portal/hoy";
  const cosas = hoy.espejo.length + hoy.noVes.length + hoy.fortalezas.length;

  // LA LECTURA DEL AGENTE: lo más valioso que sabe hoy, con su fuente — la restricción manda; si no, la conversación.
  const caminos = caminosDesdeHallazgos([hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter(Boolean) as HallazgoHoy[]);
  const lectura = hoy.restriccion
    ? {
        texto: hoy.restriccion.titulo,
        linea: hoy.restriccion.costo_posible ?? hoy.restriccion.causa ?? null,
        fuente: "Visto en tu propia información — nada es inventado.",
        href: caminos[0]?.href ?? "/portal/hoy",
        accion: "Resolver esto ahora",
      }
    : t.preguntaAbierta
      ? { texto: t.preguntaAbierta, linea: null, fuente: "Tu conversación está a mitad — cada respuesta afina el diagnóstico.", href: "/portal/conversacion", accion: "Responder ahora" }
      : { texto: c.queFalta, linea: null, fuente: null, href: rutaContinuar, accion: "Continuar" };

  // Las tres fases del método: dónde está parada la empresa.
  const fase = t.biblioteca.listos > 0 ? 3 : cosas > 0 || (c.porValidar ?? 0) > 0 ? 2 : 1;
  const FASES = ["Diagnóstico", "Auditoría profunda", "Sistematización"];

  return (
    <div className="flex flex-col" style={{ gap: 34, paddingTop: 6 }}>
      {/* INSTRUMENTOS: tres lecturas vitales en una franja entre líneas — no tarjetas */}
      <section aria-label="Lecturas de tu empresa" className="grid grid-cols-3" style={{ borderTop: "2px solid var(--tinta)", borderBottom: "1px solid var(--linea)" }}>
        <Lectura
          valor={perdida.totalMensual > 0 ? `~${soles(perdida.totalMensual)}` : "—"}
          unidad={perdida.totalMensual > 0 ? "al mes" : undefined}
          etiqueta={perdida.totalMensual > 0 ? "en riesgo, según tus números" : "riesgo aún por calcular"}
          color={perdida.totalMensual > 0 ? "var(--contradicho)" : "var(--grafito)"}
        />
        <div style={{ borderLeft: "1px solid var(--linea)" }}>
          <Lectura valor={`${t.comprension}%`} etiqueta="entendido de tu empresa" />
        </div>
        <div style={{ borderLeft: "1px solid var(--linea)" }}>
          <Lectura valor={`${t.biblioteca.listos} de ${t.biblioteca.total}`} etiqueta="documentos en regla" color={t.biblioteca.listos === t.biblioteca.total && t.biblioteca.total > 0 ? "var(--confirmado)" : undefined} />
        </div>
      </section>

      {/* LA VOZ DEL AGENTE: serif, con su fuente, y UNA acción */}
      <section>
        <p className="t-hero" style={{ fontSize: "clamp(24px, 4.5vw, 34px)", maxWidth: "26ch" }}>{lectura.texto}</p>
        {lectura.linea && <p className="t-cuerpo mt-3 medida" style={{ color: "var(--grafito)" }}>{lectura.linea}</p>}
        {lectura.fuente && <p className="t-dato mt-2" style={{ color: "var(--grafito)", fontSize: 13.5 }}>{lectura.fuente}</p>}
        <div className="flex items-center gap-5 flex-wrap mt-5">
          <Link href={lectura.href} className="boton boton--grande">{lectura.accion}</Link>
          {cosas > 0 && (
            <Link href="/portal/hoy" className="t-dato" style={{ textDecoration: "underline", color: "var(--marca)" }}>
              Ver {cosas} hallazgo{cosas === 1 ? "" : "s"} más
            </Link>
          )}
        </div>
      </section>

      {/* LAS TRES FASES DEL MÉTODO: dónde estás parado — texto, no adorno */}
      <section aria-label="Fase del método" className="flex items-center flex-wrap" style={{ gap: 10, borderTop: "1px solid var(--linea)", paddingTop: 14 }}>
        {FASES.map((f, i) => (
          <span key={f} className="flex items-center" style={{ gap: 10 }}>
            {i > 0 && <span aria-hidden="true" style={{ width: 22, height: 1, background: "var(--linea)", display: "inline-block" }} />}
            <span className="t-dato" style={{ fontWeight: i + 1 === fase ? 700 : 500, color: i + 1 === fase ? "var(--marca)" : i + 1 < fase ? "var(--confirmado)" : "var(--grafito)" }}>
              {f}
              {i + 1 < fase && <span style={{ marginLeft: 5, fontSize: 12 }}>hecha</span>}
              {i + 1 === fase && <span style={{ marginLeft: 5, fontSize: 12 }}>· aquí estás</span>}
            </span>
          </span>
        ))}
      </section>

      {/* La gráfica real, si hay meses contados */}
      {t.serieVentas.length >= 2 && (
        <section>
          <GraficaVentas serie={t.serieVentas} dorada={t.epocaDorada} />
          {t.epocaDorada != null && t.serieVentas.length > 0 && t.epocaDorada > t.serieVentas[t.serieVentas.length - 1].valor * 1.25 && (
            <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
              Antes vendías más. La receta ya existió — en <Link href="/portal/conversacion" style={{ textDecoration: "underline" }}>Conversar</Link> la estamos reconstruyendo contigo.
            </p>
          )}
        </section>
      )}

      <p className="t-dato" style={{ color: "var(--grafito)" }}>
        Todo sale de lo que tu empresa contó o mostró. <Link href="/portal/hoy" style={{ textDecoration: "underline" }}>Mi empresa completa</Link> · <Link href="/portal/activos" style={{ textDecoration: "underline" }}>Tus documentos</Link>
      </p>
    </div>
  );
}

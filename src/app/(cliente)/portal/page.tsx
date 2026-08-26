import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { empresaHoy } from "@/lib/hoy";
import { tableroEmpresario, type PuntoVenta } from "@/lib/tablero";
import { CrearEmpresa } from "@/components/cliente/CrearEmpresa";

export const dynamic = "force-dynamic";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const MES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const mesCorto = (p: string) => MES[Number(p.slice(5, 7))] ?? p;

/** Medidor semicircular (comprensión). Solo SVG: sin librerías, ambos temas. */
function Medidor({ pct }: { pct: number }) {
  const a = Math.PI * (1 - pct / 100);
  const x = 60 + 50 * Math.cos(a);
  const y = 62 - 50 * Math.sin(a);
  const grande = pct > 50 ? 1 : 0;
  return (
    <svg viewBox="0 0 120 70" style={{ width: 128 }} role="img" aria-label={`Entendido ${pct} por ciento`}>
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--linea)" strokeWidth="9" strokeLinecap="round" />
      {pct > 2 && <path d={`M10 62 A50 50 0 ${grande} 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke="var(--marca)" strokeWidth="9" strokeLinecap="round" />}
      <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--tinta)">{pct}%</text>
    </svg>
  );
}

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

/**
 * Inicio del portal = el tablero del empresario (maqueta aprobada): qué sigue, cuánto entendemos,
 * sus números con estado, sus ventas frente a su mejor época, lo que más lo frena y su biblioteca.
 */
export default async function Portal() {
  const c = await contextoPortal();
  if (!c.companyId)
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <CrearEmpresa />
      </>
    );

  const [hoy, t] = await Promise.all([empresaHoy(c.companyId), tableroEmpresario(c.companyId)]);

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

  const rutaContinuar = ({ 2: "/portal/activos", 3: "/portal/conversacion", 4: "/portal/validar", 5: "/portal/procesos", 6: "/portal/activos", 7: "/portal/resultados", 8: "/portal/plan" } as Record<number, string>)[c.paso] ?? "/portal/hoy";
  const cosas = hoy.espejo.length + hoy.noVes.length + hoy.fortalezas.length;
  const hayNumeros = Boolean(t.kpis.venta || t.kpis.ganancia || t.kpis.deuda != null || t.serieVentas.length >= 2);

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {/* HERO: tarjeta de marca con la siguiente acción + medidor en su propia tarjeta (forma de app) */}
      <section className="grid gap-4 lg:grid-cols-[1fr_240px]" style={{ paddingTop: 4 }}>
        <div className="panel p-6" style={{ background: "var(--marca)", border: "none" }}>
          <p className="t-etiqueta mb-2" style={{ color: "color-mix(in srgb, var(--papel) 70%, transparent)" }}>Qué sigue ahora</p>
          <p className="t-hero" style={{ color: "var(--papel)", fontSize: "clamp(21px, 3vw, 28px)", marginBottom: 18, maxWidth: "34ch" }}>{t.preguntaAbierta ?? c.queFalta}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href={t.preguntaAbierta ? "/portal/conversacion" : rutaContinuar} className="boton" style={{ background: "var(--papel)", color: "var(--marca)", borderColor: "var(--papel)" }}>Continuar</Link>
            {cosas > 0 && (
              <Link href="/portal/hoy" className="t-dato" style={{ textDecoration: "underline", color: "var(--papel)" }}>
                {cosas} hallazgo{cosas === 1 ? "" : "s"} para mirar
              </Link>
            )}
          </div>
        </div>
        <div className="panel p-5 flex flex-col items-center justify-center" style={{ gap: 2 }}>
          <Medidor pct={t.comprension} />
          <p className="t-dato" style={{ color: "var(--grafito)" }}>entendido de tu empresa</p>
        </div>
      </section>

      {/* En PC: números y gráfica a la izquierda, lo accionable a la derecha — un tablero, no una columna.
          Sin números todavía, no hay columnas: el contenido fluye y nada queda colgado en el vacío. */}
      <div className={hayNumeros ? "grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-x-14 items-start" : "flex flex-col gap-10"}>
      <div className="flex flex-col" style={{ gap: 40, minWidth: 0 }}>
      {/* Números en tarjetas: un número por tarjeta, se entiende en un segundo */}
      {(t.kpis.venta || t.kpis.ganancia || t.kpis.deuda != null) && (
        <section className="grid gap-4 sm:grid-cols-3">
          {t.kpis.venta && (
            <div className="panel p-5">
              <p className="t-etiqueta mb-1">Ventas de {mesCorto(t.kpis.venta.periodo)}</p>
              <p className="num-grande" style={{ fontSize: 30 }}>{soles(t.kpis.venta.valor)}</p>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>{t.kpis.venta.estado === "verificado" ? "verificado en tus registros" : "contado de memoria"}</p>
            </div>
          )}
          {t.kpis.ganancia && (
            <div className="panel p-5">
              <p className="t-etiqueta mb-1">Lo que te quedó</p>
              <p className="num-grande" style={{ fontSize: 30, color: "var(--confirmado)" }}>{soles(t.kpis.ganancia.valor)}</p>
              {t.kpis.venta && t.kpis.venta.periodo === t.kpis.ganancia.periodo && t.kpis.venta.valor > 0 && (
                <p className="t-dato" style={{ color: "var(--grafito)" }}>{Math.round((t.kpis.ganancia.valor / t.kpis.venta.valor) * 100)} de cada 100 vendidos</p>
              )}
            </div>
          )}
          {t.kpis.deuda != null && (
            <div className="panel p-5">
              <p className="t-etiqueta mb-1">Te deben tus clientes</p>
              <p className="num-grande" style={{ fontSize: 30, color: "var(--caducado)" }}>{soles(t.kpis.deuda)}</p>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>plata tuya que aún no entra</p>
            </div>
          )}
        </section>
      )}

      {/* Ventas mes a mes vs mejor época */}
      {t.serieVentas.length >= 2 && (
        <section className="panel p-5">
          <p className="t-etiqueta mb-3">Tus ventas, mes a mes</p>
          <GraficaVentas serie={t.serieVentas} dorada={t.epocaDorada} />
          {t.epocaDorada != null && t.serieVentas.length > 0 && t.epocaDorada > t.serieVentas[t.serieVentas.length - 1].valor * 1.25 && (
            <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
              Antes vendías más. La receta ya existió — en <Link href="/portal/conversacion" style={{ textDecoration: "underline" }}>Conversar</Link> la estamos reconstruyendo contigo.
            </p>
          )}
        </section>
      )}

      </div>

      {/* Lo que más frena + biblioteca: aquí SÍ hay caja — son accionables */}
      <div className={hayNumeros ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:self-start" : "grid gap-4 sm:grid-cols-2"}>
        {hoy.restriccion && (
          <section className="panel p-5" style={{ borderLeft: "4px solid var(--contradicho)" }}>
            <p className="t-etiqueta mb-2">Lo que más te está frenando</p>
            <p className="t-cuerpo" style={{ fontWeight: 550, marginBottom: 8 }}>{hoy.restriccion.titulo}</p>
            <Link href="/portal/hoy" className="t-dato" style={{ textDecoration: "underline", color: "var(--marca)" }}>Ver el análisis completo</Link>
          </section>
        )}
        <section className="panel p-5">
          <p className="t-etiqueta mb-2">Los documentos que te tocan{t.biblioteca.personas ? ` · empresa de ${t.biblioteca.personas} persona${t.biblioteca.personas === 1 ? "" : "s"}` : ""}</p>
          <div style={{ height: 6, borderRadius: 4, background: "var(--linea)", overflow: "hidden", marginBottom: 10 }}>
            <div style={{ width: `${t.biblioteca.total ? Math.round((t.biblioteca.listos / t.biblioteca.total) * 100) : 0}%`, height: "100%", background: "var(--marca)" }} />
          </div>
          <p className="t-cuerpo" style={{ marginBottom: 6 }}>{t.biblioteca.listos} de {t.biblioteca.total}</p>
          <p className="t-dato" style={{ color: "var(--grafito)", marginBottom: 10 }}>A tu tamaño no te pedimos más — la vara crece con tu empresa.</p>
          <Link href="/portal/activos" className="t-dato" style={{ textDecoration: "underline", color: "var(--marca)" }}>Ir a Tu información</Link>
        </section>
      </div>
      </div>

      <p className="t-dato medida" style={{ color: "var(--grafito)" }}>
        Todo sale de lo que tu empresa contó o mostró.
      </p>
    </div>
  );
}

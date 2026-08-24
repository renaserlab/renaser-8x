import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { ESTADO_PILAR, PILAR_CLIENTE, fechaMes } from "@/lib/textos";

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };
const ESTADO_CLIENTE_PILAR: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Información insuficiente" };
const CLASE_NOMBRE: Record<string, string> = { documento: "Tus documentos", equipo: "Tu equipo", datos: "Tus datos", dueno: "Tú" };

function Insight({ h, n }: { h: HallazgoHoy; n?: number }) {
  return (
    <article className="panel p-5" style={{ borderLeft: `3px solid ${h.preserva ? "var(--confirmado)" : h.impacto === "alto" ? "var(--contradicho)" : "var(--caducado)"}` }}>
      <h3 className="t-seccion" style={{ fontSize: 18 }}>{n ? `${n}. ` : ""}{h.titulo}</h3>
      {h.causa && (
        <p className="t-cuerpo mt-2 medida">
          <span style={{ color: "var(--grafito)" }}>Qué vemos: </span>
          {h.causa}
        </p>
      )}
      {h.costo_posible && (
        <p className="t-cuerpo mt-2 medida">
          <span style={{ color: "var(--grafito)" }}>Qué puede estar costando: </span>
          {h.costo_posible}
        </p>
      )}
      {h.recomendacion && (
        <p className="t-cuerpo mt-2 medida">
          <span style={{ color: "var(--grafito)" }}>{h.preserva ? "Cómo protegerla: " : "Por dónde tomarlo: "}</span>
          {h.recomendacion}
        </p>
      )}
      {h.evidencia.length > 0 && (
        <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
          Según {h.evidencia.map((e) => e.fuente).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
        </p>
      )}
    </article>
  );
}

/** MI EMPRESA HOY: el diagnóstico vivo. El empresario recibe valor sin esperar a nadie. */
export default async function Hoy() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const hoy = await empresaHoy(c.companyId);

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
        <p className="t-etiqueta">Mi empresa hoy</p>
        <h1 className="t-titulo mt-2 medida">{c.empresa?.nombre}</h1>
        <p className="t-cuerpo mt-3 medida" style={{ color: "var(--grafito)" }}>
          Esto es lo que entendimos hasta ahora, con su fuente. Se actualiza con cada cosa que nos cuentas o subes.
          {hoy.stats.porValidar > 0 && (
            <> Hay <Link href="/portal/validar" style={{ textDecoration: "underline" }}>{hoy.stats.porValidar} punto(s) esperando tu confirmación</Link>: con eso la foto se afina.</>
          )}
        </p>
      </header>

      {hoy.espejo.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">El espejo</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Puntos donde una fuente dice una cosa y otra fuente dice otra. Aquí suele estar lo más valioso.</p>
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
        </section>
      )}

      {hoy.noVes.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Lo que tal vez no estás viendo</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Cada punto sale de tu propia información. Nada está inventado.</p>
          <div className="flex flex-col gap-4">
            {hoy.noVes.map((h) => (
              <Insight key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}

      {hoy.fortalezas.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Lo que no debes romper</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Fortalezas reales de tu empresa. Cualquier cambio tiene que protegerlas.</p>
          <div className="flex flex-col gap-4">
            {hoy.fortalezas.map((h) => (
              <Insight key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}

      {hoy.caleta.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">La Caleta de tu empresa</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>
            Cosas valiosas que tu gente sabe hacer o detectar y que no estaban escritas. Protegerlas importa tanto como corregir problemas.
          </p>
          <ul className="flex flex-col gap-3">
            {hoy.caleta.map((k, i) => (
              <li key={i} className="panel p-4">
                <p className="t-etiqueta">{k.puesto ?? "Una persona del equipo"}{k.critico ? " · crítica" : ""}{k.documentado ? "" : " · aún no escrita"}</p>
                <p className="t-cuerpo mt-1 medida">{k.situacion ?? k.regla ?? k.senal}</p>
                {k.senal && k.situacion && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>La señal: {k.senal}{k.regla ? " · La regla: " + k.regla : ""}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="t-seccion mb-4">Tu empresa, por áreas</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {hoy.pilares.map((p) => (
            <div key={p.pilar} className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="t-seccion" style={{ fontSize: 17 }}>{PILAR_CLIENTE[p.pilar] ?? p.pilar}</span>
                <span className="t-dato" style={{ color: ESTADO_COLOR[p.estado] }}>{ESTADO_CLIENTE_PILAR[p.estado] ?? ESTADO_PILAR[p.estado]}</span>
              </div>
              {p.resumen && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{p.resumen}</p>}
              {p.estado === "desconocido" && !p.resumen && <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Aún nos faltan piezas para una conclusión responsable.</p>}
            </div>
          ))}
        </div>
      </section>

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

      {hoy.sistematizar.length > 0 && (
        <section>
          <h2 className="t-seccion mb-1">Qué ordenaría primero</h2>
          <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>Lo que hoy depende de la memoria o de una persona, convertido en sistema.</p>
          <ul className="flex flex-col gap-2">
            {hoy.sistematizar.map((s, i) => (
              <li key={i} className="panel p-4">
                <span className="t-seccion" style={{ fontSize: 17 }}>{s.nombre}</span>
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
          <ol className="flex flex-col gap-4">
            {hoy.tentativo.map((p) => (
              <li key={p.n} className="panel p-5">
                <h3 className="t-seccion" style={{ fontSize: 18 }}>{p.n}. {p.problema}</h3>
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

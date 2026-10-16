import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaHoy, type HallazgoHoy } from "@/lib/hoy";
import { tableroEmpresario, pendientesDelDueno, accionDeEntrada, RUTA_ENTRADA, type PuntoVenta } from "@/lib/tablero";
import { accionPendiente, accionDeSiempre } from "@/lib/siguiente-accion";
import { bolsasDeFugas, tarjetaDelDueno } from "@/lib/perdida";
import { monedaParaFugas } from "@/components/negocio/datos";
import { caminosDesdeHallazgos } from "@/lib/caminos";
import type { Metrica } from "@/lib/rules/anomalias";
import { CrearEmpresa } from "@/components/cliente/CrearEmpresa";
import { Icono } from "@/components/base/Icono";
import { Medidor, Barritas, Segmentos, Pista, type Barra } from "@/components/tablero/Piezas";
import { GraficoLinea, type PuntoLinea } from "@/components/tablero/GraficoLinea";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — tablero de la imagen de referencia (pedido de Kelin, 13-10-2026; reemplaza el «despacho»
  híbrido del 27-08 sin gauges ni tarjetas)
THESIS: el inicio del dueño como el tablero de la imagen: saludo con UNA acción dominante, cuánto entendemos su
  negocio en un medidor, sus números en tarjetas con barritas, su venta en una línea con peine.
OWN-WORLD: cielo azul suave, tarjetas blancas de 24px con sombra suave, píldora oscura, Manrope en números.
STORY: entiendo en 10 segundos cómo va mi empresa y qué me toca hacer hoy.
FINISH: nada inventado; lo que falta va rayado, con su nombre, e invita a contarlo.
*/

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const MES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MES_LARGO = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const mesCorto = (p: string) => MES[Number(p.slice(5, 7))] ?? p;
const mesLargo = (p: string) => MES_LARGO[Number(p.slice(5, 7))] ?? p;

/** El periodo AAAA-MM de `p` más `k` meses. */
function sumarMeses(p: string, k: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Lo dicho por el dueño o leído de un documento todavía no está comprobado. */
const comoSeSabe = (estado: string | undefined) =>
  estado === "verificado" ? null : estado === "extraido" ? "leído de un documento" : "lo dijiste tú";

/** Meses seguidos entre el primero y el último con venta: un mes sin venta contada queda como hueco, no como cero. */
function mesesSeguidos(serie: PuntoVenta[], desde?: string): (PuntoVenta | { periodo: string; valor: null; estado?: undefined })[] {
  if (!serie.length) return [];
  const primero = desde ?? serie[0].periodo;
  const ultimo = serie[serie.length - 1].periodo;
  const salida: (PuntoVenta | { periodo: string; valor: null })[] = [];
  for (let p = primero; p <= ultimo; p = sumarMeses(p, 1)) salida.push(serie.find((s) => s.periodo === p) ?? { periodo: p, valor: null });
  return salida;
}

/** INICIO DEL EMPRESARIO: el tablero — su acción de hoy, cuánto lo entendemos, sus números. */
export default async function Portal() {
  const c = await contextoPortal();
  if (!c.companyId)
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <CrearEmpresa />
      </>
    );

  const [hoy, t, { data: metricasRaw }, { data: empFicha }, pendientes, monedaFugas] = await Promise.all([
    empresaHoy(c.companyId),
    tableroEmpresario(c.companyId),
    supabaseAdmin().from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(80),
    supabaseAdmin().from("companies").select("ficha").eq("id", c.companyId).single(),
    // Lo que espera al dueño (confirmaciones, tareas, indicadores, números, informe). Nunca lanza: una tabla que
    // todavía no existe solo hace que ese aviso no aparezca.
    pendientesDelDueno(c.companyId, c.u),
    // Lo que se queda en el camino al cobrar en otra moneda, para la caja de las fugas. Nunca lanza.
    monedaParaFugas(c.companyId),
  ]);
  const metaMensual = Number(((empFicha?.ficha as Record<string, string>) ?? {}).meta_venta_mensual ?? 0) || null;

  // LA ENTRADA BREVE ES LA PUERTA (R7.1): mientras el dueño no confirme lo que entendimos, la siguiente acción
  // del portal es seguir con sus doce preguntas, donde las dejó. Una empresa sin entrada sigue como siempre.
  const deEntrada = accionDeEntrada(t.entrada);

  // Sin nada contado todavía, la portada es una invitación. Si el dueño ya confirmó su entrada (aunque haya
  // respondido «no lo sé» a todo), no se le invita a empezar otra vez: pasa al despacho con su siguiente paso.
  if (hoy.nivel === 0 && t.entrada?.estado !== "confirmada")
    return (
      <>
        <h1 className="t-titulo mt-2 mb-4 medida">Vamos a entender cómo funciona realmente tu empresa</h1>
        <p className="t-cuerpo medida mb-2" style={{ color: "var(--grafito)" }}>
          {deEntrada
            ? `${deEntrada.texto} ${deEntrada.linea ?? ""}`
            : "Empezamos con doce preguntas cortas. No necesitas documentos perfectos: puedes hablar, escribir, subir una foto o decir «no lo sé»."}
        </p>
        <div className="mt-6">
          <Link href={RUTA_ENTRADA} className="boton">{deEntrada?.accion ?? "Empezar"}</Link>
        </div>
      </>
    );

  // «Se te está yendo»: SOLO la caja de las fugas. Lo que podría vender va aparte, sin rojo, y nunca se le suma
  // (src/lib/perdida.ts). La tarjeta vieja, «En riesgo al mes», sumaba las dos.
  const fugas = bolsasDeFugas((metricasRaw ?? []) as Metrica[], { moneda: monedaFugas });
  const yendo = tarjetaDelDueno(fugas);
  const hayFugas = fugas.caja.fugas.length > 0 || fugas.oportunidad.fugas.length > 0;
  const cosas = hoy.espejo.length + hoy.noVes.length + hoy.fortalezas.length;

  // LA SIGUIENTE ACCIÓN: UNA, la más urgente, con su enlace. El orden lo decide src/lib/siguiente-accion.ts
  // (constante PRIORIDAD); aquí solo se juntan los hechos ya leídos. Primero la entrada sin confirmar. Después lo
  // que espera al dueño: confirmar hacia dónde va su empresa, aceptar su punto de partida, las tareas de la semana,
  // el indicador del periodo que cerró, los números que faltan, el informe que nadie abrió todavía. Y si no hay nada
  // de eso, la lectura de siempre: la restricción manda; si no, la conversación; si no, el paso del recorrido.
  const hallazgos = [hoy.restriccion, ...hoy.noVes, ...hoy.secundarias].filter(Boolean) as HallazgoHoy[];
  const caminos = caminosDesdeHallazgos(hallazgos);
  // El informe se anuncia cuando hay diagnóstico y al menos una conclusión firme que leer; nunca por lo provisional.
  const informeListo = hoy.nivel >= 3 && hallazgos.filter((h) => !h.provisional).length + hoy.fortalezas.length > 0;
  const lecturaDeSiempre =
    accionPendiente({ ...pendientes, informeListo }) ??
    accionDeSiempre({
      restriccion: hoy.restriccion
        ? { titulo: hoy.restriccion.titulo, linea: hoy.restriccion.costo_posible ?? hoy.restriccion.causa ?? null, href: caminos[0]?.href ?? "/portal/hoy" }
        : null,
      preguntaAbierta: t.preguntaAbierta,
      paso: c.paso,
      queFalta: c.queFalta,
    });
  const lectura = deEntrada ?? lecturaDeSiempre;
  // «más» solo tiene sentido cuando lo que se lee arriba ya es un hallazgo (la restricción).
  const arribaVaUnHallazgo = !deEntrada && lecturaDeSiempre.estado === "restriccion";

  // Las «tres fases del método» se retiraron de aquí el 16-10-2026: la barra de avance de arriba (BarraRutaCliente,
  // en el layout) ya dice en qué etapa va la empresa, y dos cosas con el mismo propósito confunden.
  const pedidos = pendientes.pedidos;

  // ── Lo que pinta el tablero, todo de lo ya leído ──
  const venta = t.kpis.venta;
  const ganancia = t.kpis.ganancia;
  // Seis meses que terminan en el último con venta: los que no tienen venta contada van rayados.
  const seisMeses: Barra[] = venta
    ? mesesSeguidos(t.serieVentas, sumarMeses(venta.periodo, -5)).map((m) => ({ valor: m.valor, dicho: m.valor != null && comoSeSabe(m.estado) != null }))
    : [];
  const huecos = seisMeses.filter((b) => b.valor == null).length;
  const linea: PuntoLinea[] = mesesSeguidos(t.serieVentas).map((m) => ({ corto: mesCorto(m.periodo), largo: mesLargo(m.periodo), valor: m.valor }));
  const anterior = t.serieVentas.length >= 2 ? t.serieVentas[t.serieVentas.length - 2] : null;
  const cambio = venta && anterior && anterior.valor > 0 && sumarMeses(anterior.periodo, 1) === venta.periodo ? Math.round((100 * (venta.valor - anterior.valor)) / anterior.valor) : null;
  const numeros = pendientes.numeros;
  const tareas = pendientes.tareas;
  const docsFaltan = Math.max(0, t.biblioteca.total - t.biblioteca.listos);
  const saludoA = c.u.rol === "cliente" ? (c.u.nombre ?? "").trim().split(/\s+/)[0] : "";
  const fecha = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" }).format(new Date());
  const encontrados = [...hallazgos, ...hoy.fortalezas].slice(0, 4);

  return (
    <div className="tablero">
      <section className="saludo" aria-labelledby="t-hola">
        <div>
          <h1 className="hola" id="t-hola">Hola,<strong>{saludoA || c.empresa?.nombre || "de nuevo"}</strong></h1>
          <p className="bienvenida">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}{saludoA && c.empresa?.nombre ? ` · ${c.empresa.nombre}` : ""}</p>
          {/* LA VOZ: lo que toca hoy, con su fuente, y UNA acción */}
          <p className="t-hero" style={{ fontSize: 19, marginTop: 18 }}>{lectura.texto}</p>
          {lectura.linea && <p className="voz" style={{ marginTop: 6 }}>{lectura.linea}</p>}
          {lectura.fuente && <p className="voz" style={{ marginTop: 4, fontSize: 12.5 }}>{lectura.fuente}</p>}
          <div style={{ marginTop: 14 }}>
            <Link href={lectura.href} className="boton boton--grande">{lectura.accion}</Link>
          </div>
          {cosas > 0 && (
            <p className="voz">
              <Link href="/portal/hoy" className="enlace-azul">Ver {cosas} hallazgo{cosas === 1 ? "" : "s"}{arribaVaUnHallazgo ? " más" : ""}</Link>
            </p>
          )}
        </div>
        <div className="pendientes">
          <div className="fila">
            <h2>Documentos en regla</h2>
            <span className="cifra">{t.biblioteca.listos}<small>de {t.biblioteca.total}</small></span>
          </div>
          {t.biblioteca.total > 0 && (
            <Segmentos
              etiqueta={`${t.biblioteca.listos} en regla, ${docsFaltan} faltan`}
              partes={[
                { n: t.biblioteca.listos, texto: "en regla", tipo: "s1" },
                { n: docsFaltan, texto: "faltan", tipo: "s3" },
              ]}
            />
          )}
        </div>
      </section>

      <section className="tarjeta medidor" aria-labelledby="t-comp">
        <div className="cabeza">
          <div><h2 id="t-comp">Qué tanto entendemos tu negocio</h2><p className="sub">Lo que conversamos y lo que nos mostraste</p></div>
          <Link className="ir" href="/portal/hoy" aria-label="Ver tu empresa completa"><Icono nombre="diagonal" /></Link>
        </div>
        <Medidor pct={t.comprension} etiqueta="Qué tanto entendemos tu negocio" />
        <div className="lectura"><span className="num">{t.comprension}%</span><p>entendido</p></div>
        <div className="pie">
          <div><b>{t.biblioteca.listos} de {t.biblioteca.total}</b><small>documentos</small></div>
          {pedidos && (
            <div>
              <b>{pedidos.abiertas}</b>
              <small>{pedidos.abiertas === 1 ? "pedido de tu consultora" : "pedidos de tu consultora"}</small>
            </div>
          )}
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-venta">
        <div className="cabeza">
          <div><h2 id="t-venta">Ventas del mes</h2><p className="sub">{venta ? `${mesLargo(venta.periodo)}${comoSeSabe(venta.estado) ? ` · ${comoSeSabe(venta.estado)}` : ""}` : "Todavía sin ventas contadas"}</p></div>
          <Link className="ir" href="/portal/numeros" aria-label="Ver tus números"><Icono nombre="diagonal" /></Link>
        </div>
        {venta ? (
          <>
            <div className="fila-cifra">
              <span className="grande"><small className="moneda">S/</small>{Math.round(venta.valor).toLocaleString("es-PE")}</span>
              <Barritas barras={seisMeses} etiqueta="Ventas de los últimos seis meses" />
            </div>
            {huecos > 0 && <p className="pie-barritas">Rayado: {huecos === 1 ? "un mes" : `${huecos} meses`} sin venta contada</p>}
          </>
        ) : (
          <div className="fila-cifra"><span className="sin-dato">Sin dato</span></div>
        )}
      </section>

      <section className="tarjeta cifra-tarjeta" aria-labelledby="t-queda">
        <div className="cabeza">
          <div><h2 id="t-queda">Lo que te queda</h2><p className="sub">{ganancia ? `${mesLargo(ganancia.periodo)} · ganancia del mes` : "Tu ganancia del mes"}</p></div>
          <Link className="ir" href="/portal/numeros" aria-label="Ver tus números"><Icono nombre="diagonal" /></Link>
        </div>
        <div className="fila-cifra">
          {ganancia ? (
            <span className="grande"><small className="moneda">S/</small>{Math.round(ganancia.valor).toLocaleString("es-PE")}</span>
          ) : (
            <span className="sin-dato">Todavía no lo contaste</span>
          )}
        </div>
      </section>

      <section className="tarjeta cifra-tarjeta ancha" aria-labelledby="t-yendo">
        <div className="cabeza">
          <div><h2 id="t-yendo">{yendo.titulo}</h2><p className="sub">{yendo.sub}</p></div>
          <Link className="ir" href={hayFugas ? "/portal/hoy" : "/portal/numeros"} aria-label={hayFugas ? "Ver de dónde sale cada cifra" : "Ver tus números"}><Icono nombre="diagonal" /></Link>
        </div>
        <div className="fila-cifra">
          {yendo.cifra ? (
            <span className="grande" style={{ color: "var(--contradicho)" }}>
              <small className="moneda" style={{ color: "inherit" }}>~S/</small>{Math.round(yendo.cifra.desde).toLocaleString("es-PE")}
              {Math.round(yendo.cifra.hasta) !== Math.round(yendo.cifra.desde) && <small>a {Math.round(yendo.cifra.hasta).toLocaleString("es-PE")}</small>}
              <small>al mes</small>
            </span>
          ) : yendo.enVez?.rayado ? (
            <span className="sin-dato">{yendo.enVez.texto}</span>
          ) : (
            <span className="nota">{yendo.enVez?.texto}</span>
          )}
        </div>
        {yendo.aparte && <p className="nota">{yendo.aparte}</p>}
        {/* Lo que podría vender: otra palabra, el color de siempre y nunca dentro de la cifra de arriba. */}
        {yendo.oportunidad && <p className="nota">{yendo.oportunidad}</p>}
      </section>

      <section className="tarjeta cifra-tarjeta ancha" aria-labelledby="t-tareas">
        <div className="cabeza">
          <div><h2 id="t-tareas">Tareas de esta semana</h2><p className="sub">Las de tu plan, para ti y tu equipo</p></div>
          <Link className="ir" href="/portal/plan" aria-label="Ir a tu plan"><Icono nombre="diagonal" /></Link>
        </div>
        <div className="fila-cifra">
          {tareas ? (
            <span className="grande">{tareas.estaSemana}<small>esta semana · {tareas.enMarcha} en marcha</small></span>
          ) : (
            <span className="sin-dato">Todavía no hay plan</span>
          )}
        </div>
      </section>

      <section className="tarjeta linea-tarjeta" aria-labelledby="t-linea">
        <div className="cabeza">
          <div><h2 id="t-linea">Tus ventas mes a mes</h2><p className="sub">De lo que contaste y de tus documentos</p></div>
          <Link className="ir" href="/portal/numeros" aria-label="Ver tus números"><Icono nombre="diagonal" /></Link>
        </div>
        {linea.filter((p) => p.valor != null).length >= 2 && venta ? (
          <>
            <div className="resumen">
              <span className="num">{soles(venta.valor)}</span>
              <p>
                en {mesLargo(venta.periodo).toLowerCase()}
                {cambio != null ? `, ${Math.abs(cambio)}% ${cambio >= 0 ? "más" : "menos"} que el mes anterior` : ""}.
                {metaMensual != null ? ` Tu meta: ${soles(metaMensual)} al mes (${Math.round((100 * venta.valor) / metaMensual)}%).` : ""}
              </p>
            </div>
            <GraficoLinea
              puntos={linea}
              formato="soles"
              etiqueta="Ventas por mes"
              referencia={t.epocaDorada != null ? { valor: t.epocaDorada, texto: `tu mejor época: ${soles(t.epocaDorada)}` } : null}
            />
          </>
        ) : (
          <p className="sin-dato" style={{ gridColumn: "1 / -1", marginTop: 12 }}>Hacen falta dos meses de ventas para dibujar la línea</p>
        )}
      </section>

      <section className="tarjeta fuentes-tarjeta" aria-labelledby="t-falta">
        <div className="cabeza">
          <div><h2 id="t-falta">Cómo vamos con tu información</h2><p className="sub">Lleno: ya lo tenemos. Rayado: falta.</p></div>
        </div>
        <div className="fuentes">
          {numeros && (
            <div className="fuente">
              <span className="icono"><Icono nombre="numeros" /></span>
              <div className="rotulo"><b>Tus números del negocio</b><span>{numeros.total - numeros.faltan} de {numeros.total}</span></div>
              <Pista lleno={numeros.total - numeros.faltan} resto={numeros.faltan} escala={numeros.total} />
            </div>
          )}
          {t.biblioteca.total > 0 && (
            <div className="fuente">
              <span className="icono"><Icono nombre="carpeta" /></span>
              <div className="rotulo"><b>Tus documentos</b><span>{t.biblioteca.listos} de {t.biblioteca.total}</span></div>
              <Pista lleno={t.biblioteca.listos} resto={docsFaltan} escala={t.biblioteca.total} />
            </div>
          )}
        </div>
      </section>

      <section className="tarjeta lista-tarjeta completa" aria-labelledby="t-encontrado">
        <div className="cabeza">
          <div><h2 id="t-encontrado">Lo que encontramos</h2><p className="sub">Todo sale de lo que tu empresa contó o mostró</p></div>
          <Link className="ir" href="/portal/hoy" aria-label="Ver todo lo que encontramos"><Icono nombre="diagonal" /></Link>
        </div>
        {encontrados.length === 0 ? (
          <p className="voz">Todavía nada: aparece cuando terminamos de leer lo que contaste.</p>
        ) : (
          <ul className="lista">
            {encontrados.map((h) => (
              <li key={h.id}>
                <Link href="/portal/hoy">
                  <span className="icono-cuadro"><Icono nombre={h.preserva ? "plan" : "ojo"} /></span>
                  <span><b>{h.titulo}</b>{h.costo_posible && <small>{h.costo_posible}</small>}</span>
                  <span className="derecha">{h.provisional ? "por confirmar" : h.preserva ? "lo que funciona" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { derivados, esDeCaja, ROTULO_CIFRA_PROVISIONAL, type Metrica } from "@/lib/metricas";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";
import { diaEnZona, mesCerradoAnterior } from "@/lib/medicion";
import { listarLineas, configDeEmpresa } from "@/lib/producto";
import { tableroRentabilidad, FICHA_VACIA } from "@/lib/rentabilidad";
import { leerFichaNegocio, listarCostos, listarOperacionesMoneda } from "@/lib/negocio-datos";
import {
  declaranteDeRol,
  emparejarDeclaradoExtraido,
  ladosDisponibles,
  motivoSinPares,
  TOPE_METRICAS,
  type Declarante,
  type MetricaGuardada,
  type ParDeclaradoExtraido,
} from "@/lib/rules/contradiccion-numerica";
import {
  filasVitales,
  puntosDeVenta,
  ventaArriba,
  metaDeFicha,
  doradaDe,
  referenciaDeLinea,
  cifrasDerivadas,
  fugasDe,
  queNoCuadra,
  resumenProductos,
  type CifraDerivada,
  type Fuga,
} from "@/lib/numeros-vista";
import { moneda } from "@/lib/formato";
import { leer } from "@/components/negocio/datos";
import { TableroRentabilidad } from "@/components/negocio/TableroRentabilidad";
import { HistoriaNegocio } from "@/components/negocio/HistoriaNegocio";
import { pctDe, PCT_POR_DEFECTO } from "@/components/negocio/Palancas";
import { NueveNumeros } from "@/components/numeros/NueveNumeros";
import { GraficoLinea } from "@/components/tablero/GraficoLinea";
import { Icono } from "@/components/base/Icono";

export const dynamic = "force-dynamic";

/*
CONTRATO DE DIRECCIÓN — vista «Números» de una empresa (pedido de Kelin, 16-10-2026: «diagnóstico, qué hay en números,
  indicadores y el avance progresivo… el diseño no ayuda a que se vea como una consultora premium»)
THESIS: en una sola pantalla, lo que la empresa vende mes a mes, sus nueve números con de dónde sale cada uno, lo que se
  calcula con ellos, lo que deja cada producto, lo que se escapa y lo que no cuadra.
OWN-WORLD: noche y perla, el tablero de la bandeja y del portal: tarjetas blancas de 20 px sobre el lienzo perla, la
  Didone en la cifra protagonista de cada tarjeta, Manrope en las filas, acero en los datos, rayado = sin dato.
FINISH: lo que no hay va rayado y con su nombre; «no se pudo leer» nunca se pinta como «no hay»; ningún «S/ 0» inventado;
  lo que sale de un documento sin revisar lleva su rótulo junto a la cifra.
Spec: clientes/8x-plan/spec-vistas-limpias.md §5.
*/

type Busqueda = Record<string, string | string[] | undefined>;

/** Una tarjeta a todo lo ancho, en la rejilla de 12 y en la de 2 del celular. */
const ANCHO = { gridColumn: "1 / -1" } as const;
/** El rótulo de lo provisional, junto a la cifra (no plegado). */
const ROTULO = ROTULO_CIFRA_PROVISIONAL.charAt(0).toUpperCase() + ROTULO_CIFRA_PROVISIONAL.slice(1);

/** A cuántas respuestas de entrevista se les pregunta quién las dio: las demás quedan «Declarado» a secas. */
const TOPE_RESPUESTAS = 100;
type Anidado<T> = T | T[] | null | undefined;
const uno = <T,>(v: Anidado<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type RespuestaConRol = { id: string; interview_sessions?: Anidado<{ participants?: Anidado<{ rol: string | null }> }> };

/**
 * Quién dijo cada cifra declarada que se contradice (la misma lectura que la Matriz de Realidad). Si no consta o no se
 * puede leer, no se le atribuye a nadie: queda «Declarado».
 */
async function declarantesDe(pares: ParDeclaradoExtraido[]): Promise<Map<string, Declarante | null>> {
  const mapa = new Map<string, Declarante | null>();
  const ids = [...new Set(pares.filter((p) => p.veredicto.tipo === "CONTRADICCION").map((p) => p.declarado.response_id).filter((r): r is string => !!r))].slice(0, TOPE_RESPUESTAS);
  if (!ids.length) return mapa;
  try {
    const { data } = await supabaseAdmin().from("interview_responses").select("id, interview_sessions(participants(rol))").in("id", ids);
    for (const r of (data ?? []) as unknown as RespuestaConRol[]) mapa.set(r.id, declaranteDeRol(uno(uno(r.interview_sessions)?.participants)?.rol));
  } catch (e) {
    console.error("[numeros] no se pudo leer quién declaró cada cifra", e);
  }
  return mapa;
}

/** Los números de la empresa tal como están guardados (con las columnas de evidencia, para comparar con documentos). */
async function leerMetricas(companyId: string): Promise<MetricaGuardada[]> {
  // `*` y no una lista: si a una base le falta una columna nueva (origen, cifra_desplazada), lo demás se lee igual.
  const { data, error } = await supabaseAdmin()
    .from("company_metricas")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(TOPE_METRICAS);
  if (error) throw new Error(error.message);
  return (data ?? []) as MetricaGuardada[];
}

/** Lo guardado, en la forma de las cuentas: numeric de Postgres llega como texto y un periodo vacío es «actual». */
const comoMetricas = (filas: MetricaGuardada[]): Metrica[] =>
  filas.map((f) => {
    const n = f.valor === null || f.valor === undefined || (typeof f.valor === "string" && !f.valor.trim()) ? null : Number(f.valor);
    // `origen` viaja para rotular lo que sale de la caja de Finanzas («de su caja»): la cuenta no cambia.
    return { clave: f.clave, periodo: f.periodo ?? "", valor: n != null && Number.isFinite(n) ? n : null, estado: f.estado ?? null, origen: f.origen ?? null };
  });

/** «Cómo se calculó»: la cuenta en palabras, para rehacerla a mano. Plegado, con objetivo táctil de 44 px. */
function ComoSeCalculo({ calculo }: { calculo: Calculo<unknown> }) {
  return (
    <details>
      <summary className="nota" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--tinta)" }}>
        Cómo se calculó
        <Icono nombre="abajo" tam={14} />
      </summary>
      <dl style={{ margin: "2px 0 0", display: "grid", gap: 6 }}>
        {explicarCalculo(calculo).map((l) => (
          <div key={l.etiqueta}>
            <dt className="t-etiqueta" style={{ fontSize: 11 }}>{l.etiqueta}</dt>
            <dd className="nota" style={{ margin: 0 }}>{l.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** El rótulo de una cifra que sale de un documento sin revisar. */
function Provisional() {
  return <p className="nota" style={{ color: "var(--caducado)", fontWeight: 600 }}>{ROTULO}.</p>;
}

/** Una de las cuatro cifras que salen de los números. Sin cifra: rayado «sin dato» y por qué. */
function TarjetaDerivada({ c }: { c: CifraDerivada }) {
  return (
    <section className="tarjeta cifra-tarjeta" aria-labelledby={`n-${c.clave}`}>
      <div className="cabeza">
        <div>
          <h2 id={`n-${c.clave}`}>{c.titulo}</h2>
          <p className="sub">{c.sub}</p>
        </div>
      </div>
      <div className="fila-cifra">
        {c.cifra ? (
          <span className="grande">
            {c.cifra.signo}
            {c.cifra.simbolo && <small className="moneda">{c.cifra.simbolo}</small>}
            {c.cifra.numero}
            {c.cifra.unidad && <small>{c.cifra.unidad}</small>}
          </span>
        ) : (
          <span className="sin-dato">sin dato</span>
        )}
      </div>
      {c.motivo && <p className="nota">{c.motivo}</p>}
      {c.cifra && c.provisional && <Provisional />}
      <ComoSeCalculo calculo={c.calculo} />
    </section>
  );
}

/** Una fuga: la cifra, «no aplica» (chip, sin rayado) o rayado con lo que falta. */
function CeldaFuga({ f }: { f: Fuga }) {
  return (
    <div className="pozo pozo--fuga">
      <p className="pozo__titulo">{f.titulo}</p>
      {f.estado === "valor" ? (
        // El símbolo de la moneda no se separa de su cifra al partir la línea («entre S/ 520 y S/» arriba y «751» abajo).
        <span className="grande">{f.cifra?.replace(/ (?=\d)/g, " ")}</span>
      ) : f.estado === "no_aplica" ? (
        <span><span className="estado neutro">no aplica</span></span>
      ) : (
        <span className="sin-dato">{f.estado === "no_leido" ? "no se pudo leer" : f.estado === "sin_preguntar" ? "no se sabe si aplica" : "sin dato"}</span>
      )}
      {f.nota && <p className="nota">{f.nota}</p>}
      {f.calculo && <ComoSeCalculo calculo={f.calculo} />}
    </div>
  );
}

/**
 * NÚMEROS — la vista de la consultora (§5 de la especificación de vistas limpias). Arriba, lo único: la venta del último
 * mes y su línea. Debajo, en este orden: los nueve números, lo que se calcula con ellos, producto y rentabilidad, lo que
 * se escapa, las cifras que no cuadran y, plegada, la historia del negocio.
 *
 * Cada lectura va por separado y ninguna tumba la pantalla: si una falla, su tarjeta dice «no se pudo leer» y lo demás
 * sigue. Todo se lee y se calcula aquí, en el servidor; las tarjetas solo pintan.
 */
export default async function Numeros({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busqueda> }) {
  const { id } = await params;
  const busqueda = await searchParams;
  const base = `/empresa/${id}`;

  const [{ data: empresa }, config, guardadas, lineas, ficha, costos, operaciones] = await Promise.all([
    supabaseAdmin().from("companies").select("id,nombre,ficha").eq("id", id).maybeSingle(),
    configDeEmpresa(id),
    leer("los números de la empresa", () => leerMetricas(id)),
    leer("las líneas de producto", () => listarLineas(id)),
    leer("la ficha del negocio", () => leerFichaNegocio(id)),
    leer("los gastos del mes", () => listarCostos(id)),
    leer("las ventas en otra moneda", () => listarOperacionesMoneda(id)),
  ]);
  if (!empresa) return null;

  // «Hoy» y «el mes pasado» son los de la empresa, no los del servidor.
  const mesPasado = mesCerradoAnterior(diaEnZona(new Date(), config.zona_horaria))?.desde.slice(0, 7) ?? null;
  const metricas = guardadas.ok ? comoMetricas(guardadas.valor) : null;
  const d = derivados(metricas ?? []);

  // ── Arriba: la venta y su línea
  const venta = metricas ? ventaArriba(metricas, metaDeFicha(empresa.ficha)) : null;
  const puntos = metricas ? puntosDeVenta(metricas) : [];
  const dorada = metricas ? doradaDe(metricas) : null;
  const referencia = referenciaDeLinea(d, dorada, config);
  const conValor = puntos.filter((p) => p.valor != null).length;
  // Meses que suma su caja de Finanzas: se dicen en el subtítulo, sin cambiar la cuenta.
  const hayCaja = metricas?.some((m) => m.clave === "venta_mes" && esDeCaja(m)) ?? false;

  // ── Rentabilidad y fugas: las mismas entradas que arma /producto
  const fichaNegocio = ficha.ok ? ficha.valor : { ...FICHA_VACIA };
  const ops = operaciones.ok ? operaciones.valor : [];
  const tablero = tableroRentabilidad({
    lineas: lineas.ok ? lineas.valor : [],
    costos: costos.ok ? costos.valor : [],
    ficha: fichaNegocio,
    operaciones: ops,
    metricas: metricas ?? [],
    config,
  });
  const noLeido = [
    !ficha.ok ? (ficha.falta ? "la ficha del negocio (falta aplicar supabase/migracion-entrar-hoy.sql)" : "la ficha del negocio") : null,
    !costos.ok ? (costos.falta ? "los gastos del mes (falta aplicar supabase/migracion-entrar-hoy.sql)" : "los gastos del mes") : null,
    !operaciones.ok ? (operaciones.falta ? "las ventas en otra moneda (falta aplicar supabase/migracion-entrar-hoy.sql)" : "las ventas en otra moneda") : null,
    !metricas ? "los 9 números" : null,
  ].filter((x): x is string => x !== null);
  const pct = {
    precio: pctDe(busqueda.p_precio, PCT_POR_DEFECTO.precio),
    parte: pctDe(busqueda.p_parte, PCT_POR_DEFECTO.parte),
    volumen: pctDe(busqueda.p_volumen, PCT_POR_DEFECTO.volumen),
  };
  const resumen = resumenProductos(tablero, config);
  const fugas = fugasDe(ficha.ok ? tablero : null, ficha.ok ? fichaNegocio.modulos : null, config, operaciones.ok, metricas != null);

  // ── Lo que no cuadra: lo declarado frente a lo de los documentos
  const filasGuardadas = guardadas.ok ? guardadas.valor : [];
  const sinNombre = emparejarDeclaradoExtraido(filasGuardadas);
  const declarantes = await declarantesDe(sinNombre);
  const pares = declarantes.size ? emparejarDeclaradoExtraido(filasGuardadas, { declarantes }) : sinNombre;
  const noCuadran = queNoCuadra(pares);
  const cuadran = pares.filter((p) => p.veredicto.tipo === "COINCIDE").length;
  const noComparables = pares.filter((p) => p.veredicto.tipo === "NO_COMPARABLE").length;

  return (
    <div className="tablero">
      <h1 className="sr-only">Números de {empresa.nombre}</h1>

      {/* LO ÚNICO ARRIBA: la venta del último mes, su meta y su línea con el equilibrio (o la mejor época) de referencia. */}
      <section className="tarjeta linea-tarjeta" style={ANCHO} aria-labelledby="n-ventas">
        <div className="cabeza">
          <div>
            <h2 id="n-ventas">{venta ? `Ventas de ${venta.mes}` : "Ventas del mes"}</h2>
            <p className="sub">
              {referencia?.de === "equilibrio"
                ? "Mes a mes · la raya punteada es lo que cubre los gastos"
                : referencia?.de === "dorada"
                  ? "Mes a mes · la raya punteada es su mejor época"
                  : hayCaja
                    ? "Mes a mes, de su caja (Finanzas), de lo que contó la empresa y de sus documentos"
                    : "Mes a mes, de lo que contó la empresa y de sus documentos"}
            </p>
          </div>
        </div>
        {!metricas ? (
          <p className="sin-dato" style={{ gridColumn: "1 / -1", marginTop: 12 }}>No se pudieron leer los números de la empresa</p>
        ) : !venta ? (
          <p className="sin-dato" style={{ gridColumn: "1 / -1", marginTop: 12 }}>Todavía sin ventas contadas</p>
        ) : (
          <>
            <div className="resumen">
              <span className="num">{moneda(venta.valor, config)}</span>
              {/* La cifra no se parte al cortar la línea: «S/» quedaba arriba y «55,000» abajo (revisión del 16-10-2026). */}
              <p>{venta.pctMeta != null && venta.meta != null ? <>{venta.pctMeta} % de la meta de <span style={{ whiteSpace: "nowrap" }}>{moneda(venta.meta, config)}</span></> : "Sin meta de venta anotada"}</p>
              {venta.cambioPct != null && venta.mesAnterior && (
                <p>
                  {Math.abs(venta.cambioPct)} % {venta.cambioPct >= 0 ? "más" : "menos"} que {venta.mesAnterior}
                </p>
              )}
              {venta.provisional && <Provisional />}
              {venta.deCaja && <p><span className="fin-de-caja">De su caja (Finanzas)</span></p>}
            </div>
            {conValor >= 2 ? (
              <GraficoLinea
                puntos={puntos.map((p) => ({ corto: p.corto, largo: p.largo, valor: p.valor }))}
                formato="soles"
                etiqueta="Ventas por mes"
                referencia={referencia ? { valor: referencia.valor, texto: referencia.texto } : null}
              />
            ) : (
              <p className="sin-dato" style={{ alignSelf: "center" }}>Hacen falta dos meses de ventas para dibujar la línea</p>
            )}
          </>
        )}
      </section>

      {/* 1 · LOS NUEVE NÚMEROS */}
      <NueveNumeros filas={metricas ? filasVitales(metricas, mesPasado) : null} config={config} />

      {/* 2 · LO QUE SALE DE LOS NÚMEROS */}
      {cifrasDerivadas(d, config).map((c) => (
        <TarjetaDerivada key={c.clave} c={c} />
      ))}

      {/* 3 · PRODUCTO Y RENTABILIDAD. La tarjeta lleva además `hoja-suelta`: sus paneles van con borde, no con sombra. */}
      <section className="tarjeta hoja-suelta" style={{ ...ANCHO, marginTop: 0 }} aria-labelledby="n-producto">
        <div className="cabeza">
          <div>
            <h2 id="n-producto">Producto y rentabilidad</h2>
            <p className="sub">Cuánto deja cada cosa que vende y cuánto hay que vender para cubrir el mes</p>
          </div>
          <Link className="ir" href={`${base}/producto`} aria-label="Editar lo que anotó la empresa">
            <Icono nombre="diagonal" />
          </Link>
        </div>
        <div style={{ marginTop: 12 }}>
          {lineas.ok && resumen.total > 0 ? (
            <>
              <p className="voz" style={{ marginTop: 0 }}>
                {resumen.conDatos} de {resumen.total} {resumen.total === 1 ? "producto tiene" : "productos tienen"} precio, costo y unidades al mes
                {resumen.noventa ? ` · ${resumen.noventa.cuantas} de ${resumen.noventa.de} dejan el ${resumen.noventa.pct} % de lo que dejan todos` : ""}.
              </p>
              {resumen.top.length > 0 ? (
                <ul className="lista">
                  {resumen.top.map((p) => (
                    <li key={p.id}>
                      <div>
                        <span className="icono-cuadro"><Icono nombre="numeros" /></span>
                        <span>
                          <b>{p.nombre}</b>
                          <small>{p.cuadrante ?? "sin cuadrante: faltan productos con datos para comparar"}</small>
                        </span>
                        <span className="derecha"><b>{p.deja}</b>al mes</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sin-dato">Ningún producto tiene todavía con qué calcular cuánto deja al mes</p>
              )}
              {/* Lo completo, plegado. Abierto si se llegó recalculando las palancas: si no, el formulario se cerraría al usarlo. */}
              <details open={Boolean(busqueda.p_precio || busqueda.p_parte || busqueda.p_volumen)} style={{ marginTop: 12 }}>
                <summary className="enlace-azul" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: 6 }}>
                  Ver todo: por producto, margen y volumen, 90/10, palancas y cobros
                  <Icono nombre="abajo" tam={16} />
                </summary>
                <div style={{ marginTop: 12 }}>
                  <TableroRentabilidad t={tablero} config={config} noLeido={noLeido} operaciones={ops} pct={pct} conservar={{}} />
                </div>
              </details>
            </>
          ) : lineas.ok ? (
            <TableroRentabilidad t={tablero} config={config} noLeido={noLeido} operaciones={ops} pct={pct} conservar={{}} />
          ) : lineas.falta ? (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>
              Esta base todavía no tiene la tabla de líneas de producto: falta aplicar supabase/migracion-entrada-y-direccion.sql. Hasta entonces aquí no se puede guardar ni mostrar nada; no es que la empresa no venda nada.
            </p>
          ) : (
            <p className="sin-dato">No se pudieron leer las líneas de producto: vuelve a cargar la página</p>
          )}
        </div>
        <p style={{ margin: "16px 0 0" }}>
          <Link className="enlace-azul" href={`${base}/producto`}>Editar lo que anotó la empresa</Link>
        </p>
      </section>

      {/* 4 · LO QUE SE ESCAPA: cada fuga por su lado, sin total (no se suma un hueco). */}
      <section className="tarjeta" style={ANCHO} aria-labelledby="n-fugas">
        <div className="cabeza">
          <div>
            <h2 id="n-fugas">Fugas de dinero</h2>
            <p className="sub">Lo que se va cada mes sin que se vea. Cada una por su lado: no se suman.</p>
          </div>
          <Link className="ir" href={`${base}/producto#cobros-empresa`} aria-label="Ver cobros y mercadería">
            <Icono nombre="diagonal" />
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, marginTop: 14 }}>
          {fugas.map((f) => (
            <CeldaFuga key={f.clave} f={f} />
          ))}
        </div>
      </section>

      {/* 5 · LO QUE NO CUADRA entre lo declarado y lo que muestran los documentos */}
      <section className="tarjeta lista-tarjeta completa" aria-labelledby="n-cuadra">
        <div className="cabeza">
          <div>
            <h2 id="n-cuadra">Cifras que no cuadran</h2>
            <p className="sub">Lo declarado frente a lo que muestran los documentos, del mismo mes</p>
          </div>
          <Link className="ir" href={`${base}/realidad`} aria-label="Abrir la matriz de realidad">
            <Icono nombre="diagonal" />
          </Link>
        </div>
        {!guardadas.ok ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>No se pudieron leer los números: no se comparó nada</p>
        ) : noCuadran.length ? (
          <ul className="lista">
            {noCuadran.map((p, i) => (
              <li key={`${p.clave}|${p.periodo}|${i}`} className="urgente">
                <div>
                  <span className="icono-cuadro"><Icono nombre="aviso" /></span>
                  <span>
                    <b>{p.nombre} · {p.periodo}</b>
                    <small>{p.quien}: {p.declarado} · documento: {p.documento}</small>
                  </span>
                  <span className="derecha">
                    {p.diferenciaPct != null ? <><b>{p.diferenciaPct} %</b>de diferencia</> : "no cuadran"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="voz">Lo declarado y lo de los documentos cuadran, o todavía no hay con qué comparar.</p>
            <p className="nota" style={{ marginTop: 6 }}>
              {pares.length === 0
                ? motivoSinPares(ladosDisponibles(filasGuardadas))
                : [cuadran ? `${cuadran} ${cuadran === 1 ? "par cuadra" : "pares cuadran"} dentro de la tolerancia` : null, noComparables ? `${noComparables} no se ${noComparables === 1 ? "pudo" : "pudieron"} comparar (periodos distintos)` : null]
                    .filter(Boolean)
                    .join(" · ") + "."}
            </p>
          </>
        )}
        <p className="voz" style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
          <Link className="enlace-azul" href={`${base}/realidad`}>Matriz de realidad</Link>
          <Link className="enlace-azul" href={`${base}#incongruencias`}>Ver lo que no cuadra en el Diagnóstico</Link>
        </p>
      </section>

      {/* 6 · HISTORIA DEL NEGOCIO, plegada. También `hoja-suelta`: sus preguntas van en paneles con borde. */}
      <section className="tarjeta hoja-suelta" style={{ ...ANCHO, marginTop: 0 }} aria-labelledby="n-historia">
        <details>
          <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", gap: "4px 10px", flexWrap: "wrap" }}>
            <h2 id="n-historia">Historia del negocio</h2>
            <span className="sub" style={{ margin: 0, flex: "1 1 200px" }}>Cuándo empezó, su mejor época y qué cambió</span>
            <span className="ir" aria-hidden="true"><Icono nombre="abajo" /></span>
          </summary>
          <div style={{ marginTop: 14 }}>
            {ficha.ok ? (
              <HistoriaNegocio companyId={id} modo="consultora" historia={fichaNegocio.historia} editable config={config} ventaDorada={dorada?.valor ?? null} />
            ) : (
              <p className="sin-dato">{ficha.falta ? "Falta aplicar supabase/migracion-entrar-hoy.sql" : "No se pudo leer la historia: vuelve a cargar la página"}</p>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}

import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  radiografia, derivados, serieDeVentas, vitalesSoloDeDocumento, clavesDeCaja, deDondeSaleDeCaja, esDeCaja,
  CLAVES_VITALES, PERIODO_DORADA, ROTULO_CIFRA_PROVISIONAL, type Metrica,
} from "@/lib/metricas";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";
import { ultimosMeses, MESES } from "@/lib/temporadas";
import { zonaDe } from "@/lib/kpis";
import { leerHoraCierre } from "@/lib/negocio-datos";
import { MisNumeros } from "@/components/cliente/MisNumeros";
import { Avance } from "@/components/cliente/Avance";
import { lecturaDeCorte, diaEnZona, mesCerradoAnterior } from "@/lib/medicion";
import { cargarMediciones, cargarAccionesLigadas } from "@/components/medicion/datos";
import { Indicadores, type Indicador, type ValorIndicador } from "@/components/cliente/Indicadores";
import { leerIncongruencias } from "@/lib/diagnostico-datos";
import { pedidoDeSecciones, AvisoPedido, ListoPedido } from "@/components/negocio/PedidoDeConsultora";
import { Icono } from "@/components/base/Icono";
import { Barritas, Pista, type Barra } from "@/components/tablero/Piezas";
import { GraficoLinea, type PuntoLinea } from "@/components/tablero/GraficoLinea";

export const dynamic = "force-dynamic";

// ─────────────── EL TABLERO DE ARRIBA (16-10-2026, «Tus números» como destino) ───────────────
// Kelin: «diagnóstico, qué hay en números, indicadores y el avance». Antes de llenar, el dueño ve en un vistazo lo
// que ya cuentan sus números: lo que le queda, lo que vendió, cómo va su venta frente a lo que necesita para cubrir
// sus gastos y cuántos de sus nueve números ya dio. Lo que falta va rayado y con su nombre; nunca un «S/ 0» que nadie
// contó.
// REVISIÓN DEL 16-10-2026: debajo del tablero se repetía todo en otro formato (la franja de cifras y la radiografía
// «5 de 9», con «S/ 11,505» y «S/11,505»). Ahora cada cifra sale UNA vez, arriba, con su «Cómo se calculó» y su rótulo
// de provisional al lado; abajo, en su hoja, solo las preguntas. Y una cifra que en «Tu diagnóstico» se pide corregir
// (lo que le quedó, la venta de ese mes) aquí sale «por confirmar», no como un hecho: lo dice leerIncongruencias, con
// las mismas reglas.

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const mesLargo = (p: string) => MESES.find((m) => m.clave === p.slice(5, 7))?.nombre ?? p;
const mesCorto = (p: string) => (MESES.find((m) => m.clave === p.slice(5, 7))?.corto ?? p).toLowerCase();
const enSoles = (n: number) => `S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

/** El periodo AAAA-MM de `p` más `k` meses. */
function sumarMeses(p: string, k: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * El número de un mes más reciente con cifra, sin lo descartado. `provisional`: salió de un documento sin revisar.
 * `deCaja`: lo suma Finanzas con los movimientos de ese mes.
 */
function ultimoDelMes(metricas: Metrica[], clave: string): { valor: number; periodo: string; provisional: boolean; deCaja: boolean } | null {
  const m = metricas
    .filter((x) => x.clave === clave && x.valor != null && x.estado !== "descartado" && ES_MES.test(x.periodo))
    .sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
  return m ? { valor: Number(m.valor), periodo: m.periodo, provisional: m.estado === "extraido", deCaja: esDeCaja(m) } : null;
}

/**
 * «DE TU CAJA» (Finanzas, 19-10-2026): la cifra la suma la caja, no la contó el dueño. Va al lado de la cifra, con
 * enlace a donde se corrige: la caja, los cobros (lo que te deben) o los pagos (lo que debes). `texto` reemplaza la
 * frase cuando la cifra es una cuenta hecha con la caja («calculado con tu caja»).
 */
function DeTuCaja({ clave, texto, extra }: { clave: string; texto?: string; extra?: string }) {
  const d = deDondeSaleDeCaja(clave);
  return (
    <p className="fin-origen">
      <Link className="fin-de-caja" href={d.href}>{texto ?? d.texto}</Link>
      {extra && <span>{extra}</span>}
    </p>
  );
}

/** «Septiembre y Octubre», «Agosto, Septiembre y Octubre»; con más de tres, «De Mayo a Octubre». */
function mesesEnPalabras(meses: string[]): string {
  const nombres = meses.map(mesLargo);
  if (nombres.length > 3) return `De ${nombres[0]} a ${nombres.at(-1)!.toLowerCase()}`;
  return nombres.length === 1 ? nombres[0]! : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)!.toLowerCase()}`;
}

/** Los meses seguidos entre `desde` y `hasta`: un mes sin venta contada queda como hueco (rayado), nunca como cero. */
function mesesSeguidos(serie: { periodo: string; valor: number; provisional: boolean; deCaja?: true }[], desde: string, hasta: string) {
  const salida: { periodo: string; valor: number | null; provisional: boolean; deCaja?: true }[] = [];
  for (let p = desde; p <= hasta; p = sumarMeses(p, 1)) {
    const s = serie.find((x) => x.periodo === p);
    salida.push(s ?? { periodo: p, valor: null, provisional: false });
  }
  return salida;
}

/**
 * El detalle desplegable de cada cifra calculada: cómo se calcula, de qué periodo, de dónde salen
 * los números, qué se asume y qué no dice. Sin esto un número en pantalla es una afirmación; con
 * esto es una cuenta que el dueño puede rehacer.
 */
function DetalleCalculo({ calculo }: { calculo: Calculo<unknown> }) {
  return (
    <details className="detalle-calculo">
      <summary>Cómo se calculó</summary>
      <dl>
        {explicarCalculo(calculo).map((l) => (
          <div key={l.etiqueta}>
            <dt>{l.etiqueta}</dt>
            <dd>{l.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** «por confirmar» y adónde ir a corregirlo: una cifra con un dato abierto que no cuadra. */
function PorConfirmar({ que }: { que: string }) {
  return (
    <p className="nota por-confirmar">
      <span className="estado espera">por confirmar</span> {que} no cuadra con la cuenta de tus números.{" "}
      <Link href="/portal/diagnostico#incongruencias" className="enlace-azul">Corregir</Link>
    </p>
  );
}

/**
 * EL RÓTULO DE LO PROVISIONAL, JUNTO A LA CIFRA Y A LA VISTA. `derivados` ya sabía qué cifra se apoya en un
 * número leído de un documento sin revisar, pero aquí solo lo decía dentro de «Cómo se calculó», que está
 * plegado: el equilibrio y «estás S/X por encima» se leían como firmes. Lo extraído nunca es verificado.
 */
function RotuloProvisional({ enLinea = false }: { enLinea?: boolean }) {
  if (enLinea) return <span className="texto-espera"> ({ROTULO_CIFRA_PROVISIONAL})</span>;
  return <p className="rotulo-provisional">{ROTULO_CIFRA_PROVISIONAL.charAt(0).toUpperCase() + ROTULO_CIFRA_PROVISIONAL.slice(1)}.</p>;
}

/**
 * TUS NÚMEROS — la pantalla que faltaba. Hasta hoy los números solo entraban por lo que se lograba
 * pescar de la conversación, y la radiografía nunca se cerraba (una empresa: 18 números, 3 de los nueve
 * vitales). Aquí el dueño ve cuántos le faltan, los pone él mismo, y por primera vez los pone
 * POR MES: sin serie mensual no hay "cómo estuvo" ni con qué comparar después.
 */
export default async function Numeros() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const sb = supabaseAdmin();
  const [{ data: metricasRaw }, { data: empresa }, meds, { data: indicadoresRaw }, { data: reloj }, horaCierre, incongruencias] = await Promise.all([
    // `origen` para saber qué sale de la caja de Finanzas: eso se rotula «de tu caja» y no se ofrece escribir aquí.
    sb.from("company_metricas").select("clave,periodo,valor,estado,origen").eq("company_id", c.companyId).limit(200),
    sb.from("companies").select("ficha").eq("id", c.companyId).single(),
    cargarMediciones(sb, c.companyId),
    sb.from("indicadores").select("id,clave,nombre,como_se_mide,unidad,mejor_si,meta_valor,meta_texto,frecuencia,origen_texto,estado").eq("company_id", c.companyId).neq("estado", "archivado").order("created_at"),
    // El reloj de la empresa, en consulta aparte: si la columna no existiera en un entorno, la ficha se lee igual.
    sb.from("companies").select("zona_horaria").eq("id", c.companyId).maybeSingle(),
    // A qué hora cierra el negocio (lo diario de hoy se anota desde esa hora). Aparte: si la columna falta, no arrastra a la zona.
    leerHoraCierre(c.companyId),
    // Lo que no cuadra, con las reglas de «Tu diagnóstico». Si no se pudo leer, null: no se marca nada (no se inventa una duda).
    leerIncongruencias(c.companyId, { para: "dueno" }),
  ]);
  // Lo que pidió la consultora («Los números que faltan») va arriba, con su nota; «Listo» al final.
  const pedido = await pedidoDeSecciones(c.companyId, ["datos_faltantes"], c.u, zonaDe((reloj as { zona_horaria?: unknown } | null)?.zona_horaria));
  // «Hoy» y «el mes pasado» son los de la empresa, no los del servidor. Vacía o desconocida cae a America/Lima.
  const zona = zonaDe((reloj as { zona_horaria?: unknown } | null)?.zona_horaria);

  const metricas = (metricasRaw ?? []) as Metrica[];
  const r = radiografia(metricas);
  const d = derivados(metricas);
  const ficha = (empresa?.ficha ?? {}) as Record<string, unknown>;
  const altas = Array.isArray(ficha.temporadas_altas) ? (ficha.temporadas_altas as string[]) : [];

  // LAS VENTAS MES A MES, SIN LO DESCARTADO Y CON LO EXTRAÍDO MARCADO. Esta lista se pinta bajo «Lo que ya nos
  // contaste»: una venta leída de un documento salía ahí como contada por el dueño, y una descartada que
  // conservara su valor, también. La regla es pura (`serieDeVentas`) y se prueba sin navegador.
  const serieVenta = serieDeVentas(metricas);

  // La mejor época tampoco sale de una cifra descartada; si es extraída, lleva su rótulo al lado.
  const dorada = metricas.find((m) => m.clave === "venta_mes" && m.periodo === PERIODO_DORADA && m.valor != null && m.estado !== "descartado");

  // EL ANTES Y EL DESPUÉS: sin línea base congelada, "¿funcionó?" no tiene respuesta posible.
  // CON VERSIONES (13-10-2026): el punto de partida que rige es el VIGENTE —nunca «la primera fila que
  // aparezca», que podría ser una reemplazada— y el último corte se compara SOLO con la versión exacta
  // contra la que se midió. Volver a fijar el punto de partida no cambia lo que ya se le dijo al dueño.
  // LA MISMA LECTURA QUE «TUS RESULTADOS»: `lecturaDeCorte` da el titular, el veredicto de períodos y qué
  // parte de lo observado se puede atribuir al trabajo (solo con acción verificada). Esta pantalla decía
  // «El negocio deja S/X más al mes…» con los mismos datos con los que la otra avisaba de que los períodos
  // no eran comparables. Las acciones se leen solo si hay un corte que leer.
  const base = meds.vigente;
  const cortes = meds.cortes;
  const ultimoCorte = cortes[0] ?? null;
  // La zona va con la lectura: si una acción se verificó dentro del período medido se decide en el calendario de la empresa.
  const lectura = ultimoCorte ? lecturaDeCorte({ corte: ultimoCorte, mediciones: meds.mediciones, acciones: await cargarAccionesLigadas(sb, c.companyId), zona }) : null;
  // EL PERÍODO SE PIDE AL CONGELAR: sin saber de qué fechas son los números, ningún corte se puede leer como
  // resultado. El día de hoy y el último mes cerrado se calculan aquí, en la zona horaria de la empresa (el
  // servidor no vive allí), y se le OFRECEN al dueño con un toque; no se rellenan solos.
  const hoy = diaEnZona(new Date(), zona);
  const mesPasado = mesCerradoAnterior(hoy);
  // Los meses que se ofrecen en «Tus números» salen del mismo día: a las 8 de la noche del 31 en Lima el
  // servidor ya está en el mes siguiente, y «el mes pasado» era el que todavía no había cerrado.
  const [anioHoy = 0, mesHoy = 1, diaHoy = 1] = hoy.split("-").map(Number);
  const mesesDisponibles = ultimosMeses(new Date(anioHoy, mesHoy - 1, diaHoy), 14);

  // LO QUE SE REPITE SE MIDE: los indicadores que salieron de las incidencias, con sus valores.
  const indicadores = (indicadoresRaw ?? []) as Indicador[];
  const clavesInd = new Set(indicadores.map((i) => i.clave));
  const valoresInd: ValorIndicador[] = metricas
    .filter((m) => clavesInd.has(m.clave) && m.valor != null && m.estado !== "descartado" && /^[0-9]{4}-[0-9]{2}$/.test(m.periodo))
    .map((m) => ({ clave: m.clave, periodo: m.periodo, valor: Number(m.valor) }));

  // ── Lo que pinta el tablero de arriba, todo de lo ya leído ──
  const queda = ultimoDelMes(metricas, "ganancia_mes");
  const vendio = serieVenta[0] ?? null;
  const ventasAsc = [...serieVenta].reverse();
  // La línea: hasta doce meses seguidos que terminan en el último con venta. Las barritas: los últimos seis.
  const desdeLinea = vendio ? (ventasAsc[0]!.periodo > sumarMeses(vendio.periodo, -11) ? ventasAsc[0]!.periodo : sumarMeses(vendio.periodo, -11)) : null;
  const linea: PuntoLinea[] =
    vendio && desdeLinea
      ? mesesSeguidos(ventasAsc, desdeLinea, vendio.periodo).map((m) => ({ corto: mesCorto(m.periodo), largo: mesLargo(m.periodo), valor: m.valor }))
      : [];
  const conVenta = linea.filter((p) => p.valor != null).length;
  const seisMeses: Barra[] = vendio
    ? mesesSeguidos(ventasAsc, sumarMeses(vendio.periodo, -5), vendio.periodo).map((m) => ({ valor: m.valor, dicho: m.valor != null && m.provisional }))
    : [];
  const huecos = seisMeses.filter((b) => b.valor == null).length;
  const equilibrio = d.equilibrio;
  const faltanNombres = r.faltan.map((v) => v.nombre);
  // ¿Hay un dato abierto que no cuadra sobre esta misma cifra? Uno sin periodo vale para cualquiera.
  const enDuda = (clave: string, periodo: string) => !!incongruencias?.some((i) => !i.resuelta && i.clave === clave && (i.periodo == null || i.periodo === periodo));
  const quedaEnDuda = !!queda && enDuda("ganancia_mes", queda.periodo);
  const vendioEnDuda = !!vendio && enDuda("venta_mes", vendio.periodo);

  // ── LO QUE SALE DE LA CAJA (Finanzas, 19-10-2026). La caja escribe con origen 'caja' las ventas, los costos, los gastos
  // fijos y lo que quedó de cada mes, y hoy: el dinero en caja y lo que te deben y debes. Eso no se escribe dos veces:
  // se rotula, se avisa arriba y el formulario no lo ofrece (la ruta lo rechaza igual).
  const deCaja = metricas.filter((m) => esDeCaja(m) && m.valor != null && m.estado !== "descartado");
  const mesesDeCaja = [...new Set(deCaja.map((m) => m.periodo).filter((p) => ES_MES.test(p)))].sort();
  const cajaDe = (clave: string) => deCaja.find((m) => m.clave === clave && m.periodo === "actual") ?? null;
  const cajaHoy = cajaDe("caja_hoy");
  const vitalesDeCaja = new Set(deCaja.map((m) => m.clave).filter((k) => CLAVES_VITALES.has(k))).size;
  // La línea dice de dónde sale cada mes solo si hay de los dos: con todo de la caja (o todo contado) basta el subtítulo.
  const mesesDeLinea = vendio && desdeLinea ? mesesSeguidos(ventasAsc, desdeLinea, vendio.periodo).filter((m) => m.valor != null) : [];
  const lineaMezclada = mesesDeLinea.some((m) => m.deCaja) && mesesDeLinea.some((m) => !m.deCaja);

  return (
    <>
      <div className="tablero">
        <header className="a-lo-ancho" style={{ padding: "6px 4px 0" }}>
          <p className="t-etiqueta">Los números de tu negocio</p>
          <h1 className="hola"><strong>Tus números</strong></h1>
          <p className="bienvenida medida">
            {deCaja.length > 0
              ? "Nueve números cuentan la salud de cualquier negocio. Desde que usas Finanzas, los que salen de tu caja se llenan solos; el resto, contesta de memoria."
              : "Nueve números cuentan la salud de cualquier negocio. No hace falta contabilidad ni buscar papeles: contesta de memoria, como si te lo preguntáramos hablando."}
          </p>
        </header>

        {deCaja.length > 0 && (
          <div className="fin-aviso-caja a-lo-ancho" role="note">
            <p>
              {mesesDeCaja.length > 0 ? (
                <>
                  <b>{mesesEnPalabras(mesesDeCaja)} {mesesDeCaja.length === 1 ? "sale" : "salen"} de tu caja.</b> Si un número de{" "}
                  {mesesDeCaja.length === 1 ? "ese mes" : "esos meses"} no cuadra, se corrige el movimiento en Finanzas: aquí no se escribe dos veces.
                </>
              ) : (
                <>
                  <b>Algunos de tus números salen de tu caja.</b> Si uno no cuadra, se corrige en Finanzas: aquí no se escribe dos veces.
                </>
              )}
            </p>
            <Link className="boton-fin" href="/os/finanzas">Ir a Finanzas</Link>
          </div>
        )}

        <section className="tarjeta cifra-tarjeta" aria-labelledby="n-queda">
          <div className="cabeza">
            <div>
              <h2 id="n-queda">Lo que te queda</h2>
              <p className="sub">{queda ? `${mesLargo(queda.periodo)}, ya pagado todo` : "Libre, ya pagado todo"}</p>
            </div>
            <Link className="ir" href="#formulario" aria-label="Ir a tus números para contarlo"><Icono nombre="diagonal" /></Link>
          </div>
          <div className="fila-cifra">
            {queda ? (
              queda.valor >= 0 ? (
                <span className="grande" style={quedaEnDuda ? { color: "var(--grafito)" } : undefined}><small className="moneda">S/</small>{Math.round(queda.valor).toLocaleString("es-PE")}<small>al mes</small></span>
              ) : (
                <span className="grande" style={{ color: quedaEnDuda ? "var(--grafito)" : "var(--contradicho)" }}><small className="moneda" style={{ color: "inherit" }}>−S/</small>{Math.round(Math.abs(queda.valor)).toLocaleString("es-PE")}<small>perdiste</small></span>
              )
            ) : (
              <span className="sin-dato">Todavía no lo contaste</span>
            )}
          </div>
          {queda?.deCaja && <DeTuCaja clave="ganancia_mes" />}
          {queda?.provisional && <RotuloProvisional />}
          {quedaEnDuda && <PorConfirmar que="Esta cifra" />}
          {/* De cada 100 soles: sale de lo que le queda, así que va con él y con la misma duda. */}
          {d.margen != null && (
            <div className="lectura-chica">
              <span className="num" style={{ color: quedaEnDuda ? "var(--grafito)" : d.margen < 10 ? "var(--contradicho)" : undefined }}>{d.margen.toFixed(0)} %</span>
              <p className="nota">de cada 100 soles, te queda</p>
              {d.provisional.margen && <RotuloProvisional />}
              <DetalleCalculo calculo={d.detalle.margen} />
            </div>
          )}
        </section>

        <section className="tarjeta cifra-tarjeta" aria-labelledby="n-vendio">
          <div className="cabeza">
            <div>
              <h2 id="n-vendio">Lo que vendiste</h2>
              <p className="sub">{vendio ? mesLargo(vendio.periodo) : "Tus ventas del mes"}</p>
            </div>
            <Link className="ir" href="#formulario" aria-label="Ir a tus números para contarlo"><Icono nombre="diagonal" /></Link>
          </div>
          {vendio ? (
            <>
              <div className="fila-cifra">
                <span className="grande" style={vendioEnDuda ? { color: "var(--grafito)" } : undefined}><small className="moneda">S/</small>{Math.round(vendio.valor).toLocaleString("es-PE")}</span>
                <Barritas barras={seisMeses} etiqueta="Ventas de los últimos seis meses" />
              </div>
              {huecos > 0 && <p className="pie-barritas">Rayado: {huecos === 1 ? "un mes" : `${huecos} meses`} sin venta contada</p>}
              {vendio.deCaja && <DeTuCaja clave="venta_mes" />}
              {vendio.provisional && <RotuloProvisional />}
              {vendioEnDuda && <PorConfirmar que="Esta cifra" />}
            </>
          ) : (
            <div className="fila-cifra"><span className="sin-dato">Todavía sin ventas contadas</span></div>
          )}
        </section>

        {/* EL EQUILIBRIO QUE SE MUESTRA ES EL DE LA EMPRESA (D5): fijos entre lo que queda de cada sol vendido después
            de pagar lo que cuesta lo vendido. Sin costos variables no hay cifra y se dice por qué. */}
        <section className="tarjeta cifra-tarjeta" aria-labelledby="n-equilibrio">
          <div className="cabeza">
            <div>
              <h2 id="n-equilibrio">Para cubrir tus costos</h2>
              <p className="sub">Lo que necesitas vender al mes</p>
            </div>
          </div>
          <div className="fila-cifra">
            {equilibrio != null ? (
              <span className="grande"><small className="moneda">S/</small>{Math.round(equilibrio).toLocaleString("es-PE")}</span>
            ) : (
              <span className="sin-dato">Aún por calcular</span>
            )}
          </div>
          {equilibrio != null ? (
            <div className="lectura-chica">
              <p className="nota">tienes que vender al mes para cubrir tus costos</p>
              {vendio?.deCaja && <DeTuCaja clave="venta_mes" texto="calculado con tu caja" />}
              {d.provisional.equilibrio && <RotuloProvisional />}
              <DetalleCalculo calculo={d.detalle.equilibrio} />
            </div>
          ) : (
            d.detalle.equilibrio.motivo_nulo && <p className="nota">{d.detalle.equilibrio.motivo_nulo}</p>
          )}
        </section>

        <section className="tarjeta cifra-tarjeta" aria-labelledby="n-aguante">
          <div className="cabeza">
            <div>
              <h2 id="n-aguante">Cuánto aguantas</h2>
              <p className="sub">Con la caja de hoy</p>
            </div>
          </div>
          <div className="fila-cifra">
            {d.diasAguante != null ? (
              <span className="grande" style={d.diasAguante < 30 ? { color: "var(--contradicho)" } : undefined}>{Math.round(d.diasAguante)}<small>días</small></span>
            ) : (
              <span className="sin-dato">Aún por calcular</span>
            )}
          </div>
          {d.diasAguante != null ? (
            <div className="lectura-chica">
              <p className="nota">aguantas si mañana no entra nada</p>
              {cajaHoy && <DeTuCaja clave="caja_hoy" extra={`${enSoles(Number(cajaHoy.valor))} en caja hoy`} />}
              {d.provisional.diasAguante && <RotuloProvisional />}
              <DetalleCalculo calculo={d.detalle.diasAguante} />
            </div>
          ) : (
            <>
              <p className="nota">Hacen falta tu dinero en caja y lo que pagas sí o sí cada mes.</p>
              {cajaHoy && <DeTuCaja clave="caja_hoy" extra={`${enSoles(Number(cajaHoy.valor))} en caja hoy`} />}
            </>
          )}
        </section>

        <section className="tarjeta linea-tarjeta a-lo-ancho" aria-labelledby="n-linea">
          <div className="cabeza">
            <div>
              <h2 id="n-linea">Tus ventas mes a mes</h2>
              <p className="sub">
                {equilibrio != null
                  ? "La raya es lo que necesitas vender para cubrir tus gastos"
                  : mesesDeCaja.length > 0
                    ? "De tu caja, de lo que contaste y de tus documentos"
                    : "De lo que contaste y de tus documentos"}
              </p>
            </div>
          </div>
          {conVenta >= 2 && vendio ? (
            <>
              {/* Al lado de la línea, lo que la línea dice: cuánto por encima (o por debajo) de la raya quedó el último mes.
                  Lo que vendió ya está en su tarjeta, arriba: aquí no se repite. */}
              <div className="resumen">
                {d.sobreEquilibrio != null ? (
                  <>
                    <span className="num" style={d.sobreEquilibrio < 0 ? { color: "var(--contradicho)" } : undefined}>{enSoles(d.sobreEquilibrio)}</span>
                    <p>
                      {d.sobreEquilibrio >= 0 ? "por encima" : "por debajo"} de lo que necesitas vender, con lo de {mesLargo(vendio.periodo).toLowerCase()}
                      {d.provisional.equilibrio && <RotuloProvisional enLinea />}.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="num">{enSoles(vendio.valor)}</span>
                    <p>en {mesLargo(vendio.periodo).toLowerCase()}{vendio.provisional && <RotuloProvisional enLinea />}.</p>
                  </>
                )}
              </div>
              <GraficoLinea
                puntos={linea}
                formato="soles"
                etiqueta="Ventas por mes"
                referencia={equilibrio != null ? { valor: equilibrio, texto: `lo que necesitas para cubrir tus gastos: ${enSoles(equilibrio)}` } : null}
              />
              {/* QUÉ MES SALE DE LA CAJA Y CUÁL CONTASTE (Finanzas): con los dos en la misma línea, cada mes dice el suyo. */}
              {lineaMezclada && (
                <>
                  <div className="fin-leyenda" aria-hidden="true">
                    <span><i className="caja" />De tu caja</span>
                    <span><i className="contado" />Lo contaste</span>
                  </div>
                  <ul className="fin-meses-origen" aria-label="De dónde sale cada mes">
                    {mesesDeLinea.map((m) => (
                      <li key={m.periodo} className={m.deCaja ? "caja" : "contado"}>
                        <span className="marca" aria-hidden="true" />
                        {mesCorto(m.periodo)} <b>{enSoles(m.valor!)}</b>
                        <span className="sr-only">{m.deCaja ? ", de tu caja" : ", lo contaste"}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="sin-dato" style={{ gridColumn: "1 / -1", marginTop: 12 }}>
              {vendio ? "Hacen falta dos meses de ventas para dibujar la línea" : "Todavía sin ventas contadas"}
            </p>
          )}
          {/* Esta frase sale del equilibrio: si él es provisional, ella también, y se dice en la misma línea. Con la línea
              dibujada ya lo dice su resumen, al lado; sin línea, se dice aquí. */}
          {d.sobreEquilibrio != null && !(conVenta >= 2 && vendio) && (
            <p className="nota" style={{ gridColumn: "1 / -1" }}>
              {d.sobreEquilibrio >= 0
                ? `Vendiendo lo del último mes ${d.provisional.equilibrio ? "estarías" : "estás"} ${enSoles(d.sobreEquilibrio)} por encima de tu punto de equilibrio`
                : `Cuidado: con lo del último mes te ${d.provisional.equilibrio ? "faltarían" : "faltan"} ${enSoles(Math.abs(d.sobreEquilibrio))} para llegar a tu punto de equilibrio`}
              {d.provisional.equilibrio && <RotuloProvisional enLinea />}.
            </p>
          )}
          {dorada?.valor != null && serieVenta[0] && (
            <p className="nota" style={{ gridColumn: "1 / -1" }}>
              Tu mejor época vendías {enSoles(Number(dorada.valor))} al mes{dorada.estado === "extraido" && <RotuloProvisional enLinea />}. Hoy, {enSoles(serieVenta[0].valor)}
              {serieVenta[0].provisional && <RotuloProvisional enLinea />}.
            </p>
          )}
          {d.equilibrioProductoEstrella != null && (
            <div style={{ gridColumn: "1 / -1" }}>
              <p className="nota">
                Si todo lo que vendieras fuera lo que más vendes, necesitarías vender {enSoles(d.equilibrioProductoEstrella)} al mes para cubrir
                tus gastos fijos{d.provisional.equilibrioProductoEstrella && <RotuloProvisional enLinea />}. Es una hipótesis para conversar, no el punto de equilibrio de tu negocio.
              </p>
              <DetalleCalculo calculo={d.detalle.equilibrioProductoEstrella} />
            </div>
          )}
        </section>
        <section className="tarjeta fuentes-tarjeta a-lo-ancho" aria-labelledby="n-nueve">
          <div className="cabeza">
            <div>
              <h2 id="n-nueve">De tus 9 números: {r.listos}{vitalesDeCaja > 0 ? ` · ${vitalesDeCaja} ${vitalesDeCaja === 1 ? "sale solo" : "salen solos"} de Finanzas` : ""}</h2>
              <p className="sub">Lleno: ya nos lo dijiste, aunque sea «no lo sé». Rayado: falta.</p>
            </div>
            <Link className="ir" href="#formulario" aria-label="Completar tus números"><Icono nombre="diagonal" /></Link>
          </div>
          <div className="fuentes">
            <div className="fuente">
              <span className="icono"><Icono nombre="numeros" /></span>
              <div className="rotulo"><b>Tus números del negocio</b><span>{r.listos} de {r.total}</span></div>
              <Pista lleno={r.listos} resto={r.total - r.listos} escala={r.total} />
            </div>
          </div>
          <p className="nota" style={{ marginTop: 14 }}>
            {faltanNombres.length > 0
              ? `Falta${faltanNombres.length === 1 ? "" : "n"}: ${faltanNombres.join(" · ")}. Sin ellos, cualquier diagnóstico es opinión.`
              : "Ya diste los nueve. Puedes corregir cualquiera aquí abajo."}
          </p>
        </section>
      </div>

      {/* LO QUE SE LLENA, en su hoja: las preguntas. Las cifras ya están arriba, una vez cada una. Los enlaces del tablero bajan hasta aquí. */}
      <div className="hoja-suelta" id="formulario">
        <AvisoPedido p={pedido} />

        {/* ¿FUNCIONÓ? Va arriba de todo cuando ya hay con qué responder. */}
        {base && ultimoCorte && (
          <div className="mb-9">
            <Avance companyId={c.companyId} base={base} ultimoCorte={ultimoCorte} lectura={lectura} cortes={cortes} numerosListos={r.listos} mesPasado={mesPasado} hoy={hoy} />
          </div>
        )}

        {/* Los indicadores propios ya tienen su sección abajo: no se repiten como «otros números». */}
        <MisNumeros
          conRadiografia={false}
          radiografia={{ ...r, otros: r.otros.filter((o) => !clavesInd.has(o.clave)) }}
          serieVenta={serieVenta}
          soloDeDocumento={vitalesSoloDeDocumento(metricas)}
          deCaja={clavesDeCaja(deCaja)}
          temporadasAltas={altas}
          mesesDisponibles={mesesDisponibles}
        />

        <div className="mt-9">
          <Indicadores companyId={c.companyId} indicadores={indicadores} valores={valoresInd} zona={zona} horaCierre={horaCierre} />
        </div>

        {/* Sin comparación todavía: el punto de partida va abajo, después de que ponga sus números. */}
        {!(base && ultimoCorte) && (
          <div className="mt-9">
            <Avance companyId={c.companyId} base={base} ultimoCorte={ultimoCorte} lectura={lectura} cortes={cortes} numerosListos={r.listos} mesPasado={mesPasado} hoy={hoy} />
          </div>
        )}

        <ListoPedido p={pedido} />
      </div>
    </>
  );
}

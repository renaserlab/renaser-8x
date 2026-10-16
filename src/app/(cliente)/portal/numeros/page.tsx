import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { radiografia, derivados, serieDeVentas, vitalesSoloDeDocumento, PERIODO_DORADA, ROTULO_CIFRA_PROVISIONAL, type Metrica } from "@/lib/metricas";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";
import { ultimosMeses } from "@/lib/temporadas";
import { zonaDe } from "@/lib/kpis";
import { MisNumeros } from "@/components/cliente/MisNumeros";
import { Avance } from "@/components/cliente/Avance";
import { lecturaDeCorte, diaEnZona, mesCerradoAnterior } from "@/lib/medicion";
import { cargarMediciones, cargarAccionesLigadas } from "@/components/medicion/datos";
import { Indicadores, type Indicador, type ValorIndicador } from "@/components/cliente/Indicadores";
import { Franja, Lectura } from "@/components/base/Franja";

export const dynamic = "force-dynamic";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * El detalle desplegable de cada cifra calculada: cómo se calcula, de qué periodo, de dónde salen
 * los números, qué se asume y qué no dice. Sin esto un número en pantalla es una afirmación; con
 * esto es una cuenta que el dueño puede rehacer.
 */
function DetalleCalculo({ calculo }: { calculo: Calculo<unknown> }) {
  return (
    <details style={{ marginTop: 4 }}>
      <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)", fontSize: 12 }}>Cómo se calculó</summary>
      <dl style={{ marginTop: 6, display: "grid", gap: 6 }}>
        {explicarCalculo(calculo).map((l) => (
          <div key={l.etiqueta}>
            <dt className="t-etiqueta" style={{ fontSize: 10 }}>{l.etiqueta}</dt>
            <dd className="t-dato" style={{ margin: 0, fontSize: 12, color: "var(--grafito)", whiteSpace: "normal" }}>{l.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * EL RÓTULO DE LO PROVISIONAL, JUNTO A LA CIFRA Y A LA VISTA. `derivados` ya sabía qué cifra se apoya en un
 * número leído de un documento sin revisar, pero aquí solo lo decía dentro de «Cómo se calculó», que está
 * plegado: el equilibrio y «estás S/X por encima» se leían como firmes. Lo extraído nunca es verificado.
 */
function RotuloProvisional({ enLinea = false }: { enLinea?: boolean }) {
  const estilo = { color: "var(--caducado)", fontWeight: 600 } as const;
  if (enLinea) return <span style={estilo}> ({ROTULO_CIFRA_PROVISIONAL})</span>;
  return <p className="t-dato" style={{ ...estilo, fontSize: 12, marginTop: 2 }}>{ROTULO_CIFRA_PROVISIONAL.charAt(0).toUpperCase() + ROTULO_CIFRA_PROVISIONAL.slice(1)}.</p>;
}

/**
 * TUS NÚMEROS — la pantalla que faltaba. Hasta hoy los números solo entraban por lo que se lograba
 * pescar de la conversación, y la radiografía nunca se cerraba (Qori: 18 números, 3 de los nueve
 * vitales). Aquí el dueño ve cuántos le faltan, los pone él mismo, y por primera vez los pone
 * POR MES: sin serie mensual no hay "cómo estuvo" ni con qué comparar después.
 */
export default async function Numeros() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const sb = supabaseAdmin();
  const [{ data: metricasRaw }, { data: empresa }, meds, { data: indicadoresRaw }, { data: reloj }] = await Promise.all([
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(200),
    sb.from("companies").select("ficha").eq("id", c.companyId).single(),
    cargarMediciones(sb, c.companyId),
    sb.from("indicadores").select("id,clave,nombre,como_se_mide,unidad,mejor_si,meta_valor,meta_texto,frecuencia,origen_texto,estado").eq("company_id", c.companyId).neq("estado", "archivado").order("created_at"),
    // El reloj de la empresa, en consulta aparte: si la columna no existiera en un entorno, la ficha se lee igual.
    sb.from("companies").select("zona_horaria").eq("id", c.companyId).maybeSingle(),
  ]);
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

  return (
    <>
      <p className="t-etiqueta">Los números de tu negocio</p>
      <h1 className="t-titulo mt-2 mb-2">Tus números</h1>
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Nueve números cuentan la salud de cualquier negocio. No hace falta contabilidad ni buscar papeles:
        contesta de memoria, como si te lo preguntáramos hablando.
      </p>

      {/* LO QUE YA SE PUEDE CALCULAR: la recompensa por haber contestado. Cada cifra con su detalle.
          EL EQUILIBRIO QUE SE MUESTRA ES EL DE LA EMPRESA (D5): fijos entre lo que queda de cada sol
          vendido después de pagar lo que cuesta lo vendido. Sin costos variables no hay cifra y se dice
          por qué; la del producto estrella va aparte, rotulada como la hipótesis que es. Y toda cifra que
          se apoye en un número leído de un documento sin revisar lleva su rótulo al lado, no plegado. */}
      {(d.margen != null || d.diasAguante != null || d.equilibrio != null || d.equilibrioProductoEstrella != null) && (
        <div className="mb-8">
          <Franja columnas={3}>
            <Lectura
              divisor={false}
              valor={d.margen != null ? `${d.margen.toFixed(0)}%` : "—"}
              etiqueta="de cada 100 soles, te queda"
              color={d.margen != null && d.margen < 10 ? "var(--contradicho)" : undefined}
              extra={<>{d.provisional.margen && <RotuloProvisional />}<DetalleCalculo calculo={d.detalle.margen} /></>}
            />
            <Lectura
              valor={d.diasAguante != null ? String(Math.round(d.diasAguante)) : "—"}
              unidad={d.diasAguante != null ? "días" : undefined}
              etiqueta="aguantas si mañana no entra nada"
              color={d.diasAguante != null && d.diasAguante < 30 ? "var(--contradicho)" : undefined}
              extra={<>{d.provisional.diasAguante && <RotuloProvisional />}<DetalleCalculo calculo={d.detalle.diasAguante} /></>}
            />
            <Lectura
              valor={d.equilibrio != null ? soles(d.equilibrio) : "—"}
              etiqueta={d.equilibrio != null ? "tienes que vender al mes para cubrir tus costos" : "desde qué venta cubres tus costos"}
              extra={<>{d.provisional.equilibrio && <RotuloProvisional />}<DetalleCalculo calculo={d.detalle.equilibrio} /></>}
            />
          </Franja>
          {d.equilibrio == null && d.detalle.equilibrio.motivo_nulo && (
            <p className="t-cuerpo mt-3 medida">{d.detalle.equilibrio.motivo_nulo}</p>
          )}
          {/* Esta frase sale del equilibrio: si él es provisional, ella también, y se dice en la misma línea. */}
          {d.sobreEquilibrio != null && (
            <p className="t-cuerpo mt-3 medida">
              {d.sobreEquilibrio >= 0
                ? `Vendiendo lo del último mes ${d.provisional.equilibrio ? "estarías" : "estás"} ${soles(d.sobreEquilibrio)} por encima de tu punto de equilibrio`
                : `Cuidado: con lo del último mes te ${d.provisional.equilibrio ? "faltarían" : "faltan"} ${soles(Math.abs(d.sobreEquilibrio))} para llegar a tu punto de equilibrio`}
              {d.provisional.equilibrio && <RotuloProvisional enLinea />}.
            </p>
          )}
          {d.equilibrioProductoEstrella != null && (
            <div className="mt-3 medida">
              <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
                Si todo lo que vendieras fuera lo que más vendes, necesitarías vender {soles(d.equilibrioProductoEstrella)} al mes para cubrir
                tus gastos fijos{d.provisional.equilibrioProductoEstrella && <RotuloProvisional enLinea />}. Es una hipótesis para conversar, no el punto de equilibrio de tu negocio.
              </p>
              <DetalleCalculo calculo={d.detalle.equilibrioProductoEstrella} />
            </div>
          )}
          {dorada?.valor != null && serieVenta[0] && (
            <p className="t-cuerpo mt-1 medida" style={{ color: "var(--grafito)" }}>
              Tu mejor época vendías {soles(Number(dorada.valor))} al mes{dorada.estado === "extraido" && <RotuloProvisional enLinea />}. Hoy, {soles(serieVenta[0].valor)}
              {serieVenta[0].provisional && <RotuloProvisional enLinea />}.
            </p>
          )}
        </div>
      )}

      {/* ¿FUNCIONÓ? Va arriba de todo cuando ya hay con qué responder. */}
      {base && ultimoCorte && (
        <div className="mb-9">
          <Avance companyId={c.companyId} base={base} ultimoCorte={ultimoCorte} lectura={lectura} cortes={cortes} numerosListos={r.listos} mesPasado={mesPasado} hoy={hoy} />
        </div>
      )}

      {/* Los indicadores propios ya tienen su sección abajo: no se repiten como «otros números». */}
      <MisNumeros
        radiografia={{ ...r, otros: r.otros.filter((o) => !clavesInd.has(o.clave)) }}
        serieVenta={serieVenta}
        soloDeDocumento={vitalesSoloDeDocumento(metricas)}
        temporadasAltas={altas}
        mesesDisponibles={mesesDisponibles}
      />

      <div className="mt-9">
        <Indicadores companyId={c.companyId} indicadores={indicadores} valores={valoresInd} zona={zona} />
      </div>

      {/* Sin comparación todavía: el punto de partida va abajo, después de que ponga sus números. */}
      {!(base && ultimoCorte) && (
        <div className="mt-9">
          <Avance companyId={c.companyId} base={base} ultimoCorte={ultimoCorte} lectura={lectura} cortes={cortes} numerosListos={r.listos} mesPasado={mesPasado} hoy={hoy} />
        </div>
      )}
    </>
  );
}

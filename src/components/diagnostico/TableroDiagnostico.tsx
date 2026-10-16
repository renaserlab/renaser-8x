import type { ReactNode } from "react";
import Link from "next/link";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { Medidor, Segmentos } from "@/components/tablero/Piezas";
import { GraficoLinea, type PuntoLinea } from "@/components/tablero/GraficoLinea";
import { ESTADO_PILAR, PILAR } from "@/lib/textos";
import { ROTULO_CIFRA_PROVISIONAL, periodoEnPalabras } from "@/lib/metricas";
import { moneda, porDefecto, type ConfigEmpresa } from "@/lib/formato";
import { ORIGEN_CONSULTORA, ORIGEN_DUENO, abiertasDe, type Incongruencia, type Lado } from "@/lib/incongruencias";
import type { ItemFalta, TableroDiagnostico as Tablero } from "@/lib/diagnostico-tablero";

/*
CONTRATO DE DIRECCIÓN — el diagnóstico de una empresa (pedido de Kelin, 16-10-2026)
THESIS: en diez segundos, qué frena a la empresa y cuánto cuesta; debajo, cuatro bloques con su gráfico —procesos,
  dependencia del dueño, dinero, resultado—, lo que no cuadra y lo que falta, con un botón para pedírselo al cliente.
OWN-WORLD: el mismo tablero de la bandeja y del Inicio del dueño: cielo, tarjetas blancas, Manrope en las cifras.
FINISH: cada trazo es un dato de la base; lo que no hay va rayado y con su nombre, nunca como cero. Lo que no cuadra
  se ve arriba, con las dos cifras a la vista.
La consultora y el dueño ven el mismo tablero con palabras distintas: `t.para` decide cuáles.
*/

type Props = {
  t: Tablero;
  /** `/empresa/${id}` o `/portal`. */
  base: string;
  /** Lo que se puede hacer con cada dato que no cuadra (el dueño: «Corregir este dato»). */
  accionIncongruencia?: (i: Incongruencia) => ReactNode;
  /** Lo que se puede hacer con cada cosa que falta (la consultora: «Pedírselo al cliente»). */
  accionFalta?: (f: ItemFalta) => ReactNode;
  /** Una sola acción para toda la lista de lo que no cuadra (la consultora: «Pedir al cliente que los corrija»). */
  accionLista?: ReactNode;
  /**
   * El dueño: ¿puede corregir aquí y ahora (su cuenta y «Confirmar lo que encontramos» o «Los números que faltan»
   * abierta)? Si no, el aviso no le promete «Corrígelos en un minuto»: solo le muestra lo que no cuadra.
   */
  puedeCorregir?: boolean;
  /** Lo que va antes de todo (un aviso de la pantalla, p. ej. la admisión pendiente). */
  arriba?: ReactNode;
  /** Tarjetas al final, plegadas (la ficha de trabajo, todo lo que se le puede pedir). */
  children?: ReactNode;
};

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const corto = (p: string) => MES_CORTO[Number(p.slice(5, 7)) - 1] ?? p;
const largo = (p: string) => `${MES_LARGO[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

/** Un monto en la moneda de la empresa; si su configuración no se entiende, en soles. */
function plata(n: number, config: ConfigEmpresa): string {
  try {
    return moneda(n, config);
  } catch {
    return moneda(n, porDefecto);
  }
}

const CLASE_PILAR: Record<string, string> = { solido: "ok", mejorable: "espera", critico: "alto", desconocido: "neutro" };
const ICONO_FALTA: Record<string, NombreIcono> = {
  incongruencias: "aviso", numeros: "numeros", productos: "tabla", costos: "numeros", historia: "reloj",
  procesos: "procesos", organigrama: "persona", por_confirmar: "ojo", evidencia: "voz",
};

/** La palabra en singular o en plural, según cuántos son. */
const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Un enlace de la base: «#ancla» y «/subruta» se cuelgan de ella. */
const enBase = (base: string, href: string) => `${base}${href}`;

// ─── Lo que no cuadra ────────────────────────────────────────────────────────────────────────────

function LadoDe({ l, para, solo = false }: { l: Lado; para: Tablero["para"]; solo?: boolean }) {
  const origen = para === "dueno" ? ORIGEN_DUENO[l.origen] : ORIGEN_CONSULTORA[l.origen];
  const esCifra = l.valor != null && !l.rango;
  return (
    <div className="lado" style={solo ? { gridColumn: "1 / -1" } : undefined}>
      {esCifra ? <span className="grande">{l.texto}</span> : <p className="t-dato" style={{ margin: 0, fontWeight: 650, fontSize: 15, overflowWrap: "anywhere" }}>{l.rango ? l.texto : `«${l.texto}»`}</p>}
      <p className="sub">{origen.charAt(0).toUpperCase() + origen.slice(1)}</p>
      {para === "consultora" && l.detalle && <p className="nota">{l.detalle}</p>}
    </div>
  );
}

function Fila({ i, t, accion }: { i: Incongruencia; t: Tablero; accion?: (i: Incongruencia) => ReactNode }) {
  const consultora = t.para === "consultora";
  const solo = !i.derecha;
  return (
    <li className="incongruencia" data-resuelta={i.resuelta ? "" : undefined} data-regla={i.regla}>
      <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
        <b style={{ fontSize: 14.5, fontWeight: 650 }}>{consultora ? i.titulo : i.tituloDueno}</b>
        {consultora && i.diferenciaPct != null && i.toleranciaPct != null && (
          <span className="estado espera">difieren {Math.round(i.diferenciaPct)} % · tolerancia {i.toleranciaPct} %</span>
        )}
        {i.resuelta && <span className="estado ok">corregido</span>}
      </p>
      <LadoDe l={i.izquierda} para={t.para} solo={solo} />
      {i.derecha ? <LadoDe l={i.derecha} para={t.para} /> : null}
      {i.resuelta && <p className="nota">{i.resuelta.linea}</p>}
      {!i.resuelta && accion && <div>{accion(i)}</div>}
    </li>
  );
}

function Incongruencias({ t, accion, accionLista, puedeCorregir = true }: { t: Tablero; accion?: Props["accionIncongruencia"]; accionLista?: ReactNode; puedeCorregir?: boolean }) {
  const abiertas = abiertasDe(t.incongruencias);
  const resueltas = t.incongruencias.filter((i) => i.resuelta);
  if (!abiertas.length && !resueltas.length && !t.cambios.length) return null;
  const consultora = t.para === "consultora";
  const vistas = abiertas.slice(0, 3);
  const resto = abiertas.slice(3);
  const yaDichas = new Set(resueltas.map((i) => i.resuelta!.linea));
  const otrosCambios = t.cambios.filter((c) => !yaDichas.has(c));
  return (
    <section id="incongruencias" className="tarjeta incongruencias" aria-labelledby="t-incongruencias">
      <div className="cabeza">
        <div>
          <h2 id="t-incongruencias">{abiertas.length ? (consultora || !puedeCorregir ? "Datos que no cuadran" : "Datos para corregir") : "Datos corregidos"}</h2>
          <p className="sub">
            {abiertas.length
              ? consultora
                ? "Lo que dijo el dueño frente a su tabla, sus documentos o la cuenta"
                : puedeCorregir
                ? "Elige la cifra correcta, escribe otra o dinos que no la sabes"
                : "Las cifras que nos diste y no coinciden"
              : "Todo lo que no cuadraba ya tiene respuesta"}
          </p>
        </div>
      </div>
      {vistas.length > 0 && (
        <ul>
          {vistas.map((i) => <Fila key={i.id} i={i} t={t} accion={accion} />)}
        </ul>
      )}
      {resto.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="enlace-azul" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Ver {resto.length} más</summary>
          <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {resto.map((i) => <Fila key={i.id} i={i} t={t} accion={accion} />)}
          </ul>
        </details>
      )}
      {abiertas.length > 0 && accionLista && <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>{accionLista}</div>}
      {(resueltas.length > 0 || otrosCambios.length > 0) && (
        <details style={{ marginTop: 10 }}>
          <summary className="t-etiqueta" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Cambios ({resueltas.length + otrosCambios.length})</summary>
          {resueltas.length > 0 && (
            <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {resueltas.map((i) => <Fila key={i.id} i={i} t={t} />)}
            </ul>
          )}
          {otrosCambios.length > 0 && (
            <ul className="t-dato" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6, color: "var(--grafito)" }}>
              {otrosCambios.map((c, k) => <li key={`${k}-${c}`}>{c}</li>)}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}

// ─── Los cuatro bloques ──────────────────────────────────────────────────────────────────────────

function Cabeza({ id, titulo, sub, ir, irTexto }: { id: string; titulo: string; sub: string; ir?: string; irTexto?: string }) {
  return (
    <div className="cabeza">
      <div>
        <h2 id={id}>{titulo}</h2>
        <p className="sub">{sub}</p>
      </div>
      {ir && (
        <Link className="ir" href={ir} aria-label={irTexto ?? `Ver ${titulo.toLowerCase()}`}>
          <Icono nombre="diagonal" />
        </Link>
      )}
    </div>
  );
}

function Enlaces({ enlaces }: { enlaces: [string, string][] }) {
  return (
    <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
      {enlaces.map(([href, texto]) => (
        <Link key={href} href={href} className="enlace-azul" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          {texto}
        </Link>
      ))}
    </p>
  );
}

function BloqueProcesos({ t, base }: { t: Tablero; base: string }) {
  const p = t.procesos;
  const consultora = t.para === "consultora";
  const sinLeer = p.falta === "No se pudo leer el mapa de procesos";
  const nada = p.dibujados === 0;
  const escritosSolo = Math.max(0, p.escritos - p.medidos);
  const sinEscribir = Math.max(0, p.dibujados - p.escritos);
  const porDibujar = Math.max(0, p.esperados - p.dibujados);
  return (
    <section className="tarjeta bloque" aria-labelledby="t-procesos">
      <Cabeza id="t-procesos" titulo={consultora ? "Procesos" : "Tus procesos"} sub={consultora ? "Cuántos están dibujados, escritos y medidos" : "Qué se hace y cómo se hace en tu empresa"} ir={`${base}/procesos`} />
      {sinLeer || nada ? (
        <p className="sin-dato">{p.falta}</p>
      ) : (
        <p className="principal">
          <span className="grande">{p.dibujados}</span> de {p.esperados} {p.esperados === 1 ? "proceso dibujado" : "procesos dibujados"}
        </p>
      )}
      {!sinLeer && (p.esperados > 0 || p.dibujados > 0) && (
        <Segmentos
          etiqueta={`${p.medidos} medidos, ${escritosSolo} escritos, ${sinEscribir} dibujados sin escribir, ${porDibujar} por dibujar`}
          partes={[
            { n: p.medidos, texto: pl(p.medidos, "medido", "medidos"), tipo: "s1" },
            { n: escritosSolo, texto: pl(escritosSolo, "escrito", "escritos"), tipo: "s2" },
            { n: sinEscribir, texto: pl(sinEscribir, "dibujado sin escribir", "dibujados sin escribir"), tipo: "s4" },
            { n: porDibujar, texto: "por dibujar", tipo: "s3" },
          ]}
        />
      )}
      {!consultora && !sinLeer && !nada && (
        <p className="nota" style={{ marginTop: 0, fontSize: 13.5 }}>
          {p.conResponsable} con responsable, {p.escritos} {pl(p.escritos, "escrito", "escritos")} y {p.medidos} {pl(p.medidos, "medido", "medidos")}.
        </p>
      )}
      {consultora && !sinLeer && !nada && (
        <p className="nota">
          con responsable {p.conResponsable} · escritos {p.escritos} · medidos {p.medidos}
          {p.nivel != null && p.nombreNivel ? ` · nivel medio ${String(p.nivel).replace(".", ",")} de 5 (${p.nombreNivel})` : ""}
        </p>
      )}
      {consultora && p.lista.length > 0 && (
        // Pocos procesos se leen de un vistazo: abiertos. Muchos, plegados.
        <details open={p.lista.length <= 4 || undefined}>
          <summary>Cada proceso ({p.lista.length})</summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {p.lista.map((x) => (
              <li key={x.id} style={{ borderTop: "1px solid var(--linea)", paddingTop: 8 }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
                  <b style={{ fontSize: 14, fontWeight: 600 }}>{x.nombre}</b>
                  <span className={`estado ${x.nivel >= 3 ? "ok" : x.nivel >= 1 ? "neutro" : "espera"}`}>Nivel {x.nivel} · {x.nombreNivel}</span>
                </span>
                {x.siguiente && <span className="menor">{x.siguiente}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Enlaces enlaces={consultora ? [[`${base}/procesos`, "Procesos"], [`${base}/madurez`, "Radiografía"]] : [[`${base}/procesos`, "Tus procesos"]]} />
    </section>
  );
}

function BloqueDependencia({ t, base }: { t: Tablero; base: string }) {
  const d = t.dependencia;
  const consultora = t.para === "consultora";
  const c = d.procesos;
  const participa = c ? Math.max(0, c.conDueno - c.decideSolo) : 0;
  const noParticipa = c ? Math.max(0, c.total - c.conDueno) : 0;
  return (
    <section className="tarjeta bloque" aria-labelledby="t-dependencia">
      <Cabeza
        id="t-dependencia"
        titulo={consultora ? "Dependencia del dueño" : "Tu tiempo"}
        sub={consultora ? "En cuántos procesos decide solo" : "En cuántos procesos estás tú"}
        ir={consultora ? `${base}/direccion` : `${base}/procesos`}
      />
      {c && c.total > 0 ? (
        consultora ? (
          <p className="principal">
            Decide solo en <span className="grande">{c.decideSolo}</span> de {c.total} {c.total === 1 ? "proceso" : "procesos"}
          </p>
        ) : c.conDueno > 0 ? (
          // Al dueño, sin repetir el total: ya lo dice «Tus procesos» al lado, y la barra de abajo lo reparte.
          <p className="principal">
            Estás en <span className="grande">{c.conDueno}</span> {c.conDueno === 1 ? "proceso" : "procesos"}
          </p>
        ) : (
          <p className="principal" style={{ fontSize: 19 }}>{d.frase}</p>
        )
      ) : (
        <p className="sin-dato">{d.falta}</p>
      )}
      {!consultora && c && c.total > 0 && c.conDueno > 0 && c.decideSolo > 0 && (
        <p className="nota" style={{ marginTop: 0, fontSize: 13.5 }}>
          En {c.decideSolo} eres la única persona que decide.
        </p>
      )}
      {c && c.total > 0 && (
        <Segmentos
          etiqueta={
            consultora
              ? `Decide solo en ${c.decideSolo}, participa en ${participa}, no participa en ${noParticipa}`
              : `Decides tú en ${c.decideSolo}, con otros en ${participa}, no estás en ${noParticipa}`
          }
          partes={[
            { n: c.decideSolo, texto: consultora ? "decide solo" : "decides tú", tipo: "s1" },
            { n: participa, texto: consultora ? "participa" : "con otros", tipo: "s2" },
            { n: noParticipa, texto: consultora ? "no participa" : "no estás", tipo: "s4" },
          ]}
        />
      )}
      {consultora && c && c.total > 0 && d.frase && <p className="nota">{d.frase}.</p>}
      {consultora && d.dimensiones && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))", gap: "6px 12px" }} aria-label="Las ocho dimensiones de la dependencia">
          {d.dimensiones.map((x) => (
            <li key={x.clave} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30 }}>
              <span className="t-dato">{x.nombre}</span>
              {x.estado === "sin_dato" ? <span className="sin-dato" style={{ whiteSpace: "nowrap" }}>sin dato</span> : <span className={`estado ${x.estado === "revisada" ? "ok" : "espera"}`}>{x.estado}</span>}
            </li>
          ))}
        </ul>
      )}
      {d.seDetiene.length > 0 && (
        <div>
          <p className="t-etiqueta" style={{ margin: "0 0 4px" }}>{consultora ? "Si falta, se detiene:" : "Lo que nos dijiste que se detiene si no estás"}</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {d.seDetiene.map((x) => <li key={x} className="t-dato" style={{ fontWeight: 400 }}>{x}</li>)}
          </ul>
        </div>
      )}
      {consultora && <p className="nota">La bitácora del dueño todavía no está en 8X: aquí se cuentan procesos, no horas.</p>}
    </section>
  );
}

function CifraChica({ rotulo, valor, provisional, porConfirmar, sinDato = "sin dato" }: { rotulo: string; valor: ReactNode | null; provisional?: boolean; porConfirmar?: boolean; sinDato?: ReactNode }) {
  return (
    <div style={{ background: "var(--suave)", borderRadius: 14, padding: "9px 12px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, color: "var(--grafito)" }}>{rotulo}</span>
      {valor == null ? (typeof sinDato === "string" ? <span className="sin-dato">{sinDato}</span> : sinDato) : <b className="num" style={{ fontSize: 17, fontWeight: 700, overflowWrap: "anywhere" }}>{valor}</b>}
      {valor != null && provisional && <span style={{ fontSize: 11.5, color: "var(--caducado)" }}>{ROTULO_CIFRA_PROVISIONAL}</span>}
      {valor != null && porConfirmar && <span style={{ fontSize: 11.5, color: "var(--caducado)" }}>sale de una cifra que no cuadra</span>}
    </div>
  );
}

/**
 * Una frase con montos («vende S/ 41,800 al mes»): cada monto va en una pieza que no se parte al cortar la línea. En un
 * celular «S/» quedaba al final de un renglón y la cifra al principio del siguiente. El texto no cambia.
 */
const MONTO = /((?:[A-Z]{0,3}[/$€£¥₡₲]|[A-Z]{3})\s\d[\d.,]*)/u;
function SinPartirCifras({ texto }: { texto: string }) {
  // split con un grupo: las piezas impares son los montos («S/ 41,800», «US$ 1,200», «USD 900»).
  const partes = texto.split(MONTO);
  return <>{partes.map((p, i) => (i % 2 === 1 ? <span key={i} style={{ whiteSpace: "nowrap" }}>{p}</span> : p))}</>;
}

/** «por confirmar», pegado a una cifra que tiene un dato abierto que no cuadra. */
function PorConfirmar() {
  return (
    <span className="estado espera" style={{ marginLeft: 8, verticalAlign: 3, fontFamily: "var(--font-ui)", letterSpacing: 0 }}>
      por confirmar
    </span>
  );
}

function BloqueDinero({ t, base }: { t: Tablero; base: string }) {
  const d = t.dinero;
  const consultora = t.para === "consultora";
  const cfg = t.config;
  const faltan = Math.max(0, d.numeros.total - d.numeros.conCifra - d.numeros.noLoSabe);
  const contados = Math.max(0, d.numeros.conCifra - d.numeros.comprobados);
  const puntos: PuntoLinea[] = d.serie.map((p) => ({ corto: corto(p.periodo), largo: largo(p.periodo), valor: p.valor }));
  const conLinea = puntos.filter((p) => p.valor != null).length >= 2;
  const referencia =
    d.equilibrio != null ? { valor: d.equilibrio, texto: consultora ? `cubre gastos: ${plata(d.equilibrio, cfg)}` : `lo que necesitas para cubrir tus gastos: ${plata(d.equilibrio, cfg)}` } : null;
  const sinLeer = d.falta === "No se pudieron leer los números de la empresa";
  const sobre =
    d.sobreEquilibrio == null ? null : Math.abs(d.sobreEquilibrio) < 1 ? "justo en el equilibrio" : `${plata(Math.abs(d.sobreEquilibrio), cfg)} ${d.sobreEquilibrio > 0 ? "por encima" : "por debajo"}`;
  return (
    <section className="tarjeta bloque" aria-labelledby="t-dinero">
      <Cabeza id="t-dinero" titulo={consultora ? "Dinero" : "Tu dinero"} sub={consultora ? "Los 9 números, la venta y lo que cubre los gastos" : "Lo que vendes y lo que te queda"} ir={`${base}/numeros`} />
      {sinLeer ? (
        <p className="sin-dato">{d.falta}</p>
      ) : consultora ? (
        <p className="principal">
          <span className="grande">{d.numeros.conCifra}</span> de 9 números · {d.numeros.comprobados} {d.numeros.comprobados === 1 ? "comprobado" : "comprobados"}
        </p>
      ) : d.quedaAlMes && !d.quedaAlMes.porConfirmar ? (
        <p className="principal">
          Te quedan <span className="grande">{plata(d.quedaAlMes.valor, cfg)}</span> al mes
          {d.quedaAlMes.provisional && <span className="nota" style={{ display: "block", fontFamily: "var(--font-ui)", fontSize: 12.5 }}>{ROTULO_CIFRA_PROVISIONAL}</span>}
        </p>
      ) : d.venta ? (
        <p className="principal">
          Vendiste <span className="grande">{plata(d.venta.valor, cfg)}</span> en {/^\d{4}-\d{2}$/.test(d.venta.periodo) ? periodoEnPalabras(d.venta.periodo) : "el último mes"}
          {d.venta.porConfirmar && <PorConfirmar />}
        </p>
      ) : d.quedaAlMes ? (
        <p className="principal">
          Te quedan <span className="grande">{plata(d.quedaAlMes.valor, cfg)}</span> al mes
          <PorConfirmar />
        </p>
      ) : (
        <p className="sin-dato">Todavía no nos contaste tus ventas</p>
      )}
      {/* Lo que le quedó, si no cuadra, no se da por hecho: se dice que está por confirmar y dónde se corrige. */}
      {!consultora && !sinLeer && d.quedaAlMes?.porConfirmar && d.venta && (
        <p className="nota" style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          Lo que te queda al mes está <span className="estado espera">por confirmar</span>: no cuadra con la cuenta de tus números.{" "}
          <a href="#incongruencias" className="enlace-azul">Ver</a>
        </p>
      )}
      {consultora && !sinLeer && (
        <Segmentos
          etiqueta={`${d.numeros.comprobados} comprobados, ${contados} contados, ${d.numeros.noLoSabe} no lo sabe, ${faltan} faltan`}
          partes={[
            { n: d.numeros.comprobados, texto: pl(d.numeros.comprobados, "comprobado", "comprobados"), tipo: "s1" },
            { n: contados, texto: pl(contados, "contado", "contados"), tipo: "s2" },
            { n: d.numeros.noLoSabe, texto: "no lo sabe", tipo: "s4" },
            { n: faltan, texto: pl(faltan, "falta", "faltan"), tipo: "s3" },
          ]}
        />
      )}
      {!sinLeer &&
        (conLinea ? (
          <GraficoLinea puntos={puntos} formato="soles" etiqueta={consultora ? "Ventas por mes" : "Tus ventas por mes"} referencia={referencia} />
        ) : (
          <div className="grafico-vacio" style={{ minHeight: 96 }}>
            <span className="sin-dato">{d.venta ? "Hacen falta dos meses de ventas para dibujar la línea" : "Todavía sin ventas contadas"}</span>
          </div>
        ))}
      {consultora && !sinLeer && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <CifraChica rotulo="Le queda de lo que vende" valor={d.margen == null ? null : `${Math.round(d.margen)} %`} provisional={d.provisional.margen} porConfirmar={!!d.quedaAlMes?.porConfirmar} />
          <CifraChica rotulo="Días que aguanta con la caja" valor={d.diasAguante == null ? null : `${Math.round(d.diasAguante)} días`} provisional={d.provisional.diasAguante} />
          <CifraChica rotulo="Venta frente al equilibrio" valor={sobre} provisional={d.equilibrioProvisional} sinDato="aún por calcular" />
          <CifraChica
            rotulo="Se escapa al mes"
            valor={d.seEscapa.length ? d.seEscapa.map((x) => x.texto).join(" · ") : null}
            sinDato={d.seEscapaAplica === false ? <span className="estado neutro" style={{ alignSelf: "flex-start" }}>no aplica</span> : "aún por calcular"}
          />
        </div>
      )}
      {d.equilibrio == null && d.equilibrioMotivo && !sinLeer && consultora && <p className="nota">{d.equilibrioMotivo}</p>}
      {!consultora && !sinLeer && d.faltaGastoFijo && (
        <p className="nota" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
          <span className="sin-dato">Falta: lo que pagas sí o sí cada mes</span>
          <Link href={`${base}/numeros`} className="enlace-azul" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Lo digo</Link>
        </p>
      )}
      {consultora && <Enlaces enlaces={[[`${base}/numeros`, "Números"], [`${base}/realidad`, "Matriz de realidad"]]} />}
    </section>
  );
}

function BloqueResultado({ t, base }: { t: Tablero; base: string }) {
  const r = t.resultado;
  const consultora = t.para === "consultora";
  if (!consultora) {
    return (
      <section className="tarjeta bloque" aria-labelledby="t-resultado">
        <Cabeza id="t-resultado" titulo="Lo que encontramos" sub="Lo que te frena y lo que haremos" ir={r.publicado ? `${base}/hoy` : undefined} irTexto="Ver todo lo que encontramos" />
        {!r.publicado ? (
          <p className="t-dato" style={{ color: "var(--grafito)", margin: 0, fontSize: 15 }}>Tu consultora está terminando tu diagnóstico.</p>
        ) : (
          <>
            {r.restriccion ? (
              <div>
                <p className="t-etiqueta" style={{ margin: "0 0 4px" }}>Lo que te frena</p>
                <p className="principal" style={{ fontSize: 19 }}>{r.restriccion.titulo}</p>
                {r.restriccion.monto && <p className="nota" style={{ marginTop: 4 }}>{r.restriccion.monto}</p>}
              </div>
            ) : (
              <p className="t-dato" style={{ color: "var(--grafito)", margin: 0 }}>No encontramos algo que te frene más que lo demás.</p>
            )}
            {r.enTreintaDias.length > 0 && (
              <div>
                <p className="t-etiqueta" style={{ margin: "0 0 4px" }}>Lo que haremos en 30 días</p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.enTreintaDias.map((a) => <li key={a} className="t-dato" style={{ fontWeight: 400 }}>{a}</li>)}
                </ul>
              </div>
            )}
            <Enlaces enlaces={[[`${base}/hoy`, "Todo lo que encontramos"]]} />
          </>
        )}
      </section>
    );
  }
  return (
    <section className="tarjeta bloque" aria-labelledby="t-resultado">
      <Cabeza id="t-resultado" titulo="Resultado del diagnóstico" sub="Salud con evidencia, por área" ir={`${base}/diagnostico`} irTexto="Ver los hallazgos" />
      <div className="medidor-en-bloque">
        <Medidor pct={r.salud} etiqueta="Salud con evidencia" />
        <div className="lectura">
          {/* Sin dato, la lectura ocupa lo mismo que con cifra: dos renglones, para no pisar lo de abajo. */}
          {r.salud == null ? <><span className="sin-dato">sin dato</span><p>todavía sin diagnóstico</p></> : <><span className="num">{r.salud}</span><p>de 100, con evidencia</p></>}
        </div>
      </div>
      {r.falta && <p className="nota" style={{ marginTop: 0 }}>{r.falta}</p>}
      {r.pilares && r.pilares.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }} aria-label="Las cuatro áreas">
          {r.pilares.map((p) => (
            <li key={p.pilar} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: "4px 12px", minHeight: 40, borderTop: "1px solid var(--linea)" }}>
              <span className="t-dato" style={{ fontWeight: 600, minWidth: 0 }}>
                {PILAR[p.pilar] ?? p.pilar}
                <span className="menor">{p.confirmadas}/{p.total} confirmadas</span>
              </span>
              <span className={`estado ${CLASE_PILAR[p.estado ?? "desconocido"] ?? "neutro"}`}>{p.estado ? (ESTADO_PILAR[p.estado] ?? p.estado) : "Sin diagnosticar"}</span>
              <b className="num" style={{ fontSize: 18, minWidth: 34, textAlign: "right" }}>{p.puntaje ?? "—"}</b>
            </li>
          ))}
        </ul>
      )}
      <Enlaces enlaces={[[`${base}/diagnostico`, "Hallazgos"], [`${base}/madurez`, "Radiografía"], [`${base}/direccion`, "Dirección"]]} />
    </section>
  );
}

// ─── Lo que falta ────────────────────────────────────────────────────────────────────────────────

function LoQueFalta({ t, base, accion }: { t: Tablero; base: string; accion?: Props["accionFalta"] }) {
  if (t.para !== "consultora" || !t.loQueFalta.length) return null;
  return (
    <section className="tarjeta lista-tarjeta completa" aria-labelledby="t-falta">
      <div className="cabeza">
        <div>
          <h2 id="t-falta">Lo que falta levantar o validar</h2>
          <p className="sub">En orden: lo primero es lo que más destraba el diagnóstico</p>
        </div>
      </div>
      {/* Una fila por cosa, a todo lo ancho: el texto respira y el botón queda siempre a la derecha. */}
      <ul className="lista" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        {t.loQueFalta.map((f) => (
          <li key={f.clave} className={f.pedido ? undefined : "pide"}>
            <div className="fila">
              <Link href={enBase(base, f.href)} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
                <span className="icono-cuadro" style={{ flex: "none" }}>
                  <Icono nombre={ICONO_FALTA[f.clave] ?? "aviso"} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{f.texto}</b>
                  <small>{f.porque}</small>
                </span>
              </Link>
              {accion?.(f)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── El tablero ──────────────────────────────────────────────────────────────────────────────────

/**
 * EL TABLERO DE DIAGNÓSTICO: aviso de lo que no cuadra, la restricción en una frase con su monto, los cuatro bloques,
 * lo que no cuadra lado a lado y lo que falta. Componente de servidor: cada página pone sus acciones.
 */
export function TableroDiagnostico({ t, base, accionIncongruencia, accionFalta, accionLista, arriba, puedeCorregir = true, children }: Props) {
  const consultora = t.para === "consultora";
  const abiertas = abiertasDe(t.incongruencias);
  const restriccion = t.resultado.restriccion;
  const primero = t.loQueFalta[0] ?? null;
  const corrige = !consultora && puedeCorregir;
  return (
    <div className="tablero">
      {arriba}
      {abiertas.length > 0 && (
        <p className="aviso-incongruencias" role="status">
          <span>
            {abiertas.length} {abiertas.length === 1 ? "dato no cuadra" : "datos no cuadran"}
            {corrige ? (abiertas.length === 1 ? ". Corrígelo en un minuto." : ". Corrígelos en un minuto.") : ""}
          </span>
          <a href="#incongruencias">{corrige ? "Corregir" : "Ver"}</a>
        </p>
      )}

      <section className="tarjeta a-lo-ancho" aria-labelledby="t-frase" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "22px 24px" }}>
        <p className="t-etiqueta" style={{ margin: 0 }}>{consultora ? "Lo que hoy frena a la empresa" : "Tu diagnóstico"}</p>
        <h1 id="t-frase" className="t-hero" style={{ margin: 0 }}>
          <SinPartirCifras texto={t.frase} />
          {consultora && restriccion?.porCorroborar && (
            <span className="estado espera" style={{ marginLeft: 10, verticalAlign: 4, fontFamily: "var(--font-ui)", letterSpacing: 0 }}>Grave · por corroborar</span>
          )}
        </h1>
        {consultora && restriccion && (t.monto ? <span className="grande en-frase" style={{ color: "var(--contradicho)" }}><SinPartirCifras texto={t.monto} /></span> : <span className="sin-dato">sin monto todavía</span>)}
        {consultora && !restriccion && primero && (
          <Link className="accion-hoy" href={enBase(base, primero.href)} style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
            <span>
              <b>{primero.texto}</b>
              <small>{primero.porque}</small>
            </span>
            <span className="flecha"><Icono nombre="diagonal" /></span>
          </Link>
        )}
      </section>

      {/* Los cuatro bloques, con su gráfico, justo bajo la frase: es lo que se lee en la primera pantalla (revisión del
          16-10-2026). Lo que no cuadra va debajo; el aviso de arriba ya lleva hasta ahí (#incongruencias). */}
      <BloqueProcesos t={t} base={base} />
      <BloqueDependencia t={t} base={base} />
      <BloqueDinero t={t} base={base} />
      <BloqueResultado t={t} base={base} />

      <Incongruencias t={t} accion={accionIncongruencia} accionLista={accionLista} puedeCorregir={puedeCorregir} />

      <LoQueFalta t={t} base={base} accion={accionFalta} />

      {children}
    </div>
  );
}

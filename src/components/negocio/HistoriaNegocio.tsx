"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import type { DatoOral, EstadoDato as Estado } from "@/lib/dato-oral";
import type { Historia } from "@/lib/esquemas-negocio";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { CampoDato } from "./CampoDato";
import { EstadoDato } from "./EstadoDato";
import { AvisoGuardado, ChipEstado, SinDato } from "./Marcas";
import { mensajeDe, mostrarDato, type Modo } from "./dato";

type Props = {
  companyId: string;
  modo: Modo;
  historia: Historia;
  editable: boolean;
  config: ConfigEmpresa;
  /** La venta de la mejor época que ya está en los 9 números, para no preguntarla dos veces. */
  ventaDorada: number | null;
};

type Clave = "anio_inicio" | "venta_inicial" | "mejor_epoca" | "bajada" | "hoy_distinto";
type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/**
 * Una sola cosa por pregunta, y el episodio antes que el promedio (revisión del 16-10): «el mes que más vendiste»,
 * no «tu mejor época, cuándo, cuánto y qué pasaba» de una vez. Lo demás de cada tarjeta se pregunta aparte, debajo.
 */
const PREGUNTA: Record<Clave, string> = {
  anio_inicio: "¿En qué año empezó tu negocio?",
  venta_inicial: "En tu primer mes completo, ¿cuánto vendiste?",
  mejor_epoca: "¿Cuál fue el mes que más vendiste en toda la historia del negocio?",
  bajada: "¿En qué mes notaste que empezaba a bajar?",
  hoy_distinto: "¿Qué haces hoy distinto a como lo hacías en tu mejor época?",
};

/** Un texto escrito o dictado; vacío viaja como null (la ruta no admite un texto en blanco). */
const textoONull = (t: string) => (t.trim() ? t.trim() : null);

/** Una caja de texto largo que también se dicta. */
function TextoDictable({ etiqueta, valor, alCambiar, deshabilitado }: { etiqueta: string; valor: string; alCambiar: (t: string) => void; deshabilitado: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <textarea aria-label={etiqueta} className="campo" rows={4} maxLength={1000} value={valor} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.value)} />
      {!deshabilitado && <BotonGrabar grande={false} alTexto={(t) => alCambiar(valor.trim() ? `${valor.trim()} ${t}` : t)} />}
    </div>
  );
}

/** «No lo sé» (o «No ha bajado»): una respuesta, no un hueco. */
function BotonNoSe({ activo, alPulsar, deshabilitado, texto = "No lo sé" }: { activo: boolean; alPulsar: () => void; deshabilitado: boolean; texto?: string }) {
  return (
    <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start", fontSize: 14 }} aria-pressed={activo} disabled={deshabilitado} onClick={alPulsar}>
      {texto}
    </button>
  );
}

/** Una pregunta por tarjeta. Se guarda al salir de la tarjeta, no por tecla. */
function Tarjeta({ n, clave, children, alSalir, aviso }: { n: number; clave: Clave; children: React.ReactNode; alSalir: () => void; aviso: Aviso }) {
  return (
    <section
      className="panel p-5 flex flex-col gap-3"
      aria-labelledby={`historia-${clave}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alSalir();
      }}
    >
      <h2 id={`historia-${clave}`} className="t-seccion" style={{ fontSize: 17 }}>
        <span style={{ color: "var(--grafito)", fontWeight: 600 }}>{n} · </span>
        {PREGUNTA[clave]}
      </h2>
      {children}
      <AvisoGuardado estado={aviso} />
    </section>
  );
}

/** Lectura (la consultora, o el dueño con la sección cerrada): cada respuesta con cómo se sabe. */
function Lectura({ historia, fmt }: { historia: Historia; fmt: (n: number) => string }) {
  const h = historia;
  const fila = (n: number, clave: Clave, contenido: React.ReactNode) => (
    <li key={clave} style={{ padding: "12px 0" }}>
      <p className="t-dato" style={{ fontWeight: 600 }}>{n} · {PREGUNTA[clave]}</p>
      <div className="t-cuerpo mt-1">{contenido}</div>
    </li>
  );
  const anio = h.anio_inicio;
  const me = h.mejor_epoca;
  const ba = h.bajada;
  const hd = h.hoy_distinto;
  return (
    <ul className="lista-editorial">
      {fila(1, "anio_inicio", anio ? (anio.estado === "no_lo_se" ? "No lo sabe." : <>{anio.valor} <ChipEstado estado={anio.estado} /></>) : <SinDato />)}
      {fila(2, "venta_inicial", h.venta_inicial ? <>{mostrarDato(h.venta_inicial, fmt)} al mes <ChipEstado estado={h.venta_inicial.estado === "no_lo_se" ? null : h.venta_inicial.estado} /></> : <SinDato />)}
      {fila(
        3,
        "mejor_epoca",
        me && (me.no_lo_se || me.cuando || me.venta_mes || me.que_pasaba) ? (
          me.no_lo_se ? "No lo sabe." : (
            <>
              {me.cuando && <p>Cuándo: {me.cuando}</p>}
              <p>Venta de ese mes: {me.venta_mes ? mostrarDato(me.venta_mes, fmt) : <SinDato />} {me.venta_mes && <ChipEstado estado={me.venta_mes.estado === "no_lo_se" ? null : me.venta_mes.estado} />}</p>
              {me.que_pasaba && <p>Qué pasaba: {me.que_pasaba}</p>}
            </>
          )
        ) : <SinDato />
      )}
      {fila(4, "bajada", ba ? (ba.no_bajo ? "No ha bajado." : <>{ba.cuando && <p>Cuándo: {ba.cuando}</p>}{ba.que_cambio && <p>Qué cambió: {ba.que_cambio}</p>}{!ba.cuando && !ba.que_cambio && <SinDato />}</>) : <SinDato />)}
      {fila(5, "hoy_distinto", hd ? (hd.no_lo_se ? "No lo sabe." : hd.texto ?? <SinDato />) : <SinDato />)}
    </ul>
  );
}

/**
 * LA HISTORIA DEL NEGOCIO: cinco preguntas, una por tarjeta, que se responden hablando o escribiendo. Cada una acepta
 * «No lo sé» (y la de la bajada, «No ha bajado»): son respuestas, cuentan como respondidas. Si la venta de la mejor
 * época ya está en los 9 números, la caja la trae; si no, al guardarla queda también allí (la ruta la siembra y nunca
 * pisa una que ya existe).
 */
export function HistoriaNegocio({ companyId, modo, historia, editable, config, ventaDorada }: Props) {
  const router = useRouter();
  const fmt = (n: number) => enMoneda(n, config);
  const [editando, setEditando] = useState(modo === "dueno");
  const inicial = {
    anioTexto: historia.anio_inicio?.valor != null ? String(historia.anio_inicio.valor) : "",
    anioEstado: (historia.anio_inicio?.estado ?? "estimado") as Estado,
    anioNoSe: historia.anio_inicio?.estado === "no_lo_se",
    ventaInicial: historia.venta_inicial ?? null,
    cuando: historia.mejor_epoca?.cuando ?? "",
    ventaMejor: historia.mejor_epoca?.venta_mes ?? (ventaDorada != null ? ({ valor: ventaDorada, estado: "estimado" } as DatoOral) : null),
    quePasaba: historia.mejor_epoca?.que_pasaba ?? "",
    mejorNoSe: !!historia.mejor_epoca?.no_lo_se,
    noBajo: !!historia.bajada?.no_bajo,
    cuandoBajo: historia.bajada?.cuando ?? "",
    queCambio: historia.bajada?.que_cambio ?? "",
    hoy: historia.hoy_distinto?.texto ?? "",
    hoyNoSe: !!historia.hoy_distinto?.no_lo_se,
  };
  type Respuestas = typeof inicial;
  const [e, setE] = useState<Respuestas>(inicial);
  const vivo = useRef<Respuestas>(inicial);
  const guardado = useRef<Record<Clave, string>>({ anio_inicio: "", venta_inicial: "", mejor_epoca: "", bajada: "", hoy_distinto: "" });
  const [avisos, setAvisos] = useState<Record<Clave, Aviso>>({ anio_inicio: null, venta_inicial: null, mejor_epoca: null, bajada: null, hoy_distinto: null });
  const [anioAviso, setAnioAviso] = useState<string | null>(null);
  const cambiar = (f: (x: Respuestas) => Respuestas) => {
    vivo.current = f(vivo.current);
    setE(vivo.current);
  };
  const avisar = (k: Clave, a: Aviso) => setAvisos((x) => ({ ...x, [k]: a }));

  if (!editando) {
    return (
      <div className="flex flex-col gap-3">
        <Lectura historia={historia} fmt={fmt} />
        {modo === "consultora" && editable && (
          <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start" }} onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
      </div>
    );
  }

  /** Lo que se manda de cada pregunta, armado del estado vivo. undefined = no hay nada que guardar todavía. */
  const datosDe = (k: Clave): unknown => {
    const x = vivo.current;
    switch (k) {
      case "anio_inicio": {
        if (x.anioNoSe) return { valor: null, estado: "no_lo_se" };
        if (!x.anioTexto.trim()) return undefined;
        const n = Number(x.anioTexto.trim());
        const hoy = new Date().getFullYear();
        if (!Number.isInteger(n) || n < 1900 || n > hoy) {
          setAnioAviso(`Escribe el año con sus cuatro cifras, entre 1900 y ${hoy}.`);
          return undefined;
        }
        setAnioAviso(null);
        return { valor: n, estado: x.anioEstado === "no_lo_se" ? "estimado" : x.anioEstado };
      }
      case "venta_inicial":
        return x.ventaInicial ?? undefined;
      case "mejor_epoca":
        if (x.mejorNoSe) return { no_lo_se: true, cuando: null, venta_mes: null, que_pasaba: null };
        if (!x.cuando.trim() && !x.ventaMejor && !x.quePasaba.trim()) return undefined;
        // Lo que la consultora comprobó no viaja desde el dueño: la ruta lo conserva tal cual y guarda lo demás.
        if (modo === "dueno" && x.ventaMejor?.estado === "comprobado") return { no_lo_se: false, cuando: textoONull(x.cuando)?.slice(0, 120) ?? null, que_pasaba: textoONull(x.quePasaba) };
        return { no_lo_se: false, cuando: textoONull(x.cuando)?.slice(0, 120) ?? null, venta_mes: x.ventaMejor, que_pasaba: textoONull(x.quePasaba) };
      case "bajada":
        if (x.noBajo) return { no_bajo: true, cuando: null, que_cambio: null };
        if (!x.cuandoBajo.trim() && !x.queCambio.trim()) return undefined;
        return { no_bajo: false, cuando: textoONull(x.cuandoBajo)?.slice(0, 120) ?? null, que_cambio: textoONull(x.queCambio) };
      case "hoy_distinto":
        if (x.hoyNoSe) return { texto: null, no_lo_se: true };
        if (!x.hoy.trim()) return undefined;
        return { texto: textoONull(x.hoy), no_lo_se: false };
    }
  };

  const guardar = async (k: Clave) => {
    if (!editable) return;
    const datos = datosDe(k);
    if (datos === undefined) return;
    const firma = JSON.stringify(datos);
    if (guardado.current[k] === firma) return;
    avisar(k, null);
    try {
      const r = await pedir<{ sembrado?: boolean }>(`/api/companies/${companyId}/negocio`, { method: "PATCH", json: { bloque: "historia", datos: { [k]: datos } } });
      guardado.current[k] = firma;
      avisar(k, { tipo: "ok", texto: r?.sembrado ? (modo === "dueno" ? "Guardado. También quedó en Tus números como tu mejor época." : "Guardado. Se anotó también en los 9 números (mejor época).") : "Guardado" });
      router.refresh();
    } catch (err) {
      avisar(k, { tipo: "error", texto: mensajeDe(err) });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta n={1} clave="anio_inicio" alSalir={() => void guardar("anio_inicio")} aviso={avisos.anio_inicio}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={PREGUNTA.anio_inicio}
            className="campo"
            style={{ flex: "0 1 160px" }}
            inputMode="numeric"
            maxLength={4}
            value={e.anioTexto}
            disabled={!editable || e.anioNoSe}
            onChange={(ev) => cambiar((x) => ({ ...x, anioTexto: ev.target.value.replace(/[^0-9]/g, "") }))}
          />
          {e.anioTexto && !e.anioNoSe && <EstadoDato estado={e.anioEstado} modo={modo} etiqueta={PREGUNTA.anio_inicio} deshabilitado={!editable} alCambiar={(s) => cambiar((x) => ({ ...x, anioEstado: s }))} />}
          <BotonNoSe activo={e.anioNoSe} deshabilitado={!editable} alPulsar={() => cambiar((x) => ({ ...x, anioNoSe: !x.anioNoSe, anioTexto: "" }))} />
        </div>
        {anioAviso && <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>{anioAviso}</p>}
      </Tarjeta>

      <Tarjeta n={2} clave="venta_inicial" alSalir={() => void guardar("venta_inicial")} aviso={avisos.venta_inicial}>
        <CampoDato etiqueta={PREGUNTA.venta_inicial} conEtiqueta={false} valor={e.ventaInicial} alGuardar={(d) => cambiar((x) => ({ ...x, ventaInicial: d }))} modo={modo} formato={fmt} deshabilitado={!editable} />
      </Tarjeta>

      <Tarjeta n={3} clave="mejor_epoca" alSalir={() => void guardar("mejor_epoca")} aviso={avisos.mejor_epoca}>
        {!e.mejorNoSe && (
          <>
            <label className="flex flex-col gap-1">
              <span className="t-dato" style={{ fontWeight: 600 }}>El mes y el año</span>
              <input aria-label="El mes que más vendiste" className="campo" maxLength={120} value={e.cuando} disabled={!editable} placeholder="Como lo recuerdes" onChange={(ev) => cambiar((x) => ({ ...x, cuando: ev.target.value }))} />
            </label>
            <CampoDato etiqueta="¿Cuánto vendiste ese mes?" valor={e.ventaMejor} alGuardar={(d) => cambiar((x) => ({ ...x, ventaMejor: d }))} modo={modo} formato={fmt} deshabilitado={!editable} ayuda={!historia.mejor_epoca?.venta_mes && ventaDorada != null ? "Lo trajimos de Tus números." : null} />
            <div className="flex flex-col gap-1">
              <span className="t-dato" style={{ fontWeight: 600 }}>Ese mes, ¿qué estaba pasando en el negocio?</span>
              <TextoDictable etiqueta="Qué estaba pasando en el negocio ese mes" valor={e.quePasaba} deshabilitado={!editable} alCambiar={(t) => cambiar((x) => ({ ...x, quePasaba: t }))} />
            </div>
          </>
        )}
        <BotonNoSe activo={e.mejorNoSe} deshabilitado={!editable} alPulsar={() => cambiar((x) => ({ ...x, mejorNoSe: !x.mejorNoSe }))} />
      </Tarjeta>

      <Tarjeta n={4} clave="bajada" alSalir={() => void guardar("bajada")} aviso={avisos.bajada}>
        {!e.noBajo && (
          <>
            <label className="flex flex-col gap-1">
              <span className="t-dato" style={{ fontWeight: 600 }}>El mes y el año</span>
              <input aria-label="El mes en que empezó a bajar" className="campo" maxLength={120} value={e.cuandoBajo} disabled={!editable} onChange={(ev) => cambiar((x) => ({ ...x, cuandoBajo: ev.target.value }))} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="t-dato" style={{ fontWeight: 600 }}>Ese mes, ¿qué cambió?</span>
              <TextoDictable etiqueta="Qué cambió el mes en que empezó a bajar" valor={e.queCambio} deshabilitado={!editable} alCambiar={(t) => cambiar((x) => ({ ...x, queCambio: t }))} />
            </div>
          </>
        )}
        <BotonNoSe activo={e.noBajo} deshabilitado={!editable} texto="No ha bajado" alPulsar={() => cambiar((x) => ({ ...x, noBajo: !x.noBajo }))} />
      </Tarjeta>

      <Tarjeta n={5} clave="hoy_distinto" alSalir={() => void guardar("hoy_distinto")} aviso={avisos.hoy_distinto}>
        {!e.hoyNoSe && <TextoDictable etiqueta={PREGUNTA.hoy_distinto} valor={e.hoy} deshabilitado={!editable} alCambiar={(t) => cambiar((x) => ({ ...x, hoy: t }))} />}
        <BotonNoSe activo={e.hoyNoSe} deshabilitado={!editable} alPulsar={() => cambiar((x) => ({ ...x, hoyNoSe: !x.hoyNoSe }))} />
      </Tarjeta>

      {modo === "consultora" && (
        <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start" }} onClick={() => setEditando(false)}>
          Terminar de editar
        </button>
      )}
    </div>
  );
}

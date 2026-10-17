"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import { rangoDe, sumarRangos, textoRango, type DatoOral, type Rango } from "@/lib/dato-oral";
import { CampoDato } from "./CampoDato";
import { AvisoGuardado, ChipEstado, SinDato } from "./Marcas";
import { mensajeDe, mismoDato, mostrarDato, type Modo } from "./dato";

/** Un gasto del mes tal como lo lee la página (costoDesdeFila de src/lib/negocio-datos.ts). */
export type FilaCostoMes = { id: string; periodo: string; tipo: "fijo" | "comercializacion"; nombre: string; dato: DatoOral; nota: string | null; orden: number; creado_por: string | null };

type Props = {
  companyId: string;
  modo: Modo;
  costos: FilaCostoMes[];
  editable: boolean;
  usuarioId: string | null;
  config: ConfigEmpresa;
  /** El gasto fijo de los 9 números (el más reciente), si lo hay: se muestra al lado, no se pisa. */
  vital: number | null;
};

type Tipo = FilaCostoMes["tipo"];
type Local = { nombre: string; dato: DatoOral | null };
type Fila = { clave: string; id: string | null; tipo: Tipo; previo: Local; estadoBase: DatoOral["estado"] | null; creado_por: string | null; orden: number };

const LISTAS: { tipo: Tipo; titulo: string; ayuda: string; placeholder: string }[] = [
  // Sin listas de ejemplo: la lista se queda corta y el dueño solo nombra lo que ve (revisión del 16-10, pregunta 7).
  { tipo: "fijo", titulo: "Lo que pagas sí o sí, vendas o no vendas", ayuda: "Anótalos uno por uno, con lo que pagaste el mes pasado. La suma sale sola.", placeholder: "Nombre del gasto" },
  { tipo: "comercializacion", titulo: "Lo que gastas para vender", ayuda: "También uno por uno, con lo que pagaste el mes pasado.", placeholder: "Nombre del gasto" },
];

const dinero = (cfg: ConfigEmpresa) => (n: number) => enMoneda(n, cfg);

/** La suma de una lista: el total si todos tienen monto; si no, lo que se sabe y lo que falta. Sin filas, nada. */
function sumar(filas: { nombre: string; dato: DatoOral | null }[]): { total: Rango | null; conocido: Rango | null; faltan: string[] } | null {
  if (!filas.length) return null;
  const rangos = filas.map((f) => rangoDe(f.dato));
  const faltan = filas.filter((_, i) => !rangos[i]).map((f) => f.nombre.trim() || "uno sin nombre");
  const conocidos = rangos.filter((r): r is Rango => r != null);
  return { total: faltan.length ? null : sumarRangos(rangos), conocido: conocidos.length ? sumarRangos(conocidos) : null, faltan };
}

/**
 * La suma, o por qué no hay. Sin total, primero lo que falta y después lo demás, dicho como «lo demás»: antes decía
 * «al menos S/ 450» y «al menos entre…», que se leía como un total que se contradecía con el de abajo.
 */
function TextoSuma({ s, fmt, prefijo, conPrefijo = false }: { s: ReturnType<typeof sumar>; fmt: (n: number) => string; prefijo: string; conPrefijo?: boolean }) {
  if (!s) return null;
  if (s.total) return <p className="t-dato fuerte">{prefijo}: {textoRango(s.total, fmt)}</p>;
  return (
    <p className="t-dato" style={{ color: "var(--grafito)" }}>
      {conPrefijo ? `${prefijo}: sin` : "Sin"} el monto de {s.faltan.join(", ")} no hay total.
      {s.conocido && (
        <>
          {" "}{s.faltan.length === 1 ? "Sin él" : "Sin ellos"}, lo demás suma <b style={{ color: "var(--tinta)" }}>{textoRango(s.conocido, fmt)}</b>.
        </>
      )}
    </p>
  );
}

function FilaCosto({ fila, valor, modo, fmt, editable, puedeQuitar, placeholder, alCambiar, alSalir, alQuitar, estado }: {
  fila: Fila;
  valor: Local;
  modo: Modo;
  fmt: (n: number) => string;
  editable: boolean;
  puedeQuitar: boolean;
  placeholder: string;
  alCambiar: (v: Local) => void;
  alSalir: () => void;
  alQuitar: () => void;
  estado: { tipo: "ok" | "error"; texto: string } | null;
}) {
  const comprobado = modo === "dueno" && fila.estadoBase === "comprobado";
  if (!editable || comprobado) {
    return (
      <li className="flex flex-wrap items-center gap-2" style={{ borderTop: "1px solid var(--linea)", padding: "12px 0" }}>
        <span className="t-dato fuerte">{valor.nombre}</span>
        <span className="t-dato">{valor.dato ? mostrarDato(valor.dato, fmt) : <SinDato />}</span>
        <ChipEstado estado={valor.dato?.estado === "no_lo_se" ? null : valor.dato?.estado} />
        {comprobado && editable && <span className="t-dato" style={{ color: "var(--grafito)" }}>Comprobado por tu consultora: si cambió, díselo.</span>}
      </li>
    );
  }
  return (
    // Desde 1024 px, el nombre y el monto en una fila, con un ancho máximo: una caja a todo el ancho para un número
    // hacía de cada gasto un bloque de 190 px. La columna del nombre baja lo que ocupa la pregunta del monto.
    <li
      className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-x-4 lg:items-start"
      style={{ borderTop: "1px solid var(--linea)", padding: "12px 0", maxWidth: 920 }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alSalir();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 lg:pt-[30px]">
        <input
          aria-label="Qué gasto es"
          className="campo"
          style={{ flex: "1 1 200px", minWidth: 0 }}
          value={valor.nombre}
          maxLength={120}
          placeholder={placeholder}
          onChange={(e) => alCambiar({ ...valor, nombre: e.target.value })}
        />
        {puedeQuitar && (
          <button type="button" className="boton boton--secundario" style={{ flex: "none" }} onClick={alQuitar} aria-label={`Quitar ${valor.nombre || "este gasto"}`}>
            Quitar
          </button>
        )}
      </div>
      <CampoDato
        etiqueta={valor.nombre.trim() ? `El mes pasado, ¿cuánto pagaste de «${valor.nombre.trim()}»?` : "El mes pasado, ¿cuánto pagaste por este gasto?"}
        valor={valor.dato}
        alGuardar={(d) => alCambiar({ ...valor, dato: d })}
        modo={modo}
        formato={fmt}
      />
      <div className="lg:col-span-2">
        <AvisoGuardado estado={estado} />
      </div>
    </li>
  );
}

/**
 * LOS GASTOS DEL MES. Dos listas: lo que se paga sí o sí (fijo) y lo que se gasta para vender. El total se ve
 * mientras se escribe; si a uno le falta el monto, se dice que sin él no hay total (no se suma un cero). El gasto fijo
 * de los 9 números se muestra al lado y no se elige ninguno: si difieren, se conversa.
 */
export function CostosMes({ companyId, modo, costos, editable, usuarioId, config, vital }: Props) {
  const router = useRouter();
  const fmt = dinero(config);
  const [borradores, setBorradores] = useState<{ clave: string; tipo: Tipo }[]>([]);
  const [locales, setLocales] = useState<Record<string, Local>>({});
  const vivos = useRef<Record<string, Local>>({});
  const [estados, setEstados] = useState<Record<string, { tipo: "ok" | "error"; texto: string } | null>>({});
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({});
  const siguiente = useRef(0);

  const filas: Fila[] = [
    ...costos.map((c) => ({ clave: c.id, id: c.id, tipo: c.tipo, previo: { nombre: c.nombre, dato: c.dato }, estadoBase: c.dato.estado, creado_por: c.creado_por, orden: c.orden })),
    ...borradores.map((b) => ({ clave: b.clave, id: null, tipo: b.tipo, previo: { nombre: "", dato: null }, estadoBase: null, creado_por: usuarioId, orden: 0 })),
  ];
  const valorDe = (f: Fila): Local => locales[f.clave] ?? f.previo;
  const poner = (clave: string, v: Local) => {
    vivos.current = { ...vivos.current, [clave]: v };
    setLocales(vivos.current);
  };
  const avisar = (clave: string, e: { tipo: "ok" | "error"; texto: string } | null) => setEstados((x) => ({ ...x, [clave]: e }));

  const guardar = async (f: Fila) => {
    const v = vivos.current[f.clave];
    if (!v || ocupado[f.clave]) return;
    const nombre = v.nombre.trim();
    if (!nombre) {
      if (v.dato) avisar(f.clave, { tipo: "error", texto: "Ponle nombre a este gasto para guardarlo." });
      return;
    }
    let cuerpo: Record<string, unknown> = {};
    if (f.id) {
      if (nombre !== f.previo.nombre) cuerpo.nombre = nombre;
      if (v.dato && !mismoDato(v.dato, f.previo.dato)) cuerpo.dato = v.dato;
      if (!v.dato && f.previo.dato) {
        avisar(f.clave, { tipo: "error", texto: "Escribe el monto o pulsa «No lo sé»: un gasto anotado no se deja en blanco." });
        return;
      }
      if (!Object.keys(cuerpo).length) return;
    } else {
      if (!v.dato) {
        avisar(f.clave, { tipo: "error", texto: "Falta el monto, un rango o «No lo sé»." });
        return;
      }
      const orden = Math.max(0, ...costos.filter((c) => c.tipo === f.tipo).map((c) => c.orden)) + 1;
      cuerpo = { tipo: f.tipo, nombre, dato: v.dato, orden };
    }
    setOcupado((x) => ({ ...x, [f.clave]: true }));
    avisar(f.clave, null);
    try {
      await pedir(`/api/companies/${companyId}/costos${f.id ? `/${f.id}` : ""}`, { method: f.id ? "PATCH" : "POST", json: cuerpo });
      if (f.id) avisar(f.clave, { tipo: "ok", texto: "Guardado" });
      else setBorradores((x) => x.filter((b) => b.clave !== f.clave));
      router.refresh();
    } catch (e) {
      avisar(f.clave, { tipo: "error", texto: mensajeDe(e) });
    } finally {
      setOcupado((x) => ({ ...x, [f.clave]: false }));
    }
  };

  const quitar = async (f: Fila) => {
    if (!f.id) {
      setBorradores((x) => x.filter((b) => b.clave !== f.clave));
      return;
    }
    try {
      await pedir(`/api/companies/${companyId}/costos/${f.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      avisar(f.clave, { tipo: "error", texto: mensajeDe(e, "No pudimos quitarlo. Inténtalo de nuevo.") });
    }
  };

  const deTipo = (t: Tipo) => filas.filter((f) => f.tipo === t);
  const suma = (t: Tipo) => sumar(deTipo(t).filter((f) => f.id || valorDe(f).dato).map(valorDe));
  const fijos = suma("fijo");
  const todo = sumar(filas.filter((f) => f.id || valorDe(f).dato).map(valorDe));

  return (
    <div className="flex flex-col gap-8">
      {LISTAS.map((lista) => {
        const deEsta = deTipo(lista.tipo);
        return (
          <section key={lista.tipo} aria-labelledby={`costos-${lista.tipo}`}>
            <h2 id={`costos-${lista.tipo}`} className="t-seccion">{lista.titulo}</h2>
            <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>{lista.ayuda}</p>
            {deEsta.length === 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>{editable ? "Todavía ninguno." : "Nada anotado."}</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {deEsta.map((f) => (
                <FilaCosto
                  key={f.clave}
                  fila={f}
                  valor={valorDe(f)}
                  modo={modo}
                  fmt={fmt}
                  editable={editable}
                  puedeQuitar={!f.id || modo === "consultora" || (!!usuarioId && f.creado_por === usuarioId && f.estadoBase !== "comprobado")}
                  placeholder={lista.placeholder}
                  alCambiar={(v) => poner(f.clave, v)}
                  alSalir={() => void guardar(f)}
                  alQuitar={() => void quitar(f)}
                  estado={estados[f.clave] ?? null}
                />
              ))}
            </ul>
            {editable && (
              <button
                type="button"
                className="boton boton--secundario mt-3"
                onClick={() => setBorradores((x) => [...x, { clave: `nuevo-${lista.tipo}-${siguiente.current++}`, tipo: lista.tipo }])}
              >
                Agregar un gasto
              </button>
            )}
            <div className="mt-3">
              <TextoSuma s={suma(lista.tipo)} fmt={fmt} prefijo="Suman" />
            </div>
          </section>
        );
      })}

      <section className="pozo">
        <TextoSuma s={todo} fmt={fmt} prefijo="En total, al mes" conPrefijo />
        {!todo && <p className="t-dato" style={{ color: "var(--grafito)" }}>Cuando anotes tus gastos, aquí ves el total del mes.</p>}
        {vital != null && (
          <p className="t-dato mt-2">
            {modo === "dueno" ? "En Tus números dijiste" : "En los 9 números figura"} {fmt(vital)} de gastos fijos;{" "}
            {fijos?.total
              ? `aquí suman ${textoRango(fijos.total, fmt)}.`
              : fijos
                ? "aquí todavía falta el monto de algunos."
                : "aquí todavía no hay ninguno anotado."}
            {fijos?.total && modo === "consultora" && " No se elige uno: si difieren, se conversa con el dueño."}
          </p>
        )}
      </section>
    </div>
  );
}

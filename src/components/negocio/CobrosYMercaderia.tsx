"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import type { DatoOral } from "@/lib/dato-oral";
import type { Credito, Inventario, Modulos, Moneda } from "@/lib/esquemas-negocio";
import { CampoDato } from "./CampoDato";
import { AvisoGuardado, ChipEstado, SinDato } from "./Marcas";
import { cantidad, leerNumero, mensajeDe, mostrarDato, type Modo } from "./dato";

/** Una venta cobrada en otra moneda, como la lee la página (operacionDesdeFila de src/lib/negocio-datos.ts). */
export type OperacionLeida = {
  id: string;
  fecha_venta: string | null;
  fecha_cobro: string | null;
  dias_cobro: number | null;
  moneda: string;
  monto: number;
  tc_cotizado: number | null;
  tc_cobro: number | null;
  recibido: number | null;
  comisiones: number | null;
  conversiones: 1 | 2 | null;
  estado: DatoOral["estado"];
  creado_por: string | null;
};

/** Lo que se quedó en el camino en una venta, ya calculado en el servidor (fugaCambiaria de src/lib/rentabilidad.ts). */
export type FugaLeida = { esperado: number | null; total: number | null; motivos: string[] };

type Permisos = { modulos: boolean; moneda: boolean; credito: boolean; inventario: boolean };

type Props = {
  companyId: string;
  modo: Modo;
  modulos: Modulos;
  moneda: Moneda;
  credito: Credito;
  inventario: Inventario;
  operaciones: OperacionLeida[];
  fugas: Record<string, FugaLeida>;
  /** Qué puede escribir quien mira: cada bloque con su sección abierta (la consultora, todo). */
  puede: Permisos;
  config: ConfigEmpresa;
  usuarioId: string | null;
};

type Aviso = { tipo: "ok" | "error"; texto: string } | null;
type ClaveModulo = "moneda" | "credito" | "inventario";

const PREGUNTA_MODULO: Record<ClaveModulo, string> = {
  moneda: "¿Te pagan en otra moneda?",
  credito: "¿Vendes al crédito o fías?",
  inventario: "¿Guardas mercadería o materiales?",
};

const MONEDAS_COMUNES = ["USD", "CLP", "EUR", "COP", "MXN", "BRL", "ARS", "BOB", "PEN"];

/** El nombre de cada moneda común, como lo dice el dueño: va en la lista que se despliega al escribir. */
const NOMBRE_MONEDA: Record<string, string> = {
  USD: "dólares", CLP: "pesos chilenos", EUR: "euros", COP: "pesos colombianos", MXN: "pesos mexicanos",
  BRL: "reales", ARS: "pesos argentinos", BOB: "bolivianos", PEN: "soles",
};

/**
 * Lo que escribió el dueño, con los nombres de moneda pasados a sus tres letras: «dólares» se guarda como USD. Antes
 * «dólares» daba error recién al salir de la caja. Lo que no reconoce lo deja igual (y la validación lo dice).
 */
const NOMBRES_A_CODIGO: [RegExp, string][] = [
  [/\bpesos? chilenos?(?![a-zá-úñ])/gi, "CLP"],
  [/\bpesos? colombianos?(?![a-zá-úñ])/gi, "COP"],
  [/\bpesos? mexicanos?(?![a-zá-úñ])/gi, "MXN"],
  [/\bpesos? argentinos?(?![a-zá-úñ])/gi, "ARS"],
  [/\bd[oó]lar(es)?( americanos?| estadounidenses?)?(?![a-zá-úñ])/gi, "USD"],
  [/\beuros?(?![a-zá-úñ])/gi, "EUR"],
  [/\breal(es)?(?![a-zá-úñ])/gi, "BRL"],
  [/\bbolivianos?(?![a-zá-úñ])/gi, "BOB"],
  [/\bsol(es)?(?![a-zá-úñ])/gi, "PEN"],
];
function codigosDeMoneda(texto: string): string {
  let t = texto;
  for (const [re, codigo] of NOMBRES_A_CODIGO) t = t.replace(re, codigo);
  return t.replace(/\s+y\s+/gi, ", ");
}

/** Guarda un bloque de la ficha del negocio. */
async function guardarBloque(companyId: string, bloque: string, datos: Record<string, unknown>): Promise<void> {
  await pedir(`/api/companies/${companyId}/negocio`, { method: "PATCH", json: { bloque, datos } });
}

// ─── La pregunta sí/no ───────────────────────────────────────────────────────────────────────────

function SiNo({ clave, valor, puede, alCambiar }: { clave: ClaveModulo; valor: boolean | null | undefined; puede: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="t-seccion">{PREGUNTA_MODULO[clave]}</h2>
      {puede ? (
        <div className="flex gap-2" role="group" aria-label={PREGUNTA_MODULO[clave]}>
          <button type="button" className={valor === true ? "boton" : "boton boton--secundario"} aria-pressed={valor === true} onClick={() => alCambiar(true)}>Sí</button>
          <button type="button" className={valor === false ? "boton" : "boton boton--secundario"} aria-pressed={valor === false} onClick={() => alCambiar(false)}>No</button>
        </div>
      ) : (
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{valor === true ? "Sí" : valor === false ? "No" : "Sin responder"}</span>
      )}
    </div>
  );
}

// ─── Un número del bloque, que se guarda al salir de su caja ────────────────────────────────────

function Pregunta({ etiqueta, valor, guardar, modo, puede, formato, max }: { etiqueta: string; valor: DatoOral | null | undefined; guardar: (d: DatoOral | null) => Promise<void>; modo: Modo; puede: boolean; formato?: (n: number) => string; max?: number }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  if (!puede) {
    return (
      <div className="flex flex-wrap items-center gap-2" style={{ padding: "8px 0" }}>
        <span className="t-dato fuerte">{etiqueta}</span>
        <span className="t-dato">{valor ? mostrarDato(valor, formato ?? cantidad) : <SinDato />}</span>
        <ChipEstado estado={valor?.estado === "no_lo_se" ? null : valor?.estado} />
      </div>
    );
  }
  return (
    <div>
      <CampoDato
        etiqueta={etiqueta}
        valor={valor ?? null}
        modo={modo}
        formato={formato}
        max={max}
        alGuardar={async (d) => {
          setAviso(null);
          try {
            await guardar(d);
            setAviso({ tipo: "ok", texto: "Guardado" });
          } catch (e) {
            setAviso({ tipo: "error", texto: mensajeDe(e) });
          }
        }}
      />
      <AvisoGuardado estado={aviso} />
    </div>
  );
}

// ─── Una venta en otra moneda ────────────────────────────────────────────────────────────────────

type BorradorOp = { fecha_venta: string; fecha_cobro: string; moneda: string; monto: string; tc_cotizado: string; tc_cobro: string; recibido: string; comisiones: string; conversiones: string; estado: "estimado" | "contado" | "comprobado" };

const borradorOp = (o: OperacionLeida | null, monedaPorDefecto: string): BorradorOp => ({
  fecha_venta: o?.fecha_venta ?? "",
  fecha_cobro: o?.fecha_cobro ?? "",
  moneda: o?.moneda ?? monedaPorDefecto,
  monto: o ? String(o.monto) : "",
  tc_cotizado: o?.tc_cotizado != null ? String(o.tc_cotizado) : "",
  tc_cobro: o?.tc_cobro != null ? String(o.tc_cobro) : "",
  recibido: o?.recibido != null ? String(o.recibido) : "",
  comisiones: o?.comisiones != null ? String(o.comisiones) : "",
  conversiones: o?.conversiones != null ? String(o.conversiones) : "",
  estado: o?.estado === "contado" || o?.estado === "comprobado" ? o.estado : "estimado",
});

/** Lo que se dice de una venta: «Esperabas S/ X y te llegaron S/ Y: S/ Z se quedaron en el camino», o qué falta. */
function textoFuga(o: OperacionLeida, f: FugaLeida | undefined, fmt: (n: number) => string): string {
  if (!f) return "Todavía no sabemos cuánto se quedó en el camino.";
  if (f.esperado != null && f.total != null && o.recibido != null) {
    return f.total > 0
      ? `Esperabas ${fmt(f.esperado)} y te llegaron ${fmt(o.recibido)}: ${fmt(f.total)} se quedaron en el camino.`
      : `Esperabas ${fmt(f.esperado)} y te llegaron ${fmt(o.recibido)}: no se perdió nada en el camino.`;
  }
  if (f.esperado != null && f.total != null) return `Esperabas ${fmt(f.esperado)}. Sin saber cuánto te llegó, al menos ${fmt(f.total)} se quedaron en el cambio.`;
  const falta = f.motivos.find((m) => m.startsWith("falta")) ?? f.motivos[0];
  return falta ? `Para saber cuánto se quedó en el camino ${falta}.` : "Todavía no sabemos cuánto se quedó en el camino.";
}

function EditorOperacion({ companyId, modo, o, monedaPorDefecto, puedeQuitar, alCerrar }: { companyId: string; modo: Modo; o: OperacionLeida | null; monedaPorDefecto: string; puedeQuitar: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<BorradorOp>(borradorOp(o, monedaPorDefecto));
  const [aviso, setAviso] = useState<Aviso>(null);
  const [trabajando, setTrabajando] = useState(false);
  const poner = (k: keyof BorradorOp) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setB((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    const numeros: Record<string, number | null> = {};
    for (const k of ["monto", "tc_cotizado", "tc_cobro", "recibido", "comisiones"] as const) {
      const r = leerNumero(b[k]);
      if (!r.ok) {
        setAviso({ tipo: "error", texto: `${r.aviso}` });
        return;
      }
      numeros[k] = r.n;
    }
    if (numeros.monto == null || numeros.monto <= 0) {
      setAviso({ tipo: "error", texto: "Falta cuánto vendiste, en la moneda de la venta." });
      return;
    }
    const moneda = codigosDeMoneda(b.moneda).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(moneda)) {
      setAviso({ tipo: "error", texto: "La moneda se escribe con sus tres letras: USD, CLP, EUR…" });
      return;
    }
    const cuerpo = {
      fecha_venta: b.fecha_venta || null,
      fecha_cobro: b.fecha_cobro || null,
      moneda,
      monto: numeros.monto,
      tc_cotizado: numeros.tc_cotizado,
      tc_cobro: numeros.tc_cobro,
      recibido: numeros.recibido,
      comisiones: numeros.comisiones,
      conversiones: b.conversiones === "1" ? 1 : b.conversiones === "2" ? 2 : null,
      estado: modo === "dueno" && b.estado === "comprobado" ? undefined : b.estado,
    };
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}/moneda${o ? `/${o.id}` : ""}`, { method: o ? "PATCH" : "POST", json: cuerpo });
      router.refresh();
      alCerrar();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async () => {
    if (!o) return;
    setTrabajando(true);
    try {
      await pedir(`/api/companies/${companyId}/moneda/${o.id}`, { method: "DELETE" });
      router.refresh();
      alCerrar();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e, "No pudimos quitarla. Inténtalo de nuevo.") });
      setTrabajando(false);
    }
  };

  return (
    <div className="pozo pozo--chico flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Qué día vendiste?</span>
          <input aria-label="Día de la venta" className="campo" type="date" value={b.fecha_venta} onChange={poner("fecha_venta")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Qué día te pagaron?</span>
          <input aria-label="Día del cobro" className="campo" type="date" value={b.fecha_cobro} onChange={poner("fecha_cobro")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿En qué moneda?</span>
          <input aria-label="Moneda de la venta" className="campo" maxLength={20} value={b.moneda} list="monedas-comunes" onChange={poner("moneda")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Cuánto vendiste, en su moneda?</span>
          <input aria-label="Cuánto vendiste, en la moneda de la venta" className="campo" inputMode="decimal" value={b.monto} onChange={poner("monto")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿A cuánto calculaste el cambio cuando pusiste el precio?</span>
          <input aria-label="Tipo de cambio con el que pusiste el precio" className="campo" inputMode="decimal" value={b.tc_cotizado} onChange={poner("tc_cotizado")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Cuánto te llegó al final a tu cuenta?</span>
          <input aria-label="Cuánto te llegó a tu cuenta" className="campo" inputMode="decimal" value={b.recibido} onChange={poner("recibido")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Cuánto te cobró el banco?</span>
          <input aria-label="Cuánto te cobró el banco" className="campo" inputMode="decimal" value={b.comisiones} onChange={poner("comisiones")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿A cuánto estaba el cambio el día que te pagaron? (si lo sabes)</span>
          <input aria-label="Tipo de cambio del día del cobro" className="campo" inputMode="decimal" value={b.tc_cobro} onChange={poner("tc_cobro")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Cuántas veces se cambió tu dinero?</span>
          <select aria-label="Cuántas veces se cambió el dinero" className="campo" value={b.conversiones} onChange={poner("conversiones")}>
            <option value="">No lo sé</option>
            <option value="1">Una vez</option>
            <option value="2">Dos veces (pasó por otra moneda)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-dato">¿Cómo lo sabes?</span>
          <select aria-label="Cómo sabes estos números" className="campo" value={b.estado} disabled={modo === "dueno" && b.estado === "comprobado"} onChange={poner("estado")}>
            <option value="estimado">Lo calculo a ojo</option>
            <option value="contado">Lo tengo anotado o lo conté</option>
            {(modo === "consultora" || b.estado === "comprobado") && <option value="comprobado">Comprobado con un documento</option>}
          </select>
        </label>
      </div>
      <datalist id="monedas-comunes">
        {MONEDAS_COMUNES.map((m) => (
          <option key={m} value={m} label={NOMBRE_MONEDA[m]} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton" disabled={trabajando} onClick={() => void guardar()}>{trabajando ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={alCerrar}>Cancelar</button>
        {o && puedeQuitar && <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void quitar()}>Quitar esta venta</button>}
      </div>
      <AvisoGuardado estado={aviso} />
    </div>
  );
}

function Operaciones({ companyId, modo, operaciones, fugas, puede, config, usuarioId, monedaPorDefecto }: { companyId: string; modo: Modo; operaciones: OperacionLeida[]; fugas: Record<string, FugaLeida>; puede: boolean; config: ConfigEmpresa; usuarioId: string | null; monedaPorDefecto: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const fmt = (n: number) => enMoneda(n, config);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="t-seccion">Tus ventas cobradas en otra moneda</h3>
      {operaciones.length === 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>{puede ? "Anota tus últimas ventas: con tres o cuatro ya se ve cuánto se queda en el camino." : "Todavía ninguna anotada."}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {operaciones.map((o) => {
          const comprobada = modo === "dueno" && o.estado === "comprobado";
          const editable = puede && !comprobada;
          return (
            <li key={o.id} style={{ borderTop: "1px solid var(--linea)", padding: "12px 0" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-dato fuerte">
                  {o.monto.toLocaleString("es-PE", { maximumFractionDigits: 2 })} {o.moneda}
                  {o.fecha_venta ? ` · vendida el ${o.fecha_venta.split("-").reverse().join("/")}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <ChipEstado estado={o.estado} />
                  {editable && (
                    <button type="button" className="boton boton--secundario boton--chico" aria-expanded={abierta === o.id} onClick={() => setAbierta(abierta === o.id ? null : o.id)}>
                      {abierta === o.id ? "Cerrar" : "Corregir"}
                    </button>
                  )}
                </span>
              </div>
              <p className="t-dato mt-1">{textoFuga(o, fugas[o.id], fmt)}</p>
              {abierta === o.id && (
                <div className="mt-3">
                  <EditorOperacion companyId={companyId} modo={modo} o={o} monedaPorDefecto={monedaPorDefecto} puedeQuitar={modo === "consultora" || (!!usuarioId && o.creado_por === usuarioId)} alCerrar={() => setAbierta(null)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {puede &&
        (abierta === "nueva" ? (
          <EditorOperacion companyId={companyId} modo={modo} o={null} monedaPorDefecto={monedaPorDefecto} puedeQuitar={false} alCerrar={() => setAbierta(null)} />
        ) : (
          <button type="button" className="boton boton--secundario" style={{ alignSelf: "flex-start" }} onClick={() => setAbierta("nueva")}>
            Anotar una venta
          </button>
        ))}
    </div>
  );
}

// ─── Los tres bloques ────────────────────────────────────────────────────────────────────────────

function BloqueMoneda({ companyId, modo, moneda, puede, refrescar, hayVentas }: { companyId: string; modo: Modo; moneda: Moneda; puede: boolean; refrescar: () => void; hayVentas: boolean }) {
  // Con ventas ya anotadas en la lista de abajo, «tu última venta…» se contestaría dos veces: no se pregunta (lo ya
  // contestado se sigue viendo).
  const preguntarUltima = (v: unknown) => !hayVentas || (v != null && v !== "");
  const guardar = (datos: Record<string, unknown>) => guardarBloque(companyId, "moneda", datos).then(refrescar);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [vendeEn, setVendeEn] = useState((moneda.vende_en ?? []).join(", "));
  const [costosEn, setCostosEn] = useState(moneda.costos_en ?? "");
  const [comoCobra, setComoCobra] = useState(moneda.como_cobra ?? "");
  const vendeEnMonto = (moneda.vende_en ?? [])[0] ?? "";
  const guardado = useRef(JSON.stringify({ v: (moneda.vende_en ?? []).join(", "), c: moneda.costos_en ?? "", k: moneda.como_cobra ?? "" }));
  const textos = async () => {
    // Al salir del grupo se guarda solo si algo cambió.
    const firma = JSON.stringify({ v: vendeEn, c: costosEn, k: comoCobra });
    if (firma === guardado.current) return;
    const lista = [...new Set(codigosDeMoneda(vendeEn).split(/[\s,;]+/).map((m) => m.trim().toUpperCase()).filter(Boolean))];
    if (lista.some((m) => !/^[A-Z]{3}$/.test(m)) || lista.length > 3) {
      setAviso({ tipo: "error", texto: "Escribe hasta tres monedas con sus tres letras, separadas por comas: USD, CLP…" });
      return;
    }
    const costos = codigosDeMoneda(costosEn).trim().toUpperCase();
    if (costos && !/^[A-Z]{3}$/.test(costos)) {
      setAviso({ tipo: "error", texto: "La moneda de tus costos va con sus tres letras: PEN, USD…" });
      return;
    }
    try {
      await guardar({ vende_en: lista.length ? lista : null, costos_en: costos || null, como_cobra: comoCobra.trim() ? comoCobra.trim().slice(0, 300) : null });
      guardado.current = firma;
      setAviso({ tipo: "ok", texto: "Guardado" });
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {puede ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void textos();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="t-dato fuerte">¿En qué moneda te pagan?</span>
            <input aria-label="En qué moneda te pagan" className="campo" value={vendeEn} maxLength={60} list="monedas-comunes-bloque" onChange={(e) => setVendeEn(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-dato fuerte">¿En qué moneda pagas tus costos?</span>
            <input aria-label="En qué moneda pagas tus costos" className="campo" value={costosEn} maxLength={20} list="monedas-comunes-bloque" onChange={(e) => setCostosEn(e.target.value)} />
          </label>
          {preguntarUltima(moneda.como_cobra) && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="t-dato fuerte">Tu última venta en otra moneda, ¿cómo te la pagaron?</span>
              <input aria-label="Cómo te pagaron tu última venta en otra moneda" className="campo" value={comoCobra} maxLength={300} onChange={(e) => setComoCobra(e.target.value)} />
            </label>
          )}
          <datalist id="monedas-comunes-bloque">
            {MONEDAS_COMUNES.map((m) => (
              <option key={m} value={m} label={NOMBRE_MONEDA[m]} />
            ))}
          </datalist>
          <AvisoGuardado estado={aviso} />
        </div>
      ) : (
        <p className="t-dato">
          Te pagan en: {(moneda.vende_en ?? []).join(", ") || <SinDato />} · Tus costos en: {moneda.costos_en ?? <SinDato />}
          {moneda.como_cobra ? ` · ${moneda.como_cobra}` : ""}
        </p>
      )}
      {/* El último caso, no un «más o menos» ni un «suele»: el episodio se recuerda; el promedio se inventa (revisión del 16-10). */}
      {preguntarUltima(moneda.dias_cobro) && (
        <Pregunta etiqueta="Tu última venta en otra moneda, ¿en cuántos días te la pagaron?" valor={moneda.dias_cobro} guardar={(d) => guardar({ dias_cobro: d })} modo={modo} puede={puede} formato={(n) => `${cantidad(n)} días`} />
      )}
      <Pregunta etiqueta="El mes pasado, ¿cuántas ventas cobraste en otra moneda?" valor={moneda.operaciones_mes} guardar={(d) => guardar({ operaciones_mes: d })} modo={modo} puede={puede} />
      {preguntarUltima(moneda.monto_tipico) && (
        <Pregunta
          etiqueta={`Tu última venta en otra moneda, ¿de cuánto fue${vendeEnMonto ? `, en ${vendeEnMonto}` : ""}?`}
          valor={moneda.monto_tipico}
          guardar={(d) => guardar({ monto_tipico: d })}
          modo={modo}
          puede={puede}
          formato={(n) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}${vendeEnMonto ? ` ${vendeEnMonto}` : ""}`}
        />
      )}
      {preguntarUltima(moneda.conversiones) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-dato fuerte">La última vez que te pagaron, ¿cuántas veces se cambió tu dinero?</span>
          {puede ? (
            <span className="flex flex-wrap gap-2" role="group" aria-label="Cuántas veces se cambió tu dinero la última vez">
              {([[1, "Una vez"], [2, "Dos veces"], ["no_lo_se", "No lo sé"]] as const).map(([v, t]) => (
                <button key={String(v)} type="button" className={moneda.conversiones === v ? "boton" : "boton boton--secundario"} aria-pressed={moneda.conversiones === v} onClick={() => void guardar({ conversiones: v }).catch((e) => setAviso({ tipo: "error", texto: mensajeDe(e) }))}>
                  {t}
                </button>
              ))}
            </span>
          ) : (
            <span className="t-dato">{moneda.conversiones === 1 ? "Una vez" : moneda.conversiones === 2 ? "Dos veces" : moneda.conversiones === "no_lo_se" ? "No lo sabe" : <SinDato />}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * COBROS Y MERCADERÍA. Tres preguntas de sí o no; cada «sí» abre su bloque: ventas en otra moneda (con la lista de
 * ventas y lo que se quedó en el camino en cada una), venta al crédito y mercadería guardada. Cada bloque se escribe
 * solo con su sección abierta (la consultora, siempre). Lo que se calcula viene del servidor: aquí no se inventa nada.
 */
export function CobrosYMercaderia({ companyId, modo, modulos, moneda, credito, inventario, operaciones, fugas, puede, config, usuarioId }: Props) {
  const router = useRouter();
  const [mods, setMods] = useState<Modulos>(modulos);
  const [aviso, setAviso] = useState<Aviso>(null);
  const ultimo = useRef(0);
  const refrescar = () => router.refresh();
  const fmt = (n: number) => enMoneda(n, config);
  const monedaPorDefecto = (moneda.vende_en ?? [])[0] ?? "USD";

  const marcar = async (clave: ClaveModulo, v: boolean) => {
    const previo = mods;
    const n = ++ultimo.current;
    setMods({ ...mods, [clave]: v });
    setAviso(null);
    try {
      await guardarBloque(companyId, "modulos", { [clave]: v });
      router.refresh();
    } catch (e) {
      if (n === ultimo.current) setMods(previo);
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    }
  };

  const guardarCredito = (datos: Record<string, unknown>) => guardarBloque(companyId, "credito", datos).then(refrescar);
  const guardarInventario = (datos: Record<string, unknown>) => guardarBloque(companyId, "inventario", datos).then(refrescar);

  return (
    <div className="flex flex-col gap-6">
      <AvisoGuardado estado={aviso} />

      <section id="moneda" className="panel p-5 flex flex-col gap-4" style={{ scrollMarginTop: 90 }}>
        <SiNo clave="moneda" valor={mods.moneda} puede={puede.modulos || puede.moneda} alCambiar={(v) => void marcar("moneda", v)} />
        {mods.moneda === true && (
          <>
            <BloqueMoneda companyId={companyId} modo={modo} moneda={moneda} puede={puede.moneda} refrescar={refrescar} hayVentas={operaciones.length > 0} />
            <Operaciones companyId={companyId} modo={modo} operaciones={operaciones} fugas={fugas} puede={puede.moneda} config={config} usuarioId={usuarioId} monedaPorDefecto={monedaPorDefecto} />
          </>
        )}
      </section>

      <section id="credito" className="panel p-5 flex flex-col gap-4" style={{ scrollMarginTop: 90 }}>
        <SiNo clave="credito" valor={mods.credito} puede={puede.modulos || puede.credito} alCambiar={(v) => void marcar("credito", v)} />
        {mods.credito === true && (
          <>
            {/* Conteos de lo último que pasó, no proporciones ni promedios: 8X hace la cuenta (revisión del 16-10). */}
            <Pregunta etiqueta="De tus últimas 10 ventas, ¿cuántas fiaste?" valor={credito.de_cada_10} guardar={(d) => guardarCredito({ de_cada_10: d })} modo={modo} puede={puede.credito} max={10} />
            <Pregunta etiqueta="La última vez que fiaste, ¿en cuántos días te pagaron?" valor={credito.dias} guardar={(d) => guardarCredito({ dias: d })} modo={modo} puede={puede.credito} formato={(n) => `${cantidad(n)} días`} />
            <Pregunta etiqueta="De las últimas 10 ventas que fiaste, ¿cuántas nunca llegaste a cobrar?" valor={credito.incobrables_de_cada_10} guardar={(d) => guardarCredito({ incobrables_de_cada_10: d })} modo={modo} puede={puede.credito} max={10} />
          </>
        )}
      </section>

      <section id="inventario" className="panel p-5 flex flex-col gap-4" style={{ scrollMarginTop: 90 }}>
        <SiNo clave="inventario" valor={mods.inventario} puede={puede.modulos || puede.inventario} alCambiar={(v) => void marcar("inventario", v)} />
        {mods.inventario === true && (
          <>
            <Pregunta etiqueta="¿Cuánto dinero tienes hoy en mercadería o materiales guardados?" valor={inventario.valor} guardar={(d) => guardarInventario({ valor: d })} modo={modo} puede={puede.inventario} formato={fmt} />
            <Pregunta etiqueta="La última vez que compraste mercadería o materiales, ¿cuántos meses te duró?" valor={inventario.meses} guardar={(d) => guardarInventario({ meses: d })} modo={modo} puede={puede.inventario} formato={(n) => `${cantidad(n)} meses`} />
            <Pregunta etiqueta="De todo eso, ¿cuánto dinero no se mueve hace más de tres meses?" valor={inventario.parado} guardar={(d) => guardarInventario({ parado: d })} modo={modo} puede={puede.inventario} formato={fmt} />
          </>
        )}
      </section>
    </div>
  );
}

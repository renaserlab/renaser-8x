"use client";
import { useState } from "react";
import { useEnviar, aMonto } from "./enviar";

type Cat = { id: string; nombre: string; numero: string };

/** El día del mes de una fecha AAAA-MM-DD. */
const diaDe = (fecha: string) => Number(fecha.slice(8, 10)) || 1;

/**
 * NUEVO PAGO QUE SE REPITE: qué es, cuánto, en qué moneda, con qué categoría de gasto sale de la caja (por defecto la
 * primera de gasto fijo), qué día del mes vence y cuándo vence la primera vez. Después el vencimiento avanza solo al pagar.
 */
export function NuevoPago({ categorias, hoy }: { categorias: Cat[]; hoy: string }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const vacio = { nombre: "", monto: "", moneda: "PEN", categoria_id: categorias[0]?.id ?? "", proximo_vencimiento: hoy };
  const [f, setF] = useState(vacio);
  const [listo, setListo] = useState(false);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => { setListo(false); setF({ ...f, [k]: e.target.value }); } });
  const cat = categorias.find((c) => c.id === f.categoria_id);
  return (
    <form
      className="os-form fin-c-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const monto = aMonto(f.monto);
        if (!monto) return setError("Escribe cuánto pagas cada vez (mayor que cero).");
        const r = await enviar("/api/fin/pagos", "POST", { ...f, monto, dia: diaDe(f.proximo_vencimiento) });
        if (r) {
          setF(vacio);
          setListo(true);
        }
      }}
    >
      <label>
        <span className="t-etiqueta">Qué pagas</span>
        <input className="campo" required maxLength={120} placeholder="Alquiler del local" {...campo("nombre")} />
      </label>
      <label>
        <span className="t-etiqueta">Cuánto, cada vez</span>
        <span className="fin-c-monto">
          <input className="campo" required inputMode="decimal" placeholder="0.00" aria-label="Monto de cada pago" {...campo("monto")} />
          <select className="campo" aria-label="Moneda" {...campo("moneda")}>
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </span>
      </label>
      <label>
        <span className="t-etiqueta">Sale de la caja como</span>
        <select className="campo" required {...campo("categoria_id")}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="t-etiqueta">Primer vencimiento</span>
        <input className="campo" type="date" required {...campo("proximo_vencimiento")} />
      </label>
      <p className="fin-c-pista">
        Vence cada mes el día {diaDe(f.proximo_vencimiento)}
        {diaDe(f.proximo_vencimiento) > 28 ? " (en los meses más cortos, el último día)" : ""}
        {cat ? `. Al pagarlo sale solo de tu caja como «${cat.nombre}» → ${cat.numero}.` : "."}
      </p>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Crear pago"}</button>
        {listo && !error && <p className="os-ok" role="status">Listo: ya está en la lista.</p>}
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

/**
 * PAGAR: cuánto se pagó (por defecto el monto de siempre) y cuándo (no puede ser futuro). Una sola operación: el gasto
 * sale de la caja, el ciclo queda pagado y el vencimiento avanza. Se dice qué pasó.
 */
export function Pagar({ pagoId, monto, hoy }: { pagoId: string; monto: number; hoy: string }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ monto: String(monto), fecha: hoy });
  const [aviso, setAviso] = useState<string | null>(null);
  if (!abierto) {
    return (
      <>
        {aviso && <p className="fin-c-ok fin-c-aviso-pago" role="status">{aviso}</p>}
        <button type="button" className="boton boton--chico boton--secundario" onClick={() => { setAviso(null); setF({ monto: String(monto), fecha: hoy }); setAbierto(true); }}>
          Pagar
        </button>
      </>
    );
  }
  return (
    <form
      className="fin-c-pagar fin-c-pagar--linea"
      onSubmit={async (e) => {
        e.preventDefault();
        const m = aMonto(f.monto);
        if (!m) return setError("Escribe cuánto pagaste (mayor que cero).");
        if (f.fecha > hoy) return setError("La fecha del pago no puede ser futura: se registra cuando el cargo ya ocurrió.");
        const r = await enviar<{ aviso?: string }>(`/api/fin/pagos/${pagoId}/pagar`, "POST", { monto: m, fecha: f.fecha });
        if (r) {
          setAviso(`Pagado. ${r.aviso ?? "Salió solo de tu caja."}`);
          setAbierto(false);
        }
      }}
    >
      <span className="fin-c-fila">
        <input className="campo fin-c-crece" inputMode="decimal" required aria-label="Monto pagado" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
        <input className="campo" type="date" required max={hoy} aria-label="Fecha del pago" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
      </span>
      <span className="fin-c-fila">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Pagando…" : "Confirmar pago"}</button>
        <button type="button" className="boton-enlace" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
      </span>
      {error && <p className="os-error" role="alert">{error}</p>}
    </form>
  );
}

/** ANULAR EL ÚLTIMO PAGO HECHO: se lleva su gasto de la caja y el vencimiento vuelve a ese ciclo. Pide confirmar. */
export function AnularPagoHecho({ hechoId, texto }: { hechoId: string; texto: string }) {
  const { enviar, enviando, error } = useEnviar();
  return (
    <span className="fin-c-anular">
      <button
        type="button"
        className="boton-enlace boton-enlace--peligro"
        disabled={enviando}
        onClick={() => {
          if (window.confirm(`¿Anular el pago de ${texto}? Su gasto sale de la caja y el vencimiento vuelve a esa fecha.`)) void enviar(`/api/fin/pagos-hechos/${hechoId}`, "DELETE");
        }}
      >
        {enviando ? "Anulando…" : "Anular"}
      </button>
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}

/**
 * EDITAR o DAR DE BAJA un pago que se repite. Se cambian el nombre, el monto, la categoría y el día; el próximo
 * vencimiento no se toca (avanza al pagar). La baja pide su motivo escrito.
 */
export function EditarPago({ pago, categorias }: { pago: { id: string; nombre: string; monto: number; categoria_id: string; dia: number }; categorias: Cat[] }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const [f, setF] = useState({ nombre: pago.nombre, monto: String(pago.monto), categoria_id: pago.categoria_id, dia: String(pago.dia) });
  const [motivo, setMotivo] = useState("");
  const [listo, setListo] = useState(false);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => { setListo(false); setF({ ...f, [k]: e.target.value }); } });
  return (
    <div className="fin-c-editar">
      <form
        className="os-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const monto = aMonto(f.monto);
          const dia = Number(f.dia);
          if (!monto) return setError("Escribe el monto (mayor que cero).");
          if (!Number.isInteger(dia) || dia < 1 || dia > 31) return setError("El día va del 1 al 31.");
          if (await enviar(`/api/fin/pagos/${pago.id}`, "PATCH", { nombre: f.nombre, monto, categoria_id: f.categoria_id, dia })) setListo(true);
        }}
      >
        <label>
          <span className="t-etiqueta">Qué pagas</span>
          <input className="campo" required maxLength={120} {...campo("nombre")} />
        </label>
        <label>
          <span className="t-etiqueta">Cuánto</span>
          <input className="campo" required inputMode="decimal" {...campo("monto")} />
        </label>
        <label>
          <span className="t-etiqueta">Categoría</span>
          <select className="campo" {...campo("categoria_id")}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="t-etiqueta">Día del mes</span>
          <input className="campo" type="number" min={1} max={31} required {...campo("dia")} />
        </label>
        <div className="os-form__acciones">
          <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Guardar cambios"}</button>
          {listo && !error && <p className="os-ok" role="status">Guardado. El próximo vencimiento no cambia: avanza al pagar.</p>}
        </div>
      </form>
      <form
        className="fin-c-motivo"
        onSubmit={async (e) => {
          e.preventDefault();
          if (motivo.trim().length < 10) return setError("Para darlo de baja, escribe el motivo (al menos diez caracteres).");
          await enviar(`/api/fin/pagos/${pago.id}`, "PATCH", { baja: true, motivo: motivo.trim() });
        }}
      >
        <label>
          <span className="t-etiqueta">Dar de baja (ya no se paga)</span>
          <textarea className="campo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Nos mudamos y ya no pagamos este alquiler" />
        </label>
        <button className="boton boton--chico boton--peligro" disabled={enviando}>Dar de baja</button>
      </form>
      {error && <p className="os-error" role="alert">{error}</p>}
    </div>
  );
}

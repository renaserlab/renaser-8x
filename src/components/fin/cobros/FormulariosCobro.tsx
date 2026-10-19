"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEnviar, aMonto } from "./enviar";

type Cat = { id: string; nombre: string; numero: string };

/**
 * NUEVO COBRO: quién te debe, por qué, cuánto, en qué moneda, desde cuándo y cuándo vence, y con qué categoría de
 * ingreso entrarán sus pagos a la caja (por defecto la primera de venta). El cobro no mueve la caja: la mueve cada pago.
 */
export function NuevoCobro({ categorias, hoy }: { categorias: Cat[]; hoy: string }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const router = useRouter();
  const vacio = { cliente: "", concepto: "", total: "", moneda: "PEN", emitido: hoy, vence: hoy, categoria_id: categorias[0]?.id ?? "" };
  const [f, setF] = useState(vacio);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  const cat = categorias.find((c) => c.id === f.categoria_id);
  return (
    <form
      className="os-form fin-c-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const total = aMonto(f.total);
        if (!total) return setError("Escribe el total del cobro (mayor que cero).");
        if (f.vence < f.emitido) return setError("El cobro no puede vencer antes de emitirse: revisa las dos fechas.");
        const r = await enviar<{ id: string }>("/api/fin/cobros", "POST", { ...f, concepto: f.concepto || null, total });
        if (r?.id) {
          setF(vacio);
          router.push(`/os/finanzas/cobros?cobro=${r.id}`, { scroll: false });
        }
      }}
    >
      <label>
        <span className="t-etiqueta">Cliente</span>
        <input className="campo" required maxLength={160} placeholder="Ferretería El Sol" {...campo("cliente")} />
      </label>
      <label>
        <span className="t-etiqueta">Por qué te debe</span>
        <input className="campo" maxLength={300} placeholder="Pedido mayorista #2231" {...campo("concepto")} />
      </label>
      <label>
        <span className="t-etiqueta">Total</span>
        <span className="fin-c-monto">
          <input className="campo" required inputMode="decimal" placeholder="0.00" aria-label="Total del cobro" {...campo("total")} />
          <select className="campo" aria-label="Moneda" {...campo("moneda")}>
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </span>
      </label>
      <label>
        <span className="t-etiqueta">Emitido</span>
        <input className="campo" type="date" required {...campo("emitido")} />
      </label>
      <label>
        <span className="t-etiqueta">Vence</span>
        <input className="campo" type="date" required min={f.emitido} {...campo("vence")} />
      </label>
      <label>
        <span className="t-etiqueta">Sus pagos entran como</span>
        <select className="campo" required {...campo("categoria_id")}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </label>
      {cat && <p className="fin-c-pista">Cuando te paguen, el dinero entra solo a tu caja como «{cat.nombre}» → {cat.numero}.</p>}
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Crear cobro"}</button>
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

const MEDIOS = ["Transferencia", "Yape / Plin", "Efectivo", "Otro"];

/**
 * REGISTRAR UN PAGO del cobro elegido: cuánto (por defecto, lo que falta), cuándo (no puede ser futuro) y cómo. Al
 * guardarlo, el dinero entra solo a la caja; se dice como qué y a qué número de «Tus números» fue.
 */
export function RegistrarPago({ cobroId, falta, moneda, hoy }: { cobroId: string; falta: number; moneda: "PEN" | "USD"; hoy: string }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const [f, setF] = useState({ monto: String(falta), fecha: hoy, medio: MEDIOS[0]! });
  const [aviso, setAviso] = useState<string | null>(null);
  // Con el último pago el cobro queda pagado y el formulario se va; el aviso de la caja se queda a la vista.
  if (falta <= 0) return aviso ? <p className="fin-c-ok" role="status">{aviso} El cobro quedó pagado.</p> : null;
  return (
    <form
      className="fin-c-pagar"
      onSubmit={async (e) => {
        e.preventDefault();
        setAviso(null);
        const monto = aMonto(f.monto);
        if (!monto) return setError("Escribe cuánto te pagaron (mayor que cero).");
        if (monto > falta) return setError(`Falta cobrar ${moneda === "USD" ? "US$" : "S/"} ${falta}: no se puede registrar más que eso.`);
        if (f.fecha > hoy) return setError("La fecha del pago no puede ser futura: se registra cuando el dinero ya entró.");
        const r = await enviar<{ aviso?: string }>(`/api/fin/cobros/${cobroId}/pagos`, "POST", { monto, fecha: f.fecha, medio: f.medio });
        if (r) {
          setAviso(`Listo. ${r.aviso ?? "Entró solo a tu caja."} No hay que anotarlo en ningún otro lado.`);
          setF({ ...f, monto: String(Math.round((falta - monto) * 100) / 100) });
        }
      }}
    >
      <b>Registrar un pago</b>
      <span className="fin-c-fila">
        <input className="campo fin-c-crece" inputMode="decimal" required aria-label={`Monto del pago en ${moneda === "USD" ? "dólares" : "soles"}`} value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
        <select className="campo" aria-label="Medio de pago" value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })}>
          {MEDIOS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </span>
      <label className="fin-c-fecha">
        <span className="t-etiqueta">Fecha del pago</span>
        <input className="campo" type="date" required max={hoy} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
      </label>
      <button className="boton" disabled={enviando}>{enviando ? "Registrando…" : "Registrar pago"}</button>
      {aviso && !error && <p className="fin-c-ok" role="status">{aviso}</p>}
      {error && <p className="os-error" role="alert">{error}</p>}
    </form>
  );
}

/** ANULAR UN PAGO de un cobro: se lleva su ingreso de la caja. Pide confirmar: no es un clic suelto. */
export function AnularPagoCobro({ pagoId, texto }: { pagoId: string; texto: string }) {
  const { enviar, enviando, error } = useEnviar();
  return (
    <span className="fin-c-anular">
      <button
        type="button"
        className="boton-enlace boton-enlace--peligro"
        disabled={enviando}
        onClick={() => {
          if (window.confirm(`¿Anular el pago de ${texto}? Su ingreso sale de la caja y lo que te deben vuelve a subir.`)) void enviar(`/api/fin/cobro-pagos/${pagoId}`, "DELETE");
        }}
      >
        {enviando ? "Anulando…" : "Anular"}
      </button>
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}

/** ANULAR UN COBRO, con su motivo escrito (al menos diez caracteres). Solo uno sin pagos. */
export function AnularCobro({ cobroId }: { cobroId: string }) {
  const { enviar, enviando, error, setError } = useEnviar();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto) {
    return (
      <button type="button" className="boton-enlace boton-enlace--tenue" onClick={() => setAbierto(true)}>
        Anular este cobro
      </button>
    );
  }
  return (
    <form
      className="fin-c-motivo"
      onSubmit={async (e) => {
        e.preventDefault();
        if (motivo.trim().length < 10) return setError("Escribe el motivo (al menos diez caracteres): es lo que se lee cuando alguien pregunte por qué se anuló.");
        await enviar(`/api/fin/cobros/${cobroId}`, "PATCH", { anular: true, motivo: motivo.trim() });
      }}
    >
      <label>
        <span className="t-etiqueta">Por qué se anula</span>
        <textarea className="campo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="El cliente devolvió el pedido completo" />
      </label>
      <span className="fin-c-fila">
        <button className="boton boton--chico boton--peligro" disabled={enviando}>{enviando ? "Anulando…" : "Anular cobro"}</button>
        <button type="button" className="boton-enlace" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
      </span>
      {error && <p className="os-error" role="alert">{error}</p>}
    </form>
  );
}

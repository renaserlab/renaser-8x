"use client";
import { useState } from "react";
import { useEnviarFin } from "./enviar";
import { fechaCorta, leerMonto, type SaldoInicial as Saldo } from "@/lib/fin/caja-cuentas";
import { textoMonto, type Moneda } from "@/lib/fin/calculos";

/**
 * EL SALDO INICIAL, por moneda: cuánto había el día que empezaste a usar Finanzas. Sin él, «dinero en caja hoy» no se
 * puede saber. Uno vigente por moneda; para cambiarlo se anula con un motivo y se anota otro. Nunca con fecha futura.
 */
export function SaldoInicial({ saldos, hoy, registra }: { saldos: Saldo[]; hoy: string; registra: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {(["PEN", "USD"] as const).map((m) => (
        <FilaSaldo key={m} moneda={m} saldo={saldos.find((s) => s.moneda === m) ?? null} hoy={hoy} registra={registra} />
      ))}
    </div>
  );
}

function FilaSaldo({ moneda, saldo, hoy, registra }: { moneda: Moneda; saldo: Saldo | null; hoy: string; registra: boolean }) {
  const { enviar, enviando, error } = useEnviarFin();
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const nombre = moneda === "PEN" ? "En soles" : "En dólares";

  if (saldo) {
    return (
      <div className="flex flex-col gap-2">
        <h3>{nombre}</h3>
        <p className="fin-texto">
          <b>{textoMonto(saldo.monto, moneda)}</b> al {fechaCorta(saldo.fecha, true)}.
        </p>
        {registra && !anulando && (
          <button type="button" className="boton-enlace boton-enlace--tenue" style={{ alignSelf: "flex-start" }} onClick={() => setAnulando(true)}>
            Anularlo para corregirlo
          </button>
        )}
        {anulando && (
          <form
            className="fin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (motivo.trim().length < 10) return setProblema("Cuenta en una frase por qué lo anulas (al menos diez letras).");
              setProblema(null);
              if (await enviar(`/api/fin/saldo-inicial/${saldo.id}`, "PATCH", { motivo: motivo.trim() })) setAnulando(false);
            }}
          >
            <label>
              <span className="t-etiqueta">Por qué lo anulas</span>
              <input className="campo" aria-label="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Conté mal el efectivo de la caja chica" />
            </label>
            <div className="fin-form__acciones">
              <button className="boton boton--chico boton--peligro" disabled={enviando}>{enviando ? "Anulando…" : "Anular"}</button>
              <button type="button" className="boton-enlace" onClick={() => setAnulando(false)}>Cancelar</button>
            </div>
            {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
          </form>
        )}
      </div>
    );
  }

  if (!registra) {
    return (
      <div className="flex flex-col gap-2">
        <h3>{nombre}</h3>
        <p className="fin-tenue">Sin saldo inicial.</p>
      </div>
    );
  }

  return (
    <form
      className="fin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const valor = leerMonto(monto);
        if (valor == null || valor < 0) return setProblema("Escribe cuánto había: cero o más.");
        if (fecha > hoy) return setProblema("No puede ser una fecha futura: anota lo que había, no lo que habrá.");
        setProblema(null);
        if (await enviar("/api/fin/saldo-inicial", "POST", { moneda, monto: valor, fecha })) setMonto("");
      }}
    >
      <h3>{nombre}</h3>
      <div className="fin-form__fila">
        <label>
          <span className="t-etiqueta">Cuánto había</span>
          <input className="campo" aria-label={`Saldo inicial ${nombre.toLowerCase()}`} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={moneda === "PEN" ? "3,500.00" : "0.00"} />
        </label>
        <label>
          <span className="t-etiqueta">Al día</span>
          <input className="campo" aria-label={`Fecha del saldo inicial ${nombre.toLowerCase()}`} type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
      </div>
      <div className="fin-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Guardar saldo inicial"}</button>
      </div>
      {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
    </form>
  );
}

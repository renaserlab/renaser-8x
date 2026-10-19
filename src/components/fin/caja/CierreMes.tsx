"use client";
import { useState } from "react";
import { useEnviarFin } from "./enviar";
import { leerMonto } from "@/lib/fin/caja-cuentas";

/**
 * CERRAR O REABRIR EL MES. Cerrar es decir «este mes ya está contado»: deja de moverse y sus dólares entran en soles a
 * «Tus números» con el tipo de cambio que se anota aquí (y de dónde salió). Reabrir pide un motivo escrito; el cierre
 * anterior no se borra. Quien decide es la base: si se niega, su mensaje se muestra tal cual.
 */
export function CerrarMes({ mes, nombreMes, tuvoDolares }: { mes: string; nombreMes: string; tuvoDolares: boolean }) {
  const { enviar, enviando, error } = useEnviarFin();
  const [abierto, setAbierto] = useState(false);
  const [tc, setTc] = useState("");
  const [fuente, setFuente] = useState("SBS");
  const [problema, setProblema] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button type="button" className="boton boton--chico" onClick={() => setAbierto(true)}>
        Cerrar {nombreMes}
      </button>
    );
  }
  return (
    <form
      className="fin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const valor = tc.trim() ? leerMonto(tc) : null;
        if (tc.trim() && (valor == null || valor <= 0)) return setProblema("El tipo de cambio es un número mayor que cero (por ejemplo, 3.75).");
        if (tuvoDolares && (valor == null || fuente.trim().length < 3)) return setProblema("Este mes tuvo dólares: anota el tipo de cambio y de dónde salió.");
        setProblema(null);
        if (await enviar("/api/fin/cierres", "POST", { mes, tipo_cambio: valor, fuente: fuente.trim() || null })) setAbierto(false);
      }}
    >
      <p className="fin-texto">
        Al cerrar {nombreMes}, ya no se podrá registrar ni corregir nada de ese mes (salvo reabriéndolo con un motivo).
        {tuvoDolares ? " Sus dólares pasan a soles en «Tus números» con este tipo de cambio." : " Este mes no tuvo dólares: el tipo de cambio es opcional."}
      </p>
      <div className="fin-form__fila">
        <label>
          <span className="t-etiqueta">Tipo de cambio{tuvoDolares ? "" : " (opcional)"}</span>
          <input className="campo" aria-label="Tipo de cambio" inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} placeholder="3.75" />
        </label>
        <label>
          <span className="t-etiqueta">De dónde salió</span>
          <input className="campo" aria-label="Fuente del tipo de cambio" value={fuente} onChange={(e) => setFuente(e.target.value)} maxLength={120} placeholder="SBS, tu banco…" />
        </label>
      </div>
      <div className="fin-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Cerrando…" : `Cerrar ${nombreMes}`}</button>
        <button type="button" className="boton-enlace" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
      {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
    </form>
  );
}

export function ReabrirMes({ mes, nombreMes }: { mes: string; nombreMes: string }) {
  const { enviar, enviando, error } = useEnviarFin();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button type="button" className="boton-enlace" onClick={() => setAbierto(true)}>
        Reabrir {nombreMes}
      </button>
    );
  }
  return (
    <form
      className="fin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (motivo.trim().length < 10) return setProblema("Cuenta en una frase por qué lo reabres (al menos diez letras).");
        setProblema(null);
        if (await enviar("/api/fin/cierres/reabrir", "POST", { mes, motivo: motivo.trim() })) setAbierto(false);
      }}
    >
      <label>
        <span className="t-etiqueta">Por qué lo reabres</span>
        <textarea className="campo" aria-label="Motivo de la reapertura" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={400} placeholder="Faltó registrar la factura de luz de fin de mes" />
      </label>
      <p className="fin-tenue">Reabierto, sus dólares vuelven a quedar fuera de «Tus números» hasta que lo cierres otra vez.</p>
      <div className="fin-form__acciones">
        <button className="boton boton--chico boton--peligro" disabled={enviando}>{enviando ? "Reabriendo…" : "Reabrir"}</button>
        <button type="button" className="boton-enlace" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
      {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
    </form>
  );
}

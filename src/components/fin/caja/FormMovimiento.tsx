"use client";
import { useState } from "react";
import { useEnviarFin } from "./enviar";
import { leerMonto } from "@/lib/fin/caja-cuentas";
import { NUMERO_DE_DESTINO, type Categoria, type Moneda, type TipoMovimiento } from "@/lib/fin/calculos";

/**
 * REGISTRAR UN MOVIMIENTO (Finanzas · Caja), como en el prototipo: entró o salió, monto y moneda, la categoría (solo las
 * de ese tipo, sin las archivadas) y, debajo, a qué número de «Tus números» va. La fecha propone hoy en el mes en curso
 * y el último día en un mes que ya pasó.
 */
export function FormMovimiento({ categorias, fecha: fechaInicial, nombreMes }: { categorias: Categoria[]; fecha: string; nombreMes: string }) {
  const { enviar, enviando, error } = useEnviarFin();
  const activas = categorias.filter((c) => !c.archivada);
  const [tipo, setTipo] = useState<TipoMovimiento>("ingreso");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("PEN");
  const [fecha, setFecha] = useState(fechaInicial);
  const [detalle, setDetalle] = useState("");
  const delTipo = activas.filter((c) => c.tipo === tipo);
  const [categoriaId, setCategoriaId] = useState<string>(delTipo[0]?.id ?? "");
  const elegida = delTipo.find((c) => c.id === categoriaId) ?? delTipo[0] ?? null;
  const [listo, setListo] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  const cambiarTipo = (t: TipoMovimiento) => {
    setTipo(t);
    setCategoriaId(activas.find((c) => c.tipo === t)?.id ?? "");
    setListo(null);
  };

  return (
    <form
      className="fin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setListo(null);
        const valor = leerMonto(monto);
        if (valor == null || valor <= 0) return setProblema("Escribe el monto: un número mayor que cero (por ejemplo, 1,250.50).");
        if (!elegida) return setProblema("Elige una categoría.");
        setProblema(null);
        const r = await enviar("/api/fin/movimientos", "POST", { fecha, tipo, categoria_id: elegida.id, monto: valor, moneda, detalle: detalle.trim() || null });
        if (r) {
          setListo(
            elegida.destino === "ninguno"
              ? `Registrado. Mueve tu caja de ${nombreMes}, pero no cuenta como venta ni como gasto.`
              : `Registrado. Ya suma en «${NUMERO_DE_DESTINO[elegida.destino]}» de ${nombreMes}${moneda === "USD" ? " (los dólares, al cerrar el mes)" : ""}.`
          );
          setMonto("");
          setDetalle("");
        }
      }}
    >
      <div className="fin-segmento" role="radiogroup" aria-label="Tipo de movimiento">
        <button type="button" role="radio" aria-checked={tipo === "ingreso"} onClick={() => cambiarTipo("ingreso")}>Entró</button>
        <button type="button" role="radio" aria-checked={tipo === "egreso"} onClick={() => cambiarTipo("egreso")}>Salió</button>
      </div>
      <div className="fin-form__fila">
        <label>
          <span className="t-etiqueta">Monto</span>
          <input className="campo" aria-label="Monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="1,250.50" required />
        </label>
        <label style={{ flex: "0 1 120px" }}>
          <span className="t-etiqueta">Moneda</span>
          <select className="campo" aria-label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
            <option value="PEN">S/ soles</option>
            <option value="USD">US$ dólares</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="t-etiqueta" id="fin-cat-rotulo">Categoría</span>
        {delTipo.length ? (
          <div className="fin-opciones" role="radiogroup" aria-labelledby="fin-cat-rotulo">
            {delTipo.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={elegida?.id === c.id} onClick={() => setCategoriaId(c.id)}>
                {c.nombre}
              </button>
            ))}
          </div>
        ) : (
          <p className="fin-tenue">No tienes categorías activas de lo que {tipo === "ingreso" ? "entra" : "sale"}. Créalas en «Tus categorías», más abajo.</p>
        )}
        {elegida && (
          <p className={`fin-pista fin-pista--${elegida.destino === "venta" ? "venta" : elegida.destino === "ninguno" ? "ninguno" : "otro"}`}>
            Cuenta en «Tus números» como: <b>{NUMERO_DE_DESTINO[elegida.destino]}</b>
          </p>
        )}
      </div>
      <div className="fin-form__fila">
        <label>
          <span className="t-etiqueta">Fecha</span>
          <input className="campo" aria-label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
      </div>
      <label>
        <span className="t-etiqueta">Detalle (opcional)</span>
        <input className="campo" aria-label="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={300} placeholder="Venta mostrador del sábado" />
      </label>
      <div className="fin-form__acciones">
        <button className="boton boton--grande" disabled={enviando || !elegida}>{enviando ? "Registrando…" : "Registrar"}</button>
      </div>
      {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
      {listo && <p className="fin-ok" role="status">{listo}</p>}
    </form>
  );
}

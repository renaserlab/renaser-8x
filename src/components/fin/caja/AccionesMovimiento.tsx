"use client";
import { useState } from "react";
import { useEnviarFin } from "./enviar";
import { leerMonto } from "@/lib/fin/caja-cuentas";
import { NUMERO_DE_DESTINO, type Categoria, type Moneda, type TipoMovimiento } from "@/lib/fin/calculos";

type Mov = { id: string; fecha: string; tipo: TipoMovimiento; categoria_id: string; monto: number; moneda: Moneda; detalle: string | null; origen: "manual" | "cobro" | "pago" };

/**
 * CORREGIR O BORRAR UN MOVIMIENTO, debajo de su fila. Uno manual se corrige entero o se borra (con confirmación). Uno
 * que entró o salió solo por un pago solo deja corregir su detalle: lo demás se corrige en ese pago (Cobros o Pagos).
 */
export function AccionesMovimiento({ mov, categorias }: { mov: Mov; categorias: Categoria[] }) {
  const { enviar, enviando, error } = useEnviarFin();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(mov.fecha);
  const [tipo, setTipo] = useState<TipoMovimiento>(mov.tipo);
  const [categoriaId, setCategoriaId] = useState(mov.categoria_id);
  const [monto, setMonto] = useState(String(mov.monto));
  const [moneda, setMoneda] = useState<Moneda>(mov.moneda);
  const [detalle, setDetalle] = useState(mov.detalle ?? "");
  const [problema, setProblema] = useState<string | null>(null);
  const manual = mov.origen === "manual";
  // Las de su tipo, sin las archivadas salvo la que ya tiene.
  const opciones = categorias.filter((c) => c.tipo === tipo && (!c.archivada || c.id === mov.categoria_id));

  if (!abierto) {
    return (
      <div className="fin-mov__acciones">
        <button type="button" className="boton-enlace" onClick={() => setAbierto(true)}>{manual ? "Corregir" : "Corregir el detalle"}</button>
        {manual && (
          <button
            type="button"
            className="boton-enlace boton-enlace--peligro"
            disabled={enviando}
            onClick={async () => {
              if (window.confirm("¿Borrar este movimiento? Sus números del mes se recalculan.")) await enviar(`/api/fin/movimientos/${mov.id}`, "DELETE");
            }}
          >
            Borrar
          </button>
        )}
        {error && <p className="fin-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="fin-form fin-mov__editor"
      onSubmit={async (e) => {
        e.preventDefault();
        let cuerpo: Record<string, unknown>;
        if (manual) {
          const valor = leerMonto(monto);
          if (valor == null || valor <= 0) return setProblema("El monto tiene que ser un número mayor que cero.");
          if (!opciones.some((c) => c.id === categoriaId)) return setProblema("Elige una categoría de lo que " + (tipo === "ingreso" ? "entra." : "sale."));
          cuerpo = { fecha, tipo, categoria_id: categoriaId, monto: valor, moneda, detalle: detalle.trim() || null };
        } else {
          cuerpo = { detalle: detalle.trim() || null };
        }
        setProblema(null);
        if (await enviar(`/api/fin/movimientos/${mov.id}`, "PATCH", cuerpo)) setAbierto(false);
      }}
    >
      {manual && (
        <>
          <div className="fin-segmento" role="radiogroup" aria-label="Tipo de movimiento">
            <button type="button" role="radio" aria-checked={tipo === "ingreso"} onClick={() => { setTipo("ingreso"); setCategoriaId(categorias.find((c) => c.tipo === "ingreso" && !c.archivada)?.id ?? ""); }}>Entró</button>
            <button type="button" role="radio" aria-checked={tipo === "egreso"} onClick={() => { setTipo("egreso"); setCategoriaId(categorias.find((c) => c.tipo === "egreso" && !c.archivada)?.id ?? ""); }}>Salió</button>
          </div>
          <div className="fin-form__fila">
            <label>
              <span className="t-etiqueta">Monto</span>
              <input className="campo" aria-label="Monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required />
            </label>
            <label>
              <span className="t-etiqueta">Moneda</span>
              <select className="campo" aria-label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
                <option value="PEN">S/ soles</option>
                <option value="USD">US$ dólares</option>
              </select>
            </label>
            <label>
              <span className="t-etiqueta">Fecha</span>
              <input className="campo" aria-label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </label>
          </div>
          <label>
            <span className="t-etiqueta">Categoría</span>
            <select className="campo" aria-label="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} → {NUMERO_DE_DESTINO[c.destino]}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        <span className="t-etiqueta">Detalle</span>
        <input className="campo" aria-label="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={300} />
      </label>
      <div className="fin-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="boton-enlace" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
      {(problema || error) && <p className="fin-error" role="alert">{problema ?? error}</p>}
    </form>
  );
}

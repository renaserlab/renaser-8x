"use client";
import { useState } from "react";
import { useEnviarFin } from "./enviar";
import { destinoValido, EXPLICACION_DESTINO } from "@/lib/fin/caja-cuentas";
import { NUMERO_DE_DESTINO, type Categoria, type Destino, type TipoMovimiento } from "@/lib/fin/calculos";

const DESTINOS: Destino[] = ["venta", "costo_variable", "gasto_fijo", "ninguno"];

/**
 * TUS CATEGORÍAS (Finanzas · Caja). Cada una dice a qué número de «Tus números» va lo que se registra con ella. Se
 * crean, se renombran, se les cambia el destino y se archivan; una que nadie usó se puede borrar. Las archivadas no se
 * ofrecen al registrar, pero lo ya registrado con ellas sigue contando.
 */
export function Categorias({ categorias, registra }: { categorias: Categoria[]; registra: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="fin-destinos" aria-label="Qué significa cada destino">
        {DESTINOS.map((d) => (
          <li key={d}>
            <span className={`fin-chip fin-chip--${d}`} style={{ alignSelf: "flex-start" }}>→ {NUMERO_DE_DESTINO[d]}</span>
            {EXPLICACION_DESTINO[d]}
          </li>
        ))}
      </ul>
      <div className="fin-categorias">
        {(["ingreso", "egreso"] as const).map((tipo) => (
          <section key={tipo} aria-label={tipo === "ingreso" ? "Lo que entra" : "Lo que sale"}>
            <h3>{tipo === "ingreso" ? "Lo que entra" : "Lo que sale"}</h3>
            {categorias
              .filter((c) => c.tipo === tipo)
              .map((c) => (
                <FilaCategoria key={c.id} c={c} registra={registra} />
              ))}
          </section>
        ))}
      </div>
      {registra && <NuevaCategoria />}
    </div>
  );
}

function FilaCategoria({ c, registra }: { c: Categoria; registra: boolean }) {
  const { enviar, enviando, error } = useEnviarFin();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const [aviso, setAviso] = useState<string | null>(null);
  const opciones = DESTINOS.filter((d) => destinoValido(c.tipo, d));
  return (
    <div className={`fin-cat${c.archivada ? " fin-cat--archivada" : ""}`}>
      {editando ? (
        <form
          className="flex flex-wrap items-center gap-2"
          style={{ flex: "1 1 220px" }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await enviar(`/api/fin/categorias/${c.id}`, "PATCH", { nombre: nombre.trim() })) setEditando(false);
          }}
        >
          <input className="campo" aria-label={`Nuevo nombre de ${c.nombre}`} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required style={{ flex: "1 1 160px" }} />
          <button className="boton boton--chico" disabled={enviando}>Guardar</button>
          <button type="button" className="boton-enlace" onClick={() => { setEditando(false); setNombre(c.nombre); }}>Cancelar</button>
        </form>
      ) : (
        <span className="fin-cat__nombre">{c.nombre}{c.archivada ? " (archivada)" : ""}</span>
      )}
      {registra ? (
        <select
          className="campo fin-cat__destino"
          aria-label={`A qué número va ${c.nombre}`}
          value={c.destino}
          disabled={enviando}
          onChange={async (e) => {
            setAviso(null);
            if (await enviar(`/api/fin/categorias/${c.id}`, "PATCH", { destino: e.target.value })) setAviso("Cambiado: los meses abiertos ya se recalcularon.");
          }}
        >
          {opciones.map((d) => (
            <option key={d} value={d}>→ {NUMERO_DE_DESTINO[d]}</option>
          ))}
        </select>
      ) : (
        <span className={`fin-chip fin-chip--${c.destino}`}>→ {NUMERO_DE_DESTINO[c.destino]}</span>
      )}
      {registra && !editando && (
        <span className="fin-cat__acciones">
          <button type="button" className="boton-enlace" onClick={() => setEditando(true)}>Renombrar</button>
          {c.archivada ? (
            <button type="button" className="boton-enlace" disabled={enviando} onClick={() => enviar(`/api/fin/categorias/${c.id}`, "PATCH", { archivada: false })}>Volver a usar</button>
          ) : (
            <button
              type="button"
              className="boton-enlace boton-enlace--peligro"
              disabled={enviando}
              onClick={async () => {
                if (!window.confirm(`¿Quitar «${c.nombre}»? Si ya la usaste, se archiva: deja de ofrecerse y lo registrado sigue contando.`)) return;
                const r = await enviar<{ archivada?: boolean; borrada?: boolean }>(`/api/fin/categorias/${c.id}`, "DELETE");
                if (r?.archivada) setAviso("Ya la usaste, así que se archivó.");
              }}
            >
              Quitar
            </button>
          )}
        </span>
      )}
      {aviso && <span className="fin-tenue" role="status" style={{ flexBasis: "100%" }}>{aviso}</span>}
      {error && <p className="fin-error" role="alert" style={{ flexBasis: "100%" }}>{error}</p>}
    </div>
  );
}

function NuevaCategoria() {
  const { enviar, enviando, error } = useEnviarFin();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoMovimiento>("egreso");
  const [destino, setDestino] = useState<Destino>("gasto_fijo");
  const opciones = DESTINOS.filter((d) => destinoValido(tipo, d));
  return (
    <form
      className="fin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await enviar("/api/fin/categorias", "POST", { nombre: nombre.trim(), tipo, destino })) setNombre("");
      }}
    >
      <h3>Nueva categoría</h3>
      <div className="fin-form__fila">
        <label>
          <span className="t-etiqueta">Nombre</span>
          <input className="campo" aria-label="Nombre de la categoría" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required placeholder="Movilidad" />
        </label>
        <label>
          <span className="t-etiqueta">Es de lo que</span>
          <select
            className="campo"
            aria-label="Tipo de la categoría"
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as TipoMovimiento;
              setTipo(t);
              setDestino(t === "ingreso" ? "venta" : "gasto_fijo");
            }}
          >
            <option value="ingreso">Entra</option>
            <option value="egreso">Sale</option>
          </select>
        </label>
        <label>
          <span className="t-etiqueta">Va a</span>
          <select className="campo" aria-label="A qué número va" value={destino} onChange={(e) => setDestino(e.target.value as Destino)}>
            {opciones.map((d) => (
              <option key={d} value={d}>{NUMERO_DE_DESTINO[d]}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="fin-tenue">{EXPLICACION_DESTINO[destino]}</p>
      <div className="fin-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Creando…" : "Crear categoría"}</button>
      </div>
      {error && <p className="fin-error" role="alert">{error}</p>}
    </form>
  );
}

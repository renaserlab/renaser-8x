"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import type { FilaImportada, TipoLinea } from "@/lib/producto";

type Omitida = { fila: number; nombre: string | null; motivo: string };

/** Lo que devuelve POST /api/companies/[id]/producto/importar. `creadas` y `actualizadas` solo llegan al confirmar. */
type Respuesta = {
  archivo: string;
  hoja: string;
  hojas: string[];
  fidelidad: "alta" | "media";
  columnas: Record<string, string | null>;
  faltantes: string[];
  periodo: string | null;
  total_filas: number;
  nuevas?: FilaImportada[];
  actualizan?: (FilaImportada & { id: string })[];
  omitidas: Omitida[];
  creadas?: number;
  actualizadas?: number;
};

const NOMBRE_CAMPO: Record<string, string> = { codigo: "código", nombre: "nombre", tipo: "tipo", precio: "precio", costo: "costo", unidades: "unidades vendidas", horas: "horas por caso" };

const SIN_DATO = <span style={{ color: "var(--grafito)" }}>sin dato</span>;
const valor = (n: number | null) => (n == null ? SIN_DATO : String(n));

function TablaFilas({ titulo, filas }: { titulo: string; filas: FilaImportada[] }) {
  return (
    <div className="mt-4" style={{ overflow: "auto", maxHeight: 380 }}>
      <table className="tabla">
        <caption className="t-etiqueta" style={{ textAlign: "left", captionSide: "top", paddingBottom: 6 }}>{titulo}</caption>
        <thead>
          <tr>
            <th>Fila</th>
            <th>Código</th>
            <th>Nombre</th>
            <th>Precio</th>
            <th>Costo</th>
            <th>Vendido</th>
            <th>Avisos</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.fila}>
              <td className="t-dato">{f.fila}</td>
              <td className="t-dato">{f.codigo ?? SIN_DATO}</td>
              <td className="t-dato">
                {f.nombre}
                {f.tipo === "servicio" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>servicio{f.horas_por_unidad != null ? ` · ${f.horas_por_unidad} h por caso` : ""}</div>}
              </td>
              <td className="t-dato">{valor(f.precio)}</td>
              <td className="t-dato">{valor(f.costo_variable_unitario)}</td>
              <td className="t-dato">{valor(f.unidades_periodo)}</td>
              <td className="t-dato" style={{ color: "var(--caducado)", maxWidth: 280 }}>{f.avisos.join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * IMPORTAR LO QUE VENDE LA EMPRESA DESDE SU EXCEL. Primero se lee y se muestra qué se crearía, qué se
 * actualizaría (mismo código) y qué se omite, con su motivo; solo después se confirma. Lo que el archivo
 * no trae se importa vacío y se dice: un costo que no está no es un costo de cero. Las existencias del
 * almacén no se toman como ventas.
 */
export function ImportarLineas({ companyId }: { companyId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState("");
  const [tipo, setTipo] = useState<TipoLinea>("producto");
  const [vista, setVista] = useState<Respuesta | null>(null);
  const [hecho, setHecho] = useState<Respuesta | null>(null);
  const [trabajando, setTrabajando] = useState<"leyendo" | "guardando" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enviar = (f: File, modo: "vista_previa" | "confirmar", hoja?: string | null) => {
    const form = new FormData();
    form.set("archivo", f);
    form.set("modo", modo);
    form.set("tipo", tipo);
    if (hoja) form.set("hoja", hoja);
    if (periodo.trim()) form.set("periodo", periodo.trim());
    return pedir<Respuesta>(`/api/companies/${companyId}/producto/importar`, { method: "POST", body: form });
  };

  const leer = async (hoja?: string | null) => {
    if (!archivo) {
      setError("Elige primero el Excel.");
      return;
    }
    setError(null);
    setHecho(null);
    setTrabajando("leyendo");
    try {
      setVista(await enviar(archivo, "vista_previa", hoja));
    } catch (e) {
      setVista(null);
      setError(e instanceof Error ? e.message : "No pudimos leer ese archivo.");
    } finally {
      setTrabajando(null);
    }
  };

  const confirmar = async () => {
    if (!archivo || !vista) return;
    setError(null);
    setTrabajando("guardando");
    try {
      const r = await enviar(archivo, "confirmar", vista.hoja);
      setHecho(r);
      setVista(null);
      setArchivo(null);
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar las líneas.");
    } finally {
      setTrabajando(null);
    }
  };

  const descartar = () => {
    setVista(null);
    setError(null);
  };

  const nuevas = vista?.nuevas ?? [];
  const actualizan = vista?.actualizan ?? [];
  const reconocidas = vista ? Object.entries(vista.columnas).filter(([, encabezado]) => encabezado) : [];
  const nadaQueGuardar = nuevas.length + actualizan.length === 0;

  return (
    <section className="panel p-5">
      <h2 className="t-seccion">Importar desde un Excel</h2>
      <p className="t-cuerpo medida mt-1" style={{ color: "var(--grafito)" }}>
        Sube la lista de precios o el inventario de la empresa (.xlsx). Se reconocen las columnas de código, nombre, precio, costo y unidades vendidas aunque el encabezado esté escrito de otra forma. Antes de guardar verás qué entra.
      </p>

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Archivo (.xlsx)</span>
          <input
            ref={entrada}
            id="archivo-lineas"
            type="file"
            className="campo"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Excel con los productos o servicios"
            disabled={trabajando !== null}
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setVista(null);
              setHecho(null);
              setError(null);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Lo que trae son</span>
          <select className="campo" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoLinea); setVista(null); }} aria-label="El archivo trae productos o servicios" disabled={trabajando !== null}>
            <option value="producto">Productos</option>
            <option value="servicio">Servicios</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Periodo de lo vendido (si se sabe)</span>
          <input className="campo" style={{ maxWidth: 170 }} value={periodo} onChange={(e) => { setPeriodo(e.target.value); setVista(null); }} maxLength={20} placeholder="2026-09" aria-label="Periodo de lo vendido" disabled={trabajando !== null} />
        </label>
        <button type="button" className="boton boton--secundario" disabled={!archivo || trabajando !== null} onClick={() => void leer()}>
          {trabajando === "leyendo" ? "Leyendo" : "Ver qué se va a importar"}
        </button>
      </div>

      {trabajando === "leyendo" && <p className="t-dato mt-3" aria-live="polite" style={{ color: "var(--grafito)" }}>Leyendo el archivo. Todavía no se guarda nada.</p>}
      {error && <p className="t-dato mt-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {vista && (
        <div className="mt-5">
          <p className="t-cuerpo">
            De «{vista.archivo}», hoja «{vista.hoja}»: <strong>{nuevas.length} línea(s) nueva(s)</strong>, {actualizan.length} que se actualizan y {vista.omitidas.length} fila(s) que se omiten, de {vista.total_filas} leída(s).
          </p>
          {vista.hojas.length > 1 && (
            <label className="flex flex-col gap-1 mt-3" style={{ maxWidth: 280 }}>
              <span className="t-etiqueta">Leer otra hoja</span>
              <select className="campo" value={vista.hoja} onChange={(e) => void leer(e.target.value)} aria-label="Hoja del Excel" disabled={trabajando !== null}>
                {vista.hojas.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
          )}
          <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
            Columnas reconocidas: {reconocidas.map(([campo, encabezado]) => `${NOMBRE_CAMPO[campo] ?? campo} ← «${encabezado}»`).join(" · ")}.
          </p>
          {vista.faltantes.length > 0 && (
            <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>
              El archivo no trae columna de {vista.faltantes.map((c) => NOMBRE_CAMPO[c] ?? c).join(", ")}: se importa sin ese dato, no en cero.
            </p>
          )}
          {vista.fidelidad === "media" && (
            <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>
              El Excel tiene fórmulas sin resultado guardado o celdas con error: esas celdas se leyeron vacías.
            </p>
          )}

          {nuevas.length > 0 && <TablaFilas titulo={`Se van a crear (${nuevas.length})`} filas={nuevas} />}
          {actualizan.length > 0 && <TablaFilas titulo={`Ya existen por su código y se actualizan con lo que trae el archivo; lo vacío no borra lo que hay (${actualizan.length})`} filas={actualizan} />}

          {vista.omitidas.length > 0 && (
            <div className="mt-4">
              <p className="t-etiqueta">Se omiten</p>
              <ul className="flex flex-col gap-1 mt-2">
                {vista.omitidas.map((o) => (
                  <li key={`${o.fila}-${o.motivo}`} className="t-dato">
                    Fila {o.fila}{o.nombre ? ` · «${o.nombre}»` : ""}: <span style={{ color: "var(--grafito)" }}>{o.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button type="button" className="boton" disabled={trabajando !== null || nadaQueGuardar} onClick={confirmar}>
              {trabajando === "guardando" ? "Guardando" : nadaQueGuardar ? "No hay nada que importar" : `Importar ${nuevas.length + actualizan.length} línea(s)`}
            </button>
            <button type="button" className="boton boton--secundario" disabled={trabajando !== null} onClick={descartar}>
              No importar
            </button>
            <span className="t-dato" style={{ color: "var(--grafito)" }}>Entran como «extraído, pendiente de conciliar»; también las que ya existían y reciben un número del archivo. Ninguna decisión se toca.</span>
          </div>
        </div>
      )}

      {hecho && (
        <p className="t-dato mt-4" role="status" style={{ color: "var(--confirmado)" }}>
          Desde «{hecho.archivo}»: {hecho.creadas ?? 0} línea(s) creada(s) y {hecho.actualizadas ?? 0} actualizada(s).
          {hecho.omitidas.length > 0 ? ` Se omitieron ${hecho.omitidas.length} fila(s).` : ""}
        </p>
      )}
    </section>
  );
}

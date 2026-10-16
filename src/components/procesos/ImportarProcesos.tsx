"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

type ProcesoPorCrear = { fila: number; nombre: string; area: string | null; responsable: string | null; descripcion: string | null };
type Omitido = { fila: number; nombre: string | null; motivo: string };

/** Lo que devuelve POST /api/companies/[id]/procesos/importar. `creados` solo llega al confirmar. */
type Respuesta = {
  archivo: string;
  hoja: string | null;
  hojas: string[];
  columnas: Record<"nombre" | "area" | "responsable" | "descripcion", string | null>;
  faltantes: string[];
  nuevos: ProcesoPorCrear[];
  omitidos: Omitido[];
  total_filas: number;
  creados?: number;
};

/** Un proceso que la empresa trajo en su lista y nadie ha dibujado todavía (version «sin_dibujar»). */
export type ProcesoEnLista = { id: string; nombre: string; area: string | null };

const NOMBRE_COLUMNA: Record<string, string> = { nombre: "nombre", area: "área", responsable: "responsable", descripcion: "descripción" };

/**
 * IMPORTAR LA LISTA DE PROCESOS QUE LA EMPRESA YA TIENE. Dos pasos y ninguno a ciegas: primero se lee el
 * archivo y se muestra qué se va a crear y qué se omite, con su motivo; solo después se confirma.
 *
 * Lo que entra NO es un proceso dibujado: es un nombre con su área y su responsable. Por eso no aparece
 * en la tabla de procesos ni en la lista del dueño, ni cuenta en el avance: queda aquí abajo, «de la
 * lista de la empresa, sin dibujar», hasta que alguien le dibuja el primer paso. Desde aquí se abre para
 * dibujarlo, o se quita si se importó por error.
 *
 * `paraCliente` (16-10-2026): el dueño también importa su lista, pero solo cuando la consultora le abrió «Subir o
 * dibujar los procesos» (la página no lo monta sin eso, y la ruta lo exige igual). Mismos dos pasos, en sus palabras:
 * lo que entra queda en «por dibujar», y desde ahí lo abre para subirle su archivo o dibujarlo.
 */
export function ImportarProcesos({ companyId, enLista = [], base, paraCliente = false }: { companyId: string; enLista?: ProcesoEnLista[]; base?: string; paraCliente?: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Respuesta | null>(null);
  const [hecho, setHecho] = useState<Respuesta | null>(null);
  const [trabajando, setTrabajando] = useState<"leyendo" | "creando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const raiz = base ?? `/empresa/${companyId}/procesos`;

  const enviar = async (f: File, modo: "vista_previa" | "confirmar", hoja?: string | null): Promise<Respuesta> => {
    const form = new FormData();
    form.set("archivo", f);
    form.set("modo", modo);
    if (hoja) form.set("hoja", hoja);
    return pedir<Respuesta>(`/api/companies/${companyId}/procesos/importar`, { method: "POST", body: form });
  };

  const leer = async (f: File, hoja?: string | null) => {
    setError(null);
    setHecho(null);
    setTrabajando("leyendo");
    try {
      setVista(await enviar(f, "vista_previa", hoja));
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
    setTrabajando("creando");
    try {
      const r = await enviar(archivo, "confirmar", vista.hoja);
      setHecho(r);
      setVista(null);
      setArchivo(null);
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    } catch (e) {
      // Si la base todavía no admite procesos sin dibujar, la ruta lo dice aquí y la vista previa se conserva.
      setError(e instanceof Error ? e.message : "No pudimos crear los procesos.");
    } finally {
      setTrabajando(null);
    }
  };

  const descartar = () => {
    setVista(null);
    setArchivo(null);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  };

  /** Quitar de la lista uno que se importó por error. Es el mismo borrado que «Quitar» en la tabla de procesos. */
  const quitar = async (id: string) => {
    setErrorLista(null);
    setEliminando(true);
    try {
      await pedir(`/api/processes/${id}`, { method: "DELETE" });
      setQuitando(null);
      router.refresh();
    } catch (e) {
      setErrorLista(e instanceof Error ? e.message : "No pudimos quitarlo de la lista.");
      setQuitando(null);
    } finally {
      setEliminando(false);
    }
  };

  const sinColumna = (vista?.faltantes ?? []).filter((c) => c !== "nombre");

  return (
    <section className="panel p-5 mb-10">
      <h2 className="t-seccion">{paraCliente ? "¿Tienes la lista de tus procesos en un Excel?" : "Importar la lista de procesos"}</h2>
      <p className="t-cuerpo medida mt-1" style={{ color: "var(--grafito)" }}>
        {paraCliente
          ? "Súbela aquí: basta una columna con el nombre de cada proceso; si también tiene área, responsable o descripción, se toman. Antes de guardar nada verás qué entra y qué no."
          : "Si la empresa ya tiene sus procesos en un Excel o un CSV, súbelo. Hace falta una columna con el nombre; área, responsable y descripción se toman si están. Antes de crear nada verás qué entra y qué se omite."}
      </p>

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <div className="flex flex-col gap-1">
          <span className="t-etiqueta">Archivo (.xlsx o .csv)</span>
          {/* Un botón, no la caja nativa que se leía como caja de texto; al lado, el nombre del archivo elegido. */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="boton boton--secundario archivo-boton">
              <input
                ref={entrada}
                id="archivo-procesos"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-label="Archivo con la lista de procesos"
                disabled={trabajando !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setArchivo(f);
                  setVista(null);
                  setHecho(null);
                  setError(null);
                  if (f) void leer(f);
                }}
              />
              {archivo ? "Cambiar el archivo" : "Elegir el archivo"}
            </label>
            {archivo && <span className="t-dato archivo-nombre">{archivo.name}</span>}
          </div>
        </div>
        {vista && vista.hojas.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="t-etiqueta">Hoja</span>
            <select className="campo" aria-label="Hoja del Excel" value={vista.hoja ?? ""} disabled={trabajando !== null} onChange={(e) => archivo && void leer(archivo, e.target.value)}>
              {vista.hojas.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {trabajando === "leyendo" && <p className="t-dato mt-3" aria-live="polite" style={{ color: "var(--grafito)" }}>Leyendo el archivo. Todavía no se crea nada.</p>}
      {error && <p className="t-dato mt-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {vista && (
        <div className="mt-5">
          <p className="t-cuerpo">
            De «{vista.archivo}»{vista.hoja ? `, hoja «${vista.hoja}»` : ""}: <strong>{vista.nuevos.length} proceso(s) por crear</strong> y {vista.omitidos.length} fila(s) que se omiten, de {vista.total_filas} leída(s).
          </p>
          {sinColumna.length > 0 && (
            <p className="t-dato mt-1" style={{ color: "var(--caducado)" }}>
              El archivo no trae columna de {sinColumna.map((c) => NOMBRE_COLUMNA[c] ?? c).join(", ")}: esos datos quedan vacíos, no se inventan.
            </p>
          )}

          {vista.nuevos.length > 0 && (
            <div className="mt-4" style={{ overflowX: "auto" }}>
              <table className="tabla">
                <caption className="t-etiqueta" style={{ textAlign: "left", captionSide: "top", paddingBottom: 6 }}>Se van a crear</caption>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Proceso</th>
                    <th>Área</th>
                    <th>Responsable</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.nuevos.map((p) => (
                    <tr key={p.fila}>
                      <td className="t-dato">{p.fila}</td>
                      <td className="t-dato">{p.nombre}</td>
                      <td>{p.area ?? <span style={{ color: "var(--grafito)" }}>sin dato</span>}</td>
                      <td>{p.responsable ?? <span style={{ color: "var(--grafito)" }}>sin dato</span>}</td>
                      <td style={{ maxWidth: 360 }}>{p.descripcion ?? <span style={{ color: "var(--grafito)" }}>sin dato</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {vista.omitidos.length > 0 && (
            <div className="mt-4">
              <p className="t-etiqueta">Se omiten</p>
              <ul className="flex flex-col gap-1 mt-2">
                {vista.omitidos.map((o) => (
                  <li key={o.fila} className="t-dato">
                    Fila {o.fila}{o.nombre ? ` · «${o.nombre}»` : ""}: <span style={{ color: "var(--grafito)" }}>{o.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button type="button" className="boton" disabled={trabajando !== null || vista.nuevos.length === 0} onClick={confirmar}>
              {trabajando === "creando" ? "Creando" : vista.nuevos.length === 0 ? "No hay nada nuevo que crear" : `Crear ${vista.nuevos.length} proceso(s)`}
            </button>
            <button type="button" className="boton boton--secundario" disabled={trabajando !== null} onClick={descartar}>
              No importar
            </button>
            <span className="t-dato" style={{ color: "var(--grafito)" }}>
              {paraCliente
                ? "Entran a tu lista «por dibujar»: después abres cada uno para subirle su archivo o dibujarlo. Nada de lo que ya tienes se cambia."
                : "Entran a la lista de la empresa, sin dibujar: no cuentan como procesos dibujados, y el dueño los ve solo mientras le tengas abierta «Subir o dibujar los procesos». Nada de lo que ya existe se cambia."}
            </span>
          </div>
        </div>
      )}

      {hecho && (
        <div className="mt-4" role="status">
          <p className="t-dato" style={{ color: "var(--confirmado)" }}>
            {hecho.creados === 0
              ? paraCliente
                ? "No se agregó ningún proceso: todo lo del archivo ya estaba en tu lista o se dejó fuera."
                : "No se creó ningún proceso: todo lo del archivo ya existía o se omitió."
              : paraCliente
                ? `Se agregaron ${hecho.creados} proceso(s) de «${hecho.archivo}» a tu lista. Están aquí abajo, por dibujar.`
                : `Se añadieron ${hecho.creados} proceso(s) a la lista de la empresa desde «${hecho.archivo}». Están aquí abajo, sin dibujar todavía.`}
            {hecho.omitidos.length > 0 ? ` Se omitieron ${hecho.omitidos.length} fila(s).` : ""}
          </p>
        </div>
      )}

      {enLista.length > 0 && (
        <div className="mt-6" style={{ borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
          <h3 className="t-etiqueta">{paraCliente ? `De tu lista, por dibujar (${enLista.length})` : `De la lista de la empresa, sin dibujar (${enLista.length})`}</h3>
          <p className="t-dato medida mt-1" style={{ color: "var(--grafito)" }}>
            {paraCliente
              ? "Ábrelos uno por uno: súbele a cada uno su archivo y lo dibujamos, o dibújalo tú. Cuando tenga su primer paso, pasa a «Tus procesos»."
              : "La empresa dijo que estos procesos existen; nadie los ha dibujado. No cuentan en el avance ni entran al diagnóstico. El dueño los ve solo mientras le tengas abierta «Subir o dibujar los procesos». Al guardarle el primer paso, el proceso pasa solo a la tabla de arriba."}
          </p>
          {errorLista && <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>{errorLista}</p>}
          <ul className="flex flex-col gap-2 mt-3">
            {enLista.map((p) => (
              <li key={p.id} className="t-dato flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span>{p.nombre}</span>
                <span style={{ color: "var(--grafito)" }}>{p.area ?? "sin área"}</span>
                <Link href={`${raiz}/${p.id}`} style={{ color: "var(--marca)", textDecoration: "underline" }}>{paraCliente ? "Abrirlo" : "Abrir para dibujarlo"}</Link>
                {quitando === p.id ? (
                  <span className="flex flex-wrap items-center gap-3">
                    <span>¿Quitar «{p.nombre}» de la lista? No se puede deshacer.</span>
                    <button type="button" className="boton" style={{ minHeight: 32, fontSize: 13, background: "var(--contradicho)", borderColor: "var(--contradicho)" }} disabled={eliminando} onClick={() => quitar(p.id)}>
                      {eliminando ? "Quitando" : "Sí, quitarlo"}
                    </button>
                    <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} disabled={eliminando} onClick={() => setQuitando(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }} onClick={() => setQuitando(p.id)}>
                    Quitar de la lista
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

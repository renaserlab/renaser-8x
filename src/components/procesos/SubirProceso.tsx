"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { ACEPTA_ARCHIVO_PROCESO, estadoSubida, rotuloSubida, sePuedeDibujar, type ProcesoPorDibujar } from "./subidas";

type Props = {
  companyId: string;
  /** Dónde vive la ficha de cada proceso: «/portal/procesos» o «/empresa/[id]/procesos». */
  base: string;
  paraCliente?: boolean;
  /** Los procesos sin dibujar que ya tienen un archivo, con su estado. */
  porDibujar?: ProcesoPorDibujar[];
  /** false si los archivos no se pudieron leer: se dice, no se muestra una lista vacía como si no hubiera nada. */
  archivosLeidos?: boolean;
};

type Hecho = { nombre: string; processId: string; existia: boolean };
type Fallo = { texto: string; processId: string | null };

/**
 * SUBIR UN PROCESO QUE YA TIENES (16-10-2026). Kelin: «si está dibujando procesos, subir sus archivos allí, importarlo
 * y dibujarlo para mejorarlo». El nombre y el archivo, un botón:
 *  1. POST /api/companies/[id]/procesos { nombre } → el proceso, sin dibujar (o el que ya se llamaba así);
 *  2. POST /api/sources con `process_id` y el archivo: la misma subida y el mismo lector de todo lo demás;
 *  3. en la ficha del proceso, cuando terminó de leerse, «Dibujarlo con lo que subiste» (DibujarDesdeArchivo).
 * Si el paso 1 sale y el 2 no, se dice: el proceso quedó creado y el archivo se vuelve a subir desde su ficha.
 * Debajo, lo subido que falta dibujar, con su estado: subido (leyéndose), listo para dibujar, o no se pudo leer.
 */
export function SubirProceso({ companyId, base, paraCliente = false, porDibujar = [], archivosLeidos = true }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paso, setPaso] = useState<"creando" | "subiendo" | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const modo = paraCliente ? "dueno" : "consultora";

  const subir = async () => {
    const n = nombre.trim();
    if (!n || !archivo) return;
    setFallo(null);
    setHecho(null);
    setPaso("creando");
    let processId: string | null = null;
    try {
      const r = await pedir<{ process_id: string; existia: boolean }>(`/api/companies/${companyId}/procesos`, { json: { nombre: n } });
      processId = r.process_id;
      setPaso("subiendo");
      const form = new FormData();
      form.set("company_id", companyId);
      form.set("archivo", archivo);
      form.set("process_id", r.process_id);
      await pedir(`/api/sources`, { method: "POST", body: form });
      setHecho({ nombre: n, processId: r.process_id, existia: r.existia });
      setNombre("");
      setArchivo(null);
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "No pudimos subirlo.";
      setFallo(
        processId
          ? { texto: `«${n}» quedó guardado, pero el archivo no subió: ${motivo} Ábrelo y vuelve a subir el archivo desde su ficha.`, processId }
          : { texto: motivo, processId: null }
      );
      if (processId) router.refresh();
    } finally {
      setPaso(null);
    }
  };

  const falta = !nombre.trim() || !archivo;

  return (
    <section className="panel p-5">
      <h2 className="t-seccion">{paraCliente ? "Subir un proceso que ya tienes" : "Subir un proceso que la empresa ya tiene"}</h2>
      <p className="t-cuerpo medida mt-1" style={{ color: "var(--grafito)" }}>
        Una foto del cuaderno o de la pizarra, un PDF, un Word o un Excel. Lo leemos, lo dibujamos con lo que dice, y después {paraCliente ? "lo corriges tú" : "se corrige"} en el dibujo.
      </p>

      <div className="flex flex-col gap-3 mt-4 medida">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Nombre del proceso</span>
          <input
            className="campo"
            value={nombre}
            maxLength={120}
            disabled={paso !== null}
            onChange={(e) => setNombre(e.target.value)}
            aria-label="Nombre del proceso"
            placeholder="Como lo llaman en la empresa"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="t-etiqueta">El archivo: foto, PDF, Word o Excel</span>
          {/* La caja nativa («Seleccionar archivo · Ningún archivo seleccionado») se leía como una caja de texto y en el
              celular se cortaba: un botón, y al lado el nombre del archivo elegido. */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="boton boton--secundario archivo-boton">
              <input
                ref={entrada}
                type="file"
                accept={ACEPTA_ARCHIVO_PROCESO}
                aria-label="Archivo del proceso"
                disabled={paso !== null}
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  setFallo(null);
                }}
              />
              {archivo ? "Cambiar el archivo" : "Elegir el archivo"}
            </label>
            {archivo && <span className="t-dato archivo-nombre">{archivo.name}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="boton" disabled={falta || paso !== null} onClick={subir}>
            {paso === "creando" ? "Guardando el proceso…" : paso === "subiendo" ? "Subiendo el archivo…" : "Subirlo"}
          </button>
          {falta && paso === null && <span className="t-dato" style={{ color: "var(--grafito)" }}>Escribe el nombre y elige el archivo.</span>}
        </div>
      </div>

      {fallo && (
        <p className="t-cuerpo mt-4 medida" role="alert" style={{ color: "var(--contradicho)" }}>
          {fallo.texto}{" "}
          {fallo.processId && (
            <Link href={`${base}/${fallo.processId}`} className="enlace-azul">
              Abrirlo
            </Link>
          )}
        </p>
      )}
      {hecho && (
        <p className="t-cuerpo mt-4 medida" role="status" style={{ color: "var(--confirmado)" }}>
          {hecho.existia ? `Ya tenías un proceso llamado «${hecho.nombre}»: le sumamos el archivo.` : `«${hecho.nombre}» quedó subido.`} Lo estamos leyendo; cuando termine, ábrelo y pulsa «Dibujarlo con lo que subiste».{" "}
          <Link href={`${base}/${hecho.processId}`} className="enlace-azul">
            Abrirlo
          </Link>
        </p>
      )}

      {!archivosLeidos && (
        <p className="t-dato mt-5" role="alert" style={{ color: "var(--caducado)" }}>
          No pudimos leer cuáles procesos tienen archivo. Vuelve a cargar la página; lo subido no se perdió.
        </p>
      )}

      {porDibujar.length > 0 && (
        <div className="mt-6" style={{ borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
          <h3 className="t-etiqueta">{paraCliente ? `Lo que subiste, por dibujar (${porDibujar.length})` : `Subidos, por dibujar (${porDibujar.length})`}</h3>
          <ul className="flex flex-col gap-3 mt-3">
            {porDibujar.map((p) => {
              const ultimo = p.archivos[0];
              const e = estadoSubida(ultimo);
              const r = rotuloSubida(e, modo, "dibujar");
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="t-dato" style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                    <span style={{ color: "var(--grafito)" }}>
                      {" "}· {ultimo.nombre}
                      {p.archivos.length > 1 ? ` y ${p.archivos.length - 1} más` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className={`estado ${r.clase}`}>{r.texto}</span>
                    <Link href={`${base}/${p.id}`} className="enlace-azul" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
                      {sePuedeDibujar(e) ? "Dibujarlo" : "Abrirlo"}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

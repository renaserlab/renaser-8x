"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ESTADOS, puedePasar, type Estado } from "@/lib/expediente";

export type DocumentoEnLista = {
  id: string;
  nombre: string;
  estado: Estado;
  clave_vara: string | null;
  caracteres: number;
  revisiones: number;
  nota: string | null;
};

/**
 * LOS DOCUMENTOS DE LA EMPRESA, EN UNA LISTA CON LA QUE SE PUEDE TRABAJAR.
 *
 * Cada fila dice tres cosas y las tres hacen falta para decidir qué hacer con el documento: en qué
 * estado está, contra qué vara se mide y si ya se midió. Un documento sin vara no se puede medir, y
 * uno sin medir no se puede mejorar: por eso las dos cosas se ven de un vistazo y se cambian desde
 * aquí, sin salir de la lista.
 */
export function Documentos({
  companyId,
  docs,
  varas,
}: {
  companyId: string;
  docs: DocumentoEnLista[];
  varas: readonly string[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [medido, setMedido] = useState<string | null>(null);

  /**
   * Pedir que se mida un documento contra su vara.
   *
   * Es el botón que faltaba. La guarda que impide construir un documento sin medir antes el que la
   * empresa ya tenía se puso el 18-10; el trabajo que mide solo se encolaba al dar de alta uno
   * nuevo, así que para los que ya estaban dentro no había forma de pedirlo. El candado existía y
   * la llave no.
   */
  const medir = async (documento: string) => {
    setOcupado(documento);
    setError(null);
    setMedido(null);
    try {
      const r = await fetch(`/api/companies/${companyId}/documentos`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documento, medir: true }),
      });
      const j = (await r.json()) as { error?: string; midiendo_con?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo pedir la medición.");
      setMedido(documento);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pedir la medición.");
    } finally {
      setOcupado(null);
    }
  };

  const cambiar = async (documento: string, cambio: { estado?: Estado; clave_vara?: string | null }) => {
    setOcupado(documento);
    setError(null);
    try {
      const r = await fetch(`/api/companies/${companyId}/documentos`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documento, ...cambio }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  };

  if (!docs.length) {
    return (
      <p className="t-dato" style={{ margin: 0 }}>
        Todavía no hay ningún documento de esta empresa. Lo que ella ya tenga —su manual de funciones, su
        reglamento, sus procedimientos— entra aquí: es materia prima, se mide contra su vara y se mejora desde
        ahí. Escribirlo de nuevo sin mirarlo sería cobrarle por algo que ya tenía.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--caducado)", marginTop: 0 }}>
          {error}
        </p>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {docs.map((d) => {
          const estado = ESTADOS[d.estado];
          const haciaDonde = (Object.keys(ESTADOS) as Estado[]).filter((x) => puedePasar(d.estado, x));
          return (
            <li
              key={d.id}
              style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid var(--linea)" }}
            >
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <Link href={`/empresa/${companyId}/documentos/${d.id}`} className="enlace-azul" style={{ fontWeight: 500 }}>
                  {d.nombre}
                </Link>
                <p className="t-dato" style={{ margin: "4px 0 0", color: "var(--grafito)" }}>
                  <span className={d.estado === "vigente" ? "estado ok" : "estado"}>{estado.nombre}</span>{" "}
                  · {Math.max(1, Math.round(d.caracteres / 1024))} KB ·{" "}
                  {d.revisiones ? `${d.revisiones} ${d.revisiones === 1 ? "medición" : "mediciones"}` : "sin medir"}
                </p>
                {d.nota && (
                  <p className="nota" style={{ margin: "6px 0 0", fontSize: 13 }}>
                    {d.nota.length > 220 ? d.nota.slice(0, 220) + "…" : d.nota}
                  </p>
                )}
              </div>

              <label style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>Se mide con</span>
                <select
                  value={d.clave_vara ?? ""}
                  disabled={ocupado === d.id}
                  onChange={(e) => cambiar(d.id, { clave_vara: e.target.value || null })}
                  aria-label={`Vara de ${d.nombre}`}
                >
                  {/* Sin vara es un estado legítimo —un insumo no se mide con ninguna— y por eso se
                      ofrece en vez de obligar a elegir una que no corresponde. */}
                  <option value="">sin vara</option>
                  {varas.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>

              <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>Contra su vara</span>
                {/* Sin vara o sin texto no se ofrece el botón: un botón que siempre falla enseña a no
                    pulsar ninguno. El porqué se dice en el título, no en un error después de pulsar. */}
                <button
                  type="button"
                  className="boton-secundario"
                  style={{ minHeight: 36 }}
                  disabled={ocupado === d.id || !d.clave_vara || !d.caracteres}
                  onClick={() => medir(d.id)}
                  title={
                    !d.clave_vara
                      ? "Primero elígele la vara con la que se mide"
                      : !d.caracteres
                        ? "Este documento no tiene texto todavía: tráelo por Fuentes"
                        : d.revisiones
                          ? "Vuelve a medirlo contra su vara"
                          : "Mídelo contra su vara"
                  }
                >
                  {medido === d.id ? "En cola…" : d.revisiones ? "Medir otra vez" : "Medir"}
                </button>
              </div>

              <label style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>Pasa a</span>
                <select
                  value=""
                  disabled={ocupado === d.id || !haciaDonde.length}
                  onChange={(e) => e.target.value && cambiar(d.id, { estado: e.target.value as Estado })}
                  aria-label={`Mover ${d.nombre}`}
                >
                  {/* Solo los estados a los que de verdad puede ir. Ofrecer uno imposible y rechazarlo
                      después es enseñar a desconfiar de la pantalla. */}
                  <option value="">—</option>
                  {haciaDonde.map((x) => (
                    <option key={x} value={x}>{ESTADOS[x].nombre}</option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Dar de alta un documento que la empresa ya tenía. */
export function SubirDocumento({ companyId, varas }: { companyId: string; varas: readonly string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setYendo(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/documentos`, { method: "POST", body: new FormData(e.currentTarget) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo subir.");
      setAbierto(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir.");
    } finally {
      setYendo(false);
    }
  };

  if (!abierto) {
    return (
      <button type="button" className="boton" onClick={() => setAbierto(true)}>
        Subir un documento
      </button>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="t-dato">Nombre del documento</span>
        <input name="nombre" placeholder="Reglamento Interno de Trabajo, v02" />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="t-dato">El archivo, si es texto (.txt, .md, .csv, .json)</span>
        <input type="file" name="archivo" accept=".txt,.md,.csv,.json" />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="t-dato">O pégalo aquí</span>
        <textarea name="texto" rows={6} placeholder="El texto del documento, tal como está." />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="t-dato">Se mide con</span>
        <select name="clave_vara" defaultValue="">
          <option value="">lo decido después</option>
          {varas.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>

      <p className="nota" style={{ margin: 0, fontSize: 13 }}>
        Lo que venga en PDF, Word o foto entra por <strong>Fuentes</strong>, que es donde se le saca el texto.
        Aquí entra lo que ya es texto, porque un documento sin texto no se puede medir contra su vara.
      </p>

      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--caducado)", margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="boton" disabled={yendo}>
          {yendo ? "Subiendo…" : "Subir"}
        </button>
        <button type="button" className="boton-secundario" onClick={() => setAbierto(false)} disabled={yendo}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

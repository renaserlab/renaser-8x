"use client";
import { useState } from "react";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { confirmacionValida } from "@/lib/confirmacion";
import { AdministrarEmpresa } from "./AdministrarEmpresa";
import { ETAPA, fechaCorta } from "@/lib/textos";

export type FilaEmpresa = {
  id: string;
  nombre: string;
  sector: string | null;
  etapa: string;
  estado_admision: string | null;
  created_at: string;
  registros: number;
  personas: number;
};

/**
 * LA TABLA DE EMPRESAS, con modo limpieza. Después de semanas de pruebas quedan una docena de
 * empresas de mentira estorbando entre las reales, y borrarlas de una en una escribiendo cada
 * nombre es una penitencia — con nombres que llevan "·" era además imposible.
 *
 * Nada viene marcado de antemano: el sistema no decide qué es prueba y qué no. Lo que sí hace es
 * poner delante lo que se pierde —cuántos registros, quién tiene acceso— para que nadie borre por
 * descuido algo que costó semanas de conversación.
 */
export function TablaEmpresas({ empresas }: { empresas: FilaEmpresa[] }) {
  const [limpieza, setLimpieza] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmacion, setConfirmacion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const salir = () => {
    setLimpieza(false);
    setMarcadas(new Set());
    setConfirmacion("");
    setError(null);
    setAviso(null);
  };

  const elegidas = empresas.filter((e) => marcadas.has(e.id));
  const registros = elegidas.reduce((s, e) => s + e.registros, 0);
  const conPersonas = elegidas.filter((e) => e.personas > 0);
  const conTrabajo = elegidas.filter((e) => e.registros >= 40);

  const eliminar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = (await pedir("/api/companies/eliminar-lote", { method: "POST", json: { ids: [...marcadas] } })) as {
        total: number;
        fallidas: { nombre: string; motivo: string }[];
      };
      if (r.fallidas?.length) {
        setAviso(`Se eliminaron ${r.total}. No se pudo con: ${r.fallidas.map((f) => `${f.nombre} (${f.motivo})`).join(" · ")}`);
        setOcupado(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminarlas.");
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 14 }} onClick={() => (limpieza ? salir() : setLimpieza(true))}>
          {limpieza ? "Salir de limpieza" : "Limpiar empresas de prueba"}
        </button>
      </div>

      <table className="tabla">
        <thead>
          <tr>
            {limpieza && <th aria-label="Marcar" />}
            <th>Nombre</th>
            <th>Contenido</th>
            <th>Etapa</th>
            <th>Creada</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {empresas.map((c) => {
            const marcada = marcadas.has(c.id);
            return (
              <tr key={c.id} style={marcada ? { background: "color-mix(in srgb, var(--contradicho) 7%, transparent)" } : undefined}>
                {limpieza && (
                  <td style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(c.id)}
                      style={{ width: 17, height: 17, accentColor: "var(--contradicho)", cursor: "pointer" }}
                      aria-label={`Marcar ${c.nombre} para eliminar`}
                    />
                  </td>
                )}
                <td className="t-dato">
                  <Link href={`/empresa/${c.id}`}>{c.nombre}</Link>
                  {c.sector && <span style={{ color: "var(--grafito)" }}> · {c.sector}</span>}
                </td>
                <td className="t-dato" style={{ whiteSpace: "nowrap", color: c.registros === 0 ? "var(--grafito)" : "var(--tinta)" }}>
                  {c.registros === 0 ? "vacía" : `${c.registros} reg`}
                  {c.personas > 0 && <span style={{ color: "var(--grafito)" }}> · {c.personas} con acceso</span>}
                </td>
                <td>{ETAPA[c.etapa] ?? c.etapa}</td>
                <td className="t-dato">{fechaCorta(c.created_at)}</td>
                <td>
                  <AdministrarEmpresa companyId={c.id} nombre={c.nombre} sector={c.sector} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {limpieza && (
        <aside
          className="panel p-5"
          // Se queda pegada abajo mientras se marca en la tabla. Sin sombra: el borde de acento
          // basta para separarla, y el lenguaje de este producto no usa sombras decorativas.
          style={{ position: "sticky", bottom: 12, marginTop: 16, borderColor: "var(--contradicho)", background: "var(--papel)" }}
          role="region"
          aria-label="Limpieza de empresas"
        >
          <p className="t-etiqueta">Modo limpieza</p>
          {marcadas.size === 0 ? (
            <p className="t-cuerpo mt-2 medida">
              Marca las que quieras eliminar. Antes de borrar nada te digo qué se pierde en cada una.
            </p>
          ) : (
            <>
              <p className="t-cuerpo mt-2">
                <strong>{marcadas.size} {marcadas.size === 1 ? "empresa" : "empresas"}</strong> · se borran {registros} registros
                entre conversaciones, hallazgos, documentos y archivos. No hay vuelta atrás.
              </p>

              {conTrabajo.length > 0 && (
                <p className="t-cuerpo mt-2" style={{ color: "var(--contradicho)" }}>
                  Ojo: {conTrabajo.map((e) => `${e.nombre} (${e.registros} registros)`).join(", ")} {conTrabajo.length === 1 ? "tiene" : "tienen"} trabajo
                  de verdad dentro.
                </p>
              )}
              {conPersonas.length > 0 && (
                <p className="t-dato mt-2" style={{ color: "var(--caducado)" }}>
                  {conPersonas.map((e) => e.nombre).join(", ")} {conPersonas.length === 1 ? "tiene" : "tienen"} a alguien con acceso.
                  Esa persona se quedará sin empresa y el portal le pedirá crear una nueva.
                </p>
              )}

              <div className="flex gap-2 mt-3 flex-wrap items-center">
                <input
                  className="campo" style={{ maxWidth: 200 }} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder="Escribe ELIMINAR" aria-label="Confirmación"
                />
                <button
                  type="button" className="boton"
                  style={{
                    background: confirmacionValida(confirmacion, "ELIMINAR") ? "var(--contradicho)" : "var(--suave)",
                    borderColor: confirmacionValida(confirmacion, "ELIMINAR") ? "var(--contradicho)" : "var(--linea)",
                    color: confirmacionValida(confirmacion, "ELIMINAR") ? "var(--papel)" : "var(--grafito)",
                  }}
                  disabled={ocupado || !confirmacionValida(confirmacion, "ELIMINAR")}
                  onClick={eliminar}
                >
                  {ocupado ? "Eliminando" : `Eliminar ${marcadas.size}`}
                </button>
                <button
                  type="button" className="t-dato"
                  style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }}
                  onClick={() => setMarcadas(new Set())}
                >
                  Desmarcar todas
                </button>
              </div>
            </>
          )}
          {aviso && <p className="t-cuerpo mt-2" style={{ color: "var(--caducado)" }}>{aviso}</p>}
          {error && <p className="t-cuerpo mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        </aside>
      )}
    </>
  );
}

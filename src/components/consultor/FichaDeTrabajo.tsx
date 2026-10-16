"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { TIPOS_TRABAJO, TIPO_TRABAJO_TEXTO, type TipoTrabajo } from "@/lib/ruta";
import { MODELO, MODELOS_NEGOCIO, type ModeloNegocio } from "@/lib/negocio";
import { mensajeDe } from "@/components/negocio/dato";

type Trabajo = { modelo_negocio: ModeloNegocio[]; tipo_trabajo: TipoTrabajo | null; ruta_inicio: string | null; hora_cierre: string | null };

type Props = {
  companyId: string;
  trabajo: Trabajo;
  /** Lo que sugiere el modelo operativo de la empresa (sugerirModeloNegocio). Solo sugiere: decide la consultora. */
  sugeridos: ModeloNegocio[];
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * LA FICHA DE TRABAJO DE LA EMPRESA: qué trabajo compró (y con eso, sus etapas), desde cuándo corre su ruta, cómo
 * gana dinero (las preguntas de su tabla de productos salen de aquí) y a qué hora cierra (desde esa hora se anota el
 * indicador diario de HOY). Se guarda con un botón: es una decisión, no un dato que se tipea al pasar.
 */
export function FichaDeTrabajo({ companyId, trabajo, sugeridos }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>(trabajo.tipo_trabajo ?? "");
  const [inicio, setInicio] = useState(trabajo.ruta_inicio ?? "");
  const [cierre, setCierre] = useState(trabajo.hora_cierre ?? "");
  const [modelos, setModelos] = useState<ModeloNegocio[]>(trabajo.modelo_negocio);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const alternar = (m: ModeloNegocio) => setModelos((x) => (x.includes(m) ? x.filter((y) => y !== m) : x.length >= 2 ? [x[1]!, m] : [...x, m]));

  const guardar = async () => {
    const cuerpo: Record<string, unknown> = {};
    if ((tipo || null) !== trabajo.tipo_trabajo) cuerpo.tipo_trabajo = tipo || null;
    if ((inicio || null) !== trabajo.ruta_inicio) cuerpo.ruta_inicio = inicio || null;
    if ((cierre || null) !== trabajo.hora_cierre) cuerpo.hora_cierre = cierre || null;
    if (!igual(modelos, trabajo.modelo_negocio)) cuerpo.modelo_negocio = modelos.length ? modelos : null;
    if (!Object.keys(cuerpo).length) {
      setAviso({ tipo: "ok", texto: "No hay nada que cambiar." });
      return;
    }
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}/ruta`, { method: "PATCH", json: cuerpo });
      setAviso({ tipo: "ok", texto: "Guardado" });
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className="t-etiqueta">Tipo de trabajo</span>
          <select aria-label="Tipo de trabajo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Sin elegir</option>
            {TIPOS_TRABAJO.map((t) => (
              <option key={t} value={t}>{TIPO_TRABAJO_TEXTO[t].consultora}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Día 1 de la ruta</span>
          <input aria-label="Fecha de inicio de la ruta" className="campo" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Hora de cierre del negocio</span>
          <input aria-label="Hora de cierre del negocio" className="campo" type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-etiqueta mb-2">Cómo gana dinero (uno o dos)</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Cómo gana dinero la empresa">
          {MODELOS_NEGOCIO.map((m) => {
            const si = modelos.includes(m);
            return (
              <button key={m} type="button" className={si ? "boton" : "boton boton--secundario"} style={{ justifyContent: "space-between", fontSize: 14 }} aria-pressed={si} onClick={() => alternar(m)}>
                <span>{MODELO[m].paraDueno}</span>
                {sugeridos.includes(m) && <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>sugerido</span>}
              </button>
            );
          })}
        </div>
        {sugeridos.length > 0 && <p className="t-dato mt-2" style={{ color: "var(--grafito)", fontSize: 13 }}>«Sugerido» sale del modelo operativo de la empresa. Solo sugiere: decides tú.</p>}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" disabled={trabajando} onClick={() => void guardar()}>{trabajando ? "Guardando…" : "Guardar la ficha de trabajo"}</button>
        {aviso && (
          <span className="t-dato" role={aviso.tipo === "error" ? "alert" : "status"} style={{ color: aviso.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>
            {aviso.texto}
          </span>
        )}
      </div>
    </div>
  );
}

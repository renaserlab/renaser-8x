"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { MOTOR, PANTALLA } from "@/lib/estrategia/textos";

/**
 * LAS ACCIONES SUELTAS DE LA PÁGINA DE LA ESTRATEGIA (spec-estrategia-8x.md §8.1). Cada una llama a su ruta
 * (src/app/api/companies/[id]/estrategia/**, todas con `protegido()`, sesión y empresa) y vuelve a leer la página: lo
 * que se ve sale siempre del servidor. Lo que la ruta no deja hacer se dice con su texto, sin adivinar.
 */

/** Correr una acción una vez: mientras corre, el botón no se vuelve a pulsar; si falla, su texto queda a la vista. */
export function useAccion() {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correr = async <T,>(fn: () => Promise<T>, despues?: (r: T) => void) => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await fn();
      if (despues) despues(r);
      else router.refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : PANTALLA.no_se_pudo);
      return null;
    } finally {
      setTrabajando(false);
    }
  };
  return { trabajando, error, setError, correr, router };
}

/** El texto de lo que falló, junto al botón. */
export function ErrorDeAccion({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <span role="alert" className="t-dato error-accion">
      {error}
    </span>
  );
}

const base = (companyId: string) => `/api/companies/${companyId}/estrategia`;

/**
 * «Generar la estrategia» (o volver a generarla): tres consultas al asistente, unos minutos. La ruta comprueba antes de
 * gastar el mínimo, el tope de la empresa, la que está en curso y los topes del día y de «a la vez».
 */
export function BotonGenerar({ companyId, texto = MOTOR.generar, nota = MOTOR.generar_nota, secundario = false }: { companyId: string; texto?: string; nota?: string | null; secundario?: boolean }) {
  const { trabajando, error, correr } = useAccion();
  return (
    <span className="accion-con-nota">
      <button type="button" className={`boton${secundario ? " boton--secundario" : ""}`} disabled={trabajando} onClick={() => void correr(() => pedir(base(companyId), { method: "POST", json: {} }))}>
        {trabajando ? PANTALLA.poniendo_en_marcha : texto}
      </button>
      {nota && <small className="nota-accion">{nota}</small>}
      <ErrorDeAccion error={error} />
    </span>
  );
}

/**
 * «Actualizar números» (§7.3): sin IA y al instante. Crea una versión nueva con lo que respondió el dueño y abre esa
 * versión, donde «Qué cambió» aparece solo.
 */
export function ActualizarNumeros({ companyId, eid, texto = PANTALLA.actualizar, secundario = false }: { companyId: string; eid: string; texto?: string; secundario?: boolean }) {
  const { trabajando, error, correr, router } = useAccion();
  return (
    <span className="accion-con-nota">
      <button
        type="button"
        className={`boton${secundario ? " boton--secundario" : ""}`}
        disabled={trabajando}
        onClick={() =>
          void correr(
            () => pedir<{ version: number }>(`${base(companyId)}/${eid}/actualizar`, { method: "POST", json: {} }),
            (r) => router.push(`?v=${r.version}`)
          )
        }
      >
        {trabajando ? PANTALLA.actualizando : texto}
      </button>
      <ErrorDeAccion error={error} />
    </span>
  );
}

/** Lo que 8X quitó, aceptado: queda quitado y deja de contar para aprobar. */
export function AceptarQuitado({ companyId, eid, puntero }: { companyId: string; eid: string; puntero: string }) {
  const { trabajando, error, correr } = useAccion();
  return (
    <span className="accion-con-nota">
      <button type="button" className="boton boton--secundario boton--chico" disabled={trabajando} onClick={() => void correr(() => pedir(`${base(companyId)}/${eid}`, { method: "PATCH", json: { aceptar: { puntero } } }))}>
        {trabajando ? PANTALLA.guardando : PANTALLA.aceptar_quitado}
      </button>
      <ErrorDeAccion error={error} />
    </span>
  );
}

/** El selector de versiones: «Versión 3 · 17/10/2026 · aprobada». Cambiar de versión abre `?v=N`. */
export function SelectorVersion({ opciones, actual }: { opciones: { version: number; texto: string }[]; actual: number }) {
  const { router } = useAccion();
  if (opciones.length < 2) return <span className="t-dato selector-version--solo">{opciones.find((o) => o.version === actual)?.texto}</span>;
  return (
    <select className="campo selector-version" aria-label={PANTALLA.version_de_estrategia} value={actual} onChange={(ev) => router.push(`?v=${ev.target.value}`)}>
      {opciones.map((o) => (
        <option key={o.version} value={o.version}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}

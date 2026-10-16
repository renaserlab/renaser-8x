"use client";
import { useCallback, useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";
import { PAISES, MONEDAS, IDIOMAS, ZONAS, NOTA_IDIOMA_NO_DISPONIBLE, ejemplo, validarConfig, cambiosDe, proponerPorPais, type ConfigEmpresa } from "@/lib/formato";

/**
 * CONFIGURACIÓN POR EMPRESA (consultor): país, moneda, idioma y zona horaria. Hasta el 13-10-2026 todo estaba
 * clavado a Perú. Esta pantalla declara lo que la empresa es; `src/lib/formato.ts` lo convierte en texto. No
 * promete lo que no está probado: el idioma solo puede ser español, y casi todas las pantallas siguen mostrando
 * soles y hora de Lima hasta que se migren. Las dos cosas se dicen aquí mismo, antes de guardar.
 */

/** Lo que se le dice a quien guarda: solo unas pocas pantallas leen ya esta configuración. Se dice, no se disimula. */
const AVISO_PANTALLAS = "Algunas pantallas ya escriben con esta configuración. Las demás todavía muestran soles y hora de Lima: se van actualizando por partes.";
const NOTA_IDIOMA = "Hoy todo está solo en español. Los otros idiomas aparecen para que se sepa que faltan, no porque funcionen.";

/**
 * Los cuatro campos y la muestra. Sin estado propio: recibe la configuración y avisa cada cambio, así se puede
 * dibujar en una prueba. `ahora` fija el instante de la muestra; lo pone quien abre el panel.
 */
export function CamposConfiguracion({ cfg, alCambiar, ahora }: { cfg: ConfigEmpresa; alCambiar: (c: ConfigEmpresa) => void; ahora?: Date }) {
  const validacion = validarConfig(cfg);
  // La muestra se calcula con la misma función que usarán las pantallas: lo que se ve aquí es lo que se verá allá.
  const muestra = validacion.ok ? ejemplo(validacion.config, ahora) : null;

  // Si la base guarda un valor que no está en nuestras listas, el selector lo muestra igual: no se cambia solo.
  const paises = PAISES.some((p) => p.codigo === cfg.pais) ? PAISES : [...PAISES, { codigo: cfg.pais, nombre: cfg.pais, moneda: cfg.moneda, zona_horaria: cfg.zona_horaria }];
  const monedas = MONEDAS.some((m) => m.codigo === cfg.moneda) ? MONEDAS : [...MONEDAS, { codigo: cfg.moneda, nombre: cfg.moneda }];
  const idiomas = IDIOMAS.some((i) => i.codigo === cfg.idioma) ? IDIOMAS : [...IDIOMAS, { codigo: cfg.idioma, nombre: cfg.idioma, disponible: false }];
  const zonas = ZONAS.some((z) => z.zona === cfg.zona_horaria) ? ZONAS : [...ZONAS, { zona: cfg.zona_horaria, nombre: cfg.zona_horaria }];

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">País</span>
        <select className="campo" value={cfg.pais} onChange={(e) => alCambiar(proponerPorPais(cfg, e.target.value))}>
          {paises.map((p) => (
            <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
          ))}
        </select>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>Al cambiar el país se proponen su moneda y su hora. Puedes corregirlas abajo.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Moneda</span>
        <select className="campo" value={cfg.moneda} onChange={(e) => alCambiar({ ...cfg, moneda: e.target.value })}>
          {monedas.map((m) => (
            <option key={m.codigo} value={m.codigo}>{m.nombre === m.codigo ? m.codigo : `${m.nombre} (${m.codigo})`}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Idioma</span>
        <select className="campo" value={cfg.idioma} onChange={(e) => alCambiar({ ...cfg, idioma: e.target.value })}>
          {idiomas.map((i) => (
            <option key={i.codigo} value={i.codigo} disabled={!i.disponible}>
              {i.disponible ? i.nombre : `${i.nombre} · ${NOTA_IDIOMA_NO_DISPONIBLE}`}
            </option>
          ))}
        </select>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{NOTA_IDIOMA}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Zona horaria</span>
        <select className="campo" value={cfg.zona_horaria} onChange={(e) => alCambiar({ ...cfg, zona_horaria: e.target.value })}>
          {zonas.map((z) => (
            <option key={z.zona} value={z.zona}>{z.nombre}</option>
          ))}
        </select>
      </label>

      <div className="p-4" style={{ background: "var(--suave)", borderRadius: "var(--radio)" }}>
        <p className="t-etiqueta mb-2">Así se escribirán los montos y las fechas</p>
        {muestra ? (
          <>
            <p className="t-dato"><span style={{ color: "var(--grafito)" }}>Monto: </span><strong>{muestra.monto}</strong></p>
            <p className="t-dato"><span style={{ color: "var(--grafito)" }}>Fecha: </span><strong>{muestra.fecha}</strong></p>
            <p className="t-dato"><span style={{ color: "var(--grafito)" }}>Fecha y hora de ahora: </span><strong>{muestra.fecha_hora}</strong></p>
          </>
        ) : (
          <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{validacion.ok ? "" : validacion.error}</p>
        )}
      </div>

      <p className="t-dato" style={{ color: "var(--grafito)" }}>{AVISO_PANTALLAS}</p>
    </>
  );
}

export function ConfiguracionEmpresa({ companyId, actual }: { companyId: string; actual: ConfigEmpresa }) {
  // Cerrado = null. Abierto = el instante en que se abrió, que es también el de la muestra: no cambia mientras se elige.
  const [abiertoEn, setAbiertoEn] = useState<Date | null>(null);
  const [cfg, setCfg] = useState<ConfigEmpresa>(actual);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cerrar descarta lo elegido y no guardado, igual con el botón, con el telón o con Escape.
  const cerrar = useCallback(() => {
    setAbiertoEn(null);
    setCfg(actual);
    setError(null);
  }, [actual]);

  useEffect(() => {
    if (!abiertoEn) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [abiertoEn, cerrar]);

  const validacion = validarConfig(cfg);
  const cambios = validacion.ok ? cambiosDe(actual, validacion.config) : {};
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = async () => {
    if (!validacion.ok) {
      setError(validacion.error);
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/configuracion`, { method: "PATCH", json: cambios });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la configuración.");
      setOcupado(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setAbiertoEn(new Date())} className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>
        País y moneda
      </button>
      {abiertoEn && (
        <>
          <button type="button" className="telon" aria-label="Cerrar" onClick={cerrar} />
          <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="País, moneda y hora de la empresa">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="t-seccion">País, moneda y hora</h3>
              <button type="button" onClick={cerrar} className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}>Cerrar</button>
            </div>
            <div className="flex flex-col gap-4">
              <CamposConfiguracion cfg={cfg} alCambiar={setCfg} ahora={abiertoEn} />
              <button type="button" className="boton" disabled={ocupado || !hayCambios} onClick={guardar}>
                {ocupado ? "Guardando" : "Guardar"}
              </button>
              {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

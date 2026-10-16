"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import {
  CLASE_EVIDENCIA, DOMINIOS, MIN_LETRAS, comoSeLee, exigePendienteDeInvestigacion, unidadDeIndicador,
  type CampoCompletitud, type ClaseEvidencia, type EvidenciaDisponible, type IndicadorBreve, type IniciativaConContexto, type PersonaDeLaEmpresa,
} from "@/lib/iniciativas";

type Valor = string | string[] | null;

const CLASES: ClaseEvidencia[] = ["hallazgo", "fuente", "afirmacion"];
const MAX_POR_CLASE = 40;

/**
 * LA FICHA DE UNA INICIATIVA, con todos sus campos. Mientras es propuesta, cada campo se guarda al salir
 * de él. Una vez aprobada, los cambios se juntan y se guardan con su porqué: cambiar lo aprobado es volver
 * a decidir, y queda en el historial con el antes y el después. Detenida o cerrada, solo se lee.
 *
 * Bajo cada criterio se muestra cómo lo entendió el sistema («se lee como: 3 de cada 10 o más»). Si dice
 * que está escrito en palabras, o que el indicador elegido se mide en otra unidad, ese criterio lo evalúa
 * una persona; el sistema no adivina ni compara porcentajes con «de cada 10».
 */
export function FichaIniciativa({ companyId, iniciativa: i, participantes, indicadores, evidencias, onGuardado }: {
  companyId: string;
  iniciativa: IniciativaConContexto;
  participantes: PersonaDeLaEmpresa[];
  indicadores: IndicadorBreve[];
  evidencias: EvidenciaDisponible[];
  onGuardado: () => void;
}) {
  const soloLectura = i.estado === "detener" || i.estado === "cerrada";
  const decidida = i.estado !== "propuesta";
  const [pendiente, setPendiente] = useState<Record<string, Valor>>({});
  const [motivo, setMotivo] = useState("");
  const [buscar, setBuscar] = useState("");
  // Abierto de entrada solo si falta el sustento. Después manda quien lo abre o lo cierra: escribir en el buscador no lo pliega.
  const [verEvidencia, setVerEvidencia] = useState(() => i.falta.some((f) => f.campo === "evidencia"));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const original = (k: string): Valor => ((i as unknown as Record<string, Valor>)[k] ?? null);
  const valor = (k: string): Valor => (k in pendiente ? pendiente[k]! : original(k));
  const cambiar = (k: string, v: Valor) => setPendiente((p) => ({ ...p, [k]: v }));
  const falta = (campo: CampoCompletitud) => i.falta.some((f) => f.campo === campo);

  const guardar = async (cambios: Record<string, Valor>) => {
    if (!Object.keys(cambios).length) return;
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/iniciativas/${i.id}`, { method: "PATCH", json: decidida ? { ...cambios, motivo } : cambios });
      // En una propuesta lo escrito se queda en la caja mientras llega la versión guardada: no parpadea al valor anterior.
      if (decidida) setPendiente({});
      setMotivo("");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  // Propuesta: cada campo se guarda solo al salir. Aprobada: se acumulan y se guardan con su porqué.
  const alSalir = (k: string) => {
    if (decidida) return;
    const v = valor(k);
    if (JSON.stringify(v ?? null) !== JSON.stringify(original(k))) void guardar({ [k]: v });
  };
  const alElegir = (k: string, v: Valor) => {
    cambiar(k, v);
    if (!decidida) void guardar({ [k]: v });
  };

  const rotulo = (titulo: string, campo?: CampoCompletitud) => (
    <div className="t-etiqueta mb-1" style={campo && falta(campo) ? { color: "var(--caducado)" } : undefined}>
      {titulo}{campo && falta(campo) ? " · falta" : ""}
    </div>
  );
  const ayuda = (texto: string) => <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>{texto}</p>;
  const texto = (k: string, etiqueta: string, largo = false) =>
    largo ? (
      <textarea className="campo" rows={2} aria-label={etiqueta} disabled={soloLectura} value={(valor(k) as string | null) ?? ""} onChange={(e) => cambiar(k, e.target.value || null)} onBlur={() => alSalir(k)} />
    ) : (
      <input className="campo" aria-label={etiqueta} disabled={soloLectura} value={(valor(k) as string | null) ?? ""} onChange={(e) => cambiar(k, e.target.value || null)} onBlur={() => alSalir(k)} />
    );
  const seleccion = (k: string, etiqueta: string, opciones: { id: string; texto: string }[], vacio: string | null) => (
    <select className="campo" aria-label={etiqueta} disabled={soloLectura} value={(valor(k) as string | null) ?? ""} onChange={(e) => alElegir(k, e.target.value || null)}>
      {vacio !== null && <option value="">{vacio}</option>}
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
    </select>
  );
  // En qué se mide el indicador elegido: si un criterio dice otra unidad, se avisa aquí, donde se puede corregir.
  const elegido = indicadores.find((x) => x.id === valor("indicador_id"));
  const unidadDelIndicador = elegido ? unidadDeIndicador(elegido.unidad, elegido.moneda) : undefined;
  const criterio = (k: "criterio_continuar" | "criterio_ajustar" | "criterio_detener", titulo: string) => (
    <div>
      {rotulo(titulo, k)}
      {texto(k, titulo)}
      {ayuda(comoSeLee(valor(k) as string | null, unidadDelIndicador))}
    </div>
  );

  const citadas = (valor("evidencia_ids") as string[] | null) ?? [];
  const filtro = buscar.trim().toLowerCase();
  const alMarcar = (id: string, marcada: boolean) => alElegir("evidencia_ids", marcada ? [...citadas, id] : citadas.filter((x) => x !== id));
  const deMercadoSinFuente = exigePendienteDeInvestigacion({ dominio: (valor("dominio") as IniciativaConContexto["dominio"]) ?? i.dominio, fuentes_aportadas: i.fuentes_aportadas });
  const haySinGuardar = Object.keys(pendiente).length > 0;

  return (
    <div className="flex flex-col gap-3">
      {soloLectura && <p className="t-dato" style={{ color: "var(--grafito)" }}>Esta iniciativa está {i.estado === "cerrada" ? "cerrada" : "detenida"}: la ficha ya no se edita. Lo que pasó está en el historial.</p>}
      {decidida && !soloLectura && (
        <p className="t-dato" style={{ color: "var(--caducado)" }}>Esta iniciativa ya está aprobada: cualquier cambio pide su porqué y queda en el historial.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          {rotulo("Tema")}
          {seleccion("dominio", "Tema", DOMINIOS.map((d) => ({ id: d.clave, texto: `${d.tecnico} · ${d.nombre}` })), null)}
        </div>
        <div>
          {rotulo("Título")}
          {texto("titulo", "Título")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          {rotulo("Hipótesis: qué creemos que va a pasar y por qué", "hipotesis")}
          {texto("hipotesis", "Hipótesis", true)}
          {ayuda("Escríbela como se la dirías al dueño. Cuando se apruebe, él la lee tal cual en su portal.")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          {rotulo("Medida de éxito: cómo sabremos que funcionó", "medida_exito")}
          {texto("medida_exito", "Medida de éxito", true)}
        </div>
        <div>
          {rotulo("Indicador que la mide")}
          {seleccion("indicador_id", "Indicador", indicadores.map((k) => ({ id: k.id, texto: k.nombre })), indicadores.length ? "Sin indicador: se comprueba mirando" : "La empresa todavía no tiene indicadores")}
          {ayuda("Con indicador, los criterios se comparan con su último valor. Sin indicador, o sin valor, no hay veredicto: decide una persona.")}
        </div>
        <div>
          {rotulo("Responsable", "responsable")}
          {seleccion("responsable_participant_id", "Responsable", participantes.map((p) => ({ id: p.id, texto: `${p.nombre}${p.puesto ? ` · ${p.puesto}` : ""}` })), participantes.length ? "Sin responsable" : "La empresa todavía no tiene personas registradas")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          {rotulo("Recursos: qué personas, cuánto tiempo y cuánto dinero pide", "recursos")}
          {texto("recursos", "Recursos", true)}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          {rotulo("Plazo: desde cuándo y hasta cuándo se prueba", "plazo")}
          <div className="flex gap-2 flex-wrap">
            <input className="campo" type="date" aria-label="Inicio" disabled={soloLectura} style={{ maxWidth: 190 }} value={(valor("plazo_inicio") as string | null) ?? ""} onChange={(e) => cambiar("plazo_inicio", e.target.value || null)} onBlur={() => alSalir("plazo_inicio")} />
            <input className="campo" type="date" aria-label="Cierre" disabled={soloLectura} style={{ maxWidth: 190 }} value={(valor("plazo_fin") as string | null) ?? ""} onChange={(e) => cambiar("plazo_fin", e.target.value || null)} onBlur={() => alSalir("plazo_fin")} />
          </div>
          {ayuda("La fecha de cierre es obligatoria para aprobar: es el día en que toca decidir. Si no pones inicio, se anota el día en que se empiece.")}
        </div>
        {criterio("criterio_continuar", "Continuar si")}
        {criterio("criterio_ajustar", "Ajustar si")}
        {criterio("criterio_detener", "Detener si")}
        <div style={{ gridColumn: "1 / -1" }}>
          {rotulo(`Pendiente de investigar${deMercadoSinFuente ? " (obligatorio: es de mercado y no tiene fuente aportada)" : ""}`, "pendiente_investigacion")}
          {texto("pendiente_investigacion", "Pendiente de investigar", true)}
          {ayuda("Lo que no se pudo averiguar y conviene saber. No se escribe aquí lo que se supone del mercado o de la competencia: se escribe lo que falta comprobar.")}
        </div>
      </div>

      <details open={verEvidencia} onToggle={(e) => setVerEvidencia(e.currentTarget.open)}>
        <summary className="t-etiqueta" style={{ cursor: "pointer", color: falta("evidencia") ? "var(--caducado)" : undefined }}>
          Evidencia de la empresa que la sustenta: {citadas.length} citada(s){falta("evidencia") ? " · falta al menos una evidencia o una fuente aportada" : ""}
        </summary>
        <div className="flex flex-col gap-3 mt-2">
          {evidencias.length === 0 ? (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>La empresa todavía no tiene hallazgos, fuentes ni afirmaciones confirmadas que citar. Mientras tanto vale una fuente aportada.</p>
          ) : (
            <input className="campo" aria-label="Buscar evidencia" placeholder="Buscar por palabra" style={{ maxWidth: 320 }} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          )}
          {CLASES.map((clase) => {
            const deClase = evidencias.filter((e) => e.clase === clase && (!filtro || e.texto.toLowerCase().includes(filtro) || citadas.includes(e.id)));
            if (!deClase.length) return null;
            const ordenadas = [...deClase.filter((e) => citadas.includes(e.id)), ...deClase.filter((e) => !citadas.includes(e.id))];
            const visibles = ordenadas.slice(0, Math.max(MAX_POR_CLASE, citadas.length));
            return (
              <div key={clase}>
                <div className="t-etiqueta mb-1">{CLASE_EVIDENCIA[clase]}</div>
                <div className="flex flex-col gap-1">
                  {visibles.map((e) => (
                    <label key={e.id} className="t-dato flex gap-2 items-start">
                      <input type="checkbox" disabled={soloLectura} checked={citadas.includes(e.id)} onChange={(ev) => alMarcar(e.id, ev.target.checked)} />
                      <span>{e.texto}{e.falta && <span style={{ color: "var(--caducado)" }}> · {e.falta}</span>}</span>
                    </label>
                  ))}
                </div>
                {ordenadas.length > visibles.length && <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>Hay {ordenadas.length - visibles.length} más: escribe una palabra para encontrarlas.</p>}
              </div>
            );
          })}
        </div>
      </details>

      {decidida && !soloLectura && haySinGuardar && (
        <div className="flex flex-col gap-2" style={{ borderLeft: "2px solid var(--caducado)", paddingLeft: 12 }}>
          <input className="campo" aria-label="Por qué se cambia" placeholder={`Por qué se cambia (al menos ${MIN_LETRAS} letras)`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2 flex-wrap items-center">
            <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} disabled={guardando || motivo.trim().length < MIN_LETRAS} onClick={() => guardar(pendiente)}>
              {guardando ? "Guardando" : "Guardar cambios con su porqué"}
            </button>
            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => { setPendiente({}); setError(null); }}>Descartar</button>
          </div>
        </div>
      )}
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

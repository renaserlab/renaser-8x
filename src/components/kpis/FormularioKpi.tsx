"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import {
  UNIDADES, FRECUENCIAS, TIPOS_INDICADOR, SENTIDOS_UMBRAL, UNIDADES_MONETARIAS, UNIDAD_TEXTO, FRECUENCIA_TEXTO, TIPO_TEXTO,
  GRANULARIDAD_DE, FORMA_PERIODO, periodoCerradoMasReciente, type Kpi, type NuevoKpi, type Unidad, type Frecuencia, type TipoIndicador, type SentidoUmbral, type MejorSi,
} from "@/lib/kpis";

export type Participante = { id: string; nombre: string; puesto: string | null; rol: string | null };
export type AccionDelPlan = { id: string; accion: string; estado: string | null };
export type LineaBase = { id: string; version: number; vigente: boolean; fecha: string; periodo_hasta: string | null; valores: Record<string, number | null> };

type Campos = {
  nombre: string; clave: string; definicion: string; formula: string; unidad: Unidad; moneda: string; fuente: string;
  responsable_participant_id: string; frecuencia: Frecuencia; mejor_si: MejorSi; tipo_indicador: TipoIndicador | "";
  linea_base_valor: string; linea_base_periodo: string; linea_base_medicion_id: string;
  meta_valor: string; meta_texto: string; meta_plazo: string;
  umbral_alerta: string; umbral_sentido: SentidoUmbral | ""; accion_asociada_id: string; decision_asociada: string;
  estado: "propuesto" | "activo" | "archivado"; motivo: string;
};

const vacio = (v: unknown) => (v == null ? "" : String(v));

function desdeKpi(k: Partial<Kpi | NuevoKpi> | undefined): Campos {
  return {
    nombre: vacio(k?.nombre), clave: vacio(k?.clave), definicion: vacio(k?.definicion), formula: vacio(k?.formula),
    unidad: (k?.unidad as Unidad) ?? "numero", moneda: vacio(k?.moneda), fuente: vacio(k?.fuente),
    responsable_participant_id: vacio(k?.responsable_participant_id), frecuencia: (k?.frecuencia as Frecuencia) ?? "mensual",
    mejor_si: (k?.mejor_si as MejorSi) ?? "baja", tipo_indicador: (k?.tipo_indicador as TipoIndicador) ?? "",
    linea_base_valor: vacio(k?.linea_base_valor), linea_base_periodo: vacio(k?.linea_base_periodo), linea_base_medicion_id: vacio(k?.linea_base_medicion_id),
    meta_valor: vacio(k?.meta_valor), meta_texto: vacio(k?.meta_texto), meta_plazo: vacio(k?.meta_plazo),
    umbral_alerta: vacio(k?.umbral_alerta), umbral_sentido: (k?.umbral_sentido as SentidoUmbral) ?? "", accion_asociada_id: vacio(k?.accion_asociada_id),
    decision_asociada: vacio(k?.decision_asociada), estado: (k?.estado as Campos["estado"]) ?? "propuesto", motivo: "",
  };
}

const numeroONull = (t: string): number | null | "invalido" => {
  const s = t.trim().replace(/,/g, ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalido";
};

/** Un campo del formulario: etiqueta arriba, ayuda abajo. Fuera del componente para que no se remonte en cada tecla. */
function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <span className="t-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="t-dato" style={{ color: "var(--grafito)", fontSize: 12 }}>{ayuda}</span>}
    </label>
  );
}

/**
 * EL FORMULARIO DE LOS DOCE ATRIBUTOS. Cada campo lleva su pregunta en el idioma de la casa, y el
 * valor actual no está entre ellos a propósito: se registra con dato, aparte. El punto de partida se
 * puede tomar de una versión concreta de la línea base cuando la clave coincide con un vital: así el
 * indicador referencia la versión exacta y una recongelación posterior no lo mueve.
 */
export function FormularioKpi({
  companyId, inicial, kpiId, participantes, acciones, lineasBase, zona, alCerrar,
}: {
  companyId: string;
  /** Zona horaria de la empresa: el periodo cerrado que se muestra de ejemplo es el de su reloj. */
  zona: string;
  inicial?: Partial<Kpi | NuevoKpi>;
  /** Si viene, es edición (PATCH); si no, creación (POST). */
  kpiId?: string;
  participantes: Participante[];
  acciones: AccionDelPlan[];
  lineasBase: LineaBase[];
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [c, setC] = useState<Campos>(() => desdeKpi(inicial));
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pon = <K extends keyof Campos>(k: K, v: Campos[K]) => setC((prev) => ({ ...prev, [k]: v }));

  const esDinero = UNIDADES_MONETARIAS.has(c.unidad);
  const forma = FORMA_PERIODO[GRANULARIDAD_DE[c.frecuencia]];
  // Versiones de la línea base que tienen esta clave: el punto de partida puede salir de ahí, con su versión.
  const conClave = lineasBase.filter((lb) => c.clave && lb.valores && lb.valores[c.clave] != null);

  const tomarDeLineaBase = (lb: LineaBase) => {
    const v = lb.valores[c.clave];
    if (v == null) return;
    const periodo = c.frecuencia === "mensual" ? (lb.periodo_hasta ?? lb.fecha).slice(0, 7) : "";
    setC((prev) => ({ ...prev, linea_base_valor: String(v), linea_base_periodo: periodo || prev.linea_base_periodo, linea_base_medicion_id: lb.id }));
  };

  const enviar = async () => {
    setError(null);
    const numeros = { linea_base_valor: numeroONull(c.linea_base_valor), meta_valor: numeroONull(c.meta_valor), umbral_alerta: numeroONull(c.umbral_alerta) };
    const malo = Object.entries(numeros).find(([, v]) => v === "invalido");
    if (malo) { setError(`«${malo[0].replace(/_/g, " ")}» tiene que ser un número.`); return; }
    if (!c.nombre.trim()) { setError("El indicador necesita un nombre."); return; }
    const cuerpo: Record<string, unknown> = {
      nombre: c.nombre.trim(),
      clave: c.clave.trim() || undefined,
      definicion: c.definicion.trim() || null,
      formula: c.formula.trim() || null,
      unidad: c.unidad,
      moneda: esDinero ? (c.moneda.trim() || null) : null,
      fuente: c.fuente.trim() || null,
      responsable_participant_id: c.responsable_participant_id || null,
      frecuencia: c.frecuencia,
      mejor_si: c.mejor_si,
      tipo_indicador: c.tipo_indicador || null,
      linea_base_valor: numeros.linea_base_valor,
      linea_base_periodo: c.linea_base_periodo.trim() || null,
      linea_base_medicion_id: c.linea_base_medicion_id || null,
      meta_valor: numeros.meta_valor,
      meta_texto: c.meta_texto.trim() || null,
      meta_plazo: c.meta_plazo || null,
      umbral_alerta: numeros.umbral_alerta,
      umbral_sentido: c.umbral_sentido || null,
      accion_asociada_id: c.accion_asociada_id || null,
      decision_asociada: c.decision_asociada.trim() || null,
      estado: c.estado,
      ...(kpiId && c.motivo.trim() ? { motivo: c.motivo.trim() } : {}),
    };
    setTrabajando(true);
    try {
      if (kpiId) await pedir(`/api/companies/${companyId}/kpis/${kpiId}`, { method: "PATCH", json: cuerpo });
      else await pedir(`/api/companies/${companyId}/kpis`, { method: "POST", json: cuerpo });
      router.refresh();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="panel p-5 mt-4 aparece" aria-label={kpiId ? "Editar indicador" : "Nuevo indicador"}>
      <h3 className="t-seccion mb-1">{kpiId ? "Ajustar el indicador" : "Nuevo indicador"}</h3>
      <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>
        Doce atributos. El último valor no se escribe aquí: se registra con dato y con fecha, aparte.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" ayuda="Como se lo dirías al dueño. Sin siglas.">
          <input aria-label="Nombre" className="campo" value={c.nombre} onChange={(e) => pon("nombre", e.target.value)} />
        </Campo>
        <Campo etiqueta="Clave" ayuda="snake_case corto y estable. Si coincide con uno de los nueve números, el punto de partida puede salir de la línea base.">
          <input aria-label="Clave" className="campo" value={c.clave} onChange={(e) => pon("clave", e.target.value)} placeholder="se forma del nombre si queda vacía" />
        </Campo>
        <Campo etiqueta="1 · Qué mide" ayuda="Una frase.">
          <textarea aria-label="Qué mide" className="campo" style={{ minHeight: 64 }} value={c.definicion} onChange={(e) => pon("definicion", e.target.value)} />
        </Campo>
        <Campo etiqueta="2 · Cómo se calcula o se cuenta" ayuda="Para que alguien lo rehaga a mano mañana.">
          <textarea aria-label="Cómo se calcula o se cuenta" className="campo" style={{ minHeight: 64 }} value={c.formula} onChange={(e) => pon("formula", e.target.value)} />
        </Campo>
        <Campo etiqueta="3 · Unidad">
          <select aria-label="Unidad" className="campo" value={c.unidad} onChange={(e) => pon("unidad", e.target.value as Unidad)}>
            {UNIDADES.map((u) => <option key={u} value={u}>{UNIDAD_TEXTO[u]}</option>)}
          </select>
        </Campo>
        {esDinero && (
          <Campo etiqueta="3 · Moneda" ayuda="PEN si no se dice otra cosa.">
            <input aria-label="Moneda" className="campo" value={c.moneda} onChange={(e) => pon("moneda", e.target.value.toUpperCase())} placeholder="PEN" maxLength={3} />
          </Campo>
        )}
        <Campo etiqueta="4 · De dónde sale el dato" ayuda="Cuaderno de caja, Excel de ventas, sistema. Sin esto no está listo.">
          <input aria-label="De dónde sale el dato" className="campo" value={c.fuente} onChange={(e) => pon("fuente", e.target.value)} />
        </Campo>
        <Campo etiqueta="5 · Quién lo cuenta" ayuda="Una persona de la empresa. Sin responsable no está listo.">
          <select aria-label="Quién lo cuenta" className="campo" value={c.responsable_participant_id} onChange={(e) => pon("responsable_participant_id", e.target.value)}>
            <option value="">— nadie todavía —</option>
            {participantes.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : p.rol ? ` · ${p.rol}` : ""}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="6 · Cada cuánto">
          <select aria-label="Cada cuánto" className="campo" value={c.frecuencia} onChange={(e) => pon("frecuencia", e.target.value as Frecuencia)}>
            {FRECUENCIAS.map((f) => <option key={f} value={f}>{FRECUENCIA_TEXTO[f]}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Hacia dónde es mejorar">
          <select aria-label="Hacia dónde es mejorar" className="campo" value={c.mejor_si} onChange={(e) => pon("mejor_si", e.target.value as MejorSi)}>
            <option value="sube">mejor si sube</option>
            <option value="baja">mejor si baja</option>
            <option value="neutro">depende del contexto</option>
          </select>
        </Campo>
        <Campo etiqueta="Ejecución o resultado" ayuda="Hacer tareas no es mejorar el negocio: son dos listas distintas.">
          <select aria-label="Ejecución o resultado" className="campo" value={c.tipo_indicador} onChange={(e) => pon("tipo_indicador", e.target.value as TipoIndicador | "")}>
            <option value="">— sin clasificar —</option>
            {TIPOS_INDICADOR.map((t) => <option key={t} value={t}>{TIPO_TEXTO[t]}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="7 · Punto de partida" ayuda={`Valor y su periodo (${forma}). Ejemplo de periodo cerrado: ${periodoCerradoMasReciente(c.frecuencia, undefined, zona)}.`}>
          <div className="flex gap-2">
            <input aria-label="Valor del punto de partida" className="campo" style={{ maxWidth: 140 }} inputMode="decimal" value={c.linea_base_valor} onChange={(e) => pon("linea_base_valor", e.target.value)} placeholder="valor" />
            <input aria-label="Periodo del punto de partida" className="campo" value={c.linea_base_periodo} onChange={(e) => pon("linea_base_periodo", e.target.value)} placeholder="periodo" />
          </div>
          {conClave.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-1">
              {conClave.map((lb) => (
                <button key={lb.id} type="button" className="boton boton--secundario" style={{ minHeight: 28, fontSize: 12 }} onClick={() => tomarDeLineaBase(lb)}>
                  Tomar de la línea base v{lb.version}{lb.vigente ? " (vigente)" : ""}: {lb.valores[c.clave]}
                </button>
              ))}
            </div>
          )}
          {c.linea_base_medicion_id && <span className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>Referencia la versión exacta de la línea base; una corrección posterior no lo mueve.</span>}
        </Campo>
        <Campo etiqueta="8 · Meta y plazo" ayuda="Número o en palabras, y la fecha. Una meta sin plazo es un deseo.">
          <div className="flex gap-2 flex-wrap">
            <input aria-label="Valor de la meta" className="campo" style={{ maxWidth: 140 }} inputMode="decimal" value={c.meta_valor} onChange={(e) => pon("meta_valor", e.target.value)} placeholder="valor" />
            <input aria-label="Plazo de la meta" className="campo" type="date" value={c.meta_plazo} onChange={(e) => pon("meta_plazo", e.target.value)} />
          </div>
          <input aria-label="La meta en palabras" className="campo mt-1" value={c.meta_texto} onChange={(e) => pon("meta_texto", e.target.value)} placeholder="la meta en palabras" />
        </Campo>
        <Campo etiqueta="11 · Umbral de alerta" ayuda="A partir de qué cifra hay que preocuparse, y en qué sentido.">
          <div className="flex gap-2">
            <input aria-label="Umbral de alerta" className="campo" style={{ maxWidth: 140 }} inputMode="decimal" value={c.umbral_alerta} onChange={(e) => pon("umbral_alerta", e.target.value)} placeholder="valor" />
            <select aria-label="Sentido del umbral" className="campo" value={c.umbral_sentido} onChange={(e) => pon("umbral_sentido", e.target.value as SentidoUmbral | "")}>
              <option value="">— sentido —</option>
              {SENTIDOS_UMBRAL.map((s) => <option key={s} value={s}>{s === "por_debajo" ? "alerta si cae por debajo" : "alerta si pasa por encima"}</option>)}
            </select>
          </div>
        </Campo>
        <Campo etiqueta="12 · Acción del plan que lo persigue" ayuda="Una meta con plazo y sin acción es una alerta.">
          <select aria-label="Acción del plan asociada" className="campo" value={c.accion_asociada_id} onChange={(e) => pon("accion_asociada_id", e.target.value)}>
            <option value="">— ninguna —</option>
            {acciones.map((a) => <option key={a.id} value={a.id}>{a.accion.slice(0, 80)}{a.estado ? ` · ${a.estado}` : ""}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="12 · Decisión que dispara cruzar el umbral" ayuda="Qué se decide si el número cruza el umbral.">
          <input aria-label="Decisión asociada" className="campo" value={c.decision_asociada} onChange={(e) => pon("decision_asociada", e.target.value)} />
        </Campo>
        <Campo etiqueta="Estado">
          <select aria-label="Estado" className="campo" value={c.estado} onChange={(e) => pon("estado", e.target.value as Campos["estado"])}>
            <option value="propuesto">propuesto (el dueño decide)</option>
            <option value="activo">activo (se vigila)</option>
            <option value="archivado">archivado</option>
          </select>
        </Campo>
        {kpiId && (
          <Campo etiqueta="Por qué se cambia" ayuda="Queda en el rastro con quién lo cambió y qué había antes.">
            <input aria-label="Por qué se cambia" className="campo" value={c.motivo} onChange={(e) => pon("motivo", e.target.value)} />
          </Campo>
        )}
      </div>
      <p className="t-dato mt-3" style={{ color: "var(--grafito)", fontSize: 12 }}>
        9 · Último valor y su periodo, y 10 · qué tan comprobado está: se llenan al registrar un valor, no aquí.
      </p>
      {error && <p className="t-dato mt-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <div className="flex gap-2 mt-4 flex-wrap items-center">
        <button type="button" className="boton" disabled={trabajando} onClick={enviar}>{trabajando ? "Guardando" : kpiId ? "Guardar cambios" : "Crear indicador"}</button>
        <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={alCerrar}>Cancelar</button>
      </div>
    </section>
  );
}

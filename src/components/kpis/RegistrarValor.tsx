"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { numeroEscrito } from "@/lib/numero-escrito";
import {
  periodosRecientes, nombreDePeriodoKpi, textoValor, ESTADOS_VALIDACION_VALOR, VALIDACION_TEXTO, TEXTO_SIN_DATO,
  type Frecuencia, type Unidad, type EstadoValidacionValor,
} from "@/lib/kpis";

export type KpiParaRegistrar = { id: string; nombre: string; unidad: Unidad; moneda: string | null; frecuencia: Frecuencia; fuente: string | null };

/** Acepta «8 mil», «8,500», «28.000», «S/ 8500», «12.5». Vacío = sin dato (null), nunca cero. Una sola lectura para todo el sistema: numero-escrito.ts. */
export function aNumero(t: string): number | null | "invalido" {
  return numeroEscrito(t, { negativo: true });
}

/**
 * REGISTRAR EL VALOR DE UN PERIODO. El campo vacío significa «sin dato», y se dice antes de guardar:
 * nadie convierte un hueco en un cero sin darse cuenta. El periodo que se ofrece es siempre uno
 * cerrado (nunca el que está en curso), y cerrado en el reloj de la empresa (`zona`), no en UTC: el
 * servidor aplica la misma regla. La consultora además dice qué tan comprobado está el número; la empresa
 * registra como «declarado» y no elige.
 */
export function RegistrarValor({ companyId, kpi, modo, zona, alCerrar }: { companyId: string; kpi: KpiParaRegistrar; modo: "consultor" | "cliente"; zona: string; alCerrar?: () => void }) {
  const router = useRouter();
  // Sin fecha explícita: «ahora», leído en el reloj de la empresa.
  const periodos = periodosRecientes(kpi.frecuencia, 6, undefined, zona);
  const [periodo, setPeriodo] = useState(periodos[0] ?? "");
  const [texto, setTexto] = useState("");
  const [fuente, setFuente] = useState("");
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<EstadoValidacionValor>("declarado");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const valor = aNumero(texto);
  const esSinDato = valor === null;

  const guardar = async () => {
    setError(null);
    setAviso(null);
    if (valor === "invalido") { setError("Escribe solo el número. Si no tienes el dato, deja el campo vacío."); return; }
    if (esSinDato && !confirm(`¿No tienes el dato de ${nombreDePeriodoKpi(periodo)}? Se anota como «${TEXTO_SIN_DATO(periodo)}», no como cero.`)) return;
    setTrabajando(true);
    try {
      const r = await pedir<{ texto: string; aviso?: string | null }>(`/api/companies/${companyId}/kpis/${kpi.id}/valor`, {
        method: "POST",
        json: {
          periodo,
          valor: esSinDato ? null : valor,
          ...(modo === "consultor" ? { fuente: fuente.trim() || null, estado_validacion: estado, nota: nota.trim() || null } : {}),
        },
      });
      setHecho(r.texto);
      setAviso(r.aviso ?? null);
      router.refresh();
      // Con un aviso el formulario no se cierra solo: quien registró tiene que poder leerlo.
      if (!r.aviso) setTimeout(() => alCerrar?.(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="panel p-4 mt-3" style={{ background: "var(--suave)" }}>
      <p className="t-dato" style={{ fontWeight: 600 }}>{kpi.nombre}</p>
      <div className="flex gap-2 mt-3 flex-wrap items-end">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Periodo</span>
          <select className="campo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Periodo">
            {periodos.map((p) => (
              <option key={p} value={p}>{nombreDePeriodoKpi(p)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Valor</span>
          <input
            className="campo" style={{ maxWidth: 180 }} inputMode="decimal" autoFocus
            placeholder="vacío = sin dato" value={texto} onChange={(e) => setTexto(e.target.value)}
            aria-label={`Valor de ${kpi.nombre}`}
          />
        </label>
        {modo === "consultor" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="t-etiqueta">Qué tan comprobado</span>
              <select className="campo" value={estado} onChange={(e) => setEstado(e.target.value as EstadoValidacionValor)} aria-label="Estado de validación">
                {ESTADOS_VALIDACION_VALOR.map((e) => (
                  <option key={e} value={e}>{VALIDACION_TEXTO[e]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1" style={{ flex: "1 1 180px" }}>
              <span className="t-etiqueta">De dónde salió</span>
              <input className="campo" placeholder={kpi.fuente ?? "cuaderno, Excel, sistema…"} value={fuente} onChange={(e) => setFuente(e.target.value)} aria-label="Fuente del valor" />
            </label>
            <label className="flex flex-col gap-1" style={{ flex: "1 1 180px" }}>
              <span className="t-etiqueta">Nota</span>
              <input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota" />
            </label>
          </>
        )}
      </div>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
        {valor === "invalido"
          ? "Eso no es un número."
          : esSinDato
            ? `Vacío: se anotará «${TEXTO_SIN_DATO(periodo)}». No es cero.`
            : `Se registrará ${textoValor(kpi.unidad, valor, kpi.moneda)} para ${nombreDePeriodoKpi(periodo)}.`}
      </p>
      <div className="flex gap-2 mt-3 flex-wrap items-center">
        <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando || !periodo} onClick={guardar}>
          {trabajando ? "Guardando" : esSinDato ? "Anotar sin dato" : "Guardar valor"}
        </button>
        {alCerrar && (
          <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={alCerrar}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {hecho && <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }} role="status">{hecho}</p>}
      {aviso && <p className="t-dato mt-2" style={{ color: "var(--caducado)" }} role="status">{aviso}</p>}
    </div>
  );
}

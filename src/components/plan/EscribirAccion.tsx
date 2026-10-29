"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { mensajeDe } from "@/components/negocio/dato";
import type { Participante, IndicadorBreve } from "@/lib/plan-reglas";

type Props = { companyId: string; participantes: readonly Participante[]; indicadores: readonly IndicadorBreve[] };

/**
 * ESCRIBIR UNA ACCIÓN DEL PLAN A MANO.
 *
 * Hasta hoy una acción solo podía nacer del planificador de IA. Sin crédito, sin hallazgos aprobados, o
 * simplemente para abrir un frente que la consultora decidió en la reunión, no había por dónde: la pantalla
 * del plan mostraba una tabla vacía y un botón que llamaba al modelo.
 *
 * EL FORMULARIO SON LOS SEIS MÍNIMOS, NO LOS CATORCE CAMPOS. Lo único obligatorio es qué se hace; los otros
 * cinco son exactamente lo que `queLeFalta` exige para poder aprobarla, así que quien los llena de una vez
 * sale con una acción aprobable, y quien no, sale con una propuesta y su lista de lo que le falta. Los otros
 * ocho campos de la ficha se completan en la ficha, que es donde se leen.
 */
export function EscribirAccion({ companyId, participantes, indicadores }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [falta, setFalta] = useState<string[] | null>(null);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFalta(null);
    setYendo(true);
    const f = new FormData(e.currentTarget);
    const t = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v || null;
    };
    try {
      const r = await pedir<{ falta?: string[] }>(`/api/companies/${companyId}/plan/accion`, {
        json: {
          accion: t("accion"),
          objetivo_empresarial: t("objetivo_empresarial"),
          resultado_esperado: t("resultado_esperado"),
          criterio_aceptacion: t("criterio_aceptacion"),
          responsable_participant_id: t("responsable_participant_id"),
          indicador_id: t("indicador_id"),
          kpi: t("kpi"),
          fecha_inicio: t("fecha_inicio"),
          vence_at: t("vence_at"),
        },
      });
      setFalta(r.falta ?? []);
      setAbierto(false);
      router.refresh();
    } catch (err) {
      setError(mensajeDe(err, "No pudimos crear la acción. Inténtalo de nuevo."));
    } finally {
      setYendo(false);
    }
  };

  if (!abierto) {
    return (
      <span className="flex flex-col gap-1">
        <button type="button" className="boton boton--secundario" onClick={() => setAbierto(true)}>
          Escribir una acción
        </button>
        {/* Lo que le falta a la que se acaba de crear, dicho una vez: después vive en su ficha. */}
        {falta && (
          <span className="t-dato" role="status" style={{ color: falta.length ? "var(--grafito)" : "var(--confirmado)" }}>
            {falta.length ? `Creada como propuesta. Para aprobarla le falta: ${falta.join("; ")}.` : "Creada y lista para aprobarse."}
          </span>
        )}
      </span>
    );
  }

  return (
    <form onSubmit={enviar} className="panel p-4 flex flex-col gap-3" style={{ maxWidth: 620, background: "var(--suave)" }}>
      <label className="flex flex-col gap-1">
        <span className="t-dato" style={{ fontWeight: 600 }}>Qué se hace</span>
        <textarea name="accion" rows={2} required maxLength={600} className="campo" placeholder="Una instrucción que el dueño pueda repetirle a su equipo sin traducir." />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-dato">Para qué (objetivo de la empresa)</span>
        <input name="objetivo_empresarial" maxLength={1200} className="campo" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-dato">Qué se espera que cambie, y cuánto</span>
        <input name="resultado_esperado" maxLength={1200} className="campo" />
      </label>

      {/* Solo personas registradas del equipo: un nombre escrito a mano no identifica a nadie y la regla del
          plan lo rechaza al aprobar. Sin nadie registrado todavía, se dice dónde se registran. El comentario va
          ANTES de la etiqueta, no entre ella y el control: la prueba que comprueba que cada control tiene
          etiqueta la busca mirando hacia atrás, y un comentario en medio la esconde. */}
      <label className="flex flex-col gap-1">
        <span className="t-dato">Quién la hace</span>
        <select name="responsable_participant_id" defaultValue="" className="campo" disabled={!participantes.length}>
          <option value="">{participantes.length ? "— elige a alguien del equipo —" : "no hay nadie registrado todavía"}</option>
          {participantes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}{p.puesto ? ` (${p.puesto})` : ""}
            </option>
          ))}
        </select>
        {!participantes.length && <span className="t-dato" style={{ color: "var(--grafito)" }}>Las personas del equipo se registran en Organigrama.</span>}
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1" style={{ flex: "1 1 160px" }}>
          <span className="t-dato">Empieza</span>
          <input type="date" name="fecha_inicio" className="campo" />
        </label>
        <label className="flex flex-col gap-1" style={{ flex: "1 1 160px" }}>
          <span className="t-dato">Vence</span>
          <input type="date" name="vence_at" className="campo" />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="t-dato">Cuándo se da por aceptada</span>
        <input name="criterio_aceptacion" maxLength={1200} className="campo" placeholder="Cómo sabremos que quedó hecha." />
      </label>

      {/* EL SEXTO MÍNIMO SON DOS CASILLAS, NO UNA (29-10-2026). La regla pide «un indicador para medirla, O el
          motivo de no tenerlo», y aquí solo estaba la lista de indicadores. Con una empresa sin indicadores
          —que es como empiezan todas— la lista sale apagada y el formulario prometía seis campos dejando llenar
          cinco: ninguna acción escrita a mano podía salir aprobable. */}
      <label className="flex flex-col gap-1">
        <span className="t-dato">Con qué indicador se mide</span>
        <select name="indicador_id" defaultValue="" className="campo" disabled={!indicadores.length}>
          <option value="">{indicadores.length ? "— ninguno por ahora —" : "esta empresa todavía no tiene indicadores"}</option>
          {indicadores.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}{i.unidad ? ` (${i.unidad})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-dato">{indicadores.length ? "O, si ninguno sirve: cómo se va a medir, o por qué no se mide" : "Cómo se va a medir, o por qué no se mide"}</span>
        <input name="kpi" maxLength={400} className="campo" placeholder="Lo que se va a mirar para saber si funcionó, aunque todavía no sea un indicador." />
      </label>

      <p className="nota" style={{ margin: 0, fontSize: 13 }}>
        Nace como <strong>propuesta</strong>. Aprobarla es otro acto: pide estos seis campos llenos, la autoridad de
        aprobar planes y sitio dentro del límite de prioridades abiertas.
      </p>

      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)", margin: 0 }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="boton" disabled={yendo}>
          {yendo ? "Creando…" : "Crear la acción"}
        </button>
        <button type="button" className="boton boton--secundario" onClick={() => setAbierto(false)} disabled={yendo}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

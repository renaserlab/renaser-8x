"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { FRECUENCIA_TEXTO, TEXTO_FALTA_MOTIVO, motivoSuficiente, nombreDePeriodoKpi, periodoCerradoMasReciente, textoValidacion, textoValor, type Kpi } from "@/lib/kpis";
import { RegistrarValor } from "./RegistrarValor";
import { MotivoArchivo } from "./MotivoArchivo";

/** Lo que el dueño ve de cada indicador. El nombre del responsable no viaja: solo su puesto (frontera P0-03). */
export type IndicadorCliente = Pick<Kpi, "id" | "nombre" | "definicion" | "como_se_mide" | "unidad" | "moneda" | "frecuencia" | "fuente" | "mejor_si" | "estado" | "valor_actual" | "valor_actual_periodo" | "estado_validacion" | "meta_valor" | "meta_texto" | "meta_plazo" | "linea_base_valor" | "linea_base_periodo"> & {
  responsable_puesto: string | null;
};
export type UltimosValores = { indicador_id: string; periodo: string; valor: number }[];

/**
 * TUS INDICADORES — lo que el dueño vigila y registra. Nombre, qué mide en una frase, el último valor
 * con su periodo y un solo botón: registrar el valor de este periodo. Nada de jerga: aquí no hay
 * «KPI» ni «baseline»; hay indicador y punto de partida. Un campo vacío es «sin dato», nunca cero.
 *
 * «Este no me sirve» no archiva nada por sí solo: abre la pregunta del motivo, y sin motivo (al menos
 * ocho letras) no hay botón que archive. `zona` es la zona horaria de la empresa: decide qué periodo ya cerró.
 */
export function TusIndicadores({ companyId, indicadores, valores, zona }: { companyId: string; indicadores: IndicadorCliente[]; valores: UltimosValores; zona: string }) {
  const router = useRouter();
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activos = indicadores.filter((i) => i.estado === "activo");
  const propuestos = indicadores.filter((i) => i.estado === "propuesto");

  const decidir = async (id: string, estado: "activo" | "archivado", motivo?: string) => {
    // Sin motivo no se archiva: ni siquiera se le pregunta al servidor (que también lo exige).
    if (estado === "archivado" && !motivoSuficiente(motivo)) {
      setError(TEXTO_FALTA_MOTIVO);
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/kpis/${id}`, { method: "PATCH", json: estado === "archivado" ? { estado, motivo: motivo!.trim() } : { estado } });
      setDescartando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  if (indicadores.length === 0) {
    return (
      <section className="panel p-5">
        <p className="t-cuerpo medida">
          Todavía no hay indicadores para tu negocio. Cuando los definamos contigo, aquí verás qué mide cada uno y podrás anotar su valor cada periodo.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {propuestos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Te proponemos vigilar</h2>
          <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>Quédate solo con los que de verdad vayas a contar: un número que nadie cuenta es peor que ninguno.</p>
          <ul className="flex flex-col gap-3">
            {propuestos.map((i) => (
              <li key={i.id} className="panel p-4">
                <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{i.definicion ?? i.como_se_mide}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Se anota {FRECUENCIA_TEXTO[i.frecuencia]}{i.fuente ? ` · de ${i.fuente}` : ""}</p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13 }} disabled={trabajando} onClick={() => decidir(i.id, "activo")}>Vigilar este</button>
                  <button type="button" className="t-dato" disabled={trabajando} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }} onClick={() => { setDescartando(i.id); setError(null); }}>
                    Este no me sirve
                  </button>
                </div>
                {descartando === i.id && (
                  <MotivoArchivo nombre={i.nombre} trabajando={trabajando} alConfirmar={(motivo) => decidir(i.id, "archivado", motivo)} alCancelar={() => setDescartando(null)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <h2 className="t-seccion mb-1">Los que estás vigilando</h2>
          <p className="t-dato mb-3 medida" style={{ color: "var(--grafito)" }}>Anota cada uno cuando cierre su periodo. Si un periodo no tienes el dato, déjalo vacío: lo anotamos como sin dato, no como cero.</p>
          <ul className="flex flex-col gap-3">
            {activos.map((i) => {
              // Sin fecha explícita: «ahora», leído en el reloj de la empresa.
              const periodo = periodoCerradoMasReciente(i.frecuencia, undefined, zona);
              const serie = valores.filter((v) => v.indicador_id === i.id).sort((a, b) => b.periodo.localeCompare(a.periodo)).slice(0, 4);
              const yaEste = serie.some((v) => v.periodo === periodo);
              return (
                <li key={i.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                      <p className="t-cuerpo" style={{ fontWeight: 600 }}>{i.nombre}</p>
                      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{i.definicion ?? i.como_se_mide}</p>
                      <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12.5 }}>
                        Se anota {FRECUENCIA_TEXTO[i.frecuencia]}
                        {i.responsable_puesto ? ` · lo cuenta: ${i.responsable_puesto}` : ""}
                        {i.fuente ? ` · de ${i.fuente}` : ""}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", flex: "none" }}>
                      {i.valor_actual != null && i.valor_actual_periodo ? (
                        <>
                          <p style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{textoValor(i.unidad, i.valor_actual, i.moneda)}</p>
                          <p className="t-dato" style={{ color: "var(--grafito)" }}>
                            {nombreDePeriodoKpi(i.valor_actual_periodo)}{i.estado_validacion ? ` · ${textoValidacion(i, { zona })}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="t-dato" style={{ color: "var(--grafito)" }}>{i.estado_validacion === "sin_dato" ? "último periodo sin dato" : "todavía sin valor"}</p>
                      )}
                    </div>
                  </div>

                  {(i.linea_base_valor != null && i.linea_base_periodo) || i.meta_valor != null || i.meta_texto ? (
                    <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
                      {i.linea_base_valor != null && i.linea_base_periodo ? `Punto de partida: ${textoValor(i.unidad, i.linea_base_valor, i.moneda)} (${nombreDePeriodoKpi(i.linea_base_periodo)}).` : ""}
                      {i.meta_valor != null || i.meta_texto ? ` Meta: ${i.meta_valor != null ? textoValor(i.unidad, i.meta_valor, i.moneda) : i.meta_texto}${i.meta_plazo ? ` para ${i.meta_plazo}` : ""}.` : ""}
                    </p>
                  ) : null}

                  {serie.length > 1 && (
                    <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
                      Antes: {serie.slice(1).map((v) => `${nombreDePeriodoKpi(v.periodo)} ${textoValor(i.unidad, v.valor, i.moneda)}`).join(" · ")}
                    </p>
                  )}

                  {registrando === i.id ? (
                    <RegistrarValor companyId={companyId} kpi={i} modo="cliente" zona={zona} alCerrar={() => setRegistrando(null)} />
                  ) : (
                    <button type="button" className="boton boton--secundario mt-3" style={{ minHeight: 34, fontSize: 13 }} onClick={() => { setRegistrando(i.id); setError(null); }}>
                      {yaEste ? `Corregir el de ${nombreDePeriodoKpi(periodo)}` : `Registrar el valor de ${nombreDePeriodoKpi(periodo)}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </section>
  );
}

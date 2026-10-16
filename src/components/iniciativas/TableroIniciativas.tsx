"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BLOQUES, ESTADO_CONSULTOR, plazoEnPalabras, porDominio, type Bloque, type Estado, type IniciativaConContexto, type Tablero } from "@/lib/iniciativas";
import { DetalleIniciativa } from "./DetalleIniciativa";
import { NuevaIniciativa } from "./NuevaIniciativa";

const COLOR: Record<Estado, string> = {
  propuesta: "var(--grafito)",
  aprobada: "var(--marca)",
  en_curso: "var(--marca)",
  continuar: "var(--confirmado)",
  ajustar: "var(--caducado)",
  detener: "var(--contradicho)",
  cerrada: "var(--grafito)",
};

const ORDEN_BLOQUES = Object.keys(BLOQUES) as Bloque[];
const EN_CURSO: Estado[] = ["en_curso", "continuar", "ajustar"];
const enlace = { background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--marca)", textDecoration: "underline", padding: 0 } as const;

/** Lo que una fila dice de su iniciativa sin abrirla: si está lista, cuánto le falta o si ya toca decidir. */
function resumenDe(i: IniciativaConContexto): { texto: string; color?: string } {
  if (i.toca_decidir) return { texto: "Plazo cumplido: toca decidir", color: "var(--contradicho)" };
  if (i.estado === "propuesta") {
    if (i.falta.length) return { texto: `Ficha: ${i.avance.completas} de ${i.avance.total}`, color: "var(--caducado)" };
    return i.pertinencia.puede_avanzar ? { texto: "Lista para aprobar", color: "var(--confirmado)" } : { texto: "Su evidencia todavía falta", color: "var(--caducado)" };
  }
  if (i.estado === "en_curso" && i.evaluacion.veredicto) return { texto: `El dato apunta a ${i.evaluacion.veredicto}` };
  if (i.estado === "en_curso" && !i.evaluacion.hay_dato) return { texto: "Sin dato para evaluar", color: "var(--grafito)" };
  return { texto: "" };
}

/**
 * EXCELENCIA, SERVICIO Y ACELERACIÓN: EL TABLERO POR TEMA. Los quince temas, cada uno con la pregunta que
 * responde y con sus iniciativas. Un tema vacío también informa: ahí la empresa todavía no apuesta nada.
 * Cada iniciativa se abre para ver su ficha, lo que le falta, lo que dicen sus criterios y su historial.
 */
export function TableroIniciativas({ companyId, tablero }: { companyId: string; tablero: Extract<Tablero, { disponible: true }> }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const todas = tablero.iniciativas;
  const temas = porDominio(todas);
  const cuenta = {
    propuestas: todas.filter((i) => i.estado === "propuesta").length,
    listas: todas.filter((i) => i.estado === "propuesta" && i.falta.length === 0 && i.pertinencia.puede_avanzar).length,
    aprobadas: todas.filter((i) => i.estado === "aprobada").length,
    enCurso: todas.filter((i) => EN_CURSO.includes(i.estado)).length,
    porDecidir: todas.filter((i) => i.toca_decidir).length,
    temasConApuesta: temas.filter((t) => t.iniciativas.some((i) => i.estado !== "cerrada" && i.estado !== "detener")).length,
  };

  const alCambiar = (texto?: string | null) => {
    setAviso(texto ?? null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="panel p-4 flex flex-wrap gap-6 items-baseline">
        <div>
          <div className="t-etiqueta">En curso</div>
          <div className="t-seccion">{cuenta.enCurso}</div>
        </div>
        <div>
          <div className="t-etiqueta">Aprobadas, por empezar</div>
          <div className="t-seccion">{cuenta.aprobadas}</div>
        </div>
        <div>
          <div className="t-etiqueta">Propuestas</div>
          <div className="t-seccion">{cuenta.propuestas}{cuenta.propuestas > 0 && <span className="t-dato" style={{ color: "var(--grafito)" }}> · {cuenta.listas} lista(s) para aprobar</span>}</div>
        </div>
        <div>
          <div className="t-etiqueta">Plazo cumplido sin decidir</div>
          <div className="t-seccion" style={{ color: cuenta.porDecidir ? "var(--contradicho)" : undefined }}>{cuenta.porDecidir}</div>
        </div>
        <div>
          <div className="t-etiqueta">Temas con alguna apuesta viva</div>
          <div className="t-seccion">{cuenta.temasConApuesta} de {temas.length}</div>
        </div>
      </div>

      {aviso && <p className="t-dato" style={{ color: "var(--caducado)" }} role="status">{aviso}</p>}

      {ORDEN_BLOQUES.map((bloque) => (
        <section key={bloque}>
          <h2 className="t-seccion mb-2">{BLOQUES[bloque]}</h2>
          {temas.filter((t) => t.dominio.bloque === bloque).map(({ dominio, iniciativas }) => (
            <div key={dominio.clave} className="grid gap-3 md:grid-cols-3" style={{ borderTop: "1px solid var(--linea)", padding: "16px 0" }}>
              <div>
                <p className="t-cuerpo" style={{ fontWeight: 600 }}>{dominio.nombre}</p>
                <p className="t-etiqueta">{dominio.tecnico}</p>
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{dominio.pregunta}</p>
              </div>
              <div className="md:col-span-2 flex flex-col gap-3" style={{ minWidth: 0 }}>
                {iniciativas.length === 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguna iniciativa en este tema.</p>}
                {iniciativas.map((i) => {
                  const r = resumenDe(i);
                  return (
                    <div key={i.id} id={`iniciativa-${i.id}`} className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                        <span className="t-cuerpo" style={{ minWidth: 0 }}>{i.titulo}</span>
                        <span className="t-dato" style={{ color: COLOR[i.estado] }}>{ESTADO_CONSULTOR[i.estado]}</span>
                        <span className="t-dato" style={{ color: "var(--grafito)" }}>{plazoEnPalabras(i.plazo_inicio, i.plazo_fin)}</span>
                        {i.responsable_nombre && <span className="t-dato" style={{ color: "var(--grafito)" }}>{i.responsable_nombre}</span>}
                        {r.texto && <span className="t-dato" style={{ color: r.color }}>{r.texto}</span>}
                        <button type="button" className="t-dato" style={enlace} aria-expanded={abierta === i.id} onClick={() => setAbierta(abierta === i.id ? null : i.id)}>
                          {abierta === i.id ? "Cerrar" : "Ficha"}
                        </button>
                      </div>
                      {abierta === i.id && (
                        <DetalleIniciativa companyId={companyId} iniciativa={i} participantes={tablero.participantes} indicadores={tablero.indicadores} evidencias={tablero.evidencias} hoy={tablero.hoy} zona={tablero.zona} onCambio={alCambiar} />
                      )}
                    </div>
                  );
                })}
                {proponiendo === dominio.clave ? (
                  <NuevaIniciativa
                    companyId={companyId}
                    dominio={dominio}
                    onCancelar={() => setProponiendo(null)}
                    onCreada={(id) => { setProponiendo(null); setAbierta(id); alCambiar(null); }}
                  />
                ) : (
                  <div>
                    <button type="button" className="t-dato" style={enlace} onClick={() => setProponiendo(dominio.clave)}>Proponer una iniciativa en este tema</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

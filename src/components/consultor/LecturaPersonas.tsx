import type { LecturaDePersonas } from "@/lib/rules/organigrama";

/**
 * LO QUE LA ESTRUCTURA DEJA VER (R9.1). Debajo del organigrama: qué puesto no tiene quién lo ocupe, qué
 * función está escrita igual en dos puestos, quién carga más puestos de los que se toleran, y cómo queda
 * la estructura de hoy frente a la opción recomendada del estudio guardado.
 *
 * Son listas para trabajar, no conclusiones: salen de una cuenta sobre org_puestos y org_estudio
 * (src/lib/rules/organigrama.ts · lecturaDePersonas), sin modelo y sin escribir nada. Lo que no hay se
 * dice: una lista vacía trae su frase, y sin estudio no se inventa una estructura objetivo.
 */
export function LecturaPersonas({ lectura }: { lectura: LecturaDePersonas }) {
  if (!lectura.hay_puestos && !lectura.objetivo) return null;
  const { objetivo } = lectura;
  return (
    <section className="mb-10 no-imprimir" aria-labelledby="lectura-personas">
      <h2 id="lectura-personas" className="t-seccion">Lo que la estructura deja ver</h2>
      <p className="t-dato medida mt-1 mb-4" style={{ color: "var(--grafito)" }}>
        Listas para trabajar con la empresa, no conclusiones. Salen de los puestos anotados arriba, tal como están.
      </p>

      {lectura.secciones.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {lectura.secciones.map((s) => (
            <div key={s.clave} className="panel p-5">
              <p className="t-etiqueta mb-2">{s.titulo}{s.items.length > 0 ? ` (${s.items.length})` : ""}</p>
              {s.items.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {s.items.map((texto) => (
                    <li key={texto} className="t-dato">{texto}</li>
                  ))}
                </ul>
              ) : (
                <p className="t-dato" style={{ color: "var(--grafito)" }}>{s.sin_nada}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="panel p-5 mt-4">
        <p className="t-etiqueta mb-2">La estructura de hoy frente a la del estudio</p>
        {objetivo ? (
          <>
            <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>Frente a {objetivo.rotulo}.</p>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className="t-dato" style={{ fontWeight: 600 }}>Ya existen ({objetivo.coinciden.length})</p>
                <p className="t-dato mt-1">{objetivo.coinciden.length ? objetivo.coinciden.join(", ") : "Ningún puesto de hoy está en esa opción con el mismo nombre."}</p>
              </div>
              <div>
                <p className="t-dato" style={{ fontWeight: 600 }}>Están hoy y esa opción no los nombra ({objetivo.solo_hoy.length})</p>
                <p className="t-dato mt-1">{objetivo.solo_hoy.length ? objetivo.solo_hoy.join(", ") : "Ninguno."}</p>
                {objetivo.solo_hoy.length > 0 && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>No quiere decir que sobren: hay que decidirlo con la empresa.</p>}
              </div>
              <div>
                <p className="t-dato" style={{ fontWeight: 600 }}>Faltan por crear ({objetivo.solo_objetivo.length})</p>
                {objetivo.transicion.length ? (
                  <ul className="flex flex-col gap-1 mt-1">
                    {objetivo.transicion.map((t) => (
                      <li key={t.cuando} className="t-dato">
                        <span style={{ color: "var(--grafito)" }}>{t.rotulo}:</span> {t.puestos.join(", ")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-dato mt-1">Ninguno: todos los puestos de esa opción ya existen.</p>
                )}
              </div>
            </div>
            <p className="t-dato mt-4" style={{ color: "var(--grafito)" }}>{objetivo.nota}</p>
          </>
        ) : (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>{lectura.sin_objetivo}</p>
        )}
      </div>
    </section>
  );
}

import { ROTULO_CLIENTE, type ClaseFrase, type FraseCliente, type VistaCliente } from "@/lib/ficha-direccion";

/**
 * «HACIA DÓNDE VA TU EMPRESA», COMO LO LEE EL DUEÑO. Recibe la vista ya armada en el servidor (`vistaCliente`):
 * sus palabras exactas entre comillas, lo que contó y quedó anotado, lo que se acordó, lo que la consultora
 * entendió y los números. No conoce la ficha interna: lo que no está en la vista no llega a esta pantalla.
 */

const COLOR: Record<ClaseFrase, string> = {
  dijiste: "var(--grafito)",
  documento: "var(--grafito)",
  contaste: "var(--grafito)",
  acordamos: "var(--confirmado)",
  entendimos: "var(--grafito)",
  numero: "var(--marca)",
};

function Frase({ f }: { f: FraseCliente }) {
  // Entre comillas solo va lo textual: sus palabras o el fragmento de su documento. Un resumen va sin ellas.
  const textual = f.clase === "dijiste" || f.clase === "documento";
  return (
    <li>
      <span className="t-etiqueta" style={{ color: COLOR[f.clase] }}>{ROTULO_CLIENTE[f.clase]}</span>
      <p className={textual ? "t-doc mt-1 medida" : "t-cuerpo mt-1 medida"}>{textual ? `«${f.texto}»` : f.texto}</p>
      {f.anotado.map((a) => (
        <p key={a} className="t-dato mt-1 medida">
          Lo anotamos así: {a}
        </p>
      ))}
      {f.de_donde && (
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
          {f.de_donde[0].toUpperCase()}
          {f.de_donde.slice(1)}
        </p>
      )}
    </li>
  );
}

export function DireccionCliente({ vista }: { vista: VistaCliente }) {
  const p = vista.participacion;
  const hayParticipacion = !!p.conteo || p.dijiste.length > 0 || p.areas.length > 0;
  return (
    <div className="flex flex-col gap-8">
      {vista.bloques.map((b) => (
        <section key={b.clave} aria-labelledby={`direccion-${b.clave}`}>
          <h2 id={`direccion-${b.clave}`} className="t-seccion">{b.titulo}</h2>
          <ul className="lista-editorial mt-3">
            {b.frases.map((f, i) => (
              <Frase key={i} f={f} />
            ))}
          </ul>
        </section>
      ))}

      {hayParticipacion && (
        <section aria-labelledby="direccion-participacion">
          <h2 id="direccion-participacion" className="t-seccion">Lo que hoy pasa por ti</h2>
          <p className="t-dato mt-1 medida" style={{ color: "var(--grafito)" }}>
            No es una nota ni una crítica: es una foto de dónde estás presente hoy, para decidir juntos qué quieres seguir haciendo tú y qué quieres soltar.
          </p>
          {p.conteo && <p className="t-cuerpo mt-3 medida">{p.conteo}</p>}
          {p.dijiste.length > 0 && (
            <ul className="lista-editorial mt-3">
              {p.dijiste.map((f, i) => (
                <Frase key={i} f={f} />
              ))}
            </ul>
          )}
          {p.areas.length > 0 && (
            <div className="grid gap-3 mt-4 md:grid-cols-2">
              {p.areas.map((a) => (
                <article key={a.titulo} className="panel p-4">
                  <h3 className="t-dato" style={{ fontWeight: 650, fontSize: 15 }}>{a.titulo}</h3>
                  <dl className="mt-2 flex flex-col gap-2">
                    {a.lineas.map((l) => (
                      <div key={l.etiqueta}>
                        <dt className="t-etiqueta">{l.etiqueta}</dt>
                        <dd className="t-dato" style={{ margin: 0 }}>{l.texto}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

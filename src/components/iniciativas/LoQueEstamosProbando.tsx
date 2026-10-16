import { plazoEnPalabras, type IniciativaCliente } from "@/lib/iniciativas";

/**
 * «LO QUE ESTAMOS PROBANDO», como lo lee el dueño. Cada apuesta dice qué creemos que va a pasar, cómo
 * sabremos si funcionó y hasta cuándo se prueba; y, para que no haya sorpresas, qué se hará según lo que
 * se vea. Aquí no llegan propuestas: solo lo que ya se aprobó o está en curso (lo filtra la consulta, no
 * este componente). Sin jerga: no hay «hipótesis» ni «criterios», hay «qué creemos» y «seguimos si».
 */
export function LoQueEstamosProbando({ iniciativas }: { iniciativas: IniciativaCliente[] }) {
  return (
    <ul className="lista-editorial">
      {iniciativas.map((i) => (
        <li key={i.id}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-baseline">
            {i.tema && <span className="t-etiqueta">{i.tema}</span>}
            <span className="t-dato" style={{ color: "var(--marca)" }}>{i.estado}</span>
          </div>
          <h2 className="t-seccion mt-1">{i.titulo}</h2>

          <div className="grid gap-4 md:grid-cols-2 mt-3 medida">
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="t-etiqueta">Qué creemos que va a pasar</div>
              <p className="t-cuerpo mt-1">{i.que_creemos}</p>
            </div>
            <div>
              <div className="t-etiqueta">Cómo sabremos si funcionó</div>
              <p className="t-cuerpo mt-1">{i.como_sabremos}</p>
              <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{i.como_va}</p>
            </div>
            <div>
              <div className="t-etiqueta">Hasta cuándo lo probamos</div>
              <p className="t-cuerpo mt-1">{plazoEnPalabras(i.plazo_inicio, i.plazo_fin)}</p>
              {i.responsable_puesto && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Lo lleva: {i.responsable_puesto}</p>}
            </div>
          </div>

          {(i.seguimos_si || i.ajustamos_si || i.paramos_si) && (
            <div className="mt-3 medida">
              <div className="t-etiqueta">Qué haremos según lo que se vea</div>
              <ul className="mt-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {i.seguimos_si && <li className="t-dato"><strong>Seguimos si:</strong> {i.seguimos_si}</li>}
                {i.ajustamos_si && <li className="t-dato"><strong>Cambiamos algo si:</strong> {i.ajustamos_si}</li>}
                {i.paramos_si && <li className="t-dato"><strong>Paramos si:</strong> {i.paramos_si}</li>}
              </ul>
            </div>
          )}

          {(i.en_que_nos_basamos.length > 0 || i.falta_averiguar) && (
            <div className="mt-3 medida">
              {i.en_que_nos_basamos.length > 0 && (
                <p className="t-dato" style={{ color: "var(--grafito)" }}><strong style={{ color: "var(--tinta)" }}>En qué nos basamos:</strong> {i.en_que_nos_basamos.join(" · ")}</p>
              )}
              {i.falta_averiguar && (
                <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}><strong style={{ color: "var(--tinta)" }}>Lo que todavía no sabemos:</strong> {i.falta_averiguar}</p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

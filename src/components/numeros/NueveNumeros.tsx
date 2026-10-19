import { Barritas, Segmentos } from "@/components/tablero/Piezas";
import type { ConfigEmpresa } from "@/lib/formato";
import { conteoMarcas, partesMarcas, cifraVital, nombrePeriodo, MARCA_DE_CAJA, type FilaVital, type MarcaNumero } from "@/lib/numeros-vista";

/**
 * LOS NUEVE NÚMEROS DE UNA EMPRESA, VISTOS POR LA CONSULTORA (16-10-2026). Componente de servidor: no escribe nada.
 *
 * Una tarjeta de tablero a todo el ancho. Arriba, la barra segmentada (comprobados · sin comprobar · no lo sabe ·
 * faltan); debajo, una fila por vital en el orden de VITALES: nombre y mes, cifra con su unidad, cómo se sabe (cinco
 * marcas, `marcaDe`) y, para los tres mensuales, los últimos seis meses en barritas. En el celular la tabla se vuelve
 * lista, como en la bandeja.
 *
 * `filas` null = no se pudieron leer los números: se dice así, nunca como «faltan los nueve».
 */
export function NueveNumeros({ filas, config }: { filas: FilaVital[] | null; config: ConfigEmpresa }) {
  if (!filas) {
    return (
      <section className="tarjeta tabla-tarjeta" style={{ gridColumn: "1 / -1" }} aria-labelledby="n-nueve">
        <div className="cabeza">
          <div>
            <h2 id="n-nueve">Los nueve números</h2>
            <p className="sub">Sin ellos el diagnóstico es opinión</p>
          </div>
        </div>
        <p className="sin-dato" style={{ marginTop: 14 }}>No se pudieron leer los números de la empresa: vuelve a cargar la página</p>
      </section>
    );
  }
  const c = conteoMarcas(filas);
  const respondidos = filas.length - c.falta;
  // Lo que sale de su caja (Finanzas) se nombra en la barra: cuenta como sin comprobar, pero no «de memoria».
  const partes = partesMarcas(c, filas.filter((f) => f.marca === MARCA_DE_CAJA).length);
  return (
    <section className="tarjeta tabla-tarjeta" style={{ gridColumn: "1 / -1" }} aria-labelledby="n-nueve">
      <div className="cabeza">
        <div>
          <h2 id="n-nueve">Los nueve números</h2>
          <p className="sub">
            {respondidos} de {filas.length} respondidos · {c.comprobado} {c.comprobado === 1 ? "comprobado" : "comprobados"}
          </p>
        </div>
      </div>
      <Segmentos partes={partes} etiqueta={`De los nueve números: ${partes.map((p) => `${p.n} ${p.texto}`).join(" · ")}`} />

      <div className="envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cifra</th>
              <th>Cómo se sabe</th>
              <th>Últimos seis meses</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <td>
                  <b style={{ fontWeight: 650 }}>{f.nombre}</b>
                  {f.periodo && <span className="menor">{nombrePeriodo(f.periodo)}</span>}
                </td>
                <td>
                  <Cifra f={f} config={config} />
                </td>
                <td>
                  <Marca m={f.marca} />
                </td>
                {/* Sin ningún mes con cifra la tira no dice nada que la marca no diga: no se pinta. */}
                <td>{f.barras && f.barras.some((b) => b.valor != null) && <TiraMeses f={f} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="lista-movil">
        {filas.map((f) => (
          <li key={f.clave}>
            <span style={{ fontWeight: 650, fontSize: 14.5 }}>{f.nombre}</span>
            <Marca m={f.marca} />
            <small>
              {f.valor != null ? cifraVital(f.valor, f.unidad, config) : "sin cifra"}
              {f.periodo ? ` · ${nombrePeriodo(f.periodo)}` : ""}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** La marca: chip de estado; «falta» no es un estado, es un dato que no hay: va rayado. */
function Marca({ m }: { m: MarcaNumero }) {
  return m.clase ? <span className={`estado ${m.clase}`}>{m.texto}</span> : <span className="sin-dato">{m.texto}</span>;
}

/** La cifra en Manrope. Sin cifra, una raya en grafito: la marca de al lado dice si falta o si no lo sabe. */
function Cifra({ f, config }: { f: FilaVital; config: ConfigEmpresa }) {
  if (f.valor == null) return <span className="menor" aria-label="sin cifra">—</span>;
  return (
    <span className="num" style={{ fontSize: 16.5, fontWeight: 750, whiteSpace: "nowrap" }}>
      {cifraVital(f.valor, f.unidad, config)}
    </span>
  );
}

/** Las seis barritas de un mensual, con lo rayado nombrado debajo. */
function TiraMeses({ f }: { f: FilaVital }) {
  const barras = f.barras ?? [];
  if (!barras.length) return <span className="sin-dato">sin meses</span>;
  const huecos = barras.filter((b) => b.valor == null).length;
  const desde = nombrePeriodo(barras[0]!.periodo);
  const hasta = nombrePeriodo(barras[barras.length - 1]!.periodo);
  return (
    <div style={{ minWidth: 120 }}>
      <Barritas barras={barras} etiqueta={`${f.nombre} de ${desde} a ${hasta}: ${barras.length - huecos} con cifra y ${huecos} sin dato`} />
      {huecos > 0 && <p className="pie-barritas">Rayado: {huecos === 1 ? "un mes" : `${huecos} meses`} sin cifra</p>}
    </div>
  );
}

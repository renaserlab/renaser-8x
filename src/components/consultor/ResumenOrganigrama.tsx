import { Segmentos } from "@/components/tablero/Piezas";
import { nivelesDelArbol, type Puesto, type ReglaEstudio } from "@/lib/rules/organigrama";

/**
 * LO ÚNICO ARRIBA EN ORGANIGRAMA (vista Estructura, revisión del 16-10-2026: Procesos tenía su resumen y el organigrama
 * no). Dos tarjetas: los puestos —cuántos, cuántos ocupados y cuántos vacantes, y en cuántos niveles— y el estudio —
 * cuántas de sus reglas cumple, y cuáles no—. Debajo, en su hoja, el árbol y el estudio de siempre.
 *
 * Presentacional y de servidor: recibe los puestos y las reglas ya calculadas (estudioOrganigrama). Sin puestos no hay
 * nada que contar y se dice así, no con ceros.
 */
export function ResumenOrganigrama({ puestos, estudio }: { puestos: Puesto[]; estudio: ReglaEstudio[] }) {
  if (!puestos.length) {
    return (
      <div className="tablero no-imprimir">
        <section className="tarjeta a-lo-ancho" aria-labelledby="t-resumen-organigrama">
          <div className="cabeza">
            <div>
              <h2 id="t-resumen-organigrama">Organigrama de la empresa</h2>
              <p className="sub">Los puestos, quién los ocupa y si la estructura está bien armada</p>
            </div>
          </div>
          <p className="sin-dato" style={{ marginTop: 14 }}>Todavía no hay puestos</p>
        </section>
      </div>
    );
  }
  const vacantes = puestos.filter((p) => !p.persona?.trim()).length;
  const ocupados = puestos.length - vacantes;
  const niveles = nivelesDelArbol(puestos).length;
  const cumplen = estudio.filter((r) => r.cumple).length;
  const fallan = estudio.filter((r) => !r.cumple);
  const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
  return (
    <div className="tablero no-imprimir">
      <section className="tarjeta bloque" aria-labelledby="t-puestos">
        <div className="cabeza">
          <div>
            <h2 id="t-puestos">Puestos</h2>
            <p className="sub">Quién ocupa cada uno y cuántos niveles tiene la estructura</p>
          </div>
        </div>
        <p className="principal">
          <span className="grande">{puestos.length}</span> {pl(puestos.length, "puesto", "puestos")} en {niveles} {pl(niveles, "nivel", "niveles")}
        </p>
        <Segmentos
          etiqueta={`${ocupados} ${pl(ocupados, "ocupado", "ocupados")}, ${vacantes} ${pl(vacantes, "vacante", "vacantes")}`}
          partes={[
            { n: ocupados, texto: pl(ocupados, "ocupado", "ocupados"), tipo: "s1" },
            { n: vacantes, texto: pl(vacantes, "vacante", "vacantes"), tipo: "s4" },
          ]}
        />
      </section>
      <section className="tarjeta bloque" aria-labelledby="t-estudio">
        <div className="cabeza">
          <div>
            <h2 id="t-estudio">El estudio</h2>
            <p className="sub">Las reglas de una estructura bien armada</p>
          </div>
        </div>
        <p className="principal">
          Cumple <span className="grande">{cumplen}</span> de {estudio.length} {pl(estudio.length, "regla", "reglas")}
        </p>
        <Segmentos
          etiqueta={`${cumplen} ${pl(cumplen, "cumple", "cumplen")}, ${fallan.length} no ${pl(fallan.length, "cumple", "cumplen")}`}
          partes={[
            { n: cumplen, texto: pl(cumplen, "cumple", "cumplen"), tipo: "s1" },
            { n: fallan.length, texto: `no ${pl(fallan.length, "cumple", "cumplen")}`, tipo: "s4" },
          ]}
        />
        {fallan.length > 0 && <p className="nota">Falla: {fallan.map((r) => r.nombre).join(" · ")}.</p>}
      </section>
    </div>
  );
}

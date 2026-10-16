import { moneda as enMoneda, type ConfigEmpresa } from "@/lib/formato";
import { textoRango, type Rango } from "@/lib/dato-oral";
import { explicarCalculo } from "@/lib/finanzas";
import { palanca, type PedidoPalanca, type TableroRentabilidad } from "@/lib/rentabilidad";
import { cantidad } from "./dato";

/** Los porcentajes de las palancas, tal como llegan en la dirección (?p_precio=&p_parte=&p_volumen=). */
export type PctPalancas = { precio: number; parte: number; volumen: number };
export const PCT_POR_DEFECTO: PctPalancas = { precio: 5, parte: 10, volumen: 10 };

/** Lee un porcentaje de la dirección: un número entre 0,1 y 100; si no, el de por defecto. */
export function pctDe(v: string | string[] | undefined, porDefecto: number): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = s == null ? NaN : Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n >= 0.1 && n <= 100 ? n : porDefecto;
}

/**
 * LAS PALANCAS (para la consultora): «si subes el precio un 5 % y vendes lo mismo, deja S/ X más al mes». Para los
 * tres productos que más se venden: el precio, su parte más cara y vender un poco más. La cuenta es palanca() de
 * src/lib/rentabilidad.ts y corre AQUÍ, en el servidor: ese módulo trae producto.ts (lector de Excel, cliente de la
 * base) y no puede viajar al navegador. Cambiar los porcentajes es un formulario que recalcula la página. Nunca se
 * dice «vas a ganar»: se dice cuánto deja SI pasa.
 */
export function Palancas({ t, config, pct, conservar }: { t: TableroRentabilidad; config: ConfigEmpresa; pct: PctPalancas; conservar: Record<string, string> }) {
  const fmt = (n: number) => enMoneda(n, config, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
  const lineas = [...new Set(t.palancasSugeridas.map((p) => p.lineaId))];
  const nombre = (id: string) => t.productos.find((p) => p.id === id)?.nombre ?? "este producto";
  const deltaTexto = (r: Rango) => (r.alto < 0 ? `deja ${textoRango({ bajo: -r.alto, alto: -r.bajo }, fmt)} menos al mes` : `deja ${textoRango(r, fmt)} más al mes`);

  return (
    <section aria-labelledby="palancas-titulo" className="flex flex-col gap-3">
      <h3 id="palancas-titulo" className="t-seccion" style={{ fontSize: 17 }}>Palancas: qué pasa si…</h3>
      <form method="get" className="flex flex-wrap items-end gap-3 no-imprimir">
        {Object.entries(conservar).map(([k, v]) => (
          <input key={k} aria-label={`Conserva ${k}`} type="hidden" name={k} value={v} />
        ))}
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Subir el precio (%)</span>
          <input aria-label="Porcentaje de subida del precio" className="campo" style={{ maxWidth: 140 }} name="p_precio" type="number" min="0.1" max="100" step="any" defaultValue={pct.precio} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Bajar su parte más cara (%)</span>
          <input aria-label="Porcentaje de baja de la parte más cara" className="campo" style={{ maxWidth: 140 }} name="p_parte" type="number" min="0.1" max="100" step="any" defaultValue={pct.parte} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Vender más (%)</span>
          <input aria-label="Porcentaje de aumento de lo vendido" className="campo" style={{ maxWidth: 140 }} name="p_volumen" type="number" min="0.1" max="100" step="any" defaultValue={pct.volumen} />
        </label>
        <button type="submit" className="boton boton--secundario">Recalcular</button>
      </form>

      {lineas.length === 0 ? (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin productos con precio, costo y cuánto se vende al mes no hay palancas que calcular.</p>
      ) : (
        <ul className="lista-editorial">
          {lineas.map((id, i) => {
            const parte = t.palancasSugeridas.find((p): p is Extract<PedidoPalanca, { tipo: "parte" }> => p.tipo === "parte" && p.lineaId === id);
            const pedidos: PedidoPalanca[] = [
              { tipo: "precio", lineaId: id, pct: pct.precio },
              ...(parte ? [{ tipo: "parte" as const, lineaId: id, parte: parte.parte, pct: pct.parte }] : []),
              { tipo: "volumen", lineaId: id, pct: pct.volumen },
            ];
            const calculos = pedidos.map((p) => ({ p, c: palanca(t, p) }));
            const cuentas = calculos.map(({ p, c }) => {
              const que =
                p.tipo === "precio"
                  ? `Si subes el precio un ${cantidad(p.pct)} % y vendes lo mismo,`
                  : p.tipo === "parte"
                    ? `Si «${p.parte}» te cuesta ${cantidad(p.pct)} % menos y vendes lo mismo,`
                    : `Si vendes ${cantidad(p.pct)} % más y lo demás sigue igual,`;
              if (!c.valor) return <p key={p.tipo} className="t-dato" style={{ color: "var(--grafito)" }}>{que} no hay cuenta: {c.motivo_nulo}.</p>;
              const v = c.valor;
              return (
                <div key={p.tipo}>
                  <p className="t-dato">
                    {que} <b>{deltaTexto(v.delta_mes)}</b>.
                    {v.volumen_que_se_puede_perder_pct != null && ` Podría vender hasta un ${cantidad(v.volumen_que_se_puede_perder_pct)} % menos y seguiría dejando lo mismo que hoy.`}
                    {v.nuevo_equilibrio_unidades && ` El punto de equilibrio pasaría a ${textoRango(v.nuevo_equilibrio_unidades, (n) => cantidad(Math.ceil(n)))} unidades al mes.`}
                  </p>
                  <details>
                    <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)", fontSize: 13 }}>Cómo se calculó</summary>
                    <dl className="mt-1">
                      {explicarCalculo(c).map((x) => (
                        <div key={x.etiqueta} className="t-dato" style={{ fontSize: 13 }}>
                          <dt style={{ fontWeight: 600, display: "inline" }}>{x.etiqueta}: </dt>
                          <dd style={{ display: "inline", margin: 0 }}>{x.texto}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              );
            });
            // Abierto solo el primero (el que más se vende): los demás, plegados con su nombre. Antes eran nueve
            // párrafos seguidos, cada uno con su «Cómo se calculó», antes de llegar a lo que falta.
            return (
              <li key={id} className="flex flex-col gap-2">
                {i === 0 ? (
                  <>
                    <p className="t-dato" style={{ fontWeight: 650 }}>{nombre(id)}</p>
                    {cuentas}
                  </>
                ) : (
                  <details>
                    <summary className="t-dato" style={{ fontWeight: 650, cursor: "pointer", minHeight: 44, paddingTop: 10 }}>{nombre(id)}</summary>
                    <div className="flex flex-col gap-2 mt-1">{cuentas}</div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

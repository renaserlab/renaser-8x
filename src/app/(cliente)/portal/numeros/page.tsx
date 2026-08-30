import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { radiografia, derivados, PERIODO_DORADA, type Metrica } from "@/lib/metricas";
import { mesesRecientes } from "@/lib/temporadas";
import { MisNumeros } from "@/components/cliente/MisNumeros";
import { Franja, Lectura } from "@/components/base/Franja";

export const dynamic = "force-dynamic";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * TUS NÚMEROS — la pantalla que faltaba. Hasta hoy los números solo entraban por lo que se lograba
 * pescar de la conversación, y la radiografía nunca se cerraba (Qori: 18 números, 3 de los nueve
 * vitales). Aquí el dueño ve cuántos le faltan, los pone él mismo, y por primera vez los pone
 * POR MES: sin serie mensual no hay "cómo estuvo" ni con qué comparar después.
 */
export default async function Numeros() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const sb = supabaseAdmin();
  const [{ data: metricasRaw }, { data: empresa }] = await Promise.all([
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", c.companyId).limit(200),
    sb.from("companies").select("ficha").eq("id", c.companyId).single(),
  ]);

  const metricas = (metricasRaw ?? []) as Metrica[];
  const r = radiografia(metricas);
  const d = derivados(metricas);
  const ficha = (empresa?.ficha ?? {}) as Record<string, unknown>;
  const altas = Array.isArray(ficha.temporadas_altas) ? (ficha.temporadas_altas as string[]) : [];

  const serieVenta = metricas
    .filter((m) => m.clave === "venta_mes" && m.valor != null && /^[0-9]{4}-[0-9]{2}$/.test(m.periodo))
    .map((m) => ({ periodo: m.periodo, valor: Number(m.valor) }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));

  const dorada = metricas.find((m) => m.clave === "venta_mes" && m.periodo === PERIODO_DORADA && m.valor != null);

  return (
    <>
      <p className="t-etiqueta">Los números de tu negocio</p>
      <h1 className="t-titulo mt-2 mb-2">Tus números</h1>
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Nueve números cuentan la salud de cualquier negocio. No hace falta contabilidad ni buscar papeles:
        contesta de memoria, como si te lo preguntáramos hablando.
      </p>

      {/* LO QUE YA SE PUEDE CALCULAR: la recompensa por haber contestado. */}
      {(d.margen != null || d.diasAguante != null || d.equilibrio != null) && (
        <div className="mb-8">
          <Franja columnas={3}>
            <Lectura
              divisor={false}
              valor={d.margen != null ? `${d.margen.toFixed(0)}%` : "—"}
              etiqueta="de cada 100 soles, te queda"
              color={d.margen != null && d.margen < 10 ? "var(--contradicho)" : undefined}
            />
            <Lectura
              valor={d.diasAguante != null ? String(Math.round(d.diasAguante)) : "—"}
              unidad={d.diasAguante != null ? "días" : undefined}
              etiqueta="aguantas si mañana no entra nada"
              color={d.diasAguante != null && d.diasAguante < 30 ? "var(--contradicho)" : undefined}
            />
            <Lectura
              valor={d.equilibrio != null ? soles(d.equilibrio) : "—"}
              etiqueta="tienes que vender al mes para no perder"
            />
          </Franja>
          {d.sobreEquilibrio != null && (
            <p className="t-cuerpo mt-3 medida">
              {d.sobreEquilibrio >= 0
                ? `Vendiendo lo del último mes estás ${soles(d.sobreEquilibrio)} por encima de tu punto de equilibrio.`
                : `Cuidado: con lo del último mes te faltan ${soles(Math.abs(d.sobreEquilibrio))} para llegar a tu punto de equilibrio.`}
            </p>
          )}
          {dorada?.valor != null && serieVenta[0] && (
            <p className="t-cuerpo mt-1 medida" style={{ color: "var(--grafito)" }}>
              Tu mejor época vendías {soles(Number(dorada.valor))} al mes. Hoy, {soles(serieVenta[0].valor)}.
            </p>
          )}
        </div>
      )}

      <MisNumeros
        radiografia={r}
        serieVenta={serieVenta}
        temporadasAltas={altas}
        mesesDisponibles={mesesRecientes(14)}
      />
    </>
  );
}

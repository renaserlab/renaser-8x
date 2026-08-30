import Link from "next/link";
import type { Radiografia } from "@/lib/metricas";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * LOS NÚMEROS, en Mi empresa. No es un sexto botón en la barra —Kelin fue clara: ni un botón de
 * más—, es lo primero que el dueño ve de su propia empresa, porque sin estos nueve números
 * cualquier diagnóstico es opinión.
 */
export function TarjetaNumeros({
  radiografia: r,
  margen,
  diasAguante,
}: {
  radiografia: Radiografia;
  margen: number | null;
  diasAguante: number | null;
}) {
  const faltan = r.faltan.length;
  const urgente = faltan >= 5;

  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div style={{ minWidth: 0 }}>
          <h2 className="t-seccion">Tus números</h2>
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            {r.completa ? "Los nueve están puestos" : `Tienes ${r.listos} de ${r.total}`}
          </p>
        </div>
        <Link
          href="/portal/numeros"
          className={faltan > 0 ? "boton" : "boton boton--secundario"}
          style={{ minHeight: 38, fontSize: 14, flex: "none" }}
        >
          {faltan > 0 ? "Completar mis números" : "Ver y corregir"}
        </Link>
      </div>

      <div className="flex gap-1 mb-3" aria-hidden="true">
        {Array.from({ length: r.total }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 1, height: 6, borderRadius: 3,
              background: i < r.listos ? "var(--confirmado)" : "var(--linea)",
            }}
          />
        ))}
      </div>

      {faltan > 0 ? (
        <p className="t-cuerpo medida" style={{ color: urgente ? "var(--contradicho)" : "var(--tinta)" }}>
          Falta {faltan === 1 ? "un número" : `${faltan} números`} para poder decirte tu margen real y cuánto
          aguantas si mañana no entra nada. Son preguntas de memoria: no busques papeles.
        </p>
      ) : (
        <p className="t-cuerpo medida">
          {margen != null && `De cada 100 soles que vendes te quedan ${margen.toFixed(0)}. `}
          {diasAguante != null && `Con la caja de hoy aguantas ${Math.round(diasAguante)} días sin vender.`}
        </p>
      )}

      {r.mesesConVenta < 3 && (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          {r.mesesConVenta === 0
            ? "Todavía no sabemos cómo venías: con tres meses de ventas podemos decirte si subes o bajas."
            : `Tienes ${r.mesesConVenta} ${r.mesesConVenta === 1 ? "mes" : "meses"} de ventas. Con tres ya se ve tu curva.`}
        </p>
      )}

      {r.sinDato.length > 0 && (
        <p className="t-dato mt-2" style={{ color: "var(--caducado)" }}>
          Hay {r.sinDato.length} {r.sinDato.length === 1 ? "número que no sabes" : "números que no sabes"}: {r.sinDato.map((v) => v.nombre.toLowerCase()).join(", ")}.
          Eso también es un hallazgo — lo trabajamos.
        </p>
      )}
    </section>
  );
}

export { soles };

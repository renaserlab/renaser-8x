import type { ConfigEmpresa } from "@/lib/formato";
import { moneda as enMoneda } from "@/lib/formato";
import { centro, esExacto, textoRango } from "@/lib/dato-oral";
import { CUADRANTE_TEXTO, type Cuadrante, type TableroRentabilidad } from "@/lib/rentabilidad";
import { SinDato } from "./Marcas";
import { cantidad } from "./dato";

/**
 * LA MATRIZ MARGEN × VOLUMEN (para la consultora). Cada producto con datos es un punto: a la derecha lo que más se
 * vende, arriba lo que más deja por unidad. Las dos líneas son los umbrales DE ESTA EMPRESA, rotulados con su valor
 * (no la regla del 70 % de la ingeniería de menú). Un producto dicho en rango es un rectángulo con sus extremos; si
 * cruza un umbral queda «en el borde». Los que no tienen datos van listados debajo, rayados, con lo que les falta.
 * SVG dibujado en el servidor: sin librerías, con sus colores del sistema de diseño.
 */

const ANCHO = 640;
const ALTO = 420;
const IZQ = 74;
const DER = 18;
const ARR = 18;
const ABA = 52;
const W = ANCHO - IZQ - DER;
const H = ALTO - ARR - ABA;

const COLOR: Record<Cuadrante, string> = {
  estrella: "var(--confirmado)",
  caballo: "var(--marca)",
  joya: "var(--caducado)",
  hueso: "var(--grafito)",
  en_el_borde: "var(--contradicho)",
};

const corto = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function MatrizMargenVolumen({ t, config }: { t: TableroRentabilidad; config: ConfigEmpresa }) {
  const fmt = (n: number) => enMoneda(n, config, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
  const conPunto = t.productos.filter((p) => p.cuadrante && p.margen_unitario && p.unidades_mes);
  const sinDato = t.productos.filter((p) => t.matriz.sin_dato.includes(p.id));
  const um = t.umbrales.margen_unitario;
  const uv = t.umbrales.unidades_mes;

  return (
    <section aria-labelledby="matriz-titulo" className="flex flex-col gap-3">
      <h3 id="matriz-titulo" className="t-seccion">Margen × volumen</h3>
      {um == null || uv == null || conPunto.length === 0 ? (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>
          {t.faltan.find((f) => /comparar|matriz/.test(f)) ?? "Todavía no hay productos con precio, costo y cuánto se vende al mes: no hay matriz."}
        </p>
      ) : (
        <Grafico t={t} conPunto={conPunto} um={um} uv={uv} fmt={fmt} />
      )}
      {um != null && uv != null && (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>
          Umbral de margen: <b style={{ color: "var(--tinta)" }}>{fmt(um)}</b> por unidad · umbral de volumen: <b style={{ color: "var(--tinta)" }}>{cantidad(uv)}</b> al mes · con {t.umbrales.con_datos} de {t.umbrales.de} productos. {t.umbrales.regla}
        </p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Qué es cada cuadrante">
        {(Object.keys(CUADRANTE_TEXTO) as Cuadrante[]).map((c) => (
          <li key={c} className="dato-chico flex items-center gap-2">
            <i aria-hidden="true" className="muestra-color" style={{ background: COLOR[c] }} />
            <b>{CUADRANTE_TEXTO[c].nombre}</b>: {CUADRANTE_TEXTO[c].que_es} ({t.matriz[c].length})
          </li>
        ))}
      </ul>
      {sinDato.length > 0 && (
        <details>
          <summary className="plegado-enlace plegado-enlace--tenue">
            <SinDato texto={`${sinDato.length} sin dato para la matriz`} />
          </summary>
          <ul className="lista-editorial mt-2">
            {sinDato.slice(0, 100).map((p) => (
              <li key={p.id} style={{ padding: "8px 0" }}>
                <span className="t-dato fuerte">{p.nombre}</span>
                <span className="t-dato" style={{ color: "var(--grafito)", display: "block" }}>{p.motivos.join("; ") || "sin dato"}</span>
              </li>
            ))}
          </ul>
          {sinDato.length > 100 && <p className="t-dato" style={{ color: "var(--grafito)" }}>Y {sinDato.length - 100} más.</p>}
        </details>
      )}
    </section>
  );
}

function Grafico({ t, conPunto, um, uv, fmt }: { t: TableroRentabilidad; conPunto: TableroRentabilidad["productos"]; um: number; uv: number; fmt: (n: number) => string }) {
  const xMax = Math.max(uv, ...conPunto.map((p) => p.unidades_mes!.alto)) * 1.12 || 1;
  const yMin = Math.min(0, ...conPunto.map((p) => p.margen_unitario!.bajo));
  const yMax0 = Math.max(um, ...conPunto.map((p) => p.margen_unitario!.alto));
  const yMax = yMax0 > 0 ? yMax0 * 1.12 : 1;
  const sx = (v: number) => IZQ + (Math.max(0, v) / xMax) * W;
  const sy = (m: number) => ARR + (1 - (m - yMin) / (yMax - yMin || 1)) * H;
  const conNombre = conPunto.length <= 30;
  const descripcion = `${conPunto.length} productos. Umbral de margen ${fmt(um)} por unidad; umbral de volumen ${cantidad(uv)} al mes. ${(Object.keys(CUADRANTE_TEXTO) as Cuadrante[]).map((c) => `${CUADRANTE_TEXTO[c].nombre}: ${t.matriz[c].length}`).join(", ")}.`;

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} style={{ width: "100%", maxWidth: 760, height: "auto" }} role="img" aria-label={descripcion}>
      {/* Ejes */}
      <line x1={IZQ} y1={ARR + H} x2={IZQ + W} y2={ARR + H} stroke="var(--linea)" strokeWidth={1.5} />
      <line x1={IZQ} y1={ARR} x2={IZQ} y2={ARR + H} stroke="var(--linea)" strokeWidth={1.5} />
      {yMin < 0 && <line x1={IZQ} y1={sy(0)} x2={IZQ + W} y2={sy(0)} stroke="var(--linea)" strokeWidth={1} />}
      <text x={IZQ + W} y={ALTO - 14} textAnchor="end" fontSize={12} fill="var(--grafito)">Unidades al mes</text>
      <text x={14} y={ARR + H / 2} fontSize={12} fill="var(--grafito)" transform={`rotate(-90 14 ${ARR + H / 2})`} textAnchor="middle">Lo que deja cada una</text>
      <text x={IZQ - 6} y={ARR + 10} textAnchor="end" fontSize={11} fill="var(--grafito)">{fmt(yMax)}</text>
      {/* El origen es el «0» de abajo; el mínimo de lo que deja solo se rotula si es negativo (hay productos que restan). */}
      {yMin < 0 && <text x={IZQ - 6} y={ARR + H} textAnchor="end" fontSize={11} fill="var(--grafito)">{fmt(yMin)}</text>}
      <text x={IZQ} y={ARR + H + 16} fontSize={11} fill="var(--grafito)">0</text>
      <text x={IZQ + W} y={ARR + H + 16} textAnchor="end" fontSize={11} fill="var(--grafito)">{cantidad(xMax)}</text>

      {/* Cuadrantes */}
      <text x={IZQ + W - 6} y={ARR + 16} textAnchor="end" fontSize={13} fontWeight={700} fill="var(--confirmado)">{CUADRANTE_TEXTO.estrella.nombre}</text>
      <text x={IZQ + 8} y={ARR + 16} fontSize={13} fontWeight={700} fill="var(--caducado)">{CUADRANTE_TEXTO.joya.nombre}</text>
      <text x={IZQ + W - 6} y={ARR + H - 8} textAnchor="end" fontSize={13} fontWeight={700} fill="var(--marca)">{CUADRANTE_TEXTO.caballo.nombre}</text>
      <text x={IZQ + 8} y={ARR + H - 8} fontSize={13} fontWeight={700} fill="var(--grafito)">{CUADRANTE_TEXTO.hueso.nombre}</text>

      {/* Umbrales, rotulados con su valor */}
      <line x1={sx(uv)} y1={ARR} x2={sx(uv)} y2={ARR + H} stroke="var(--tinta)" strokeWidth={1.2} strokeDasharray="5 5" />
      <text x={sx(uv) + 4} y={ARR + H - 24} fontSize={11} fill="var(--tinta)">{`umbral: ${cantidad(uv)} al mes`}</text>
      <line x1={IZQ} y1={sy(um)} x2={IZQ + W} y2={sy(um)} stroke="var(--tinta)" strokeWidth={1.2} strokeDasharray="5 5" />
      <text x={IZQ + 6} y={sy(um) - 6} fontSize={11} fill="var(--tinta)">{`umbral: ${fmt(um)} por unidad`}</text>

      {/* Productos */}
      {conPunto.map((p) => {
        const m = p.margen_unitario!;
        const v = p.unidades_mes!;
        const c = p.cuadrante!;
        const cx = sx(centro(v));
        const cy = sy(centro(m));
        const titulo = `${p.nombre}: ${CUADRANTE_TEXTO[c].nombre}. Deja ${textoRango(m, fmt)} por unidad; ${textoRango(v, cantidad)} al mes.`;
        const enRango = !esExacto(m) || !esExacto(v);
        return (
          <g key={p.id}>
            <title>{titulo}</title>
            {enRango && (
              <rect
                x={Math.min(sx(v.bajo), sx(v.alto))}
                y={Math.min(sy(m.alto), sy(m.bajo))}
                width={Math.max(6, Math.abs(sx(v.alto) - sx(v.bajo)))}
                height={Math.max(6, Math.abs(sy(m.bajo) - sy(m.alto)))}
                fill={COLOR[c]}
                fillOpacity={0.1}
                stroke={COLOR[c]}
                strokeDasharray="4 3"
              />
            )}
            <circle cx={cx} cy={cy} r={5.5} fill={COLOR[c]} stroke="var(--papel)" strokeWidth={1.5} />
            {conNombre && (
              // Cerca del borde derecho el nombre se escribe hacia la izquierda del punto: si no, se cortaba.
              <text x={cx > ANCHO * 0.7 ? cx - 8 : cx + 8} y={cy - 7} fontSize={11} fill="var(--tinta)" textAnchor={cx > ANCHO * 0.7 ? "end" : "start"}>
                {corto(p.nombre)}
                {c === "en_el_borde" ? " · en el borde" : ""}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

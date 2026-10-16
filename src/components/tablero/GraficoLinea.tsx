"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * LÍNEA CON PEINE (estilo del 13-10-2026): una curva suave sobre barras verticales finas, y un globo que sigue
 * al dedo o al cursor (también con las flechas del teclado).
 * — La escala arranca en cero: las barras del peine miden de verdad, no exageran la diferencia.
 * — El dibujo se hace al tamaño real de la caja (ResizeObserver): las letras y los puntos no se estiran.
 * — Un punto sin dato no se inventa: la curva se corta y una banda rayada cubre el tramo, con su nombre.
 */
export type PuntoLinea = { corto: string; largo: string; valor: number | null };

const soles = (v: number) => `S/ ${Math.round(v).toLocaleString("es-PE")}`;
const corto = (v: number, formato: "soles" | "cuenta") =>
  formato === "soles" ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))) : String(Math.round(v));

export function GraficoLinea({
  puntos, formato, sufijo, etiqueta, referencia,
}: {
  puntos: PuntoLinea[];
  formato: "soles" | "cuenta";
  sufijo?: string;
  etiqueta: string;
  referencia?: { valor: number; texto: string } | null;
}) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const globoRef = useRef<HTMLDivElement>(null);
  const [caja, setCaja] = useState({ w: 560, h: 210 });
  const ultimo = puntos.map((p) => p.valor != null).lastIndexOf(true);
  const [actual, setActual] = useState(Math.max(0, ultimo));
  const [globoX, setGloboX] = useState<number | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCaja({ w: Math.max(240, e.contentRect.width), h: Math.max(140, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = caja.w, H = caja.h, izq = 38, der = 10, arr = 16, aba = 28;
  const valores = puntos.map((p) => p.valor).filter((v): v is number => v != null);
  const tope = Math.max(...valores, referencia?.valor ?? 0, 1) * 1.1;
  const x = (i: number) => (puntos.length === 1 ? (izq + W - der) / 2 : izq + (i * (W - izq - der)) / (puntos.length - 1));
  const y = (v: number) => arr + (1 - v / tope) * (H - arr - aba);
  const base = H - aba;

  // Peine: nueve barras por tramo, solo donde los dos extremos tienen dato.
  const pasos = Math.max(1, (puntos.length - 1) * 9);
  const peine: { k: number; x: number; y: number }[] = [];
  for (let k = 0; k <= pasos; k++) {
    const f = k / 9, i = Math.floor(f), d = f - i;
    const a = puntos[i]?.valor, b = puntos[Math.min(i + 1, puntos.length - 1)]?.valor;
    if (a == null || (b == null && d > 0)) continue;
    const v = b == null ? a : a + (b - a) * (0.5 - Math.cos(Math.PI * d) / 2);
    peine.push({ k, x: izq + (k * (W - izq - der)) / pasos, y: y(v) + 4 });
  }

  // Curva suave por tramos con dato.
  let camino = "";
  let abierto = false;
  puntos.forEach((p, i) => {
    if (p.valor == null) { abierto = false; return; }
    if (!abierto) { camino += `M${x(i)},${y(p.valor)}`; abierto = true; return; }
    const prev = puntos[i - 1].valor as number;
    const c = x(i - 1) + (x(i) - x(i - 1)) / 2;
    camino += ` C${c},${y(prev)} ${c},${y(p.valor)} ${x(i)},${y(p.valor)}`;
  });

  const p = puntos[actual];
  const texto = p ? (p.valor == null ? "sin dato" : formato === "soles" ? soles(p.valor) : `${p.valor}${sufijo ? ` ${sufijo}` : ""}`) : "";
  const cy = p?.valor != null ? y(p.valor) : arr + 40;

  // El globo nunca se sale de la tarjeta.
  useLayoutEffect(() => {
    const g = globoRef.current;
    if (!g || !p) return;
    const w = g.offsetWidth;
    setGloboX(Math.min(Math.max(x(actual), w / 2), W - w / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, W, texto]);

  const cerca = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return actual;
    const xx = clientX - r.left;
    let mejor = 0;
    puntos.forEach((_, i) => { if (Math.abs(x(i) - xx) < Math.abs(x(mejor) - xx)) mejor = i; });
    return mejor;
  };

  return (
    <div className="grafico-linea">
      <svg
        ref={svgRef}
        tabIndex={0}
        role="img"
        aria-label={`${etiqueta}. Usa las flechas para recorrer.`}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => setActual(cerca(e.clientX))}
        onPointerDown={(e) => setActual(cerca(e.clientX))}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { setActual((a) => Math.min(a + 1, puntos.length - 1)); e.preventDefault(); }
          if (e.key === "ArrowLeft") { setActual((a) => Math.max(a - 1, 0)); e.preventDefault(); }
        }}
      >
        <defs>
          <pattern id={`rayado-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1.5" height="6" fill="var(--raya)" />
          </pattern>
        </defs>
        <g className="eje">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const yy = arr + (1 - f) * (H - arr - aba);
            return (
              <g key={f}>
                <line x1={izq} x2={W - der} y1={yy} y2={yy} stroke="var(--linea)" />
                <text x={0} y={yy + 4}>{corto(f * tope, formato)}</text>
              </g>
            );
          })}
          {puntos.map((pt, i) => <text key={i} x={x(i)} y={H - 7} textAnchor="middle">{pt.corto}</text>)}
        </g>
        {puntos.map((pt, i) => {
          if (pt.valor != null) return null;
          const desde = i > 0 ? x(i - 1) : x(i) - 12, hasta = i < puntos.length - 1 ? x(i + 1) : x(i) + 12;
          return <rect key={`h${i}`} x={desde + 6} y={arr} width={Math.max(hasta - desde - 12, 6)} height={base - arr} rx={8} fill={`url(#rayado-${id})`} />;
        })}
        {peine.map((c) => (
          <line key={c.k} x1={c.x} x2={c.x} y1={c.y} y2={base} strokeWidth={1.4} stroke={Math.abs(c.k / 9 - actual) <= 0.5 ? "var(--azul-medio)" : "var(--azul-claro)"} />
        ))}
        {referencia && (
          <g>
            <line x1={izq} x2={W - der} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="var(--caducado)" strokeWidth={1.5} strokeDasharray="6 5" />
            <text x={izq + 4} y={y(referencia.valor) - 6} fontSize="12" fill="var(--caducado)">{referencia.texto}</text>
          </g>
        )}
        <path d={camino} fill="none" stroke="var(--marca)" strokeWidth={2.4} strokeLinecap="round" />
        {p && <line x1={x(actual)} x2={x(actual)} y1={arr} y2={base} stroke="var(--tinta)" strokeDasharray="2 3" opacity={0.35} />}
        {p?.valor != null && <circle cx={x(actual)} cy={y(p.valor)} r={5.5} fill="var(--papel)" stroke="var(--marca)" strokeWidth={2.5} />}
      </svg>
      {p && (
        <div ref={globoRef} className="globo" aria-live="polite" style={{ left: globoX ?? 0, top: cy, visibility: globoX == null ? "hidden" : "visible" }}>
          {p.largo} · <b>{texto}</b>
        </div>
      )}
    </div>
  );
}

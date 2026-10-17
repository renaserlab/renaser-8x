"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * LÍNEA CON PEINE (mundo «noche y perla», 17-10-2026): una curva fina de acero sobre púas verticales de un pelo, y un
 * globo que sigue al dedo o al cursor (también con las flechas del teclado).
 * — La escala arranca en cero: las barras del peine miden de verdad, no exageran la diferencia.
 * — El dibujo se hace al tamaño real de la caja (ResizeObserver): las letras y los puntos no se estiran.
 * — Un punto sin dato no se inventa: la curva se corta y una banda rayada cubre el tramo, con su nombre.
 * — La referencia («cubre gastos») es una guía, no un estado: va en grafito punteado, no en el color de «caducado».
 * — El globo se mueve con transform (tablero.css: solo mientras la persona recorre el gráfico, nunca al cargar).
 */
export type PuntoLinea = { corto: string; largo: string; valor: number | null };

const soles = (v: number) => `S/ ${Math.round(v).toLocaleString("es-PE")}`;
const corto = (v: number, formato: "soles" | "cuenta") =>
  formato === "soles" && v >= 1000 ? `${Number((v / 1000).toFixed(1)).toLocaleString("es-PE")}k` : Math.round(v).toLocaleString("es-PE");

/**
 * El eje con números redondos (0, 10k, 20k… o 0, 1, 2, 3): como mucho cinco tramos y solo enteros, para que ninguna
 * marca se repita (antes un máximo de 2.2 se partía en «0, 1, 1, 2, 2»).
 */
export function escalaEje(maximo: number, enteros: boolean): { paso: number; tope: number } {
  const m = Math.max(maximo, enteros ? 1 : 0.0001);
  const base = Math.pow(10, Math.floor(Math.log10(m / 5)));
  for (const f of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const paso = Number((f * base).toPrecision(6));
    if (enteros && !Number.isInteger(paso)) continue;
    const tramos = Math.ceil(m / paso - 1e-9);
    if (tramos <= 5) return { paso, tope: Math.max(1, tramos) * paso };
  }
  return { paso: m / 4, tope: m };
}

/** Cada cuántos meses se escribe la marca del eje x para que no se monten (la última, la más reciente, siempre). */
export function saltoEtiquetas(etiquetas: string[], ancho: number): number {
  if (etiquetas.length < 2) return 1;
  const largo = Math.max(...etiquetas.map((e) => e.length)) * 6.4 + 10;
  const hueco = ancho / (etiquetas.length - 1);
  return Math.max(1, Math.ceil(largo / hueco));
}

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
  const { paso: pasoEje, tope } = escalaEje(Math.max(...valores, referencia?.valor ?? 0, 1) * 1.05, true);
  const marcasY = Array.from({ length: Math.round(tope / pasoEje) + 1 }, (_, k) => k * pasoEje);
  const salto = saltoEtiquetas(puntos.map((p) => p.corto), W - izq - der);
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
          {marcasY.map((v) => {
            const yy = y(v);
            return (
              <g key={v}>
                <line x1={izq} x2={W - der} y1={yy} y2={yy} stroke="var(--linea)" shapeRendering="crispEdges" />
                <text x={0} y={yy + 4}>{corto(v, formato)}</text>
              </g>
            );
          })}
          {puntos.map((pt, i) =>
            (puntos.length - 1 - i) % salto === 0 ? (
              <text key={i} x={x(i)} y={H - 7} textAnchor={i === 0 && puntos.length > 1 ? "start" : i === puntos.length - 1 && puntos.length > 1 ? "end" : "middle"}>{pt.corto}</text>
            ) : null
          )}
        </g>
        {puntos.map((pt, i) => {
          if (pt.valor != null) return null;
          const desde = i > 0 ? x(i - 1) : x(i) - 12, hasta = i < puntos.length - 1 ? x(i + 1) : x(i) + 12;
          return <rect key={`h${i}`} x={desde + 6} y={arr} width={Math.max(hasta - desde - 12, 6)} height={base - arr} rx={8} fill={`url(#rayado-${id})`} />;
        })}
        {peine.map((c) => (
          <line key={c.k} x1={c.x} x2={c.x} y1={c.y} y2={base} strokeWidth={1} shapeRendering="crispEdges" stroke={Math.abs(c.k / 9 - actual) <= 0.5 ? "var(--acero-medio)" : "var(--acero-claro)"} />
        ))}
        {referencia && (
          <g>
            <line x1={izq} x2={W - der} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="var(--grafito)" strokeWidth={1} strokeDasharray="4 4" />
            <text className="referencia" x={izq + 4} y={y(referencia.valor) - 6} fontSize="11.5" fill="var(--grafito)">{referencia.texto}</text>
          </g>
        )}
        <path d={camino} fill="none" stroke="var(--acero-fuerte)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {p && <line x1={x(actual)} x2={x(actual)} y1={arr} y2={base} stroke="var(--tinta)" strokeDasharray="2 3" opacity={0.25} />}
        {p?.valor != null && <circle cx={x(actual)} cy={y(p.valor)} r={5} fill="var(--blanco)" stroke="var(--acero-fuerte)" strokeWidth={2} />}
      </svg>
      {p && (
        <div
          ref={globoRef}
          className="globo"
          aria-live="polite"
          style={{ transform: `translate(${globoX ?? 0}px, ${cy}px) translate(-50%, -130%)`, visibility: globoX == null ? "hidden" : "visible" }}
        >
          {p.largo} · <b>{texto}</b>
        </div>
      )}
    </div>
  );
}

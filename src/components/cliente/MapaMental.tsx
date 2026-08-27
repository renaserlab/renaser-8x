"use client";
import { useRef } from "react";

type Pilar = { pilar: string; nombre: string; estado: string };

const COLOR: Record<string, string> = { solido: "#1f8a5b", mejorable: "#b8860b", critico: "#c23a2b", desconocido: "#8e8e93" };
const SUAVE: Record<string, string> = { solido: "#e8f5ee", mejorable: "#faf3e0", critico: "#fdecea", desconocido: "#f2f2f4" };

/** Parte un texto en hasta 2 líneas de ~n caracteres, sin cortar palabras. */
function dosLineas(t: string, n: number): string[] {
  if (t.length <= n) return [t];
  const corte = t.lastIndexOf(" ", n);
  const a = t.slice(0, corte > 8 ? corte : n);
  let b = t.slice(a.length).trim();
  if (b.length > n) b = b.slice(0, n - 1) + "…";
  return [a, b];
}

/**
 * EL MAPA DE TU EMPRESA — mapa mental descargable (pedido de Kelin: visual, fácil, para
 * imprimir y pegar en la pared). Solo datos reales: la empresa al centro, sus 4 áreas con su
 * color de estado, lo que más la frena y sus fortalezas. Descarga como imagen PNG con un toque.
 */
export function MapaMental({ empresa, pilares, restriccion }: { empresa: string; pilares: Pilar[]; restriccion: string | null }) {
  const ref = useRef<SVGSVGElement>(null);

  const descargar = () => {
    const svg = ref.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `mapa-${empresa.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  };

  const P = [
    { x: 180, y: 130 }, // arriba izquierda
    { x: 720, y: 130 }, // arriba derecha
    { x: 180, y: 360 }, // abajo izquierda
    { x: 720, y: 360 }, // abajo derecha
  ];
  const cx = 450, cy = 245;
  const lineasEmpresa = dosLineas(empresa, 20);
  const lineasRestriccion = restriccion ? dosLineas(restriccion, 42) : [];

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="t-etiqueta">El mapa de tu empresa</p>
        <button type="button" onClick={descargar} className="boton boton--secundario" style={{ minHeight: 36, fontSize: 13 }}>
          Descargar imagen
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg ref={ref} viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", minWidth: 520, fontFamily: "system-ui, sans-serif" }} role="img" aria-label={`Mapa de ${empresa}`}>
          <rect width="900" height="600" fill="#ffffff" />
          {/* ramas hacia las 4 áreas */}
          {P.map((p, i) => (
            <path key={i} d={`M${cx},${cy} Q${(cx + p.x) / 2},${(cy + p.y) / 2 - 18} ${p.x + 90},${p.y + 28}`} fill="none" stroke="#d5d5da" strokeWidth="2" />
          ))}
          {/* nodos de área */}
          {pilares.slice(0, 4).map((pl, i) => {
            const p = P[i];
            const c = COLOR[pl.estado] ?? COLOR.desconocido;
            return (
              <g key={pl.pilar}>
                <rect x={p.x} y={p.y} width="180" height="58" rx="14" fill={SUAVE[pl.estado] ?? SUAVE.desconocido} stroke={c} strokeWidth="1.5" />
                <text x={p.x + 90} y={p.y + 25} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1d1d1f">{pl.nombre}</text>
                <text x={p.x + 90} y={p.y + 44} textAnchor="middle" fontSize="12" fill={c} fontWeight="600">
                  {pl.estado === "solido" ? "Fortaleza" : pl.estado === "mejorable" ? "Requiere atención" : pl.estado === "critico" ? "Crítico" : "Por conocer"}
                </text>
              </g>
            );
          })}
          {/* centro */}
          <ellipse cx={cx} cy={cy} rx="130" ry="52" fill="#eef4fb" stroke="#0a68c4" strokeWidth="2" />
          {lineasEmpresa.map((l, i) => (
            <text key={i} x={cx} y={cy + (lineasEmpresa.length === 1 ? 6 : i === 0 ? -4 : 16)} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1d1d1f">{l}</text>
          ))}
          {/* lo que más frena */}
          {restriccion && (
            <g>
              <path d={`M${cx},${cy + 52} L${cx},480`} fill="none" stroke="#c23a2b" strokeWidth="2" markerEnd="url(#flecha)" />
              <defs>
                <marker id="flecha" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="#c23a2b" strokeWidth="1.6" />
                </marker>
              </defs>
              <rect x={cx - 220} y={488} width="440" height={lineasRestriccion.length > 1 ? 64 : 48} rx="14" fill="#fdecea" stroke="#c23a2b" strokeWidth="1.5" />
              <text x={cx} y={506} textAnchor="middle" fontSize="11" fontWeight="700" fill="#c23a2b" letterSpacing="0.5">LO QUE MÁS TE ESTÁ FRENANDO</text>
              {lineasRestriccion.map((l, i) => (
                <text key={i} x={cx} y={524 + i * 16} textAnchor="middle" fontSize="13" fill="#1d1d1f">{l}</text>
              ))}
            </g>
          )}
        </svg>
      </div>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Hecho solo con tu información. Descárgalo, imprímelo, pégalo donde tu equipo lo vea.</p>
    </section>
  );
}

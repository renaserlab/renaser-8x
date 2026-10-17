"use client";
import { useRef } from "react";

type Pilar = { pilar: string; nombre: string; estado: string; problema?: string | null; accion?: string | null };

/**
 * ESPEJO DE src/design/tokens.css (noche y perla, 17-10-2026). El mapa se descarga como imagen: dentro de un SVG pasado
 * a PNG no se resuelven las variables de CSS, así que los colores van escritos aquí con su nombre del sistema. Si cambia
 * un token, cambia aquí.
 */
const T = {
  tinta: "#0f1a2e",
  blanco: "#ffffff",
  lineaFuerte: "#cfd3da",
  aceroFuerte: "#2c4c78",
  aceroVelo: "#e9eef5",
  confirmado: "#2b6b52",
  confirmadoVelo: "#e6f0ea",
  caducado: "#94561f",
  caducadoVelo: "#f6ece1",
  contradicho: "#a5372c",
  contradichoVelo: "#f7e7e4",
  sinVerificar: "#5d6980",
  perlaHonda: "#ebe9e3",
} as const;
const COLOR: Record<string, string> = { solido: T.confirmado, mejorable: T.caducado, critico: T.contradicho, desconocido: T.sinVerificar };
const SUAVE: Record<string, string> = { solido: T.confirmadoVelo, mejorable: T.caducadoVelo, critico: T.contradichoVelo, desconocido: T.perlaHonda };
/** En pantalla, la letra de la interfaz; en la imagen descargada, la del sistema (una imagen no carga fuentes web). */
const LETRA_IMAGEN = "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif";
const ETIQUETA: Record<string, string> = { solido: "Fortaleza", mejorable: "Requiere atención", critico: "Crítico", desconocido: "Por conocer" };

/** Parte un texto en hasta `max` líneas de ~n caracteres, sin cortar palabras. */
function lineas(t: string, n: number, max: number): string[] {
  const out: string[] = [];
  let resto = t.trim();
  while (resto && out.length < max) {
    if (resto.length <= n) { out.push(resto); break; }
    const corte = resto.lastIndexOf(" ", n);
    const linea = resto.slice(0, corte > 8 ? corte : n);
    out.push(out.length === max - 1 && resto.length > linea.length ? linea.slice(0, n - 1) + "…" : linea);
    resto = resto.slice(linea.length).trim();
  }
  return out;
}

/**
 * EL MAPA DE TU EMPRESA — plan de acción visual descargable (pedido de Kelin):
 * cada área con su color de estado, y en las que tienen problema: POR QUÉ (el hallazgo
 * principal) y HAZ ESTO (el primer movimiento del dueño). Solo datos reales.
 */
export function MapaMental({ empresa, pilares, restriccion }: { empresa: string; pilares: Pilar[]; restriccion: string | null }) {
  const ref = useRef<SVGSVGElement>(null);

  const descargar = () => {
    const svg = ref.current;
    if (!svg) return;
    const copia = svg.cloneNode(true) as SVGSVGElement;
    copia.style.fontFamily = LETRA_IMAGEN;
    const xml = new XMLSerializer().serializeToString(copia);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1560;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = T.blanco;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `mapa-${empresa.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  };

  // 4 grupos en las esquinas: nodo del área + hoja con POR QUÉ / HAZ ESTO debajo.
  const G = [
    { nx: 60, ny: 70 },
    { nx: 720, ny: 70 },
    { nx: 60, ny: 430 },
    { nx: 720, ny: 430 },
  ];
  const cx = 480, cy = 270;
  const lineasEmpresa = lineas(empresa, 20, 2);
  const lineasRestriccion = restriccion ? lineas(restriccion, 46, 2) : [];

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="t-etiqueta">El mapa de tu empresa — qué pasa y qué hacer</p>
        <button type="button" onClick={descargar} className="boton boton--secundario boton--chico">
          Descargar imagen
        </button>
      </div>
      <div className="tabla-desliza">
        <svg ref={ref} viewBox="0 0 960 780" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", minWidth: 560, fontFamily: "var(--font-ui)" }} role="img" aria-label={`Mapa de ${empresa}: problemas principales y qué hacer en cada área`}>
        <rect width="960" height="780" fill={T.blanco} />
        {G.map((g, i) => (
          <path key={i} d={`M${cx},${cy} Q${(cx + g.nx + 90) / 2},${(cy + g.ny + 29) / 2} ${g.nx + 90},${g.ny + (g.ny < cy ? 58 : 0)}`} fill="none" stroke={T.lineaFuerte} strokeWidth="1.5" />
        ))}
        {pilares.slice(0, 4).map((pl, i) => {
          const g = G[i];
          const c = COLOR[pl.estado] ?? COLOR.desconocido;
          const problema = pl.problema ? lineas(pl.problema, 36, 2) : [];
          const accion = pl.accion ? lineas(pl.accion, 36, 2) : [];
          const hojaAlto = (problema.length + accion.length) * 15 + (problema.length ? 18 : 0) + (accion.length ? 18 : 0) + 14;
          const hojaY = g.ny < cy ? g.ny + 66 : g.ny - hojaAlto - 8;
          return (
            <g key={pl.pilar}>
              <rect x={g.nx} y={g.ny} width="180" height="58" rx="14" fill={SUAVE[pl.estado] ?? SUAVE.desconocido} stroke={c} strokeWidth="1" />
              <text x={g.nx + 90} y={g.ny + 25} textAnchor="middle" fontSize="16" fontWeight="650" fill={T.tinta}>{pl.nombre}</text>
              <text x={g.nx + 90} y={g.ny + 44} textAnchor="middle" fontSize="12" fill={c} fontWeight="600">{ETIQUETA[pl.estado] ?? pl.estado}</text>
              {(problema.length > 0 || accion.length > 0) && (
                <g>
                  <line x1={g.nx + 90} y1={g.ny < cy ? g.ny + 58 : g.ny} x2={g.nx + 90} y2={g.ny < cy ? hojaY : hojaY + hojaAlto} stroke={c} strokeWidth="1.5" strokeDasharray="3 3" />
                  <rect x={g.nx - 30} y={hojaY} width="240" height={hojaAlto} rx="12" fill={T.blanco} stroke={T.lineaFuerte} strokeWidth="1" />
                  {problema.length > 0 && (
                    <>
                      <text x={g.nx - 18} y={hojaY + 18} fontSize="10.5" fontWeight="700" fill={c} letterSpacing="1.2">POR QUÉ</text>
                      {problema.map((l, j) => (
                        <text key={"p" + j} x={g.nx - 18} y={hojaY + 33 + j * 15} fontSize="11.5" fill={T.tinta}>{l}</text>
                      ))}
                    </>
                  )}
                  {accion.length > 0 && (
                    <>
                      <text x={g.nx - 18} y={hojaY + 18 + (problema.length ? problema.length * 15 + 18 : 0)} fontSize="10.5" fontWeight="700" fill={T.confirmado} letterSpacing="1.2">HAZ ESTO</text>
                      {accion.map((l, j) => (
                        <text key={"a" + j} x={g.nx - 18} y={hojaY + 33 + (problema.length ? problema.length * 15 + 18 : 0) + j * 15} fontSize="11.5" fill={T.tinta}>{l}</text>
                      ))}
                    </>
                  )}
                </g>
              )}
            </g>
          );
        })}
        <ellipse cx={cx} cy={cy} rx="130" ry="52" fill={T.aceroVelo} stroke={T.aceroFuerte} strokeWidth="1.5" />
        {lineasEmpresa.map((l, i) => (
          <text key={i} x={cx} y={cy + (lineasEmpresa.length === 1 ? 6 : i === 0 ? -4 : 16)} textAnchor="middle" fontSize="18" fontWeight="700" fill={T.tinta}>{l}</text>
        ))}
        {restriccion && (
          <g>
            <path d={`M${cx},${cy + 52} L${cx},668`} fill="none" stroke={T.contradicho} strokeWidth="1.5" />
            <path d={`M${cx - 6},660 L${cx},670 L${cx + 6},660`} fill="none" stroke={T.contradicho} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x={cx - 235} y={676} width="470" height={lineasRestriccion.length > 1 ? 68 : 52} rx="14" fill={T.contradichoVelo} stroke={T.contradicho} strokeWidth="1" />
            <text x={cx} y={696} textAnchor="middle" fontSize="11" fontWeight="700" fill={T.contradicho} letterSpacing="1.2">LO QUE MÁS TE ESTÁ FRENANDO</text>
            {lineasRestriccion.map((l, i) => (
              <text key={i} x={cx} y={714 + i * 16} textAnchor="middle" fontSize="13" fill={T.tinta}>{l}</text>
            ))}
          </g>
        )}
        </svg>
      </div>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Hecho solo con tu información. Descárgalo, imprímelo, pégalo donde tu equipo lo vea.</p>
    </section>
  );
}

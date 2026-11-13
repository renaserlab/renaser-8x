/**
 * CALCA EL LOGO 8X DESDE LA IMAGEN DE LA MARCA. Entra moodboard-8x.webp, sale el contorno que usa
 * src/components/base/logo-8x-trazo.ts.
 *
 * POR QUÉ EXISTE. El 8X es un monograma de una sola cinta: el 8 se tuerce y sigue hacia la X, y los dos
 * brazos acaban en punta. Dibujarlo a mano salió mal dos veces —una plumilla simulada que deformaba el 8,
 * y después la palabra «8X» compuesta en Bodoni Moda, que tiene una X de lados rectos y ningún enlace
 * entre las dos formas—. Esto no interpreta el logo: lo calca.
 *
 * CÓMO SEPARA EL TRAZO DE LA LUZ. La cinta es plata azulada y el resplandor del suelo es cálido y casi sin
 * azul, así que el umbral va sobre el CANAL AZUL. Dos correcciones que costaron encontrarlas:
 *  - donde la X pasa por detrás del 8 la cinta queda en sombra y su azul se desploma; ahí la sostiene la
 *    luminancia, y por eso arriba mandan los dos juntos;
 *  - abajo pasa lo contrario: el resplandor del pie es luz pura y la luminancia lo dejaría entrar pegado
 *    al 8, así que de DESDE_Y hacia abajo decide el azul solo, con el umbral subiendo hasta UMBRAL_ABAJO.
 *
 * Después: componentes conectados para tirar motas, relleno de agujeros chicos, marching squares para los
 * contornos, Chaikin y Douglas-Peucker para suavizar, y Catmull-Rom a cúbicas de Bézier. Salen TRES
 * contornos —el exterior y los dos ojos del 8—, y por eso el camino se pinta con fill-rule="evenodd".
 *
 * Uso: node diseno/marca/calcar-logo.mjs            (reescribe src/components/base/logo-8x-trazo.ts)
 *      node diseno/marca/calcar-logo.mjs --previa   (además deja PNG de prueba en diseno/render/salida/)
 *
 * Si algún día llega el archivo vectorial original del diseñador, esto sobra: se reemplaza el trazo y ya.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(RAIZ, "diseno/marca/moodboard-8x.webp");
const DESTINO = path.join(RAIZ, "src/components/base/logo-8x-trazo.ts");
const PREVIAS = path.join(RAIZ, "diseno/render/salida");

/** El panel del moodboard donde está el logo grande, en píxeles de la imagen original (1536×1024). */
const HERO = { left: 150, top: 40, width: 700, height: 540 };
const ESCALA = 4;          // cuánto se agranda antes de umbralar: más = contorno más fino
const UMBRAL_AZUL = 80;    // arriba
const UMBRAL_LUZ = 70;     // arriba, en luminancia, para la cinta en sombra
const DESDE_Y = 870 / 1080; // desde aquí abajo manda el azul solo
const UMBRAL_ABAJO = 200;  // hasta aquí sube su umbral, para despegar el resplandor del pie
const CORTE_Y = 958 / 1080; // debajo de esto solo hay reflejo del suelo
const MIN_AREA = 0.0016;   // manchas y agujeros menores a esta fracción del glifo se tiran
const EPS = ESCALA * 0.42; // cuánto simplifica Douglas-Peucker

// ─── 1. la máscara ─────────────────────────────────────────────────────────────
const { data, info } = await sharp(SRC).extract(HERO).resize({ width: HERO.width * ESCALA, kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const corte = Math.round(CORTE_Y * H);
const desde = Math.round(DESDE_Y * H);
const m = new Uint8Array(W * H);
for (let y = 0; y < corte; y++) {
  const t = y <= desde ? 0 : (y - desde) / Math.max(1, corte - desde);
  const u = UMBRAL_AZUL + (UMBRAL_ABAJO - UMBRAL_AZUL) * t;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const azul = data[i + 2] >= u;
    const luz = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] >= UMBRAL_LUZ;
    m[y * W + x] = (t === 0 ? azul || luz : azul) ? 1 : 0;
  }
}

// ─── 2. componentes y agujeros ─────────────────────────────────────────────────
function etiquetar(src, valor) {
  const lab = new Int32Array(W * H).fill(-1);
  const areas = [];
  const pila = [];
  for (let p = 0; p < W * H; p++) {
    if (src[p] !== valor || lab[p] >= 0) continue;
    const id = areas.length;
    let area = 0;
    pila.push(p);
    lab[p] = id;
    while (pila.length) {
      const q = pila.pop();
      area++;
      const x = q % W, y = (q / W) | 0;
      if (x > 0 && src[q - 1] === valor && lab[q - 1] < 0) { lab[q - 1] = id; pila.push(q - 1); }
      if (x < W - 1 && src[q + 1] === valor && lab[q + 1] < 0) { lab[q + 1] = id; pila.push(q + 1); }
      if (y > 0 && src[q - W] === valor && lab[q - W] < 0) { lab[q - W] = id; pila.push(q - W); }
      if (y < H - 1 && src[q + W] === valor && lab[q + W] < 0) { lab[q + W] = id; pila.push(q + W); }
    }
    areas.push(area);
  }
  return { lab, areas };
}

const comp = etiquetar(m, 1);
const mayor = comp.areas.indexOf(Math.max(...comp.areas));
const minArea = Math.round(comp.areas[mayor] * MIN_AREA);
for (let p = 0; p < W * H; p++) if (m[p] && comp.lab[p] !== mayor && comp.areas[comp.lab[p]] < minArea) m[p] = 0;

const fondo = etiquetar(m, 0);
const deBorde = new Set();
for (let x = 0; x < W; x++) { deBorde.add(fondo.lab[x]); deBorde.add(fondo.lab[(H - 1) * W + x]); }
for (let y = 0; y < H; y++) { deBorde.add(fondo.lab[y * W]); deBorde.add(fondo.lab[y * W + W - 1]); }
for (let p = 0; p < W * H; p++) if (!m[p] && !deBorde.has(fondo.lab[p]) && fondo.areas[fondo.lab[p]] < minArea) m[p] = 1;

// ─── 3. contornos (marching squares sobre el borde de píxel) ───────────────────
const dentro = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0);
const segs = new Map();
const k = (x, y) => `${x},${y}`;
const unir = (a, b) => { const c = k(a[0], a[1]); if (!segs.has(c)) segs.set(c, []); segs.get(c).push(b); };
for (let y = -1; y < H; y++) {
  for (let x = -1; x < W; x++) {
    const caso = (dentro(x, y) << 3) | (dentro(x + 1, y) << 2) | (dentro(x + 1, y + 1) << 1) | dentro(x, y + 1);
    if (caso === 0 || caso === 15) continue;
    const N = [x + 0.5, y], E = [x + 1, y + 0.5], S = [x + 0.5, y + 1], O = [x, y + 0.5];
    // El interior queda a la izquierda del avance. Las dos sillas (5 y 10) se parten siempre igual.
    switch (caso) {
      case 1: unir(S, O); break;
      case 2: unir(E, S); break;
      case 3: unir(E, O); break;
      case 4: unir(N, E); break;
      case 5: unir(N, O); unir(S, E); break;
      case 6: unir(N, S); break;
      case 7: unir(N, O); break;
      case 8: unir(O, N); break;
      case 9: unir(S, N); break;
      case 10: unir(O, S); unir(E, N); break;
      case 11: unir(E, N); break;
      case 12: unir(O, E); break;
      case 13: unir(S, E); break;
      case 14: unir(O, S); break;
    }
  }
}
const bucles = [];
const usados = new Set();
for (const [clave, destinos] of segs) {
  for (let i = 0; i < destinos.length; i++) {
    if (usados.has(`${clave}>${i}`)) continue;
    const bucle = [];
    let p = clave.split(",").map(Number);
    let idx = i;
    for (let paso = 0; paso < 4_000_000; paso++) {
      const sal = segs.get(k(p[0], p[1]));
      if (!sal) break;
      const ar = `${k(p[0], p[1])}>${Math.min(idx, sal.length - 1)}`;
      if (usados.has(ar)) break;
      usados.add(ar);
      bucle.push(p);
      p = sal[Math.min(idx, sal.length - 1)];
      if (!segs.get(k(p[0], p[1]))) break;
      idx = 0;
      if (k(p[0], p[1]) === clave) break;
    }
    if (bucle.length > 24) bucles.push(bucle);
  }
}

// ─── 4. suavizar, simplificar, a curvas ────────────────────────────────────────
const chaikin = (pts) => {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
};
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1e-9);
  };
  const guardar = new Uint8Array(pts.length);
  guardar[0] = guardar[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let peor = -1, d = eps;
    for (let t = i + 1; t < j; t++) { const dd = dist(pts[t], pts[i], pts[j]); if (dd > d) { d = dd; peor = t; } }
    if (peor >= 0) { guardar[peor] = 1; pila.push([i, peor], [peor, j]); }
  }
  return pts.filter((_, i) => guardar[i]);
}
const limpios = bucles.map((b) => rdp(chaikin(chaikin(b)), EPS));

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const b of limpios) for (const [x, y] of b) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
const ALTO = 1000;
const esc = ALTO / (maxY - minY);
const ANCHO = Number(((maxX - minX) * esc).toFixed(1));
const tx = (x) => (x - minX) * esc;
const ty = (y) => (y - minY) * esc;

/** Catmull-Rom cerrado a cúbicas de Bézier: curvas suaves con pocos puntos. */
function aCurvas(pts) {
  const n = pts.length;
  const P = pts.map(([x, y]) => [tx(x), ty(y)]);
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}`;
    d += ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}`;
    d += ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}
const d = limpios.map(aCurvas).join("");
console.log(`contornos: ${limpios.length} (deben ser 3: el de fuera y los dos ojos del 8)`);
console.log(`caja ${ANCHO} × ${ALTO} · ${limpios.reduce((a, b) => a + b.length, 0)} puntos · ${d.length} caracteres`);
if (limpios.length !== 3) console.error("AVISO: no salieron tres contornos. Revisa los umbrales antes de escribir el trazo.");

// ─── 5. escribir ───────────────────────────────────────────────────────────────
writeFileSync(DESTINO, `/**
 * EL TRAZO DEL 8X · CALCADO DE LA IMAGEN DE LA MARCA, NO DIBUJADO A MANO.
 *
 * Esto no es una interpretación del logo: es su contorno, sacado de diseno/marca/moodboard-8x.webp.
 * El 8X es un MONOGRAMA de una sola cinta —el 8 se tuerce y sigue hacia la X, y los dos brazos acaban
 * en punta—, no las letras «8» y «X» puestas una al lado de la otra.
 *
 * ESTE ARCHIVO LO ESCRIBE UN GUIÓN. No se edita a mano: se vuelve a generar con
 *   node diseno/marca/calcar-logo.mjs
 * que explica en su cabecera cómo separa el trazo de la luz y por qué.
 *
 * Son TRES contornos —el exterior y los dos ojos del 8— en un solo camino, así que se pinta con
 * fill-rule="evenodd". La caja va normalizada a 1000 de alto.
 */
export const TRAZO_8X = {
  /** Ancho de la caja cuando el alto es 1000. */
  ancho: ${ANCHO},
  alto: ${ALTO},
  d: ${JSON.stringify(d)},
} as const;
`);
console.log("escrito", path.relative(RAIZ, DESTINO));

if (process.argv.includes("--previa")) {
  mkdirSync(PREVIAS, { recursive: true });
  for (const [nombre, alto, fondo, tinta] of [["logo-previa-512.png", 512, "#0b1426", "#eef1f6"], ["logo-previa-28.png", 28, "#f5f3ee", "#0f1a2e"]]) {
    const w = Math.round((ANCHO / ALTO) * alto);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${alto}" viewBox="0 0 ${ANCHO} ${ALTO}"><path fill="${tinta}" fill-rule="evenodd" d="${d}"/></svg>`;
    await sharp(Buffer.from(svg)).flatten({ background: fondo }).png().toFile(path.join(PREVIAS, nombre));
  }
  console.log("previas en diseno/render/salida/");
}

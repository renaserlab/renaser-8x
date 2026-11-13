/**
 * COMPILA LA HOJA DE ESTILOS DEL ARNÉS: src/app/globals.css (Tailwind v4 + los CSS del sistema) →
 * diseno/render/salida/app-nuevo.css, que es la que cargan los HTML que pinta el arnés.
 *
 * POR QUÉ ES IMPORTANTE QUE ESTO CORRA SOLO. Hasta el 29-10-2026 había que acordarse de compilarla a mano,
 * y nadie se acordaba: ese día la hoja del arnés llevaba cuatro horas de retraso, así que las capturas
 * enseñaban el diseño VIEJO mientras el código ya tenía el nuevo. Un arnés que miente es peor que no tener
 * arnés: se revisa el diseño contra una foto de ayer y se da por bueno lo que ya no existe. Por eso ahora
 * lo llama `globalSetup` en diseno/render/vitest.config.mts, antes de cualquier prueba del arnés.
 *
 * Uso suelto: node diseno/render/compilar-css.cjs
 */
const path = require("path");
const fs = require("fs");

const raiz = path.resolve(__dirname, "../..");
const entrada = path.join(raiz, "src/app/globals.css");
const salida = path.join(raiz, "diseno/render/salida/app-nuevo.css");

async function compilar() {
  const postcss = require("postcss");
  const tailwind = require("@tailwindcss/postcss");
  const r = await postcss([tailwind({ base: raiz })]).process(fs.readFileSync(entrada, "utf8"), { from: entrada, to: salida });
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, r.css);
  // Dos comprobaciones baratas de que la hoja salió entera: una clase del sistema de vistas y una de los tokens.
  const entera = r.css.includes(".empresa-marco") && r.css.includes("--noche");
  console.log(`[arnés] app-nuevo.css: ${r.css.length} bytes · completa: ${entera ? "sí" : "NO"}`);
  if (!entera) throw new Error("app-nuevo.css salió incompleta: falta .empresa-marco o --noche");
}

module.exports = { compilar, salida };

if (require.main === module) compilar().catch((e) => { console.error(e); process.exit(1); });

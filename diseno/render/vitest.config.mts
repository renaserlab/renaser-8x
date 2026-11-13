import { defineConfig } from "vitest/config";
import path from "path";

// Arnés de diseño: pinta las páginas reales con datos de ejemplo, sin base ni sesión. No es parte de la suite.
const raiz = path.resolve(__dirname, "../..");
export default defineConfig({
  root: raiz,
  esbuild: { jsx: "automatic" },
  test: {
    include: ["diseno/render/**/*.test.tsx"],
    environment: "node",
    // La hoja de estilos del arnés se compila ANTES de pintar nada. Antes había que acordarse a mano y el
    // 29-10-2026 se descubrió que llevaba horas de retraso: las capturas enseñaban el diseño viejo mientras
    // el código ya tenía el nuevo, así que se revisaba contra una foto de ayer. Un arnés que miente es peor
    // que no tener arnés. Ver diseno/render/compilar-css.cjs.
    globalSetup: [path.resolve(__dirname, "preparar.mts")],
  },
  resolve: { alias: { "@": path.resolve(raiz, "src") } },
});

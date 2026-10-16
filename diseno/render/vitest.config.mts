import { defineConfig } from "vitest/config";
import path from "path";

// Arnés de diseño: pinta las páginas reales con datos de ejemplo, sin base ni sesión. No es parte de la suite.
const raiz = path.resolve(__dirname, "../..");
export default defineConfig({
  root: raiz,
  esbuild: { jsx: "automatic" },
  test: { include: ["diseno/render/**/*.test.tsx"], environment: "node" },
  resolve: { alias: { "@": path.resolve(raiz, "src") } },
});

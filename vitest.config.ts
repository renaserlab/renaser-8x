import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Las pruebas de tests/sql levantan cada una un Postgres embebido (WASM): con un proceso por núcleo, una máquina
    // de 6 GB se quedó sin memoria («Zone Allocation failed») y varios archivos ni llegaron a reportar. Cuatro a la
    // vez caben; VITEST_MAX_WORKERS lo cambia donde sobre memoria.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});

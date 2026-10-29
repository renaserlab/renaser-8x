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
    /**
     * EL LÍMITE POR PRUEBA SUBE DE LOS CINCO SEGUNDOS QUE VIENEN DE FÁBRICA.
     *
     * El 20-10-2026 la suite empezó a fallar distinto en cada corrida: cinco archivos sin relación
     * entre sí —la cuota de IA, la cola, los números del portal, el plan y la de seguridad— caían
     * con «Test timed out in 5000ms», y no siempre los mismos. Corridos solos, pasaban. Lo que
     * cambiaba era la carga de la máquina: la misma suite tardaba 106 segundos con la máquina
     * libre y 290 con cuatro procesos peleándose por los núcleos, y varias pruebas pintan una
     * página entera o levantan un Postgres embebido.
     *
     * Veinte segundos no esconden nada: ninguna de estas pruebas tarda eso cuando el sistema
     * funciona, así que una que lo alcance sigue siendo una señal de verdad. Lo que se deja de
     * tener es una suite que dice rojo según lo ocupada que esté la máquina, que es peor que una
     * lenta: enseña a mirar el rojo y encogerse de hombros.
     */
    testTimeout: 20_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});

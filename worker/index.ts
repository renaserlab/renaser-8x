// Arranque del worker: node --env-file=.env.test --import=tsx worker/index.ts
// Contra producción, solo a propósito: ENTORNO=produccion con .env.local (npm run worker:produccion).
process.env.WORKER_LOCAL = "1";
import { exigirDestinoEscritura, DestinoNoAutorizado } from "../src/lib/entorno";
import { correrWorker } from "../src/lib/jobs/worker";

// Candado de arranque (src/lib/entorno.ts). El worker escribe en BD, Storage y Auth con service role: si el
// destino no está autorizado, no llega ni a tomar el primer trabajo. El contexto se declara aquí («worker»)
// en vez de deducirse de argv porque es el único proceso que admite ENTORNO=produccion escrito a mano.
try {
  const destino = exigirDestinoEscritura("worker");
  console.log(`worker → destino autorizado: ${destino} (ENTORNO=${process.env.ENTORNO})`);
} catch (e) {
  if (e instanceof DestinoNoAutorizado) {
    console.error(`El worker no arranca. ${e.message}`);
    process.exit(2);
  }
  throw e;
}

correrWorker().catch((e) => {
  console.error("worker cayó:", e);
  process.exit(1);
});

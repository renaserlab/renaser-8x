// Arranque del worker: node --env-file=.env.local --import=tsx worker/index.ts
import { correrWorker } from "../src/lib/jobs/worker";

correrWorker().catch((e) => {
  console.error("worker cayó:", e);
  process.exit(1);
});

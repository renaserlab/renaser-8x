import { NextResponse, type NextRequest } from "next/server";
import { drenarCola } from "@/lib/jobs/worker";
import { marcarDrenando } from "@/lib/jobs/queue";

/**
 * Worker sin PC: esta ruta drena la cola dentro de Vercel (Fluid Compute, hasta ~4.5 min por invocación).
 * Se dispara sola cada vez que se encola un trabajo (ver encolar() en lib/jobs/queue.ts) y como respaldo
 * por cron. NO cambia la arquitectura: es el MISMO worker (take_job con skip locked, heartbeat, backoff)
 * corriendo por ráfagas donde ya vive la web. Un worker local (npm run worker) puede convivir sin duplicar.
 * Autorización: cabecera x-worker-secret (WORKER_DRAIN_SECRET) o el cron de Vercel (Authorization: Bearer CRON_SECRET).
 */
export const maxDuration = 300;

async function drenar(req: NextRequest) {
  const secreto = process.env.WORKER_DRAIN_SECRET;
  const cron = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const propio = req.headers.get("x-worker-secret");
  const autorizado = (secreto && propio === secreto) || (cron && auth === `Bearer ${cron}`);
  if (!autorizado) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  marcarDrenando(true);
  try {
    const r = await drenarCola(270_000);
    return NextResponse.json(r);
  } finally {
    marcarDrenando(false);
  }
}

export async function POST(req: NextRequest) {
  return drenar(req);
}

export async function GET(req: NextRequest) {
  // El cron de Vercel invoca con GET.
  return drenar(req);
}

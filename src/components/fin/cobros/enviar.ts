"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Enviar a una ruta de /api/fin y, si salió bien, refrescar la página (el servidor vuelve a leer). El error llega ya en
 * castellano: el de la ruta, o el de la base cuando se niega (mes cerrado, cobro de más…). Devuelve lo que respondió la
 * ruta, para poder decir qué pasó en la caja.
 */
export function useEnviar() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enviar<T = Record<string, unknown>>(url: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: unknown): Promise<T | null> {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!r.ok) {
        setError(j?.error ?? "No se pudo guardar. Intenta de nuevo.");
        return null;
      }
      router.refresh();
      return (j ?? ({} as T)) as T;
    } catch {
      setError("No hay conexión. Revisa tu internet e intenta de nuevo.");
      return null;
    } finally {
      setEnviando(false);
    }
  }
  return { enviar, enviando, error, setError };
}

/** Un número escrito por el dueño («1,250.50», «1250,5»): coma o punto como decimal; null si no es un monto. */
export function aMonto(texto: string): number | null {
  const limpio = texto.replace(/\s|S\/|US\$/g, "");
  const normal = /,\d{1,2}$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  const v = Number(normal);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

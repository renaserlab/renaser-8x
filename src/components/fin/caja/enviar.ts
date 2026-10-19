"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Enviar a una ruta de /api/fin y, si salió bien, refrescar la página (el servidor vuelve a leer la caja y sus números).
 * El error de la ruta llega ya escrito para el dueño (incluido el de la base: «el mes está cerrado…»); si la red falla,
 * se dice así. Devuelve el JSON de la respuesta, o null si falló.
 */
export function useEnviarFin() {
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


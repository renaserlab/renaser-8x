"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Enviar a una ruta de /api/os y, si salió bien, refrescar la página (el servidor vuelve a leer). El error de la ruta
 * llega ya en castellano (protegido/leerValidado); si la red falla, se dice así.
 */
export function useEnviar() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enviar(url: string, metodo: "POST" | "PUT" | "PATCH", cuerpo: unknown): Promise<boolean> {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "No se pudo guardar. Intenta de nuevo.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("No hay conexión. Revisa tu internet e intenta de nuevo.");
      return false;
    } finally {
      setEnviando(false);
    }
  }
  return { enviar, enviando, error, setError };
}

"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * «EN VIVO · SE ACTUALIZA SOLO». Las tablas os_* no dan permisos al navegador, así que no hay realtime: el servidor
 * vuelve a leer cada `segundos`. Con la pestaña escondida no se pide nada; al volver, se refresca de inmediato.
 */
export function Refresco({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tic = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tic, segundos * 1000);
    document.addEventListener("visibilitychange", tic);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tic);
    };
  }, [router, segundos]);
  return null;
}

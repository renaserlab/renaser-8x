"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CampoClave } from "@/components/base/CampoClave";

/**
 * CREAR CONTRASEÑA NUEVA: aquí aterriza el enlace del correo de recuperación. El cliente de
 * Supabase canjea el código del enlace solo; si la sesión no aparece, el enlace venció o ya se
 * usó — y se dice con todas sus letras, con el camino de vuelta. Nada falla en silencio.
 */
export default function Restablecer() {
  const router = useRouter();
  const [listo, setListo] = useState<"cargando" | "si" | "vencido">("cargando");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    let vivo = true;
    // El canje del enlace toma un instante: se espera la sesión hasta 6 segundos antes de declararlo vencido.
    const { data: escucha } = sb.auth.onAuthStateChange((_evento, sesion) => {
      if (vivo && sesion) setListo("si");
    });
    const revisar = async (intentos: number) => {
      const { data } = await sb.auth.getSession();
      if (!vivo) return;
      if (data.session) setListo("si");
      else if (intentos <= 0) setListo((x) => (x === "cargando" ? "vencido" : x));
      else setTimeout(() => revisar(intentos - 1), 500);
    };
    void revisar(12);
    return () => {
      vivo = false;
      escucha.subscription.unsubscribe();
    };
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) return setError("La contraseña necesita al menos 8 caracteres.");
    if (clave !== clave2) return setError("Las contraseñas no coinciden. Escríbelas de nuevo.");
    setGuardando(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.updateUser({ password: clave });
    setGuardando(false);
    if (error) {
      setError(/same password|different from the old/i.test(error.message) ? "Esa es tu contraseña actual: escribe una distinta." : /weak|short/i.test(error.message) ? "Esa contraseña es muy débil. Usa al menos 8 caracteres, con letras y números." : "No pudimos guardarla. Intenta de nuevo o pide un enlace nuevo.");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full" style={{ maxWidth: 420 }}>
        <p className="t-etiqueta mb-6">8X</p>
        <h1 className="t-titulo mb-2">Crear contraseña nueva</h1>
        {listo === "cargando" && <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Verificando tu enlace…</p>}
        {listo === "vencido" && (
          <>
            <p className="t-cuerpo mb-4">Este enlace venció o ya fue usado — pasa por seguridad.</p>
            <Link href="/recuperar" className="boton boton--grande" style={{ display: "inline-flex" }}>Pedir un enlace nuevo</Link>
          </>
        )}
        {listo === "si" && (
          <>
            <p className="t-cuerpo mb-8" style={{ color: "var(--grafito)" }}>Tu enlace es válido. Escribe tu contraseña nueva y listo: entras de inmediato.</p>
            <form onSubmit={guardar} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="t-etiqueta">Contraseña nueva</span>
                <CampoClave value={clave} onChange={setClave} autoComplete="new-password" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="t-etiqueta">Repítela</span>
                <CampoClave value={clave2} onChange={setClave2} autoComplete="new-password" />
              </label>
              {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
              <button className="boton boton--grande" disabled={guardando}>{guardando ? "Guardando" : "Guardar y entrar"}</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

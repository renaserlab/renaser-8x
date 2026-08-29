"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CampoClave } from "@/components/base/CampoClave";

export default function Registro() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [acepta, setAcepta] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const sb = supabaseBrowser();
    const { error, data } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password: clave,
      options: {
        // LEY 29733: el consentimiento queda guardado con su versión y su fecha, no solo marcado.
        data: { nombre: nombre.trim(), acepto_privacidad_version: "1.0", acepto_privacidad_at: new Date().toISOString() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setCargando(false);
    if (error) {
      // Los mensajes de Supabase llegan en inglés: se traducen los conocidos y el resto se dice en cristiano.
      const m = error.message;
      setError(
        /pwned|compromis|breach/i.test(m) ? "Esa contraseña aparece en filtraciones conocidas de internet. Elige otra."
        : /least|password|short/i.test(m) ? "La contraseña necesita al menos 8 caracteres."
        : /invalid/i.test(m) ? "Ese correo no parece válido. Revísalo (ejemplo: nombre@gmail.com)."
        : /already|registered|exists/i.test(m) ? "Ya existe una cuenta con ese correo. Prueba entrar."
        : /rate|too many/i.test(m) ? "Demasiados intentos seguidos. Espera un minuto y vuelve a probar."
        : "No pudimos crear la cuenta. Revisa el correo y la contraseña e intenta de nuevo."
      );
      return;
    }
    if (data.session) window.location.href = "/";
    else setListo(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full" style={{ maxWidth: 420 }}>
        <p className="t-etiqueta mb-6">8X</p>
        <h1 className="t-titulo mb-8">Crear cuenta</h1>
        {listo ? (
          <p className="t-cuerpo">Te enviamos un correo a <strong>{email}</strong>. Abre el enlace para confirmar y entrar.</p>
        ) : (
          <form onSubmit={crear} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="t-etiqueta">Tu nombre</span>
              <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-etiqueta">Correo</span>
              <input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-etiqueta">Contraseña</span>
              <CampoClave value={clave} onChange={setClave} autoComplete="new-password" minLength={8} />
            </label>
            {/* LEY 29733: consentimiento informado, explícito y antes de crear la cuenta. */}
            <label className="flex items-start gap-3" style={{ cursor: "pointer" }}>
              <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, flex: "none", accentColor: "var(--marca)" }} />
              <span className="t-dato" style={{ color: "var(--grafito)" }}>
                Acepto que RENASER trate los datos de mi empresa para diagnosticarla y sistematizarla, como explica la{" "}
                <Link href="/privacidad" target="_blank" className="underline" style={{ color: "var(--marca)" }}>política de privacidad</Link>.
                Puedo pedir acceso, corrección o eliminación cuando quiera.
              </span>
            </label>
            {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            <button className="boton boton--grande" disabled={cargando || !acepta}>{cargando ? "Creando" : "Crear cuenta"}</button>
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
              ¿Ya tienes cuenta? <Link href="/entrar" className="underline">Entrar</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

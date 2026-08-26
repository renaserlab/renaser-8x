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

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const sb = supabaseBrowser();
    const { error, data } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password: clave,
      options: { data: { nombre: nombre.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setCargando(false);
    if (error) {
      // Los mensajes de Supabase llegan en inglés: se traducen los conocidos y el resto se dice en cristiano.
      const m = error.message;
      setError(
        /least|password/i.test(m) ? "La contraseña necesita al menos 6 caracteres."
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
              <CampoClave value={clave} onChange={setClave} autoComplete="new-password" minLength={6} />
            </label>
            {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
            <button className="boton boton--grande" disabled={cargando}>{cargando ? "Creando" : "Crear cuenta"}</button>
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
              ¿Ya tienes cuenta? <Link href="/entrar" className="underline">Entrar</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

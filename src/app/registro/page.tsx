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
      setError(error.message.includes("least") ? "La contraseña necesita al menos 6 caracteres." : error.message);
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

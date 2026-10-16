"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * RECUPERAR CUENTA (pedido de Kelin): quien olvidó su contraseña pide un enlace a su correo.
 * La respuesta es la misma exista o no la cuenta: aquí no se regala la lista de clientes.
 */
export default function Recuperar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setCargando(false);
    if (error && /rate|too many|seconds/i.test(error.message)) {
      setError("Acabamos de enviarte un correo hace poco. Espera un minuto y vuelve a intentar.");
      return;
    }
    // Cualquier otro resultado muestra el mismo mensaje: no se revela si el correo existe.
    setEnviado(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full" style={{ maxWidth: 420 }}>
        <p className="t-etiqueta mb-6">8X</p>
        <h1 className="t-titulo mb-2">Recuperar tu cuenta</h1>
        {enviado ? (
          <>
            <p className="t-cuerpo mb-4">
              Si <strong>{email.trim().toLowerCase()}</strong> tiene una cuenta en 8X, acabamos de enviarle un
              enlace para crear una contraseña nueva. Revisa tu bandeja — y la carpeta de no deseados, por si acaso.
            </p>
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
              El enlace vence pronto por seguridad. ¿No llegó en unos minutos?{" "}
              <button type="button" className="underline" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }} onClick={() => setEnviado(false)}>Vuelve a pedirlo</button>.
            </p>
          </>
        ) : (
          <>
            <p className="t-cuerpo mb-8" style={{ color: "var(--grafito)" }}>
              Escribe el correo con el que entras y te enviamos un enlace para crear una contraseña nueva.
            </p>
            <form onSubmit={pedir} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="t-etiqueta">Correo</span>
                <input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
              <button className="boton boton--grande" disabled={cargando}>{cargando ? "Enviando" : "Enviarme el enlace"}</button>
            </form>
          </>
        )}
        <p className="t-cuerpo mt-8" style={{ color: "var(--grafito)" }}>
          <Link href="/entrar" className="underline">Volver a Entrar</Link>
        </p>
      </div>
    </main>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo8X } from "@/components/base/Logo8X";

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
    <main className="portada">
      <Logo8X variante="luz" alto={120} lema />
      <div className="portada__hoja">
        <h1 className="t-titulo">Recuperar tu cuenta</h1>
        {enviado ? (
          <>
            <p className="portada__texto">
              Si <strong>{email.trim().toLowerCase()}</strong> tiene una cuenta en 8X, acabamos de enviarle un
              enlace para crear una contraseña nueva. Revisa tu bandeja — y la carpeta de no deseados, por si acaso.
            </p>
            <p className="portada__pie">
              El enlace vence pronto por seguridad. ¿No llegó en unos minutos?{" "}
              <button type="button" onClick={() => setEnviado(false)}>Vuelve a pedirlo</button>.
            </p>
          </>
        ) : (
          <>
            <p className="portada__frase">
              Escribe el correo con el que entras y te enviamos un enlace para crear una contraseña nueva.
            </p>
            <form onSubmit={pedir} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="t-etiqueta">Correo</span>
                <input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {error && <p className="aviso aviso--error" role="alert">{error}</p>}
              <button className="boton boton--grande" disabled={cargando}>{cargando ? "Enviando" : "Enviarme el enlace"}</button>
            </form>
          </>
        )}
        <p className="portada__pie portada__volver">
          <Link href="/entrar">Volver a Entrar</Link>
        </p>
      </div>
    </main>
  );
}

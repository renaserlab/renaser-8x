"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CampoClave } from "@/components/base/CampoClave";
import { Logo8X } from "@/components/base/Logo8X";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave });
    setCargando(false);
    if (error) {
      setError(error.message.includes("Invalid") ? "Correo o contraseña incorrectos. Revísalos e intenta de nuevo." : error.message.includes("confirm") ? "Tu correo todavía no está confirmado. Revisa tu bandeja." : /rate|too many/i.test(error.message) ? "Demasiados intentos seguidos. Espera un minuto y vuelve a probar." : "No pudimos entrar. Revisa el correo y la contraseña e intenta de nuevo.");
      return;
    }
    router.replace(params.get("volver") ?? "/");
    router.refresh();
  };

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">Correo</span>
        <input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">Contraseña</span>
        <CampoClave value={clave} onChange={setClave} autoComplete="current-password" />
      </label>
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      <button className="boton boton--grande" disabled={cargando}>{cargando ? "Entrando" : "Entrar"}</button>
      <p className="portada__pie">
        <span className="portada__par">
          ¿Primera vez? <Link href="/registro">Crea tu cuenta</Link>
        </span>{" "}
        <span aria-hidden="true">·</span>{" "}
        <span className="portada__par">
          <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
        </span>
      </p>
    </form>
  );
}

/**
 * EL INGRESO COMO PORTADA DE MARCA (sistema «noche y perla», 17-10-2026): toda la pantalla en noche con el 8X en luz y
 * su lema; debajo, la hoja perla con el formulario de siempre. El dibujo es la marca: «8X» no se repite en texto.
 */
export default function Entrar() {
  return (
    <main className="portada">
      <Logo8X variante="luz" alto={120} lema />
      <div className="portada__hoja">
        <h1 className="t-titulo">Entrar</h1>
        <p className="portada__frase">La distancia entre lo que tu empresa dice que es y lo que realmente es.</p>
        <Suspense>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}

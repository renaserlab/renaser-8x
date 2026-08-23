"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Entrevista, type EstadoEntrevista } from "@/components/Entrevista";

type Info = { participante: { nombre: string; puesto: string | null; empresa: string }; transcriptor: boolean } & EstadoEntrevista;

const CLAVE = "8x_participante_token";

/**
 * Enlace del participante: desde su celular, sin cuenta, solo su sesión. Capítulo 7.4 y 36.
 * P2-17: el token se saca de la URL al primer render (sessionStorage + replaceState) y viaja en cabecera.
 */
export default function Participar({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenUrl } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [invalido, setInvalido] = useState(false);
  // El token se lee una sola vez: de la URL (y se borra de ella) o de sessionStorage al volver.
  const [token] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    if (tokenUrl && tokenUrl !== "sesion") {
      sessionStorage.setItem(CLAVE, tokenUrl);
      window.history.replaceState(null, "", "/participar/sesion");
      return tokenUrl;
    }
    return sessionStorage.getItem(CLAVE) ?? "";
  });

  const cabeceras = useCallback(() => ({ "x-participante-token": token }), [token]);

  const cargar = useCallback(async (): Promise<EstadoEntrevista> => {
    const r = await fetch("/api/participar", { headers: cabeceras(), cache: "no-store" });
    if (!r.ok) {
      setInvalido(true);
      throw new Error("Este enlace no es válido.");
    }
    const j = (await r.json()) as Info;
    setInfo(j);
    return { ...j, terminado: !j.activa };
  }, [cabeceras]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar().catch(() => {});
  }, [cargar]);

  const responder = async (d: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => {
    const form = new FormData();
    form.set("session_id", d.session_id);
    form.set("response_id", d.response_id);
    if (d.audio) form.set("audio", d.audio, "respuesta.webm");
    else form.set("texto", d.texto ?? "");
    const r = await fetch("/api/participar", { method: "POST", headers: cabeceras(), body: form });
    if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos guardar tu respuesta.");
  };

  if (invalido)
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <p className="t-cuerpo">Este enlace no es válido o ya venció. Pide uno nuevo a quien te lo envió.</p>
      </main>
    );

  return (
    <main className="min-h-screen px-4 py-6" style={{ maxWidth: 720, margin: "0 auto" }}>
      {info && (
        <header className="mb-8">
          <p className="t-etiqueta">{info.participante.empresa}</p>
          <h1 className="t-titulo mt-2">Hola, {info.participante.nombre.split(" ")[0]}</h1>
          <p className="t-cuerpo mt-2 medida" style={{ color: "var(--grafito)" }}>
            Te vamos a hacer algunas preguntas sobre cómo haces tu trabajo. No hay respuestas buenas ni malas. Tu nombre no se muestra con tus respuestas: solo nos interesan los hechos. Puedes parar cuando quieras y volver con el mismo enlace.
          </p>
        </header>
      )}
      <Entrevista cargar={cargar} responder={responder} transcriptor={info?.transcriptor ?? false} />
    </main>
  );
}

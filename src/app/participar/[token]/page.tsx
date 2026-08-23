"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Entrevista, type EstadoEntrevista } from "@/components/Entrevista";

type Info = { participante: { nombre: string; puesto: string | null; empresa: string }; transcriptor: boolean } & EstadoEntrevista;

const CLAVE = "8x_participante_sesion";

/**
 * Enlace del participante: desde su celular, sin cuenta, solo su sesión. Capítulo 7.4 y 36.
 * El enlace es de un solo uso: al abrirlo se canjea por un token de sesión (POST /api/participar/canjear) que se guarda
 * en este dispositivo (localStorage) y viaja en cabecera; la URL se reemplaza por /participar/sesion. El enlace original
 * deja de servir. Para volver, la persona abre /participar/sesion desde el mismo celular.
 */
export default function Participar({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenUrl } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [invalido, setInvalido] = useState<null | "enlace" | "sesion">(null);
  const [token, setToken] = useState<string>("");
  const [listo, setListo] = useState(false);

  // Arranque: canjear el enlace (una sola vez) o recuperar la sesión del dispositivo.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const guardado = localStorage.getItem(CLAVE) ?? "";
      if (tokenUrl && tokenUrl !== "sesion") {
        window.history.replaceState(null, "", "/participar/sesion");
        const r = await fetch("/api/participar/canjear", { method: "POST", headers: { "x-participante-token": tokenUrl } });
        if (r.ok) {
          const j = (await r.json()) as { token_sesion: string };
          localStorage.setItem(CLAVE, j.token_sesion);
          if (vivo) setToken(j.token_sesion);
        } else if (guardado) {
          if (vivo) setToken(guardado); // enlace ya canjeado en este mismo dispositivo: seguimos con la sesión
        } else if (vivo) setInvalido("enlace");
      } else if (guardado) {
        if (vivo) setToken(guardado);
      } else if (vivo) setInvalido("sesion");
      if (vivo) setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, [tokenUrl]);

  const cabeceras = useCallback(() => ({ "x-participante-token": token }), [token]);

  const cargar = useCallback(async (): Promise<EstadoEntrevista> => {
    const r = await fetch("/api/participar", { headers: cabeceras(), cache: "no-store" });
    if (!r.ok) {
      setInvalido("sesion");
      throw new Error("Esta sesión ya no es válida.");
    }
    const j = (await r.json()) as Info;
    setInfo(j);
    return { ...j, terminado: !j.activa };
  }, [cabeceras]);

  const responder = async (d: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => {
    const form = new FormData();
    form.set("session_id", d.session_id);
    form.set("response_id", d.response_id);
    if (d.audio) form.set("audio", d.audio, "respuesta.webm");
    else form.set("texto", d.texto ?? "");
    const r = await fetch("/api/participar", { method: "POST", headers: cabeceras(), body: form });
    if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos guardar tu respuesta.");
  };

  if (invalido === "enlace")
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <p className="t-cuerpo medida">Este enlace ya se usó o venció. Si lo abriste antes, vuelve desde el mismo celular con la dirección que quedó guardada. Si no, pide un enlace nuevo a quien te lo envió.</p>
      </main>
    );
  if (invalido === "sesion")
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <p className="t-cuerpo medida">No encontramos tu conversación en este celular. Abre el enlace que te enviaron o pide uno nuevo.</p>
      </main>
    );
  if (!listo || !token) return <main className="min-h-screen p-6"><p className="t-dato" style={{ color: "var(--grafito)" }}>Abriendo tu conversación</p></main>;

  return (
    <main className="min-h-screen px-4 py-6" style={{ maxWidth: 720, margin: "0 auto" }}>
      {info && (
        <header className="mb-8">
          <p className="t-etiqueta">{info.participante.empresa}</p>
          <h1 className="t-titulo mt-2">Hola, {info.participante.nombre.split(" ")[0]}</h1>
          <p className="t-cuerpo mt-2 medida" style={{ color: "var(--grafito)" }}>
            Te vamos a hacer algunas preguntas sobre cómo haces tu trabajo. No hay respuestas buenas ni malas. Tu nombre no se muestra con tus respuestas: solo nos interesan los hechos. Puedes parar cuando quieras y volver desde este mismo celular.
          </p>
        </header>
      )}
      <Entrevista cargar={cargar} responder={responder} transcriptor={info?.transcriptor ?? false} />
    </main>
  );
}

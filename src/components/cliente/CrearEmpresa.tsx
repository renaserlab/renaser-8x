"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";

/**
 * EL REGISTRO PIDE TRES COSAS (R7.1). Hasta el 13-10-2026 quien llegaba con el enlace llenaba una ficha de
 * diez campos escritos antes de ver nada. Ahora da lo imprescindible para que su empresa exista —cómo se
 * llama, a qué se dedica dicho con sus palabras y en qué ciudad está— y lo demás se lo preguntamos en la
 * entrada breve (/portal/entrada), donde puede responder hablando, con un «más o menos» o con un «no lo sé».
 *
 * Solo el nombre es obligatorio: lo que aquí quede en blanco lo pregunta la entrada, y lo que aquí se diga
 * la entrada no lo vuelve a pedir. Al crear la empresa se abre su entrada y se lleva a la persona ahí.
 *
 * QUÉ DEJÓ DE LLEGAR A LA FICHA DE LA EMPRESA (companies.ficha), dicho sin adornos. La ficha vieja escribía
 * once datos; esta escribe dos (a qué se dedica y la ciudad). De los otros nueve:
 *  · Cuántas personas trabajan → lo da la entrada: de la respuesta a «con cuánta gente» se toma en código,
 *    solo si se dice sin ambigüedad, y se anota cuando el dueño confirma «lo que entendimos» (personasDichas
 *    y anotarEnFicha, en src/lib/entrada.ts). Si no lo dijo claro, queda vacío.
 *  · Cuánto vende al mes → ya no va a la ficha: lo que el dueño responda de sus ventas va a sus números.
 *  · Los años que tiene el negocio, cuántos locales, si vende a personas o a empresas, si tiene cosas
 *    escritas, qué es lo principal que vende, por dónde le llegan los clientes y su WhatsApp → NADA los
 *    escribe en una empresa nueva. La entrada pregunta qué vende y a quién, pero la respuesta queda como
 *    texto y como afirmaciones, no como dato de la ficha. Consecuencias: la etapa del negocio (sale de los
 *    años que tiene) nace vacía; el tamaño del perfil no cuenta locales; la consultora no tiene el WhatsApp
 *    del dueño; y la clasificación del negocio usa solo el rubro. El dueño puede completarlos en «Mi empresa
 *    → Corregir mis datos», pero nadie se lo pide. Que la entrada los pida es una decisión de Dirección: sus
 *    doce preguntas ya están ocupadas por los doce contenidos obligatorios.
 */
export function CrearEmpresa() {
  const [nombre, setNombre] = useState("");
  const [actividad, setActividad] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setError(null);
    setCargando(true);
    try {
      const { company_id } = await pedir<{ company_id: string }>("/api/portal/empresa", { json: { nombre, ficha: { actividad, ciudad } } });
      // La entrada se abre ahora para que la primera pregunta espere lista. Si este paso falla, la empresa
      // ya existe y no se detiene a la persona: la pantalla de la entrada la abre con su botón «Empezar».
      await pedir(`/api/companies/${company_id}/entrada`, { json: { accion: "iniciar" } }).catch(() => {});
      // Recarga COMPLETA: router.refresh() fallaba en silencio en celulares y la persona
      // volvía a enviar el formulario creando empresas duplicadas (caso real de Darren).
      window.location.assign(new URL("/portal/entrada", window.location.origin).toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear tu empresa.");
      setCargando(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear();
      }}
      className="flex flex-col gap-5 medida"
    >
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿Cómo se llama tu negocio?</span>
        <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="El nombre con el que lo conocen" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿A qué se dedica? Dilo con tus palabras</span>
        <input className="campo" value={actividad} onChange={(e) => setActividad(e.target.value)} placeholder="restaurante, ferretería, taller, estudio contable…" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿En qué ciudad está?</span>
        <input className="campo" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="p. ej. Lima, Arequipa, Trujillo" />
      </label>
      {error && (
        <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">
          {error}
        </p>
      )}
      <button className="boton" disabled={cargando || nombre.trim().length < 2}>
        {cargando ? "Un momento…" : "Crear y empezar"}
      </button>
      <p className="t-dato" style={{ color: "var(--grafito)" }}>
        Después te hacemos unas preguntas cortas sobre tu negocio. Puedes responderlas hablando, y dejarlas a medias para seguir otro día. No necesitas documentos perfectos.
      </p>
    </form>
  );
}

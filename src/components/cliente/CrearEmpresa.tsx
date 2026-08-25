"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/**
 * El amigo que llega con el enlace crea su empresa y llena la ficha de enrutamiento en ~3 minutos.
 * Paso 1: nombre + a qué se dedica. Paso 2: la ficha (opcional pregunta a pregunta — nada traba).
 * Con la ficha el sistema clasifica el negocio y activa las preguntas de su oficio.
 */
export function CrearEmpresa() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pon = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const crear = async () => {
    setError(null);
    setCargando(true);
    try {
      await pedir("/api/portal/empresa", { json: { nombre, ficha: f } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear tu empresa.");
      setCargando(false);
    }
  };

  if (paso === 0)
    return (
      <form onSubmit={(e) => { e.preventDefault(); setPaso(1); }} className="flex flex-col gap-5 medida">
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Cómo se llama tu negocio?</span>
          <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="El nombre con el que lo conocen" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Qué hace tu negocio?</span>
          <input className="campo" value={f.actividad ?? ""} onChange={pon("actividad")} placeholder="restaurante, ferretería, taller, estudio contable…" />
        </label>
        <button className="boton" disabled={nombre.trim().length < 2}>Continuar</button>
        <p className="t-dato" style={{ color: "var(--grafito)" }}>
          En 15–20 minutos tendrás tu primer diagnóstico. No necesitas documentos perfectos: puedes hablar, subir fotos o contarnos cómo lo haces.
        </p>
      </form>
    );

  return (
    <form onSubmit={(e) => { e.preventDefault(); crear(); }} className="flex flex-col gap-5 medida">
      <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
        Unas pocas cosas más para conocer tu negocio. Si algo no lo sabes exacto, un “más o menos” basta — y todo se puede dejar en blanco.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Hace cuántos años existe?</span>
          <input className="campo" inputMode="decimal" value={f.antiguedad ?? ""} onChange={pon("antiguedad")} placeholder="p. ej. 5" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Cuántas personas trabajan (contándote)?</span>
          <input className="campo" inputMode="numeric" value={f.personas ?? ""} onChange={pon("personas")} placeholder="p. ej. 8" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Cuántos locales o puntos tiene?</span>
          <input className="campo" inputMode="numeric" value={f.locales ?? ""} onChange={pon("locales")} placeholder="p. ej. 1" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿A quién le vendes?</span>
          <select className="campo" value={f.cliente_tipo ?? ""} onChange={pon("cliente_tipo")}>
            <option value="">Elige…</option>
            <option value="personas">A personas</option>
            <option value="empresas">A empresas</option>
            <option value="ambos">A los dos</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Cuánto vende al mes, más o menos?</span>
          <select className="campo" value={f.venta_mensual ?? ""} onChange={pon("venta_mensual")}>
            <option value="">Elige…</option>
            <option value="hasta S/10 mil">Hasta S/10 mil</option>
            <option value="S/10–50 mil">Entre S/10 mil y S/50 mil</option>
            <option value="S/50–200 mil">Entre S/50 mil y S/200 mil</option>
            <option value="más de S/200 mil">Más de S/200 mil</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">¿Tienes cosas escritas del negocio?</span>
          <select className="campo" value={f.documentacion ?? ""} onChange={pon("documentacion")}>
            <option value="">Elige…</option>
            <option value="si">Sí (cuadernos, Excel, manuales)</option>
            <option value="algo">Algo</option>
            <option value="casi nada">Casi nada</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿Qué es lo principal que vendes?</span>
        <input className="campo" value={f.productos ?? ""} onChange={pon("productos")} placeholder="los 2 o 3 productos o servicios principales" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿Por dónde te llegan los clientes?</span>
        <input className="campo" value={f.canales ?? ""} onChange={pon("canales")} placeholder="recomendados, la calle, Facebook, WhatsApp…" />
      </label>
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="button" className="boton boton--secundario" onClick={() => setPaso(0)} disabled={cargando}>Atrás</button>
        <button className="boton" disabled={cargando}>{cargando ? "Un momento…" : "Empezar"}</button>
      </div>
    </form>
  );
}

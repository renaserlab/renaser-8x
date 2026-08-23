"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Encabezado } from "@/components/base/Vacio";

const PREGUNTAS: [string, string][] = [
  ["facturacion", "¿Cuánto factura hoy y hace cuánto sostiene ese nivel?"],
  ["horas", "¿Cuántas horas trabaja el dueño por semana?"],
  ["sin_dueno", "¿Qué pasa con la empresa si el dueño desaparece un mes?"],
  ["intentos", "¿Qué intentó antes y por qué no funcionó?"],
  ["cambiar", "¿Qué está dispuesto a cambiar en sí mismo?"],
  ["no_cambiar", "¿Qué no está dispuesto a cambiar bajo ninguna circunstancia?"],
];

/** Admisión: el filtro es parte del producto. 8X debe poder rechazar empresas. Capítulo 5. */
export default function NuevaEmpresa() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState("");
  const [duenoNombre, setDuenoNombre] = useState("");
  const [duenoEmail, setDuenoEmail] = useState("");
  const [resp, setResp] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const c = await pedir<{ id: string }>("/api/companies", { json: { nombre, sector, dueno_nombre: duenoNombre, dueno_email: duenoEmail, admision: resp } });
      if (Object.values(resp).some((v) => v?.trim())) await pedir(`/api/companies/${c.id}/admission`, { json: { respuestas: resp } });
      router.push(`/empresa/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear la empresa.");
      setCargando(false);
    }
  };

  return (
    <>
      <Encabezado titulo="Nueva empresa" sub="El cuestionario de admisión es parte del producto. La respuesta a la última pregunta predice el resultado mejor que cualquier cifra." />
      <form onSubmit={crear} className="flex flex-col gap-8 medida">
        <section className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="t-etiqueta">Nombre de la empresa</span>
            <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-etiqueta">Sector</span>
            <input className="campo" value={sector} onChange={(e) => setSector(e.target.value)} />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="t-etiqueta">Nombre del dueño</span>
              <input className="campo" value={duenoNombre} onChange={(e) => setDuenoNombre(e.target.value)} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-etiqueta">Correo del dueño (si ya tiene cuenta, se enlaza)</span>
              <input className="campo" type="email" value={duenoEmail} onChange={(e) => setDuenoEmail(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="t-seccion">Cuestionario de admisión</h2>
          {PREGUNTAS.map(([k, q]) => (
            <label key={k} className="flex flex-col gap-2">
              <span className="t-cuerpo">{q}</span>
              <textarea className="campo" rows={2} value={resp[k] ?? ""} onChange={(e) => setResp({ ...resp, [k]: e.target.value })} />
            </label>
          ))}
        </section>

        {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        <div className="flex gap-3">
          <button className="boton" disabled={cargando}>{cargando ? "Creando" : "Crear empresa"}</button>
          <button type="button" className="boton boton--secundario" onClick={() => router.back()}>Cancelar</button>
        </div>
      </form>
    </>
  );
}

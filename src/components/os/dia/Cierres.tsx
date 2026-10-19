"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/** Un formulario corto de cierre: varios campos de texto, un botón, y la página se recarga con lo guardado. */
function FormCierre({
  url,
  campos,
  boton,
}: {
  url: string;
  campos: { clave: string; etiqueta: string; ejemplo: string; requerido?: boolean }[];
  boton: string;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const json = Object.fromEntries(campos.map((c) => [c.clave, (valores[c.clave] ?? "").trim() || undefined]));
      await pedir(url, { json });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="os-d-campos">
      {campos.map((c) => (
        <label key={c.clave} className="os-d-campo">
          <span className="t-etiqueta">{c.etiqueta}</span>
          <textarea
            className="campo"
            rows={2}
            maxLength={1500}
            required={c.requerido}
            placeholder={c.ejemplo}
            value={valores[c.clave] ?? ""}
            onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
            style={{ minHeight: 72 }}
          />
        </label>
      ))}
      {error && <p className="aviso aviso--error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <button className="boton" disabled={enviando} style={{ justifySelf: "start" }}>
        {enviando ? "Guardando…" : boton}
      </button>
    </form>
  );
}

/** CIERRE DEL DÍA: qué terminaste y qué quedó pendiente (y por qué). */
export function CerrarDia() {
  return (
    <FormCierre
      url="/api/os/cierre"
      boton="Cerrar mi día"
      campos={[
        { clave: "hecho", etiqueta: "¿Qué terminaste hoy?", ejemplo: "Envié la cotización de El Sol y llamé a 4 clientes.", requerido: true },
        { clave: "pendiente", etiqueta: "¿Qué quedó pendiente y por qué?", ejemplo: "Falta un cliente: no contestó." },
      ]}
    />
  );
}

/** CIERRE SEMANAL: logros, trabas y el compromiso para la semana que viene. */
export function CerrarSemana() {
  return (
    <FormCierre
      url="/api/os/cierre-semanal"
      boton="Cerrar mi semana"
      campos={[
        { clave: "logros", etiqueta: "Tus logros de la semana", ejemplo: "Salieron 9 pedidos mayoristas.", requerido: true },
        { clave: "trabas", etiqueta: "Lo que te trabó", ejemplo: "Esperé dos días el reporte del banco." },
        { clave: "compromiso", etiqueta: "Tu compromiso para la próxima semana", ejemplo: "Cerrar Ferretería El Sol el lunes." },
      ]}
    />
  );
}

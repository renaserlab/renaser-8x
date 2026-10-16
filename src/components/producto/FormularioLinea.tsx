"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { aNumero } from "@/components/kpis/RegistrarValor";
import type { LineaProducto, OrigenLinea, TipoLinea } from "@/lib/producto";

type CampoNumero = "precio" | "costo_variable_unitario" | "unidades_periodo" | "horas_por_unidad";
type CampoTexto = "codigo" | "nombre" | "periodo" | "cliente_objetivo" | "necesidad" | "promesa";

const comoTexto = (n: number | null | undefined) => (n == null ? "" : String(n));

/** De dónde sale el dato de la línea. «Conciliado» lo dice una persona, nunca el sistema por su cuenta. */
const ORIGENES: [OrigenLinea, string][] = [
  ["declarado", "Lo dijo la empresa"],
  ["extraido", "Salió de un documento, sin conciliar"],
  ["conciliado", "Conciliado: el documento y la empresa coinciden"],
];

/**
 * CREAR O EDITAR UNA LÍNEA. Lo que no se sabe se deja en blanco y se guarda vacío: un precio o un costo
 * en blanco no se convierte en cero. Las horas solo existen para un servicio. La decisión no se edita
 * aquí: tiene su propio paso, con motivo.
 */
export function FormularioLinea({ companyId, linea, alCerrar }: { companyId: string; linea?: LineaProducto; alCerrar?: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoLinea>(linea?.tipo ?? "producto");
  const [origen, setOrigen] = useState<OrigenLinea>(linea?.origen ?? "declarado");
  const [textos, setTextos] = useState<Record<CampoTexto, string>>({
    codigo: linea?.codigo ?? "",
    nombre: linea?.nombre ?? "",
    periodo: linea?.periodo ?? "",
    cliente_objetivo: linea?.cliente_objetivo ?? "",
    necesidad: linea?.necesidad ?? "",
    promesa: linea?.promesa ?? "",
  });
  const [numeros, setNumeros] = useState<Record<CampoNumero, string>>({
    precio: comoTexto(linea?.precio),
    costo_variable_unitario: comoTexto(linea?.costo_variable_unitario),
    unidades_periodo: comoTexto(linea?.unidades_periodo),
    horas_por_unidad: comoTexto(linea?.horas_por_unidad),
  });
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servicio = tipo === "servicio";
  const unidad = servicio ? "caso" : "unidad";
  const ponerTexto = (k: CampoTexto) => (e: React.ChangeEvent<HTMLInputElement>) => setTextos((t) => ({ ...t, [k]: e.target.value }));
  const ponerNumero = (k: CampoNumero) => (e: React.ChangeEvent<HTMLInputElement>) => setNumeros((n) => ({ ...n, [k]: e.target.value }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valores = {} as Record<CampoNumero, number | null>;
    for (const k of Object.keys(numeros) as CampoNumero[]) {
      const v = aNumero(numeros[k]);
      if (v === "invalido" || (v != null && v < 0)) {
        setError("En precio, costo, vendido y horas escribe solo el número. Si no lo sabes, deja el campo en blanco.");
        return;
      }
      valores[k] = v;
    }
    if (!textos.nombre.trim()) {
      setError("Ponle nombre: es lo único que no puede quedar en blanco.");
      return;
    }
    const cuerpo = {
      nombre: textos.nombre.trim(),
      tipo,
      codigo: textos.codigo.trim() || null,
      periodo: textos.periodo.trim() || null,
      cliente_objetivo: textos.cliente_objetivo.trim() || null,
      necesidad: textos.necesidad.trim() || null,
      promesa: textos.promesa.trim() || null,
      precio: valores.precio,
      costo_variable_unitario: valores.costo_variable_unitario,
      unidades_periodo: valores.unidades_periodo,
      horas_por_unidad: servicio ? valores.horas_por_unidad : null,
      // Al crear, el origen lo pone la ruta («declarado»). Al editar se manda el que la consultora dejó elegido.
      ...(linea ? { origen } : {}),
    };
    setTrabajando(true);
    try {
      await pedir(`/api/companies/${companyId}/producto${linea ? `/${linea.id}` : ""}`, { method: linea ? "PATCH" : "POST", json: cuerpo });
      router.refresh();
      alCerrar?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <form className="panel p-4" style={{ background: "var(--suave)" }} onSubmit={guardar}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="t-etiqueta">Producto o servicio</span>
          <input className="campo" value={textos.nombre} onChange={ponerTexto("nombre")} maxLength={160} aria-label="Nombre del producto o servicio" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Código (si tiene)</span>
          <input className="campo" value={textos.codigo} onChange={ponerTexto("codigo")} maxLength={60} aria-label="Código" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Qué es</span>
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLinea)} aria-label="Producto o servicio">
            <option value="producto">Producto</option>
            <option value="servicio">Servicio</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Precio por {unidad}</span>
          <input className="campo" inputMode="decimal" value={numeros.precio} onChange={ponerNumero("precio")} aria-label={`Precio por ${unidad}`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Lo que cuesta cada {unidad}</span>
          <input className="campo" inputMode="decimal" value={numeros.costo_variable_unitario} onChange={ponerNumero("costo_variable_unitario")} aria-label={`Costo variable por ${unidad}`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">{servicio ? "Casos atendidos en el periodo" : "Unidades vendidas en el periodo"}</span>
          <input className="campo" inputMode="decimal" value={numeros.unidades_periodo} onChange={ponerNumero("unidades_periodo")} aria-label={servicio ? "Casos atendidos en el periodo" : "Unidades vendidas en el periodo"} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Periodo</span>
          <input className="campo" value={textos.periodo} onChange={ponerTexto("periodo")} maxLength={20} placeholder="2026-09" aria-label="Periodo de lo vendido" />
        </label>
        {servicio && (
          <label className="flex flex-col gap-1">
            <span className="t-etiqueta">Horas que se lleva cada caso</span>
            <input className="campo" inputMode="decimal" value={numeros.horas_por_unidad} onChange={ponerNumero("horas_por_unidad")} aria-label="Horas por caso" />
          </label>
        )}
        {linea && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="t-etiqueta">De dónde salen estos datos</span>
            <select className="campo" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenLinea)} aria-label="De dónde salen los datos de la línea">
              {ORIGENES.map(([clave, texto]) => (
                <option key={clave} value={clave}>{texto}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="t-etiqueta">A quién le sirve</span>
          <input className="campo" value={textos.cliente_objetivo} onChange={ponerTexto("cliente_objetivo")} maxLength={300} aria-label="Cliente al que le sirve" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="t-etiqueta">Qué necesidad le resuelve</span>
          <input className="campo" value={textos.necesidad} onChange={ponerTexto("necesidad")} maxLength={300} aria-label="Necesidad que resuelve" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <span className="t-etiqueta">Qué le promete al cliente</span>
          <input className="campo" value={textos.promesa} onChange={ponerTexto("promesa")} maxLength={300} aria-label="Promesa al cliente" />
        </label>
      </div>

      <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
        Deja en blanco lo que no se sabe: un campo vacío se guarda como «sin dato», nunca como cero. El periodo se escribe 2026 (año), 2026-09 (mes), 2026-T3 (trimestre) o 2026-S1 (semestre).
      </p>
      {error && <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button type="submit" className="boton" disabled={trabajando}>
          {trabajando ? "Guardando" : linea ? "Guardar cambios" : "Añadir"}
        </button>
        {alCerrar && (
          <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={alCerrar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

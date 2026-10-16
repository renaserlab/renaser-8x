"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import type { Seccion } from "@/lib/secciones";
import { diaMes, mensajeDe } from "@/components/negocio/dato";

type Props = {
  companyId: string;
  seccion: Seccion;
  /** Lo que el dueño lee junto al pedido, en una frase. */
  nota?: string | null;
  /** Si ya se pidió: el activo, o el último que entregó. */
  pedido?: { estado: "activa" | "completada"; desde: string } | null;
  /** El texto del botón. */
  texto?: string;
  zona?: string;
};

/**
 * PEDÍRSELO AL CLIENTE, en un toque: abre esa sección para la empresa con su nota (la misma ruta que «Activar para el
 * cliente») y vuelve a leer la página. Si ya está pedido, no se vuelve a pedir: se dice desde cuándo; si ya lo
 * entregó, se dice cuándo, para que la consultora lo revise.
 */
export function PedirAlCliente({ companyId, seccion, nota = null, pedido = null, texto = "Pedírselo al cliente", zona }: Props) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedidoHoy, setPedidoHoy] = useState(false);

  if (pedidoHoy || pedido?.estado === "activa") {
    return <span className="estado espera">{pedidoHoy ? "Pedido hoy" : `Pedido el ${diaMes(pedido?.desde, zona)}`}</span>;
  }
  if (pedido?.estado === "completada") return <span className="estado ok">Entregado el {diaMes(pedido.desde, zona)} · revisar</span>;

  const pedirlo = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/solicitudes`, { method: "POST", json: { secciones: [{ seccion, nota: nota?.trim().slice(0, 600) || null }] } });
      setPedidoHoy(true);
      router.refresh();
    } catch (e) {
      setError(mensajeDe(e, "No pudimos pedírselo. Inténtalo de nuevo."));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} disabled={trabajando} onClick={() => void pedirlo()}>
        {trabajando ? "Pidiéndolo…" : texto}
      </button>
      {error && (
        <span role="alert" className="t-dato" style={{ color: "var(--contradicho)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

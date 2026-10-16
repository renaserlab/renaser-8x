"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { diaLargo, mensajeDe } from "./dato";

type Props = {
  companyId: string;
  /** El pedido activo de esta sección, si lo hay. */
  solicitudId: string | null;
  /** Cuándo avisó el dueño que ya lo llenó (el último pedido completado de esta sección). */
  completadaAt: string | null;
  /** Dueño o líder de la empresa: los que pueden decir «listo». */
  puede: boolean;
  /** La consultora mirando el portal como el dueño: ella no marca «listo» por él. */
  comoConsultora: boolean;
  zona?: string;
  /** Qué se termina, cuando en la misma pantalla hay más de un pedido («Tus ventas al crédito o fiadas»). */
  que?: string;
};

/**
 * «LISTO, YA LO LLENÉ». El dueño le avisa a su consultora que terminó lo que le pidió; desde ahí la sección queda
 * para leer (la vuelve a abrir ella si hace falta). Sin pedido activo, solo se dice cuándo avisó.
 */
export function ListoParaConsultora({ companyId, solicitudId, completadaAt, puede, comoConsultora, zona, que }: Props) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisado, setAvisado] = useState<string | null>(null);

  const cuando = diaLargo(avisado ?? completadaAt, zona);
  if (!solicitudId || avisado) {
    return cuando ? (
      <p className="t-cuerpo mt-8 medida" role="status" style={{ color: "var(--confirmado)" }}>
        {que ? `«${que}»: se` : "Se"} lo hiciste saber a tu consultora el {cuando}.
      </p>
    ) : null;
  }
  if (comoConsultora) {
    return (
      <p className="t-dato mt-8 medida" style={{ color: "var(--grafito)" }}>
        Cuando termine, el dueño pulsa «Listo, ya lo llené» desde su portal. Tú no lo marcas por él.
      </p>
    );
  }
  if (!puede) {
    return (
      <p className="t-dato mt-8 medida" style={{ color: "var(--grafito)" }}>
        El dueño de la empresa avisa a la consultora cuando esto queda listo.
      </p>
    );
  }

  const listo = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/solicitudes/${solicitudId}`, { method: "PATCH", json: { estado: "completada" } });
      setAvisado(new Date().toISOString());
      router.refresh();
    } catch (e) {
      setError(mensajeDe(e, "No pudimos avisarle a tu consultora. Inténtalo de nuevo."));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="panel p-5 mt-8 medida" style={{ background: "var(--suave)" }}>
      <p className="t-cuerpo">{que ? `Cuando termines «${que}», avísale a tu consultora.` : "Cuando termines, avísale a tu consultora."} Lo que no sepas puede quedar como «No lo sé»: también sirve.</p>
      <button type="button" className="boton mt-4" onClick={listo} disabled={trabajando}>
        {trabajando ? "Avisando…" : "Listo, ya lo llené"}
      </button>
      {error && (
        <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

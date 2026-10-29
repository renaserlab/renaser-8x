"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { mensajeDe } from "@/components/negocio/dato";

type Props = {
  companyId: string;
  proximaSesion: string | null;
  enlaceReunion: string | null;
};

/**
 * LA PRÓXIMA SESIÓN Y SU ENLACE, ESCRITOS A MANO.
 *
 * POR QUÉ SON DOS CAMPOS Y NO UN CONTADOR. Se había construido un contador de sesiones del
 * contrato, y lo que Kelin pidió fue lo contrario: «el contrato ya se venció… eso yo debería de
 * poder añadirlo a mano, próxima sesión y enlace de reunión». Hay empresas sin contrato vigente y
 * sesiones que se mueven: un número deducido de un contrato vencido no sirve para nada, y pedirle
 * a la consultora que lo mantenga cuadrado es trabajo que no produce nada.
 *
 * El enlace vive junto a la empresa, no en la agenda de una sola persona: así cualquiera del
 * equipo entra a la reunión sin tener que pedirlo.
 */
export function ProximaSesion({ companyId, proximaSesion, enlaceReunion }: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState(proximaSesion ?? "");
  const [enlace, setEnlace] = useState(enlaceReunion ?? "");
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const guardar = async () => {
    const cuerpo: Record<string, unknown> = {};
    // Solo se manda lo que cambió, y el vacío se manda como nulo: así se puede QUITAR una fecha,
    // que es lo que pasa cuando una sesión se cancela y no hay otra todavía.
    if ((fecha || null) !== proximaSesion) cuerpo.proxima_sesion = fecha || null;
    if ((enlace.trim() || null) !== enlaceReunion) cuerpo.enlace_reunion = enlace.trim() || null;
    if (!Object.keys(cuerpo).length) {
      setAviso({ tipo: "ok", texto: "No hay nada que cambiar." });
      return;
    }
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}`, { method: "PATCH", json: cuerpo });
      setAviso({ tipo: "ok", texto: "Guardado" });
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Próxima sesión</span>
          <input
            type="date"
            aria-label="Fecha de la próxima sesión"
            className="campo"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="t-etiqueta">Enlace de la reunión</span>
          <input
            type="url"
            inputMode="url"
            aria-label="Enlace de la reunión"
            className="campo"
            placeholder="https://…"
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" onClick={guardar} disabled={trabajando}>
          {trabajando ? "Guardando…" : "Guardar"}
        </button>
        {enlaceReunion ? (
          <a href={enlaceReunion} target="_blank" rel="noopener noreferrer" className="enlace-azul" style={{ fontSize: 14 }}>
            Abrir la reunión
          </a>
        ) : null}
        {aviso ? (
          <span className={aviso.tipo === "error" ? "estado caducado" : "estado"} role="status">
            {aviso.texto}
          </span>
        ) : null}
      </div>

      {!proximaSesion && !enlaceReunion ? (
        <p className="t-dato" style={{ color: "var(--grafito)", margin: 0 }}>
          Todavía no hay fecha ni enlace. Los escribe la consultora: no salen del contrato, porque hay empresas sin
          contrato vigente y sesiones que se mueven.
        </p>
      ) : null}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { SECCIONES_QUE_ACTIVA_LA_CONSULTORA, SECCION, GRUPOS_SECCION, type Seccion, type Solicitud } from "@/lib/secciones";
import { diaMes, mensajeDe } from "@/components/negocio/dato";

type Props = {
  companyId: string;
  /** Todas las solicitudes de la empresa (también las retiradas), las más recientes primero. null = no se pudo leer. */
  solicitudes: Solicitud[] | null;
  /** Para decidir qué pedir: cuántos puntos hay marcados para confirmar y cuántos de los 9 números faltan. null = no se pudo leer. */
  contexto: { porConfirmar: number | null; faltanNumeros: number | null };
  zona?: string;
  /** El motivo, si la tabla de solicitudes todavía no existe en esta base. */
  noDisponible?: string | null;
};

type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/**
 * ACTIVAR PARA EL CLIENTE (pedido de Kelin, 16-10-2026: «si hay cosas por corroborar, yo activarle esa vista y que lo
 * llene; si le falta algo, yo activarlo y lo llene»). Once secciones en tres grupos —datos del negocio, confirmar,
 * subir archivos—, cada una con su nota opcional y su estado. Se marcan, se activan de una vez, y se le pasa al
 * dueño el enlace a «Lo que te pidió tu consultora». Retirar quita el pedido de su vista; «Volver a pedir» lo abre de
 * nuevo (el anterior queda en la historia).
 */
export function ActivarParaCliente({ companyId, solicitudes, contexto, zona, noDisponible }: Props) {
  const router = useRouter();
  const lista = solicitudes ?? [];
  const activaDe = (s: Seccion) => lista.find((x) => x.seccion === s && x.estado === "activa") ?? null;
  const ultimaDe = (s: Seccion) => lista.find((x) => x.seccion === s) ?? null;
  const [marcadas, setMarcadas] = useState<Seccion[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>(() => Object.fromEntries(SECCIONES_QUE_ACTIVA_LA_CONSULTORA.map((s) => [s, activaDe(s)?.nota ?? ""])));
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copia, setCopia] = useState<Aviso>(null);

  if (noDisponible) return <p className="t-dato" style={{ color: "var(--grafito)" }}>{noDisponible}</p>;

  const alternar = (s: Seccion) => setMarcadas((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  const notaDe = (s: Seccion) => (notas[s] ?? "").trim().slice(0, 600) || null;

  const enviar = async (secciones: Seccion[], texto: string) => {
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}/solicitudes`, { method: "POST", json: { secciones: secciones.map((s) => ({ seccion: s, nota: notaDe(s) })) } });
      setAviso({ tipo: "ok", texto });
      setEnlace(`${window.location.origin}/portal/pedidos`);
      setMarcadas([]);
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e, "No pudimos activarlo. Inténtalo de nuevo.") });
    } finally {
      setTrabajando(false);
    }
  };

  const retirar = async (s: Solicitud) => {
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}/solicitudes/${s.id}`, { method: "PATCH", json: { estado: "retirada" } });
      setAviso({ tipo: "ok", texto: `Retirado: «${SECCION[s.seccion].paraConsultora}». El dueño ya no lo ve.` });
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e, "No pudimos retirarlo. Inténtalo de nuevo.") });
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopia({ tipo: "ok", texto: "Copiado. Pégalo en tu mensaje al dueño." });
    } catch {
      setCopia({ tipo: "error", texto: "No se pudo copiar desde aquí: selecciona el enlace de abajo y cópialo a mano." });
    }
  };

  const contextoDe = (s: Seccion): string | null => {
    if (s === "corroborar_diagnostico" && contexto.porConfirmar != null) return `Hoy hay ${contexto.porConfirmar} ${contexto.porConfirmar === 1 ? "punto marcado" : "puntos marcados"} para confirmar.`;
    if (s === "datos_faltantes" && contexto.faltanNumeros != null) return contexto.faltanNumeros === 0 ? "Los 9 números tienen respuesta." : `Faltan ${contexto.faltanNumeros} de los 9 números.`;
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Las dos causas, porque mandan a sitios distintos: o la tabla no está en esta base (migración sin
          aplicar) o la lectura falló. «Vuelve a cargar» a secas mandaba a buscar el problema donde no está. */}
      {solicitudes == null && (
        <p className="t-dato" style={{ color: "var(--caducado)" }}>
          No se pudo leer lo que ya está pedido, así que activar algo ahora podría pedirlo dos veces. Vuelve a cargar
          la página; si sigue igual, falta aplicar <code>supabase/migracion-entrar-hoy.sql</code>, que es la que crea
          la tabla de los pedidos.
        </p>
      )}
      {GRUPOS_SECCION.map((g) => (
        <fieldset key={g.clave} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-etiqueta mb-2">{g.nombre}</legend>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {SECCIONES_QUE_ACTIVA_LA_CONSULTORA.filter((s) => SECCION[s].grupo === g.clave).map((s) => {
              const activa = activaDe(s);
              const ultima = ultimaDe(s);
              const estado = activa
                ? `Activa desde el ${diaMes(activa.activada_at, zona)}`
                : ultima?.estado === "completada"
                  ? `Completada el ${diaMes(ultima.completada_at, zona)}`
                  : ultima?.estado === "retirada"
                    ? "Retirada"
                    : null;
              const marcada = marcadas.includes(s);
              const ctx = contextoDe(s);
              return (
                <li key={s} className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--linea)", padding: "12px 0" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {activa ? (
                      <span className="t-dato" style={{ fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{SECCION[s].paraConsultora}</span>
                    ) : (
                      <label className="t-dato flex items-center gap-2" style={{ fontWeight: 600, minHeight: 44 }}>
                        <input type="checkbox" checked={marcada} disabled={trabajando} onChange={() => alternar(s)} />
                        {SECCION[s].paraConsultora}
                      </label>
                    )}
                    {/* Lo que nunca se pidió no lleva chip: once guiones vacíos solo hacían ruido. */}
                    {estado && <span className={`estado ${activa ? "ok" : "neutro"}`}>{estado}</span>}
                  </div>
                  {ctx && <p className="t-dato" style={{ color: "var(--grafito)" }}>{ctx}</p>}
                  {(marcada || activa) && (
                    <input
                      aria-label={`Nota para el dueño: ${SECCION[s].paraDueno}`}
                      className="campo"
                      maxLength={600}
                      value={notas[s] ?? ""}
                      placeholder="Lo que quieres que haga, en una frase"
                      onChange={(e) => setNotas((x) => ({ ...x, [s]: e.target.value }))}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {activa && (notas[s] ?? "").trim() !== (activa.nota ?? "").trim() && (
                      <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} disabled={trabajando} onClick={() => void enviar([s], "Nota guardada: el dueño la ve en su pedido.")}>
                        Guardar la nota
                      </button>
                    )}
                    {activa && (
                      <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} disabled={trabajando} onClick={() => void retirar(activa)}>
                        Retirar
                      </button>
                    )}
                    {!activa && ultima && !marcada && (
                      <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} disabled={trabajando} onClick={() => alternar(s)}>
                        Volver a pedir
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      {/* Con algo marcado, el botón acompaña al bajar por las once filas: no hay que ir a buscarlo al final. */}
      <div className="flex flex-wrap items-center gap-3" style={marcadas.length ? { position: "sticky", bottom: 12, zIndex: 1 } : undefined}>
        <button type="button" className="boton" disabled={trabajando || marcadas.length === 0} onClick={() => void enviar(marcadas, `Activado: ${marcadas.length} ${marcadas.length === 1 ? "pedido" : "pedidos"}. El dueño lo ve en Inicio y en «Lo que te pidió tu consultora».`)}>
          {trabajando ? "Activando…" : marcadas.length ? `Activar las marcadas (${marcadas.length})` : "Activar las marcadas"}
        </button>
      </div>
      {aviso && (
        <p className="t-dato" role={aviso.tipo === "error" ? "alert" : "status"} style={{ color: aviso.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>
          {aviso.texto}
        </p>
      )}
      {enlace && (
        <div className="panel p-4 flex flex-col gap-2" style={{ background: "var(--suave)" }}>
          <p className="t-dato">Mándale este enlace al dueño:</p>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Enlace para el dueño" className="campo" style={{ flex: "1 1 260px" }} readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="boton boton--secundario" onClick={() => void copiar()}>Copiar</button>
          </div>
          {copia && (
            <p className="t-dato" role={copia.tipo === "error" ? "alert" : "status"} style={{ color: copia.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>
              {copia.texto}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

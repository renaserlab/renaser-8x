import type { Rastro } from "@/lib/auditoria";
import { fechaCorta } from "@/lib/textos";

const VERBO: Record<string, string> = {
  ver: "Consultó", crear: "Creó", editar: "Cambió", eliminar: "Eliminó",
  publicar: "Publicó", aprobar: "Aprobó", descargar: "Descargó", entrar: "Entró", salir: "Salió",
};

const COSA: Record<string, string> = {
  informe_diagnostico: "el informe de diagnóstico",
  deliverables: "un documento",
  logo: "el logo",
  empresa: "los datos de la empresa",
  activos: "un documento en construcción",
  participants: "una persona entrevistada",
  sources: "un archivo subido",
  processes: "un proceso",
  claims: "una definición",
};

const hora = (s: string) => new Date(s).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

/**
 * EL HISTORIAL: quién tocó qué y cuándo. Hallazgo crítico de la auditoría del 29-08-2026 — no
 * existía forma de responder "¿quién vio o cambió los datos de mi empresa?". Es la cláusula A.8.15
 * de ISO 27001 y, para el dueño, es simplemente saber que nada pasa a sus espaldas.
 */
export function Historial({ rastro }: { rastro: Rastro[] }) {
  if (!rastro.length)
    return <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>Todavía no hay movimientos registrados.</p>;

  return (
    <ul className="lista-editorial mt-2">
      {rastro.map((r) => {
        const quien = r.actor?.nombre ?? r.actor?.email ?? (r.actor_rol === "consultor" ? "El consultor" : "Alguien de tu equipo");
        const que = COSA[r.entidad ?? ""] ?? r.entidad ?? "algo";
        return (
          <li key={r.id} style={{ padding: "9px 0" }}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="t-dato">
                <strong>{quien}</strong> · {VERBO[r.accion] ?? r.accion} {que}
                {r.actor_rol === "consultor" && <span style={{ color: "var(--grafito)" }}> (RENASER)</span>}
              </span>
              <span className="t-dato" style={{ flex: "none", color: "var(--grafito)", fontVariantNumeric: "tabular-nums" }}>
                {fechaCorta(r.created_at)} · {hora(r.created_at)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

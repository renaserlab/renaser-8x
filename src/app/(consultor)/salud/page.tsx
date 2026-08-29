import { requerirConsultor } from "@/lib/auth";
import { erroresRecientes, pulso24h } from "@/lib/errores";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Franja, Lectura } from "@/components/base/Franja";
import { fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

const hora = (s: string) => new Date(s).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

/**
 * SALUD DEL SISTEMA — hallazgo medio de la auditoría del 29-08-2026: los errores morían en la
 * consola de Vercel y solo te enterabas porque el cliente llamaba. Aquí se ven, con su ruta y su
 * hora, junto al movimiento reciente de todas las empresas. ISO 27001 A.8.16 (monitoreo).
 */
export default async function Salud() {
  await requerirConsultor();
  const sb = supabaseAdmin();
  const [errores, pulso, { data: rastro }] = await Promise.all([
    erroresRecientes(40),
    pulso24h(),
    sb.from("audit_log")
      .select("id,accion,entidad,ruta,actor_rol,created_at,companies(nombre),users!audit_log_actor_id_fkey(nombre,email)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  type Fila = {
    id: number; accion: string; entidad: string | null; ruta: string | null; actor_rol: string | null; created_at: string;
    companies: { nombre: string } | null; users: { nombre: string | null; email: string | null } | null;
  };
  const filas = (rastro ?? []) as unknown as Fila[];

  return (
    <>
      <h1 className="t-titulo mb-5">Salud del sistema</h1>

      <Franja columnas={3}>
        <Lectura divisor={false} valor={String(pulso.errores)} etiqueta="errores en 24 horas" color={pulso.errores > 0 ? "var(--contradicho)" : "var(--confirmado)"} />
        <Lectura valor={String(pulso.movimientos)} etiqueta="movimientos en 24 horas" />
        <Lectura valor={String(errores.length)} etiqueta="errores sin revisar" color={errores.length > 0 ? "var(--caducado)" : "var(--grafito)"} />
      </Franja>

      <h2 className="t-seccion mt-10 mb-3">Errores recientes</h2>
      {!errores.length ? (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Ningún error registrado. El sistema está limpio.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Cuándo</th><th>Dónde</th><th>Qué pasó</th></tr>
          </thead>
          <tbody>
            {errores.map((e) => (
              <tr key={e.id}>
                <td className="t-dato" style={{ whiteSpace: "nowrap", color: "var(--grafito)" }}>{fechaCorta(e.created_at)} {hora(e.created_at)}</td>
                <td className="t-dato">{e.metodo} {e.ruta}</td>
                <td style={{ color: "var(--contradicho)" }}>{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="t-seccion mt-12 mb-3">Movimiento reciente</h2>
      <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
        Quién hizo qué y sobre qué empresa. Este registro es inmutable: nadie puede editar ni borrar su propio rastro.
      </p>
      {!filas.length ? (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Todavía no hay movimientos registrados.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Empresa</th></tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id}>
                <td className="t-dato" style={{ whiteSpace: "nowrap", color: "var(--grafito)" }}>{fechaCorta(r.created_at)} {hora(r.created_at)}</td>
                <td className="t-dato">{r.users?.nombre ?? r.users?.email ?? "—"} <span style={{ color: "var(--grafito)" }}>({r.actor_rol ?? "?"})</span></td>
                <td className="t-dato">{r.accion} · {r.entidad ?? r.ruta}</td>
                <td className="t-dato">{r.companies?.nombre ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Subir } from "@/components/Subir";
import { hayTranscriptor } from "@/lib/ai";
import { VACIO, fechaCorta } from "@/lib/textos";
import { documentosDe, porTipo } from "@/lib/documental";
import { ControlDocumental } from "@/components/cliente/ControlDocumental";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const { data: fuentes } = await supabaseAdmin().from("sources").select("id,nombre,tipo,estado,fecha_origen,created_at, claims(count)").eq("company_id", c.companyId).eq("origen", "cliente").order("created_at", { ascending: false });
  const ESTADO: Record<string, string> = { subido: "Recibido", leyendo: "Leyendo", leido: "Leído", error: "No pudimos leerlo" };
  const grupos = porTipo(await documentosDe(c.companyId));
  return (
    <>
      <p className="t-etiqueta">Subir lo que tengas</p>
      <h1 className="t-titulo mt-2 mb-6">Documentos, fotos y notas de voz</h1>
      <Subir companyId={c.companyId} paraCliente transcriptor={hayTranscriptor()} />

      {/* CONTROL DOCUMENTAL (ISO 9001 7.5): versión, quién aprobó, y las anteriores marcadas
          como reemplazadas en vez de borradas. Auditoría del 29-08-2026. */}
      <h2 className="t-seccion mt-10 mb-1">Tus documentos y sus versiones</h2>
      <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
        Cada documento tiene una versión y una fecha de aprobación. Nada se pierde: al aprobar una versión nueva, la anterior queda guardada como reemplazada.
      </p>
      <ControlDocumental companyId={c.companyId} grupos={grupos} />

      <h2 className="t-seccion mt-10 mb-3">Lo que ya subiste</h2>
      {!fuentes?.length ? (
        <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>{VACIO.fuentes}</p>
      ) : (
        <ul className="flex flex-col">
          {fuentes.map((f) => (
            <li key={f.id} className="py-3 flex flex-wrap justify-between gap-2" style={{ borderBottom: "1px solid var(--linea)" }}>
              <span className="t-cuerpo">{f.nombre}</span>
              <span className="t-dato" style={{ color: f.estado === "error" ? "var(--contradicho)" : "var(--grafito)" }}>
                {ESTADO[f.estado] ?? f.estado} · {(f.claims as unknown as { count: number }[])?.[0]?.count ?? 0} definiciones · {fechaCorta(f.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

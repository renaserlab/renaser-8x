import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Subir } from "@/components/Subir";
import { hayTranscriptor } from "@/lib/ai";
import { VACIO, fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const { data: fuentes } = await supabaseAdmin().from("sources").select("id,nombre,tipo,estado,fecha_origen,created_at, claims(count)").eq("company_id", c.companyId).eq("origen", "cliente").order("created_at", { ascending: false });
  const ESTADO: Record<string, string> = { subido: "Recibido", leyendo: "Leyendo", leido: "Leído", error: "No pudimos leerlo" };
  return (
    <>
      <p className="t-etiqueta">Subir lo que tengas</p>
      <h1 className="t-titulo mt-2 mb-6">Documentos, fotos y notas de voz</h1>
      <Subir companyId={c.companyId} paraCliente transcriptor={hayTranscriptor()} />
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

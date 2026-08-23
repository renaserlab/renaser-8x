import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA } from "@/lib/textos";

const TABS: [string, string][] = [
  ["", "Panorama"],
  ["/fuentes", "Fuentes"],
  ["/afirmaciones", "Afirmaciones"],
  ["/realidad", "Realidad"],
  ["/entrevista", "Entrevista"],
  ["/procesos", "Procesos"],
  ["/diagnostico", "Diagnóstico"],
  ["/plan", "Plan"],
  ["/entrega", "Entrega"],
];

export default async function LayoutEmpresa({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = await supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision").eq("id", id).single();
  if (!c) notFound();
  return (
    <>
      <div className="no-imprimir mb-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <Link href={`/empresa/${id}`} className="t-seccion">{c.nombre}</Link>
          <span className="t-etiqueta">{ETAPA[c.etapa] ?? c.etapa}</span>
          {c.estado_admision !== "admitida" && <span className="t-etiqueta" style={{ color: "var(--caducado)" }}>{c.estado_admision}</span>}
        </div>
        <nav className="flex gap-1 mt-4 overflow-x-auto" style={{ borderBottom: "1px solid var(--linea)" }}>
          {TABS.map(([h, n]) => (
            <Link key={h} href={`/empresa/${id}${h}`} className="t-dato px-3 py-2" style={{ whiteSpace: "nowrap" }}>
              {n}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </>
  );
}

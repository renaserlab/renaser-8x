import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requerirCliente, empresaDelCliente } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavCliente } from "@/components/cliente/NavCliente";

export default async function LayoutCliente({ children }: { children: React.ReactNode }) {
  const u = await requerirCliente();
  let companyId: string | null;
  let vistaConsultor = false;
  if (u.rol === "consultor") {
    companyId = (await cookies()).get("ver_como")?.value || null;
    if (!companyId) redirect("/bandeja");
    vistaConsultor = true;
  } else {
    companyId = await empresaDelCliente(u.id);
  }
  const empresa = companyId ? (await supabaseAdmin().from("companies").select("nombre").eq("id", companyId).single()).data : null;
  const enlaces = [
    ["/portal", "Inicio"],
    ["/portal/hoy", "Mi empresa"],
    ["/portal/activos", "Tu información"],
    ["/portal/conversacion", "Conversar"],
    ["/portal/validar", "Confirmar"],
    ["/portal/procesos", "Procesos"],
    ["/portal/resultados", "Resultados"],
    ["/portal/plan", "Plan"],
  ];
  return (
    <div className="min-h-screen flex flex-col">
      {vistaConsultor && (
        <div className="no-imprimir px-4 py-2 flex items-center justify-between gap-3" style={{ background: "var(--marca)", color: "var(--papel)" }}>
          <span className="t-dato" style={{ fontWeight: 600 }}>Estás viendo el portal como lo ve el empresario</span>
          <a href="/api/consultor/ver-portal?salir=1" className="t-dato" style={{ color: "var(--papel)", textDecoration: "underline" }}>Volver a mi bandeja</a>
        </div>
      )}
      <header className="no-imprimir px-4 flex items-center justify-between gap-3" style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: 8 }}>
        <span className="t-dato" style={{ fontWeight: 600 }}>{empresa?.nombre ?? "Tu empresa"}</span>
        <form action="/api/auth/salir" method="post">
          <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", padding: "4px 0", font: "inherit" }}>Salir</button>
        </form>
      </header>
      {companyId && <NavCliente enlaces={enlaces as [string, string][]} />}
      <main className="flex-1 px-4 py-6 w-full" style={{ maxWidth: 760, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

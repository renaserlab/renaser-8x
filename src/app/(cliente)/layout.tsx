import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirCliente, empresaDelCliente } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function LayoutCliente({ children }: { children: React.ReactNode }) {
  const u = await requerirCliente();
  if (u.rol === "consultor") redirect("/bandeja");
  const companyId = await empresaDelCliente(u.id);
  const empresa = companyId ? (await supabaseAdmin().from("companies").select("nombre").eq("id", companyId).single()).data : null;
  const enlaces = [
    ["/portal", "Inicio"],
    ["/portal/documentos", "Subir"],
    ["/portal/conversacion", "Conversar"],
    ["/portal/validar", "Confirmar"],
    ["/portal/procesos", "Procesos"],
    ["/portal/resultados", "Resultados"],
    ["/portal/plan", "Plan"],
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="no-imprimir px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--linea)" }}>
        <div className="flex items-center gap-4">
          <span className="t-dato">{empresa?.nombre ?? "Tu empresa"}</span>
        </div>
        <form action="/api/auth/salir" method="post">
          <button className="boton boton--secundario" style={{ minHeight: 36 }}>Salir</button>
        </form>
      </nav>
      {companyId && (
        <div className="no-imprimir px-4 py-2 flex gap-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--linea)" }}>
          {enlaces.map(([href, nombre]) => (
            <Link key={href} href={href} className="boton boton--secundario" style={{ minHeight: 40, whiteSpace: "nowrap" }}>
              {nombre}
            </Link>
          ))}
        </div>
      )}
      <main className="flex-1 px-4 py-6 w-full" style={{ maxWidth: 760, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

import Link from "next/link";
import { requerirConsultor } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavConsultor } from "@/components/consultor/NavConsultor";

export default async function LayoutConsultor({ children }: { children: React.ReactNode }) {
  const u = await requerirConsultor();
  const { data: empresas } = await supabaseAdmin().from("companies").select("id,nombre").order("created_at", { ascending: false }).limit(8);
  return (
    <div className="min-h-screen flex">
      <NavConsultor empresas={(empresas ?? []).map((e) => ({ id: e.id, nombre: e.nombre }))} usuario={u.nombre ?? u.email ?? ""} />
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Barra superior: manda en móvil; en escritorio queda mínima porque la lateral navega. */}
        <nav className="no-imprimir flex items-center justify-between px-6 h-12 lg:hidden" style={{ borderBottom: "1px solid var(--linea)" }}>
          <Link href="/bandeja" className="t-etiqueta" style={{ color: "var(--tinta)", fontWeight: 700 }}>8X</Link>
          <form action="/api/auth/salir" method="post">
            <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grafito)", font: "inherit" }}>Salir</button>
          </form>
        </nav>
        <main className="flex-1 px-6 py-8 w-full" style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>{children}</main>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requerirConsultor } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavConsultor } from "@/components/consultor/NavConsultor";
import { Icono } from "@/components/base/Icono";

/**
 * Marco de la consultora (16-10-2026): la navegación al costado (NavConsultor → Lateral) y, a su derecha, la
 * columna con el contenido. La barra de avance de cada empresa va arriba de esa columna, en el layout de
 * /empresa/[id]: aquí todavía no se sabe de qué empresa se trata.
 */
export default async function LayoutConsultor({ children }: { children: React.ReactNode }) {
  const u = await requerirConsultor();
  const { data: empresas } = await supabaseAdmin().from("companies").select("id,nombre").order("created_at", { ascending: false }).limit(8);
  return (
    <div className="marco-app">
      <NavConsultor
        empresas={(empresas ?? []).map((e) => ({ id: e.id, nombre: e.nombre }))}
        usuario={u.nombre ?? u.email ?? ""}
        // En escritorio la torre está en la barra lateral (grupo «Sistema»); en celular, además, a un toque desde la franja de arriba.
        torre={
          <Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control">
            <Icono nombre="torre" />
          </Link>
        }
      />
      <div className="columna-app">
        <main className="contenido-app">
          <div className="hoja">{children}</div>
        </main>
      </div>
    </div>
  );
}

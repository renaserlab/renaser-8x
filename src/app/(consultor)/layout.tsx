import Link from "next/link";
import { requerirConsultor } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NavConsultor } from "@/components/consultor/NavConsultor";
import { Icono } from "@/components/base/Icono";

export default async function LayoutConsultor({ children }: { children: React.ReactNode }) {
  const u = await requerirConsultor();
  const { data: empresas } = await supabaseAdmin().from("companies").select("id,nombre").order("created_at", { ascending: false }).limit(8);
  return (
    <div className="min-h-screen flex flex-col">
      <NavConsultor
        empresas={(empresas ?? []).map((e) => ({ id: e.id, nombre: e.nombre }))}
        usuario={u.nombre ?? u.email ?? ""}
        // En escritorio la torre está en el menú completo; en celular, además, a un toque desde la cabecera.
        torre={
          <Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control">
            <Icono nombre="torre" />
          </Link>
        }
      />
      <main className="contenido-app flex-1">
        <div className="hoja">{children}</div>
      </main>
    </div>
  );
}

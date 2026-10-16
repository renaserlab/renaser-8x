import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirCliente, resolverEmpresaActiva } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ElegirEmpresa } from "./ElegirEmpresa";

export const dynamic = "force-dynamic";

/**
 * CAMBIAR DE EMPRESA. Cuando el dueño tiene varias y todavía no eligió, el layout del portal muestra
 * esta misma lista antes que nada; esta página es para cambiar después, con la activa señalada.
 */
export default async function ElegirEmpresaPagina() {
  const u = await requerirCliente();
  // El consultor cambia de empresa desde su bandeja («ver como el empresario»), no desde aquí.
  if (u.rol === "consultor") redirect("/portal");
  const r = await resolverEmpresaActiva(u.id);
  if (r.estado === "sin_empresa") redirect("/portal");

  const { data: lista } = await supabaseAdmin().from("companies").select("id,nombre").in("id", r.empresas).order("nombre");

  return (
    <>
      <h1 className="t-titulo mt-2 mb-2 medida">{r.empresas.length > 1 ? "¿Con cuál de tus empresas quieres trabajar?" : "Tu empresa en 8X"}</h1>
      <p className="t-cuerpo mb-6 medida" style={{ color: "var(--grafito)" }}>
        {r.empresas.length > 1 ? "Puedes cambiar cuando quieras. Lo que ves en el portal es siempre de una sola empresa a la vez." : "Por ahora tienes una sola empresa; cuando te inviten a otra, aquí podrás elegir."}
      </p>
      <ElegirEmpresa empresas={lista ?? []} activa={r.companyId} />
      {r.companyId && (
        <p className="mt-6">
          <Link href="/portal" className="t-dato" style={{ textDecoration: "underline" }}>Volver al inicio</Link>
        </p>
      )}
    </>
  );
}

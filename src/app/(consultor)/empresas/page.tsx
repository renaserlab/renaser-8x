import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { AdministrarEmpresa } from "@/components/consultor/AdministrarEmpresa";
import { ETAPA, fechaCorta } from "@/lib/textos";

export const dynamic = "force-dynamic";

export default async function Empresas() {
  const { data } = await supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision,created_at").order("created_at", { ascending: false });
  return (
    <>
      <Encabezado titulo="Empresas" acciones={<Link href="/empresas/nueva" className="boton">Nueva empresa</Link>} />
      {!data?.length ? (
        <Vacio texto="Todavía no hay empresas. La empresa #0 es la propia consultoría: empieza por ahí." accion="Crear la primera" href="/empresas/nueva" />
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Sector</th>
              <th>Admisión</th>
              <th>Etapa</th>
              <th>Creada</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="t-dato">
                  <Link href={`/empresa/${c.id}`}>{c.nombre}</Link>
                </td>
                <td>{c.sector ?? "—"}</td>
                <td>{c.estado_admision}</td>
                <td>{ETAPA[c.etapa] ?? c.etapa}</td>
                <td className="t-dato">{fechaCorta(c.created_at)}</td>
                <td>
                  <AdministrarEmpresa companyId={c.id} nombre={c.nombre} sector={c.sector} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

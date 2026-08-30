import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { TablaEmpresas, type FilaEmpresa } from "@/components/consultor/LimpiarEmpresas";

export const dynamic = "force-dynamic";

export default async function Empresas() {
  const sb = supabaseAdmin();
  const [{ data }, { data: fuentes }, { data: definiciones }, { data: hallazgos }, { data: miembros }] = await Promise.all([
    sb.from("companies").select("id,nombre,sector,etapa,estado_admision,created_at").order("created_at", { ascending: false }),
    // Se cuenta el contenido de TODAS de una vez: sin esto no se puede decidir qué es prueba y qué
    // costó semanas de conversación, y borrar a ciegas es como se pierden cosas.
    sb.from("sources").select("company_id"),
    sb.from("claims").select("company_id"),
    sb.from("findings").select("company_id"),
    sb.from("memberships").select("company_id"),
  ]);

  const contar = (filas: { company_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) if (f.company_id) m.set(f.company_id, (m.get(f.company_id) ?? 0) + 1);
    return m;
  };
  const cF = contar(fuentes);
  const cD = contar(definiciones);
  const cH = contar(hallazgos);
  const cM = contar(miembros);

  const empresas: FilaEmpresa[] = (data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    sector: c.sector,
    etapa: c.etapa,
    estado_admision: c.estado_admision,
    created_at: c.created_at,
    registros: (cF.get(c.id) ?? 0) + (cD.get(c.id) ?? 0) + (cH.get(c.id) ?? 0),
    personas: cM.get(c.id) ?? 0,
  }));

  return (
    <>
      <Encabezado titulo="Empresas" acciones={<Link href="/empresas/nueva" className="boton">Nueva empresa</Link>} />
      {!empresas.length ? (
        <Vacio texto="Todavía no hay empresas. La empresa #0 es la propia consultoría: empieza por ahí." accion="Crear la primera" href="/empresas/nueva" />
      ) : (
        <TablaEmpresas empresas={empresas} />
      )}
    </>
  );
}

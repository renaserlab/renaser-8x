import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { Organigrama } from "@/components/consultor/Organigrama";
import { ResumenOrganigrama } from "@/components/consultor/ResumenOrganigrama";
import { LecturaPersonas } from "@/components/consultor/LecturaPersonas";
import { estudioOrganigrama, lecturaDePersonas, type Puesto } from "@/lib/rules/organigrama";
import type { EstudioIA } from "@/components/consultor/EstudioOrganigrama";
import { FranjaSubido } from "@/components/procesos/FranjaSubido";
import { subidoEnSeccion } from "@/components/procesos/datos";
import { pedidosDelDueno, seccionDe } from "@/components/negocio/datos";
import { diaLargo } from "@/components/negocio/dato";
import { configDeEmpresa } from "@/lib/producto";

export const dynamic = "force-dynamic";

/**
 * El organigrama como ESTUDIO (pedido de Kelin): la estructura actual con sus reglas, y el estudio
 * del motor — qué quiere lograr esta empresa y qué puestos necesita construir para lograrlo.
 * De aquí: manual de funciones y cierre de procesos.
 *
 * Arriba (16-10-2026), «Lo que subió la empresa»: el organigrama que la empresa subió en «Tu información»
 * (company_assets personas.organigrama), con su estado de lectura, para abrirlo y el enlace a Fuentes; y si se lo
 * pediste, cuándo y si ya avisó que terminó. Todo leído de ESTA empresa, en la consulta.
 *
 * Revisión del 16-10-2026: arriba de todo, como en Procesos, el resumen —puestos, ocupados y vacantes, y cuántas reglas
 * del estudio cumple—; lo de siempre debajo, en su hoja.
 */
export default async function PaginaOrganigrama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data }, { data: est }, { data: vers }, subido, pedidos, config] = await Promise.all([
    sb.from("org_puestos").select("*").eq("company_id", id).order("orden").order("created_at"),
    sb.from("org_estudio").select("contenido,updated_at").eq("company_id", id).maybeSingle(),
    sb.from("org_estudio_versiones").select("creado_at").eq("company_id", id).order("creado_at", { ascending: false }).limit(20),
    subidoEnSeccion(id, "personas.organigrama"),
    pedidosDelDueno(id),
    configDeEmpresa(id),
  ]);
  const puestos = (data ?? []) as Puesto[];
  const pedido = pedidos.ok ? seccionDe(pedidos.valor, "subir_organigrama") : null;
  const estudio = estudioOrganigrama(puestos);
  return (
    <>
      <ResumenOrganigrama puestos={puestos} estudio={estudio} />
      <div className="hoja-suelta">
        <div className="no-imprimir">
          <Encabezado titulo="Organigrama" sub="No es un dibujo: es un estudio. El cliente declara cómo funciona, el motor diseña dos caminos, y lo que falta queda como trabajo de levantamiento." />
          <FranjaSubido
            titulo="Lo que subió la empresa"
            documento="organigrama"
            lectura={subido}
            enlaceFuentes={`/empresa/${id}/fuentes`}
            pedido={pedido}
            dia={(iso) => diaLargo(iso, config.zona_horaria)}
          />
        </div>
        <Organigrama
          companyId={id}
          puestos={puestos}
          estudio={estudio}
          estudioIA={(est?.contenido as EstudioIA) ?? null}
          estudioFecha={est?.updated_at ?? null}
          versiones={(vers ?? []).map((v) => v.creado_at as string)}
        />
        {/* Vacíos, duplicidades, sobrecarga y hoy frente al estudio (R9.1): una cuenta sobre lo que ya se leyó arriba. */}
        <LecturaPersonas lectura={lecturaDePersonas(puestos, est?.contenido ?? null)} />
      </div>
    </>
  );
}

import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { InventarioActivos } from "@/components/cliente/InventarioActivos";
import { bibliotecaRecomendada, type FindingLite } from "@/lib/biblioteca";

export const dynamic = "force-dynamic";

/** Datos empresariales guiados: qué existe hoy, por bloques. El diagnóstico dicta qué construir primero. */
export default async function Activos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [{ data }, { data: findings }, { data: emp }] = await Promise.all([
    sb.from("company_assets").select("clave,estado,nota,borrador,faltantes,implementacion,propuesta,propuesta_cambios,propuesta_estado").eq("company_id", c.companyId),
    sb.from("findings").select("patron,pilar,titulo,impacto,estado_revision").eq("company_id", c.companyId).neq("estado_revision", "rechazado").eq("requiere_validacion", false).limit(40),
    sb.from("companies").select("etapa_negocio").eq("id", c.companyId).single(),
  ]);
  const recomendados = (findings ?? []).length ? bibliotecaRecomendada((findings ?? []) as FindingLite[], emp?.etapa_negocio) : [];
  return (
    <>
      <p className="t-etiqueta">Tu información</p>
      <h1 className="t-titulo mt-2 mb-3 medida">Ayúdanos a entender cómo funciona tu empresa</h1>
      <p className="t-cuerpo mb-4 medida" style={{ color: "var(--grafito)" }}>
        Área por área: lo que exista —un documento, una foto del cuaderno, un audio— súbelo aquí mismo.
        Lo que nunca se escribió, cuéntanoslo con tus palabras.
      </p>
      {/* Todo lo tuyo, a un toque: los procesos dibujados y lo subido viven aquí dentro. */}
      <div className="flex flex-wrap gap-2 mb-8">
        <a href="/portal/procesos" className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Tus procesos dibujados</a>
        <a href="/portal/documentos" className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Todo lo que subiste</a>
        <a href="/portal/validar" className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Puntos por confirmar</a>
      </div>
      <InventarioActivos
        companyId={c.companyId}
        guardados={(data ?? []).map((d) => {
          const x = d as { borrador?: string | null; faltantes?: { pregunta: string }[] | null; implementacion?: { responsable?: string; desde?: string } | null; propuesta?: string | null; propuesta_cambios?: { cambio: string; por_que: string }[] | null; propuesta_estado?: string | null };
          return { clave: d.clave, estado: d.estado, nota: d.nota, borrador: x.borrador ?? null, faltantes: x.faltantes ?? null, implementacion: x.implementacion ?? null, propuesta: x.propuesta ?? null, propuesta_cambios: x.propuesta_cambios ?? null, propuesta_estado: x.propuesta_estado ?? null };
        })}
        prioridades={recomendados}
      />
    </>
  );
}

import { Encabezado } from "@/components/base/Vacio";
import { Eventos, type EventoFila } from "@/components/Eventos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resumen, DIAS_VENTANA, type Evento } from "@/lib/eventos";

export const dynamic = "force-dynamic";

/** EL DÍA: lo que pasó hoy, anotado en segundos. De aquí salen después los números de la empresa. */
export default async function Dia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // La ventana de días la calcula Postgres (`eventos_recientes`): la hora de Lima vive en la base y
  // una página de servidor no puede llamar Date.now() durante el render en esta versión de Next.
  const [{ data: personas }, { data: eventos }, { data: nombres }] = await Promise.all([
    sb.from("participants").select("id,nombre,puesto").eq("company_id", id).order("nombre"),
    sb.rpc("eventos_recientes", { p_company: id, p_dias: DIAS_VENTANA }),
    sb.from("participants").select("id,nombre").eq("company_id", id),
  ]);

  // El RPC devuelve la fila cruda; el nombre de la persona se pega aquí para no perder la relación.
  const porId = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const crudos = (eventos ?? []) as (Evento & { persona_id: string | null })[];
  const filas: EventoFila[] = crudos.map((e) => ({
    id: e.id, tipo: e.tipo, fecha: e.fecha, monto: e.monto, minutos: e.minutos, datos: e.datos,
    participants: e.persona_id ? { nombre: porId.get(e.persona_id) ?? "—" } : null,
  }));

  return (
    <>
      <Encabezado
        titulo="El día"
        sub="Tardanzas, facturación, proyectos trabados y lo que salió mal. Anotarlo toma segundos; de aquí salen los números que después se comparan."
      />
      <Eventos
        companyId={id}
        personas={personas ?? []}
        iniciales={filas}
        resumenInicial={resumen(filas as unknown as Evento[])}
      />
    </>
  );
}

import { protegido, ok, fallo, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tieneCiclo, type Puesto } from "@/lib/rules/organigrama";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/**
 * El estado del PUESTO, no de la persona. Cuando alguien renuncia, el puesto sigue existiendo: lo
 * que cambia es su estado, y hay procesos que ese mismo día se quedan sin dueño.
 */
export const ESTADOS_PUESTO = ["ocupado", "vacante", "en_seleccion", "cobertura_temporal"] as const;

const cambios = z.object({
  nombre: texto(80).optional(),
  mision: texto(300).optional().nullable(),
  decide: texto(300).optional().nullable(),
  persona: texto(80).optional().nullable(),
  respaldo: texto(80).optional().nullable(),
  reporta_a: z.string().uuid().optional().nullable(),
  por_que: texto(400).optional().nullable(),
  estado: z.enum(ESTADOS_PUESTO).optional().nullable(),
  /** Qué OTRO PUESTO cubre a este mientras no esté ocupado. Un puesto, nunca una persona. */
  cubierto_por: z.string().uuid().optional().nullable(),
  estado_desde: z.string().max(10).optional().nullable(),
});

/**
 * PATCH: editar un puesto. Un cambio de jefe que arme un ciclo se rechaza ANTES de guardar.
 *
 * Cuando el puesto deja de estar ocupado, la respuesta trae los procesos que lo nombran como
 * responsable: son los que quedaron sin dueño en ese momento. Es la mitad que faltaba del requisito
 * —«8X debe relacionar ese cambio con los procesos que podrían quedar descubiertos»— y es la
 * diferencia entre registrar una renuncia y verla venir.
 */
export const PATCH = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id, pid } = await ctx.params;
  const b = await leerValidado(req, cambios);
  const sb = supabaseAdmin();
  const { data: todos } = await sb.from("org_puestos").select("id,nombre,reporta_a,estado,cubierto_por").eq("company_id", id);
  const yo = (todos ?? []).find((x) => x.id === pid);
  if (!yo) return fallo("Puesto no encontrado", 404);

  if (b.reporta_a !== undefined) {
    if (b.reporta_a === pid) return fallo("Un puesto no puede reportarse a sí mismo");
    const simulados = (todos ?? []).map((x) => ({ ...x, nombre: "", reporta_a: x.id === pid ? b.reporta_a : x.reporta_a })) as Puesto[];
    if (tieneCiclo(simulados)) return fallo("Ese cambio arma un ciclo de reporte: alguien terminaría reportándose a sí mismo.");
  }

  // Quien cubre tiene que ser un puesto de esta misma empresa, y no este.
  if (b.cubierto_por) {
    if (b.cubierto_por === pid) return fallo("Un puesto no se cubre a sí mismo.");
    if (!(todos ?? []).some((x) => x.id === b.cubierto_por)) {
      return fallo("El puesto que cubre no es de esta empresa. La cobertura es entre puestos del mismo organigrama.");
    }
  }

  // Un puesto «cubierto temporalmente» sin decir por qué puesto no está cubierto: está sin dueño
  // con una etiqueta tranquilizadora, que es peor que estar vacante a la vista.
  const estadoFinal = b.estado !== undefined ? b.estado : (yo.estado as string | null);
  const cubreFinal = b.cubierto_por !== undefined ? b.cubierto_por : (yo.cubierto_por as string | null);
  if (estadoFinal === "cobertura_temporal" && !cubreFinal) {
    return fallo("Para dejarlo en cobertura temporal hay que decir qué puesto lo cubre. Si no hay quién, el estado es «vacante».");
  }

  const { error } = await sb.from("org_puestos").update({ ...b, updated_at: new Date().toISOString() }).eq("id", pid);
  if (error) return fallo(error.message, 500);

  // Si el puesto dejó de estar ocupado, se dice qué se quedó sin dueño. No se bloquea el cambio:
  // la renuncia ya ocurrió. Lo que no puede pasar es que ocurra y nadie vea el hueco.
  let descubierto: { procesos: string[]; aviso: string } | undefined;
  if (b.estado !== undefined && b.estado !== "ocupado" && b.estado !== null) {
    const { data: procesos } = await sb.from("processes").select("nombre").eq("company_id", id).eq("responsable", yo.nombre);
    const nombres = (procesos ?? []).map((x) => x.nombre as string);
    descubierto = {
      procesos: nombres,
      aviso: nombres.length
        ? `${nombres.length === 1 ? "Un proceso queda" : `${nombres.length} procesos quedan`} sin dueño mientras «${yo.nombre}» no esté ocupado.`
        : `Ningún proceso nombra a «${yo.nombre}» como responsable. O no se le asignó ninguno todavía, o los suyos están a nombre de otro.`,
    };
  }

  return ok({ id: pid, ...(descubierto ? { descubierto } : {}) });
});

export const DELETE = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id, pid } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("org_puestos").select("id").eq("id", pid).eq("company_id", id).maybeSingle();
  if (!p) return fallo("Puesto no encontrado", 404);
  // Los que le reportaban quedan sin jefe (SET NULL): el estudio lo señalará — nada se rompe en silencio.
  const { error } = await sb.from("org_puestos").delete().eq("id", pid);
  if (error) return fallo(error.message, 500);
  return ok({ eliminado: true });
});

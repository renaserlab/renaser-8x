import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente, rondaDe, canonico } from "@/lib/jobs/queue";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { porQueNoSeConstruye, queLeerAntesDeConstruir, type DocDelActivo, type Estado, type Origen } from "@/lib/expediente";

type Ctx = { params: Promise<{ id: string }> };

const CLAVES = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/**
 * "No lo tengo" → lo construimos contigo (bloqueador 3).
 * body: { clave, respuestas?: [{pregunta, respuesta}] } → encola el CONSTRUCTOR (usa todo lo ya sabido,
 * pregunta solo huecos, genera borrador). El dueño luego confirma en /assets/confirmar.
 *
 * ANTES DE CONSTRUIR SE MIRA EL EXPEDIENTE. Es la regla de Kelin del 18-10-2026 —«no generar
 * documentos sin revisar las versiones anteriores»— puesta donde no depende de que nadie se
 * acuerde. Ese mismo día escribí un Manual de Selección para la primera empresa cliente sin ver que su
 * procedimiento APO-REC-01 ya existía en su Drive: es el error que esta comprobación hace
 * imposible.
 */
export const POST = protegido<Ctx>({ cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ clave?: string; respuestas?: { pregunta: string; respuesta: string }[] }>(req);
  if (!b.clave || !CLAVES.has(b.clave)) return fallo("Activo desconocido.");
  const sb = supabaseAdmin();

  const { data: yaHay, error: errExp } = await sb
    .from("expediente_documental")
    .select("estado,origen,revision_documental(count)")
    .eq("company_id", id)
    .eq("activo_clave", b.clave);
  // Si no se pudo leer el expediente, NO se construye: construir a ciegas es exactamente el error
  // que esto viene a evitar, y hacerlo «por si acaso» lo repite con la conciencia tranquila.
  if (errExp) return fallo(`No se pudo leer el expediente para ver si esto ya existe: ${errExp.message}`, 500);

  const docs: DocDelActivo[] = (yaHay ?? []).map((d) => ({
    estado: d.estado as Estado,
    origen: d.origen as Origen,
    revisado_contra_vara: ((d.revision_documental as unknown as { count: number }[] | null)?.[0]?.count ?? 0) > 0,
  }));
  const noSeConstruye = porQueNoSeConstruye(docs);
  if (noSeConstruye) return fallo(noSeConstruye, 409);
  // Lo aportado por la empresa que no es un entregable —apuntes, una transcripción, un listado
  // informal— no impide construir, pero se devuelve con el trabajo encolado para que quien lo
  // revise lo lea. Va en la respuesta y no en un bloqueo: un aviso que se puede ignorar sin
  // consecuencia enseña a ignorar también los que sí importan.
  const leerAntes = queLeerAntesDeConstruir(docs);
  await sb.from("company_assets").upsert({ company_id: id, bloque: b.clave.split(".")[0], clave: b.clave, estado: "construyendo", updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  const respuestas = (b.respuestas ?? []).slice(0, 5);
  // La clave es «la construcción número N de este activo con estas respuestas», no la hora: un doble
  // clic devuelve el mismo trabajo; cuando esa construcción termina, la siguiente petición abre la N+1.
  const ronda = await rondaDe("construir_activo", id, { clave: b.clave });
  const job = await encolar({ company_id: id, tipo: "construir_activo", payload: { clave: b.clave, respuestas }, prioridad: PRIORIDAD.proceso_voz, idempotency_key: claveIdempotente(["construir", id, b.clave, `ronda:${ronda}`, canonico(respuestas)]) });
  return ok({ job_id: job.id, ...(leerAntes ? { leer_antes: leerAntes } : {}) });
});

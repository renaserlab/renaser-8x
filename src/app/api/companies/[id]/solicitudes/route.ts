import { protegido, ok, fallo, leerJSON, exigirAcceso, EntradaInvalida } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listarSolicitudes, esSeccion, solicitudDesdeFila, ErrorDeSolicitud, faltaLaTabla, SECCIONES, type Solicitud } from "@/lib/solicitudes";
import { CuerpoActivar } from "@/lib/esquemas-negocio";
import { TEXTO_FALTA_MIGRACION } from "@/lib/negocio-datos";
import { respuestaDeBase } from "../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/solicitudes";

/**
 * GET: lo que la consultora le pidió a la empresa. La consultora ve todas (también las retiradas, con quién y cuándo);
 * el dueño, las activas y las completadas, sin las retiradas y sin quién las activó: se filtra en la consulta.
 */
export const GET = protegido<Ctx>({ entidad: "solicitud_cliente" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  try {
    const solicitudes = await listarSolicitudes(id, { paraDueno: perfil.rol !== "consultor" });
    return ok({ solicitudes });
  } catch (e) {
    if (e instanceof ErrorDeSolicitud && faltaLaTabla(e.codigo)) return fallo(TEXTO_FALTA_MIGRACION, 409);
    throw e;
  }
});

/**
 * POST (consultora): activar para el cliente una o varias secciones, cada una con su nota opcional. Si ya hay una
 * activa de esa sección, no se crea otra (la base lo impide): se le actualiza la nota. Una completada o retirada se
 * «vuelve a pedir» creando una activa nueva; la anterior queda en la historia.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "solicitud_cliente" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const crudo = await leerJSON<{ secciones?: { seccion?: unknown }[] }>(req);
  const desconocida = Array.isArray(crudo.secciones) ? crudo.secciones.find((s) => s && !esSeccion(s.seccion)) : undefined;
  if (desconocida) return fallo(`No conocemos la sección «${String(desconocida.seccion)}». Las que hay son: ${SECCIONES.join(", ")}.`, 400);
  const r = CuerpoActivar.safeParse(crudo);
  if (!r.success) throw new EntradaInvalida([...new Set(r.error.issues.map((i) => i.path.join(".") || "cuerpo"))]);

  const sb = supabaseAdmin();
  const hechas: Solicitud[] = [];
  const unicas = new Map(r.data.secciones.map((s) => [s.seccion, s.nota ?? null]));
  for (const [seccion, nota] of unicas) {
    const { data: activa, error: errorLeer } = await sb.from("solicitudes_cliente").select("id").eq("company_id", id).eq("seccion", seccion).eq("estado", "activa").maybeSingle();
    if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "POST", que: "activar lo pedido", perfil, companyId: id });
    const columnas = "id,company_id,seccion,nota,estado,activada_at,completada_at";
    const escritura = activa
      ? await sb.from("solicitudes_cliente").update({ nota }).eq("id", (activa as { id: string }).id).eq("company_id", id).select(columnas).maybeSingle()
      : await sb.from("solicitudes_cliente").insert({ company_id: id, seccion, nota, estado: "activa", activada_por: perfil.id }).select(columnas).single();
    // Otra pestaña la activó en el mismo instante: la base no deja dos activas de la misma sección.
    if (escritura.error?.code === "23505") return fallo("Ese pedido se acaba de activar desde otra pantalla: vuelve a cargar la página.", 409);
    if (escritura.error) return respuestaDeBase(escritura.error, { ruta: RUTA, metodo: "POST", que: "activar lo pedido", perfil, companyId: id });
    const s = escritura.data ? solicitudDesdeFila(escritura.data as unknown as Record<string, unknown>, id) : null;
    if (s) hechas.push(s);
    void registrar({
      companyId: id, actor: perfil, accion: activa ? "editar" : "crear", entidad: "solicitud_cliente", entidadId: s?.id ?? null,
      detalle: { seccion, nota, ya_estaba_activa: !!activa }, ruta: RUTA, ip: ipDe(req),
    });
  }
  refrescarRuta(id, "ruta");
  return ok({ solicitudes: hechas }, 201);
});

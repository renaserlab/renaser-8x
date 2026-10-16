import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, uuid, AccesoDenegado } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { crearActa, contenidoDeMedicion, rutaActa, TIPOS_ACTA } from "@/lib/actas";
import { COLUMNAS_MEDICION, type Medicion } from "@/lib/medicion";
import { cargarActas } from "@/components/medicion/datos";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  tipo: z.enum(TIPOS_ACTA),
  referencia_id: uuid,
  nombre: z.string().trim().max(120).optional(),
  /** Para plan y ficha de dirección, el contenido literal que se acepta lo manda quien lo construyó; las mediciones se copian de la base. */
  contenido: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().positive().optional(),
});

/**
 * ACEPTAR: QUIÉN, QUÉ, CUÁNDO Y CON QUÉ CONTENIDO. El consultor con autoridad para cerrar mediciones
 * puede levantar acta de cualquier tipo; el dueño de la empresa (membresía `dueno`) acepta SU punto de
 * partida y SUS cortes. El contenido de una medición se copia literal de la base en este momento, se
 * calcula su huella y queda guardado: después se podrá comprobar si lo que hay coincide con lo aceptado.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  let rolActa: string;
  if (perfil.rol === "consultor") {
    await exigirAutoridad(perfil, "cerrar_medicion");
    rolActa = "consultor";
  } else {
    const { data: m } = await sb.from("memberships").select("nivel").eq("user_id", perfil.id).eq("company_id", id).maybeSingle();
    if (m?.nivel !== "dueno") throw new AccesoDenegado("Solo el dueño de la empresa puede aceptar su punto de partida y sus cortes.", "autoridad", id);
    if (b.tipo !== "linea_base" && b.tipo !== "corte" && b.tipo !== "ficha_direccion")
      throw new AccesoDenegado("Desde el portal se aceptan el punto de partida y los cortes; el plan y la ficha se aceptan con la consultora.", "autoridad", id);
    rolActa = "dueno";
  }

  let contenido: Record<string, unknown>;
  let version: number;
  if (b.tipo === "linea_base" || b.tipo === "corte") {
    const { data: med, error } = await sb.from("mediciones").select(COLUMNAS_MEDICION).eq("id", b.referencia_id).eq("company_id", id).maybeSingle();
    if (error) return fallo(error.message, 500);
    if (!med) return fallo("Esa medición no existe o no es de esta empresa.", 404);
    const medicion = med as unknown as Medicion;
    if (medicion.tipo !== b.tipo) return fallo(`La referencia es un ${medicion.tipo === "corte" ? "corte" : "punto de partida"}, no un ${b.tipo === "corte" ? "corte" : "punto de partida"}.`, 400);
    contenido = contenidoDeMedicion(medicion);
    version = medicion.version ?? 1;
  } else if (b.tipo === "ficha_direccion") {
    const { data: ficha, error } = await sb.from("ficha_direccion").select("id,version,estado,bloques,dependencia").eq("id", b.referencia_id).eq("company_id", id).maybeSingle();
    if (error) return fallo("No se pudo leer la ficha que intentas confirmar.", 500);
    if (!ficha) return fallo("La ficha no pertenece a esta empresa.", 404);
    if (ficha.estado !== "acordada" || (b.version != null && b.version !== ficha.version)) return fallo("La ficha cambió o todavía no ha sido revisada. Revisa la versión vigente.", 409);
    contenido = { id: ficha.id, bloques: ficha.bloques, dependencia: ficha.dependencia };
    version = ficha.version;
  } else {
    if (!b.contenido || Object.keys(b.contenido).length === 0) return fallo("Para aceptar un plan o una ficha hay que mandar el contenido literal que se acepta.", 400);
    contenido = b.contenido;
    version = b.version ?? 1;
  }

  const acta = await crearActa(
    {
      company_id: id,
      tipo: b.tipo,
      referencia_id: b.referencia_id,
      version,
      contenido,
      aceptado_por: perfil.id,
      nombre: b.nombre ?? perfil.nombre ?? perfil.email,
      rol: rolActa,
    },
    sb
  );

  void registrar({
    companyId: id, actor: perfil, accion: "aprobar", entidad: "acta", entidadId: acta.id,
    detalle: { tipo: b.tipo, referencia_id: b.referencia_id, version, hash: acta.hash_contenido, rol: rolActa },
    ruta: "/api/companies/actas", ip: ipDe(req),
  });
  return ok({ acta, ruta: rutaActa(acta.id) }, 201);
});

/** Las actas de la empresa, la más reciente primero. El consultor y los miembros de la empresa. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const actas = await cargarActas(supabaseAdmin(), id);
  return ok({ actas: actas.map((a) => ({ ...a, ruta: a.documento_path ?? rutaActa(a.id) })) });
});

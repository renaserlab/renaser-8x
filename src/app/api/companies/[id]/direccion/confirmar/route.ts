import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, uuid, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { crearActa, ROLES_DUENO } from "@/lib/actas";
import { acordadaVigente, vistaCliente, rutaConstancia } from "@/lib/ficha-direccion";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({ ficha_id: uuid, version: z.number().int().positive() });

/**
 * EL DUEÑO CONFIRMA HACIA DÓNDE VA SU EMPRESA. Queda un acta con quién confirmó, cuándo, qué versión y el
 * contenido EXACTO que leyó: la ficha tal como se le mostró en su portal (`vistaCliente`), no la fila interna
 * con identificadores de fuentes y notas de trabajo. Así la constancia que después abre dice lo mismo que vio al
 * confirmar. La respuesta lo lleva a esa constancia en palabras (/portal/direccion/constancia); el documento
 * completo, con su huella y la nota jurídica, sigue en /acta/[id] y se enlaza desde ahí.
 *
 * Solo confirma quien es dueño de la empresa (membresía `dueno`): la consultora, aunque mire el portal como lo
 * ve él, no confirma en su nombre. Solo se confirma la versión acordada vigente: si mientras tanto se acordó
 * otra, se responde 409 y se le pide leer la nueva. Confirmar dos veces la misma versión devuelve la misma acta.
 */
export const POST = protegido<Ctx>({ entidad: "ficha_direccion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (perfil.rol !== "cliente") throw new AccesoDenegado("La ficha la confirma el dueño de la empresa, desde su portal.", "rol", id);
  const sb = supabaseAdmin();
  const { data: m } = await sb.from("memberships").select("nivel").eq("user_id", perfil.id).eq("company_id", id).maybeSingle();
  if (m?.nivel !== "dueno") throw new AccesoDenegado("Solo el dueño de la empresa puede confirmar hacia dónde va.", "autoridad", id);

  const b = await leerValidado(req, Cuerpo);
  const ficha = await acordadaVigente(id, sb);
  if (!ficha || ficha.id !== b.ficha_id || ficha.version !== b.version) {
    return fallo("Esta versión ya no es la vigente. Recarga la página y lee la versión nueva antes de confirmar.", 409);
  }

  const { data: previas, error } = await sb
    .from("actas_aceptacion")
    .select("id,aceptado_at")
    .eq("company_id", id)
    .eq("tipo", "ficha_direccion")
    .eq("referencia_id", ficha.id)
    .in("aceptado_rol", [...ROLES_DUENO])
    .order("aceptado_at", { ascending: false })
    .limit(1);
  if (error) return fallo(`No se pudo comprobar si ya habías confirmado esta versión: ${error.message}`, 500);
  if (previas?.length) return ok({ ruta: rutaConstancia(String(previas[0].id)), aceptado_at: previas[0].aceptado_at, ya_estaba: true });

  const acta = await crearActa(
    {
      company_id: id,
      tipo: "ficha_direccion",
      referencia_id: ficha.id,
      version: ficha.version,
      contenido: vistaCliente(ficha),
      aceptado_por: perfil.id,
      nombre: perfil.nombre ?? perfil.email,
      rol: "dueno",
    },
    sb
  );
  void registrar({
    companyId: id, actor: perfil, accion: "aprobar", entidad: "acta", entidadId: acta.id,
    detalle: { tipo: "ficha_direccion", referencia_id: ficha.id, version: ficha.version, hash: acta.hash_contenido, rol: "dueno" },
    ruta: "/api/companies/direccion/confirmar", ip: ipDe(req),
  });
  return ok({ ruta: rutaConstancia(acta.id), aceptado_at: acta.aceptado_at, ya_estaba: false }, 201);
});

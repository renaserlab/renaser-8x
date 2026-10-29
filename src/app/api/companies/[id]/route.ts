import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prepararBorradoEmpresa } from "@/lib/borrar-empresa";

type Ctx = { params: Promise<{ id: string }> };

export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { data } = await supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision,fase_actual,created_at").eq("id", id).single();
  return data ? ok(data) : fallo("Empresa no encontrada", 404);
});

export const PATCH = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<Record<string, unknown>>(req);
  const permitidos = [
    "nombre", "sector", "etapa", "estado_admision", "motivo_rechazo", "fase_actual", "tope_tokens", "admision",
    // LA PRÓXIMA SESIÓN Y SU ENLACE, A MANO. Se construyó un contador de sesiones del contrato y lo
    // que Kelin pidió fue lo contrario: «el contrato ya se venció… eso yo debería de poder añadirlo
    // a mano, próxima sesión y enlace de reunión». Hay empresas sin contrato vigente y sesiones que
    // se mueven; un número deducido de un contrato vencido no sirve para nada.
    "proxima_sesion", "enlace_reunion",
  ];
  const cambios = Object.fromEntries(Object.entries(b).filter(([k]) => permitidos.includes(k)));

  // Los dos campos a mano se validan: una fecha que Postgres rechaza devuelve un error de base que
  // nadie entiende, y cualquier texto aceptado como «enlace» acaba en un enlace que no abre.
  if ("proxima_sesion" in cambios && cambios.proxima_sesion !== null) {
    const f = String(cambios.proxima_sesion).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f))) {
      return fallo("La próxima sesión va como fecha, en formato año-mes-día (por ejemplo 2026-11-03). Para quitarla, manda nada.", 400);
    }
    cambios.proxima_sesion = f;
  }
  if ("enlace_reunion" in cambios && cambios.enlace_reunion !== null) {
    const e = String(cambios.enlace_reunion).trim();
    if (!e) {
      cambios.enlace_reunion = null;
    } else if (!/^https?:\/\/\S+$/i.test(e) || e.length > 500) {
      return fallo("El enlace de la reunión tiene que empezar por http:// o https://. Para quitarlo, manda nada.", 400);
    } else {
      cambios.enlace_reunion = e;
    }
  }

  const sb = supabaseAdmin();
  // La ficha se FUSIONA, nunca se reemplaza: el consultor puede fijar la meta mensual sin pisar lo del cliente.
  if (b.ficha && typeof b.ficha === "object") {
    const { data: actual } = await sb.from("companies").select("ficha").eq("id", id).single();
    cambios.ficha = { ...((actual?.ficha as Record<string, unknown>) ?? {}), ...(b.ficha as Record<string, unknown>) };
  }
  const { data, error } = await sb.from("companies").update(cambios).eq("id", id).select("*").single();
  if (error) return fallo(error.message, 500);
  return ok(data);
});

/** P2-04: al borrar la empresa se borran también sus archivos del bucket (el cascade de SQL no toca Storage). */
export const DELETE = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: archivos } = await sb.rpc("archivos_de_empresa", { p_company_id: id });
  const rutas = (archivos as string[] | null) ?? [];
  for (let i = 0; i < rutas.length; i += 100) await sb.storage.from("fuentes").remove(rutas.slice(i, i + 100));
  // Suelta los enlaces que bloquean la cascada antes de borrar (ver lib/borrar-empresa.ts).
  await prepararBorradoEmpresa(id);
  const { error } = await sb.from("companies").delete().eq("id", id);
  if (error) return fallo(error.message, 500);
  return ok({ eliminada: true, archivos: rutas.length });
});

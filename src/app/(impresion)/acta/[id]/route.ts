import { NextResponse } from "next/server";
import { perfilApi, puedeAcceder } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { exportarActa, verificarActa, contenidoDeMedicion, nombreReferencia, type Acta, type Verificacion } from "@/lib/actas";
import { COLUMNAS_MEDICION, type Medicion } from "@/lib/medicion";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function pagina(mensaje: string, status: number): Response {
  const cuerpo = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta</title></head><body style="font-family:system-ui,sans-serif;padding:32px"><p>${mensaje}</p></body></html>`;
  return new Response(cuerpo, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * EL ACTA EN LIMPIO, LISTA PARA IMPRIMIR O GUARDAR COMO PDF. Es un documento autocontenido (ver
 * exportarActa), no una pantalla del portal: sin navegación, con la nota jurídica a la vista. La ve
 * quien puede ver la empresa: el consultor, o un miembro de ella. Al abrirla se comprueba si lo que
 * hoy hay en la base coincide con lo aceptado; si la referencia cambió después, el documento lo dice.
 */
export async function GET(req: Request, ctx: Ctx) {
  const perfil = await perfilApi();
  if (!perfil) return NextResponse.redirect(new URL("/entrar", req.url));
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data, error } = await sb.from("actas_aceptacion").select("*").eq("id", id).maybeSingle();
  if (error) return pagina(`No se pudo leer el acta: ${error.message}`, 500);
  if (!data) return pagina("Acta no encontrada.", 404);
  const acta = data as Acta;

  if (!(await puedeAcceder(perfil, acta.company_id))) {
    void registrar({ actor: perfil, accion: "denegado", entidad: "acta", entidadId: id, ruta: `/acta/${id}`, ip: ipDe(req), detalle: { motivo: "pertenencia", empresa: acta.company_id, metodo: "GET" } });
    return pagina("No tienes acceso a esta acta.", 403);
  }

  const { data: emp } = await sb.from("companies").select("nombre").eq("id", acta.company_id).maybeSingle();

  // Comprobación contra la referencia actual: el acta no cambia; lo que puede haber cambiado es la base.
  let verificacion: Verificacion | null = null;
  let medicion: Medicion | null = null;
  if (acta.tipo === "linea_base" || acta.tipo === "corte") {
    const { data: med } = await sb.from("mediciones").select(COLUMNAS_MEDICION).eq("id", acta.referencia_id).maybeSingle();
    medicion = (med as unknown as Medicion | null) ?? null;
    verificacion = medicion
      ? verificarActa(acta, contenidoDeMedicion(medicion))
      : { resultado: "difiere", hashActa: acta.hash_contenido, hashActual: "", motivo: "La medición a la que se refiere esta acta ya no está en la base. El acta conserva lo que se aceptó." };
  }

  void registrar({ companyId: acta.company_id, actor: perfil, accion: "descargar", entidad: "acta", entidadId: id, ruta: `/acta/${id}`, ip: ipDe(req), detalle: { verificacion: verificacion?.resultado ?? null } });

  const html = exportarActa(acta, { empresa: emp?.nombre ?? null, verificacion, nombreMedicion: nombreReferencia(acta, medicion) });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

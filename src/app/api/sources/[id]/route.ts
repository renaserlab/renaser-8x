import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** La fuente original con sus fragmentos y un enlace firmado al archivo (clic en una fila de la matriz). */
export const GET = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,tipo,nombre,fecha_origen,contenido,storage_path,mime,origen,estado").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  // P0-03: las transcripciones de entrevistas del equipo nunca se abren desde el portal del cliente.
  if (perfil.rol !== "consultor" && s.tipo === "entrevista") return fallo("Las conversaciones del equipo no se abren aquí.", 403);
  const fragmentId = new URL(req.url).searchParams.get("fragment");
  const { data: fragmentos } = await sb.from("source_fragments").select("*").eq("source_id", id);
  let url: string | null = null;
  if (s.storage_path) {
    const { data } = await sb.storage.from("fuentes").createSignedUrl(s.storage_path, 600);
    url = data?.signedUrl ?? null;
  }
  const fragmento = fragmentId ? (fragmentos ?? []).find((f) => f.id === fragmentId) ?? null : null;
  return ok({ fuente: { ...s, contenido: s.contenido?.slice(0, 20000) ?? null }, fragmento, fragmentos: fragmentos ?? [], url });
});

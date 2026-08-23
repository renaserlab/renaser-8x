import { protegido, ok, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimsDeEmpresa, etiquetaFuente, columnaEspejo } from "@/lib/db/queries";
import { filaCliente, visibleParaCliente, sinColumnasInternas } from "@/lib/frontera";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Matriz de Realidad.
 * Consultor: todo. Cliente (P0-02): solo la fila construida por `filaCliente` — misma forma que la vista `claims_cliente` —
 * y nunca lo dicho por otras personas (P0-03).
 */
export const GET = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 200);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  if (perfil.rol !== "consultor") {
    const { data: mios } = await supabaseAdmin().from("participants").select("id").eq("company_id", id).eq("user_id", perfil.id);
    const propios = new Set((mios ?? []).map((p) => p.id));
    const todas = await claimsDeEmpresa(id);
    const porId = new Map(todas.map((c) => [c.id, c]));
    const visibles = todas.filter((c) => visibleParaCliente(c, propios));
    const filas = visibles.slice(offset, offset + limit).map((c) => {
      const otra = c.contradice_a ? porId.get(c.contradice_a) : null;
      const contraparte = otra && visibleParaCliente(otra, propios) ? { texto: otra.texto, fuente: etiquetaFuente(otra) } : null;
      const fila = filaCliente(c, etiquetaFuente(c), c.sources?.tipo ?? null, contraparte);
      if (!sinColumnasInternas(fila)) throw new Error("Frontera violada");
      return fila;
    });
    return ok({ filas, total: visibles.length });
  }

  const pilar = url.searchParams.get("pilar") ?? undefined;
  const estado = url.searchParams.get("estado") ?? undefined;
  const claims = await claimsDeEmpresa(id, { pilar, estado, limit, offset });
  const filas = claims.map((c) => ({
    id: c.id,
    texto: c.texto,
    tipo: c.tipo,
    temporalidad: c.temporalidad,
    fecha: c.fecha_afirmacion,
    fuente: etiquetaFuente(c),
    source_id: c.source_id,
    fragment_id: c.fragment_id,
    columna: columnaEspejo(c),
    prioridad_validacion: c.prioridad_validacion,
    pilar: c.pilar,
    estado: c.estado,
    contradice_a: c.contradice_a,
    explicacion: c.explicacion_contradiccion,
    pregunta: c.pregunta_sugerida,
  }));
  return ok({ filas, total: filas.length });
});

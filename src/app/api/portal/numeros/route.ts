import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/auditoria";
import { CLAVES_VITALES, PERIODO_DORADA, normalizarMetrica } from "@/lib/metricas";

/**
 * LOS NÚMEROS DEL NEGOCIO, contados por el propio dueño.
 *
 * Hasta hoy los números solo entraban por lo que la IA lograba pescar de la conversación, y por eso
 * la radiografía nunca se cerraba. Aquí el dueño los pone directo, y —lo que faltaba de verdad— los
 * pone POR MES: sin serie mensual no hay "cómo estuvo", no hay tendencia y no hay con qué comparar
 * después. Todo lo que entra por aquí es "contado" (lo dice de memoria), nunca "verificado".
 */
const mes = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "el mes debe ser AAAA-MM");
const monto = z.number().finite().min(0).max(1_000_000_000);

const Cuerpo = z.object({
  /** Los vitales que no cambian mes a mes: caja, deudas, precio, costo, conversión. */
  vitales: z.record(z.string(), z.union([monto, z.null()])).optional(),
  /** La serie mensual: mes pasado, mejor mes y peor mes son tres puntos reales. */
  meses: z.array(z.object({ periodo: mes, venta: monto.nullable(), ganancia: monto.nullable().optional(), gasto_fijo: monto.nullable().optional() })).max(24).optional(),
  /** El mejor mes de la historia, cuando fue hace más de un año y solo se recuerda el monto. */
  epoca_dorada: monto.nullable().optional(),
  /** En qué meses vende más y en cuáles menos. Cambia por completo cómo se lee una caída. */
  temporadas: z.object({ altas: z.array(z.string().max(20)).max(12), bajas: z.array(z.string().max(20)).max(12) }).optional(),
  /** Cuando el dueño dice que un número no lo sabe: eso es un hallazgo, no un vacío. */
  sin_dato: z.array(z.string().max(60)).max(12).optional(),
});

export const POST = protegido({}, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Todavía no tienes empresa.", 404);
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();

  type Fila = { clave: string; periodo: string; valor: number | null; estado: string };
  const filas: Fila[] = [];

  for (const [claveBruta, valor] of Object.entries(b.vitales ?? {})) {
    const { clave, periodo } = normalizarMetrica(claveBruta, "actual");
    if (!CLAVES_VITALES.has(clave) || valor == null) continue;
    filas.push({ clave, periodo, valor, estado: "contado" });
  }

  for (const m of b.meses ?? []) {
    if (m.venta != null) filas.push({ clave: "venta_mes", periodo: m.periodo, valor: m.venta, estado: "contado" });
    if (m.ganancia != null) filas.push({ clave: "ganancia_mes", periodo: m.periodo, valor: m.ganancia, estado: "contado" });
    if (m.gasto_fijo != null) filas.push({ clave: "gasto_fijo_mes", periodo: m.periodo, valor: m.gasto_fijo, estado: "contado" });
  }

  if (b.epoca_dorada != null) filas.push({ clave: "venta_mes", periodo: PERIODO_DORADA, valor: b.epoca_dorada, estado: "contado" });

  for (const claveBruta of b.sin_dato ?? []) {
    const { clave } = normalizarMetrica(claveBruta, "actual");
    if (CLAVES_VITALES.has(clave)) filas.push({ clave, periodo: "actual", valor: null, estado: "sin_dato" });
  }

  let guardados = 0;
  for (const f of filas) {
    const { data: prev } = await sb
      .from("company_metricas")
      .select("id,estado")
      .eq("company_id", companyId)
      .eq("clave", f.clave)
      .eq("periodo", f.periodo)
      .maybeSingle();
    // Un dato verificado (salido de un documento) no lo pisa uno contado de memoria. Pero el dueño
    // SÍ puede corregir lo suyo: contado sobre contado se reemplaza sin preguntar.
    if (prev?.estado === "verificado" && f.estado !== "verificado") continue;
    const fila = { company_id: companyId, ...f, valor_texto: null, nota: null, updated_at: ahora };
    if (prev) await sb.from("company_metricas").update(fila).eq("id", prev.id);
    else await sb.from("company_metricas").insert(fila);
    guardados++;
  }

  if (b.temporadas) {
    const { data: empresa } = await sb.from("companies").select("ficha").eq("id", companyId).single();
    const ficha = {
      ...((empresa?.ficha ?? {}) as Record<string, unknown>),
      temporadas_altas: b.temporadas.altas,
      temporadas_bajas: b.temporadas.bajas,
    };
    await sb.from("companies").update({ ficha }).eq("id", companyId);
  }

  void registrar({
    companyId, actor: perfil, accion: "editar", entidad: "numeros",
    detalle: { guardados, meses: b.meses?.length ?? 0 }, ruta: "/api/portal/numeros", ip: ipDe(req),
  });
  return ok({ guardados });
});

/**
 * LAS LECTURAS DE LAS PANTALLAS DE «LO QUE EL CLIENTE LLENA» (16-10-2026). SERVIDOR: lo usan las páginas, nunca
 * un componente de cliente.
 *
 * Cada lectura va por separado y ninguna tumba la página: si la tabla todavía no existe (la migración del 16-10 sin
 * aplicar) se sabe y se dice con esas palabras; si falla por otra razón, «no se pudo leer», nunca «no hay». Una lista
 * vacía es «se leyó y no hay nada»; null es «no se sabe». Son lecturas de UNA empresa, con columnas explícitas y con
 * tope: las mismas de src/lib/negocio-datos.ts y src/lib/solicitudes.ts.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listarSolicitudes, nivelEnEmpresa, faltaLaTabla, ErrorDeSolicitud, type Seccion, type Solicitud } from "@/lib/solicitudes";
import { ErrorDeNegocio, faltaMigracionNegocio } from "@/lib/negocio-datos";
import { ErrorDeLinea } from "@/lib/producto";
import type { Metrica } from "@/lib/metricas";

/** Lo que devuelve una lectura que no puede tumbar la página. */
export type Leido<T> = { ok: true; valor: T } | { ok: false; falta: boolean };

/** ¿El fallo dice que la tabla o la columna todavía no existe? (Migración sin aplicar.) */
function esFaltaDeMigracion(e: unknown): boolean {
  if (e instanceof ErrorDeNegocio) return faltaMigracionNegocio(e.codigo);
  if (e instanceof ErrorDeSolicitud) return faltaLaTabla(e.codigo);
  if (e instanceof ErrorDeLinea) return ["42P01", "42703", "PGRST204", "PGRST205"].includes(e.codigo ?? "");
  return false;
}

/** Corre una lectura; si falla, lo dice sin lanzar. El fallo que no es de migración queda en el registro del servidor. */
export async function leer<T>(que: string, f: () => Promise<T>): Promise<Leido<T>> {
  try {
    return { ok: true, valor: await f() };
  } catch (e) {
    const falta = esFaltaDeMigracion(e);
    if (!falta) console.error(`[negocio] no se pudo leer ${que}`, e);
    return { ok: false, falta };
  }
}

export const valorO = <T,>(l: Leido<T>, porDefecto: T): T => (l.ok ? l.valor : porDefecto);

/** Lo que la consultora le pidió a la empresa, como lo lee el dueño (sin las retiradas). */
export const pedidosDelDueno = (companyId: string) => leer("lo que pidió la consultora", () => listarSolicitudes(companyId, { paraDueno: true }));

/** El pedido activo de una sección y el último completado. */
export function seccionDe(pedidos: Solicitud[] | null, seccion: Seccion): { activa: Solicitud | null; completada: Solicitud | null } {
  const deEsta = (pedidos ?? []).filter((s) => s.seccion === seccion);
  const activa = deEsta.find((s) => s.estado === "activa") ?? null;
  const completada =
    deEsta
      .filter((s) => s.estado === "completada" && s.completada_at)
      .sort((a, b) => String(b.completada_at).localeCompare(String(a.completada_at)))[0] ?? null;
  return { activa, completada };
}

/** Quién mira el portal. `rol` consultor = la consultora «viendo como el empresario». */
export type QuienMira = { id: string; rol: string } | null | undefined;

/**
 * ¿Puede esta persona llenar lo que se pide? La consultora, sí (la ruta la deja siempre). Del lado de la empresa, el
 * dueño o un líder: un participante lee, pero no escribe por la empresa (las rutas lo rechazarían igual).
 */
export async function puedeLlenar(u: QuienMira, companyId: string): Promise<{ puede: boolean; comoConsultora: boolean }> {
  if (!u) return { puede: false, comoConsultora: false };
  if (u.rol === "consultor") return { puede: true, comoConsultora: true };
  try {
    const nivel = await nivelEnEmpresa(u.id, companyId);
    return { puede: nivel === "dueno" || nivel === "lider", comoConsultora: false };
  } catch (e) {
    console.error("[negocio] no se pudo leer la membresía", e);
    return { puede: false, comoConsultora: false };
  }
}

/** Los números de la empresa (los 9 y los demás), para comparar con lo que se llena. Tope 300. */
export const metricasDe = (companyId: string) =>
  leer("los números de la empresa", async () => {
    const { data, error } = await supabaseAdmin().from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(300);
    if (error) throw new ErrorDeNegocio(error.message, error.code ?? null);
    return (data ?? []) as Metrica[];
  });

/** La venta de la mejor época que ya está en los 9 números (venta_mes en el periodo epoca_dorada), si la hay. */
export function ventaDorada(metricas: Metrica[]): number | null {
  const m = metricas.find((x) => (x.clave === "venta_epoca_dorada" || (x.clave === "venta_mes" && x.periodo === "epoca_dorada")) && x.valor != null && Number.isFinite(Number(x.valor)));
  return m ? Number(m.valor) : null;
}

/** El texto de una sección cerrada y vacía: qué es, y que la abre la consultora. Sin botones de escribir. */
export const TEXTO_CERRADA_VACIA = "Esta parte la abre tu consultora cuando la necesita. Cuando la abra, te avisamos en Inicio.";
/** Cuando la tabla todavía no existe en la base: lo que ve el dueño (sin nombres de tablas ni de migraciones). */
export const TEXTO_SIN_PREPARAR = "Todavía no podemos mostrarte esta parte: la estamos terminando de preparar. No falta nada de tu lado.";
/** Cuando una lectura falló por otra razón. */
export const TEXTO_NO_SE_PUDO = "No pudimos leer esta parte ahora. Vuelve a cargar la página en un momento; si sigue igual, escríbele a tu consultora.";

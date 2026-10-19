/**
 * FINANZAS · QUIÉN ENTRA (19-10-2026). Lo ven el dueño, el gerente y la consultora (con «ver como»); registran solo el
 * dueño y el gerente: la consultora mira, no lleva la caja de su cliente. Operaciones, RR.HH. y el personal no lo ven.
 * Se apoya en el contexto de RENASER OS (src/lib/os/acceso.ts): misma empresa, misma ficha, misma frontera.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { AccesoDenegado, type Perfil } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { contextoOS, exigirOS, type ContextoOS } from "@/lib/os/acceso";

/**
 * ¿La base ya tiene Finanzas? El código puede llegar a producción antes que supabase/migracion-finanzas.sql (ese SQL se
 * aplica aparte): hasta entonces «Mi negocio» no aparece y sus pantallas no abren. Una lectura de una fila y no un `head`:
 * con `head`, supabase-js convierte el 404 de «la tabla no existe» en «sin contenido» y no da error. Una vez por petición.
 */
export const finanzasDisponible = cache(async (): Promise<boolean> => {
  const { error } = await supabaseAdmin().from("fin_categorias").select("id").limit(1);
  return !error;
});

/** ¿Ve Finanzas? (dueño, gerente o la consultora). */
export function veFinanzas(c: Pick<ContextoOS, "rol">): boolean {
  return c.rol === "consultor" || c.rol === "dueno" || c.rol === "gerente";
}

/** ¿Registra en Finanzas? (dueño o gerente, con su ficha: la consultora no). */
export function registraFinanzas(c: Pick<ContextoOS, "rol" | "persona">): boolean {
  return !!c.persona && (c.rol === "dueno" || c.rol === "gerente");
}

/** Las categorías con que arranca la empresa, la primera vez que alguien abre Finanzas (si ya tiene, no hace nada). */
export async function asegurarCategorias(companyId: string): Promise<void> {
  await supabaseAdmin().rpc("fin_asegurar_categorias", { p_company: companyId });
}

/** Para páginas: sin acceso a Finanzas, a su trabajo. */
export async function contextoFinanzas(): Promise<ContextoOS & { registra: boolean }> {
  const c = await contextoOS();
  if (!veFinanzas(c) || !(await finanzasDisponible())) redirect("/os/mi-trabajo");
  await asegurarCategorias(c.companyId);
  return { ...c, registra: registraFinanzas(c) };
}

/** Para rutas API: `escribir` exige ser dueño o gerente con ficha. */
export async function exigirFinanzas(perfil: Perfil, opts: { escribir?: boolean } = {}): Promise<ContextoOS> {
  const c = await exigirOS(perfil);
  if (!veFinanzas(c)) throw new AccesoDenegado("Finanzas lo ven el dueño y el gerente.", "rol", c.companyId);
  if (!(await finanzasDisponible())) throw new AccesoDenegado("Finanzas todavía no está activado en esta base.", "rol", c.companyId);
  if (opts.escribir && !registraFinanzas(c)) {
    throw new AccesoDenegado(c.rol === "consultor" ? "La consultora puede mirar Finanzas, pero la caja la llevan el dueño o el gerente." : "En Finanzas registran el dueño y el gerente.", "rol", c.companyId);
  }
  return c;
}

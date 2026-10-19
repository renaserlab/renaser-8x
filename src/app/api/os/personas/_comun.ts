import { z } from "zod";
import { texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Los campos de una ficha del equipo, como llegan del formulario de «Equipo y talento». */
export const CamposPersona = {
  nombre: texto(120),
  email: z.string().trim().toLowerCase().email("no es un correo").max(200).nullable().optional(),
  puesto: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(120).nullable().optional(),
  rol: z.enum(["dueno", "gerente", "operaciones", "talento", "persona"]),
  // La capacidad se pide en horas por día (lo que entiende el dueño) y se guarda en minutos.
  capacidad_horas: z.number().min(0).max(24).optional(),
};

/** Si ya existe una cuenta con ese correo, la ficha queda enlazada de una vez (sin esperar a que entre de nuevo). */
export async function cuentaDelCorreo(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin().from("users").select("id").eq("email", email.toLowerCase()).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** El choque de la única (empresa, correo) o (empresa, cuenta) dicho en palabras. */
export function mensajeDuplicado(error: { code?: string; message: string }): string | null {
  if (error.code !== "23505") return null;
  return /email/.test(error.message) ? "Ya hay alguien del equipo con ese correo." : "Esa cuenta ya tiene ficha en el equipo.";
}

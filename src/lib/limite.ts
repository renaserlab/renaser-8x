import { supabaseAdmin } from "./supabase/admin";

export type Cupo = { permitido: boolean; restantes: number; reiniciaEn: number };

/**
 * LÍMITE DE PETICIONES (hallazgo alto de la auditoría del 29-08-2026). Sin esto, cualquiera con
 * cuenta podía disparar trabajos de IA en bucle y quemar la cuota y el dinero de Google, y el
 * login quedaba expuesto a fuerza bruta. El conteo vive en Postgres —no en memoria— porque en
 * serverless cada instancia olvida lo suyo: la ventana tiene que ser común a todas.
 */
export async function limitar(clave: string, max: number, ventanaSeg: number): Promise<Cupo> {
  try {
    const { data, error } = await supabaseAdmin().rpc("consumir_cupo", {
      p_clave: clave.slice(0, 180),
      p_max: max,
      p_ventana_seg: ventanaSeg,
    });
    if (error) throw error;
    const f = (Array.isArray(data) ? data[0] : data) as { permitido: boolean; restantes: number; reinicia_en: number } | undefined;
    if (!f) return { permitido: true, restantes: max, reiniciaEn: 0 };
    return { permitido: f.permitido, restantes: f.restantes, reiniciaEn: f.reinicia_en };
  } catch {
    // Si el contador falla, se deja pasar: un límite roto no puede dejar sin servicio al dueño.
    return { permitido: true, restantes: max, reiniciaEn: 0 };
  }
}

/** Cupos por tipo de operación. Generosos para el uso real, cerrados para el abuso. */
export const CUPO = {
  escritura: { max: 120, ventana: 60 },   // editar, guardar, confirmar
  ia: { max: 20, ventana: 300 },          // encolar trabajos de IA: lo caro
  subida: { max: 12, ventana: 300 },      // archivos y audio
  sesion: { max: 10, ventana: 900 },      // intentos de entrar: fuerza bruta
} as const;

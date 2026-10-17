/**
 * LAS CIFRAS DE 8X EN LA CAJA DE CORREGIR (spec-estrategia-8x.md §6.2 y §8.1, punto 4).
 *
 * Ni la consultora ve ids: un texto con `{{C:poder.precio}}` se corrige viendo «⟦S/ 410⟧». Cada cifra de 8X va entre
 * ⟦ ⟧ con su valor y vuelve a ser su `{{id}}` al guardar, aunque se la haya movido de lugar. Se puede mover o borrar,
 * no cambiar: es de 8X. Lo que la consultora escriba con sus dedos (también entre ⟦ ⟧) queda como texto suyo, y el
 * validador lo trata como «cifra de la consultora» (un aviso con su chip, no un error).
 *
 * Puro y sin nada de servidor: lo usan la página (para armar la caja) y el componente de cliente (para guardar).
 */
import { PATRON_LLAVES } from "./texto";
import { TEXTO } from "./textos";

export type Marca = { etiqueta: string; id: string };

const ABRE = "⟦";
const CIERRA = "⟧";

/**
 * El texto como se ve en la caja de corregir: cada `{{id}}` pasa a ser su valor entre ⟦ ⟧. `marcas` dice qué id hay
 * detrás de cada una. `texto` es lo que se pinta de cada id (sin dato, si no está).
 */
export function aEditable(texto: string | null | undefined, valorDe: (id: string) => string | null | undefined): { visible: string; marcas: Marca[] } {
  const marcas: Marca[] = [];
  const visible = String(texto ?? "").replace(PATRON_LLAVES, (_m, id: string) => {
    const t = (valorDe(id) || TEXTO.sin_dato).replace(/[⟦⟧]/g, "");
    const etiqueta = `${ABRE}${t}${CIERRA}`;
    marcas.push({ etiqueta, id });
    return etiqueta;
  });
  return { visible, marcas };
}

/**
 * De la caja de corregir al texto que se guarda: cada ⟦…⟧ que sigue siendo una cifra de 8X vuelve a ser su `{{id}}`
 * (la primera libre con esa etiqueta, en el orden en que aparezca). Lo que se escribió entre ⟦ ⟧ y no es una cifra de
 * 8X queda como texto, sin los corchetes.
 */
export function deEditable(visible: string | null | undefined, marcas: readonly Marca[]): string {
  const libres = [...marcas];
  return String(visible ?? "").replace(/⟦([^⟦⟧]*)⟧/g, (todo, dentro: string) => {
    const i = libres.findIndex((m) => m.etiqueta === todo);
    if (i < 0) return dentro;
    const [m] = libres.splice(i, 1);
    return `{{${m!.id}}}`;
  });
}

/** ¿Trae la caja alguna cifra de 8X? (Para decir cómo se corrige.) */
export const traeCifras = (visible: string): boolean => visible.includes(ABRE);

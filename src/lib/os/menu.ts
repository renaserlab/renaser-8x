/**
 * RENASER OS EN LA BARRA LATERAL (prototipo aprobado el 19-10-2026). Dos grupos nuevos en el menú de la empresa:
 *  — «Mi día», lo de cada persona: abrir y cerrar el día, sus tareas con cronómetro, sus entregables y los podios;
 *  — «Mi equipo», solo para la gestión (dueño, gerente, operaciones, RR.HH.): el equipo en vivo, el talento, los
 *    proyectos con el objetivo de la semana, el reporte semanal y los avisos.
 * Quien no es gestión ve sus avisos dentro de «Mi día». «Mi perfil» va al pie, al tocar el nombre.
 *
 * Esta lista ES el menú: tests/recorrido-conectado.test.ts vigila que toda pantalla de /os esté aquí (o sea el perfil).
 * Los cinco destinos de la consultoría NO cambian: siguen siendo los del layout del portal (CONSULTORIA abajo los repite
 * para el layout de /os, y la misma prueba comprueba que digan lo mismo).
 */
import type { NombreIcono } from "@/components/base/Icono";

export type ItemMenu = [href: string, nombre: string, icono: NombreIcono];
export type GrupoMenu = { titulo: string; items: ItemMenu[] };

export const MI_DIA: ItemMenu[] = [
  ["/os/apertura", "Apertura", "apertura"],
  ["/os/mi-trabajo", "Mi trabajo", "tareas"],
  ["/os/entregables", "Mis entregables", "subida"],
  ["/os/podios", "Podios", "podio"],
];

export const AVISOS_OS: ItemMenu = ["/os/avisos", "Avisos", "campana"];

export const MI_EQUIPO: ItemMenu[] = [
  ["/os/equipo", "Equipo en vivo", "envivo"],
  ["/os/talento", "Equipo y talento", "equipo"],
  ["/os/proyectos", "Proyectos y objetivo", "estrategia"],
  ["/os/reporte", "Reporte semanal", "numeros"],
  AVISOS_OS,
];

export const PERFIL_OS = "/os/perfil";

/** Los cinco destinos de la consultoría, iguales a los del layout del portal. */
export const CONSULTORIA: [string, string][] = [
  ["/portal", "Inicio"],
  ["/portal/diagnostico", "Tu diagnóstico"],
  ["/portal/numeros", "Tus números"],
  ["/portal/procesos", "Tus procesos"],
  ["/portal/plan", "Tu plan"],
];

export function gruposOS(c: { gestion: boolean }): GrupoMenu[] {
  if (c.gestion) return [{ titulo: "Mi día", items: MI_DIA }, { titulo: "Mi equipo", items: MI_EQUIPO }];
  return [{ titulo: "Mi día", items: [...MI_DIA, AVISOS_OS] }];
}

/** Toda pantalla de /os que se alcanza desde el menú (las que no son del rol de quien entra, también). */
export const RUTAS_MENU_OS: string[] = [...MI_DIA, ...MI_EQUIPO].map(([h]) => h).concat(PERFIL_OS);

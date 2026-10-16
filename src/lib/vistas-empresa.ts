import type { NombreIcono } from "@/components/base/Icono";

/**
 * LAS VISTAS DE UNA EMPRESA, PARA LA CONSULTORA (pedido de Kelin, 16-10-2026).
 *
 * «Hace rato estaba simple y fácil: diagnóstico, qué hay en números, indicadores y el avance progresivo… son muchas
 * pestañas que deberían estar en una sola.» La columna de la empresa tenía 20 pestañas en tres capas. Ahora tiene
 * cinco vistas y, abajo y aparte, el Expediente. Ninguna pantalla se borró: cada una de las 20 sigue abriendo en su
 * dirección de siempre y vive DENTRO de una vista, enlazada en la fila «En esta vista» (EnEstaVista).
 *
 * Este archivo es puro (sin servidor ni React): lo leen la columna (TabsEmpresa), la fila (EnEstaVista), el layout de
 * /empresa/[id] y las pruebas. tests/recorrido-conectado.test.ts vigila que toda carpeta con page.tsx bajo
 * /empresa/[id] esté en las `sub` de exactamente una vista, y que toda `sub` tenga su page.tsx.
 *
 * Las rutas son relativas a /empresa/[id]: "" es la propia empresa (el tablero de diagnóstico).
 *
 * REVISIÓN DEL 16-10-2026 (tarde): las vistas son las cuatro cosas que nombró Kelin —diagnóstico, números,
 * indicadores y avance— más la Estructura (procesos y organigrama, que pidió aparte y «no todo junto») y la
 * Estrategia (cómo debe ser, el plan estratégico con su FODA y sus cruces, y las dos rutas cuando existan), que es
 * el trabajo de consultora que más pidió ese día. Indicadores salió de Avance a su propia vista.
 */

export type ClaveVista = "diagnostico" | "numeros" | "indicadores" | "estructura" | "estrategia" | "avance" | "expediente";

/** Una vista: su nombre, a dónde lleva su enlace, su ícono y sus pantallas («En esta vista»), en orden. */
export type Vista = { clave: ClaveVista; nombre: string; href: string; icono: NombreIcono; sub: [string, string][] };

/** Las seis vistas, en el orden en que la consultora lee una empresa: qué tiene, cuánto, cómo se mide, cómo se hace, hacia dónde va y cómo va. */
export const VISTAS: Vista[] = [
  {
    clave: "diagnostico",
    nombre: "Diagnóstico",
    href: "",
    icono: "diagnostico",
    sub: [
      ["", "Resumen"],
      ["/diagnostico", "Hallazgos"],
      ["/madurez", "Radiografía"],
      ["/direccion", "Dirección empresarial"],
    ],
  },
  {
    clave: "numeros",
    nombre: "Números",
    href: "/numeros",
    icono: "numeros",
    sub: [
      ["/numeros", "Resumen"],
      ["/producto", "Producto y rentabilidad"],
      ["/realidad", "Matriz de realidad"],
    ],
  },
  {
    // Una sola pantalla: sin fila «En esta vista».
    clave: "indicadores",
    nombre: "Indicadores",
    href: "/kpis",
    icono: "indicadores",
    sub: [["/kpis", "Indicadores"]],
  },
  {
    // Sin página resumen propia: su enlace abre la primera subpantalla.
    clave: "estructura",
    nombre: "Estructura",
    href: "/procesos",
    icono: "procesos",
    sub: [
      ["/procesos", "Procesos"],
      ["/organigrama", "Organigrama"],
    ],
  },
  {
    // Sin página resumen propia: su enlace abre el plan estratégico (FODA y cruces).
    clave: "estrategia",
    nombre: "Estrategia",
    href: "/plan-estrategico",
    icono: "estrategia",
    sub: [
      ["/plan-estrategico", "Plan estratégico"],
      ["/debe-ser", "Debe ser"],
    ],
  },
  {
    clave: "avance",
    nombre: "Avance",
    href: "/avance",
    icono: "avance",
    sub: [
      ["/avance", "Resumen"],
      ["/plan", "Plan"],
      ["/revision", "Revisión semanal"],
      ["/excelencia", "Excelencia"],
      ["/entrega", "Entrega"],
    ],
  },
];

/** La sexta, aparte y discreta: lo que se levantó de la empresa y su administración. */
export const EXPEDIENTE: Vista = {
  clave: "expediente",
  nombre: "Expediente",
  href: "/expediente",
  icono: "carpeta",
  sub: [
    ["/expediente", "Resumen"],
    ["/fuentes", "Fuentes"],
    ["/afirmaciones", "Afirmaciones"],
    ["/entrevista", "Entrevista"],
    ["/dia", "El día"],
    ["/configuracion", "Configuración"],
  ],
};

/** Todas, con el Expediente al final. */
export const TODAS_LAS_VISTAS: readonly Vista[] = [...VISTAS, EXPEDIENTE];

/** La subruta sin barra final ni parámetros: "/procesos/" → "/procesos"; "?x=1" → "". */
function limpia(subruta: string): string {
  const sinQuery = subruta.split(/[?#]/)[0] ?? "";
  return sinQuery.replace(/\/+$/, "");
}

/**
 * La subpantalla a la que pertenece una subruta: ella misma o su madre ("/procesos/abc" → "/procesos";
 * "/entrega/x" → "/entrega"). "" es el Resumen del Diagnóstico. null si no es de ninguna vista.
 */
export function subActiva(subruta: string): string | null {
  const r = limpia(subruta);
  if (r === "") return "";
  let mejor: string | null = null;
  for (const v of TODAS_LAS_VISTAS) {
    for (const [h] of v.sub) {
      if (h === "") continue;
      if ((r === h || r.startsWith(`${h}/`)) && (mejor === null || h.length > mejor.length)) mejor = h;
    }
  }
  return mejor;
}

/** La vista a la que pertenece una subruta de /empresa/[id]. null si ninguna la reclama. */
export function vistaDe(subruta: string): ClaveVista | null {
  const s = subActiva(subruta);
  if (s === null) return null;
  return TODAS_LAS_VISTAS.find((v) => v.sub.some(([h]) => h === s))?.clave ?? null;
}

/** La vista por su clave. */
export function vistaPorClave(clave: ClaveVista): Vista {
  return TODAS_LAS_VISTAS.find((v) => v.clave === clave)!;
}

/** De la ruta completa del navegador ("/empresa/abc/procesos/x") a la subruta ("/procesos/x"); null si es de otra empresa. */
export function subrutaDe(ruta: string, base: string): string | null {
  if (ruta === base) return "";
  if (ruta.startsWith(`${base}/`)) return ruta.slice(base.length);
  return null;
}

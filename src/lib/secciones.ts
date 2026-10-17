/**
 * LAS SECCIONES QUE LA CONSULTORA LE PUEDE PEDIR AL CLIENTE: el vocabulario, sin nada de servidor (16-10-2026).
 *
 * Vive aparte de solicitudes.ts para que un componente de cliente («use client») lo pueda importar: solicitudes.ts
 * lee la base y lanza `AccesoDenegado` (src/lib/auth.ts, que arrastra next/headers), y nada de eso puede llegar al
 * navegador. solicitudes.ts re-exporta todo lo de aquí con los mismos nombres: en el servidor da igual de dónde se
 * importe; en un componente de cliente, de aquí.
 *
 * Puro: sin base, sin red.
 */

export const SECCIONES = [
  "productos", "costos", "historia", "moneda", "credito", "inventario",
  "corroborar_diagnostico", "datos_faltantes", "subir_organigrama", "subir_manuales", "subir_procesos",
  "preguntas_estrategia",
] as const;
export type Seccion = (typeof SECCIONES)[number];

/**
 * Las que la consultora abre con una casilla en «Activar para el cliente». Todas menos «preguntas_estrategia»
 * (spec-estrategia-8x.md §7.4): esa la abre solo el envío de las preguntas de la estrategia
 * (POST /api/companies/[id]/estrategia-preguntas), porque abierta sin ninguna pregunta enviada el dueño entraría a una
 * página vacía.
 */
export const SECCIONES_QUE_ACTIVA_LA_CONSULTORA = SECCIONES.filter((s): s is Exclude<Seccion, "preguntas_estrategia"> => s !== "preguntas_estrategia");

/** Lo que el dueño llena en tablas nuevas: solo estas se abren y cierran con la solicitud. */
export const SECCIONES_QUE_ABREN_ESCRITURA = ["productos", "costos", "historia", "moneda", "credito", "inventario"] as const;

export type DefSeccion = { clave: Seccion; grupo: "datos" | "confirmar" | "subir"; paraDueno: string; paraConsultora: string; href: string };

export const SECCION: Record<Seccion, DefSeccion> = {
  productos: { clave: "productos", grupo: "datos", paraDueno: "Lo que vendes: precios, costos y cuánto vendes", paraConsultora: "Productos: precios, costo por partes y cuánto se vende al mes", href: "/portal/producto" },
  costos: { clave: "costos", grupo: "datos", paraDueno: "Tus gastos del mes", paraConsultora: "Gastos fijos y de comercialización del mes", href: "/portal/costos" },
  historia: { clave: "historia", grupo: "datos", paraDueno: "La historia de tu negocio", paraConsultora: "Historia del negocio (cinco preguntas)", href: "/portal/historia" },
  moneda: { clave: "moneda", grupo: "datos", paraDueno: "Tus ventas en otra moneda", paraConsultora: "Ventas en otra moneda y lo que se pierde en el cambio", href: "/portal/cobros#moneda" },
  credito: { clave: "credito", grupo: "datos", paraDueno: "Tus ventas al crédito o fiadas", paraConsultora: "Venta al crédito: cuánto, a cuántos días y cuánto no se cobra", href: "/portal/cobros#credito" },
  inventario: { clave: "inventario", grupo: "datos", paraDueno: "Tu mercadería guardada", paraConsultora: "Inventario: dinero guardado y cuánto no se mueve", href: "/portal/cobros#inventario" },
  corroborar_diagnostico: { clave: "corroborar_diagnostico", grupo: "confirmar", paraDueno: "Confirmar lo que encontramos", paraConsultora: "Corroborar el diagnóstico (puntos marcados para confirmar)", href: "/portal/validar" },
  datos_faltantes: { clave: "datos_faltantes", grupo: "confirmar", paraDueno: "Los números que faltan", paraConsultora: "Completar los 9 números", href: "/portal/numeros" },
  subir_organigrama: { clave: "subir_organigrama", grupo: "subir", paraDueno: "Tu organigrama", paraConsultora: "Subir el organigrama", href: "/portal/activos?doc=personas.organigrama" },
  subir_manuales: { clave: "subir_manuales", grupo: "subir", paraDueno: "Tus manuales y políticas", paraConsultora: "Subir manuales y políticas", href: "/portal/activos?doc=procesos.procedimientos" },
  subir_procesos: { clave: "subir_procesos", grupo: "subir", paraDueno: "Tus procesos: súbelos o dibújalos", paraConsultora: "Subir o dibujar los procesos", href: "/portal/procesos" },
  // Se responde dentro de «Tu plan»: el dueño no gana un destino nuevo (cinco destinos, NavCliente).
  preguntas_estrategia: { clave: "preguntas_estrategia", grupo: "confirmar", paraDueno: "Unas preguntas para afinar tu plan", paraConsultora: "Preguntas de la estrategia (lo que falta saber)", href: "/portal/plan/preguntas" },
};

/** Los tres grupos, en el orden en que la consultora los ve. */
export const GRUPOS_SECCION: readonly { clave: DefSeccion["grupo"]; nombre: string }[] = [
  { clave: "datos", nombre: "Datos del negocio" },
  { clave: "confirmar", nombre: "Confirmar" },
  { clave: "subir", nombre: "Subir archivos" },
];

export const esSeccion = (v: unknown): v is Seccion => (SECCIONES as readonly string[]).includes(String(v));

export type EstadoSolicitud = "activa" | "completada" | "retirada";
export type Solicitud = {
  id: string;
  company_id: string;
  seccion: Seccion;
  nota: string | null;
  estado: EstadoSolicitud;
  activada_at: string;
  completada_at: string | null;
};

/**
 * LAS PANTALLAS QUE APARECEN CUANDO TOCAN. «Tus gastos del mes», «Tu historia» y «Cobros y mercadería» no salen en la
 * fila de «Mi empresa» hasta que la consultora las abre o hasta que ya hay algo guardado en ellas: así el dueño ve lo
 * que le toca hoy, y no ocho enlaces con avisos de «cerrado». «Cobros y mercadería» sale también con «Lo que vendes»
 * abierta: sus tres preguntas de sí o no se contestan desde ahí (los módulos se encienden con una pregunta).
 */
export const PANTALLA_CONDICIONAL: Record<string, { abren: readonly Seccion[]; guardado: "costos" | "historia" | "cobros" }> = {
  "/portal/costos": { abren: ["costos"], guardado: "costos" },
  "/portal/historia": { abren: ["historia"], guardado: "historia" },
  "/portal/cobros": { abren: ["moneda", "credito", "inventario", "productos"], guardado: "cobros" },
};

/**
 * Las pantallas condicionales que hoy no tocan: ninguna de sus secciones está abierta y no tienen nada guardado. Si no
 * se sabe qué está abierto o qué hay guardado (null), no se esconde nada: mejor un enlace de más que una pantalla
 * perdida.
 */
export function pantallasOcultas(abiertasAhora: readonly Seccion[] | null, guardado: { costos: boolean; historia: boolean; cobros: boolean } | null): string[] {
  if (!abiertasAhora || !guardado) return [];
  return Object.entries(PANTALLA_CONDICIONAL)
    .filter(([, d]) => !d.abren.some((s) => abiertasAhora.includes(s)) && !guardado[d.guardado])
    .map(([href]) => href);
}

/**
 * LAS PANTALLAS QUE SOLO EXISTEN CON SU PEDIDO ABIERTO (spec-estrategia-8x.md §7.4). «Preguntas para tu plan» no tiene
 * nada que mostrar si la consultora no envió preguntas: en la fila de «Tu plan» sería un enlace a una página vacía. Sale
 * cuando su pedido está abierto (y siempre en la pantalla en la que se está: EnEstaSeccion no esconde esa).
 */
export const PANTALLA_SOLO_CON_PEDIDO: Record<string, Seccion> = { [SECCION.preguntas_estrategia.href]: "preguntas_estrategia" };

/** Las pantallas de PANTALLA_SOLO_CON_PEDIDO cuyo pedido no está abierto. Sin saber qué está abierto (null), ninguna. */
export function pantallasSinPedido(abiertasAhora: readonly Seccion[] | null): string[] {
  if (!abiertasAhora) return [];
  return Object.entries(PANTALLA_SOLO_CON_PEDIDO)
    .filter(([, s]) => !abiertasAhora.includes(s))
    .map(([href]) => href);
}

export const TEXTO_SECCION_CERRADA ="Esta parte la abre tu consultora cuando la necesita. Si quieres corregir algo, escríbele.";
export const TEXTO_YA_LISTO = "Esto ya estaba marcado como listo.";

/** Las activas, en el orden de SECCIONES (el orden en que conviene llenarlas). */
export function abiertas(s: Solicitud[]): Solicitud[] {
  return s.filter((x) => x.estado === "activa").sort((a, b) => SECCIONES.indexOf(a.seccion) - SECCIONES.indexOf(b.seccion));
}

const ESTADOS: readonly EstadoSolicitud[] = ["activa", "completada", "retirada"];

/** Una fila de la tabla. Lo que no se reconoce se descarta: una sección desconocida no es una solicitud. */
export function solicitudDesdeFila(f: Record<string, unknown>, companyId: string): Solicitud | null {
  if (!esSeccion(f.seccion)) return null;
  const estado = ESTADOS.includes(f.estado as EstadoSolicitud) ? (f.estado as EstadoSolicitud) : null;
  if (!estado) return null;
  return {
    id: String(f.id),
    company_id: String(f.company_id ?? companyId),
    seccion: f.seccion,
    nota: typeof f.nota === "string" && f.nota.trim() ? f.nota : null,
    estado,
    activada_at: String(f.activada_at ?? ""),
    completada_at: typeof f.completada_at === "string" ? f.completada_at : null,
  };
}

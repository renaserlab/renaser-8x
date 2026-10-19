/**
 * Un solo juego de íconos de línea para todo 8X (sistema «noche y perla», 17-10-2026): trazo 1.5, puntas y uniones redondas,
 * dibujados aquí, nunca emoji. El mismo juego del prototipo (diseno/prototipos/iconos.svg).
 */
const TRAZOS = {
  inicio: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  empresas: <path d="M4 20V6.5L11 4v16M11 9l9 2.5V20M2.5 20h19M7 9h1M7 12.5h1M7 16h1M14.5 14h1.5M14.5 17h1.5" />,
  cartera: <><rect x="3.5" y="7" width="17" height="12.5" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></>,
  decisiones: <path d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
  torre: <><circle cx="12" cy="12" r="2" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14" /></>,
  salud: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  aprendizaje: <path d="M12 3.5a4.5 4.5 0 0 1 4.5 4.5c0 2.2-1.6 3.3-1.6 5.4H9.1c0-2.1-1.6-3.2-1.6-5.4A4.5 4.5 0 0 1 12 3.5ZM9.5 16.5h5M10.2 19.5h3.6" />,
  ayuda: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  diagonal: <path d="M7 17 17 7M9 7h8v8" />,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  salir: <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9.5" />,
  voz: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  documento: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" /></>,
  tabla: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10" /></>,
  ojo: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  procesos: <><rect x="3.5" y="4" width="6" height="5" rx="1.5" /><rect x="14.5" y="15" width="6" height="5" rx="1.5" /><path d="M6.5 9v3.5a2 2 0 0 0 2 2h9V15" /></>,
  miempresa: <path d="M4 20V10M10 20V5M16 20v-7M21 20H3" />,
  carpeta: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  plan: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M8.5 13l2.3 2.3 4.7-4.6" /></>,
  subida: <path d="M12 15V4.5M7.5 9 12 4.5 16.5 9M5 15.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />,
  aviso: <><path d="M12 4.5 2.8 19.5h18.4z" /><path d="M12 10v4M12 17h.01" /></>,
  persona: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5a7 7 0 0 1 14 0" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  numeros: <path d="M5 19V9M10 19V5M15 19v-7M20 19v-4" />,
  // Las vistas de la empresa (16-10-2026): el pulso dentro de un círculo, la bandera de hacia dónde se va y el escalón que sube.
  diagnostico: <><circle cx="12" cy="12" r="8.5" /><path d="M6.5 12.5h2.6l1.6-3.5 2.6 7 1.6-3.5h2.6" /></>,
  estrategia: <path d="M5.5 20.5V4M5.5 4.5h11l-2.5 4 2.5 4h-11" />,
  avance: <><path d="M3.5 20h5v-4.5h5V11H17" /><path d="M17 11V4.5M14 7.5l3-3 3 3" /></>,
  abajo: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  // El medidor de los indicadores y los tres puntos de un menú de acciones (revisión del 16-10-2026).
  indicadores: <><path d="M4 16.5a8 8 0 0 1 16 0" /><path d="m12 16.5 4.2-5" /><path d="M4 19.5h16" /></>,
  mas: <><circle cx="6" cy="12" r="1.1" /><circle cx="12" cy="12" r="1.1" /><circle cx="18" cy="12" r="1.1" /></>,
  // La estrategia (17-10-2026): el lápiz de corregir un texto y la marca de una etapa lista.
  lapiz: <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10zM13.5 6.5l4 4" />,
  hecho: <path d="m5 12.5 4.2 4.2L19 7" />,
  // RENASER OS (19-10-2026): el sol que asoma de la apertura, la lista de tareas, el podio, el radar del equipo en vivo,
  // el equipo, la campana de los avisos y el pulso de las empresas de la consultora.
  apertura: <path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 5v3M5.6 9.6l1.6 1.6M18.4 9.6l-1.6 1.6M3 14.5h1.5M19.5 14.5H21" />,
  tareas: <path d="M10 6.5h10M10 12h10M10 17.5h10M3.5 6.5l1.3 1.3 2.2-2.6M3.5 12l1.3 1.3 2.2-2.6M3.5 17.5l1.3 1.3 2.2-2.6" />,
  podio: <path d="M9 20V8h6v12M3 20v-7h6M15 20v-5h6M2.5 20h19" />,
  envivo: <><circle cx="12" cy="12" r="1.2" /><path d="M12 3a9 9 0 1 0 9 9M12 7.5A4.5 4.5 0 1 0 16.5 12M12 12l6-6" /></>,
  equipo: <><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
  campana: <path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6.5 2.5 7.5h-17C4.5 15.5 6 13.5 6 9ZM10 19.5a2 2 0 0 0 4 0" />,
  pulso: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  // Finanzas (19-10-2026): la caja.
  finanzas: <path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 7.5 6.5 4h11L20 7.5M15.5 13.5h2" />,
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam }: { nombre: NombreIcono; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}

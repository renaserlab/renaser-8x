/**
 * Un solo juego de íconos de línea para todo 8X (estilo del 13-10-2026): trazo 1.6, esquinas redondas,
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
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam }: { nombre: NombreIcono; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}

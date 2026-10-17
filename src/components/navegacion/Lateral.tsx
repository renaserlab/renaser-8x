"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * LA NAVEGACIÓN VA AL COSTADO (pedido de Kelin, 16-10-2026: «prefiero una navegación al costado, no arriba,
 * que se vea la barra lateral o pueda ocultarla»). Una sola barra para la consultora y para el cliente:
 * — Escritorio (≥1024 px): fija a la izquierda, 248 px. El botón de su cabecera la oculta a un riel de íconos
 *   de 72 px y la vuelve a mostrar. Cada navegador recuerda la elección en localStorage[CLAVE_LATERAL].
 * — Celular y tablet (<1024 px): una franja fina arriba con «Abrir el menú»; la barra entra deslizándose desde
 *   la izquierda y se cierra con Escape, tocando el telón, al elegir un destino o al cambiar de ruta.
 * Arriba de la página no hay navegación: ahí va la barra de avance de la empresa (BarraRuta).
 * Los destinos los pinta quien la usa (NavConsultor, NavCliente); aquí vive solo el comportamiento.
 */
export const CLAVE_LATERAL = "8x.lateral";

type Estado = "abierta" | "riel";

/**
 * Lo elegido en esta pestaña. Si el navegador no deja guardar (ventana privada, datos bloqueados), la barra
 * igual se oculta y se muestra: solo no lo recuerda la próxima vez. Nunca se rompe por no poder guardar.
 */
let elegido: Estado | null = null;
const oyentes = new Set<() => void>();

function leerGuardado(): Estado {
  try {
    const v = window.localStorage.getItem(CLAVE_LATERAL);
    if (v === "abierta" || v === "riel") return v;
  } catch {
    // Sin almacenamiento disponible: se muestra abierta, que es lo que ve quien entra por primera vez.
  }
  return "abierta";
}

function guardar(estado: Estado) {
  elegido = estado;
  try {
    window.localStorage.setItem(CLAVE_LATERAL, estado);
  } catch {
    // Ventana privada o datos bloqueados: el cambio vale en esta pestaña y no se recuerda. No es un error que mostrar.
  }
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  // Si se cambia en otra pestaña, esta se pone igual.
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_LATERAL) return;
    elegido = null;
    avisar();
  };
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", deOtraPestana);
  };
}

// En el navegador se lee lo guardado; en el servidor y al hidratar, abierta (así no hay desajuste de HTML).
const estadoActual = (): Estado => (elegido ??= leerGuardado());
const estadoDelServidor = (): Estado => "abierta";

/** Lo que se puede enfocar dentro de la barra y se ve (lo oculto por tamaño de pantalla no cuenta). */
function enfocables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary")].filter((el) => el.getClientRects().length > 0);
}

export function Lateral({
  etiqueta,
  marca,
  enMovil,
  pie,
  children,
}: {
  etiqueta: string;
  marca: React.ReactNode;
  /** Lo que va a la derecha de la franja del celular: la torre (consultora) o «Salir» (cliente). */
  enMovil?: React.ReactNode;
  /** Al pie de la barra: quién entró y «Salir». */
  pie?: React.ReactNode;
  /** La lista de enlaces. */
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const estado = useSyncExternalStore(suscribir, estadoActual, estadoDelServidor);
  const [movil, setMovil] = useState(false);
  const [rutaVista, setRutaVista] = useState(ruta);
  const panel = useRef<HTMLElement | null>(null);
  const botonMenu = useRef<HTMLButtonElement | null>(null);
  // El foco vuelve al botón cuando la persona cierra el menú; no cuando se cierra porque eligió un destino.
  const devolverFoco = useRef(false);

  // Al cambiar de ruta el menú del celular se cierra (se ajusta durante el render, sin un efecto de más).
  if (rutaVista !== ruta) {
    setRutaVista(ruta);
    setMovil(false);
  }

  const cerrar = () => {
    devolverFoco.current = true;
    setMovil(false);
  };

  // Abierto en el celular: el foco entra al primer enlace, Escape cierra, Tab no se escapa detrás del telón,
  // el cuerpo no se desplaza y, si la pantalla crece a escritorio, el cajón se cierra solo.
  useEffect(() => {
    if (!movil) return;
    const el = panel.current;
    const boton = botonMenu.current;
    (el?.querySelector<HTMLElement>(".lateral__cuerpo a[href]") ?? el?.querySelector<HTMLElement>("a[href]"))?.focus();

    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        devolverFoco.current = true;
        setMovil(false);
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const lista = enfocables(el);
      if (!lista.length) return;
      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      if (e.shiftKey && (document.activeElement === primero || !el.contains(document.activeElement))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !el.contains(document.activeElement))) {
        e.preventDefault();
        primero.focus();
      }
    };
    window.addEventListener("keydown", tecla);

    const escritorio = window.matchMedia("(min-width: 1024px)");
    const alCrecer = () => {
      if (escritorio.matches) setMovil(false);
    };
    escritorio.addEventListener("change", alCrecer);

    return () => {
      document.body.style.overflow = desplazamiento;
      window.removeEventListener("keydown", tecla);
      escritorio.removeEventListener("change", alCrecer);
      if (devolverFoco.current) {
        devolverFoco.current = false;
        boton?.focus();
      }
    };
  }, [movil]);

  const riel = estado === "riel";

  return (
    <>
      <header className="barra-movil no-imprimir">
        <button
          ref={botonMenu}
          type="button"
          className="boton-redondo"
          aria-controls="lateral"
          aria-expanded={movil}
          aria-label="Abrir el menú"
          title="Abrir el menú"
          onClick={() => setMovil(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
        <div className="barra-movil__marca">{marca}</div>
        {enMovil && <div className="barra-movil__derecha">{enMovil}</div>}
      </header>

      <aside
        id="lateral"
        ref={panel}
        className="lateral no-imprimir"
        data-estado={estado}
        data-movil={movil ? "abierta" : "cerrada"}
        aria-label={etiqueta}
      >
        <div className="lateral__cabeza">
          {marca}
          <button
            type="button"
            className="lateral__boton solo-escritorio"
            aria-pressed={riel}
            aria-label={riel ? "Mostrar el menú" : "Ocultar el menú"}
            title={riel ? "Mostrar el menú" : "Ocultar el menú"}
            onClick={() => guardar(riel ? "abierta" : "riel")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d={riel ? "M9.5 4.5v15M13 10l2 2-2 2" : "M9.5 4.5v15M15 10l-2 2 2 2"} />
            </svg>
          </button>
          <button type="button" className="lateral__boton solo-celular" aria-label="Cerrar el menú" title="Cerrar el menú" onClick={cerrar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* Elegir un destino cierra el menú del celular, también cuando es la misma página en la que ya se está. */}
        <div
          className="lateral__cuerpo"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMovil(false);
          }}
        >
          {children}
        </div>

        {pie && <div className="lateral__pie">{pie}</div>}
      </aside>

      {movil && <button type="button" className="telon no-imprimir" aria-label="Cerrar el menú" onClick={cerrar} />}
    </>
  );
}

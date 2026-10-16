"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/base/Icono";

type EmpresaMini = { id: string; nombre: string };

/**
 * Navegación de la consultora en PÍLDORA (estilo del 13-10-2026, imagen de referencia de Kelin):
 * — Escritorio: marca a la izquierda, la píldora con los destinos de todos los días al centro, y a la derecha el
 *   botón que abre el menú completo y las iniciales de quien entró.
 * — Celular: la misma píldora flota abajo con el nombre bajo cada ícono, más «Más», que abre el menú completo.
 * El menú completo (panel lateral en PC, hoja inferior en celular) lleva TODAS las pantallas y las empresas
 * recientes: tests/recorrido-conectado.test.ts vigila que toda pantalla de la consultora esté enlazada aquí.
 * La Cartera va en la píldora y en el menú: es la pantalla de Dirección y no puede depender de teclear la dirección.
 */
export function NavConsultor({ empresas, usuario, torre }: { empresas: EmpresaMini[]; usuario: string; torre?: React.ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Con Escape se cierra; al elegir una pantalla también (ver el onClick del menú).
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  const item = (href: string, nombre: string, exacto = false) => {
    const activo = exacto ? ruta === href : ruta.startsWith(href);
    return (
      <Link key={href} href={href} aria-current={activo ? "page" : undefined}>
        {nombre}
      </Link>
    );
  };
  const ICONOS: Record<string, React.ReactNode> = {
    inicio: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
    empresas: <path d="M4 20V6.5L11 4v16M11 9l9 2.5V20M2.5 20h19M7 9h1M7 12.5h1M7 16h1M14.5 14h1.5M14.5 17h1.5" />,
    cartera: <path d="M5.5 7h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />,
    decisiones: <path d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
  };
  // La píldora: los destinos de todos los días, con ícono. Lo demás vive en el menú completo.
  const abajo: [string, string, string][] = [
    ["/bandeja", "Inicio", "inicio"],
    ["/empresas", "Empresas", "empresas"],
    ["/cartera", "Cartera", "cartera"],
    ["/decisiones", "Decisiones", "decisiones"],
  ];
  const iniciales = usuario.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "8X";

  return (
    <>
      <header className="cabecera-app no-imprimir">
        <Link href="/bandeja" className="marca-app">
          8X <small>RENASER</small>
        </Link>
        <nav className="pildora" aria-label="Secciones">
          {abajo.map(([href, nombre, icono]) => {
            const a = href === "/bandeja" ? ruta === "/bandeja" : ruta.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={a ? "page" : undefined} aria-label={nombre} title={nombre}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[icono]}</svg>
                <span className="rotulo">{nombre}</span>
              </Link>
            );
          })}
          <button type="button" className="solo-celular" onClick={() => setAbierto(true)} aria-label="Más secciones" aria-expanded={abierto}>
            <Icono nombre="menu" />
            <span className="rotulo">Más</span>
          </button>
        </nav>
        <div className="acciones-app">
          {torre}
          <button type="button" className="boton-redondo solo-escritorio" onClick={() => setAbierto(true)} aria-label="Todas las secciones" title="Todas las secciones" aria-expanded={abierto}>
            <Icono nombre="menu" />
          </button>
          <span className="avatar-app" role="img" aria-label={usuario} title={usuario}>{iniciales}</span>
        </div>
      </header>

      {abierto && (
        <>
          <button type="button" className="telon no-imprimir" aria-label="Cerrar el menú" onClick={() => setAbierto(false)} />
          <div className="panel-lateral no-imprimir" role="dialog" aria-modal="true" aria-label="Todas las secciones">
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <p className="t-seccion">Todo 8X</p>
              <button type="button" className="boton boton--secundario" onClick={() => setAbierto(false)}>Cerrar</button>
            </div>
            <nav className="menu-app" aria-label="Todas las secciones" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setAbierto(false); }}>
              {item("/bandeja", "Inicio", true)}
              {item("/empresas", "Todas las empresas", true)}
              {item("/cartera", "Cartera", true)}
              {item("/decisiones", "Decisiones por tomar")}
              {empresas.length > 0 && <p className="titulo-menu">Empresas recientes</p>}
              {empresas.map((e) => item(`/empresa/${e.id}`, e.nombre.length > 30 ? e.nombre.slice(0, 29) + "…" : e.nombre))}
              <p className="titulo-menu">Sistema</p>
              {item("/casos", "Aprendizaje del sistema")}
              {item("/torre", "Torre de control")}
              {item("/salud", "Salud del sistema")}
            </nav>
            <div className="flex items-center justify-between gap-3" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--linea)" }}>
              <span className="t-dato" style={{ color: "var(--grafito)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{usuario}</span>
              <form action="/api/auth/salir" method="post">
                <button className="boton boton--secundario">Salir</button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}

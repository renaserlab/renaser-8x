"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación del portal con forma de APLICATIVO, no de página web:
 * — Celular/tablet: barra INFERIOR fija con 5 destinos e íconos (patrón de app nativa).
 * — Escritorio: barra lateral oscura (la misma familia visual que el lado del consultor).
 * Los íconos son SVG de línea (nunca emoji).
 */

const ICONOS: Record<string, React.ReactNode> = {
  inicio: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  conversar: <path d="M4 5h16v11H9l-5 4V5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  empresa: <path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  informacion: <path d="M4 6h7l2 2h7v12H4V6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  plan: <path d="M6 3v18M6 4h12l-2.5 3.5L18 11H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
};

const PRINCIPALES: [string, string, string][] = [
  ["/portal", "Inicio", "inicio"],
  ["/portal/conversacion", "Conversar", "conversar"],
  ["/portal/hoy", "Mi empresa", "empresa"],
  ["/portal/activos", "Tu información", "informacion"],
  ["/portal/plan", "Plan", "plan"],
];

/** A qué destino principal pertenece cada ruta secundaria (para marcar el activo). */
const GRUPO: [string, string][] = [
  ["/portal/validar", "/portal/conversacion"],
  ["/portal/resultados", "/portal/hoy"],
  ["/portal/procesos", "/portal/activos"],
  ["/portal/documentos", "/portal/activos"],
];

export function NavCliente({ enlaces, empresa }: { enlaces: [string, string][]; empresa?: string }) {
  const ruta = usePathname();
  const activoDe = (href: string) => {
    if (href === "/portal") return ruta === "/portal";
    if (ruta.startsWith(href)) return true;
    return GRUPO.some(([sec, principal]) => principal === href && ruta.startsWith(sec));
  };

  return (
    <>
      {/* CELULAR Y TABLET: barra inferior fija, 5 destinos con ícono */}
      <nav
        className="no-imprimir lg:hidden"
        aria-label="Secciones"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
          background: "color-mix(in srgb, var(--papel) 94%, transparent)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          borderTop: "1px solid var(--linea)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex" style={{ maxWidth: 560, margin: "0 auto" }}>
          {PRINCIPALES.map(([href, nombre, icono]) => {
            const a = activoDe(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={a ? "page" : undefined}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 2px 7px", textDecoration: "none", color: a ? "var(--marca)" : "var(--grafito)" }}
              >
                <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">{ICONOS[icono]}</svg>
                <span style={{ fontSize: 10.5, fontWeight: a ? 700 : 500, letterSpacing: "0.01em" }}>{nombre}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ESCRITORIO: barra lateral oscura (misma familia que el consultor) */}
      <aside
        className="no-imprimir hidden lg:flex"
        style={{ width: 232, flexDirection: "column", gap: 4, padding: "18px 12px", background: "var(--marca)", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flex: "none" }}
      >
        <Link href="/portal" style={{ color: "var(--papel)", fontWeight: 700, fontSize: 18, padding: "4px 14px 2px", textDecoration: "none", letterSpacing: "0.04em" }}>8X</Link>
        {empresa && <p className="t-dato" style={{ color: "color-mix(in srgb, var(--papel) 65%, transparent)", padding: "0 14px 12px" }}>{empresa}</p>}
        {enlaces.map(([href, nombre]) => {
          const a = href === "/portal" ? ruta === "/portal" : ruta.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={a ? "page" : undefined}
              className="t-dato"
              style={{
                display: "block", padding: "9px 14px", borderRadius: "var(--radio)",
                color: a ? "var(--papel)" : "color-mix(in srgb, var(--papel) 72%, transparent)",
                background: a ? "color-mix(in srgb, var(--papel) 14%, transparent)" : "transparent",
                fontWeight: a ? 600 : 500, textDecoration: "none",
              }}
            >
              {nombre}
            </Link>
          );
        })}
        <div style={{ marginTop: "auto", padding: "12px 14px" }}>
          <form action="/api/auth/salir" method="post">
            <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "color-mix(in srgb, var(--papel) 72%, transparent)", padding: 0, font: "inherit", textDecoration: "underline" }}>Salir</button>
          </form>
        </div>
      </aside>
    </>
  );
}

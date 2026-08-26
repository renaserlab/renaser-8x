"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type EmpresaMini = { id: string; nombre: string };

/**
 * Barra lateral del consultor (escritorio ≥1024px): navegación fija estilo aplicativo,
 * con las empresas a un clic. En móvil se oculta y manda la barra superior.
 */
export function NavConsultor({ empresas, usuario }: { empresas: EmpresaMini[]; usuario: string }) {
  const ruta = usePathname();
  const item = (href: string, nombre: string, exacto = false) => {
    const activo = exacto ? ruta === href : ruta.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={activo ? "page" : undefined}
        className="t-dato"
        style={{
          display: "block",
          padding: "9px 14px",
          borderRadius: "var(--radio)",
          color: activo ? "var(--papel)" : "color-mix(in srgb, var(--papel) 72%, transparent)",
          background: activo ? "color-mix(in srgb, var(--papel) 14%, transparent)" : "transparent",
          fontWeight: activo ? 600 : 500,
          textDecoration: "none",
        }}
      >
        {nombre}
      </Link>
    );
  };
  const ICONOS: Record<string, React.ReactNode> = {
    inicio: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    empresas: <path d="M3 21h18M5 21V7l6-3v17M13 21V11l6 3v7M8 9v.01M8 13v.01M8 17v.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    casos: <path d="M12 3a4 4 0 0 1 4 4c0 2-1.5 3-1.5 5h-5C9.5 10 8 9 8 7a4 4 0 0 1 4-4ZM9.5 15h5M10 18h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  };
  const abajo: [string, string, string][] = [["/bandeja", "Inicio", "inicio"], ["/empresas", "Empresas", "empresas"], ["/casos", "Aprendizaje", "casos"]];
  return (
    <>
      {/* CELULAR Y TABLET: barra inferior fija de app, igual que el lado del cliente */}
      <nav
        className="no-imprimir lg:hidden"
        aria-label="Secciones"
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, background: "color-mix(in srgb, var(--papel) 94%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid var(--linea)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex" style={{ maxWidth: 460, margin: "0 auto" }}>
          {abajo.map(([href, nombre, icono]) => {
            const a = href === "/bandeja" ? ruta === "/bandeja" : ruta.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={a ? "page" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 2px 7px", textDecoration: "none", color: a ? "var(--marca)" : "var(--grafito)" }}>
                <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">{ICONOS[icono]}</svg>
                <span style={{ fontSize: 10.5, fontWeight: a ? 700 : 500 }}>{nombre}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    <aside
      className="no-imprimir hidden lg:flex"
      style={{ width: 232, flexDirection: "column", gap: 4, padding: "18px 12px", background: "var(--marca)", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flex: "none" }}
    >
      <Link href="/bandeja" style={{ color: "var(--papel)", fontWeight: 700, fontSize: 18, padding: "4px 14px 14px", textDecoration: "none", letterSpacing: "0.04em" }}>
        8X <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>RENASER</span>
      </Link>
      {item("/bandeja", "Inicio", true)}
      {item("/empresas", "Todas las empresas", true)}
      <p className="t-etiqueta" style={{ color: "color-mix(in srgb, var(--papel) 55%, transparent)", padding: "16px 14px 6px" }}>Empresas recientes</p>
      {empresas.map((e) => item(`/empresa/${e.id}`, e.nombre.length > 24 ? e.nombre.slice(0, 23) + "…" : e.nombre))}
      <div style={{ marginTop: "auto", padding: "12px 14px" }}>
        <Link href="/casos" className="t-dato" style={{ display: "block", color: "color-mix(in srgb, var(--papel) 60%, transparent)", marginBottom: 10, textDecoration: "none" }}>Aprendizaje del sistema</Link>
        <p className="t-dato" style={{ color: "color-mix(in srgb, var(--papel) 60%, transparent)", marginBottom: 8 }}>{usuario}</p>
        <form action="/api/auth/salir" method="post">
          <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "color-mix(in srgb, var(--papel) 72%, transparent)", padding: 0, font: "inherit", textDecoration: "underline" }}>Salir</button>
        </form>
      </div>
    </aside>
    </>
  );
}

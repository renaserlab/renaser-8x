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
  return (
    <aside
      className="no-imprimir hidden lg:flex"
      style={{ width: 232, flexDirection: "column", gap: 4, padding: "18px 12px", background: "var(--marca)", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flex: "none" }}
    >
      <Link href="/bandeja" style={{ color: "var(--papel)", fontWeight: 700, fontSize: 18, padding: "4px 14px 14px", textDecoration: "none", letterSpacing: "0.04em" }}>
        8X <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>RENASER</span>
      </Link>
      {item("/bandeja", "Bandeja", true)}
      {item("/empresas", "Empresas", true)}
      {item("/casos", "Casos", true)}
      <p className="t-etiqueta" style={{ color: "color-mix(in srgb, var(--papel) 55%, transparent)", padding: "16px 14px 6px" }}>Tus empresas</p>
      {empresas.map((e) => item(`/empresa/${e.id}`, e.nombre.length > 24 ? e.nombre.slice(0, 23) + "…" : e.nombre))}
      <div style={{ marginTop: "auto", padding: "12px 14px" }}>
        <p className="t-dato" style={{ color: "color-mix(in srgb, var(--papel) 60%, transparent)", marginBottom: 8 }}>{usuario}</p>
        <form action="/api/auth/salir" method="post">
          <button className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", color: "color-mix(in srgb, var(--papel) 72%, transparent)", padding: 0, font: "inherit", textDecoration: "underline" }}>Salir</button>
        </form>
      </div>
    </aside>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación del portal con aire de aplicativo, no de página web: una sola fila deslizable,
 * sin cajas por enlace; el activo se marca con tinta y una línea firme debajo.
 */
export function NavCliente({ enlaces }: { enlaces: [string, string][] }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/portal" ? ruta === "/portal" : ruta.startsWith(href));
  return (
    <nav
      className="no-imprimir"
      aria-label="Secciones"
      style={{ position: "sticky", top: 0, zIndex: 20, background: "color-mix(in srgb, var(--papel) 92%, transparent)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderBottom: "1px solid var(--linea)" }}
    >
      <div className="flex overflow-x-auto px-4" style={{ scrollbarWidth: "none", gap: 4, maxWidth: 760, margin: "0 auto" }}>
        {enlaces.map(([href, nombre]) => {
          const a = activo(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={a ? "page" : undefined}
              style={{
                whiteSpace: "nowrap",
                padding: "12px 10px 10px",
                fontSize: 15,
                fontWeight: a ? 600 : 500,
                color: a ? "var(--tinta)" : "var(--grafito)",
                borderBottom: a ? "2px solid var(--marca)" : "2px solid transparent",
                textDecoration: "none",
                flex: "none",
              }}
            >
              {nombre}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

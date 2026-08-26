"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de la empresa con estado activo real (línea firme), deslizables en pantallas chicas. */
export function TabsEmpresa({ base, tabs }: { base: string; tabs: [string, string][] }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 mt-4 overflow-x-auto" style={{ borderBottom: "1px solid var(--linea)", scrollbarWidth: "none" }}>
      {tabs.map(([h, n]) => {
        const href = `${base}${h}`;
        const activo = h === "" ? ruta === base : ruta.startsWith(href);
        return (
          <Link
            key={h}
            href={href}
            aria-current={activo ? "page" : undefined}
            className="t-dato px-3 py-2"
            style={{ whiteSpace: "nowrap", color: activo ? "var(--tinta)" : "var(--grafito)", fontWeight: activo ? 600 : 500, borderBottom: activo ? "2px solid var(--marca)" : "2px solid transparent", marginBottom: -1, textDecoration: "none" }}
          >
            {n}
          </Link>
        );
      })}
    </nav>
  );
}

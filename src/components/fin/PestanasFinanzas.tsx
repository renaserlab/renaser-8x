"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PESTANAS_FINANZAS } from "@/lib/os/menu";

/**
 * Las pestañas de Finanzas (19-10-2026): Caja, Cobros, Pagos e Informe del mes. Una sola fila, montada por cada pantalla
 * de /os/finanzas arriba de su contenido; la marca la ruta abierta. Se desliza en un celular.
 */
export function PestanasFinanzas() {
  const ruta = usePathname();
  return (
    <nav className="fin-pestanas no-imprimir" aria-label="Secciones de Finanzas">
      {PESTANAS_FINANZAS.map(([href, nombre]) => (
        <Link key={href} href={href} aria-current={ruta === href ? "page" : undefined}>
          {nombre}
        </Link>
      ))}
    </nav>
  );
}

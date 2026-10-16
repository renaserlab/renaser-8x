"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { destinoDe } from "./NavCliente";

/**
 * LO QUE HAY DENTRO DE CADA DESTINO. La barra del portal tiene cinco destinos y no crece (regla escrita en
 * src/app/(cliente)/layout.tsx). Las demás pantallas viven dentro de uno de ellos, y esta fila las enlaza
 * con el nombre que usa el empresario: así toda pantalla queda a dos toques como máximo.
 * Se monta UNA vez, en el layout; ninguna página necesita saber que existe.
 *
 * Bajo qué destino va cada pantalla lo decide el mapa GRUPO de NavCliente; aquí solo se le pone nombre y
 * orden. Los nombres son del empresario, nunca jerga de consultoría. tests/recorrido-conectado.test.ts
 * vigila que toda pantalla del portal esté en el mapa y tenga nombre en esta lista.
 */
const NOMBRES: [string, string][] = [
  ["/portal/entrada", "Cuéntanos tu negocio"],
  ["/portal/conversacion", "Conversación"],
  ["/portal/direccion", "Hacia dónde vamos"],
  ["/portal/numeros", "Tus números"],
  ["/portal/producto", "Lo que vendes"],
  ["/portal/validar", "Confirmar información"],
  ["/portal/informe", "Informe"],
  ["/portal/documentos", "Archivos aportados"],
  ["/portal/semana", "Esta semana"],
  ["/portal/kpis", "Tus indicadores"],
  ["/portal/resultados", "Cómo vamos"],
  ["/portal/iniciativas", "Lo que estamos probando"],
];

const CAMBIAR = "/portal/elegir-empresa";

export function EnEstaSeccion({ variasEmpresas = false }: { variasEmpresas?: boolean }) {
  const ruta = usePathname();
  const activa = useRef<HTMLAnchorElement | null>(null);
  const destino = destinoDe(ruta);
  const enlaces = destino ? NOMBRES.filter(([href]) => destinoDe(href) === destino) : [];
  // Cambiar de empresa no es una sección: es un enlace discreto, y solo para quien tiene más de una.
  const cambiar = variasEmpresas && ruta !== CAMBIAR;

  // Solo se mueve la fila, nunca la página: en un celular el enlace activo no puede quedar fuera de la vista.
  useEffect(() => {
    const el = activa.current;
    const fila = el?.parentElement;
    if (!el || !fila || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft += el.getBoundingClientRect().left - fila.getBoundingClientRect().left - (fila.clientWidth - el.clientWidth) / 2;
  }, [ruta]);

  if (!enlaces.length && !cambiar) return null;
  return (
    <nav className="no-imprimir en-seccion overflow-x-auto" aria-label="En esta sección">
      {enlaces.map(([href, nombre]) => {
        const a = ruta === href || ruta.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            ref={a ? activa : undefined}
            href={href}
            aria-current={a ? "page" : undefined}
            style={{ whiteSpace: "nowrap" }}
          >
            {nombre}
          </Link>
        );
      })}
      {cambiar && (
        <Link
          href={CAMBIAR}
          className="cambiar"
        >
          Cambiar de empresa
        </Link>
      )}
    </nav>
  );
}

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
  // Inicio
  ["/portal/entrada", "Cuéntanos tu negocio"],
  ["/portal/conversacion", "Conversación"],
  ["/portal/pedidos", "Lo que te pidió tu consultora"],
  // Los dos nombres estaban cruzados y por eso la dueña no encontraba lo suyo (18-10-2026): buscaba
  // «Tus documentos» y llegaba a la pantalla de SUBIR, mientras su documentación vigente vivía bajo
  // «Archivos aportados», que suena a archivador de material en bruto. Ahora cada nombre dice lo que
  // hay detrás: información es lo que ella nos va entregando; documentos son los que RIGEN.
  ["/portal/activos", "Tu información"],
  ["/portal/documentos", "Tus documentos"],
  // Tu diagnóstico
  ["/portal/hoy", "Todo lo que encontramos"],
  ["/portal/validar", "Confirmar información"],
  ["/portal/direccion", "Hacia dónde vamos"],
  ["/portal/informe", "Informe"],
  // Tus números
  ["/portal/producto", "Lo que vendes"],
  ["/portal/costos", "Tus gastos del mes"],
  ["/portal/historia", "Tu historia"],
  ["/portal/cobros", "Cobros y mercadería"],
  // Tu plan («Preguntas para tu plan» sale solo con preguntas enviadas: pantallasSinPedido, src/lib/secciones.ts)
  ["/portal/plan/preguntas", "Preguntas para tu plan"],
  ["/portal/semana", "Esta semana"],
  ["/portal/kpis", "Tus indicadores"],
  ["/portal/resultados", "Cómo vamos"],
  ["/portal/iniciativas", "Lo que estamos probando"],
];

const CAMBIAR = "/portal/elegir-empresa";

/**
 * `ocultar`: las pantallas que hoy no le tocan al dueño (pantallasOcultas de src/lib/secciones.ts: cerradas por su
 * consultora y sin nada guardado). Lo decide el layout, que ya lee qué está abierto. La pantalla en la que se está
 * nunca se esconde de la fila.
 */
export function EnEstaSeccion({ variasEmpresas = false, ocultar = [] }: { variasEmpresas?: boolean; ocultar?: readonly string[] }) {
  const ruta = usePathname();
  const activa = useRef<HTMLAnchorElement | null>(null);
  const destino = destinoDe(ruta);
  const enEsta = (href: string) => ruta === href || ruta.startsWith(`${href}/`);
  const enlaces = destino ? NOMBRES.filter(([href]) => destinoDe(href) === destino && (!ocultar.includes(href) || enEsta(href))) : [];
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
        const a = enEsta(href);
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

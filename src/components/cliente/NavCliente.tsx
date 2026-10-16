"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/components/base/Icono";

/**
 * Navegación del portal en PÍLDORA (estilo del 13-10-2026, imagen de referencia de Kelin):
 * — Escritorio: cabecera con la marca a la izquierda, la píldora centrada y «Salir» a la derecha.
 * — Celular/tablet: la misma píldora flota abajo, con el nombre bajo cada ícono (en un toque no hay «title»).
 * El destino activo es la píldora oscura con su nombre. Los íconos son trazos (Icono.tsx), nunca emoji.
 */

// Cinco destinos: cada uno es un LUGAR distinto, ninguno repite lo del otro.
const PRINCIPALES: [string, string, NombreIcono][] = [
  ["/portal", "Inicio", "inicio"],
  ["/portal/hoy", "Mi empresa", "miempresa"],
  ["/portal/procesos", "Procesos", "procesos"],
  ["/portal/activos", "Tus documentos", "carpeta"],
  ["/portal/plan", "Plan", "plan"],
];

/**
 * A qué destino principal pertenece cada pantalla secundaria. Sirve para dos cosas: marcar el destino
 * activo en la barra y decidir qué enlaces pinta la fila «En esta sección» (EnEstaSeccion.tsx).
 * Toda carpeta con page.tsx bajo /portal que no sea uno de los cinco destinos tiene que estar aquí:
 * lo vigila tests/recorrido-conectado.test.ts. La barra NO crece cuando nace una pantalla; crece este mapa.
 */
export const GRUPO: [string, string][] = [
  ["/portal/entrada", "/portal"],
  ["/portal/conversacion", "/portal"],
  ["/portal/direccion", "/portal/hoy"],
  ["/portal/numeros", "/portal/hoy"],
  ["/portal/producto", "/portal/hoy"],
  ["/portal/validar", "/portal/hoy"],
  ["/portal/informe", "/portal/hoy"],
  ["/portal/documentos", "/portal/activos"],
  ["/portal/semana", "/portal/plan"],
  ["/portal/kpis", "/portal/plan"],
  ["/portal/resultados", "/portal/plan"],
  ["/portal/iniciativas", "/portal/plan"],
];

const dentroDe = (ruta: string, base: string) => ruta === base || ruta.startsWith(`${base}/`);

/** El destino principal (uno de los cinco) al que pertenece una ruta del portal; null si no es de ninguno. */
export function destinoDe(ruta: string): string | null {
  if (ruta === "/portal") return "/portal";
  const secundaria = GRUPO.find(([sec]) => dentroDe(ruta, sec));
  if (secundaria) return secundaria[1];
  return PRINCIPALES.find(([href]) => href !== "/portal" && dentroDe(ruta, href))?.[0] ?? null;
}

/** El ícono de cada destino sale de PRINCIPALES: la lista del layout y esta dicen lo mismo. */
const ICONO_DE = new Map(PRINCIPALES.map(([href, , icono]) => [href, icono]));

export function NavCliente({ enlaces, empresa }: { enlaces: [string, string][]; empresa?: string }) {
  const ruta = usePathname();
  // Un solo criterio para la píldora de arriba y la de abajo: el destino al que pertenece la pantalla abierta.
  const destino = destinoDe(ruta);

  return (
    <header className="cabecera-app no-imprimir">
      <Link href="/portal" className="marca-app">
        8X {empresa && <small>{empresa}</small>}
      </Link>
      <nav className="pildora" aria-label="Secciones">
        {enlaces.map(([href, nombre]) => {
          const a = destino === href;
          return (
            <Link key={href} href={href} aria-current={a ? "page" : undefined} aria-label={nombre} title={nombre}>
              <Icono nombre={ICONO_DE.get(href) ?? "inicio"} />
              <span className="rotulo">{nombre}</span>
            </Link>
          );
        })}
      </nav>
      <div className="acciones-app">
        <form action="/api/auth/salir" method="post">
          <button className="boton-redondo" aria-label="Salir" title="Salir">
            <Icono nombre="salir" />
          </button>
        </form>
      </div>
    </header>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { Lateral } from "@/components/navegacion/Lateral";

/**
 * Navegación del portal AL COSTADO (pedido de Kelin, 16-10-2026: «navegación al costado, que se vea la barra
 * lateral o pueda ocultarla»). Una sola barra (Lateral.tsx) para escritorio y celular:
 * — Escritorio: fija a la izquierda con los cinco destinos; se oculta a un riel de íconos y se vuelve a mostrar.
 * — Celular/tablet: franja fina arriba con «Abrir el menú» y «Salir»; la barra entra desde la izquierda.
 * El destino activo es la píldora oscura. Los íconos son trazos (Icono.tsx), nunca emoji. Junto a un destino
 * puede ir un contador con lo que la consultora pidió llenar (`avisos`, lo pasa el layout).
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
  ["/portal/pedidos", "/portal"],
  ["/portal/direccion", "/portal/hoy"],
  ["/portal/numeros", "/portal/hoy"],
  ["/portal/producto", "/portal/hoy"],
  ["/portal/costos", "/portal/hoy"],
  ["/portal/historia", "/portal/hoy"],
  ["/portal/cobros", "/portal/hoy"],
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

export function NavCliente({ enlaces, empresa, avisos }: { enlaces: [string, string][]; empresa?: string; avisos?: Record<string, number> }) {
  const ruta = usePathname();
  // Un solo criterio para marcar el destino activo: el destino al que pertenece la pantalla abierta.
  const destino = destinoDe(ruta);
  const salir = (
    <form action="/api/auth/salir" method="post">
      <button className="boton-redondo" aria-label="Salir" title="Salir">
        <Icono nombre="salir" />
      </button>
    </form>
  );

  return (
    <Lateral
      etiqueta="Menú de tu empresa"
      marca={
        <Link href="/portal" className="marca-app">
          8X {empresa && <small>{empresa}</small>}
        </Link>
      }
      enMovil={salir}
      pie={
        <form action="/api/auth/salir" method="post" className="lateral__salir">
          <button title="Salir">
            <Icono nombre="salir" />
            <span className="rotulo">Salir</span>
          </button>
        </form>
      }
    >
      <nav className="menu-lateral" aria-label="Secciones">
        {enlaces.map(([href, nombre]) => {
          const a = destino === href;
          // Lo que la consultora pidió y sigue abierto se cuenta junto al destino donde se llena.
          const n = avisos?.[href] ?? 0;
          const pendientes = n > 0 ? `${n} ${n === 1 ? "pedido" : "pedidos"} de tu consultora` : null;
          return (
            <Link
              key={href}
              href={href}
              aria-current={a ? "page" : undefined}
              aria-label={pendientes ? `${nombre}, ${pendientes}` : nombre}
              title={pendientes ? `${nombre} · ${pendientes}` : nombre}
            >
              <Icono nombre={ICONO_DE.get(href) ?? "inicio"} />
              <span className="rotulo">{nombre}</span>
              {pendientes && (
                <span className="contador" role="img" aria-label={pendientes}>
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </Lateral>
  );
}

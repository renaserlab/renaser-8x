"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { Lateral } from "@/components/navegacion/Lateral";
import { Logo8X } from "@/components/base/Logo8X";
import type { GrupoMenu } from "@/lib/os/menu";

/**
 * Navegación del portal AL COSTADO (pedido de Kelin, 16-10-2026: «navegación al costado, que se vea la barra
 * lateral o pueda ocultarla»). Una sola barra (Lateral.tsx) para escritorio y celular:
 * — Escritorio: fija a la izquierda con los cinco destinos; se oculta a un riel de íconos y se vuelve a mostrar.
 * — Celular/tablet: franja fina arriba con «Abrir el menú» y «Salir»; la barra entra desde la izquierda.
 * El destino activo lleva la luz dorada del logo sobre la barra noche (src/design/marco.css). Los íconos son trazos
 * (Icono.tsx), nunca emoji. Junto a un destino
 * puede ir un contador con lo que la consultora pidió llenar (`avisos`, lo pasa el layout).
 */

// Cinco destinos (pedido de Kelin, 16-10-2026: «diagnóstico, qué hay en números, indicadores y el avance»).
// Cada uno es un LUGAR distinto, ninguno repite lo del otro: lo que hay, lo que encontramos, cuánto, cómo se
// hace y qué haremos. «Mi empresa» y «Tus documentos» dejaron de ser destinos: viven dentro de uno de estos.
const PRINCIPALES: [string, string, NombreIcono][] = [
  ["/portal", "Inicio", "inicio"],
  ["/portal/diagnostico", "Tu diagnóstico", "diagnostico"],
  ["/portal/numeros", "Tus números", "numeros"],
  ["/portal/procesos", "Tus procesos", "procesos"],
  ["/portal/plan", "Tu plan", "plan"],
];

/**
 * A qué destino principal pertenece cada pantalla secundaria. Sirve para dos cosas: marcar el destino
 * activo en la barra y decidir qué enlaces pinta la fila «En esta sección» (EnEstaSeccion.tsx).
 * Toda carpeta con page.tsx bajo /portal que no sea uno de los cinco destinos tiene que estar aquí:
 * lo vigila tests/recorrido-conectado.test.ts. La barra NO crece cuando nace una pantalla; crece este mapa.
 * Ninguna pantalla se borró al pasar a cinco destinos: «Mi empresa» (/portal/hoy) sigue abriendo, bajo
 * «Tu diagnóstico», y «Tus documentos» (/portal/activos), bajo «Inicio».
 */
export const GRUPO: [string, string][] = [
  ["/portal/entrada", "/portal"],
  ["/portal/conversacion", "/portal"],
  ["/portal/pedidos", "/portal"],
  ["/portal/activos", "/portal"],
  ["/portal/documentos", "/portal"],
  ["/portal/hoy", "/portal/diagnostico"],
  ["/portal/validar", "/portal/diagnostico"],
  ["/portal/direccion", "/portal/diagnostico"],
  ["/portal/informe", "/portal/diagnostico"],
  ["/portal/producto", "/portal/numeros"],
  ["/portal/costos", "/portal/numeros"],
  ["/portal/historia", "/portal/numeros"],
  ["/portal/cobros", "/portal/numeros"],
  ["/portal/plan/preguntas", "/portal/plan"],
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

/**
 * RENASER OS (19-10-2026): con `grupos`, la barra pinta «Inicio», después los grupos de RENASER OS («Mi día» y, para la
 * gestión, «Mi equipo») y los otros cuatro destinos bajo «Consultoría 8X». El personal no tiene consultoría: llega sin
 * `enlaces` y solo ve sus grupos. Sin `grupos`, la barra es exactamente la de siempre. `perfil` pone «Mi perfil» al pie.
 */
export function NavCliente({
  enlaces,
  empresa,
  avisos,
  grupos,
  perfil,
}: {
  enlaces: [string, string][];
  empresa?: string;
  avisos?: Record<string, number>;
  grupos?: GrupoMenu[];
  perfil?: { href: string; nombre: string; sub: string; iniciales: string };
}) {
  const ruta = usePathname();
  // Un solo criterio para marcar el destino activo: el destino al que pertenece la pantalla abierta.
  const destino = destinoDe(ruta);
  const conOS = !!grupos?.length;
  const [inicio, ...consultoria] = conOS ? enlaces : [];
  const salir = (
    <form action="/api/auth/salir" method="post">
      <button className="boton-redondo" aria-label="Salir" title="Salir">
        <Icono nombre="salir" />
      </button>
    </form>
  );

  // Un destino de la barra, con el contador de lo pendiente cuando lo hay (pedidos de la consultora o avisos sin leer).
  const enlace = (href: string, nombre: string, icono: NombreIcono, activo: boolean) => {
    const n = avisos?.[href] ?? 0;
    const pendientes = n > 0 ? (href.startsWith("/os/") ? `${n} sin leer` : `${n} ${n === 1 ? "pedido" : "pedidos"} de tu consultora`) : null;
    return (
      <Link key={href} href={href} aria-current={activo ? "page" : undefined} aria-label={pendientes ? `${nombre}, ${pendientes}` : nombre} title={pendientes ? `${nombre} · ${pendientes}` : nombre}>
        <Icono nombre={icono} />
        <span className="rotulo">{nombre}</span>
        {pendientes && (
          <span className="contador" role="img" aria-label={pendientes}>
            {n}
          </span>
        )}
      </Link>
    );
  };

  return (
    <Lateral
      etiqueta="Menú de tu empresa"
      marca={
        <Link href="/portal" className="marca-app" title={empresa ? `8X · ${empresa}` : "8X"}>
          <Logo8X variante="luz" alto={28} />
          {empresa && <small className="marca-app__empresa">{empresa}</small>}
        </Link>
      }
      enMovil={salir}
      pie={
        perfil ? (
          <>
            <Link href={perfil.href} className="lateral__perfil" aria-current={ruta === perfil.href ? "page" : undefined} title="Mi perfil">
              <span className="avatar-app" aria-hidden="true">{perfil.iniciales}</span>
              <span className="lateral__quien rotulo">
                {perfil.nombre}
                <small>{perfil.sub}</small>
              </span>
            </Link>
            <form action="/api/auth/salir" method="post">
              <button className="boton-redondo" aria-label="Salir" title="Salir">
                <Icono nombre="salir" />
              </button>
            </form>
          </>
        ) : (
          <form action="/api/auth/salir" method="post" className="lateral__salir">
            <button title="Salir">
              <Icono nombre="salir" />
              <span className="rotulo">Salir</span>
            </button>
          </form>
        )
      }
    >
      <nav className="menu-lateral" aria-label="Secciones">
        {conOS && inicio && enlace(inicio[0], inicio[1], ICONO_DE.get(inicio[0]) ?? "inicio", destino === inicio[0])}
        {conOS &&
          grupos!.map((g) => (
            <div className="grupo-lateral" key={g.titulo}>
              <p className="titulo-menu rotulo">{g.titulo}</p>
              {g.items.map(([href, nombre, icono]) => enlace(href, nombre, icono, ruta === href || ruta.startsWith(`${href}/`)))}
            </div>
          ))}
        {conOS && consultoria.length > 0 && (
          <div className="grupo-lateral">
            <p className="titulo-menu rotulo">Consultoría 8X</p>
            {consultoria.map(([href, nombre]) => enlace(href, nombre, ICONO_DE.get(href) ?? "inicio", destino === href))}
          </div>
        )}
        {!conOS && enlaces.map(([href, nombre]) => {
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

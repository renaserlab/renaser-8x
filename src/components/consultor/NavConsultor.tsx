"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { Lateral } from "@/components/navegacion/Lateral";
import { Logo8X } from "@/components/base/Logo8X";

type EmpresaMini = { id: string; nombre: string };

/**
 * Navegación de la consultora AL COSTADO (pedido de Kelin, 16-10-2026). Una sola barra (Lateral.tsx):
 * fija a la izquierda en escritorio, que se puede ocultar a un riel de íconos; en celular entra desde la izquierda.
 * Desde el 17-10-2026 es la barra noche con el 8X en luz y «RENASER» al lado; el destino activo lleva la luz dorada
 * del logo (src/design/marco.css).
 * Grupos, en este orden:
 *   1. los destinos de todos los días, con ícono (`principales`): lo único que se ve en el riel;
 *   2. «Empresas recientes», una por fila;
 *   3. «RENASER OS» (19-10-2026): el pulso de los equipos de todas las empresas y sus avisos;
 *   4. «Sistema»: aprendizaje, torre de control y salud;
 *   5. al pie, quién entró y «Salir».
 * Esta barra ES el menú completo: tests/recorrido-conectado.test.ts vigila que toda pantalla de la consultora
 * esté enlazada aquí. La Cartera va entre los principales: es la pantalla de Dirección y no puede depender de
 * teclear la dirección.
 */
export function NavConsultor({ empresas, usuario, torre }: { empresas: EmpresaMini[]; usuario: string; torre?: React.ReactNode }) {
  const ruta = usePathname();
  const dentro = (href: string) => ruta === href || ruta.startsWith(`${href}/`);

  // `exacto`: el destino se marca solo en su propia página, no en las de abajo (el pulso no se enciende en sus avisos).
  const item = (href: string, nombre: string, icono?: NombreIcono, exacto = false) => {
    const activo = exacto ? ruta === href : dentro(href);
    return (
      <Link key={href} href={href} aria-current={activo ? "page" : undefined} title={nombre}>
        {icono ? <Icono nombre={icono} /> : <span className="punto" aria-hidden="true" />}
        <span className="rotulo">{nombre}</span>
      </Link>
    );
  };
  const ICONOS: Record<string, React.ReactNode> = {
    inicio: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
    empresas: <path d="M4 20V6.5L11 4v16M11 9l9 2.5V20M2.5 20h19M7 9h1M7 12.5h1M7 16h1M14.5 14h1.5M14.5 17h1.5" />,
    cartera: <path d="M5.5 7h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />,
    decisiones: <path d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z" />,
  };
  // Los destinos de todos los días, con ícono. Son los únicos que quedan a la vista con la barra oculta en riel.
  const principales: [string, string, string][] = [
    ["/bandeja", "Inicio", "inicio"],
    ["/empresas", "Empresas", "empresas"],
    ["/cartera", "Cartera", "cartera"],
    ["/decisiones", "Decisiones", "decisiones"],
  ];
  const iniciales = usuario.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "8X";

  return (
    <Lateral
      etiqueta="Menú de 8X"
      marca={
        <Link href="/bandeja" className="marca-app" title="8X · RENASER">
          <Logo8X variante="luz" alto={28} />
          <small className="marca-app__firma">RENASER</small>
        </Link>
      }
      enMovil={torre}
      pie={
        <>
          <span className="avatar-app" role="img" aria-label={usuario} title={usuario}>{iniciales}</span>
          <span className="lateral__quien rotulo" title={usuario}>{usuario}</span>
          <form action="/api/auth/salir" method="post">
            <button className="boton-redondo" aria-label="Salir" title="Salir">
              <Icono nombre="salir" />
            </button>
          </form>
        </>
      }
    >
      <nav className="menu-lateral" aria-label="Secciones">
        {principales.map(([href, nombre, icono]) => {
          const a = href === "/bandeja" ? ruta === "/bandeja" : dentro(href);
          // Dentro de una empresa, «Empresas» queda señalada (sin ser la página actual): con la barra en riel las
          // empresas recientes no se ven, y así se sabe dónde se está.
          const enUnaEmpresa = href === "/empresas" && ruta.startsWith("/empresa/");
          return (
            <Link key={href} href={href} aria-current={a ? "page" : undefined} data-dentro={enUnaEmpresa ? "si" : undefined} aria-label={nombre} title={nombre}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[icono]}</svg>
              <span className="rotulo">{nombre}</span>
            </Link>
          );
        })}
        <div className="grupo-lateral">
          <p className="titulo-menu rotulo">RENASER OS</p>
          {item("/pulso", "Pulso de empresas", "pulso", true)}
          {item("/pulso/avisos", "Avisos de clientes", "campana")}
        </div>
        {empresas.length > 0 && (
          <div className="grupo-lateral" data-grupo="secundario">
            <p className="titulo-menu">Empresas recientes</p>
            {/* El nombre largo se corta con «…» en pantalla (CSS) y se lee entero en el title. */}
            {empresas.map((e) => item(`/empresa/${e.id}`, e.nombre))}
          </div>
        )}
        <div className="grupo-lateral" data-grupo="secundario">
          <p className="titulo-menu">Sistema</p>
          {item("/casos", "Aprendizaje del sistema", "aprendizaje")}
          {item("/torre", "Torre de control", "torre")}
          {item("/salud", "Salud del sistema", "salud")}
        </div>
      </nav>
    </Lateral>
  );
}

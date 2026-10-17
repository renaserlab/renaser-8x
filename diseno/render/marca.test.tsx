/**
 * ARNÉS DE DISEÑO · LA MARCA Y EL MARCO (sistema «noche y perla», 17-10-2026). Pinta lo que es del constructor A con
 * los componentes reales: el ingreso (/entrar como portada), la barra lateral de la consultora y la del dueño en sus
 * tres estados (abierta, riel y cajón del celular), la ruta, la cabecera de la empresa, el control segmentado, las
 * subpestañas, el menú «Administrar» abierto y una hoja con las piezas base (botones, campos, tabla, chips, avisos).
 * También genera los íconos de app (src/app/icon.tsx y apple-icon.tsx) como PNG para mirarlos.
 * Empresas FICTICIAS. No toca producción ni ninguna base. Deja todo en diseno/render/salida/ (ignorada por git); la hoja
 * de estilos es salida/app-nuevo.css (la compila css.cjs desde src/app/globals.css).
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/marca.test.tsx
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import type { AvanceRuta, EtapaEvaluada } from "@/lib/ruta";

const estado = vi.hoisted(() => ({ ruta: "/empresa/e1" }));

vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("next/navigation", () => ({
  usePathname: () => estado.ruta,
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode; prefetch?: unknown }) => {
    const atributos: Record<string, unknown> = { ...resto };
    delete atributos.prefetch;
    return (
      <a href={href} {...atributos}>
        {children}
      </a>
    );
  },
}));

const SALIDA = path.resolve(__dirname, "salida");

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<style>:root{--font-bodoni:"Bodoni Moda";--font-manrope:"Manrope";--font-source-serif:"Source Serif 4";}</style>
</head><body>${cuerpo}</body></html>`;
}

/** Los tres estados de la barra lateral: abierta (como entra), riel (escritorio, oculta) y cajón (celular, abierto). */
function variantes(nombre: string, titulo: string, html: string) {
  writeFileSync(path.join(SALIDA, `${nombre}.html`), pagina(titulo, html));
  writeFileSync(path.join(SALIDA, `${nombre}--riel.html`), pagina(titulo, html.replace('data-estado="abierta"', 'data-estado="riel"').replace('aria-pressed="false"', 'aria-pressed="true"')));
  writeFileSync(
    path.join(SALIDA, `${nombre}--cajon.html`),
    pagina(titulo, html.replace('data-movil="cerrada"', 'data-movil="abierta"').replace("</aside>", '</aside><button type="button" class="telon no-imprimir" aria-label="Cerrar el menú"></button>'))
  );
}

// ─────────────────────────── La ruta de una empresa ficticia ───────────────────────────
const etapa = (e: Partial<EtapaEvaluada> & Pick<EtapaEvaluada, "clave" | "nombre" | "nombreDueno" | "desdeDia" | "hastaDia">): EtapaEvaluada => ({
  criterios: [],
  hechos: 0,
  medibles: 0,
  sinMedir: 0,
  pct: null,
  compuerta: { clave: "c30", nombre: "Estructura en marcha", veredicto: null, sugerido: "rojo" },
  estado: "por_venir",
  ...e,
});
const AVANCE: AvanceRuta = {
  tipo: "estructurar",
  inicio: "2026-10-01",
  dia: 10,
  etapas: [
    etapa({ clave: "diagnostico", nombre: "Diagnóstico y plan", nombreDueno: "Conocer tu empresa", desdeDia: 1, hastaDia: 30, pct: 18, estado: "en_curso", compuerta: { clave: "c5", nombre: "La Firma", veredicto: null, sugerido: "ambar" } }),
    etapa({ clave: "estructurar", nombre: "Implementar la estructura", nombreDueno: "Ordenar", desdeDia: 31, hastaDia: 60 }),
    etapa({ clave: "sistematizar", nombre: "Sistematizar", nombreDueno: "Sistematizar", desdeDia: 61, hastaDia: 105 }),
    etapa({ clave: "monitoreo", nombre: "Monitoreo", nombreDueno: "Acompañarte", desdeDia: 106, hastaDia: 165 }),
  ],
  actual: "diagnostico",
  aviso: null,
  faltaParaLaCompuerta: [],
};

// ─────────────────────────── Una hoja con las piezas base ───────────────────────────
function Muestra() {
  return (
    <div>
      <h2 className="t-titulo">Datos de la empresa</h2>
      <p className="t-cuerpo medida" style={{ color: "var(--grafito)", marginTop: 8 }}>
        Lo que la consultora escribe aquí lo ve el dueño en su portal. Nada se inventa: lo que falta se dice que falta.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
        <button className="boton">Guardar</button>
        <button className="boton boton--secundario">Cancelar</button>
        <button className="boton boton--secundario" aria-pressed="true">No lo sé</button>
        <button className="boton boton--terciario">Ver la ruta</button>
        <button className="boton boton--peligro">Quitar</button>
        <button className="boton" disabled>
          Entrando
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, marginTop: 32 }}>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">Nombre de la empresa</span>
          <input className="campo" defaultValue="Jeans del Valle" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">Sector</span>
          <select className="campo" defaultValue="textil">
            <option value="textil">Confección textil</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">Meta de venta mensual</span>
          <input className="campo" aria-invalid="true" placeholder="Lo que esperan vender en un mes" />
          <span className="error-campo">Escribe la meta en soles, solo el número.</span>
        </label>
      </div>
      <p className="aviso" style={{ marginTop: 24 }}>
        Las cifras del mes se ven en Números; aquí solo se corrige el nombre y el sector.
      </p>
      <table className="tabla" style={{ marginTop: 28 }}>
        <thead>
          <tr>
            <th>Proceso</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Pasos</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Comercial</td>
            <td>
              <span className="estado ok">revisada</span>
            </td>
            <td style={{ textAlign: "right" }}>12</td>
          </tr>
          <tr>
            <td>Operativa</td>
            <td>
              <span className="estado neutro">sin verificar</span>
            </td>
            <td style={{ textAlign: "right" }}>—</td>
          </tr>
          <tr>
            <td>Cobranza</td>
            <td>
              <span className="estado espera">por confirmar</span> <span className="estado alto">contradicho</span>
            </td>
            <td style={{ textAlign: "right" }}>7</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

it("pinta la portada, el marco de la consultora y el del dueño, y los íconos", async () => {
  mkdirSync(SALIDA, { recursive: true });

  // ── El ingreso ──
  const { default: Entrar } = await import("@/app/entrar/page");
  writeFileSync(path.join(SALIDA, "marca-entrar.html"), pagina("Entrar · 8X", renderToStaticMarkup(<Entrar />)));
  const { default: Registro } = await import("@/app/registro/page");
  writeFileSync(path.join(SALIDA, "marca-registro.html"), pagina("Crear cuenta · 8X", renderToStaticMarkup(<Registro />)));

  // ── La consultora, dentro de una empresa ──
  estado.ruta = "/empresa/e1";
  const { NavConsultor } = await import("@/components/consultor/NavConsultor");
  const { BarraRuta } = await import("@/components/navegacion/BarraRuta");
  const { TabsEmpresa } = await import("@/components/consultor/TabsEmpresa");
  const { EnEstaVista } = await import("@/components/consultor/EnEstaVista");
  const { MenuAdministrar } = await import("@/components/consultor/MenuAdministrar");
  const { Icono } = await import("@/components/base/Icono");
  const { VISTAS, EXPEDIENTE } = await import("@/lib/vistas-empresa");
  const consultora = renderToStaticMarkup(
    <div className="marco-app">
      <NavConsultor
        empresas={[
          { id: "e1", nombre: "Jeans del Valle (ficticia)" },
          { id: "e2", nombre: "Estudio Contable Vargas & Asociados (ficticia)" },
          { id: "e3", nombre: "Panadería Flor de Mayo (ficticia)" },
        ]}
        usuario="Consultora de Ejemplo"
        torre={
          <Link className="boton-redondo solo-celular lg:hidden" href="/torre" aria-label="Torre de control" title="Torre de control">
            <Icono nombre="torre" />
          </Link>
        }
      />
      <div className="columna-app">
        <main className="contenido-app">
          <div className="hoja">
            <div className="empresa-marco">
              <BarraRuta avance={AVANCE} para="consultora" enlace="/empresa/e1/avance#ruta" compacta />
              <header className="empresa-cabeza">
                <div className="empresa-cabeza__titulo">
                  <Link href="/empresa/e1" className="empresa-cabeza__nombre">
                    Jeans del Valle (ficticia)
                  </Link>
                  <p className="empresa-cabeza__linea">
                    <span>Confección textil · Arequipa</span>
                  </p>
                </div>
                <div className="empresa-cabeza__acciones no-imprimir">
                  <a href="/api/consultor/ver-portal?empresa=e1" className="boton boton--secundario">
                    Ver como el empresario
                  </a>
                  <MenuAdministrar>
                    <div className="menu-administrar__fila">
                      <span>
                        Datos de la empresa<small>Nombre, sector y meta de venta; o eliminarla</small>
                      </span>
                      <button className="boton boton--secundario">Editar</button>
                    </div>
                    <div className="menu-administrar__fila">
                      <span>
                        País, moneda y hora<small>Cómo se escriben sus cifras y sus fechas</small>
                      </span>
                      <button className="boton boton--secundario">Cambiar</button>
                    </div>
                  </MenuAdministrar>
                </div>
              </header>
              <div className="empresa-navegacion no-imprimir">
                <TabsEmpresa base="/empresa/e1" vistas={VISTAS} expediente={EXPEDIENTE} />
                <EnEstaVista base="/empresa/e1" />
              </div>
              <div className="empresa-pantalla">
                <div className="empresa-contenido">
                  <Muestra />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
  variantes("marca-consultora", "Jeans del Valle · 8X", consultora);
  writeFileSync(path.join(SALIDA, "marca-consultora--menu.html"), pagina("Administrar · 8X", consultora.replace('class="menu-administrar no-imprimir"', 'class="menu-administrar no-imprimir" open=""')));

  // ── El dueño, en «Tu diagnóstico» ──
  estado.ruta = "/portal/hoy";
  const { NavCliente } = await import("@/components/cliente/NavCliente");
  const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
  const { Tramos } = await import("@/components/navegacion/BarraRuta");
  const enlaces: [string, string][] = [
    ["/portal", "Inicio"],
    ["/portal/diagnostico", "Tu diagnóstico"],
    ["/portal/numeros", "Tus números"],
    ["/portal/procesos", "Tus procesos"],
    ["/portal/plan", "Tu plan"],
  ];
  const dueno = (vistaConsultora: boolean) =>
    renderToStaticMarkup(
      <div className="marco-app">
        <NavCliente enlaces={enlaces} empresa="Jeans del Valle (ficticia)" avisos={{ "/portal": 2 }} />
        <div className="columna-app">
          {vistaConsultora && (
            <div className="aviso-vista no-imprimir">
              <span>Estás viendo el portal como lo ve el empresario</span>
              <a href="/api/consultor/ver-portal?salir=1">Volver a mi bandeja</a>
            </div>
          )}
          <section className="barra-ruta barra-ruta--dueno no-imprimir" aria-label="Tu avance">
            <div className="barra-ruta__cabeza">
              <p className="barra-ruta__titulo">
                Vamos en <b>Conocer tu empresa</b> · 18 %
              </p>
              <p className="barra-ruta__dia">Día 10 de tu ruta</p>
            </div>
            <Tramos
              tramos={AVANCE.etapas.map((e) => ({ clave: e.clave, nombre: e.nombreDueno, estado: e.estado, pct: e.pct, dias: e.hastaDia - e.desdeDia + 1 }))}
            />
          </section>
          <main className="contenido-app">
            <EnEstaSeccion variasEmpresas />
            <div className="hoja">
              <Muestra />
            </div>
          </main>
        </div>
      </div>
    );
  variantes("marca-dueno", "Tu diagnóstico · 8X", dueno(false));
  writeFileSync(path.join(SALIDA, "marca-dueno--vista.html"), pagina("Tu diagnóstico · 8X", dueno(true)));

  // ── Los íconos de app ──
  const { default: Icono512 } = await import("@/app/icon");
  const { default: Icono180 } = await import("@/app/apple-icon");
  writeFileSync(path.join(SALIDA, "marca-icono-512.png"), Buffer.from(await Icono512().arrayBuffer()));
  writeFileSync(path.join(SALIDA, "marca-icono-180.png"), Buffer.from(await Icono180().arrayBuffer()));
}, 120_000);

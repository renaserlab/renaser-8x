/**
 * ARNÉS DE DISEÑO · LA COLA DE DECISIONES (13-11-2026). Pinta /decisiones con los componentes reales:
 * la que toca ahora delante, las que siguen en una línea cada una, y las que todavía no son decisiones.
 *
 * EMPRESAS Y DECISIONES FICTICIAS, a propósito: este archivo se publica y el repositorio es público.
 * La forma es la del material real —evidencia citada, tres caminos, recomendación con su porqué y un
 * dato por confirmar—, que es lo único que hace falta para mirar el diseño.
 *
 * Cómo correrlo: npx vitest run --config diseno/render/vitest.config.mts diseno/render/decisiones.test.tsx
 */
import { it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type Fila } from "../../tests/fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode; prefetch?: unknown }) => {
    const atributos: Record<string, unknown> = { ...resto };
    delete atributos.prefetch;
    return <a href={href} {...atributos}>{children}</a>;
  },
}));

const SALIDA = path.resolve(__dirname, "salida");
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";

const alt = (clave: string, titulo: string) => ({ clave, titulo, que_implica: titulo });
const doc = [{ tipo: "documento", id: null, texto: "dossier de consultoría (sección 5)" }];

function decision(p: Partial<Fila> & { id: string; company_id: string; titulo: string }): Fila {
  return {
    por_que_ahora: "",
    evidencia: doc,
    faltantes: [],
    supuestos: [],
    alternativas: [],
    recomendacion: null,
    recomendacion_por_que: null,
    impacto_esperado: null,
    riesgos: [],
    confianza: null,
    confianza_por_que: null,
    que_pasa_si_se_aprueba: null,
    origen: "agente",
    agente: "consultoria-ejemplo",
    agente_version: null,
    job_id: null,
    estado: "pendiente",
    requiere_aprobacion: true,
    created_at: "2026-10-16T15:08:04Z",
    updated_at: "2026-10-16T15:08:04Z",
    ...p,
  } as Fila;
}

const DECISIONES: Fila[] = [
  decision({
    id: "d1", company_id: E1,
    titulo: "¿Dónde buscamos la venta que falta?",
    por_que_ahora:
      "El dinero no regresa. Gastó S/40,000 y vendió S/20,000 dos meses seguidos, y tiene S/66,000 por cobrar — 3,3 meses de venta.",
    alternativas: [
      alt("A", "Reactivar a los mayoristas que ya compraron, con venta con adelanto"),
      alt("B", "Empujar la venta por unidad en la tienda con una meta semanal sencilla"),
      alt("C", "Canal digital constante para mayoristas nuevos"),
    ],
    recomendacion: "A de los días 22 a 45. B solo cuando se sepan los días, las horas y la paga de la vendedora. C después del día 45.",
    recomendacion_por_que:
      "A es lo más barato y rápido: vende por mayor y le venían clientes de Lima y provincias. B mejora el margen por unidad, aunque ese margen es el máximo posible y no lo esperado. C sin reglas repite el problema del fiado.",
    faltantes: ["Cuántos contactos de clientes antiguos tiene; en qué año vendía el triple y qué cambió; qué parte de la venta es por unidad."],
    created_at: "2026-10-16T15:08:04Z",
  }),
  decision({
    id: "d2", company_id: E1,
    titulo: "¿Qué hacemos con el fiado que ya existe?",
    por_que_ahora: "Tiene S/66,000 por cobrar, 3,3 meses de venta parada en la calle.",
    alternativas: [alt("A", "Cobrar lo vencido antes de fiar de nuevo"), alt("B", "Fiar solo con adelanto")],
    recomendacion: "A, y B desde el día 1 para lo nuevo.",
    recomendacion_por_que: "Cobrar lo vencido no cuesta nada y es la plata que ya es suya.",
    faltantes: ["Qué parte de los S/66,000 está vencida y de quién."],
    created_at: "2026-10-16T15:08:05Z",
  }),
  decision({
    id: "d3", company_id: E2,
    titulo: "El precio: ¿quién lo fija y cuál es el piso?",
    por_que_ahora: "Todo el dinero de la casa se decide y se controla en una sola persona.",
    alternativas: [alt("A", "Todo con la dueña, en una hoja firmada"), alt("B", "Escalera con piso, por tramos"), alt("C", "Libre hasta un tope")],
    recomendacion: "B",
    recomendacion_por_que: "Los números son de ella; quién autoriza cada tramo es el diseño que hay que validar.",
    faltantes: ["Sobre qué costo se cuenta el piso y qué es «crisis» para ella."],
    created_at: "2026-10-16T15:08:06Z",
  }),
  decision({
    id: "d4", company_id: E2,
    titulo: "Línea de mando: confirmar la estructura por puestos, no por personas",
    por_que_ahora: "Sale del levantamiento del organigrama.",
    evidencia: [],
    alternativas: [],
    recomendacion: null,
    faltantes: ["Quién reporta a quién hoy", "Si el puesto existe o se inventó para la persona"],
    created_at: "2026-10-16T15:08:07Z",
  }),
];

function pagina(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..700&family=Manrope:wght@400..800&family=Source+Serif+4:wght@400;600&display=swap">
<link rel="stylesheet" href="app-nuevo.css">
<!-- Sin esto la Didone NO sale: --font-display apunta a --font-bodoni, que en la app la pone next/font
     desde el layout, y aqui no hay layout. Olvidarlo hace que el arnes pinte todo en Manrope y parezca
     que el diseno esta mal cuando lo que falta es la variable. -->
<style>:root{--font-bodoni:"Bodoni Moda";--font-manrope:"Manrope";--font-source-serif:"Source Serif 4";}</style>
</head>
<body><div class="marco-app"><main class="contenido-app"><div class="hoja">${cuerpo}</div></main></div></body></html>`;
}

it("pinta la cola de decisiones", async () => {
  estado.base = crearBaseFalsa({
    companies: [
      { id: E1, nombre: "Confecciones del Valle (ficticia)" },
      { id: E2, nombre: "Casa de Cambio Ejemplo (ficticia)" },
    ],
    decisiones: DECISIONES,
    decision_historial: [],
  });
  const { default: Decisiones } = await import("@/app/(consultor)/decisiones/page");
  const html = renderToStaticMarkup(await Decisiones());
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(path.join(SALIDA, "decisiones.html"), pagina("Decisiones", html));
});

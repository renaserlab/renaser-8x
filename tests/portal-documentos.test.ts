/**
 * LA DUEÑA BUSCA SU DOCUMENTACIÓN VIGENTE Y LA ENCUENTRA (queja de Kelin, 18-10-2026).
 *
 * Textual: «los manuales deben de regir... debería de aparecer como documentación vigente, no lo veo en el
 * sistema». La pantalla /portal/documentos leía `sources` con origen de cliente —los archivos que ella
 * misma subió— y nunca tocaba `expediente_documental`. Entraba a buscar sus manuales aprobados y encontraba
 * sus propios archivos subidos.
 *
 * Lo que se fija aquí:
 *  - lo vigente va primero y se pinta con su nombre, desde cuándo rige y su versión;
 *  - el cliente SOLO ve lo vigente: recibido, borrador, en revisión, aprobado-sin-vigencia, sustituido y
 *    archivado no aparecen. En especial «aprobado»: aprobación no es vigencia;
 *  - el expediente de otra empresa no aparece, y a la base solo se le piden las columnas que ella lee
 *    (ni la clave de la vara, ni el entregable del contrato, ni la nota de la consultora);
 *  - sin nada vigente, el vacío explica por qué está vacío, dice que su material no se perdió y dice quién
 *    declara la vigencia. No es una pantalla en blanco ni un «no hay datos»;
 *  - si la consulta falla, se dice que no se pudo leer, y NO se pinta el vacío: «falló» y «no hay» son dos
 *    cosas distintas, y confundirlas es lo que hace creer a una dueña que le perdimos su manual;
 *  - lo que ella nos entregó sigue en la pantalla, debajo, con su encabezado de material recibido.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts y el contexto del portal lo pone la prueba. La página se renderiza de verdad
 * a HTML en Node. `Subir` y `ControlDocumental` son componentes de navegador con sus propias pruebas: aquí
 * se reemplazan por una marca, porque lo que se mide es qué datos llegan a la pantalla y en qué orden.
 * Los checks de la base (vigente sin fecha, dos vigentes por entregable) no se prueban aquí: son de
 * Postgres y van en tests/sql. Nadie abrió esto en un navegador.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type ErrorFalso, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
vi.mock("@/lib/ai", () => ({ hayTranscriptor: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {}, usePathname: () => "/portal/documentos" }));
// Subir y ControlDocumental tienen su propio comportamiento de navegador: aquí solo importa que sigan en la
// pantalla y dónde. Se reemplazan por una marca para que la prueba hable de datos, no de sus botones.
vi.mock("@/components/Subir", async () => {
  const { createElement: ce } = await import("react");
  return { Subir: () => ce("div", { "data-subir": "si" }) };
});
vi.mock("@/components/cliente/ControlDocumental", async () => {
  const { createElement: ce } = await import("react");
  return { ControlDocumental: (p: { grupos: unknown[] }) => ce("div", { "data-control-documental": String(p.grupos.length) }) };
});

import { ESTADOS, loVeElCliente, type Estado } from "@/lib/expediente";

const EMP = "0000000a-0000-4000-8000-00000000000a"; // la primera empresa cliente (ficticia, la de la queja)
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Dueña" };

/** El texto que se lee, sin etiquetas ni espacios de más. */
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * Una fila del expediente. Lleva a propósito lo que el cliente NUNCA debe ver (la clave de la vara, el
 * entregable del contrato, la nota de la consultora y el texto del documento): si se colara al HTML, la
 * prueba lo vería.
 */
const doc = (nombre: string, estadoDoc: string, extra: Fila = {}): Fila => ({
  id: `doc-${nombre.toLowerCase().replace(/\s+/g, "-")}-${estadoDoc}`,
  company_id: EMP,
  nombre,
  estado: estadoDoc,
  version: "2",
  vigente_desde: estadoDoc === "vigente" ? "2026-10-01" : null,
  clave_vara: "mof",
  entregable: "manual_procesos",
  origen: "cliente",
  nota_consultora: "INTERNO: le falta el cierre de caja",
  contenido: "INTERNO: el texto completo del documento",
  aprobado_at: "2026-09-28T15:00:00.000Z",
  created_at: "2026-09-20T15:00:00.000Z",
  updated_at: "2026-10-01T15:00:00.000Z",
  ...extra,
});

const fuente = (nombre: string, extra: Fila = {}): Fila => ({
  id: `src-${nombre.toLowerCase().replace(/\s+/g, "-")}`,
  company_id: EMP,
  nombre,
  tipo: "documento",
  estado: "leido",
  origen: "cliente",
  fecha_origen: null,
  created_at: "2026-08-14T15:00:00.000Z",
  ...extra,
});

function base(extra: Record<string, Fila[]> = {}, fallos: Record<string, ErrorFalso> = {}): BaseFalsa {
  const b = crearBaseFalsa({ expediente_documental: [], sources: [], deliverables: [], ...extra }, fallos);
  estado.base = b;
  estado.portal = { companyId: EMP, queFalta: "", u: DUENA };
  return b;
}

/** Las veces que la página le pidió algo a una tabla, con qué columnas y con qué filtros. */
const lecturasDe = (b: BaseFalsa, tabla: string) => b.pedidos.filter((p) => p.tabla === tabla && p.op === "select");

async function pantalla(): Promise<string> {
  const { default: Documentos } = await import("@/app/(cliente)/portal/documentos/page");
  return renderToStaticMarkup(await Documentos());
}

beforeAll(async () => {
  await import("@/app/(cliente)/portal/documentos/page");
}, 180_000);

// ─────────────────────────── La regla: el cliente solo ve lo vigente ───────────────────────────

describe("Tu documentación vigente · lo que la dueña entró a buscar", () => {
  it("pinta el documento vigente con su nombre, desde cuándo rige y su versión", async () => {
    base({ expediente_documental: [doc("Manual de Organización y Funciones", "vigente")] });
    const t = texto(await pantalla());
    expect(t).toContain("Tu documentación vigente");
    expect(t).toContain("Manual de Organización y Funciones");
    // «Rige desde» es vigencia, no aprobación: la fecha que se imprime es vigente_desde.
    expect(t).toContain("Rige desde el 1 oct 2026");
    expect(t).toContain("Versión 2");
    expect(t).toContain(ESTADOS.vigente.nombre);
  });

  it("no le muestra al cliente ningún estado que no sea vigente —aprobado incluido: aprobación no es vigencia", async () => {
    const noVigentes = (Object.keys(ESTADOS) as Estado[]).filter((e) => !loVeElCliente(e));
    // «insumo» entró el 20-10-2026 y también se le oculta al cliente, a propósito: esta pantalla es
    // la de lo que RIGE, y un insumo no rige nada. Verlo aquí le haría creer que la transcripción de
    // su propia entrevista es un documento oficial de su empresa.
    expect(noVigentes).toEqual(["recibido", "borrador", "en_revision", "aprobado", "sustituido", "archivado", "insumo"]);
    base({ expediente_documental: noVigentes.map((e) => doc(`Documento en ${e}`, e)) });
    const t = texto(await pantalla());
    for (const e of noVigentes) expect(t).not.toContain(`Documento en ${e}`);
    // Sin nada vigente, la pantalla cae en el vacío explicado, no en una lista a medias.
    expect(t).toContain("Todavía no hay ningún documento declarado vigente");
  });

  it("le pide a la base solo lo vigente y solo las columnas que la dueña lee", async () => {
    const b = base({ expediente_documental: [doc("Reglamento Interno de Trabajo", "vigente")] });
    await pantalla();
    const [lectura, ...demas] = lecturasDe(b, "expediente_documental");
    expect(demas).toEqual([]);
    expect(lectura).toBeDefined();
    // El filtro de estado sale de loVeElCliente (src/lib/expediente.ts), no de una lista escrita a mano.
    expect(lectura!.filtros).toEqual([
      ["eq", "company_id", EMP],
      ["in", "estado", (Object.keys(ESTADOS) as Estado[]).filter(loVeElCliente)],
    ]);
    const columnas = (lectura!.columnas ?? "").split(",").map((s) => s.trim()).sort();
    expect(columnas).toEqual(["estado", "id", "nombre", "version", "vigente_desde"]);
    // La metodología interna no se pinta y tampoco se pide.
    for (const interna of ["clave_vara", "entregable", "nota_consultora", "contenido"]) {
      expect(lectura!.columnas ?? "").not.toContain(interna);
    }
  });

  it("no muestra la metodología interna ni el texto del documento, aunque estén guardados en la fila", async () => {
    base({ expediente_documental: [doc("Manual de Atención al Cliente", "vigente")] });
    const t = texto(await pantalla());
    expect(t).not.toContain("INTERNO");
    expect(t).not.toContain("manual_procesos");
    expect(t).not.toMatch(/\bvara\b/i);
  });

  it("no muestra el expediente de otra empresa", async () => {
    base({
      expediente_documental: [
        doc("Manual de Procesos", "vigente"),
        doc("Manual de otra empresa", "vigente", { id: "doc-otra", company_id: OTRA }),
      ],
    });
    const t = texto(await pantalla());
    expect(t).toContain("Manual de Procesos");
    expect(t).not.toContain("Manual de otra empresa");
  });

  it("si al documento le falta desde cuándo rige o su versión, lo dice en vez de inventarlo", async () => {
    base({ expediente_documental: [doc("Organigrama institucional", "vigente", { vigente_desde: null, version: null })] });
    const t = texto(await pantalla());
    expect(t).toContain("No está registrado desde cuándo rige");
    expect(t).toContain("Sin número de versión");
    expect(t).not.toContain("sin fecha");
  });
});

// ─────────────────────────── El vacío y el fallo son dos cosas distintas ───────────────────────────

describe("Cuando no hay nada vigente", () => {
  it("explica por qué está vacío, que su material no se perdió y quién declara la vigencia", async () => {
    base({ sources: [fuente("Contrato firmado.pdf")] });
    const t = texto(await pantalla());
    expect(t).toContain("Todavía no hay ningún documento declarado vigente");
    expect(t).toContain("No se perdió nada tuyo");
    expect(t).toContain("tu consultora lo declara vigente");
    expect(t).toContain("Ver lo que nos entregaste");
    // Un vacío de sistema («no hay datos») es justo lo que hace pensar que algo se perdió.
    expect(t).not.toMatch(/no hay datos|sin datos|vac[ií]o/i);
    // Y lo que ella entregó sigue estando, debajo.
    expect(t).toContain("Contrato firmado.pdf");
  });
});

describe("Cuando la base no responde", () => {
  it("dice que no se pudo leer su documentación vigente, y no la pinta como si no hubiera ninguna", async () => {
    base({ sources: [fuente("MOF la primera empresa cliente.docx")] }, { expediente_documental: { code: "42P01", message: "relation does not exist" } });
    const html = await pantalla();
    const t = texto(html);
    expect(t).toContain("No pudimos leer tu documentación vigente");
    expect(t).toContain("no significa que no haya ninguna");
    expect(t).not.toContain("Todavía no hay ningún documento declarado vigente");
    expect(html).toContain('role="alert"');
    // El resto de la pantalla sigue en pie: su material no desaparece porque falle una consulta.
    expect(t).toContain("MOF la primera empresa cliente.docx");
  });

  it("dice que no se pudo leer lo que ella entregó, en vez de mostrar la lista vacía", async () => {
    base({ expediente_documental: [doc("Manual de Procesos", "vigente")] }, { sources: { code: "42P01", message: "relation does not exist" } });
    const t = texto(await pantalla());
    expect(t).toContain("No pudimos leer la lista de lo que nos entregaste");
    expect(t).toContain("Tu material sigue guardado");
    expect(t).not.toContain("Todavía no subiste nada");
    // Lo vigente se lee igual: una consulta caída no se lleva la otra.
    expect(t).toContain("Manual de Procesos");
  });
});

// ─────────────────────────── El orden de la pantalla ───────────────────────────

describe("El orden: primero lo que rige, después el material recibido", () => {
  it("pone lo vigente arriba y lo que ella entregó debajo, con su encabezado de material recibido", async () => {
    const b = base({ expediente_documental: [doc("Manual de Procesos", "vigente")], sources: [fuente("Foto del cuaderno.jpg")] });
    const html = await pantalla();
    const t = texto(html);
    expect(t.indexOf("Tu documentación vigente")).toBeGreaterThan(-1);
    expect(t.indexOf("Tu documentación vigente")).toBeLessThan(t.indexOf("Lo que nos entregaste"));
    expect(t).toContain("El material que recibimos de ti");
    expect(t).toContain("no se borra nunca");
    // Sigue existiendo lo que ya había: la caja de subir y el control de versiones de lo que preparamos.
    expect(html).toContain('data-subir="si"');
    expect(html).toContain("data-control-documental");
    expect(t).toContain("Lo que preparamos contigo");
    // A `sources` se le sigue pidiendo solo el material del cliente, de SU empresa.
    const lectura = lecturasDe(b, "sources")[0];
    expect(lectura!.filtros).toEqual([
      ["eq", "company_id", EMP],
      ["eq", "origen", "cliente"],
    ]);
  });

  it("sin empresa elegida no consulta nada y dice qué falta", async () => {
    const b = base();
    estado.portal = { companyId: null, queFalta: "Cuéntanos de tu empresa para empezar.", u: DUENA };
    const t = texto(await pantalla());
    expect(t).toBe("Cuéntanos de tu empresa para empezar.");
    expect(b.pedidos).toEqual([]);
  });
});

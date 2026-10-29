/**
 * LAS CINCO PRUEBAS DE ACEPTACIÓN DEL PRIMER CLIENTE REAL.
 *
 * Kelin las fijó el 18-10-2026 y dijo el marcador: **0 de 5**. Este archivo las convierte en
 * pruebas del código, para que el avance se vea y no se opine. Cuando las cinco pasen, 8X cumple
 * una parte esencial de un contrato real en vez de ser otro tablero terminado.
 *
 *   1. RECUPERAR LO EXISTENTE — la dueña no vuelve a dar datos que ya constan en su expediente.
 *   2. RECONOCER DOCUMENTACIÓN — el Manual de Identidad y su Plan aparecen vinculados, y su
 *      vigencia se COMPRUEBA, no se supone.
 *   3. COMPLETAR UN ENTREGABLE — 8X prepara un Manual de Selección adaptado con información
 *      existente y formatos maestros.
 *   4. PREPARAR AL ADMINISTRADOR — 8X reúne su ficha, documentos, responsabilidades y plan
 *      inicial sin reconstruirlos.
 *   5. DEMOSTRAR IMPLEMENTACIÓN — una actividad derivada de un manual queda asignada, ejecutada
 *      y respaldada con evidencia.
 *
 * CÓMO LEER ESTE ARCHIVO. Lo que ya funciona se comprueba con una aserción. Lo que falta queda
 * como `it.todo`, que vitest cuenta aparte y NO deja pasar como hecho. Un `todo` que alguien
 * convierte en `it()` vacío para que el marcador suba es exactamente la trampa que esto evita:
 * cada prueba, cuando se escriba, tiene que comprobar un dato real.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import {
  ESTADOS,
  TRANSICIONES,
  CONTRATO_SEMILLA,
  puedePasar,
  loVeElCliente,
  queLeFaltaParaVigencia,
  rigeSobreLoNuevo,
} from "@/lib/expediente";

const RAIZ = path.resolve(__dirname, "..");
/**
 * LA CARPETA DEL PRIMER CLIENTE. Está en .gitignore porque este repositorio es público, así que su
 * nombre no se escribe aquí: se encuentra por su contenido —la carpeta de `clientes/` que tiene la
 * revisión del manual vigente—, que es lo que estas pruebas necesitan de ella. Si no está, CLI
 * apunta a una ruta que no existe y las aserciones lo dicen en vez de pasar en silencio.
 */
const CLI = (() => {
  const base = path.join(RAIZ, "clientes");
  if (!existsSync(base)) return path.join(base, "sin-carpeta-de-cliente");
  const suya = readdirSync(base).find((d) => existsSync(path.join(base, d, "revision-mof-vigente.md")));
  return suya ? path.join(base, suya) : path.join(base, "sin-carpeta-de-cliente");
})();

// ───────────────────────────────────────────────────────────────────────────
// LO QUE SOSTIENE LAS CINCO: el expediente y su máquina de estados
// ───────────────────────────────────────────────────────────────────────────

describe("el expediente distingue aprobación de vigencia", () => {
  it("aprobar es una decisión; estar vigente es un estado institucional", () => {
    // Aprobado NO significa que rija. Esa es la distinción que Kelin fijó el 18-10.
    expect(rigeSobreLoNuevo("aprobado")).toBe(false);
    expect(rigeSobreLoNuevo("vigente")).toBe(true);
  });

  it("no se puede saltar de recibido a vigente: lo que nadie firmó no manda", () => {
    expect(puedePasar("recibido", "vigente")).toBe(false);
    expect(puedePasar("aprobado", "vigente")).toBe(true);
  });

  it("declarar vigente exige quién aprobó, cuándo, desde cuándo rige, y haber pasado por la vara", () => {
    const falta = queLeFaltaParaVigencia({ estado: "aprobado" });
    expect(falta.length).toBe(4);
    expect(falta.join(" ")).toMatch(/quién lo aprobó/);
    expect(falta.join(" ")).toMatch(/desde cuándo rige/);
    expect(falta.join(" ")).toMatch(/vara/);
  });

  it("con las cuatro cosas, pasa", () => {
    expect(
      queLeFaltaParaVigencia({
        estado: "aprobado",
        aprobado_por: "una persona con autoridad",
        aprobado_at: "2026-10-18T10:00:00Z",
        vigente_desde: "2026-11-01",
        revisado_contra_vara: true,
      })
    ).toEqual([]);
  });

  it("el cliente solo ve lo vigente: un borrador nuestro no llega a su navegador", () => {
    for (const e of Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]) {
      expect(loVeElCliente(e), `${e} no debería verse salvo vigente`).toBe(e === "vigente");
    }
  });

  it("lo sustituido y lo archivado se conservan: sin historial no se sabe qué cambió", () => {
    expect(TRANSICIONES.vigente).toContain("sustituido");
    // De archivado no se sale: es el final del camino, pero la fila sigue existiendo.
    expect(TRANSICIONES.archivado).toEqual([]);
  });

  it("los entregables del contrato de la primera empresa cliente están declarados con su cláusula y su vara", () => {
    expect(CONTRATO_SEMILLA.length).toBeGreaterThanOrEqual(16);
    for (const e of CONTRATO_SEMILLA) {
      expect(e.clausula, e.clave).toMatch(/^2\.\d$/);
      expect(["mof", "procesos", "atencion", "seleccion", "reglamento", "estrategia"], e.clave).toContain(e.clave_vara);
    }
  });

  it("están los seis documentos que el contrato nombra en su cláusula 2.2", () => {
    const d22 = CONTRATO_SEMILLA.filter((e) => e.clausula === "2.2").map((e) => e.clave);
    for (const c of ["mof", "manual_procesos", "organigrama", "manual_atencion", "manual_seleccion", "reglamento_interno"]) {
      expect(d22, `el contrato compromete ${c}`).toContain(c);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PRUEBA 1 · RECUPERAR LO EXISTENTE
// ───────────────────────────────────────────────────────────────────────────

describe("PRUEBA 1 · la dueña no vuelve a dar datos que ya constan", () => {
  it("el material que ella ya entregó está guardado y es recuperable", () => {
    // Las 23 respuestas grabadas existen. El problema no es que falten: es que la entrada no parte
    // de ellas. Esta aserción deja constancia de que el dato está, para que nadie diga que falta.
    const vol = path.join(RAIZ, "..", "..", "..");
    void vol;
    const dictado = readdirSync(CLI).length;
    expect(dictado, "el expediente de la primera empresa cliente tiene material entregado").toBeGreaterThan(0);
  });

  it.todo("la pantalla de entrada muestra lo ya respondido y pregunta SOLO lo que falta");
  it.todo("si la dueña ya declaró su equipo, el formulario de personas nace lleno y editable");
  it.todo("ninguna pregunta del cuestionario se repite si su respuesta ya está en el expediente");
});

// ───────────────────────────────────────────────────────────────────────────
// PRUEBA 2 · RECONOCER DOCUMENTACIÓN
// ───────────────────────────────────────────────────────────────────────────

describe("PRUEBA 2 · el Manual de Identidad y su Plan aparecen vinculados y su vigencia se comprueba", () => {
  it("los manuales vigentes NO están en el expediente todavía, y eso queda dicho", () => {
    // Esta prueba documenta el hueco en vez de taparlo. El Manual de Identidad y su Plan existen
    // —los leímos enteros— pero viven en una carpeta de trabajo de la sesión, no en el expediente
    // de la empresa. Por eso el sistema no los reconoce, no los cruza con nada y vuelve a
    // preguntar lo que ya dicen. El día que entren, esta prueba cambia de sentido.
    const expediente = readdirSync(CLI);
    const hayManualEnExpediente = expediente.some((f) => /manual-identidad|plan-accion/i.test(f));
    expect(
      hayManualEnExpediente,
      "cuando los manuales vigentes entren al expediente, esta prueba pasa a exigir su estado y su fecha de vigencia"
    ).toBe(false);
  });

  it.todo("el Manual de Identidad figura en el expediente con estado VIGENTE, con quién lo aprobó y desde cuándo rige");
  it.todo("su Plan de 7 días figura vinculado al Manual, no suelto");
  it.todo("un documento nuevo que contradiga al Manual vigente se bloquea y pide resolución");
  it.todo("el MOF, el Reglamento y los siete procedimientos de la primera empresa cliente están en el expediente con su estado real");
});

// ───────────────────────────────────────────────────────────────────────────
// PRUEBA 3 · COMPLETAR UN ENTREGABLE
// ───────────────────────────────────────────────────────────────────────────

describe("PRUEBA 3 · 8X prepara un entregable adaptado, sin partir de cero", () => {
  it.todo("existe la vara de cada tipo de documento, con exigencias que se comprueban sí o no");
  it.todo("subir el manual de funciones de la primera empresa cliente devuelve qué conservar, qué falla contra la vara y qué mejorar");
  it.todo("el Manual de Selección se produce reutilizando APO-REC-01 y los formatos que ya existen");
  it.todo("ningún entregable se genera sin antes comprobar si ya existe una versión anterior");
});

// ───────────────────────────────────────────────────────────────────────────
// PRUEBA 4 · PREPARAR AL ADMINISTRADOR
// ───────────────────────────────────────────────────────────────────────────

describe("PRUEBA 4 · el paquete del administrador se reúne, no se reconstruye", () => {
  it("el puesto de Administrador existe en el organigrama y no es un invento del paquete", () => {
    // Si el puesto no existe como puesto, el paquete estaría describiendo algo que no está en la
    // estructura — que es exactamente el error que se cometió antes de crearlo.
    const revision = path.join(CLI, "revision-mof-vigente.md");
    expect(existsSync(revision), "existe la revisión del MOF vigente, de donde sale la ficha").toBe(true);
    expect(readFileSync(revision, "utf8")).toMatch(/Administrador General/);
  });

  it.todo("el paquete se arma desde el expediente: ficha del MOF vigente, organigrama y procesos de los que responde");
  it.todo("no se reescribe ninguna ficha que ya exista en el MOF vigente");
  it.todo("el paquete dice qué documentos de los que entrega están vigentes y cuáles son borrador");
});

// ───────────────────────────────────────────────────────────────────────────
// PRUEBA 5 · DEMOSTRAR IMPLEMENTACIÓN
// ───────────────────────────────────────────────────────────────────────────

describe("PRUEBA 5 · una actividad derivada de un manual queda asignada, ejecutada y con evidencia", () => {
  it.todo("un manual vigente genera su plan de aplicación con responsables");
  it.todo("cada actividad tiene estado: pendiente, en implementación, en uso, requiere corrección, verificado");
  it.todo("una actividad no puede declararse instalada solo porque se generó un documento");
  it.todo("queda la evidencia de que alguien la está usando, con fecha y responsable");
});

// ───────────────────────────────────────────────────────────────────────────
// EL MARCADOR
// ───────────────────────────────────────────────────────────────────────────

describe("el marcador de las cinco pruebas", () => {
  it("se cuenta solo, leyendo este archivo: ninguna se da por buena a mano", () => {
    const yo = readFileSync(__filename, "utf8");
    const pendientes = (yo.match(/it\.todo\(/g) ?? []).length;
    const pruebas = (yo.match(/describe\("PRUEBA \d/g) ?? []).length;
    expect(pruebas, "las cinco pruebas de Kelin están escritas").toBe(5);
    // Mientras queden `todo`, el marcador NO está en 5 de 5. Esto existe para que nadie lo declare.
    expect(pendientes, `quedan ${pendientes} comprobaciones por escribir antes de poder decir 5 de 5`).toBeGreaterThan(0);
  });
});

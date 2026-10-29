/**
 * LA BIBLIOTECA MAESTRA ES VARA, NO OPINIÓN.
 *
 * Una vara sirve si cada exigencia se puede responder SÍ o NO mirando el documento. En el momento
 * en que una exigencia pide criterio —«debe ser claro», «debe ser completo»— deja de ser vara y
 * vuelve a ser la opinión del consultor de turno, que es justo lo que esto viene a eliminar.
 *
 * Y hay una regla de propiedad que el contrato fija y el código tiene que respetar: la metodología
 * y los formatos base son de RENASER. Por eso la vara vive en el producto y nunca en la carpeta de
 * una empresa: el cliente recibe el documento mejorado, no la vara con la que se midió.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "fs";
import path from "path";
import { VARAS, CLAVES_VARA, vara, obligatorias, paraAsesorLegal } from "@/lib/metodo/varas";
import { CONTRATO_SEMILLA } from "@/lib/expediente";

describe("cada exigencia se comprueba mirando el documento", () => {
  it("hay vara para cada tipo de documento que una empresa entrega", () => {
    // Las seis primeras son los tipos que el contrato nombra. Las diez de abajo se agregaron el
    // 19-10-2026 al medir la biblioteca completa del primer cliente: de 23 mediciones, 15 salieron
    // nulas porque el revisor devolvió «este documento no es del tipo que esta vara mide». No eran
    // documentos malos; eran tipos de documento sin vara, y mientras no la tuvieran el sistema no
    // tenía con qué medirlos ni con qué producirlos.
    //
    // La lista está escrita a mano a propósito, en vez de comprobar solo el conteo: agregar una vara
    // tiene que ser una decisión que alguien toma y firma, no algo que pasa sin que nadie lo note.
    expect(CLAVES_VARA.sort()).toEqual([
      "atencion",
      "capacitacion",
      "contrato",
      "diagnostico",
      "estrategia",
      "formato",
      "identidad",
      "instructivo",
      "mof",
      "organigrama",
      "perfil",
      "procedimiento",
      "procesos",
      "reglamento",
      "seguimiento",
      "seleccion",
    ]);
  });

  it("cada vara tiene entre 8 y 20 exigencias: menos es incompleto, más no se usa", () => {
    for (const k of CLAVES_VARA) {
      const n = vara(k).exigencias.length;
      expect(n, `la vara ${k} tiene ${n}`).toBeGreaterThanOrEqual(8);
      // El techo era 16. Subió a 19 el 18-10-2026 al aplicar las objeciones: varias exigencias
      // metían dos comprobaciones en una línea y hubo que partirlas, porque una exigencia que
      // pide dos cosas no se contesta con un solo sí o no. El techo existe igual: una vara que
      // pase de 20 ya no se usa, se hojea. Subió de 19 a 20 el 18-10-2026 al partir en dos la
      // exigencia del objetivo —responsable y fecha por un lado, su medición por otro—, porque las
      // dos mitades tienen origen distinto: una es de nuestra metodología y la otra la pide el
      // manual vigente del cliente.
      expect(n, `la vara ${k} tiene ${n}`).toBeLessThanOrEqual(20);
    }
  });

  it("ninguna exigencia se queda sin decir CÓMO se comprueba", () => {
    for (const k of CLAVES_VARA) {
      for (const e of vara(k).exigencias) {
        expect(e.como_se_comprueba.length, `${k}: «${e.exigencia}»`).toBeGreaterThan(40);
      }
    }
  });

  it("ninguna exigencia pide criterio en vez de comprobación", () => {
    // Si la comprobación dice «evaluar si es adecuado» o «a criterio», no es comprobación.
    // Esta guarda estuvo desactivada: donde va \b había un carácter de retroceso, así que la
    // expresión no calzaba con nada y la prueba pasaba vacía. Con el límite de palabra de verdad
    // sí corta. Lo que va entre comillas angulares se saca antes de medir: ahí viven las frases
    // que el revisor tiene que BUSCAR en el documento del cliente —«a criterio», «según la
    // gravedad»—, que son el dato que se caza, no el criterio que se pide.
    const vago = /\b(a criterio|si (es|parece) (adecuad|suficient|apropiad)|segun el criterio|valorar si|juzgar si)\b/i;
    const sinCitas = (s: string) => s.replace(/«[^»]*»/g, " ");
    for (const k of CLAVES_VARA) {
      for (const e of vara(k).exigencias) {
        expect(vago.test(sinCitas(e.como_se_comprueba)), `${k}: «${e.exigencia}» se comprueba con criterio, no con un dato`).toBe(false);
      }
    }
  });

  it("cada exigencia dice qué se rompe si no se cumple", () => {
    for (const k of CLAVES_VARA) {
      for (const e of vara(k).exigencias) expect(e.por_que.length, `${k}: ${e.exigencia}`).toBeGreaterThan(30);
    }
  });
});

describe("de dónde sale cada exigencia", () => {
  it("todo origen es uno de los cuatro declarados", () => {
    const ok = ["manual_vigente", "metodo_renaser", "practica_de_excelencia", "obligacion_a_verificar"];
    for (const k of CLAVES_VARA) for (const e of vara(k).exigencias) expect(ok, e.exigencia).toContain(e.origen);
  });

  it("las cuatro fuentes están representadas: no es una vara de una sola cabeza", () => {
    const usados = new Set(CLAVES_VARA.flatMap((k) => vara(k).exigencias.map((e) => e.origen)));
    expect(usados.size, "las cuatro fuentes alimentan la biblioteca").toBe(4);
  });

  it("lo legal se marca para verificar y NUNCA afirma plazos, montos ni artículos", () => {
    // Una obligación legal inventada es peor que no decir nada: el cliente la cumple creyendo que es ley.
    // Mismo defecto que la guarda de arriba: el \b estaba escrito como carácter de retroceso y
    // esta prueba nunca miró nada. Ahora sí.
    const inventa = /\b(art[íi]culo \d|\d+\s*(d[íi]as h[áa]biles|UIT)|plazo de \d|multa de)\b/i;
    for (const k of CLAVES_VARA) {
      for (const e of paraAsesorLegal(k)) {
        expect(inventa.test(e.exigencia + " " + e.como_se_comprueba), `${k}: «${e.exigencia}» afirma una cifra legal`).toBe(false);
        expect(
          /asesor|legal|verificar/i.test(e.exigencia + " " + e.como_se_comprueba + " " + e.por_que),
          `${k}: «${e.exigencia}» debe cerrar en asesoría legal`
        ).toBe(true);
      }
    }
  });

  it("la mayoría de exigencias son obligatorias: una vara casi toda opcional no corta nada", () => {
    const total = CLAVES_VARA.reduce((n, k) => n + vara(k).exigencias.length, 0);
    const obl = CLAVES_VARA.reduce((n, k) => n + obligatorias(k).length, 0);
    expect(obl / total).toBeGreaterThan(0.5);
  });
});

describe("la vara dice qué conservar, no solo qué falla", () => {
  it("cada vara declara qué parte del documento del cliente normalmente sirve", () => {
    // Si la vara solo encuentra defectos, el consultor rehace todo y se pierde el trabajo del cliente.
    for (const k of CLAVES_VARA) expect(vara(k).que_se_conserva_casi_siempre.length, k).toBeGreaterThan(60);
  });

  it("cada vara sabe reconocer el relleno", () => {
    for (const k of CLAVES_VARA) expect(vara(k).senales_de_relleno.length, k).toBeGreaterThan(0);
  });

  it("cada vara dice para quién es el documento y cuánto puede medir", () => {
    // Nace de un defecto repetido: documentos que no declaran su lector y le entregan al cajero
    // las mismas páginas que al administrador. El largo máximo se cuenta, no se aprecia.
    for (const k of CLAVES_VARA) expect(vara(k).para_quien_es.length, k).toBeGreaterThan(40);
  });
});

describe("cada entregable del contrato tiene con qué medirse", () => {
  it("la vara que cada entregable declara existe de verdad", () => {
    for (const e of CONTRATO_SEMILLA) expect(CLAVES_VARA, `${e.clave} apunta a la vara ${e.clave_vara}`).toContain(e.clave_vara);
  });
});

describe("la metodología es de RENASER, no del cliente", () => {
  it("la biblioteca maestra vive en el producto, nunca en la carpeta de una empresa", () => {
    // El contrato: los documentos elaborados son del cliente; la metodología y los formatos base
    // siguen siendo del prestador. Si la vara se filtra a clientes/, se regala el know-how.
    const clientes = path.resolve(__dirname, "../clientes");
    if (!existsSync(clientes)) return;
    const fugas: string[] = [];
    const mirar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) mirar(f);
        else if (/vara|biblioteca-maestra/i.test(e.name)) fugas.push(path.relative(clientes, f));
      }
    };
    mirar(clientes);
    expect(fugas, `la vara no puede estar en la carpeta de un cliente: ${fugas.join(", ")}`).toEqual([]);
  });
});

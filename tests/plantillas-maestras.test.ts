/**
 * UNA PLANTILLA QUE NO CUBRE SU VARA PRODUCE DOCUMENTOS QUE FALLAN SU PROPIA MEDICIÓN.
 *
 * Esto ya pasó y por eso existen estas pruebas: el manual de funciones de la primera empresa cliente (6 fichas, 113 funciones)
 * cumplió 1 de 16 exigencias y falló 13 de sus 14 obligatorias. La medición completa, con
 * evidencia, está en la carpeta del cliente, fuera del repositorio.
 *
 * LO QUE SE CUIDA AQUÍ, en orden de importancia:
 *  1. El invariante: cada exigencia OBLIGATORIA de una vara tiene al menos una sección de su
 *     plantilla que la produce. Si alguien agrega una exigencia obligatoria a `varas.ts` y no la
 *     cubre en `plantillas.ts`, esta prueba falla y dice cuál quedó sin cubrir.
 *  2. Que las secciones apunten a datos que existen de verdad: `de_donde_sale` se cruza contra
 *     BLOQUES_ACTIVOS, porque una fuente inventada es un documento que se va a escribir de cero
 *     sin que nadie se entere.
 *  3. Que ninguna `si_falta` sugiera la respuesta. La regla de la casa: la magia está en saber
 *     preguntar, y nunca se sugiere la cifra en la pregunta.
 *  4. Que la numeración posicional de `cubre` no se haya corrido en silencio: cada plantilla
 *     guarda cuántas exigencias tenía su vara el día que se escribió.
 */
import { describe, it, expect } from "vitest";
import { PLANTILLAS, CLAVES_PLANTILLA, plantilla, cobertura, sinCubrir, queFaltaPreguntar, type FuenteSeccion } from "@/lib/metodo/plantillas";
import { CLAVES_VARA, vara } from "@/lib/metodo/varas";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

/** Las claves de dato que la empresa de verdad entrega, armadas como «bloque.activo». */
const CLAVES_DE_ACTIVO = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/** Todas las secciones de todas las plantillas, con su plantilla al lado para los mensajes de error. */
const TODAS = CLAVES_PLANTILLA.flatMap((k) => PLANTILLAS[k].secciones.map((s) => ({ k, s })));

describe("hay plantilla para cada vara", () => {
  it("las seis varas tienen su plantilla maestra", () => {
    expect(CLAVES_PLANTILLA.sort()).toEqual([...CLAVES_VARA].sort());
  });

  it("cada plantilla usa la misma clave que su vara: sin eso no se puede medir lo que produjo", () => {
    for (const k of CLAVES_PLANTILLA) expect(PLANTILLAS[k].clave, `la plantilla guardada en «${k}»`).toBe(k);
  });

  it("una clave que no existe falla diciéndolo, no devuelve undefined", () => {
    expect(() => plantilla("inventario")).toThrow(/No existe la plantilla «inventario»/);
    expect(() => plantilla("inventario")).toThrow(/mof/);
  });

  it("cada plantilla dice para quién es el documento y a qué largo", () => {
    for (const k of CLAVES_PLANTILLA) {
      expect(PLANTILLAS[k].nombre.length, k).toBeGreaterThan(10);
      expect(PLANTILLAS[k].para_quien.length, k).toBeGreaterThan(60);
    }
  });
});

describe("el invariante: la plantilla cubre su vara", () => {
  it("ninguna exigencia OBLIGATORIA se queda sin sección que la produzca", () => {
    for (const k of CLAVES_PLANTILLA) {
      const faltan = sinCubrir(k);
      const detalle = faltan.map((n) => `${n}. ${vara(k).exigencias[n - 1].exigencia}`).join(" | ");
      expect(faltan, `la plantilla «${k}» no produce: ${detalle}`).toEqual([]);
    }
  });

  it("tampoco se queda sin cubrir ninguna exigencia deseable: lo deseable no impide la entrega, pero una plantilla que no lo produce nunca lo va a producir", () => {
    for (const k of CLAVES_PLANTILLA) {
      const huerfanas = cobertura(k).filter((c) => c.cubierta_por.length === 0).map((c) => c.exigencia);
      expect(huerfanas, `la plantilla «${k}» no produce las exigencias ${huerfanas.join(", ")}`).toEqual([]);
    }
  });

  it("cobertura() responde por todas las exigencias de la biblioteca, una por una", () => {
    const total = CLAVES_PLANTILLA.reduce((n, k) => n + cobertura(k).length, 0);
    expect(total).toBe(CLAVES_VARA.reduce((n, k) => n + vara(k).exigencias.length, 0));
    // No se fija el número exacto a propósito: la biblioteca crece. Eran 95 cuando se escribieron
    // estas plantillas, 99 tras aplicar las objeciones y 100 al partir en dos la del objetivo con su
    // medición. El piso es para que una vara truncada se note.
    expect(total, "la biblioteca perdió exigencias: alguien truncó una vara").toBeGreaterThanOrEqual(90);
  });

  it("ninguna plantilla cubre un número de exigencia que su vara no tiene", () => {
    for (const k of CLAVES_PLANTILLA) {
      const cuantas = vara(k).exigencias.length;
      for (const s of PLANTILLAS[k].secciones) {
        for (const n of s.cubre) {
          expect(Number.isInteger(n), `${k}/${s.clave}: cubre «${n}», que no es un número de exigencia`).toBe(true);
          expect(n, `${k}/${s.clave}: cubre la exigencia ${n} y la vara tiene ${cuantas}`).toBeGreaterThanOrEqual(1);
          expect(n, `${k}/${s.clave}: cubre la exigencia ${n} y la vara tiene ${cuantas}`).toBeLessThanOrEqual(cuantas);
        }
        expect(new Set(s.cubre).size, `${k}/${s.clave}: repite un número en cubre`).toBe(s.cubre.length);
      }
    }
  });

  it("la numeración de cubre es posicional: si la vara cambió de tamaño, hay que revisarla a mano", () => {
    // Es el único aviso que existe mientras las exigencias no tengan clave propia: insertar una
    // exigencia en el medio de una vara corre todos los números de abajo sin que nada se queje.
    for (const k of CLAVES_PLANTILLA) {
      const ahora = vara(k).exigencias.length;
      expect(
        PLANTILLAS[k].exigencias_que_tenia_la_vara,
        `la vara «${k}» tiene ahora ${ahora} exigencias y la plantilla se escribió con otra cantidad: revisar uno por uno los números de «cubre» antes de tocar este campo`,
      ).toBe(ahora);
    }
  });
});

describe("ninguna sección es relleno", () => {
  it("toda sección existe PARA satisfacer exigencias concretas", () => {
    for (const { k, s } of TODAS) {
      expect(s.cubre.length, `${k}/${s.clave} no satisface ninguna exigencia: entonces es relleno con nuestro nombre encima`).toBeGreaterThan(0);
    }
  });

  it("las claves de sección no se repiten dentro de una plantilla y se pueden usar como identificador", () => {
    for (const k of CLAVES_PLANTILLA) {
      const claves = PLANTILLAS[k].secciones.map((s) => s.clave);
      expect(new Set(claves).size, `${k} repite una clave de sección`).toBe(claves.length);
      for (const c of claves) expect(c, `${k}/${c}`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("toda sección dice por qué existe, en palabras que se le pueden leer al cliente", () => {
    for (const { k, s } of TODAS) {
      expect(s.titulo.length, `${k}/${s.clave}`).toBeGreaterThan(10);
      expect(s.por_que.length, `${k}/${s.clave}: el por qué está demasiado corto para explicárselo a nadie`).toBeGreaterThan(80);
      // Nada de hablar al cliente de nuestra maquinaria: la vara y las exigencias son internas.
      expect(s.por_que, `${k}/${s.clave}: el por qué le habla al cliente de nuestra metodología`).not.toMatch(/\bexigencia\s*\d|\bvara\b|BLOQUES_ACTIVOS|activos\.ts/i);
    }
  });

  it("toda sección obligatoria tiene al menos una fuente y su pregunta de respaldo", () => {
    for (const { k, s } of TODAS) {
      if (!s.obligatoria) continue;
      expect(s.de_donde_sale.length, `${k}/${s.clave} es obligatoria y no dice de dónde sale`).toBeGreaterThan(0);
      expect(s.si_falta.length, `${k}/${s.clave} es obligatoria y no trae la pregunta que se hace si el dato falta`).toBeGreaterThan(20);
    }
  });

  it("cada plantilla tiene secciones obligatorias y deseables: no todo pesa igual", () => {
    for (const k of CLAVES_PLANTILLA) {
      const obl = PLANTILLAS[k].secciones.filter((s) => s.obligatoria).length;
      expect(obl, `${k} no tiene secciones obligatorias`).toBeGreaterThan(5);
      expect(obl, `${k}: todas sus secciones son obligatorias`).toBeLessThanOrEqual(PLANTILLAS[k].secciones.length);
    }
  });
});

describe("de dónde sale cada sección: claves reales, no nombres inventados", () => {
  it("toda fuente de tipo activo apunta a una clave que existe en el levantamiento", () => {
    for (const { k, s } of TODAS) {
      for (const f of s.de_donde_sale) {
        if (f.de !== "activo") continue;
        expect(CLAVES_DE_ACTIVO.has(f.clave), `${k}/${s.clave} apunta a «${f.clave}», que no existe en BLOQUES_ACTIVOS`).toBe(true);
      }
    }
  });

  it("toda fuente es uno de los seis tipos declarados, y las que lo necesitan dicen sobre qué", () => {
    const tipos = ["activo", "afirmaciones", "organigrama", "procesos", "decision_gerencia", "asesor_legal"];
    for (const { k, s } of TODAS) {
      for (const f of s.de_donde_sale as FuenteSeccion[]) {
        expect(tipos, `${k}/${s.clave}`).toContain(f.de);
        if (f.de === "afirmaciones") expect(f.busca.length, `${k}/${s.clave}: no dice qué se busca`).toBeGreaterThan(20);
        if (f.de === "decision_gerencia" || f.de === "asesor_legal") {
          expect(f.sobre.length, `${k}/${s.clave}: no dice sobre qué se decide o se consulta`).toBeGreaterThan(20);
        }
      }
    }
  });

  it("cada plantilla nombra al menos una decisión que solo puede tomar la gerencia", () => {
    // Si una plantilla no necesita nada del dueño, está inventando los topes y las reservas: es
    // exactamente el defecto del MOF que medimos, donde ningún monto estaba escrito.
    for (const k of CLAVES_PLANTILLA) {
      const hay = PLANTILLAS[k].secciones.some((s) => s.de_donde_sale.some((f) => f.de === "decision_gerencia"));
      expect(hay, `${k} no necesita ninguna decisión del dueño: o le sobra confianza o le falta tope`).toBe(true);
    }
  });

  it("cada plantilla deja algo en manos del asesor legal, y no lo resuelve sola", () => {
    for (const k of CLAVES_PLANTILLA) {
      const hay = PLANTILLAS[k].secciones.some((s) => s.de_donde_sale.some((f) => f.de === "asesor_legal"));
      expect(hay, `${k} resuelve lo legal por su cuenta`).toBe(true);
    }
  });
});

describe("la pregunta de respaldo no sugiere la respuesta", () => {
  const todas = TODAS.map(({ k, s }) => ({ donde: `${k}/${s.clave}`, p: s.si_falta }));

  it("ninguna pregunta trae una cifra: la cifra que va en la pregunta es la que vuelve como respuesta", () => {
    for (const { donde, p } of todas) {
      expect(p, `${donde}: «${p}» trae un número`).not.toMatch(/\d/);
      expect(p, `${donde}: «${p}» trae una cantidad escrita`).not.toMatch(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|cincuenta|cien|mil)\b/i);
    }
  });

  it("es una sola pregunta, respondible hablando", () => {
    for (const { donde, p } of todas) {
      expect((p.match(/\?/g) ?? []).length, `${donde}: «${p}» tiene más de una pregunta`).toBe(1);
      expect((p.match(/¿/g) ?? []).length, `${donde}: «${p}» tiene más de una pregunta`).toBe(1);
      expect(p.length, `${donde}: «${p}» es demasiado larga para responderla hablando`).toBeLessThanOrEqual(160);
    }
  });

  it("ninguna pregunta pide una opinión en lugar de un hecho", () => {
    const opina = /¿\s*(te parece|crees|piensas|opinas|consideras|qué opinas|qué tan|cómo maneja|cómo gestiona|cómo ve[sn]?\b|está bien|debería)/i;
    for (const { donde, p } of todas) expect(opina.test(p), `${donde}: «${p}» pide una opinión`).toBe(false);
  });

  it("ninguna pregunta pone un ejemplo adentro ni pide el promedio", () => {
    for (const { donde, p } of todas) {
      expect(p, `${donde}: «${p}»`).not.toMatch(/por ejemplo|\bej\./i);
      expect(p, `${donde}: «${p}» pide el promedio en vez del episodio`).not.toMatch(/promedio|más o menos|normalmente|por lo general|suele\b/i);
    }
  });

  it("el registro es el de la casa: «dinero», nunca «plata»", () => {
    for (const { donde, p } of todas) expect(p, `${donde}: «${p}»`).not.toMatch(/\bplata\b/i);
  });

  it("ninguna pregunta se repite entre plantillas con el mismo texto y distinto sentido", () => {
    // Repetir una pregunta está bien si pide el mismo hecho; lo que no puede pasar es que el mismo
    // texto esté pegado por comodidad en secciones que necesitan datos distintos.
    const porTexto = new Map<string, string[]>();
    for (const { donde, p } of todas) porTexto.set(p, [...(porTexto.get(p) ?? []), donde]);
    for (const [p, donde] of porTexto) {
      expect(donde.length, `«${p}» se usa en ${donde.join(", ")}`).toBeLessThanOrEqual(3);
    }
  });
});

describe("lo que la plantilla impide escribir", () => {
  it("cada plantilla trae el relleno conocido de su tipo de documento", () => {
    for (const k of CLAVES_PLANTILLA) {
      const nl = PLANTILLAS[k].nunca_lleva;
      expect(nl.length, `${k} no dice qué relleno impide`).toBeGreaterThanOrEqual(6);
      for (const linea of nl) expect(linea.length, `${k}: «${linea}» es demasiado corta para reconocer el relleno`).toBeGreaterThan(40);
      expect(new Set(nl).size, `${k} repite una línea de nunca_lleva`).toBe(nl.length);
    }
  });

  it("el relleno que la plantilla impide sale del relleno que la vara detecta", () => {
    // No se comparan palabra por palabra —la vara describe lo que se ve, la plantilla prohíbe
    // escribirlo—, pero una plantilla no puede prohibir menos cosas de las que su vara detecta.
    for (const k of CLAVES_PLANTILLA) {
      const dela = vara(k).senales_de_relleno.length;
      expect(PLANTILLAS[k].nunca_lleva.length, `la vara ${k} detecta ${dela} señales de relleno y la plantilla impide menos`).toBeGreaterThanOrEqual(dela - 2);
    }
  });
});

describe("qué falta preguntar", () => {
  const TODO_EL_MATERIAL = [...CLAVES_DE_ACTIVO, "organigrama", "procesos", "afirmaciones"];

  it("sin nada levantado, hay que preguntar por todas las secciones", () => {
    for (const k of CLAVES_PLANTILLA) {
      expect(queFaltaPreguntar(k, []).length, k).toBe(PLANTILLAS[k].secciones.length);
    }
  });

  it("cada pendiente devuelve la pregunta exacta de su sección", () => {
    for (const k of CLAVES_PLANTILLA) {
      const porClave = new Map(PLANTILLAS[k].secciones.map((s) => [s.clave, s]));
      for (const f of queFaltaPreguntar(k, [])) {
        const s = porClave.get(f.seccion);
        expect(s, `${k}: devolvió la sección «${f.seccion}», que no existe`).toBeTruthy();
        expect(f.pregunta).toBe(s!.si_falta);
        expect(f.obligatoria).toBe(s!.obligatoria);
      }
    }
  });

  it("las obligatorias van primero: son las que impiden la entrega", () => {
    for (const k of CLAVES_PLANTILLA) {
      const orden = queFaltaPreguntar(k, []).map((f) => f.obligatoria);
      const primeraDeseable = orden.indexOf(false);
      if (primeraDeseable >= 0) expect(orden.slice(primeraDeseable).some((o) => o), k).toBe(false);
    }
  });

  it("con todo el material levantado, lo que sigue pendiente es solo lo que el dueño o el asesor tienen que decidir", () => {
    for (const k of CLAVES_PLANTILLA) {
      const pendientes = queFaltaPreguntar(k, TODO_EL_MATERIAL).map((f) => f.seccion);
      expect(pendientes.length, `${k}: con todo levantado no quedó nada que preguntar, y los topes no salen de ningún documento`).toBeGreaterThan(0);
      for (const clave of pendientes) {
        const s = PLANTILLAS[k].secciones.find((x) => x.clave === clave)!;
        const soloElDueno = s.de_donde_sale.some((f) => f.de === "decision_gerencia" || f.de === "asesor_legal");
        expect(soloElDueno, `${k}/${clave} sigue pendiente y no depende de ninguna decisión: la fuente está mal escrita`).toBe(true);
      }
    }
  });

  it("el MOF con todo el material levantado sigue pidiendo los montos, el horario por sede y lo legal", () => {
    // Son tres de los trece fallos del MOF que medimos, y ninguno sale de un documento del cliente.
    const pendientes = queFaltaPreguntar("mof", TODO_EL_MATERIAL).map((f) => f.seccion);
    expect(pendientes).toContain("autoridad_y_montos");
    expect(pendientes).toContain("condiciones_por_sede");
    expect(pendientes).toContain("para_asesoria_legal");
    expect(pendientes).toContain("decisiones_reservadas");
  });
});

describe("el MOF: un documento escrito con esta plantilla no puede repetir los trece fallos de la primera empresa cliente", () => {
  // Los números son las exigencias que la revisión del 18-10-2026 marcó NO CUMPLE y obligatorias.
  // La única que cumplió fue la 5, la frecuencia de cada función.
  const FALLARON = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 16];

  it("cada uno de los trece fallos tiene sección que lo produce", () => {
    const cob = new Map(cobertura("mof").map((c) => [c.exigencia, c.cubierta_por]));
    for (const n of FALLARON) {
      const quien = cob.get(n) ?? [];
      expect(quien.length, `la exigencia ${n} —«${vara("mof").exigencias[n - 1].exigencia}»— volvería a fallar`).toBeGreaterThan(0);
    }
  });

  it("existen las secciones que atajan los fallos nombrados uno por uno", () => {
    const claves = PLANTILLAS.mof.secciones.map((s) => s.clave);
    // funciones repetidas · sin tabla de montos · sin respaldo · un horario para todas las sedes ·
    // habilidades como adjetivos · jefes nombrados sin ficha propia.
    expect(claves).toContain("funciones_del_puesto");
    expect(claves).toContain("autoridad_y_montos");
    expect(claves).toContain("respaldo_del_puesto");
    expect(claves).toContain("condiciones_por_sede");
    expect(claves).toContain("habilidades_observables");
    expect(claves).toContain("mapa_de_puestos");
  });

  it("la tabla de funciones se escribe de forma que el mismo cuadre no entre tres veces", () => {
    // En el manual de funciones de la primera empresa cliente el cuadre de caja estaba en las funciones 9, 37 y 43 con tres verbos
    // distintos, así que reducido a verbo+objeto pasaba. La plantilla agrupa por objeto y por
    // familia de verbo, que es lo que lo atrapa.
    const s = PLANTILLAS.mof.secciones.find((x) => x.clave === "funciones_del_puesto")!;
    expect(s.por_que).toMatch(/objeto/i);
    expect(s.por_que).toMatch(/familia/i);
    expect(s.cubre).toContain(1);
    expect(s.cubre).toContain(2);
  });

  it("la tabla de montos depende de la gerencia y nunca de un documento del cliente", () => {
    const s = PLANTILLAS.mof.secciones.find((x) => x.clave === "autoridad_y_montos")!;
    expect(s.de_donde_sale.some((f) => f.de === "decision_gerencia")).toBe(true);
    expect(s.si_falta).toMatch(/monto/i);
    expect(s.si_falta).not.toMatch(/\d/);
  });

  it("la portada separa aprobación de vigencia, que son dos hechos distintos", () => {
    const s = PLANTILLAS.mof.secciones.find((x) => x.clave === "portada_aprobacion_vigencia")!;
    expect(s.por_que).toMatch(/aprob/i);
    expect(s.por_que).toMatch(/rige|vigencia/i);
  });
});

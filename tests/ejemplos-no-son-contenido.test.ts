import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { EJEMPLOS } from "@/lib/activos";

/**
 * UN EJEMPLO JAMÁS ES CONTENIDO DE LA CAJA.
 *
 * El 30-08-2026 la dueña de Qori Home creyó que el aplicativo le estaba metiendo datos de otra
 * empresa —de otro rubro— en sus respuestas, y tuvo que borrarlos letra por letra. No había fuga
 * de datos: era un ejemplo puesto donde va lo que ella escribe. Para quien llena el formulario, un
 * ejemplo dentro de la caja ES un dato ajeno; la diferencia técnica no existe para ella.
 *
 * La regla del producto, desde hoy: los ejemplos viven en `placeholder` —tenue, en cursiva, y se
 * van solos al escribir o al dictar—; nunca en `value` ni en `defaultValue`.
 */
const raiz = path.join(process.cwd(), "src");

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const tsx = archivos(raiz);
const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");

describe("un ejemplo jamás va dentro de la caja de respuesta", () => {
  it("ningún campo se rellena con EJEMPLOS: eso obliga a borrar letra por letra", () => {
    const culpables = tsx.filter((f) => {
      const src = readFileSync(f, "utf8");
      // value={...EJEMPLOS...} o defaultValue={...EJEMPLOS...} en la misma expresión.
      return /(?:value|defaultValue)=\{[^}]*EJEMPLOS/.test(src);
    });
    expect(culpables.map(rel), "un ejemplo debe ir en placeholder, nunca como contenido").toEqual([]);
  });

  it("los ejemplos que se muestran van como placeholder, que es lo que se borra solo", () => {
    const src = readFileSync(path.join(raiz, "components/cliente/InventarioActivos.tsx"), "utf8");
    expect(src, "el ejemplo tiene que estar en el placeholder").toMatch(/placeholder=\{[^}]*EJEMPLOS/);
    expect(src, "y no puede estar además como contenido").not.toMatch(/value=\{[^}]*EJEMPLOS/);
  });

  it("el placeholder se ve tenue y en cursiva: no se puede confundir con lo escrito", () => {
    const css = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(css).toMatch(/\.campo::placeholder/);
    expect(css).toMatch(/font-style:\s*italic/);
    expect(css, "tiene que ser más claro que la tinta normal").toMatch(/opacity:\s*0?\.[0-6]/);
  });

  it("ninguna caja arranca con texto de ejemplo escrito a mano", () => {
    // Un value/defaultValue con una cadena literal larga es texto puesto a dedo dentro de la caja.
    const culpables: string[] = [];
    for (const f of tsx) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:value|defaultValue)=\{?"([^"]{25,})"\}?/g)) {
        culpables.push(`${rel(f)}: "${m[1].slice(0, 40)}…"`);
      }
    }
    expect(culpables, "eso es contenido que la persona tendría que borrar").toEqual([]);
  });

  it("los ejemplos del catálogo siguen siendo frases de dueño, no plantillas", () => {
    const textos = Object.values(EJEMPLOS);
    expect(textos.length).toBeGreaterThan(10);
    for (const t of textos) {
      // Entrecomillado con « »: se lee como algo que alguien dijo, no como una instrucción del sistema.
      expect(t, `«${t.slice(0, 40)}» debería ir entrecomillado como algo que alguien dijo`).toMatch(/«[^»]+»/);
      expect(t, "un ejemplo no puede tener huecos por rellenar").not.toMatch(/\[|\]|XXX|___/);
    }
  });
});

/**
 * LA TRANSCRIPCIÓN NO PUEDE INVENTAR (30-08-2026). A la dueña de Qori Home le apareció en su caja
 * "empezamos con un capital inicial de 25 mil soles" — el ejemplo que estaba escrito en NUESTRO
 * prompt de transcripción. Con el audio inaudible, el modelo no tenía qué transcribir y rellenó el
 * hueco con lo que la instrucción le sugería. Creyó que le metíamos datos de otra empresa.
 */
describe("la instrucción de transcribir no puede insinuar qué se dijo", () => {
  const gemini = readFileSync(path.join(raiz, "lib/ai/gemini.ts"), "utf8");
  // La instrucción de transcribir: desde donde arranca hasta el cierre de su bloque.
  const desde = gemini.indexOf("Transcribe el audio en español");
  const instruccion = desde >= 0 ? gemini.slice(desde, gemini.indexOf("contents:", desde)) : "";

  it("no le dice al modelo de qué habla la persona", () => {
    expect(instruccion, "decir 'describiendo su empresa' es darle el tema para inventar").not.toMatch(/describiendo su empresa|persona de negocios/i);
  });

  it("no trae ejemplos con cifras ni contenido de negocio", () => {
    expect(instruccion, "los ejemplos con contenido reaparecen como transcripción inventada").not.toMatch(/25 mil|de cada 10, unos/i);
  });

  it("ordena devolver vacío antes que inventar", () => {
    expect(instruccion).toMatch(/\[sin audio\]/);
    expect(instruccion).toMatch(/antes que escribir algo que no se oyó/i);
  });

  it("hay barrera en el código: un audio mudo no vuelve como párrafo", () => {
    expect(gemini, "debe rechazar la transcripción vacía o de puro silencio").toMatch(/NADA\s*=\s*\/\^/);
    expect(gemini, "y rechazar más palabras de las que caben en el audio").toMatch(/palabras > Math\.max/);
  });
});

describe("siempre hay cómo borrar en un toque", () => {
  it("las cajas grandes que se llenan dictando ofrecen borrar todo", () => {
    for (const f of ["components/ProcesosLista.tsx", "components/Entrevista.tsx"]) {
      const src = readFileSync(path.join(raiz, f), "utf8");
      expect(src, `${f}: en el celular, vaciar a mano es borrar letra por letra`).toContain("Borrar y empezar de nuevo");
    }
  });
});

describe("el micrófono nunca falla en silencio", () => {
  const src = readFileSync(path.join(raiz, "components/voz/BotonGrabar.tsx"), "utf8");

  it("un fallo al abrir el micrófono se le dice a la persona", () => {
    // Antes el catch solo hacía setGrabando(false): el botón quedaba muerto sin explicación.
    expect(src).toContain("setFalloMicro");
    expect(src, "el permiso denegado es el caso más común en el iPhone").toContain("NotAllowedError");
  });

  it("una grabación vacía se avisa aquí, sin mandarla al servidor", () => {
    expect(src).toMatch(/blob\.size < \d+/);
  });

  it("no se fuerza un formato de audio: Safari en iPhone no soporta webm", () => {
    expect(src, "pasar mimeType a MediaRecorder lo hace fallar en el iPhone").not.toMatch(/new MediaRecorder\(stream,/);
  });
});

describe("un proceso se captura con detalle y sin inventar", () => {
  const prompt = readFileSync(path.join(raiz, "lib/ai/agents/arquitecto.ts"), "utf8");

  it("pide tiempo, responsable y herramienta de cada paso", () => {
    for (const campo of ["responsable", "herramienta", "tiempo", "entrada/salida", "estandar", "evidencia"])
      expect(prompt, `falta pedir ${campo}`).toContain(campo);
  });

  it("pide cómo se mide el proceso, que la base guardaba vacío", () => {
    for (const campo of ["indicador", "meta", "medicion_donde", "sale_mal", "como_bien"])
      expect(prompt, `la ficha debe recoger ${campo}`).toContain(campo);
  });

  it("prohíbe deducir responsables, tiempos o herramientas", () => {
    expect(prompt).toMatch(/NADA SE INVENTA/);
    expect(prompt).toMatch(/Jamas deduzcas un responsable/);
    expect(prompt, "un hueco honesto se pregunta; lo inventado se cree").toMatch(/huecos se preguntan, lo inventado se cree/);
  });

  it("lo que el arquitecto recoge se guarda de verdad", () => {
    const handler = readFileSync(path.join(raiz, "lib/jobs/handlers/procesos.ts"), "utf8");
    for (const campo of ["indicador", "meta", "medicion_donde", "sale_mal", "como_bien"])
      expect(handler, `${campo} se pide pero no se guarda`).toContain(`${campo}: ficha?.${campo}`);
  });
});

describe("un audio largo no se pierde", () => {
  const gemini = readFileSync(path.join(raiz, "lib/ai/gemini.ts"), "utf8");

  it("transcribir tiene su propio plazo, más largo que el de responder", () => {
    expect(gemini).toContain("TIMEOUT_TRANSCRIBIR_MS");
    expect(gemini, "con el plazo general de 120 s una grabación de 15 minutos moría").toMatch(/AI_TIMEOUT_TRANSCRIBIR_MS \?\? 2[0-9]{2}_000/);
  });

  it("el presupuesto de salida crece con la duración del audio", () => {
    expect(gemini).toMatch(/maxOutputTokens: segundos != null/);
  });

  it("el tope de palabras no estorba a una grabación larga de verdad", () => {
    // 25 palabras por segundo hablado es ~10x lo que habla una persona: solo caza lo inventado.
    const m = gemini.match(/palabras > Math\.max\(20, segundos \* (\d+)\)/);
    expect(m, "debe existir el tope de sensatez").not.toBeNull();
    const porSegundo = Number(m![1]);
    const en15min = 900 * porSegundo;
    expect(en15min, "15 minutos hablados son ~2.500 palabras: debe caber de sobra").toBeGreaterThan(20000);
  });
});

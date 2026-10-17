import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import * as activos from "@/lib/activos";
import { SISTEMA_LENTE_DINERO, PROMPT_LENTE_DINERO } from "@/lib/ai/agents/lente-dinero";
import { SISTEMA_LENTE_TERRENO, PROMPT_LENTE_TERRENO } from "@/lib/ai/agents/lente-terreno";
import { SISTEMA_EQUIPO_ROJO, INSTRUCCION_REPARACION, PROMPT_EQUIPO_ROJO } from "@/lib/ai/agents/equipo-rojo";
import { GUIA_EFECTOS, bloqueCatalogo } from "@/lib/ai/agents/estrategia-comun";
import { CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES } from "@/lib/rules/base-renaser";
import { GUARDIA } from "@/lib/rules/patrones";
import { referentesEn } from "@/lib/estrategia/validador";

/**
 * UN EJEMPLO JAMÁS ES CONTENIDO DE LA CAJA.
 *
 * El 30-08-2026 la dueña de una empresa cliente creyó que el aplicativo le estaba metiendo datos de otra
 * empresa —de otro rubro— en sus respuestas, y tuvo que borrarlos letra por letra. No había fuga
 * de datos: era un ejemplo puesto donde va lo que ella escribe. Para quien llena el formulario, un
 * ejemplo dentro de la caja ES un dato ajeno; la diferencia técnica no existe para ella.
 *
 * La regla del producto, desde hoy: los ejemplos viven en `placeholder` —tenue, en cursiva, y se
 * van solos al escribir o al dictar—; nunca en `value` ni en `defaultValue`.
 *
 * 16-10-2026: tampoco en `placeholder`. Lo que va dentro de la caja, aunque sea tenue, se devuelve
 * como respuesta: el dueño repetía la cifra o el nombre del ejemplo. Las 34 respuestas modelo se
 * quitaron; la caja de cada pregunta lleva una sola pista neutra (PISTA_RESPUESTA) y la pregunta pide
 * el episodio. Las reglas sobre las preguntas mismas viven en tests/preguntas-sin-eco.test.ts.
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
  it("ningún campo se rellena con la pista ni con un ejemplo: eso obliga a borrar letra por letra", () => {
    const culpables = tsx.filter((f) => {
      const src = readFileSync(f, "utf8");
      // value={...PISTA_RESPUESTA...} o defaultValue={...EJEMPLOS...} en la misma expresión.
      return /(?:value|defaultValue)=\{[^}]*(?:EJEMPLOS|PISTA_RESPUESTA)/.test(src);
    });
    expect(culpables.map(rel), "la pista va en placeholder, nunca como contenido").toEqual([]);
  });

  it("las preguntas del levantamiento llevan en la caja la pista neutra, no una respuesta modelo", () => {
    const src = readFileSync(path.join(raiz, "components/cliente/InventarioActivos.tsx"), "utf8");
    expect(src, "la caja de cada pregunta lleva la pista neutra").toMatch(/placeholder=\{PISTA_RESPUESTA\}/);
    expect(src, "y ya no hay respuestas modelo que mostrar").not.toMatch(/EJEMPLOS|Por ejemplo:/);
    expect(src, "y no puede estar además como contenido").not.toMatch(/value=\{[^}]*PISTA_RESPUESTA/);
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

  it("no hay catálogo de respuestas modelo: la pista es una sola, neutra, sin cifras ni nombres", () => {
    expect(activos, "las 34 respuestas modelo se quitaron el 16-10-2026").not.toHaveProperty("EJEMPLOS");
    expect(activos.PISTA_RESPUESTA).not.toMatch(/\d|«|ejemplo|ej\./i);
  });
});

/**
 * LA TRANSCRIPCIÓN NO PUEDE INVENTAR (30-08-2026). A la dueña de una empresa cliente le apareció en su caja
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

describe("lo dictado se puede leer y corregir antes de mandarlo", () => {
  const procesos = readFileSync(path.join(raiz, "components/ProcesosLista.tsx"), "utf8");

  it("la caja crece con lo dictado en vez de cortar la frase", () => {
    expect(procesos, "cinco filas fijas cortaban el texto a media palabra").toMatch(/rows=\{filas\}/);
    expect(procesos).toMatch(/Math\.min\(14, Math\.max\(5/);
    const entrevista = readFileSync(path.join(raiz, "components/Entrevista.tsx"), "utf8");
    expect(entrevista, "la respuesta de la entrevista también quedaba cortada").toMatch(/rows=\{Math\.min\(14/);
  });

  it("al terminar de dictar se abre en grande para releer", () => {
    const desde = procesos.indexOf("const t = await transcribirAudio");
    expect(desde, "debe existir el paso de transcribir").toBeGreaterThan(-1);
    const bloque = procesos.slice(desde, desde + 600);
    expect(bloque, "es el momento exacto de corregir lo que se entendió mal").toContain("setRevisando(true)");
  });

  it("la ventana grande usa el panel del portal, que ya respeta el iPhone", () => {
    // .panel-lateral: hoja inferior con 82dvh y env(safe-area-inset-bottom). Inventar otro overlay
    // con 100vh se rompe en Safari por la barra de direcciones.
    expect(procesos).toContain("panel-lateral");
    expect(procesos).toContain("telon");
    const css = readFileSync(path.join(raiz, "design/tokens.css"), "utf8");
    expect(css).toMatch(/max-height:\s*82dvh/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("se puede dibujar desde la ventana grande y vuelve sola a la vista normal", () => {
    const panel = procesos.slice(procesos.indexOf("Revisa lo que contaste"));
    expect(panel, "el botón tiene que estar dentro del panel").toContain("Dibujarlo");
    expect(procesos, "al mandarlo a dibujar el panel se cierra").toMatch(/setRevisando\(false\);\s*\n\s*\} catch/);
  });

  it("se puede cerrar con Escape y no se queda la página bloqueada", () => {
    expect(procesos).toContain('e.key === "Escape"');
    expect(procesos).toMatch(/document\.body\.style\.overflow = ""/);
  });
});

/**
 * NADIE DEBERÍA CONFUNDIRSE USANDO ESTO. Cosas que la dueña de una empresa cliente vivió en su pantalla y que
 * no eran fallos técnicos, sino cosas que el aplicativo no explicaba o no dejaba arreglar.
 */
describe("nada en pantalla queda sin nombre, sin salida ni sin explicación", () => {
  const lista = readFileSync(path.join(raiz, "components/ProcesosLista.tsx"), "utf8");
  const handler = readFileSync(path.join(raiz, "lib/jobs/handlers/procesos.ts"), "utf8");

  it("el proceso toma el nombre que le puso el arquitecto: dos «Proceso nuevo» son indistinguibles", () => {
    expect(handler, "el nombre que devolvía la IA se estaba descartando").toContain("nombreIA");
    expect(handler, "si la persona escribió un nombre, ese manda").toContain("sinNombre");
  });

  it("lo que el sistema no entendió se marca como tal, no con un símbolo suelto", () => {
    const prompt = readFileSync(path.join(raiz, "lib/ai/agents/arquitecto.ts"), "utf8");
    expect(prompt).toContain("Falta confirmar: ");
    expect(prompt, "un «?» delante no significa nada para el dueño").toMatch(/Nunca uses solo "\?" delante/);
  });

  it("un proceso que salió vacío lo dice, en vez de fingir que se dibujó algo", () => {
    expect(lista).toContain("no llegamos a entender lo que contaste");
  });

  it("el cliente puede quitar un proceso que salió mal", () => {
    expect(lista, "la ruta existía pero no había botón: la basura se quedaba para siempre").toContain("Quitar este proceso");
    expect(lista, "borrar sin vuelta atrás se confirma").toContain("No se puede deshacer");
  });

  it("la pantalla vacía no le ofrece al cliente algo que no puede hacer", () => {
    const textos = readFileSync(path.join(raiz, "lib/textos.ts"), "utf8");
    expect(textos).toContain("procesosCliente");
    expect(lista, "el texto del vacío depende de quién mira").toMatch(/paraCliente \? VACIO\.procesosCliente/);
    // "Empezar en blanco" es solo del consultor: el vacío del cliente no puede mencionarlo.
    const vacioCliente = textos.slice(textos.indexOf("procesosCliente:"), textos.indexOf("procesosCliente:") + 200);
    expect(vacioCliente).not.toMatch(/dibújalo a mano/);
  });
});

/**
 * LOS PROMPTS DE LA ESTRATEGIA NO TRAEN CIFRAS NI EJEMPLOS (spec-estrategia-8x.md §5.1 y §9.3). Un ejemplo con contenido
 * en un prompt reaparece como «dato» en la salida: es la misma regla que la de la caja de respuesta, del otro lado. Se
 * mira el texto PROPIO de cada agente (SISTEMA_*, y la instrucción de la reparación); los bloques compartidos que se le
 * suman no pasan la regla del dígito (el contrato de razonamiento numera sus pasos) y de ellos solo se exige que no
 * traigan montos ni porcentajes.
 */
describe("los prompts de la estrategia: cifras solo como {{id}} y nada de suponer cuánto es algo hoy", () => {
  const PROPIOS = { SISTEMA_LENTE_DINERO, SISTEMA_LENTE_TERRENO, SISTEMA_EQUIPO_ROJO, INSTRUCCION_REPARACION };
  const SISTEMAS = { SISTEMA_LENTE_DINERO, SISTEMA_LENTE_TERRENO, SISTEMA_EQUIPO_ROJO };

  /** Lo permitido: «de cada 10», los horizontes de 14, 30 y 90 días, y el nombre del producto (8X), que no es una cifra. */
  const sinAnclas = (t: string) =>
    t.replace(/\b8X\b/g, " ").replace(/de cada 10/g, " ").replace(/\b(?:14|30|90)(?:\s*,\s*(?:14|30|90))*(?:\s+y\s+(?:14|30|90))?\s+días\b/g, " ");

  it.each(Object.entries(PROPIOS))("%s no trae ningún dígito fuera de las anclas permitidas", (_n, t) => {
    expect(sinAnclas(t).match(/[^\s]*\d[^\s]*/g) ?? []).toEqual([]);
  });

  it.each(Object.entries(PROPIOS))("%s no trae montos, porcentajes ni «por ejemplo»", (_n, t) => {
    expect(t).not.toMatch(/S\/|\$|%/);
    expect(t).not.toMatch(/por ejemplo|p\.\s?ej\./i);
  });

  it.each(Object.entries(PROPIOS))("%s no nombra a ningún autor ni a otra empresa", (_n, t) => {
    expect(referentesEn(t)).toEqual([]);
  });

  it.each(Object.entries(SISTEMAS))("%s manda escribir las cifras solo como {{id}} y prohíbe suponer cuánto es algo hoy", (_n, t) => {
    expect(t).toContain("Cada número se escribe como {{id}}");
    expect(t).toMatch(/NO SUPONGAS CUÁNTO ES ALGO HOY/);
    expect(t).toMatch(/anótalo en faltan con su clave del catálogo/);
    expect(t).toMatch(/duplicar la utilidad o más a 90 días/);
  });

  it("cada lente dice qué prefijo usan sus supuestos y que no ve a la otra", () => {
    expect(SISTEMA_LENTE_DINERO).toMatch(/empieza con SA/);
    expect(SISTEMA_LENTE_TERRENO).toMatch(/empieza con SB/);
    expect(SISTEMA_EQUIPO_ROJO).toMatch(/empieza con SR/);
    for (const t of [SISTEMA_LENTE_DINERO, SISTEMA_LENTE_TERRENO]) expect(t).toMatch(/al que no ves/);
  });

  it("el equipo rojo recibe la regla de los ids nuevos y la de un paso por jugada", () => {
    expect(SISTEMA_EQUIPO_ROJO).toMatch(/recibe el número siguiente al último de su lente/);
    expect(SISTEMA_EQUIPO_ROJO).toMatch(/un paso por jugada, en el orden de las jugadas/);
    // 8X las ordena por su día de inicio (revisión del 17-10): los pasos se mueven con ellas.
    expect(SISTEMA_EQUIPO_ROJO).toMatch(/ordena después pasos y jugadas juntos por su día de inicio/);
    expect(SISTEMA_EQUIPO_ROJO).toMatch(/No des tu propio «cumple \/ no cumple»/);
  });

  it("los bloques que se suman (compartidos y de estructura) no traen montos ni porcentajes", () => {
    for (const t of [CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES, GUIA_EFECTOS, bloqueCatalogo()]) {
      expect(t).not.toMatch(/S\/|\$|%/);
      expect(t).not.toMatch(/\d[\d.,]*\s*(?:mil|soles|dólares)\b/i);
    }
  });

  it("el catálogo que ve el modelo no trae los límites numéricos: los aplica el validador", () => {
    expect(bloqueCatalogo()).not.toMatch(/-?\d+\s*(?:a|hasta)\s*\+?\d+/);
    expect(bloqueCatalogo()).toContain("precio.pct");
    expect(bloqueCatalogo()).toContain("interesados_mes");
  });

  it("los tres prompts completos empiezan con la guardia contra lo incrustado", () => {
    for (const p of [PROMPT_LENTE_DINERO, PROMPT_LENTE_TERRENO, PROMPT_EQUIPO_ROJO]) {
      expect(p.startsWith(GUARDIA)).toBe(true);
      for (const b of [CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, LIMITES_REFERENTES]) expect(p).toContain(b);
    }
  });
});

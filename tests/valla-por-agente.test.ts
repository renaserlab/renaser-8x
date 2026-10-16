/**
 * TODO AGENTE QUE RECIBE CONTENIDO DE LA EMPRESA LO RECIBE ACOTADO.
 *
 * Esta prueba existe porque mi propia auditoría se equivocó midiendo. Conté «archivos de agente que
 * llaman a comoDato» y reporté seis sin proteger. La unidad estaba mal: el contenido no se acota en
 * el archivo del agente, se acota DONDE SE ARMA EL CONTEXTO, que en la mitad de los casos es el
 * manejador del trabajo. Tres de los seis que señalé ya estaban bien, y había dos que no había visto.
 *
 * El número correcto, rastreando a dos niveles: 18 agentes, 7 acotaban en su propia función y 11
 * recibían un contexto armado fuera. De esos 11, ocho lo recibían CRUDO — auditor, diagnosticador,
 * entrevistador, estratega, planificador, redactor, rediseno y sop.
 *
 * Así que la prueba no cuenta archivos: por cada agente sigue la cadena desde la llamada al modelo
 * hasta donde nace su contexto, y exige la valla en algún punto de esa cadena.
 *
 * ALCANCE. Es análisis estático: demuestra que el contenido se acota, no que un modelo concreto
 * respete la valla. Eso último depende del proveedor, no es determinista y no se puede afirmar desde
 * aquí. Lo que sí queda garantizado es lo que está bajo nuestro control.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { CLAVES_AGENTE } from "@/lib/agentes/contratos";

const RAIZ = path.resolve(__dirname, "../src");

function archivos(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) acc.push(...archivos(f));
    else if (/\.tsx?$/.test(e.name)) acc.push(f);
  }
  return acc;
}

const FUENTES = archivos(RAIZ).map((f) => ({ ruta: f, src: readFileSync(f, "utf8") }));

/** El cuerpo de la función exportada que contiene esa línea, y su nombre. */
function funcionQueContiene(src: string, linea: number): { nombre: string; cuerpo: string } | null {
  const lineas = src.split("\n");
  let i = linea;
  while (i > 0 && !/^(?:export )?(?:async )?function |^export const \w+ = async/.test(lineas[i])) i--;
  const nombre = lineas[i].match(/function (\w+)|const (\w+)/);
  if (!nombre) return null;
  // Hasta el cierre de la función al margen izquierdo, o 80 líneas si no se encuentra.
  let fin = i + 1;
  while (fin < lineas.length && fin < i + 120 && lineas[fin] !== "}") fin++;
  return { nombre: nombre[1] ?? nombre[2], cuerpo: lineas.slice(i, fin + 1).join("\n") };
}

type Rastro = { agente: string; acotadoEn: string | null; cadena: string[] };

function rastrear(agente: string): Rastro {
  const cadena: string[] = [];
  for (const { ruta, src } of FUENTES) {
    const lineas = src.split("\n");
    for (let i = 0; i < lineas.length; i++) {
      if (!new RegExp(`agente:\\s*"${agente}"`).test(lineas[i])) continue;
      const fn = funcionQueContiene(src, i);
      if (!fn) continue;
      cadena.push(`${path.basename(ruta)}:${fn.nombre}`);
      // NIVEL 1 · la propia función del agente acota.
      if (fn.cuerpo.includes("comoDato(")) return { agente, acotadoEn: `${path.basename(ruta)}:${fn.nombre}`, cadena };
      // NIVEL 2 · quien la llama arma el contexto: se busca la valla en ESA función.
      for (const otro of FUENTES) {
        if (otro.ruta === ruta) continue;
        const l2 = otro.src.split("\n");
        for (let j = 0; j < l2.length; j++) {
          if (!l2[j].includes(`${fn.nombre}(`)) continue;
          const fn2 = funcionQueContiene(otro.src, j);
          if (!fn2) continue;
          cadena.push(`${path.basename(otro.ruta)}:${fn2.nombre}`);
          if (fn2.cuerpo.includes("comoDato(")) return { agente, acotadoEn: `${path.basename(otro.ruta)}:${fn2.nombre}`, cadena };
        }
      }
    }
  }
  return { agente, acotadoEn: null, cadena };
}

const RASTROS = CLAVES_AGENTE.map(rastrear);

describe("la valla por agente, rastreada hasta donde nace su contexto", () => {
  it("se rastrearon todos los agentes registrados, incluido el director", () => {
    expect(CLAVES_AGENTE).toContain("director"); expect(CLAVES_AGENTE.length).toBeGreaterThanOrEqual(19); expect(RASTROS.map((r) => r.agente)).toEqual(CLAVES_AGENTE);
    expect(RASTROS.every((r) => r.cadena.length > 0), "algún agente no se pudo rastrear").toBe(true);
  });

  it.each(RASTROS.map((r) => [r.agente, r] as const))("«%s» recibe el contenido de la empresa acotado", (_a, r) => {
    expect(
      r.acotadoEn,
      `El agente "${r.agente}" recibe contenido sin acotar. Cadena rastreada: ${r.cadena.join(" ← ")}. Envuelve el material de la empresa con comoDato() donde se arma su contexto.`
    ).not.toBeNull();
  });
});

/**
 * PRUEBA DEDICADA "YA TE LO DIJE" (bloqueador 5): la no-redundancia no puede depender de fe en el prompt.
 * Caso 1: una respuesta rica cubre 4 temas (horas, rol, actividades a dejar, familia) → el entrevistador
 *         REAL debe declarar cubiertas esas áreas y NO preguntar ninguna de ellas.
 * Caso 2: la persona responde "Eso ya te lo respondí." → el sistema recupera lo dicho, marca cobertura,
 *         y la siguiente pregunta NO repite el tema.
 * Métrica: redundant_question_count debe ser 0 en ambos casos.
 *   node --env-file=.env.local --import=tsx scripts/prueba-redundancia.mts
 */
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { correrEntrevistador } from "../src/lib/ai/agents/entrevistador";
import { bancoComoTexto, bloquesSinCubrir } from "../src/lib/rules/cobertura";
const DIR = path.dirname(fileURLToPath(import.meta.url));

const RESPUESTA_RICA = "Quiero trabajar cuatro horas al día, dedicarme a estrategia y producto, dejar operaciones y tener más tiempo con mi familia.";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Temas que la respuesta rica ya cubre: preguntar por ellos es redundante.
const TEMAS_CUBIERTOS = [/horas/, /familia/, /operacion/, /estrategia/, /qué (amas|te gusta) hacer/, /rol\b/, /dejar de hacer/, /ya no (quieres|haces)/];

function contexto(extraRespondidas: string, sinCubrir: { clave: string; nombre: string }[]) {
  return [
    `TIPO DE SESIÓN: sueno_dueno`,
    `PARTICIPANTE: puesto: Gerente general · rol: dueno · antigüedad: —`,
    `BLOQUES SIN CUBRIR (${sinCubrir.length}): ${sinCubrir.map((b) => `[${b.clave}] ${b.nombre}`).join(", ") || "ninguno"}`,
    `PREGUNTAS YA RESPONDIDAS POR ESTA PERSONA:`,
    extraRespondidas,
    `RESPUESTAS DE OTRAS SESIONES (0): (ninguna)`,
    `AFIRMACIONES POR VALIDAR O CONTRADICHAS (0): (ninguna)`,
    `PILARES CON INFORMACIÓN INSUFICIENTE: ninguno`,
    `LO QUE LA EMPRESA YA MOSTRÓ (no vuelvas a preguntar nada de esto):`,
    `- Caleta capturada (0): ninguna\n- Procesos dibujados (0): ninguno\n- Fuentes entregadas (0): ninguna`,
    `BANCO:\n${bancoComoTexto("sueno_dueno")}`,
  ].join("\n\n");
}

function redundantes(preguntas: { texto: string }[]): string[] {
  return preguntas.filter((q) => TEMAS_CUBIERTOS.some((t) => t.test(norm(q.texto)))).map((q) => q.texto);
}

async function main() {
  // ---- CASO 1: la respuesta rica cubre 4 temas de una vez.
  const respondidas1 = [{ bloque: "vida_deseada" }];
  const sin1 = bloquesSinCubrir("sueno_dueno", respondidas1);
  const ctx1 = contexto(`- [vida_deseada] Imagina un martes normal ideal dentro de tres años: ¿dónde estás?\n  → ${RESPUESTA_RICA}`, sin1);
  const r1 = await correrEntrevistador(ctx1);
  const red1 = redundantes(r1.data.preguntas);
  const cubiertos1 = r1.data.bloques_cubiertos ?? [];
  const cubreRol = cubiertos1.includes("rol") || !r1.data.preguntas.some((q) => /rol|amas hacer|ya no quieres hacer/.test(norm(q.texto)));
  console.log("CASO 1:", JSON.stringify({ preguntas: r1.data.preguntas.map((q) => q.texto), bloques_cubiertos: cubiertos1, redundantes: red1 }, null, 1));

  // ---- CASO 2: "Eso ya te lo respondí."
  const respondidas2 = [{ bloque: "vida_deseada" }, { bloque: "rol" }];
  const sin2 = bloquesSinCubrir("sueno_dueno", respondidas2, cubiertos1);
  const ctx2 = contexto(
    `- [vida_deseada] Imagina un martes normal ideal dentro de tres años: ¿dónde estás?\n  → ${RESPUESTA_RICA}\n- [rol] ¿Qué responsabilidades conservarías siempre?\n  → Eso ya te lo respondí.`,
    sin2
  );
  const r2 = await correrEntrevistador(ctx2);
  const red2 = redundantes(r2.data.preguntas);
  const repiteRol = r2.data.preguntas.some((q) => /responsabilidades|conservar/.test(norm(q.texto)));
  console.log("CASO 2:", JSON.stringify({ preguntas: r2.data.preguntas.map((q) => q.texto), bloques_cubiertos: r2.data.bloques_cubiertos ?? [], redundantes: red2, repite_tema: repiteRol }, null, 1));

  const resultado = {
    fecha: new Date().toISOString(),
    caso1: { redundant_question_count: red1.length, cubre_rol: cubreRol, pregunta_avanza: r1.data.preguntas.length === 0 || !red1.length },
    caso2: { redundant_question_count: red2.length, repite_tema: repiteRol },
    pass: red1.length === 0 && cubreRol && red2.length === 0 && !repiteRol,
  };
  writeFileSync(path.resolve(DIR, "../benchmark/prueba-redundancia.json"), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 1));
  process.exit(resultado.pass ? 0 : 1);
}
main().catch((e) => { console.error("prueba de redundancia falló:", e?.message ?? e); process.exit(1); });

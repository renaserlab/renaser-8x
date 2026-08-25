/**
 * Regresión del caso "abrazos" (Jardín Renaser): un atributo genérico dicho solo por el dueño
 * NO debe salir como fortaleza/diferencial — debe volverse hipótesis con pregunta de validación.
 * Y el resumen del pilar debe leerse como consultor (causa + dato + costo), no como etiqueta.
 */
import { correrDiagnosticador } from "../../src/lib/ai/agents/diagnosticador";

const contexto = [
  "EMPRESA: Jardín Prueba · sector: terapias holísticas para mujeres · modelo operativo: citas · etapa del negocio: temprana",
  "PILAR: producto",
  "TABLA DE RESULTADOS (contado por la empresa):",
  "- 2026-07: vendido S/12,000 [contado] · quedó S/2,500 [contado]",
  "AFIRMACIONES (6):",
  "- [c1] (el dueño, entrevista) Nuestro diferencial son los abrazos: cada sesión termina con un abrazo y eso nos hace únicos.",
  "- [c2] (el dueño, entrevista) De cada 10 pacientes que empiezan, solo 2 terminan el tratamiento completo de 8 sesiones.",
  "- [c3] (el dueño, entrevista) El tratamiento promete reducir la ansiedad y recuperar la seguridad en 8 sesiones.",
  "- [c4] (el dueño, entrevista) No tenemos testimonios recogidos; sabemos que algunas clientas recomiendan pero no está apuntado.",
  "- [c5] (el dueño, entrevista) El precio por sesión es S/80, lo pusimos mirando a la competencia.",
  "- [c6] (el dueño, entrevista) Las clientas nuevas llegan sobre todo por TikTok.",
  "PROCESOS:",
  "(ninguno)",
  "KNOW-HOW MINADO (0):",
  "(ninguno)",
  "SUEÑO DEL DUEÑO (0 respuestas):",
  "(sin sesión de sueño completada)",
].join("\n\n");

const r = await correrDiagnosticador(contexto);
const h = r.data.hallazgos;
console.log("hallazgos:", h.length);
for (const x of h) console.log(`- [${x.impacto}${x.preserva ? " · FORTALEZA" : ""}${x.informacion_insuficiente ? " · info insuficiente" : ""}] ${x.titulo}`);
console.log("\nresumen_pilar:", r.data.resumen_pilar);
console.log("\npreguntas_pendientes:", r.data.preguntas_pendientes.map((q) => q.texto));

const abrazoFuerte = h.some((x) => /abraz/i.test(x.titulo + (x.causa_raiz ?? "")) && x.preserva && x.impacto === "alto" && !x.informacion_insuficiente);
const abrazoHipotesis = h.some((x) => /abraz|diferencial/i.test(x.titulo + (x.causa_raiz ?? "")) && (x.informacion_insuficiente || x.impacto === "bajo" || !x.preserva)) || r.data.preguntas_pendientes.some((q) => /abraz|diferencial|testimoni/i.test(q.texto));
const resumenProfundo = (r.data.resumen_pilar ?? "").length > 120 && !/requiere atenci[oó]n\.?$/i.test(r.data.resumen_pilar ?? "");
console.log("\n" + (abrazoFuerte ? "FAIL: abrazos salió como fortaleza alta sin evidencia de cliente" : "PASS: abrazos NO es fortaleza alta"));
console.log(abrazoHipotesis ? "PASS: el diferencial quedó como hipótesis o generó pregunta de validación" : "REVISAR: no se trató el diferencial declarado");
console.log(resumenProfundo ? "PASS: resumen con lectura de consultor" : "REVISAR: resumen superficial");

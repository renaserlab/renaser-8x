/**
 * Regresión capa 3: el SISTEMATIZADOR trabaja un organigrama declarado (empresa de 5 personas).
 * Verifica: propuesta anclada en los nombres reales, cambios con porqué citando estándar/hallazgo,
 * proporcionalidad (nada de comités/jefaturas para 5 personas), máximo 6 cambios.
 */
import { ai } from "../../src/lib/ai";
import { PROMPT_SISTEMATIZADOR } from "../../src/lib/jobs/handlers/activos";
import { SalidaSistematizador } from "../../src/lib/schemas";
import { ESTANDARES } from "../../src/lib/rules/estandares";

const contexto = [
  "DOCUMENTO A TRABAJAR: Cómo está organizado el equipo",
  "EMPRESA: Jardín Prueba · terapias holísticas para mujeres · 5 personas · etapa: temprana",
  `DOCUMENTO DECLARADO (confirmado por el dueño — la base):
## Cómo está organizado el equipo
- Kelin (dueña): dirige, da las terapias principales, maneja las redes y aprueba todos los gastos.
- Marta: caja, agenda de citas y responde el WhatsApp.
- Luis: reparte volantes y ayuda en lo que haga falta.
- Rosa (terapeuta): da terapias de apoyo.
- Sofía (practicante): asiste en talleres.
Todos hacen de todo un poco cuando hay apuro.`,
  `ESTANDARES DEL PILAR (la vara):\n${ESTANDARES.personas.map((e) => "- " + e).join("\n")}`,
  `HALLAZGOS DEL DIAGNOSTICO (3):
- [alto · personas] 7 de cada 10 decisiones del día pasan por la dueña: aprueba gastos, responde dudas y define excepciones sin límites delegados.
- [alto · producto] 80% de abandono antes de completar las 8 sesiones: no existe seguimiento de progreso ni contacto cuando una paciente falta.
- [medio · personas] El criterio de Rosa para detectar crisis antes de la sesión no está documentado ni enseñado a nadie.`,
  `LA CALETA (1):
- Rosa: cuando llegan sin mirar a los ojos y con las manos ocupadas, la sesión debe empezar distinto.`,
].join("\n\n");

const r = await ai().complete({ system: PROMPT_SISTEMATIZADOR, user: contexto, schema: SalidaSistematizador, priority: "interactive", maxTokens: 4000, agente: "sistematizador" });
const d = r.data;
console.log("PROPUESTA:\n" + (d.propuesta ?? "(null)"));
console.log("\nCAMBIOS (" + d.cambios.length + "):");
for (const c of d.cambios) console.log(`- ${c.cambio}\n  por qué: ${c.por_que}`);
console.log("\nNOTA:", d.nota ?? "(ninguna)");

const texto = (d.propuesta ?? "") + JSON.stringify(d.cambios);
const conNombres = /Marta/.test(d.propuesta ?? "") && /Rosa/.test(d.propuesta ?? "");
const anclados = d.cambios.every((c) => /(diagn[oó]stico|est[aá]ndar|hallazgo|7 de|80%|decisiones|abandono|criterio|documentad|autoridad|delegad|caleta)/i.test(c.por_que));
const proporcional = !/comit[eé]|gerencia de|jefatura|directorio|departamento de/i.test(texto);
console.log("\n" + (d.propuesta ? "PASS: hay propuesta" : "FAIL: sin propuesta"));
console.log(conNombres ? "PASS: conserva los nombres reales" : "FAIL: perdió los nombres");
console.log(anclados ? "PASS: todos los cambios anclados en estándar o hallazgo" : "FAIL: hay cambios sin ancla");
console.log(proporcional ? "PASS: proporcional (sin comités ni jefaturas)" : "FAIL: burocracia para 5 personas");
console.log(d.cambios.length <= 6 ? "PASS: máximo 6 cambios" : "FAIL: demasiados cambios");

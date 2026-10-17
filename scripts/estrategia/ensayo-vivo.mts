/**
 * EL ENSAYO VIVO DE LA ESTRATEGIA (spec-estrategia-8x.md §9.4 y §11, tramo 8). FUERA DE LA SUITE: llama al modelo real.
 *
 *   node --env-file=.env.local --import=tsx scripts/estrategia/ensayo-vivo.mts --gastar [--empresa=frutas|dental] [--salida=<carpeta>]
 *
 * Arma el paquete DESDE LA EMPRESA FICTICIA de tests/fixtures/estrategia-falsa.ts (sin base), corre el motor entero con el
 * proveedor real —tres llamadas largas, cuatro si hace falta la reparación— y escribe en la consola: el tiempo, los
 * tokens de entrada y de salida y por qué terminó cada llamada; las etapas que pasaron de 90 s o salieron cortadas
 * (entonces se recortan los topes del esquema, §5.1, antes de seguir: no se sube el plazo); la lista de control; lo que
 * 8X quitó; las preguntas que saldrían para el dueño; y lo que hay que anotar en los contratos.
 *
 * GASTA CUOTA. Con el plan gratuito, un ensayo es una sexta parte del día del modelo de respaldo; por eso no corre sin
 * `--gastar`. Sin llave del proveedor sale con código 2 (BLOCKED_EXTERNAL), sin llamar a nada.
 *
 * NO ESCRIBE EN NINGUNA BASE: no lee la empresa, no guarda la versión, no anota tokens (src/lib/estrategia/ensayo.ts no
 * toca Supabase; y desde scripts/ el candado de src/lib/entorno.ts no deja escribir en producción).
 *
 * Con `--salida=<carpeta>` guarda el informe y la estrategia completa en JSON para leerla contra la vara de Kelin (las
 * estrategias hechas a mano, que se quedan en su computadora). La carpeta tiene que estar FUERA del repositorio
 * versionado o dentro de clientes/ (que git ignora): lo que escribe el modelo no se publica.
 *
 * Los contratos pasan a `medido: true` (src/lib/agentes/contratos.ts) y TOKENS_POR_ESTRATEGIA (src/lib/estrategia/
 * motor.ts) se ajusta SOLO con lo que este ensayo midió, a mano y después de leerlo: este script no cambia ningún archivo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensayarEstrategia, LIMITE_ETAPA_MS, type InformeEnsayo } from "../../src/lib/estrategia/ensayo";
import { entradasDental, entradasFrutas } from "../../tests/fixtures/estrategia-falsa";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argumento = (nombre: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? null;

const conLlave = process.env.AI_PROVIDER === "gemini" ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
if (!conLlave) {
  console.error("BLOCKED_EXTERNAL: falta la llave del proveedor (AI_PROVIDER=gemini con GEMINI_API_KEY, o ANTHROPIC_API_KEY).");
  process.exit(2);
}
if (!process.argv.includes("--gastar")) {
  console.error("Este ensayo llama al modelo real: tres consultas, cuatro si hace falta la reparación. Para correrlo, agrega --gastar.");
  process.exit(1);
}

const empresa = argumento("empresa") ?? "frutas";
if (empresa !== "frutas" && empresa !== "dental") {
  console.error(`Empresa desconocida: ${empresa}. Las ficticias son «frutas» (con datos) y «dental» (casi sin datos).`);
  process.exit(1);
}

const salida = argumento("salida");
if (salida) {
  const destino = path.resolve(salida);
  const relativo = path.relative(RAIZ, destino);
  const dentroDelRepo = !relativo.startsWith("..") && !path.isAbsolute(relativo);
  if (dentroDelRepo && relativo.split(path.sep)[0] !== "clientes") {
    console.error(`La carpeta ${destino} está dentro del repositorio versionado. Usa una de fuera, o una dentro de clientes/ (git la ignora).`);
    process.exit(1);
  }
}

const hoy = new Date();
const entradas = empresa === "frutas" ? entradasFrutas() : entradasDental();
console.log(`Ensayo vivo de la estrategia · empresa ficticia «${empresa}» · ${hoy.toISOString()} · proveedor ${process.env.AI_PROVIDER ?? "anthropic"}`);

const t0 = Date.now();
const informe: InformeEnsayo = await ensayarEstrategia(entradas, hoy);
const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const miles = (n: number | null) => (n == null ? "sin dato" : n.toLocaleString("es-PE"));

if (informe.estado === "sin_generar") {
  console.log("\nNo alcanza el mínimo para generar; no se llamó al modelo. Falta:");
  for (const f of informe.falta_para_generar) console.log(`  - ${f}`);
  process.exit(0);
}

console.log("\nLLAMADAS");
for (const l of informe.llamadas) {
  console.log(
    `  ${l.etapa.padEnd(10)} ${l.agente.padEnd(13)} ${segundos(l.ms).padStart(8)} · entrada ${miles(l.tokens_entrada)} · salida ${miles(l.tokens_salida)} (presupuesto ${miles(l.presupuesto)}; en Gemini la salida cuenta también el razonamiento)` +
      ` · fin ${l.fin ?? "sin dato"} · modelo ${l.modelo ?? "sin dato"} · intentos ${l.intentos ?? "sin dato"}${l.ok ? "" : ` · NO SALIÓ: ${l.motivo}`}`
  );
}
console.log(`  Total: ${miles(informe.tokens.total)} tokens (entrada ${miles(informe.tokens.entrada)}, salida ${miles(informe.tokens.salida)}); TOKENS_POR_ESTRATEGIA hoy dice ${miles(informe.tokens.previsto)}. En total: ${segundos(Date.now() - t0)}.`);

if (informe.lentas.length) console.log(`\nAVISO: ${informe.lentas.join(", ")} pasó de ${LIMITE_ETAPA_MS / 1000} s. Recorta los topes del esquema (§5.1) antes de seguir; no subas el plazo.`);
if (informe.cortadas.length) console.log(`\nAVISO: ${informe.cortadas.join(", ")} salió cortada por tamaño. El esquema no cabe en su presupuesto: recorta sus topes (§5.1).`);

if (informe.fallo) {
  console.log(`\nLa estrategia no se completó: ${informe.fallo.etapa} no salió (${informe.fallo.motivo}).`);
} else {
  console.log(`\nESTADO: ${informe.estado} · el validador dejó ${informe.validador?.errores ?? 0} errores y ${informe.validador?.avisos ?? 0} avisos.`);
  const l = informe.para_leer;
  if (l) {
    console.log("\nPARA LEER CONTRA LA VARA (con las cifras escritas, como lo vería la consultora)");
    console.log("  La lectura:");
    for (const x of l.lectura) console.log(`    - ${x}`);
    console.log(`  La gran apuesta: ${l.gran_apuesta}`);
    for (const c of l.caminos) {
      console.log(`\n  Camino ${c.letra.toUpperCase()} · ${c.nombre} — ${c.filosofia}`);
      console.log(`    A 90 días: ${c.a_90_dias}`);
      for (const j of c.jugadas) console.log(`    ${j}`);
      for (const k of c.casos) console.log(`    ${k}`);
    }
    console.log(`\n  Recomendado: ${l.recomendado}`);
    console.log("  Victorias de los primeros 14 días:");
    for (const v of l.victorias) console.log(`    - ${v}`);
  }
  console.log("\nLISTA DE CONTROL (el veredicto es del código)");
  for (const c of informe.control) console.log(`  ${c.cumple ? "cumple   " : "NO CUMPLE"} ${c.nombre}${c.cumple || !c.detalle.length ? "" : ` — ${c.detalle.join("; ")}`}`);
  console.log(`\nLO QUE 8X QUITÓ (${informe.quitado.length})`);
  for (const q of informe.quitado) console.log(`  - ${q.puntero}: ${q.motivo}`);
  console.log(`\nPREGUNTAS QUE SALDRÍAN PARA EL DUEÑO (${informe.preguntas.length})`);
  for (const p of informe.preguntas) console.log(`  - ${p}`);
  for (const s of informe.secciones) console.log(`  - (en su pantalla) ${s}`);
}

console.log("\nPARA LOS CONTRATOS (a mano, después de leer esto; ningún archivo se cambia solo)");
for (const agente of ["lente_dinero", "lente_terreno", "equipo_rojo"] as const) {
  const suyas = informe.llamadas.filter((l) => l.agente === agente && l.ok);
  const maximo = suyas.length ? Math.max(...suyas.map((l) => l.tokens_salida ?? 0)) : null;
  console.log(`  ${agente}: salida medida ${miles(maximo)} en ${suyas.length} llamada(s) que salieron; presupuesto ${miles(suyas[0]?.presupuesto ?? null)}.`);
}

if (salida) {
  mkdirSync(salida, { recursive: true });
  const archivo = path.join(salida, `ensayo-vivo-${empresa}-${hoy.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
  writeFileSync(archivo, JSON.stringify(informe, null, 2));
  console.log(`\nInforme completo, con la estrategia: ${archivo}`);
}

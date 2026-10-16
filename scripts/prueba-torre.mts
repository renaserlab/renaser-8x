/**
 * La torre contra datos reales, con las cuatro unidades separadas.
 * Uso: node --env-file=.env.local --import=tsx scripts/prueba-torre.mts
 */
import { agentesEnTorre, ejecuciones, ejecucion, totales } from "../src/lib/torre";

const t = await totales();
console.log("UNIDADES, CADA UNA CONTADA APARTE (no una por otra):");
console.log(`  TRABAJOS            ${String(t.trabajos).padStart(6)}  · ${t.trabajosHechos} hechos · ${t.trabajosFallidos} fallidos · ${t.trabajosEnCurso} en curso`);
console.log(`  REINTENTOS          ${String(t.reintentos).padStart(6)}  · en ${t.trabajosConReintento} trabajos distintos`);
console.log(`  LLAMADAS AL MODELO  ${String(t.llamadasModelo).padStart(6)}  · ${t.llamadasConError} con error`);
console.log(`  CON REGISTRO RECUPERABLE ${String(t.agentesConRegistroRecuperable).padStart(2)} de ${t.agentesConContrato} — NO es "han corrido": lo borrado con las empresas no se cuenta`);
console.log(`\nCOBERTURA: ${t.cobertura.desde?.slice(0, 10)} → ${t.cobertura.hasta?.slice(0, 10)}`);
console.log(`  método: ${t.cobertura.metodo}`);
console.log(`  topes: ${t.cobertura.topes.length ? t.cobertura.topes.join(" · ") : "ninguno"}`);

const { agentes, noSonAgentes } = await agentesEnTorre();
console.log("\nCONFIGURADO vs EJECUTADO:");
for (const a of agentes) {
  const r = a.real;
  console.log(
    `  ${a.contrato.clave.padEnd(15)} v${a.contrato.version} · presup ${String(a.contrato.presupuesto_tokens).padStart(5)} · ` +
      (r === null
        ? (a.huella ? `sin registro recuperable, pero la huella dice ${a.huella.llamadas} llamadas` : "sin ejecuciones conocidas")
        : `${String(r.llamadasModelo).padStart(4)} llamadas en ${String(r.trabajosDistintos).padStart(3)} trabajos · ${r.llamadasConError} con error · ${String(r.latenciaMediaMs ?? 0).padStart(6)} ms medios (máx ${r.latenciaMaxMs}) · ${r.modelos.join(",")}`)
  );
}

if (noSonAgentes.length) {
  console.log("\nEN LA COLUMNA `agente` PERO NO SON AGENTES (se muestran aparte, no se cuelan):");
  for (const x of noSonAgentes) console.log(`  ${x.etiqueta.padEnd(24)} ${String(x.llamadas).padStart(4)} llamadas · ${x.esFalloDeTrabajo ? "fallo del trabajo (con prefijo)" : "DATO SUCIO: sin prefijo y sin contrato"}`);
}

const { filas, cobertura } = await ejecuciones(6);
console.log(`\nÚLTIMOS ${filas.length} TRABAJOS (${cobertura.topes.join(" · ")}):`);
for (const e of filas) {
  console.log(
    `  ${e.estado.padEnd(9)} ${e.tipo.padEnd(22)} ${(e.empresa ?? "—").slice(0, 24).padEnd(26)} ` +
      `${e.llamadasModelo} llamadas · ${e.reintentos} reintentos · ${e.agentes.join(",") || "(ningún agente)"} · ${e.duracionSeg ?? "?"}s`
  );
}

const conIA = filas.find((e) => e.agentes.length > 0) ?? filas[0];
if (conIA) {
  const d = await ejecucion(conIA.jobId);
  console.log(`\nINSPECTOR (${conIA.jobId.slice(0, 8)}): ${d!.resumen.tipo} / ${d!.resumen.empresa}`);
  for (const l of d!.llamadas) {
    console.log(`  ${(l.agente ?? "—").padEnd(22)} ${l.esAgenteConContrato ? "con contrato" : "SIN CONTRATO"} · salida ${l.tokensSalida}/${l.contrato?.presupuesto_tokens ?? "?"} tok · ${l.latenciaMs} ms${l.error ? ` · ERROR` : ""}`);
  }
  console.log(`  no registrado: ${d!.noRegistrado.length} puntos`);
}

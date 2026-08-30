/**
 * EL CICLO COMPLETO, contra la base real: números → línea base → mejora → corte → veredicto.
 * Crea su propia empresa de prueba y la borra al terminar, pase lo que pase.
 *
 * node --env-file=.env.local --import=tsx scripts/prueba-medicion.mts
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { comparar, veredicto, valoresActuales, derivadosActuales, type Medicion } from "../src/lib/medicion";
import { radiografia, type Metrica } from "../src/lib/metricas";

const sb = supabaseAdmin();
let companyId = "";
let fallos = 0;

const paso = (ok: boolean, texto: string, detalle = "") => {
  if (!ok) fallos++;
  console.log(`${ok ? "PASS" : "FALLA"} · ${texto}${detalle ? ` — ${detalle}` : ""}`);
};

async function metricas(): Promise<Metrica[]> {
  const { data } = await sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(300);
  return (data ?? []) as Metrica[];
}

async function congelar(tipo: "linea_base" | "corte", nota: string): Promise<Medicion> {
  const ms = await metricas();
  const { data, error } = await sb.rpc("congelar_medicion", {
    p_company: companyId, p_tipo: tipo, p_valores: valoresActuales(ms),
    p_derivados: derivadosActuales(ms), p_nota: nota, p_por: null,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as Medicion;
}

async function poner(filas: [string, number, string?][]) {
  for (const [clave, valor, periodo] of filas) {
    const p = periodo ?? "actual";
    const { data: prev } = await sb.from("company_metricas").select("id").eq("company_id", companyId).eq("clave", clave).eq("periodo", p).maybeSingle();
    const fila = { company_id: companyId, clave, periodo: p, valor, estado: "contado", updated_at: new Date().toISOString() };
    if (prev) await sb.from("company_metricas").update(fila).eq("id", prev.id);
    else await sb.from("company_metricas").insert(fila);
  }
}

try {
  const { data: emp, error } = await sb.from("companies").insert({ nombre: "PRUEBA MEDICION (borrar)", sector: "prueba", etapa: "levantamiento" }).select("id").single();
  if (error || !emp) throw new Error(error?.message ?? "no se pudo crear la empresa de prueba");
  companyId = emp.id;
  console.log(`\n═════ CICLO DE MEDICIÓN · empresa de prueba ${companyId.slice(0, 8)} ═════\n`);

  // 1. El negocio en mayo: vende 40 mil, le quedan 4 mil, debe 20 mil.
  await poner([["venta_mes", 40000, "2026-05"], ["ganancia_mes", 4000, "2026-05"], ["gasto_fijo_mes", 12000, "2026-05"],
               ["caja_hoy", 8000], ["precio_producto_estrella", 25], ["costo_producto_estrella", 15], ["deuda_propia", 20000]]);
  const r1 = radiografia(await metricas());
  paso(r1.listos === 7, "la radiografía cuenta los números puestos", `${r1.listos}/9`);

  // 2. Se fija el punto de partida.
  const base = await congelar("linea_base", "punto de partida de la prueba");
  paso(base.tipo === "linea_base" && base.numero === 0, "queda fijado el punto de partida");
  paso(Number(base.valores.venta_mes) === 40000, "congela la venta del mes correcto", String(base.valores.venta_mes));
  paso(Math.round(Number(base.derivados.margen)) === 10, "congela el margen calculado", `${base.derivados.margen}%`);

  // 3. Pasan tres meses de trabajo: vende más, le queda más, baja la deuda… y sube el gasto fijo.
  await poner([["venta_mes", 52000, "2026-08"], ["ganancia_mes", 7800, "2026-08"], ["gasto_fijo_mes", 15000, "2026-08"], ["deuda_propia", 11000]]);
  const corte = await congelar("corte", "primer corte de la prueba");
  paso(corte.numero === 1, "el corte se numera solo", `corte ${corte.numero}`);
  paso(Number(corte.valores.venta_mes) === 52000, "el corte toma el mes más reciente, no el de la base", String(corte.valores.venta_mes));

  // 4. El veredicto.
  const movs = comparar(base, corte);
  const v = veredicto(base, corte, movs);
  console.log(`\n  → ${v.titular}\n`);
  for (const m of movs) console.log(`    ${m.mejoro === true ? "+" : m.mejoro === false ? "-" : "·"} ${m.vital.nombre}: ${m.frase}`);
  console.log("");

  paso(v.gananciaDelta === 3800, "calcula cuánto más deja el negocio al mes", `S/${v.gananciaDelta}`);
  paso(v.titular.includes("3,800") && v.titular.includes("más al mes"), "el titular habla en soles");
  paso(movs.find((m) => m.vital.clave === "deuda_propia")?.mejoro === true, "bajar la deuda cuenta como mejora");
  paso(movs.find((m) => m.vital.clave === "gasto_fijo_mes")?.mejoro === false, "subir el gasto fijo cuenta como empeorar");
  paso(movs[0]?.mejoro === false, "lo que empeoró aparece primero", movs[0]?.vital.nombre);
  paso(!movs.some((m) => m.vital.clave === "conversion_de_cada_10"), "un número nunca medido no aparece como retroceso");
  paso(movs.find((m) => m.vital.clave === "caja_hoy")?.frase.includes("Sigue igual") === true, "lo que no cambió se dice sin inventar movimiento");
  paso(v.mejoraron === 3 && v.empeoraron === 1, "cuenta bien lo que mejoró y lo que empeoró", `${v.mejoraron} mejoraron, ${v.empeoraron} empeoraron`);
  paso(movs.every((m) => !m.frase.includes("_")), "ninguna frase le muestra al dueño el nombre técnico");

  // 5. Un segundo corte no pisa al primero, y la base sigue siendo una sola.
  await poner([["venta_mes", 55000, "2026-09"]]);
  const corte2 = await congelar("corte", "segundo corte");
  paso(corte2.numero === 2, "el segundo corte se numera después del primero", `corte ${corte2.numero}`);
  const { count: bases } = await sb.from("mediciones").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("tipo", "linea_base");
  paso(bases === 1, "sigue habiendo una sola línea base", String(bases));

  console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLO(S)`} · ciclo de medición\n`);
} finally {
  if (companyId) {
    await sb.from("companies").delete().eq("id", companyId);
    console.log("Empresa de prueba borrada.");
  }
}
process.exit(fallos === 0 ? 0 : 1);

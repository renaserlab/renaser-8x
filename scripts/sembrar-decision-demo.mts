/**
 * Siembra UNA decisión de demostración con datos sintéticos, sobre una empresa de demostración
 * propia. No toca ninguna empresa real. Para borrarla: --borrar
 * Uso: node --env-file=.env.local --import=tsx scripts/sembrar-decision-demo.mts [--borrar]
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";

const sb = supabaseAdmin();
const NOMBRE = "DEMOSTRACIÓN 8X (datos sintéticos)";

const { data: existente } = await sb.from("companies").select("id").eq("nombre", NOMBRE).maybeSingle();

if (process.argv.includes("--borrar")) {
  if (existente) {
    await sb.from("decisiones").delete().eq("company_id", existente.id);
    await sb.from("companies").delete().eq("id", existente.id);
    console.log("Empresa de demostración borrada.");
  } else console.log("No había nada que borrar.");
  process.exit(0);
}

let cid = existente?.id as string | undefined;
if (!cid) {
  const { data } = await sb.from("companies").insert({ nombre: NOMBRE, sector: "demostración" }).select("id").single();
  cid = data!.id;
}

const { count } = await sb.from("decisiones").select("id", { count: "exact", head: true }).eq("company_id", cid);
if ((count ?? 0) > 0) {
  console.log(`Ya hay ${count} decisiones en la empresa de demostración: no se pisa nada.`);
  process.exit(0);
}

await sb.from("decisiones").insert([
  {
    company_id: cid,
    titulo: "Quién custodia el efectivo de la caja principal",
    por_que_ahora: "La misma persona cuenta y autoriza: cualquier descuadre queda sin un segundo par de ojos.",
    evidencia: [
      { tipo: "hallazgo", id: null, texto: "El proceso de cierre no tiene segundo revisor: el nodo «cuadre» no declara responsable distinto del que custodia." },
      { tipo: "afirmacion", id: null, texto: "La supervisora declara que autoriza el tipo de cambio preferencial y entrega el efectivo a las cajas." },
    ],
    faltantes: ["Cuántos descuadres hubo el último trimestre y de qué monto."],
    supuestos: ["Que el volumen de caja justifica separar funciones entre dos personas."],
    alternativas: [
      { clave: "a", titulo: "Separar custodia y autorización entre dos puestos que ya existen", que_implica: "Reasignar responsabilidades, sin contratar a nadie.", impacto: "alto", costo: "ninguno", velocidad: "1 semana", riesgo: "bajo", reversibilidad: "total" },
      { clave: "b", titulo: "Crear un puesto de control de caja", que_implica: "Un sueldo más en la planilla.", impacto: "alto", costo: "S/ 1,800 al mes", velocidad: "1 mes", riesgo: "medio", reversibilidad: "costosa" },
    ],
    recomendacion: "a",
    recomendacion_por_que: "Se resuelve con la gente que ya está. Contratar antes de agotar la capacidad actual es agregar costo fijo a un problema de diseño.",
    impacto_esperado: "Ningún descuadre queda sin un segundo par de ojos el mismo día.",
    riesgos: ["Si la persona designada falta, el control se cae salvo que haya suplente nombrado."],
    confianza: "media",
    confianza_por_que: "Falta el dato de descuadres del trimestre: sin él no se puede dimensionar el problema.",
    que_pasa_si_se_aprueba: "Se cambia el proceso de cierre, se nombra al segundo revisor y se actualiza el manual de funciones.",
    origen: "agente",
    agente: "organizador",
    agente_version: "1.1",
  },
  {
    // A propósito INCOMPLETA: para que se vea que el sistema avisa antes de pedir aprobación.
    company_id: cid,
    titulo: "Contratar a alguien de cobranzas",
    por_que_ahora: "Se acumulan facturas sin cobrar.",
    evidencia: [],
    alternativas: [],
    origen: "agente",
    agente: "planificador",
    agente_version: "1.0",
  },
]);

console.log(`Sembradas 2 decisiones de demostración en «${NOMBRE}».`);
console.log("Una completa y una incompleta a propósito. Para borrarlas: --borrar");

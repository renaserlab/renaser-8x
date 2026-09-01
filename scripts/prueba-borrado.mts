/**
 * ¿SE PUEDE BORRAR UNA EMPRESA TRABAJADA? Reproduce el bloqueo que vio Kelin al eliminar Jardín
 * Renaser —«violates foreign key constraint interview_responses_origen_claim_id_fkey»— creando una
 * empresa con TODAS las referencias que bloquean, y comprueba que ahora sí se borra.
 *
 * Crea y borra lo suyo; no toca ninguna empresa real.
 *   node --env-file=.env.local --import=tsx scripts/prueba-borrado.mts
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { prepararBorradoEmpresa } from "../src/lib/borrar-empresa";

const sb = supabaseAdmin();
let companyId = "";
let fallos = 0;
const paso = (ok: boolean, texto: string, extra = "") => {
  if (!ok) fallos++;
  console.log(`${ok ? "PASS " : "FALLA"} · ${texto}${extra ? ` — ${extra}` : ""}`);
};

try {
  const { data: emp } = await sb.from("companies").insert({ nombre: "BORRADO-PRUEBA", sector: "x", etapa: "diagnostico" }).select("id").single();
  companyId = emp!.id;
  console.log(`\n═════ EMPRESA DE PRUEBA ${companyId.slice(0, 8)} con las referencias que bloqueaban ═════\n`);

  const { data: fuente } = await sb.from("sources").insert({ company_id: companyId, tipo: "observacion", nombre: "f", contenido: "c", origen: "consultor", estado: "leido" }).select("id").single();
  const { data: c1 } = await sb.from("claims").insert({ company_id: companyId, source_id: fuente!.id, texto: "uno", pilar: "procesos", tipo: "proceso", temporalidad: "actual", estado: "confirmado" }).select("id").single();
  // Una definición que CONTRADICE a otra (referencia sin cascade).
  const { data: c2 } = await sb.from("claims").insert({ company_id: companyId, source_id: fuente!.id, texto: "dos", pilar: "procesos", tipo: "proceso", temporalidad: "actual", estado: "contradicho", contradice_a: c1!.id }).select("id").single();
  const { data: part } = await sb.from("participants").insert({ company_id: companyId, nombre: "Dueño", rol: "dueno" }).select("id").single();
  const { data: ses } = await sb.from("interview_sessions").insert({ company_id: companyId, participant_id: part!.id, tipo: "empresa_dueno" }).select("id").single();
  // LA QUE BLOQUEABA: respuesta de entrevista nacida de una definición.
  await sb.from("interview_responses").insert({ session_id: ses!.id, orden: 1, pregunta: "p", respuesta: "r", origen_claim_id: c1!.id });
  const { data: hall } = await sb.from("findings").insert({ company_id: companyId, pilar: "procesos", titulo: "h", impacto: "medio", veredicto: "improve", origen: "ia", estado_revision: "aprobado" }).select("id").single();
  await sb.from("finding_evidence").insert({ finding_id: hall!.id, claim_id: c2!.id, relacion: "sustenta" });
  await sb.from("actions").insert({ company_id: companyId, finding_id: hall!.id, accion: "a", prioridad: 1, fase: "implementacion" });
  await sb.from("corrections").insert({ finding_id: hall!.id, accion: "aprobado", comentario: "x" });
  await sb.from("company_assets").insert({ company_id: companyId, bloque: "procesos", clave: "procesos.x", estado: "contado", source_id: fuente!.id });
  const { data: p1 } = await sb.from("processes").insert({ company_id: companyId, nombre: "AS-IS", version: "as_is", origen: "dibujado" }).select("id").single();
  await sb.from("processes").insert({ company_id: companyId, nombre: "TO-BE", version: "to_be", origen: "generado_ia", padre_id: p1!.id });
  console.log("  Creada con: definición que contradice a otra, respuesta nacida de definición,\n  evidencia, acción y corrección sobre un hallazgo, documento con fuente y TO-BE con padre.\n");

  // Antes esto fallaba con «violates foreign key constraint interview_responses_origen_claim_id_fkey».
  // Desde la migración del 30-08-2026 la base ya resuelve sola las diez referencias que bloqueaban,
  // así que un borrado directo tiene que funcionar. Si esto vuelve a fallar, alguien deshizo la
  // migración y el problema de Kelin está de vuelta.
  const { error: directo } = await sb.from("companies").delete().eq("id", companyId);
  paso(!directo, "la base borra una empresa trabajada sin ayuda de nadie", directo ? directo.message.slice(0, 100) : "");
  if (directo) {
    // Red de seguridad: si la base volviera a bloquear, el saneamiento por código debe salvarlo.
    await prepararBorradoEmpresa(companyId);
    const { error: conSanear } = await sb.from("companies").delete().eq("id", companyId);
    paso(!conSanear, "y si algún día vuelve a bloquear, el saneamiento por código lo resuelve", conSanear ? conSanear.message.slice(0, 90) : "");
  }

  const { count } = await sb.from("companies").select("id", { count: "exact", head: true }).eq("id", companyId);
  paso(count === 0, "no queda la empresa en la base", `quedan ${count}`);
  const { count: huerfanas } = await sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  paso(huerfanas === 0, "no quedan definiciones huérfanas", `quedan ${huerfanas}`);
  if (count === 0) companyId = "";

  console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLO(S)`} · borrado de empresa trabajada\n`);
} finally {
  if (companyId) {
    await prepararBorradoEmpresa(companyId);
    await sb.from("companies").delete().eq("id", companyId);
    console.log("Empresa de prueba limpiada.");
  }
}
process.exit(fallos === 0 ? 0 : 1);

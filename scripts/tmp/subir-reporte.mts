/** Sube el reporte de verificación al apartado de documentos (fuentes) de Jardín Renaser, como documento del consultor. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id").ilike("nombre", "%Jard%Renaser%").single();
const contenido = readFileSync("docs/reporte-verificacion-2026-08-26.md", "utf8");
const { error } = await sb.from("sources").insert({
  company_id: c!.id,
  nombre: "Reporte de verificación técnica 8X — 26 ago 2026",
  tipo: "documento",
  origen: "consultor",
  fecha_origen: "2026-08-26",
  contenido,
  estado: "subido",
});
console.log(error ? `ERROR: ${error.message}` : "reporte subido al apartado de documentos de Jardín Renaser");

/** CENTINELA: vigila la cola en vivo. Solo habla cuando hay problema (fallido nuevo, pendiente viejo, atascado). */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const vistos = new Set<string>();
const inicio = new Date(Date.now() - 5 * 60_000).toISOString();
for (;;) {
  try {
    const { data: malos } = await sb
      .from("jobs")
      .select("id,tipo,estado,error,created_at,company_id, companies(nombre)")
      .or("estado.eq.fallido,estado.eq.pendiente,estado.eq.corriendo")
      .gte("created_at", inicio)
      .order("created_at", { ascending: false })
      .limit(20);
    const ahora = Date.now();
    for (const j of malos ?? []) {
      const edad = Math.round((ahora - new Date(j.created_at).getTime()) / 1000);
      const clave = `${j.id}-${j.estado}`;
      if (vistos.has(clave)) continue;
      const emp = (j.companies as unknown as { nombre?: string })?.nombre ?? j.company_id.slice(0, 8);
      if (j.estado === "fallido") {
        vistos.add(clave);
        console.log(`FALLIDO · ${emp} · ${j.tipo} · ${String(j.error).slice(0, 140).replace(/\n/g, " ")}`);
      } else if (j.estado === "pendiente" && edad > 90) {
        vistos.add(clave);
        console.log(`ATASCADO pendiente ${edad}s · ${emp} · ${j.tipo} (el worker no lo toma)`);
      } else if (j.estado === "corriendo" && edad > 300) {
        vistos.add(clave);
        console.log(`LENTO corriendo ${edad}s · ${emp} · ${j.tipo}`);
      }
    }
  } catch (e) {
    console.log(`centinela sin conexión: ${String((e as Error).message).slice(0, 80)}`);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}

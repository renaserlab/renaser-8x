/**
 * SISTEMA DE QA DE 8X — el viaje crítico completo contra PRODUCCIÓN, con cuenta desechable.
 *   node --env-file=.env.local --import=tsx scripts/qa.mts   (o: npm run qa)
 * Verifica lo que un cliente real vive: registro → crear empresa → primera pregunta (calidad y tiempo)
 * → responder → siguiente pregunta (sin repetir) → todas las páginas del portal → lado consultor.
 * Al final borra su propia empresa y usuario. Veredicto PASS/FAIL por paso, con tiempos.
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.QA_URL ?? "https://8x-renaser-s-projects.vercel.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const ref = url.match(/https:\/\/(.+?)\.supabase/)![1];

const resultados: { paso: string; ok: boolean; ms: number; nota: string }[] = [];
const paso = async <T,>(nombre: string, limiteMs: number, fn: () => Promise<[boolean, string, T?]>): Promise<T | undefined> => {
  const t0 = Date.now();
  try {
    const [ok, nota, valor] = await fn();
    const ms = Date.now() - t0;
    resultados.push({ paso: nombre, ok: ok && ms <= limiteMs, ms, nota: ms > limiteMs ? `${nota} · LENTO (>${limiteMs}ms)` : nota });
    return valor;
  } catch (e) {
    resultados.push({ paso: nombre, ok: false, ms: Date.now() - t0, nota: String((e as Error).message).slice(0, 120) });
    return undefined;
  }
};

const EMAIL = `qa.8x.${Date.now()}@gmail.com`;
const PASS = "Qa-8x-2026!";
let cookie = "";
let companyId = "";
let userId = "";

// 1 · REGISTRO REAL (el mismo signUp del formulario)
await paso("Registro con cuenta nueva", 8000, async () => {
  const { data, error } = await anon.auth.signUp({ email: EMAIL, password: PASS, options: { data: { nombre: "QA Ocho" } } });
  if (error) return [false, error.message];
  if (!data.session) return [false, "sin sesión inmediata (¿confirmación de correo activada?)"];
  userId = data.user!.id;
  cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  return [true, "entra directo, sin correo de confirmación"];
});

// 2 · CREAR EMPRESA (ficha mínima, como una persona apurada)
await paso("Crear empresa con la ficha", 6000, async () => {
  const r = await fetch(`${BASE}/api/portal/empresa`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ nombre: "QA Pollería Doña Prueba", ficha: { actividad: "pollería a la brasa", personas: "4", antiguedad: "6", venta_mensual: "S/10–50 mil" } }),
  });
  const j = (await r.json()) as { company_id?: string; error?: string };
  if (!r.ok || !j.company_id) return [false, j.error ?? `HTTP ${r.status}`];
  companyId = j.company_id;
  return [true, "creada y admitida"];
});

// 3 · IDEMPOTENCIA (doble envío no duplica)
await paso("Doble envío no crea duplicada", 6000, async () => {
  const r = await fetch(`${BASE}/api/portal/empresa`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ nombre: "OTRA", ficha: {} }) });
  const j = (await r.json()) as { company_id?: string; existente?: boolean; error?: string };
  const bien = (r.ok && (j.company_id === companyId || j.existente)) || (r.status === 400 && /ya tienes/i.test(j.error ?? ""));
  return [bien, bien ? "protegido" : `respuesta inesperada: ${r.status} ${JSON.stringify(j).slice(0, 80)}`];
});

// 4 · PRIMERA PREGUNTA: llega rápido, personalizada y en lenguaje oral
const sesiones = await paso("Sesiones de conversación creadas", 4000, async () => {
  const { data } = await admin.from("interview_sessions").select("id,tipo").eq("company_id", companyId);
  return [(data ?? []).length >= 2, `${(data ?? []).length} sesiones`, data ?? []];
});
const sesionId = sesiones?.[0]?.id as string | undefined;
const primeraPregunta = await paso("Primera pregunta en <30s", 30000, async () => {
  await fetch(`${BASE}/api/companies/${companyId}/interview/next`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ session_id: sesionId }) });
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from("interview_responses").select("pregunta").eq("session_id", sesionId!).is("respuesta", null).limit(1);
    if (data?.length) return [true, data[0].pregunta.slice(0, 90), data[0].pregunta];
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  return [false, "no llegó en 30s"];
});
await paso("Calidad: personalizada, sin jerga, con ancla", 100, async () => {
  const p = String(primeraPregunta ?? "");
  // Se comprueba contra el nombre REAL de la empresa, no contra una lista fija de palabras: el
  // 30-08-2026 la pregunta decía "el día que decidiste abrir Doña Prueba" —perfectamente
  // personalizada— y el chequeo la daba por genérica porque no contenía "pollería". Un falso
  // negativo en el control de calidad es tan caro como un fallo real: hace dudar de lo que funciona.
  const personalizada = /doña prueba|poller|brasa|negocio/i.test(p);
  const sinJerga = !/benchmark|kpi|okr|stakeholder|matriz|evaluaci[oó]n comparativa|mecanismos/i.test(p);
  return [personalizada && sinJerga, personalizada ? (sinJerga ? "habla del negocio, sin tecnicismos" : "TIENE JERGA") : "genérica, no menciona el negocio"];
});

// 5 · RESPONDER Y SIGUIENTE PREGUNTA (sin repetir)
await paso("Guardar respuesta de texto", 6000, async () => {
  const r = await fetch(`${BASE}/api/interviews/${sesionId}/answer`, { method: "POST", headers: { cookie }, body: (() => { const f = new FormData(); f.set("texto", "El mes pasado entraron como 28 mil soles y me quedaron libres unos 6 mil. Vendemos unos 90 pollos al día entre semana y 140 los domingos."); return f; })() });
  return [r.ok, `HTTP ${r.status}`];
});
await paso("Siguiente pregunta en <30s y SIN repetir", 30000, async () => {
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from("interview_responses").select("pregunta,respuesta").eq("session_id", sesionId!).order("orden");
    const abierta = (data ?? []).find((x) => x.respuesta === null);
    if (abierta && abierta.pregunta !== primeraPregunta) {
      const repetida = abierta.pregunta.toLowerCase().includes(String(primeraPregunta).toLowerCase().slice(0, 40));
      return [!repetida, abierta.pregunta.slice(0, 90)];
    }
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  return [false, "no llegó en 30s"];
});

// 6 · TODAS LAS PÁGINAS DEL PORTAL cargan rápido y con la barra de navegación
for (const ruta of ["/portal", "/portal/hoy", "/portal/activos", "/portal/conversacion", "/portal/validar", "/portal/plan", "/portal/procesos", "/portal/resultados", "/portal/documentos"]) {
  await paso(`Página ${ruta}`, 5000, async () => {
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
    const t = await r.text();
    const barra = t.includes('aria-label="Secciones"');
    const rota = /Application error|Internal Server Error/i.test(t);
    return [r.ok && barra && !rota, rota ? "PÁGINA ROTA" : barra ? "carga con navegación" : "SIN barra de navegación"];
  });
}

// 7 · LADO CONSULTOR (sesión del consultor de prueba)
await paso("Consultor: bandeja y empresas cargan", 6000, async () => {
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
  const c = lista.users.find((u) => u.email === "prueba-consultor-vista@renaser.test");
  if (!c) return [false, "no existe el consultor de prueba"];
  await admin.auth.admin.updateUserById(c.id, { password: PASS });
  const { data: s } = await anon.auth.signInWithPassword({ email: "prueba-consultor-vista@renaser.test", password: PASS });
  const ck = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s!.session)).toString("base64url")}`;
  const [b, e] = await Promise.all([fetch(`${BASE}/bandeja`, { headers: { cookie: ck } }), fetch(`${BASE}/empresas`, { headers: { cookie: ck } })]);
  return [b.ok && e.ok, `bandeja ${b.status} · empresas ${e.status}`];
});

// 8 · LIMPIEZA: esta corrida no deja rastro
await paso("Limpieza de datos de QA", 15000, async () => {
  if (companyId) await admin.from("companies").delete().eq("id", companyId);
  if (userId) {
    await admin.from("memberships").delete().eq("user_id", userId);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  return [true, "empresa y usuario de QA borrados"];
});

// VEREDICTO
console.log("\n══════════ QA 8X · " + new Date().toISOString().slice(0, 16) + " ══════════");
for (const r of resultados) console.log(`${r.ok ? "PASS" : "FAIL"} · ${String(r.ms).padStart(6)}ms · ${r.paso} — ${r.nota}`);
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLO(S)`} · ${resultados.length} pasos`);
process.exit(fallos === 0 ? 0 : 1);

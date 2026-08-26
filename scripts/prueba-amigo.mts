/**
 * PRUEBA FINAL — EL AMIGO QUE RECIBE EL LINK (bloqueador 6).
 * Simula, contra la URL PÚBLICA y con la PC de Kelin apagada (ningún worker local: procesa el drenaje
 * de Vercel), a un empresario nuevo que: se registra → crea su empresa → conversa (con una respuesta
 * rica y una vaga) → sube sus datos → marca "no lo tengo" y construye un activo → cuenta un proceso →
 * completa la ficha → confirma su AS-IS → valida contradicciones → recibe MI EMPRESA HOY.
 * Empresa inventada nueva: "Café Warmi" — insight escondido: cree que necesita segunda sede;
 * los datos muestran tardes vacías y una Caleta concentrada en la barista.
 * Todo lo que hace el amigo va por las APIs públicas con SU sesión (cookie), como el navegador.
 *   node --env-file=.env.local --import=tsx scripts/prueba-amigo.mts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { empresaHoy } from "../src/lib/hoy";
const DIR = path.dirname(fileURLToPath(import.meta.url));

const URL_PUB = "https://8x-renaser-s-projects.vercel.app";
const REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const EMAIL = `amigo-${Date.now()}@example.test`;
const PASS = "Prueba-8x-Amigo-123";

function cookieDeSesion(session: { access_token: string; refresh_token: string }): string {
  const valor = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const nombre = `sb-${REF}-auth-token`;
  if (valor.length <= 3180) return `${nombre}=${valor}`;
  const partes: string[] = [];
  for (let i = 0; i * 3180 < valor.length; i++) partes.push(`${nombre}.${i}=${valor.slice(i * 3180, (i + 1) * 3180)}`);
  return partes.join("; ");
}

let COOKIE = "";
async function api(ruta: string, init: RequestInit = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${URL_PUB}${ruta}`, { ...init, headers: { ...(init.headers ?? {}), cookie: COOKIE } });
  let json: Record<string, unknown> = {};
  try { json = (await r.json()) as Record<string, unknown>; } catch { /* html */ }
  return { status: r.status, json };
}
async function pagina(ruta: string): Promise<number> {
  const r = await fetch(`${URL_PUB}${ruta}`, { headers: { cookie: COOKIE }, redirect: "manual" });
  return r.status;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function esperarCola(cid: string, etiqueta: string, maxMin = 30, tipos: string[] | null = null) {
  const t0 = Date.now();
  let quietas = 0;
  for (;;) {
    let q = admin.from("jobs").select("id,tipo,estado").eq("company_id", cid).in("estado", ["pendiente", "corriendo"]);
    if (tipos) q = q.in("tipo", tipos);
    const { data } = await q;
    if (!data?.length) { quietas++; if (quietas >= 3) return; } else quietas = 0;
    if (Date.now() - t0 > maxMin * 60_000) throw new Error(`${etiqueta}: la nube no procesó a tiempo: ${JSON.stringify(data?.slice(0, 4))}`);
    await esperar(5000);
  }
}

async function responderSesion(cid: string, sesionId: string, guiones: { detecta: RegExp; respuesta: string }[], maxTurnos = 8) {
  let respondidas = 0;
  for (let turno = 0; turno < maxTurnos; turno++) {
    await api(`/api/companies/${cid}/interview/next`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sesionId }) });
    let abierta: { id: string; pregunta: string } | null = null;
    for (let i = 0; i < 40; i++) {
      const est = await api(`/api/companies/${cid}/interview/next?session_id=${sesionId}`);
      const sesion = est.json.sesion as { estado?: string } | null;
      abierta = (est.json.abierta as { id: string; pregunta: string } | null) ?? null;
      if (abierta || sesion?.estado === "completa") break;
      await esperar(4000);
    }
    if (!abierta) return respondidas;
    const guion = guiones.find((g) => g.detecta.test(abierta!.pregunta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")));
    const texto = guion?.respuesta ?? "La verdad, eso no lo sé con certeza; tendría que revisarlo con calma.";
    const form = new FormData();
    form.set("response_id", abierta.id);
    form.set("texto", texto);
    const r = await fetch(`${URL_PUB}/api/interviews/${sesionId}/answer`, { method: "POST", headers: { cookie: COOKIE }, body: form });
    if (!r.ok) throw new Error(`answer falló: ${r.status}`);
    respondidas++;
  }
  return respondidas;
}

async function main() {
  const resumen: Record<string, unknown> = { url: URL_PUB, email: EMAIL };

  // 0. Registro (como haría el amigo; creado por admin con correo confirmado, mismo resultado del formulario).
  const { error: e0 } = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nombre: "Valeria" } });
  if (e0) throw e0;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: sesion, error: e1 } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (e1) throw e1;
  COOKIE = cookieDeSesion(sesion.session!);

  // 1. Entra: el portal le pide crear su empresa (sin consultor).
  const s1 = await pagina("/portal");
  resumen.portal_entra = s1;
  const crear = await api("/api/portal/empresa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: "Café Warmi", sector: "cafetería" }) });
  if (crear.status !== 201) throw new Error(`crear empresa: ${crear.status} ${JSON.stringify(crear.json)}`);
  const cid = (crear.json as { company_id: string }).company_id;
  resumen.empresa = cid;
  console.log("empresa creada por el amigo:", cid);

  // 2. Conversa (sueño + empresa), con una respuesta rica y una vaga que exige repregunta.
  const { data: sesiones } = await admin.from("interview_sessions").select("id,tipo").eq("company_id", cid);
  const sueno = sesiones!.find((s) => s.tipo === "sueno_dueno")!;
  const empresa = sesiones!.find((s) => s.tipo === "empresa_dueno")!;
  const rSueno = await responderSesion(cid, sueno.id, [
    { detecta: /por que empezaste|conseguir con ella/, respuesta: "Empecé Café Warmi hace cinco años porque quería un café de barrio con cafés de origen peruano. Quiero trabajar seis horas al día, dejar de estar en la barra, dedicarme a elegir cafés y a la marca, y tener las tardes con mis hijas." },
    { detecta: /martes|donde estas|que ya no haces|horas/, respuesta: "Eso ya te lo conté: seis horas, fuera de la barra, tardes con mis hijas." },
    { detecta: /exito|suficiente|sacrificar/, respuesta: "Éxito es que Warmi funcione sin mí un mes entero y facturar unos 40 mil soles al mes. No sacrifico el trato con los caseros de las fincas." },
    { detecta: /cambiar|postergando|soltar|juzgara/, respuesta: "Sé que debo soltar la barra. Llevo un año postergando abrir una segunda sede porque siento que algo no cuadra." },
    { detecta: /tamano|crecer|empresa quieres/, respuesta: "Quiero una segunda sede el próximo año, esa es mi gran meta." },
  ], 7);
  const rEmpresa = await responderSesion(cid, empresa.id, [
    { detecta: /que empresa tienes|que vendes|dinero/, respuesta: "Café Warmi: cafetería de especialidad en Miraflores, ocho personas. Vendemos café, postres y métodos. Facturamos unos 28 mil soles al mes y el 70% es de la mañana." },
    { detecta: /funciona especialmente bien|area sabes|preocupa/, respuesta: "Las ventas van bien, la gente hace cola en la mañana. Me preocupa que en las tardes el local está medio vacío y no sé por qué." },
    { detecta: /depend|desaparecieras|decisiones/, respuesta: "Si desaparezco un mes, se cae la compra de café y la caja. Y si falta Alexandra, mi barista de siempre, ese día bajan las ventas y hay más quejas: ella conoce a cada cliente por nombre y calibra la máquina de oído." },
    { detecta: /excepcion|permiso|puesto te costaria|equivocado/, respuesta: "El puesto más difícil de reemplazar es el de Alexandra. Los chicos nuevos aprenden mirándola, no hay nada escrito." },
    { detecta: /paso a paso|se traba|rehace|informacion/, respuesta: "Un cliente pide en caja, se cobra, la barista prepara y entrega. En hora punta la cola se traba en caja porque también despachamos los pedidos por aplicación en la misma caja." },
    { detecta: /prometes|recibe|calidad|clientes vuelven/, respuesta: "Prometemos el mejor café de origen del barrio. Los de la mañana vuelven casi todos; a los de la tarde casi ni los conocemos." },
    { detecta: /de donde vienen|canal|cliente ideal|precio/, respuesta: "Los clientes llegan caminando o por Instagram. Nunca hemos hecho nada para las tardes; el precio lo puse mirando a la competencia." },
  ], 9);
  resumen.conversacion = { sueno: rSueno, empresa: rEmpresa };
  console.log("respuestas:", resumen.conversacion);

  // 3. Sube sus números (texto pegado, como haría en el celular).
  const formDato = new FormData();
  formDato.set("company_id", cid);
  formDato.set("texto", "seccion,dato\nventas,el 70% de la venta del mes entra entre 7 y 11 de la mañana\ntardes,entre 3 y 7 de la tarde se usan en promedio 6 de las 22 mesas\nalexandra,los dias que Alexandra descansa la venta cae 18% y las quejas por sabor suben\napp,los pedidos por aplicacion son el 22% y se despachan en la misma caja del salon");
  formDato.set("nombre", "numeros_warmi.csv (resumen)");
  formDato.set("tipo", "dato");
  const sube = await fetch(`${URL_PUB}/api/sources`, { method: "POST", headers: { cookie: COOKIE }, body: formDato });
  if (!sube.ok) throw new Error(`subir datos: ${sube.status}`);
  await esperarCola(cid, "extracción+contraste", 30, ["extraer", "contrastar", "transcribir_respuesta", "minar_know_how"]);

  // 4. Activos: "no lo tengo" → construir → confirmar (organigrama).
  await api(`/api/companies/${cid}/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.organigrama", estado: "no_lo_tengo" }) });
  const c1 = await api(`/api/companies/${cid}/assets/construir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.organigrama" }) });
  if (c1.status !== 200) throw new Error(`construir: ${c1.status} ${JSON.stringify(c1.json)}`);
  let activo: { estado?: string; borrador?: string | null; faltantes?: { pregunta: string }[] } = {};
  for (let i = 0; i < 40; i++) {
    const g = await api(`/api/companies/${cid}/assets`);
    activo = ((g.json.activos as typeof activo[]) ?? []).find((a) => (a as { clave?: string }).clave === "personas.organigrama") ?? {};
    if (activo.estado === "borrador_generado") break;
    await esperar(4500);
  }
  resumen.activo_organigrama = { estado: activo.estado, borrador: !!activo.borrador, faltantes: activo.faltantes?.length ?? 0 };
  if (activo.estado !== "borrador_generado") throw new Error("el constructor no generó borrador");
  if ((activo.faltantes?.length ?? 0) > 0 && !activo.borrador) {
    const c2 = await api(`/api/companies/${cid}/assets/construir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.organigrama", respuestas: (activo.faltantes ?? []).map((f) => ({ pregunta: f.pregunta, respuesta: "Estamos yo como dueña, Alexandra como barista principal con dos baristas más, una persona en caja por turno y un pastelero." })) }) });
    if (c2.status !== 200) throw new Error("reconstruir falló");
    for (let i = 0; i < 40; i++) {
      const g = await api(`/api/companies/${cid}/assets`);
      activo = ((g.json.activos as typeof activo[]) ?? []).find((a) => (a as { clave?: string }).clave === "personas.organigrama") ?? {};
      if (activo.estado === "borrador_generado" && activo.borrador) break;
      await esperar(4500);
    }
  }
  const conf = await api(`/api/companies/${cid}/assets/confirmar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.organigrama", borrador: activo.borrador }) });
  resumen.activo_confirmado = conf.status === 200;

  // 5. Cuenta su proceso (voz→texto en el celular; aquí el texto ya confirmado).
  const proc = await api(`/api/processes/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: cid, nombre: "Atención en barra", descripcion: "El cliente entra y hace cola en la caja. En la misma caja también entran los pedidos por aplicación, así que en hora punta se traba. Se cobra, la barista prepara el café, se entrega en la barra. Si el café sale mal o la espera pasa de diez minutos, el cliente se va molesto y a veces no vuelve." }) });
  if (proc.status !== 200) throw new Error(`generar proceso: ${proc.status}`);
  const pid = (proc.json as { process_id: string }).process_id;
  await esperarCola(cid, "arquitecto", 20, ["generar_proceso"]);
  const ficha = await api(`/api/processes/${pid}/ficha`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ responsable: "Valeria (dueña)", como_bien: "el cliente se va con su nombre dicho en voz alta y el café en menos de 7 minutos" }) });
  resumen.ficha = ficha.status === 200;
  const confP = await api(`/api/processes/${pid}/confirmar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "confirmado", deseo: "Quiero que los pedidos por aplicación no se mezclen con la cola del salón." }) });
  resumen.proceso_confirmado = confP.status === 200;
  await esperarCola(cid, "deseo→extracción", 20, ["extraer", "contrastar"]);

  // 6. Valida lo que el sistema le pregunta (contradicciones/prioridad), como en el portal.
  const { data: porValidar } = await admin.from("claims").select("id,texto,estado").eq("company_id", cid).or("estado.eq.contradicho,and(estado.eq.sin_verificar,prioridad_validacion.eq.true)");
  for (const c of porValidar ?? []) {
    const esSegundaSede = /segunda sede/i.test(c.texto);
    await api(`/api/claims/${c.id}/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ respuesta: esSegundaSede ? "si" : "si" }) });
  }
  resumen.validadas = (porValidar ?? []).length;
  await esperarCola(cid, "diagnóstico automático", 35, ["diagnosticar", "consolidar"]);

  // 7. MI EMPRESA HOY (lo que el amigo ve, con el porqué de cada cosa).
  const hoy = await empresaHoy(cid);
  const paginas = { hoy: await pagina("/portal/hoy"), activos: await pagina("/portal/activos"), procesos: await pagina(`/portal/procesos/${pid}`) };
  const textoInsights = hoy.noVes.map((h) => `${h.titulo} ${h.causa ?? ""}`).join(" ").toLowerCase();
  const insightNoObvio = /tarde|utilizaci|capacidad|mesa|segunda sede|caja/i.test(textoInsights);
  const fortaleza = hoy.fortalezas.length > 0 || hoy.caleta.length > 0;
  resumen.resultado = {
    nivel: hoy.nivel,
    espejo: hoy.espejo.length,
    noVes: hoy.noVes.map((h) => h.titulo.slice(0, 70)),
    fortalezas: hoy.fortalezas.map((h) => h.titulo.slice(0, 60)),
    caleta: hoy.caleta.length,
    restriccion: hoy.restriccion?.titulo?.slice(0, 80) ?? null,
    sistematizar: hoy.sistematizar.map((s) => s.nombre),
    tentativo: hoy.tentativo.map((t) => `${t.n}. ${t.problema.slice(0, 60)}`),
    con_evidencia: hoy.noVes.every((h) => h.evidencia.length > 0),
    paginas,
  };
  resumen.pass = hoy.nivel >= 3 && insightNoObvio && fortaleza && !!hoy.restriccion && hoy.tentativo.length >= 3 && paginas.hoy === 200;
  writeFileSync(path.resolve(DIR, "../benchmark/prueba-amigo-resultado.json"), JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen, null, 1));
  process.exit(resumen.pass ? 0 : 1);
}
main().catch((e) => { console.error("prueba del amigo falló:", e?.message ?? e); process.exit(1); });

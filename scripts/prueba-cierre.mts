/**
 * PRUEBA FINAL DE CIERRE — empresa nueva, sintética, desde cero (no reutiliza demos ni respuestas esperadas).
 * "Ferretería Illari": el dueño cree que su problema es que "la gente ya no compra como antes";
 * lo escondido: las ventas a crédito a maestros de obra no tienen seguimiento de cobro (la plata está
 * regada en cuadernos) y el conocimiento de equivalencias/medidas vive solo en el vendedor antiguo.
 * Recorre TODO por la URL pública con la sesión del usuario: entrada → entrevista → datos → los 3 casos
 * de activos (funciones NO LO TENGO, cultura NO LO TENGO, propuesta INCOMPLETO) → proceso → ficha →
 * confirmación → validación → MI EMPRESA HOY. Mide interacciones, tiempos, primer insight, redundancia
 * y persistencia (salir y volver: nada desaparece).
 *   node --env-file=.env.local --import=tsx scripts/prueba-cierre.mts
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
const EMAIL = `cierre-${Date.now()}@example.test`;
const PASS = "Prueba-8x-Cierre-123";
const t0 = Date.now();
let interacciones = 0;
let msPrimerInsight = 0;

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
  interacciones++;
  const r = await fetch(`${URL_PUB}${ruta}`, { ...init, headers: { ...(init.headers ?? {}), cookie: COOKIE } });
  let json: Record<string, unknown> = {};
  try { json = (await r.json()) as Record<string, unknown>; } catch { /* html */ }
  return { status: r.status, json };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function esperarCola(cid: string, etiqueta: string, maxMin = 30, tipos: string[] | null = null) {
  const ti = Date.now();
  let quietas = 0;
  for (;;) {
    let q = admin.from("jobs").select("id,tipo,estado").eq("company_id", cid).in("estado", ["pendiente", "corriendo"]);
    if (tipos) q = q.in("tipo", tipos);
    const { data } = await q;
    if (!data?.length) { quietas++; if (quietas >= 3) return; } else quietas = 0;
    if (Date.now() - ti > maxMin * 60_000) throw new Error(`${etiqueta}: no procesó a tiempo`);
    await esperar(5000);
  }
}

const preguntasHechas: string[] = [];
async function responderSesion(cid: string, sesionId: string, guiones: { detecta: RegExp; respuesta: string }[], maxTurnos = 9) {
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
    preguntasHechas.push(abierta.pregunta);
    const guion = guiones.find((g) => g.detecta.test(norm(abierta!.pregunta)));
    const texto = guion?.respuesta ?? "Eso no lo tengo claro, la verdad; nunca lo hemos medido.";
    const form = new FormData();
    form.set("response_id", abierta.id);
    form.set("texto", texto);
    interacciones++;
    const r = await fetch(`${URL_PUB}/api/interviews/${sesionId}/answer`, { method: "POST", headers: { cookie: COOKIE }, body: form });
    if (!r.ok) throw new Error(`answer: ${r.status}`);
    respondidas++;
  }
  return respondidas;
}

async function construirActivo(cid: string, clave: string, respuestaHuecos: string) {
  interacciones++;
  const c1 = await api(`/api/companies/${cid}/assets/construir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave }) });
  if (c1.status !== 200) throw new Error(`construir ${clave}: ${c1.status}`);
  type A = { clave?: string; estado?: string; borrador?: string | null; faltantes?: { pregunta: string }[] };
  let a: A = {};
  const leer = async () => {
    const g = await api(`/api/companies/${cid}/assets`);
    return (((g.json.activos as A[]) ?? []).find((x) => x.clave === clave) ?? {}) as A;
  };
  for (let i = 0; i < 45; i++) { a = await leer(); if (a.estado === "borrador_generado") break; await esperar(4500); }
  if (a.estado !== "borrador_generado") throw new Error(`${clave}: sin borrador`);
  const huecos = (a.faltantes ?? []).length;
  if (huecos > 0 && !a.borrador) {
    interacciones++;
    await api(`/api/companies/${cid}/assets/construir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave, respuestas: (a.faltantes ?? []).map((f) => ({ pregunta: f.pregunta, respuesta: respuestaHuecos })) }) });
    for (let i = 0; i < 45; i++) { a = await leer(); if (a.estado === "borrador_generado" && a.borrador) break; await esperar(4500); }
  }
  if (!a.borrador) throw new Error(`${clave}: borrador vacío`);
  interacciones++;
  const conf = await api(`/api/companies/${cid}/assets/confirmar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave, borrador: a.borrador }) });
  return { ok: conf.status === 200, huecos, largo: a.borrador.length };
}

async function main() {
  const resumen: Record<string, unknown> = { url: URL_PUB, empresa_nombre: "Ferretería Illari" };
  // Entrada
  await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nombre: "Rómulo" } });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: ses } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASS });
  COOKIE = cookieDeSesion(ses.session!);
  interacciones++;
  const crear = await api("/api/portal/empresa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: "Ferretería Illari", sector: "ferretería" }) });
  if (crear.status !== 201) throw new Error("crear empresa: " + crear.status);
  const cid = (crear.json as { company_id: string }).company_id;
  console.log("empresa:", cid);

  // Entrevista (respuestas nuevas; el dueño CREE que el problema es "la gente ya no compra")
  const { data: sesiones } = await admin.from("interview_sessions").select("id,tipo").eq("company_id", cid);
  const rS = await responderSesion(cid, sesiones!.find((s) => s.tipo === "sueno_dueno")!.id, [
    { detecta: /por que empezaste|conseguir/, respuesta: "La heredé de mi padre hace doce años. Quiero que Illari sea la ferretería seria del distrito y jubilarme sin venderla." },
    { detecta: /martes|donde estas|ya no haces|horas/, respuesta: "Quiero estar en el mostrador solo por gusto, no por obligación, y viajar dos veces al año con mi esposa." },
    { detecta: /exito|suficiente/, respuesta: "Éxito es no deberle a nadie y que el negocio pague dos sueldos buenos sin que yo cargue cajas." },
    { detecta: /cambiar|postergando|soltar/, respuesta: "Sé que debo poner orden en los créditos que doy, pero siempre lo dejo para después." },
  ], 6);
  const rE = await responderSesion(cid, sesiones!.find((s) => s.tipo === "empresa_dueno")!.id, [
    { detecta: /que empresa tienes|que vendes|dinero/, respuesta: "Ferretería de barrio en Comas, cinco personas. Vendemos de todo para construcción. Facturamos unos 45 mil soles al mes, la mitad a maestros de obra." },
    { detecta: /funciona especialmente bien|preocupa|rota/, respuesta: "Me preocupa que la gente ya no compra como antes; siento que las ventas bajan y no sé bien por qué." },
    { detecta: /depend|desaparecieras|decisiones/, respuesta: "Si yo falto, nadie sabe cuánto nos deben los maestros: los créditos los apunto en mis cuadernos y en la cabeza." },
    { detecta: /excepcion|permiso|puesto te costaria/, respuesta: "El más difícil de reemplazar es don Jacinto, vendedor desde la época de mi padre: sabe qué tubo, qué medida y qué equivalencia lleva cada trabajo sin mirar catálogo." },
    { detecta: /paso a paso|se traba|rehace/, respuesta: "El maestro pide en mostrador, don Jacinto arma el pedido, si es al crédito yo apunto en mi cuaderno, se entrega y se supone que pagan a fin de mes. Cobrar es un dolor: a veces ni recuerdo quién debe." },
    { detecta: /prometes|calidad|vuelven/, respuesta: "Prometemos tener de todo y fiar al que trabaja bien. Los maestros vuelven por don Jacinto, la verdad." },
    { detecta: /de donde vienen|canal|precio/, respuesta: "Todos llegan por recomendación entre maestros. Nunca hemos hecho publicidad." },
  ], 9);
  resumen.entrevista = { sueno: rS, empresa: rE };

  // Datos duros
  const fd = new FormData();
  fd.set("company_id", cid);
  fd.set("texto", "seccion,dato\nventas,las ventas de mostrador al contado subieron 8% este anio\ncreditos,las ventas al credito a maestros son el 52% y crecieron 15%\ncobros,hay 38 mil soles en creditos vencidos sin cobrar apuntados en tres cuadernos distintos\njacinto,cuando don Jacinto descansa las ventas del dia caen 25% y suben las devoluciones por medidas equivocadas");
  fd.set("nombre", "cuadernos_y_caja.csv (resumen)");
  fd.set("tipo", "dato");
  interacciones++;
  const up = await fetch(`${URL_PUB}/api/sources`, { method: "POST", headers: { cookie: COOKIE }, body: fd });
  if (!up.ok) throw new Error("subir datos");
  await esperarCola(cid, "extracción", 30, ["extraer", "contrastar", "minar_know_how"]);

  // Primer insight: ¿cuándo hay algo que mirar?
  for (let i = 0; i < 40 && !msPrimerInsight; i++) {
    const h = await empresaHoy(cid);
    if (h.espejo.length + h.noVes.length + h.caleta.length > 0) msPrimerInsight = Date.now() - t0;
    else await esperar(5000);
  }

  // LOS 3 CASOS DE ACTIVOS
  interacciones += 3;
  await api(`/api/companies/${cid}/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.funciones", estado: "no_lo_tengo" }) });
  await api(`/api/companies/${cid}/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "personas.mvv", estado: "no_lo_tengo" }) });
  await api(`/api/companies/${cid}/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave: "marketing.cliente_ideal", estado: "incompleto" }) });
  const funciones = await construirActivo(cid, "personas.funciones", "Don Jacinto arma pedidos y aconseja medidas; Marta cobra en caja; los dos ayudantes alcanzan mercadería y reparten; yo compro, doy créditos y superviso.");
  const cultura = await construirActivo(cid, "personas.mvv", "Existimos para que el maestro de obra nunca pare su obra por falta de material. Valoramos la palabra: lo fiado se paga y lo prometido se entrega. No tolero que se le venda al cliente algo que no necesita.");
  const propuesta = await construirActivo(cid, "marketing.cliente_ideal", "Nuestro cliente es el maestro de obra de la zona; nos elige porque le fiamos con confianza y porque don Jacinto nunca se equivoca de medida.");
  resumen.activos = { funciones, cultura, propuesta };

  // ¿La entrevista posterior vuelve a pedir lo construido? (redundancia)
  const extraS = await responderSesion(cid, sesiones!.find((s) => s.tipo === "sueno_dueno")!.id, [], 2);
  const redundantes = preguntasHechas.slice(-Math.max(extraS, 0)).filter((q) => /valores|mision|vision|proposito|funciones de|quien hace que/.test(norm(q)));
  resumen.redundantes_post_activos = redundantes;

  // Proceso contado → dibujado → ficha → confirmado → deseo
  interacciones++;
  const proc = await api(`/api/processes/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: cid, nombre: "Venta al crédito", descripcion: "El maestro pide en mostrador. Don Jacinto arma el pedido y revisa medidas. Si es al crédito, yo apruebo y apunto en mi cuaderno. Se entrega el material. Se supone que pagan a fin de mes, pero muchas veces nadie cobra y el crédito queda vencido en el cuaderno." }) });
  const pid = (proc.json as { process_id: string }).process_id;
  await esperarCola(cid, "arquitecto", 20, ["generar_proceso"]);
  interacciones += 2;
  await api(`/api/processes/${pid}/ficha`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ responsable: "Rómulo (dueño)", como_bien: "el crédito cobrado dentro del mes, sin discusión con el maestro", comentario: "los cuadernos viven en el cajón del mostrador" }) });
  const confP = await api(`/api/processes/${pid}/confirmar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "confirmado", deseo: "Quiero dejar de ser el único que aprueba créditos y que el cobro no dependa de mi memoria." }) });
  resumen.proceso = { generado: proc.status === 200, confirmado: confP.status === 200 };
  await esperarCola(cid, "deseo", 20, ["extraer", "contrastar"]);

  // Validación (las contradicciones que el sistema le muestre)
  const { data: pv } = await admin.from("claims").select("id,texto").eq("company_id", cid).or("estado.eq.contradicho,and(estado.eq.sin_verificar,prioridad_validacion.eq.true)");
  for (const c of pv ?? []) { interacciones++; await api(`/api/claims/${c.id}/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ respuesta: "si" }) }); }
  resumen.validadas = (pv ?? []).length;
  await esperarCola(cid, "diagnóstico", 35, ["diagnosticar", "consolidar"]);

  // Persistencia: "salir y volver" — releer todo del proceso.
  const [{ data: pRow }, { data: adj }, { data: nodos }] = await Promise.all([
    admin.from("processes").select("descripcion_original,confirmacion,deseo,comentario,responsable").eq("id", pid).single(),
    admin.from("sources").select("id").eq("process_id", pid),
    admin.from("process_nodes").select("id,etiqueta").eq("process_id", pid),
  ]);
  resumen.persistencia = { descripcion_original: !!pRow?.descripcion_original, confirmado: pRow?.confirmacion === "confirmado", deseo: !!pRow?.deseo, comentario: !!pRow?.comentario, nodos: nodos?.length ?? 0, adjuntos: adj?.length ?? 0 };

  // Resultado final
  const hoy = await empresaHoy(cid);
  const textoNoVes = norm(hoy.noVes.map((h) => `${h.titulo} ${h.causa ?? ""}`).join(" "));
  const insightNoObvio = /cobro|credito|vencid|seguimiento|cuaderno/.test(textoNoVes) && !/la gente ya no compra/.test(textoNoVes);
  resumen.resultado = {
    nivel: hoy.nivel,
    espejo: hoy.espejo.length,
    noVes: hoy.noVes.map((h) => h.titulo.slice(0, 75)),
    fortalezas: hoy.fortalezas.map((h) => h.titulo.slice(0, 60)),
    caleta: hoy.caleta.length,
    restriccion: hoy.restriccion?.titulo?.slice(0, 85) ?? null,
    sistematizar: hoy.sistematizar.map((s) => s.nombre),
    tentativo: hoy.tentativo.length,
    con_evidencia: hoy.noVes.every((h) => h.evidencia.length > 0),
    insight_no_obvio: insightNoObvio,
  };
  resumen.metricas = { interacciones, minutos_totales: Math.round((Date.now() - t0) / 60000), primer_insight_min: msPrimerInsight ? Math.round(msPrimerInsight / 60000) : null, preguntas_entrevista: preguntasHechas.length, redundantes: (resumen.redundantes_post_activos as string[]).length };
  resumen.pass =
    hoy.nivel >= 3 &&
    insightNoObvio &&
    (hoy.fortalezas.length > 0 || hoy.caleta.length > 0) &&
    !!hoy.restriccion &&
    hoy.tentativo.length >= 3 &&
    (resumen.redundantes_post_activos as string[]).length === 0;
  writeFileSync(path.resolve(DIR, "../benchmark/prueba-cierre-resultado.json"), JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen, null, 1));
  process.exit(resumen.pass ? 0 : 1);
}
main().catch((e) => { console.error("prueba de cierre falló:", e?.message ?? e); process.exit(1); });

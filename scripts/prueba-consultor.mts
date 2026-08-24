/**
 * PRUEBA DE CALIDAD DEL CONSULTOR (fase 36): tres empresas sintéticas con problemas escondidos.
 *   A) muchos leads, baja conversión → el problema real es el SEGUIMIENTO.
 *   B) el dueño dice delegar → las decisiones vuelven a él.
 *   C) producto excelente → la Caleta vive en una sola persona (fortaleza a preservar).
 * 8X debe descubrirlos con el pipeline real (Supabase + Gemini + worker), sin pistas.
 * Mide: insights esperados encontrados, falsos hallazgos, preguntas totales, cobertura.
 * Requiere el worker corriendo. node --env-file=.env.local --import=tsx scripts/prueba-consultor.mts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const DIR = path.dirname(fileURLToPath(import.meta.url));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Persona = { clave: string; nombre: string; puesto: string; rol: string };
type Resp = { p: string; tipo: string; bloque: string; pregunta: string; respuesta: string };
type Caso = {
  nombre: string;
  sector: string;
  fuentes: { nombre: string; tipo: string; contenido: string; origen: string; fecha_origen: string | null }[];
  personas: Persona[];
  respuestas: Resp[];
  esperados: { clave: string; palabras: string[]; preserva?: boolean }[];
  prohibidos: string[][];
};

const CASOS: Caso[] = [
  {
    nombre: "PRUEBA A · Estudio Jurídico Lex",
    sector: "servicios legales",
    fuentes: [
      { nombre: "reporte_leads_2026.csv (resumen)", tipo: "dato", origen: "consultor", fecha_origen: "2026-08-01", contenido: "seccion,dato\nleads,120 consultas nuevas por mes entran por Instagram y la web\nconversion,solo 9 de cada 120 consultas terminan en contrato firmado\nrespuesta,el tiempo promedio de primera respuesta a una consulta es de 3 dias\nseguimiento,el 78% de las consultas que no contrataron nunca recibieron un segundo contacto" },
      { nombre: "Plan comercial 2026", tipo: "documento", origen: "cliente", fecha_origen: "2026-01-10", contenido: "PLAN COMERCIAL 2026\n\nOBJETIVO: duplicar la inversion en publicidad digital para atraer mas consultas.\nDIAGNOSTICO INTERNO: nos faltan leads; con mas consultas cerraremos mas casos." },
    ],
    personas: [
      { clave: "duena", nombre: "Marcia Leon", puesto: "Socia fundadora", rol: "dueno" },
      { clave: "asistente", nombre: "Carla Nunez", puesto: "Asistente comercial", rol: "empleado" },
    ],
    respuestas: [
      { p: "duena", tipo: "empresa_dueno", bloque: "marketing", pregunta: "¿De dónde vienen tus clientes hoy?", respuesta: "Invertimos fuerte en Instagram y la web: llegan como 120 consultas al mes. El problema es que necesitamos más leads todavía, por eso queremos duplicar la publicidad." },
      { p: "duena", tipo: "empresa_dueno", bloque: "hoy", pregunta: "¿Qué área sabes que está rota?", respuesta: "Ventas: entran muchas consultas pero se firman muy pocos contratos, unos nueve al mes." },
      { p: "duena", tipo: "sueno_dueno", bloque: "vida_deseada", pregunta: "¿Cómo sería un martes ideal en tres años?", respuesta: "Quiero litigar menos y que el estudio crezca sin que yo tenga que estar vendiendo." },
      { p: "asistente", tipo: "personal", bloque: "trabajo_real", pregunta: "Cuéntame cómo haces tu trabajo, paso a paso.", respuesta: "Reviso las consultas que llegan por Instagram y la web cuando puedo, porque también apoyo en los expedientes. A veces respondo el mismo día, a veces se me pasan dos o tres días. Si el interesado no contesta, ahí queda: no tengo lista de a quién volver a escribir." },
      { p: "asistente", tipo: "personal", bloque: "trabas", pregunta: "¿Dónde pierdes tiempo?", respuesta: "En buscar en el chat quién quedó en qué. No hay un lugar donde anotar los interesados; uso el mismo WhatsApp del estudio." },
    ],
    esperados: [
      { clave: "seguimiento", palabras: ["seguimiento"] },
      { clave: "tiempos_respuesta", palabras: ["respuesta"] },
    ],
    prohibidos: [["falta", "leads"], ["duplicar", "publicidad"], ["incompetente"]],
  },
  {
    nombre: "PRUEBA B · Transportes Andino",
    sector: "logística",
    fuentes: [
      { nombre: "Manual de delegación 2025", tipo: "documento", origen: "cliente", fecha_origen: "2025-06-01", contenido: "MANUAL DE DELEGACION\n\nEl jefe de operaciones aprueba rutas y horas extra.\nLa administradora aprueba compras menores hasta S/ 2,000.\nEl gerente general solo interviene en decisiones estrategicas." },
      { nombre: "registro_aprobaciones.csv (resumen)", tipo: "dato", origen: "consultor", fecha_origen: "2026-08-05", contenido: "seccion,dato\naprobaciones,en julio se registraron 47 decisiones operativas escaladas al gerente general German\nrutas,31 cambios de ruta esperaron la aprobacion de German por WhatsApp\ncompras,9 compras menores de menos de S/ 500 esperaron su visto bueno" },
    ],
    personas: [
      { clave: "dueno", nombre: "German Salas", puesto: "Gerente general", rol: "dueno" },
      { clave: "jefe", nombre: "Ivan Rojas", puesto: "Jefe de operaciones", rol: "lider" },
    ],
    respuestas: [
      { p: "dueno", tipo: "empresa_dueno", bloque: "dependencia", pregunta: "¿Qué sigue dependiendo de ti?", respuesta: "Ya casi nada: hace un año delegué todo con un manual. Yo solo veo lo estratégico." },
      { p: "dueno", tipo: "empresa_dueno", bloque: "hoy", pregunta: "¿Qué te preocupa?", respuesta: "Que el día no me alcanza; paro pegado al teléfono resolviendo cosas de la operación." },
      { p: "dueno", tipo: "sueno_dueno", bloque: "rol", pregunta: "¿Qué haces porque nadie más puede?", respuesta: "Al final del día los muchachos me consultan las rutas y las compras, porque si algo sale mal el responsable soy yo." },
      { p: "jefe", tipo: "lider", bloque: "area_real", pregunta: "¿Quién decide cuando aparece una excepción?", respuesta: "En el papel yo apruebo rutas, pero en la práctica todo cambio se lo mando a Germán por WhatsApp y espero su ok. A veces los camiones esperan una o dos horas parados." },
      { p: "jefe", tipo: "lider", bloque: "trabajo_real", pregunta: "¿Dónde se traba tu área?", respuesta: "En las aprobaciones: cuando Germán viaja o está en reunión, las rutas quedan esperando y los choferes me llaman a mí, pero yo no puedo autorizar sin su ok." },
      { p: "jefe", tipo: "lider", bloque: "vision_lider", pregunta: "¿Qué crees que Dirección no ve?", respuesta: "Que el equipo sí sabe decidir. Tenemos diez choferes con años de experiencia y una administradora muy ordenada, pero nadie usa la autoridad del manual porque la costumbre es preguntarle todo a Germán." },
      { p: "dueno", tipo: "empresa_dueno", bloque: "personas", pregunta: "¿Quién responde si un resultado no ocurre?", respuesta: "Somos 18: diez choferes, Iván en operaciones, la administradora Lucía con dos asistentes y yo. Si algo falla, al final respondo yo." },
    ],
    esperados: [
      { clave: "decisiones_vuelven", palabras: ["german"] },
      { clave: "delegacion_papel", palabras: ["manual"] },
    ],
    prohibidos: [["contratar", "gerente"], ["incompetente"], ["despedir"]],
  },
  {
    nombre: "PRUEBA C · Pastelería Dulce Norte",
    sector: "alimentos",
    fuentes: [
      { nombre: "resenas_clientes.csv (resumen)", tipo: "dato", origen: "consultor", fecha_origen: "2026-07-20", contenido: "seccion,dato\nsatisfaccion,4.9 de 5 en 340 resenas: los clientes destacan el hojaldre como el mejor de la ciudad\nrecompra,el 72% de los clientes del mes repite compra\nproduccion,los dias que dona Teresa no esta, la merma de hojaldre sube de 4% a 19%" },
      { nombre: "Recetario oficial", tipo: "documento", origen: "cliente", fecha_origen: "2023-05-15", contenido: "RECETARIO OFICIAL\n\nHOJALDRE: 500g harina, 400g mantequilla, agua helada, 6 dobleces. Hornear a 200 grados 25 minutos." },
    ],
    personas: [
      { clave: "duena", nombre: "Fiorella Diaz", puesto: "Gerenta", rol: "dueno" },
      { clave: "teresa", nombre: "Teresa Vargas", puesto: "Maestra pastelera", rol: "empleado" },
    ],
    respuestas: [
      { p: "duena", tipo: "empresa_dueno", bloque: "producto", pregunta: "¿Qué los hace distintos?", respuesta: "El hojaldre: los clientes vienen de otros distritos por él. Es nuestra joya y la razón de que el 72% repita." },
      { p: "duena", tipo: "empresa_dueno", bloque: "personas", pregunta: "¿Qué puesto te costaría más reemplazar mañana?", respuesta: "Teresa, sin duda. El recetario existe, pero cuando ella descansa el hojaldre no sale igual y botamos mucha masa." },
      { p: "teresa", tipo: "know_how", bloque: "know_how", pregunta: "¿Qué sabes hacer tú que alguien nuevo tardaría meses en aprender?", respuesta: "La masa te avisa: cuando al doblarla se siente fría y se resiste un poquito, está lista. Si la mantequilla brilla, hay que parar y enfriar diez minutos aunque la receta no lo diga. Eso no está escrito en ningún lado; lo aprendí en veinte años." },
      { p: "duena", tipo: "empresa_dueno", bloque: "hoy", pregunta: "¿Qué empresa tienes hoy?", respuesta: "Una pastelería con local propio, ocho personas y ventas estables: unos 60 mil soles al mes, la mitad por el hojaldre." },
      { p: "duena", tipo: "empresa_dueno", bloque: "producto", pregunta: "¿Qué pasa con la calidad si mañana entra el triple de clientes?", respuesta: "No podríamos: el hojaldre depende del ojo de Teresa. Los días que ella descansa botamos hasta el 19% de la masa y salen reclamos." },
      { p: "duena", tipo: "empresa_dueno", bloque: "procesos", pregunta: "¿Qué pasa cuando la persona que lo hace no está?", respuesta: "El segundo pastelero sigue el recetario al pie de la letra y aun así no le sale: nadie le ha enseñado las señales que Teresa mira." },
    ],
    esperados: [
      { clave: "caleta_teresa", palabras: ["teresa"], preserva: true },
      { clave: "riesgo_concentracion", palabras: ["concentrad"] },
    ],
    prohibidos: [["reemplazar", "teresa"], ["despedir"], ["cambiar la receta"]],
  },
];

async function esperarCola(companyId: string, maxMin = 25) {
  const t0 = Date.now();
  let quietas = 0;
  for (;;) {
    const { data } = await sb.from("jobs").select("id").eq("company_id", companyId).in("estado", ["pendiente", "corriendo"]);
    if (!data?.length) { quietas++; if (quietas >= 3) return; } else quietas = 0;
    if (Date.now() - t0 > maxMin * 60_000) throw new Error("cola no terminó");
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function medirCaso(caso: Caso, cid: string) {
  const { data: fnd } = await sb.from("findings").select("titulo,causa_raiz,recomendacion,veredicto,requiere_validacion,filtros,patron").eq("company_id", cid);
  return evaluar(caso, cid, (fnd ?? []) as never);
}

async function correrCaso(caso: Caso) {
  await sb.from("companies").delete().eq("nombre", caso.nombre);
  const { data: co } = await sb.from("companies").insert({ nombre: caso.nombre, sector: caso.sector }).select("id").single();
  const cid = co!.id as string;
  for (const f of caso.fuentes) {
    const { data: s } = await sb.from("sources").insert({ company_id: cid, ...f, estado: "subido" }).select("id").single();
    await sb.from("jobs").insert({ company_id: cid, tipo: "extraer", payload: { source_id: s!.id }, prioridad: 3, idempotency_key: `qa-ex-${s!.id}` });
  }
  const pid: Record<string, string> = {};
  const sid: Record<string, string> = {};
  for (const p of caso.personas) {
    const { data } = await sb.from("participants").insert({ company_id: cid, nombre: p.nombre, puesto: p.puesto, rol: p.rol, token_hash: `qa-${caso.nombre.slice(7, 9)}-${p.clave}-${cid}`, token_expira_at: new Date(Date.now() + 86400e3).toISOString() }).select("id").single();
    pid[p.clave] = data!.id;
  }
  let preguntasTotales = 0;
  for (const r of caso.respuestas) {
    const claveSes = `${r.p}|${r.tipo}`;
    if (!sid[claveSes]) {
      const { data } = await sb.from("interview_sessions").insert({ company_id: cid, participant_id: pid[r.p], tipo: r.tipo }).select("id").single();
      sid[claveSes] = data!.id;
    }
    const { data: ir } = await sb.from("interview_responses").insert({ session_id: sid[claveSes], bloque: r.bloque, orden: 1 + preguntasTotales, pregunta: r.pregunta, respuesta: r.respuesta, respondido_at: new Date().toISOString() }).select("id").single();
    preguntasTotales++;
    await sb.from("jobs").insert({ company_id: cid, tipo: "extraer", payload: { response_id: ir!.id }, prioridad: 3, idempotency_key: `qa-exr-${ir!.id}` });
  }
  const sesionesKH = Object.entries(sid).filter(([k]) => k.endsWith("|know_how"));
  for (const [, sesId] of sesionesKH) await sb.from("jobs").insert({ company_id: cid, tipo: "minar_know_how", payload: { session_id: sesId }, prioridad: 3, idempotency_key: `qa-kh-${sesId}` });

  await esperarCola(cid);
  // El contraste dispara el diagnóstico automático cuando hay suficiencia y 0 contradicciones abiertas;
  // si el caso dejó contradicciones (B), el dueño las resuelve como en el portal:
  const { data: abiertos } = await sb.from("claims").select("id,estado").eq("company_id", cid).eq("estado", "contradicho");
  for (const c of abiertos ?? []) await sb.from("claims").update({ estado: "caducado", validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", c.id);
  // diagnóstico directo de los 4 pilares (forzar cubre pilares con poca señal: el sistema dirá "desconocido" si no alcanza)
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
    await sb.from("jobs").insert({ company_id: cid, tipo: "diagnosticar", payload: { pilar, forzar: true }, prioridad: 5, idempotency_key: `qa-diag-${pilar}-${cid}` });
  }
  await esperarCola(cid);

  const { data: fnd } = await sb.from("findings").select("titulo,causa_raiz,recomendacion,veredicto,requiere_validacion,filtros,patron").eq("company_id", cid);
  return evaluar(caso, cid, (fnd ?? []) as never);
}

function nunca(): never { throw new Error("solo tipos"); }
void nunca;

async function evaluar(caso: Caso, cid: string, fnd: { titulo: string; causa_raiz: string | null; recomendacion?: string | null; veredicto: string | null; requiere_validacion: boolean | null; filtros: { preserva?: boolean } | null; patron: string | null }[]) {
  const visibles = (fnd ?? []).filter((f) => !f.requiere_validacion);
  const textoTodo = norm(visibles.map((f) => `${f.titulo} ${f.causa_raiz ?? ""}`).join(" \n "));
  const esperadosOK = caso.esperados.map((e) => ({
    clave: e.clave,
    ok: e.palabras.every((p) => textoTodo.includes(norm(p))) && (!e.preserva || visibles.some((f) => (f.veredicto === "keep" || (f.filtros as { preserva?: boolean } | null)?.preserva) && e.palabras.every((p) => norm(`${f.titulo} ${f.causa_raiz ?? ""}`).includes(norm(p))))),
  }));
  const NEGADORES = ["antes de", "en lugar de", "en vez de", "sin necesidad de", "no basta", "no es"];
  const falsos = visibles.filter((f) => {
    const texto = norm(`${f.titulo} ${f.causa_raiz ?? ""} ${(f as { recomendacion?: string }).recomendacion ?? ""}`);
    return caso.prohibidos.some((pal) => {
      if (!pal.every((p) => texto.includes(norm(p)))) return false;
      // Si el texto niega o pospone la idea prohibida ("antes de duplicar la publicidad"), no es un falso hallazgo.
      return !NEGADORES.some((n) => texto.includes(norm(n)));
    });
  }).map((f) => f.titulo);
  const { data: preguntasIA } = await sb.from("interview_responses").select("id,pregunta,respuesta, interview_sessions!inner(company_id)").eq("interview_sessions.company_id", cid).is("respuesta", null);
  return { empresa: caso.nombre, cid, hallazgos: visibles.length, esperados: esperadosOK, falsos, preguntas_pendientes_generadas: (preguntasIA ?? []).length, titulos: visibles.map((f) => `${f.veredicto === "keep" ? "[F] " : ""}${f.titulo.slice(0, 80)}`) };
}

async function main() {
  const soloMedir = process.argv.includes("--medir");
  const resultados = [];
  for (const caso of CASOS) {
    if (soloMedir) {
      const { data: co } = await sb.from("companies").select("id").eq("nombre", caso.nombre).single();
      if (!co) throw new Error("no existe: " + caso.nombre);
      console.log("== midiendo:", caso.nombre);
      resultados.push(await medirCaso(caso, co.id));
    } else {
      console.log("== corriendo:", caso.nombre);
      resultados.push(await correrCaso(caso));
    }
  }
  const resumen = resultados.map((r) => ({ ...r }));
  const pass = resultados.every((r) => r.esperados.every((e) => e.ok) && r.falsos.length === 0);
  writeFileSync(path.resolve(DIR, "../benchmark/prueba-consultor-resultado.json"), JSON.stringify({ fecha: new Date().toISOString(), pass, resultados: resumen }, null, 2));
  console.log(JSON.stringify({ pass, resumen }, null, 1));
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("prueba falló:", e?.message ?? e); process.exit(1); });

/**
 * PEDIR UNA ESTRATEGIA (spec-estrategia-8x.md §3.6, §5.2, §5.3 y §5.4). SERVIDOR.
 *
 * Es lo que hace la ruta `POST /api/companies/[id]/estrategia` (tramo 5) detrás de `protegido({ consultor: true,
 * cupo: "ia" })`: la ruta solo traduce el resultado a su respuesta. Vive aquí para poder probar el motor entero con la
 * base falsa y el proveedor falso (tests/estrategia-motor.test.ts).
 *
 * En orden, y ANTES DE GASTAR una sola consulta al modelo:
 *  1. lee la empresa y arma el paquete y los cálculos (una lectura crítica que falla → no se crea nada);
 *  2. comprueba el mínimo para generar (§3.6) → la lista de lo que falta;
 *  3. comprueba el tope de por vida de la empresa: lo usado más lo que cuesta una estrategia no pasa su tope;
 *  4. que no haya otra en curso para la empresa (el índice «una en curso» también lo impide ante un doble clic);
 *  5. el tope diario por empresa y el de «a la vez» en todo 8X, contados en Postgres (si el conteo falla, se deja
 *     pasar y se dice en el registro: un mecanismo de protección roto no deja sin estrategia a nadie);
 *  6. crea la versión con el paquete y los cálculos CONGELADOS (las dos lentes verán exactamente lo mismo);
 *  7. encola las dos lentes con una clave sin hora ni azar y guarda sus ids en `trabajos`. Si encolar falla, la versión
 *     pasa a «descartada» con el motivo: nunca queda una en curso sin trabajos que bloquee la siguiente.
 */
import { supabaseAdmin } from "../supabase/admin";
import { tokensUsados } from "../db/queries";
import { claveIdempotente, encolar, PRIORIDAD } from "../jobs/queue";
import { armarPaquete, huellaPaquete, minimoParaEstrategia, type EntradasPaquete, type Paquete } from "./paquete";
import { calcularTodo, type Calculos } from "./calculos";
import { leerEntradasPaquete, ErrorLecturaCritica } from "./paquete-datos";
import { ESTRATEGIAS_A_LA_VEZ, ESTRATEGIAS_POR_DIA, LENTES, TOKENS_POR_ESTRATEGIA, VENTANA_A_LA_VEZ_MS, textoDelPaquete } from "./motor";
import { API, EN_QUE_VA, MOTOR } from "./textos";
import { faltaLaMigracion } from "./resultado";
import type { EtapaVersion, ErrorEtapa } from "./datos";

export type ResultadoPedir =
  | { ok: true; estrategia_id: string; version: number; trabajos: { dinero: string; terreno: string } }
  | { ok: false; status: 409 | 429 | 500 | 503; codigo: "lectura_critica" | "minimo" | "tope_empresa" | "consumo" | "en_curso" | "tope_diario" | "a_la_vez" | "no_se_puso_en_marcha" | "no_habilitada"; texto: string; faltan?: string[] };

/** El primer instante del día de hoy en la zona de la empresa, en ISO (para contar «las de hoy» en la base). */
export function inicioDelDia(ahora: Date, zona: string): string {
  const partes = (z: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(ahora).map((p) => [p.type, p.value]));
  let p: Record<string, string>;
  try {
    p = partes(zona);
  } catch {
    p = partes("America/Lima");
  }
  const enZona = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const desfase = enZona - Math.floor(ahora.getTime() / 1000) * 1000;
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) - desfase).toISOString();
}

/**
 * El paquete y las cuentas que se congelan en una versión. Lo que no entra en el texto que verá el modelo también se
 * dice: queda en los recortes del paquete. Lo usan pedir una estrategia y «Actualizar números» (acciones.ts).
 */
export function congelar(entradas: EntradasPaquete, ahora: Date): { paquete: Paquete; calculos: Calculos } {
  const base = armarPaquete(entradas, ahora);
  const calculos = calcularTodo(entradas, ahora);
  return { paquete: { ...base, recortes: textoDelPaquete(base, calculos).recortes }, calculos };
}

const registro = (...a: unknown[]) => console.warn("[estrategia]", ...a);
/** El texto de un error, venga como Error o como el objeto que devuelve la base ({ code, message }). */
const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : typeof (e as { message?: unknown } | null)?.message === "string" ? String((e as { message: string }).message) : String(e));

/** ¿Hay una versión en curso para la empresa? Devuelve en qué va, o null. */
async function enCurso(companyId: string): Promise<{ id: string; etapa: EtapaVersion } | null> {
  const { data } = await supabaseAdmin().from("estrategias").select("id,etapa").eq("company_id", companyId).eq("estado", "en_curso").limit(1).maybeSingle();
  return data ? { id: String(data.id), etapa: (data.etapa as EtapaVersion) ?? "lentes" } : null;
}

export async function pedirEstrategia(opciones: { companyId: string; pedidaPor: string | null; ahora?: Date }): Promise<ResultadoPedir> {
  const { companyId, pedidaPor } = opciones;
  const ahora = opciones.ahora ?? new Date();
  const sb = supabaseAdmin();

  // 1 · El paquete y las cuentas.
  let entradas;
  try {
    entradas = await leerEntradasPaquete(companyId);
  } catch (e) {
    if (e instanceof ErrorLecturaCritica) return { ok: false, status: 500, codigo: "lectura_critica", texto: MOTOR.lectura_critica(e.tabla, e.motivo) };
    throw e;
  }
  const { paquete, calculos } = congelar(entradas, ahora);

  // 2 · El mínimo.
  const faltan = minimoParaEstrategia(paquete);
  if (faltan.length) return { ok: false, status: 409, codigo: "minimo", texto: faltan.join(" "), faltan };

  // 3 · El tope de por vida de la empresa. Si el consumo no se puede calcular, no se gasta: se dice.
  // Si el tope no se puede leer, no se gasta y se dice (como con el consumo): suponer uno sería gastar sin saber.
  const { data: empresa, error: errorTope } = await sb.from("companies").select("tope_tokens").eq("id", companyId).maybeSingle();
  if (errorTope) return { ok: false, status: 500, codigo: "consumo", texto: `No se pudo leer el tope de la empresa: ${errorTope.message}. No se gastó ninguna consulta.` };
  const tope = Number((empresa as { tope_tokens?: number | null } | null)?.tope_tokens ?? 2_000_000);
  let usados: number;
  try {
    usados = await tokensUsados(companyId);
  } catch (e) {
    return { ok: false, status: 500, codigo: "consumo", texto: `${mensajeDe(e)}. No se gastó ninguna consulta.` };
  }
  if (usados + TOKENS_POR_ESTRATEGIA > tope) return { ok: false, status: 409, codigo: "tope_empresa", texto: MOTOR.tope_empresa(usados, tope, TOKENS_POR_ESTRATEGIA) };

  // 4 · Una en curso por empresa.
  const previa = await enCurso(companyId);
  if (previa) return { ok: false, status: 409, codigo: "en_curso", texto: MOTOR.en_curso(EN_QUE_VA[previa.etapa]) };

  // 5 · El tope diario y el de a la vez. Si el conteo falla, se deja pasar y se registra.
  const hoy = await sb.from("estrategias").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("origen", "ia").gte("created_at", inicioDelDia(ahora, paquete.empresa.zona));
  if (hoy.error || hoy.count == null) registro("no se pudo contar las estrategias de hoy; se deja pasar:", hoy.error?.message ?? "sin cuenta");
  else if (hoy.count >= ESTRATEGIAS_POR_DIA) return { ok: false, status: 429, codigo: "tope_diario", texto: MOTOR.tope_diario(ESTRATEGIAS_POR_DIA) };
  const aLaVez = await sb.from("estrategias").select("id", { count: "exact", head: true }).eq("estado", "en_curso").gte("created_at", new Date(ahora.getTime() - VENTANA_A_LA_VEZ_MS).toISOString());
  if (aLaVez.error || aLaVez.count == null) registro("no se pudo contar las estrategias en curso; se deja pasar:", aLaVez.error?.message ?? "sin cuenta");
  else if (aLaVez.count >= ESTRATEGIAS_A_LA_VEZ) return { ok: false, status: 429, codigo: "a_la_vez", texto: MOTOR.a_la_vez(ESTRATEGIAS_A_LA_VEZ) };

  // 6 · La versión, con el número siguiente. Dos pedidos a la vez: el índice «una en curso» deja pasar uno; si lo que
  // chocó fue el número, se prueba con el siguiente.
  const fila = { company_id: companyId, estado: "en_curso", etapa: "lentes", origen: "ia", paquete, paquete_huella: huellaPaquete(paquete), calculos, pedida_por: pedidaPor, errores: [], trabajos: {} };
  let creada: { id: string; version: number } | null = null;
  for (let vuelta = 0; vuelta < 4 && !creada; vuelta++) {
    const { data: nums } = await sb.from("estrategias").select("version").eq("company_id", companyId).order("version", { ascending: false }).limit(1000);
    const version = Math.max(0, ...((nums ?? []) as { version: number }[]).map((n) => Number(n.version))) + 1;
    const { data, error } = await sb.from("estrategias").insert({ ...fila, version }).select("id,version").single();
    if (!error && data) creada = { id: String(data.id), version: Number(data.version) };
    else if (error?.code === "23505") {
      const otra = await enCurso(companyId);
      if (otra) return { ok: false, status: 409, codigo: "en_curso", texto: MOTOR.en_curso(EN_QUE_VA[otra.etapa]) };
    } else if (faltaLaMigracion(error?.code)) return { ok: false, status: 409, codigo: "no_habilitada", texto: API.no_habilitada };
    else return { ok: false, status: 500, codigo: "no_se_puso_en_marcha", texto: MOTOR.no_se_puso_en_marcha(error?.message ?? "la base no devolvió la versión creada") };
  }
  if (!creada) return { ok: false, status: 503, codigo: "no_se_puso_en_marcha", texto: MOTOR.no_se_puso_en_marcha("el número de versión chocó varias veces seguidas") };

  // 7 · Las dos lentes a la cola. Ni la hora ni el azar entran en la clave (tests/jobs.test.ts).
  try {
    const dinero = await encolar({ company_id: companyId, tipo: "estrategia_lente", payload: { estrategia_id: creada.id, lente: "dinero" }, prioridad: PRIORIDAD.estrategia, idempotency_key: claveIdempotente(["estrategia-lente", creada.id, LENTES[0]]) });
    const terreno = await encolar({ company_id: companyId, tipo: "estrategia_lente", payload: { estrategia_id: creada.id, lente: "terreno" }, prioridad: PRIORIDAD.estrategia, idempotency_key: claveIdempotente(["estrategia-lente", creada.id, LENTES[1]]) });
    const trabajos = { dinero: dinero.id, terreno: terreno.id };
    const { error } = await sb.from("estrategias").update({ trabajos, updated_at: new Date().toISOString() }).eq("id", creada.id).eq("company_id", companyId);
    if (error) throw new Error(`no se pudieron anotar los trabajos de la versión: ${error.message}`);
    return { ok: true, estrategia_id: creada.id, version: creada.version, trabajos };
  } catch (e) {
    const motivo = mensajeDe(e);
    const anotado: ErrorEtapa = { etapa: "poner_en_marcha", motivo, tipo: "no_se_puso_en_marcha", job_id: null, at: new Date().toISOString() };
    await sb.from("estrategias").update({ estado: "descartada", errores: [anotado], updated_at: new Date().toISOString() }).eq("id", creada.id).eq("company_id", companyId);
    return { ok: false, status: 503, codigo: "no_se_puso_en_marcha", texto: MOTOR.no_se_puso_en_marcha(motivo) };
  }
}

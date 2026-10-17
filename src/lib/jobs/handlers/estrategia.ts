/**
 * LOS DOS TRABAJOS DE LA ESTRATEGIA (spec-estrategia-8x.md §5.3 y §5.4).
 *
 *  - `estrategia_lente` (payload { estrategia_id, lente }): una lente piensa su camino con el paquete y los cálculos
 *    CONGELADOS de la versión (no relee la empresa: las dos ven exactamente lo mismo). Si su columna ya está llena —un
 *    reintento después de haber pagado la llamada— no vuelve a llamar al modelo. Guarda con `estrategia_lente_lista`,
 *    que en una sola ida a la base dice si ya están las dos; quien recibe `true` proyecta los dos caminos, los guarda y
 *    encola UN equipo rojo (su clave idempotente hace que dos `true` sean un solo trabajo).
 *  - `estrategia_rojo` (payload { estrategia_id, reparar? }): el equipo rojo ataca y deja lo final; el código aplica
 *    sus cambios, valida y, si hay errores y no es la reparación, encola UNA reparación. En la reparación, lo que siga
 *    inválido se quita con marca visible. Después: la lista de control, las preguntas propuestas para el dueño, y la
 *    versión queda «lista» o «con_observaciones», con `salida` y `vigente` iguales al nacer.
 *
 * NADA EN SILENCIO Y NADA EN BUCLE:
 *  - Una salida que no valida (o que salió cortada por tamaño) NO vuelve a la cola: se anota la etapa fallida en
 *    `errores` con su motivo, el trabajo termina, y repetirla lo decide la consultora con un botón. La versión sigue
 *    en curso: si se marcara fallida, la otra lente ya no se guardaría y su llamada pagada se perdería.
 *  - La cuota del día agotada (429 con `PerDay`) se anota y no se relanza: relanzada, el worker la reintentaría
 *    gastando más.
 *  - Sin crédito (402) se relanza: el worker devuelve el trabajo a la cola sin gastar el intento.
 *  - Lo ya pagado queda guardado en la fila; reintentar una etapa no repite las otras.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarErrorLlamada, registrarLlamada } from "@/lib/db/queries";
import { AIRateLimitError, AIValidationError } from "@/lib/ai/provider";
import { correrLenteDinero } from "@/lib/ai/agents/lente-dinero";
import { correrLenteTerreno } from "@/lib/ai/agents/lente-terreno";
import { correrEquipoRojo } from "@/lib/ai/agents/equipo-rojo";
import { claveIdempotente, encolar, progreso, PRIORIDAD } from "../queue";
import { conIds, LETRA_DE_LENTE, type Lente } from "@/lib/estrategia/armar";
import { armarYValidar, cerrarEstrategia, materialEquipoRojo, materialLente, proyectarLentes } from "@/lib/estrategia/motor";
import { pedidosDesdeFaltantes } from "@/lib/estrategia/pedidos";
import { proponerPreguntas } from "@/lib/estrategia/preguntas";
import { leerVersionPorId, type ErrorEtapa, type EtapaMotor, type GuardadoEquipoRojo, type VersionEstrategia } from "@/lib/estrategia/datos";
import { ETAPA, MOTOR } from "@/lib/estrategia/textos";
import type { SalidaEquipoRojo } from "@/lib/estrategia/esquemas";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

const IdVersion = z.string().min(8).max(64);
const PayloadLente = z.object({ estrategia_id: IdVersion, lente: z.enum(["dinero", "terreno"]) });
const PayloadRojo = z.object({ estrategia_id: IdVersion, reparar: z.literal(true).optional() });

const AGENTE_DE_LENTE: Record<Lente, "lente_dinero" | "lente_terreno"> = { dinero: "lente_dinero", terreno: "lente_terreno" };
const ahoraIso = () => new Date().toISOString();

// ─── Fallas que no vuelven a la cola ─────────────────────────────────────────────────────────────

type Falla = { tipo: ErrorEtapa["tipo"]; motivo: string };

/**
 * Las fallas que se anotan y NO se relanzan: una salida que no valida (o cortada por tamaño, que es un error del
 * esquema y no del modelo) y la cuota del día agotada. Todo lo demás se relanza y lo maneja el worker.
 */
export function fallaQueNoSeReintenta(e: unknown): Falla | null {
  if (e instanceof AIValidationError) {
    if (e.raw?.startsWith("[finishReason=MAX_TOKENS]")) return { tipo: "cortada", motivo: MOTOR.cortada };
    const detalle = e.message.replace(/^[^:]*:\s*/, "").slice(0, 240) || "sin detalle";
    return { tipo: "salida_invalida", motivo: MOTOR.no_valido(detalle) };
  }
  // La cuota del día la marca el adaptador al leer el detalle de la respuesta (gemini.ts, cuotaDelDia); el texto queda
  // como respaldo por si otro proveedor la dice en su mensaje.
  if (e instanceof AIRateLimitError && (e.porDia || /PerDay/i.test(e.message))) return { tipo: "cuota_del_dia", motivo: MOTOR.cuota_del_dia };
  return null;
}

// ─── Escrituras en la versión (siempre de ESTA empresa y solo mientras está en curso) ────────────

async function guardarEnVersion(v: Pick<VersionEstrategia, "id" | "company_id">, cambios: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("estrategias")
    .update({ ...cambios, updated_at: ahoraIso() })
    .eq("id", v.id)
    .eq("company_id", v.company_id)
    .eq("estado", "en_curso")
    .select("id");
  if (error) throw new Error(`No se pudo guardar el avance de la estrategia: ${error.message}`);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Anota la etapa fallida en `errores` (con el trabajo que falló) y devuelve lo que queda como resultado del trabajo. */
async function anotarFalla(job: Job, v: Pick<VersionEstrategia, "id" | "company_id">, etapa: EtapaMotor, agente: string, falla: Falla) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("estrategias").select("errores").eq("id", v.id).eq("company_id", v.company_id).maybeSingle();
  const previos = Array.isArray((data as { errores?: unknown } | null)?.errores) ? ((data as { errores: ErrorEtapa[] }).errores) : [];
  const nuevo: ErrorEtapa = { etapa, tipo: falla.tipo, motivo: falla.motivo, job_id: job.id, at: ahoraIso() };
  await guardarEnVersion(v, { errores: [...previos, nuevo] });
  await registrarErrorLlamada(job.company_id, job.id, agente, `${falla.tipo}: ${falla.motivo}`, 0).catch(() => {});
  // El trabajo termina «hecho» con la falla en su resultado: así la pantalla la ve aunque `errores` se hubiera pisado.
  return { fallida: true, etapa, tipo: falla.tipo, motivo: falla.motivo };
}

/** Anota en `trabajos` el último trabajo de una etapa. Sin `reemplazar`, no pisa uno ya anotado (un reintento). */
async function anotarTrabajo(v: Pick<VersionEstrategia, "id" | "company_id">, etapa: EtapaMotor, jobId: string, reemplazar: boolean) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("estrategias").select("trabajos").eq("id", v.id).eq("company_id", v.company_id).maybeSingle();
  const trabajos = ((data as { trabajos?: Record<string, string> } | null)?.trabajos ?? {}) as Record<string, string>;
  if (!reemplazar && trabajos[etapa]) return;
  const { error } = await sb.from("estrategias").update({ trabajos: { ...trabajos, [etapa]: jobId }, updated_at: ahoraIso() }).eq("id", v.id).eq("company_id", v.company_id);
  if (error) throw new Error(`No se pudo anotar el trabajo de ${ETAPA[etapa].nombre}: ${error.message}`);
}

// ─── Las lentes ──────────────────────────────────────────────────────────────────────────────────

export async function handleEstrategiaLente(job: Job) {
  const p = PayloadLente.safeParse(job.payload);
  if (!p.success) return { omitido: "el trabajo no dice qué versión ni qué lente" };
  const { estrategia_id, lente } = p.data;
  const v = await leerVersionPorId(job.company_id, estrategia_id);
  if (!v) return { omitido: "la versión no existe" };
  if (v.estado !== "en_curso") return { omitido: `la versión ya no está en curso (${v.estado})` };

  let salida = lente === "dinero" ? v.lente_dinero : v.lente_terreno;
  if (!salida) {
    await progreso(job.id, ETAPA[lente].pensando);
    try {
      // Solo el paquete y los cálculos congelados: nunca la otra lente.
      const material = materialLente(lente, v.paquete, v.calculos);
      const r = lente === "dinero" ? await correrLenteDinero(material) : await correrLenteTerreno(material);
      await registrarLlamada(job.company_id, job.id, AGENTE_DE_LENTE[lente], r);
      salida = conIds(r.data, LETRA_DE_LENTE[lente]);
    } catch (e) {
      const falla = fallaQueNoSeReintenta(e);
      if (falla) return anotarFalla(job, v, lente, AGENTE_DE_LENTE[lente], falla);
      throw e;
    }
  }

  // Guarda y dice, en una sola ida a la base, si ya están las dos (de dos llegadas casi a la vez, solo la segunda las ve).
  let lasDos: boolean;
  const { data, error } = await supabaseAdmin().rpc("estrategia_lente_lista", { p_id: estrategia_id, p_lente: lente, p_salida: salida });
  if (!error) lasDos = data === true;
  else {
    // Si la función de la base falla, lo pagado no se pierde: se guarda la columna directo y se mira si ya están las dos.
    // Que el equipo rojo sea uno solo lo garantiza su clave idempotente, no esta coordinación.
    console.warn(`[estrategia] estrategia_lente_lista falló; se guarda ${ETAPA[lente].nombre} sin ella:`, error.message);
    if (!(await guardarEnVersion(v, { [lente === "dinero" ? "lente_dinero" : "lente_terreno"]: salida }))) return { lente, las_dos: false };
    const fresca = await leerVersionPorId(job.company_id, estrategia_id);
    lasDos = !!fresca?.lente_dinero && !!fresca?.lente_terreno;
  }
  if (!lasDos) return { lente, las_dos: false };
  const rojo = await lanzarEquipoRojo(job.company_id, estrategia_id);
  return { lente, las_dos: true, rojo };
}

/**
 * Con las dos lentes guardadas: proyecta los dos caminos, los guarda y encola UN equipo rojo. También lo usa
 * «Reintentar esta etapa» cuando las dos lentes quedaron y nadie puso en marcha la prueba (no hay trabajo previo que
 * reencolar): la clave idempotente hace que, aunque se llame dos veces, sea un solo trabajo.
 */
export async function lanzarEquipoRojo(companyId: string, estrategiaId: string): Promise<string | null> {
  const v = await leerVersionPorId(companyId, estrategiaId);
  if (!v || v.estado !== "en_curso" || !v.lente_dinero || !v.lente_terreno) return null;
  if (v.etapa === "lentes") {
    const proyecciones = v.proyecciones_lentes ?? proyectarLentes(v.paquete, v.calculos, v.lente_dinero, v.lente_terreno);
    await guardarEnVersion(v, { proyecciones_lentes: proyecciones, etapa: "equipo_rojo" });
  }
  const rojo = await encolar({
    company_id: companyId,
    tipo: "estrategia_rojo",
    payload: { estrategia_id: estrategiaId },
    prioridad: PRIORIDAD.estrategia,
    idempotency_key: claveIdempotente(["estrategia-rojo", estrategiaId, "1"]),
  });
  await anotarTrabajo(v, "rojo", rojo.id, false);
  return rojo.id;
}

// ─── El equipo rojo ──────────────────────────────────────────────────────────────────────────────

export async function handleEstrategiaRojo(job: Job) {
  const p = PayloadRojo.safeParse(job.payload);
  if (!p.success) return { omitido: "el trabajo no dice qué versión" };
  const reparar = p.data.reparar === true;
  const v = await leerVersionPorId(job.company_id, p.data.estrategia_id);
  if (!v) return { omitido: "la versión no existe" };
  if (v.estado !== "en_curso") return { omitido: `la versión ya no está en curso (${v.estado})` };
  if (!v.lente_dinero || !v.lente_terreno) return anotarFalla(job, v, "rojo", "equipo_rojo", { tipo: "error", motivo: MOTOR.faltan_las_lentes });

  const dinero = v.lente_dinero;
  const terreno = v.lente_terreno;
  const proyecciones = v.proyecciones_lentes ?? proyectarLentes(v.paquete, v.calculos, dinero, terreno);
  const guardado: GuardadoEquipoRojo | null = v.equipo_rojo?.primera ? v.equipo_rojo : null;
  const base = { paquete: v.paquete, calculos: v.calculos, dinero, terreno };

  if (!reparar) {
    let primera = guardado?.primera ?? null;
    if (!primera) {
      await progreso(job.id, ETAPA.rojo.pensando);
      try {
        const r = await correrEquipoRojo(materialEquipoRojo({ ...base, proyecciones }));
        await registrarLlamada(job.company_id, job.id, "equipo_rojo", r);
        primera = r.data;
      } catch (e) {
        const falla = fallaQueNoSeReintenta(e);
        if (falla) return anotarFalla(job, v, "rojo", "equipo_rojo", falla);
        throw e;
      }
      await guardarEnVersion(v, { equipo_rojo: { primera, reparacion: null } satisfies GuardadoEquipoRojo });
    }
    const { validacion } = armarYValidar({ ...base, rojo: primera });
    if (validacion.errores.length) {
      // Una sola reparación, con la lista de lo que rechazó el validador.
      await guardarEnVersion(v, { validacion: { ...validacion, de: "primera" }, etapa: "reparacion" });
      const rep = await encolar({
        company_id: job.company_id,
        tipo: "estrategia_rojo",
        payload: { estrategia_id: v.id, reparar: true },
        prioridad: PRIORIDAD.estrategia,
        idempotency_key: claveIdempotente(["estrategia-rojo", v.id, "2"]),
      });
      await anotarTrabajo(v, "rojo", rep.id, true);
      return { reparacion: rep.id, errores: validacion.errores.length };
    }
    return terminar(job, v, primera, false);
  }

  // ── La reparación (una sola vez).
  const primera = guardado?.primera;
  if (!primera) return anotarFalla(job, v, "rojo", "equipo_rojo", { tipo: "error", motivo: "no está la salida que había que reparar" });
  let final: SalidaEquipoRojo | null = guardado?.reparacion ?? null;
  if (!final) {
    const violaciones = v.validacion.errores?.length ? v.validacion.errores : armarYValidar({ ...base, rojo: primera }).validacion.errores;
    await progreso(job.id, ETAPA.revision.pensando);
    try {
      const r = await correrEquipoRojo(materialEquipoRojo({ ...base, proyecciones, reparacion: { anterior: primera, violaciones } }));
      await registrarLlamada(job.company_id, job.id, "equipo_rojo", r);
      final = r.data;
      await guardarEnVersion(v, { equipo_rojo: { primera, reparacion: final } satisfies GuardadoEquipoRojo });
    } catch (e) {
      const falla = fallaQueNoSeReintenta(e);
      if (!falla) throw e;
      // Si la reparación no sirve (no valida o se acabó la cuota del día), no se pierde lo pagado: se cierra con la
      // primera salida, quitando lo inválido con marca. Queda «con_observaciones» y la consultora decide.
      await registrarErrorLlamada(job.company_id, job.id, "equipo_rojo", `${falla.tipo}: ${falla.motivo}`, 0).catch(() => {});
      final = primera;
    }
  }
  return terminar(job, v, final, true);
}

/** Arma, valida (y en la reparación quita lo inválido), corre la lista de control, propone las preguntas y cierra. */
async function terminar(job: Job, v: VersionEstrategia, rojo: SalidaEquipoRojo, quitar: boolean) {
  await progreso(job.id, ETAPA.revision.pensando);
  // Si la versión dejó de estar en curso (la descartaron mientras tanto), no se proponen preguntas para ella.
  if (!(await guardarEnVersion(v, { etapa: "armado" }))) return { omitido: "la versión dejó de estar en curso antes de cerrarse" };
  const cierre = cerrarEstrategia({ paquete: v.paquete, calculos: v.calculos, dinero: v.lente_dinero!, terreno: v.lente_terreno!, rojo }, { quitar });
  // Las preguntas van antes de cerrar la versión: si fallan, el trabajo se reintenta sin volver a llamar al modelo.
  const pedidos = pedidosDesdeFaltantes(cierre.estrategia, v.paquete, v.version);
  const preguntas = await proponerPreguntas(job.company_id, v.id, pedidos.preguntas);
  const cerrada = await guardarEnVersion(v, {
    salida: cierre.estrategia,
    vigente: cierre.estrategia,
    validacion: { ...cierre.validacion, de: "final" },
    calidad: { items: cierre.calidad },
    estado: cierre.estado,
    etapa: "terminada",
  });
  if (!cerrada) return { omitido: "la versión dejó de estar en curso mientras se cerraba" };
  return { estado: cierre.estado, errores: cierre.validacion.errores.length, quitadas: cierre.quitadas, preguntas };
}

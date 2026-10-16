/**
 * El tablero del empresario (maqueta aprobada): todo lo que muestra sale de datos contados o
 * verificados de SU empresa. Regla: ningún número decorativo — si el dato no existe, la tarjeta
 * no se muestra o pide el dato.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase/admin";
import { coberturaSesion } from "./rules/cobertura";
import { bibliotecaEsperada } from "./biblioteca";
import { planDe, preguntaAbiertaDe, progresoEntrada } from "./entrada";
import { registrarError } from "./errores";
import type { Metrica } from "./metricas";
import { zonaDeEmpresa } from "./revision-semanal";
import {
  direccionSinConfirmar, puntoDePartidaSinAceptar, tareasDelEquipo, indicadoresSinValor, periodoQueToca, numerosQueFaltan, SIN_PENDIENTES,
  type EntradaTablero, type Pendientes, type IndicadorPendiente, type ActaBreve, type MedicionBreve, type AccionBreve, type IndicadorBreve,
} from "./siguiente-accion";

// La entrada breve y su siguiente acción son reglas puras: viven en siguiente-accion.ts con el resto de la
// decisión. Se siguen exportando desde aquí, con los mismos nombres, para quien ya las importaba de este archivo.
export { accionDeEntrada, RUTA_ENTRADA, type EntradaTablero, type SiguienteAccion } from "./siguiente-accion";

export type PuntoVenta = { periodo: string; valor: number; estado: string };
export type Tablero = {
  preguntaAbierta: string | null;
  comprension: number; // 0-100
  kpis: { venta: { valor: number; periodo: string; estado: string } | null; ganancia: { valor: number; periodo: string } | null; deuda: number | null };
  serieVentas: PuntoVenta[];
  epocaDorada: number | null;
  biblioteca: { listos: number; total: number; personas: number | null };
  /** La entrada breve del dueño. null = esta empresa no tiene (nació antes de que existiera, o falta la migración). */
  entrada: EntradaTablero | null;
};

/** El estado de la entrada a partir de su sesión y sus filas. Pura. */
export function entradaDesde(
  sesion: { estado: string | null; plan: unknown; sintesis_confirmada_at: string | null },
  filas: { clave_pregunta: string | null; respuesta: string | null; orden: number | null }[]
): EntradaTablero {
  const plan = planDe(sesion.plan);
  const { respondidas, total } = progresoEntrada(plan, filas);
  if (sesion.sintesis_confirmada_at) return { estado: "confirmada", respondidas, total };
  if (respondidas >= total && !preguntaAbiertaDe(plan, filas)) return { estado: "por_confirmar", respondidas, total };
  return { estado: respondidas > 0 || filas.length > 0 ? "en_curso" : "sin_empezar", respondidas, total };
}

const LISTOS = ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo", "en_uso"];

export async function tableroEmpresario(companyId: string): Promise<Tablero> {
  const sb = supabaseAdmin();
  const [{ data: metricas }, { data: sesiones }, { data: activos }, { data: empresa }, { data: abiertas }, { data: sesionEntrada }] = await Promise.all([
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(80),
    sb.from("interview_sessions").select("id,tipo,bloques_cubiertos, participants!inner(rol)").eq("company_id", companyId).in("tipo", ["sueno_dueno", "empresa_dueno"]).in("participants.rol", ["dueno", "socio"]),
    sb.from("company_assets").select("clave,estado").eq("company_id", companyId),
    sb.from("companies").select("ficha").eq("id", companyId).single(),
    sb
      .from("interview_responses")
      .select("pregunta,orden, interview_sessions!inner(company_id,tipo)")
      .eq("interview_sessions.company_id", companyId)
      // La pregunta abierta de la entrada breve no es «tu conversación a mitad»: tiene su propia pantalla y su
      // propia siguiente acción (accionDeEntrada). Aquí solo cuentan las entrevistas de siempre.
      .neq("interview_sessions.tipo", "entrada_breve")
      .is("respuesta", null)
      .order("orden")
      .limit(1),
    // La entrada de la empresa: una sola, la primera. Si la migración no está aplicada esta consulta falla,
    // `data` llega nulo y el tablero sigue como antes: sin entrada.
    sb.from("interview_sessions").select("id,estado,plan,sintesis_confirmada_at").eq("company_id", companyId).eq("tipo", "entrada_breve").order("created_at").limit(1).maybeSingle(),
  ]);

  let entrada: EntradaTablero | null = null;
  if (sesionEntrada) {
    const { data: filasEntrada } = await sb.from("interview_responses").select("clave_pregunta,respuesta,orden").eq("session_id", sesionEntrada.id);
    entrada = entradaDesde(sesionEntrada, filasEntrada ?? []);
  }

  // Comprensión: promedio de la cobertura de las sesiones del dueño y del levantamiento por áreas.
  let cobSesiones = 0;
  if (sesiones?.length) {
    const { data: resp } = await sb.from("interview_responses").select("bloque,session_id").not("respuesta", "is", null).in("session_id", sesiones.map((s) => s.id));
    cobSesiones =
      sesiones.reduce((acc, s) => {
        const propias = (resp ?? []).filter((r) => r.session_id === s.id).map((r) => ({ bloque: r.bloque }));
        return acc + coberturaSesion(s.tipo, propias, ((s as { bloques_cubiertos?: string[] | null }).bloques_cubiertos ?? []) as string[]).porcentaje;
      }, 0) / sesiones.length;
  }
  const ficha = (empresa?.ficha ?? null) as Record<string, string> | null;
  const personas = ficha?.personas ? parseInt(ficha.personas, 10) : null;
  const esperadas = bibliotecaEsperada(personas);
  const listos = esperadas.filter((c) => LISTOS.includes((activos ?? []).find((a) => a.clave === c)?.estado ?? "")).length;
  const docsPct = esperadas.length ? (listos / esperadas.length) * 100 : 0;
  const comprension = Math.round(cobSesiones * 0.65 + docsPct * 0.35);

  const meses = (metricas ?? [])
    .filter((m) => m.clave === "venta_mes" && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo))
    .map((m) => ({ periodo: m.periodo, valor: Number(m.valor), estado: m.estado }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-6);
  const ultimo = meses[meses.length - 1] ?? null;
  const ganancia = (metricas ?? []).filter((m) => m.clave === "ganancia_mes" && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo)).pop();
  const deuda = (metricas ?? []).find((m) => m.clave === "deuda_clientes" && m.valor != null);
  const dorada = (metricas ?? []).find((m) => (m.clave === "venta_epoca_dorada" || (m.clave === "venta_mes" && m.periodo === "epoca_dorada")) && m.valor != null);

  return {
    preguntaAbierta: abiertas?.[0]?.pregunta ? String(abiertas[0].pregunta) : null,
    comprension: Math.max(0, Math.min(100, comprension)),
    kpis: {
      venta: ultimo ? { valor: ultimo.valor, periodo: ultimo.periodo, estado: ultimo.estado } : null,
      ganancia: ganancia ? { valor: Number(ganancia.valor), periodo: ganancia.periodo } : null,
      deuda: deuda ? Number(deuda.valor) : null,
    },
    serieVentas: meses,
    epocaDorada: dorada ? Number(dorada.valor) : null,
    biblioteca: { listos, total: esperadas.length, personas },
    entrada,
  };
}

// ───────────────────────── LO QUE ESPERA AL DUEÑO (lecturas para la siguiente acción) ─────────────────────────

type Lector = Pick<SupabaseClient, "from">;
type ErrorBase = { message?: string | null; code?: string | null };
type Respuesta = { data: unknown; error: ErrorBase | null };

/**
 * ¿El error dice que la tabla o la columna todavía no existe en esa base (migración pendiente)? Postgres: 42P01
 * y 42703; PostgREST: PGRST204 y PGRST205. Es la misma regla que `faltaEnLaBase` de cartera.ts.
 */
function faltaMigracion(error: ErrorBase): boolean {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find the (table|column)/i.test(error.message ?? "");
}

/** Quién abre la portada: la cuenta de la empresa, o la consultora en «ver como el empresario». */
export type QuienMira = { id: string; rol: "consultor" | "cliente" };

/**
 * LO QUE ESPERA AL DUEÑO, LEÍDO DE LA BASE, para que `accionPendiente` (siguiente-accion.ts) elija la siguiente
 * acción de la portada. Solo lee; no escribe nada de la empresa.
 *
 * LA PORTADA NUNCA SE CAE POR ESTO. Cada lectura va por separado: si su tabla o su columna todavía no existe
 * (migración pendiente) ese estado no aparece y no pasa nada más; si falla por otra razón tampoco aparece, y el
 * fallo queda en el registro de errores que revisa la consultora. «No se pudo leer» nunca se convierte en «falta»:
 * sin las actas no se sabe si el dueño ya confirmó, y entonces no se le pide que confirme.
 *
 * `informeListo` no sale de aquí: lo sabe quien ya leyó el diagnóstico (la portada, con `empresaHoy`). Aquí solo
 * se lee si hay rastro de que alguien de la empresa abrió el informe.
 */
export async function pendientesDelDueno(companyId: string, quien: QuienMira, opciones: { sb?: Lector; ahora?: Date } = {}): Promise<Pendientes> {
  const ahora = opciones.ahora ?? new Date();
  const fallos: string[] = [];
  let leido: Pendientes = { ...SIN_PENDIENTES, indicadores: [] };
  try {
    const sb = opciones.sb ?? supabaseAdmin();
    /** Las filas de una lectura, o null si no se pudo leer. Una lista vacía es «se leyó y no hay». */
    const filas = async <T>(que: string, pedir: () => PromiseLike<Respuesta>): Promise<T[] | null> => {
      try {
        const { data, error } = await pedir();
        if (!error) return (data ?? []) as T[];
        if (!faltaMigracion(error)) fallos.push(`${que}: ${error.message ?? "sin mensaje"}`);
      } catch (e) {
        fallos.push(`${que}: ${e instanceof Error ? e.message : String(e)}`);
      }
      return null;
    };

    const [membresias, fichas, mediciones, actas, acciones, indicadores, metricas, aperturas, zona] = await Promise.all([
      // Solo el dueño confirma por la empresa. La consultora que mira «como el empresario» ve lo que vería él.
      quien.rol === "consultor"
        ? Promise.resolve(null)
        : filas<{ nivel: string | null }>("la membresía", () => sb.from("memberships").select("nivel").eq("company_id", companyId).eq("user_id", quien.id).limit(1)),
      filas<{ id: string; version: number }>("la ficha de dirección", () =>
        sb.from("ficha_direccion").select("id,version").eq("company_id", companyId).eq("estado", "acordada").order("version", { ascending: false }).limit(1)
      ),
      // Sin las columnas de versión (migración pendiente) tampoco existen las actas: no hay nada que aceptar todavía.
      filas<MedicionBreve>("el punto de partida", () => sb.from("mediciones").select("id,tipo,version,vigente").eq("company_id", companyId).eq("tipo", "linea_base")),
      filas<ActaBreve>("las actas", () =>
        sb.from("actas_aceptacion").select("tipo,referencia_id,aceptado_rol,aceptado_at").eq("company_id", companyId).in("tipo", ["ficha_direccion", "linea_base"])
      ),
      filas<AccionBreve>("el plan", () => sb.from("actions").select("id,estado,verificado_at,fecha_inicio,vence_at").eq("company_id", companyId)),
      filas<IndicadorBreve>("los indicadores", () =>
        sb.from("indicadores").select("id,nombre,estado,frecuencia,estado_validacion").eq("company_id", companyId).eq("estado", "activo").order("created_at")
      ),
      // El mismo corte que «Tus números»: así la portada cuenta los que faltan igual que la pantalla a la que lleva.
      filas<Metrica>("los números", () => sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(200)),
      // /portal/informe deja rastro cada vez que se abre (auditoría del 29-08-2026). Cuenta el de la empresa, no el de la consultora.
      filas<{ id: number }>("el rastro del informe", () =>
        sb.from("audit_log").select("id").eq("company_id", companyId).eq("accion", "ver").eq("entidad", "informe_diagnostico").eq("actor_rol", "cliente").limit(1)
      ),
      // Las semanas y los periodos se cuentan con el reloj de la empresa; sin zona, America/Lima.
      zonaDeEmpresa(companyId, sb).catch(() => null),
    ]);

    // De cada indicador activo solo hace falta saber si el periodo que cerró tiene valor: se piden esos y nada más.
    let sinValor: IndicadorPendiente[] = [];
    if (indicadores?.length) {
      const periodos = [...new Set(indicadores.map((k) => periodoQueToca(k, ahora, zona)))];
      const valores = await filas<{ indicador_id: string; periodo: string }>("los valores de los indicadores", () =>
        sb.from("indicador_valores").select("indicador_id,periodo").in("indicador_id", indicadores.map((k) => k.id)).in("periodo", periodos)
      );
      if (valores) sinValor = indicadoresSinValor(indicadores, valores, ahora, zona);
    }

    const ficha = fichas?.[0] ? { id: String(fichas[0].id), version: Number(fichas[0].version) } : null;
    leido = {
      comoDueno: quien.rol === "consultor" || membresias?.[0]?.nivel === "dueno",
      direccion: fichas && actas ? direccionSinConfirmar(ficha, actas) : null,
      puntoDePartida: mediciones && actas ? puntoDePartidaSinAceptar(mediciones, actas) : null,
      tareas: acciones ? tareasDelEquipo(acciones, ahora, zona) : null,
      indicadores: sinValor,
      numeros: metricas ? numerosQueFaltan(metricas) : null,
      informeListo: false,
      informeAbierto: aperturas ? aperturas.length > 0 : null,
    };
  } catch (e) {
    fallos.push(e instanceof Error ? e.message : String(e));
  }
  if (fallos.length) {
    void registrarError({
      ruta: "/portal", metodo: "GET", actorId: quien.id, companyId,
      mensaje: "La portada no pudo leer parte de lo que espera al dueño: se mostró sin esos avisos.",
      detalle: fallos.join(" · "),
    });
  }
  return leido;
}

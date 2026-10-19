/**
 * RENASER OS · «EQUIPO EN VIVO» (19-10-2026). Cómo está cada persona ahora y qué le pide atención a la gestión:
 * quién abrió el día, quién está en foco, bloqueado o sin señal, los cronómetros olvidados, quién no tiene trabajo
 * puesto para hoy, el ánimo del equipo y la capacidad del día.
 *
 * QUIÉN CUENTA (criterio único con /pulso, src/lib/os/pulso.ts): las personas activas CON cuenta. Una ficha sin cuenta
 * no puede abrir el día ni trabajar en 8X; no es «no abrió»: va aparte, en `sinCuenta`, para que alguien le diga que
 * cree su cuenta con su correo.
 *
 * UN CRONÓMETRO OLVIDADO NO ES TRABAJO: quien lo tiene corriendo hace más de 10 horas no cuenta como «activo» (su estado
 * sale de su último movimiento real) y esas horas no suman a lo registrado hoy ni a la utilización. Se muestra aparte,
 * para que la gestión lo cierre a la hora en que de verdad terminó.
 *
 * `armarEquipo` es pura (la prueba tests/os-equipo.test.ts); `leerEquipo` junta lo que necesita con la credencial del
 * servidor, siempre filtrando por la empresa del contexto.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ContextoOS, PersonaOS } from "./acceso";
import {
  cronometroOlvidado,
  estadoPersona,
  hoyEn,
  iniciales,
  minutosDe,
  textoDuracion,
  type EstadoPersona,
  type RegistroTiempo,
  type TareaOS,
} from "./calculos";
import { aperturasEntre, bloqueosAbiertos, personasDeLaEmpresa, registrosDesde, tareasDe, type Apertura, type Bloqueo } from "./datos";
import { diaEnZona } from "@/lib/revision-semanal";

/**
 * El instante en que empieza un día en el reloj de la empresa (la medianoche de Lima es las 05:00 UTC). Se calcula con
 * el desfase que Intl da para esa zona a esa hora, así sirve para cualquier zona, con o sin horario de verano.
 */
export function inicioDelDia(dia: string, zona: string): Date {
  const guia = new Date(`${dia}T12:00:00Z`);
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guia);
  const de = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  const enZona = Date.UTC(de("year"), de("month") - 1, de("day"), de("hour"), de("minute"));
  const desfase = enZona - guia.getTime(); // lo que la zona va por delante de UTC
  return new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) - desfase);
}

/**
 * Lo que trae un `<input type="datetime-local">` («2026-10-21T16:00») leído en el reloj de la empresa, como instante.
 * null si no tiene esa forma.
 */
export function instanteEn(local: string, zona: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  return new Date(inicioDelDia(m[1]!, zona).getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60000);
}

/** Lo contrario: un instante como valor de `<input type="datetime-local">` en el reloj de la empresa. */
export function localEn(instante: string | Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instante));
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${de("year")}-${de("month")}-${de("day")}T${de("hour")}:${de("minute")}`;
}

/** «8:04 a. m.» en el reloj de la empresa. */
export function horaEn(instante: string | Date, zona: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: zona, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(instante));
}

export type FilaEquipo = {
  persona: Pick<PersonaOS, "id" | "nombre" | "puesto" | "rol" | "capacidad_min" | "user_id">;
  iniciales: string;
  estado: EstadoPersona;
  /** Qué hace ahora, en una frase: la tarea en foco con su tiempo, la causa del bloqueo, su último movimiento… */
  ahora: string;
  abrioA: string | null;
  animo: number | null;
  tareasHoy: number;
  minutosHoy: number;
};

export type Olvidado = { registroId: string; personaId: string; nombre: string; tarea: string; inicio: string };

export type Equipo = {
  hoy: string;
  filas: FilaEquipo[];
  abrieron: number;
  total: number;
  activos: number;
  bloqueados: number;
  sinSenal: number;
  /** Minutos registrados hoy sobre la capacidad de los que abrieron; null si nadie abrió. */
  utilizacion: number | null;
  capacidadMin: number;
  minutosHoy: number;
  olvidados: Olvidado[];
  sinTrabajo: Pick<PersonaOS, "id" | "nombre" | "puesto">[];
  /** Fichas activas que todavía no tienen cuenta: no cuentan en «abrieron X de N». */
  sinCuenta: Pick<PersonaOS, "id" | "nombre" | "puesto" | "email">[];
  animo: { conteo: [number, number, number, number, number]; promedio: number | null };
};

export type EntradaEquipo = {
  personas: readonly PersonaOS[];
  tareas: readonly TareaOS[];
  registros: readonly RegistroTiempo[];
  aperturas: readonly Apertura[];
  bloqueos: readonly Bloqueo[];
  hoy: string;
  zona: string;
  ahora: Date;
};

export function armarEquipo(e: EntradaEquipo): Equipo {
  const { hoy, zona, ahora } = e;
  const inicioHoy = inicioDelDia(hoy, zona).getTime();
  const tituloDe = new Map(e.tareas.map((t) => [t.id, t.titulo]));
  const aperturaDe = new Map(e.aperturas.filter((a) => a.fecha === hoy).map((a) => [a.persona_id, a]));
  const olvidados: Olvidado[] = [];
  const conCuenta = e.personas.filter((p) => p.user_id);

  const filas: FilaEquipo[] = conCuenta.map((p) => {
    const suyos = e.registros.filter((r) => r.persona_id === p.id);
    const corriendo = suyos.find((r) => !r.fin) ?? null;
    const olvidado = !!corriendo && cronometroOlvidado(corriendo, ahora);
    const susTareas = e.tareas.filter((t) => t.persona_id === p.id);
    const bloqueo = e.bloqueos.find((b) => b.persona_id === p.id && !b.hasta) ?? null;
    const apertura = aperturaDe.get(p.id) ?? null;
    // Los minutos de hoy: lo que cae desde la medianoche de la empresa (un tramo que empezó ayer cuenta desde las 00:00).
    const minutosHoy = suyos.filter((r) => !(olvidado && r === corriendo)).reduce((s, r) => {
      const desde = Math.max(new Date(r.inicio).getTime(), inicioHoy);
      const hasta = r.fin ? new Date(r.fin).getTime() : ahora.getTime();
      return s + (hasta > desde ? Math.round((hasta - desde) / 60000) : 0);
    }, 0);
    const movimientos = [
      apertura?.created_at,
      ...suyos.map((r) => (r === corriendo && olvidado ? r.inicio : r.fin ?? r.inicio)),
      ...susTareas.map((t) => t.updated_at),
    ].filter((x): x is string => !!x && new Date(x).getTime() >= inicioHoy);
    const ultimo = movimientos.sort().at(-1) ?? null;
    const estado = estadoPersona({ abrio: !!apertura, bloqueada: !!bloqueo, cronometro: !!corriendo && !olvidado, ultimoMovimiento: ultimo }, ahora);
    if (corriendo && olvidado) {
      olvidados.push({ registroId: corriendo.id, personaId: p.id, nombre: p.nombre, tarea: tituloDe.get(corriendo.tarea_id) ?? "una tarea", inicio: corriendo.inicio });
    }
    const tareasHoy = susTareas.filter((t) => t.fecha_inicio === hoy).length;
    const ahoraTexto =
      estado === "bloqueado" && bloqueo
        ? `Bloqueado: ${bloqueo.causa} · hace ${textoDuracion(Math.round((ahora.getTime() - new Date(bloqueo.desde).getTime()) / 60000))}`
        : corriendo && olvidado
          ? `Cronómetro olvidado en «${tituloDe.get(corriendo.tarea_id) ?? "una tarea"}» · corre hace ${textoDuracion(minutosDe(corriendo, ahora))}`
          : corriendo
            ? `En foco: ${tituloDe.get(corriendo.tarea_id) ?? "una tarea"} · ${textoDuracion(minutosDe(corriendo, ahora))}`
          : estado === "no_abrio"
            ? tareasHoy
              ? `Tiene ${tareasHoy === 1 ? "1 tarea" : `${tareasHoy} tareas`} para hoy`
              : "Sin apertura ni tareas para hoy"
            : ultimo
              ? `Último movimiento ${horaEn(ultimo, zona)}`
              : "Abrió el día y todavía no empezó";
    return {
      persona: { id: p.id, nombre: p.nombre, puesto: p.puesto, rol: p.rol, capacidad_min: p.capacidad_min, user_id: p.user_id },
      iniciales: iniciales(p.nombre),
      estado,
      ahora: ahoraTexto,
      abrioA: apertura ? horaEn(apertura.created_at, zona) : null,
      animo: apertura?.animo ?? null,
      tareasHoy,
      minutosHoy,
    };
  });

  const abrieron = filas.filter((f) => f.estado !== "no_abrio");
  const capacidadMin = abrieron.reduce((s, f) => s + f.persona.capacidad_min, 0);
  const minutosHoy = abrieron.reduce((s, f) => s + f.minutosHoy, 0);
  const conteo: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const f of filas) if (f.animo) conteo[f.animo - 1]++;
  const respuestas = conteo.reduce((s, n) => s + n, 0);
  return {
    hoy,
    filas,
    abrieron: abrieron.length,
    total: filas.length,
    activos: filas.filter((f) => f.estado === "activo").length,
    bloqueados: filas.filter((f) => f.estado === "bloqueado").length,
    sinSenal: filas.filter((f) => f.estado === "sin_senal").length,
    utilizacion: capacidadMin ? Math.round((minutosHoy * 100) / capacidadMin) : null,
    capacidadMin,
    minutosHoy,
    olvidados,
    sinTrabajo: conCuenta.filter((p) => !e.tareas.some((t) => t.persona_id === p.id && t.fecha_inicio === hoy)).map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto })),
    sinCuenta: e.personas.filter((p) => !p.user_id).map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto, email: p.email })),
    animo: {
      conteo,
      promedio: respuestas ? Math.round((conteo.reduce((s, n, i) => s + n * (i + 1), 0) / respuestas) * 10) / 10 : null,
    },
  };
}

export async function leerEquipo(c: ContextoOS, ahora: Date = new Date()): Promise<Equipo> {
  const hoy = hoyEn(c.zona, ahora);
  const personas = await personasDeLaEmpresa(c.companyId);
  const ids = personas.map((p) => p.id);
  const desde = inicioDelDia(hoy, c.zona).toISOString();
  const [tareas, registros, aperturas, bloqueos] = await Promise.all([
    tareasDe(c.companyId, ids),
    registrosDesde(c.companyId, desde, ids),
    aperturasEntre(c.companyId, hoy, hoy),
    bloqueosAbiertos(c.companyId),
  ]);
  return armarEquipo({ personas, tareas, registros, aperturas, bloqueos, hoy, zona: c.zona, ahora });
}

/** El día de un instante en el reloj de la empresa (para comparar con fechas AAAA-MM-DD). */
export function diaDeInstante(instante: string | null | undefined, zona: string): string | null {
  return instante ? diaEnZona(instante, zona) : null;
}

/** Un cronómetro de la empresa (para cerrarlo desde «Equipo en vivo»). */
export async function registroDeLaEmpresa(companyId: string, registroId: string) {
  const { data } = await supabaseAdmin().from("os_registros_tiempo").select("id,persona_id,tarea_id,inicio,fin").eq("id", registroId).eq("company_id", companyId).maybeSingle();
  return data as { id: string; persona_id: string; tarea_id: string; inicio: string; fin: string | null } | null;
}

/**
 * RENASER OS · «MI DÍA» (19-10-2026): las reglas y lecturas de lo que es de cada persona (apertura y cierres, sus
 * tareas con cronómetro, sus entregables, los podios y su perfil). Lo puro va arriba y lo prueba tests/os-dia.test.ts;
 * lo que lee la base va abajo, siempre filtrado por empresa y persona.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extensionDe, nombreSeguro } from "@/lib/archivos";
import { hora as horaFormato, porDefecto } from "@/lib/formato";
import { diaEnZona } from "@/lib/revision-semanal";
import { cumplimiento, minutosTotales, sumarDias, type RegistroTiempo, type TareaOS } from "./calculos";
import { COLUMNAS_REGISTRO, COLUMNAS_TAREA } from "./datos";
import type { PersonaOS } from "./acceso";

/** El cierre del día se abre a las 17:00 de la empresa (como en el prototipo aprobado). */
export const HORA_CIERRE_DIA = 17;
/** «Abrió a tiempo» = abrió antes de las 9:00 de la empresa (podios y racha). */
export const HORA_A_TIEMPO = 9;

/** Hora y minuto de un instante en el reloj de la empresa. */
export function horaLocal(instante: Date | string, zona: string): { h: number; m: number } {
  const d = instante instanceof Date ? instante : new Date(instante);
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const de = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  return { h: de("hour"), m: de("minute") };
}

/** «08:04», con la hora de la empresa (24 horas, como el resto de 8X). */
export function textoHora(instante: Date | string | null | undefined, zona: string): string {
  if (!instante) return "—";
  return horaFormato(instante, { ...porDefecto, zona_horaria: zona });
}

/** Día de la semana ISO: lunes 1 … domingo 7. */
export function diaDeSemana(dia: string): number {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «Lunes 19 de octubre», sin depender del idioma del servidor. */
export function fechaLarga(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const texto = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return texto[0]!.toUpperCase() + texto.slice(1);
}

/** «el jueves», «ayer»: de cuándo viene una tarea pendiente. */
export function desdeCuando(dia: string, hoy: string): string {
  if (dia === sumarDias(hoy, -1)) return "ayer";
  const dias = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86400000);
  if (dias < 7) return `el ${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}`;
  const d = new Date(`${dia}T12:00:00Z`);
  return `el ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function puedeCerrarDia(ahora: Date, zona: string): boolean {
  return horaLocal(ahora, zona).h >= HORA_CIERRE_DIA;
}

/** El cierre semanal se hace de viernes a domingo. */
export function puedeCerrarSemana(hoy: string): boolean {
  return diaDeSemana(hoy) >= 5;
}

/** El viernes de la semana de `hoy` (para decir cuándo se abre el cierre semanal). */
export function viernesDe(lunes: string): string {
  return sumarDias(lunes, 4);
}

/**
 * RACHA: días hábiles seguidos con apertura, contando hacia atrás desde hoy (si ya abrió) o desde el último día hábil.
 * Sábado y domingo no cortan la racha ni la alargan.
 */
export function racha(diasConApertura: ReadonlySet<string>, hoy: string): number {
  let dia = diasConApertura.has(hoy) ? hoy : sumarDias(hoy, -1);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const dow = diaDeSemana(dia);
    if (dow <= 5) {
      if (!diasConApertura.has(dia)) break;
      n++;
    }
    dia = sumarDias(dia, -1);
  }
  return n;
}

// ———————————————————————————————————————— ENTREGABLES ————————————————————————————————————————

export const MAX_MB_ENTREGABLE = 15;

/** Lo que se puede entregar: documentos, hojas, presentaciones, imágenes, texto y zip. Manda la extensión. */
const TIPOS_ENTREGABLE: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

export type ValidacionEntregable = { ok: true; nombre: string; mime: string } | { ok: false; error: string };

export function validarEntregable(a: { nombre: string; bytes: number }): ValidacionEntregable {
  if (a.bytes <= 0) return { ok: false, error: "El archivo está vacío." };
  if (a.bytes > MAX_MB_ENTREGABLE * 1024 * 1024) return { ok: false, error: `El archivo pesa más de ${MAX_MB_ENTREGABLE} MB. Comprímelo o divídelo.` };
  const nombre = nombreSeguro(a.nombre);
  const ext = extensionDe(nombre);
  const mime = TIPOS_ENTREGABLE[ext];
  if (!mime) return { ok: false, error: `No recibimos archivos${ext ? ` .${ext}` : " sin extensión"}. Sube PDF, Word, Excel, PowerPoint, foto, texto o zip.` };
  return { ok: true, nombre, mime };
}

export function textoTamano(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// ———————————————————————————————————————— PODIOS ————————————————————————————————————————

export type FilaPodio = {
  persona_id: string;
  nombre: string;
  puesto: string | null;
  pct: number | null;
  a_tiempo: number;
  completadas: number;
  minutos: number;
  abrio_a_tiempo: number;
};

/**
 * EL PODIO DE LA SEMANA. Cada persona, con: su cumplimiento (calculos.cumplimiento), las tareas que completó, sus
 * minutos de foco y los días que abrió antes de las 9:00. El orden: cumplimiento (sin dato al final), después tareas
 * completadas, después minutos de foco. Al podio solo sube quien tuvo algo que contar esa semana.
 */
export function armarPodio(
  e: {
    personas: readonly Pick<PersonaOS, "id" | "nombre" | "puesto">[];
    tareas: readonly Pick<TareaOS, "persona_id" | "estado" | "fecha_limite" | "completada_at">[];
    registros: readonly Pick<RegistroTiempo, "persona_id" | "inicio" | "fin">[];
    aperturas: readonly { persona_id: string; fecha: string; created_at: string }[];
    lunes: string;
    hoy: string;
    zona: string;
  },
  ahora: Date = new Date()
): { filas: FilaPodio[]; podio: FilaPodio[] } {
  const domingo = sumarDias(e.lunes, 6);
  const enSemana = (instante: string | null) => {
    const dia = instante ? diaEnZona(instante, e.zona) : null;
    return !!dia && dia >= e.lunes && dia <= domingo;
  };
  const filas = e.personas.map((p): FilaPodio => {
    const suyas = e.tareas.filter((t) => t.persona_id === p.id);
    const c = cumplimiento(suyas, e.lunes, domingo, e.hoy, e.zona);
    const completadas = suyas.filter((t) => t.estado === "completada" && enSemana(t.completada_at)).length;
    const tramos = e.registros.filter((r) => r.persona_id === p.id && enSemana(r.inicio));
    const aTiempo = e.aperturas.filter((a) => a.persona_id === p.id && a.fecha >= e.lunes && a.fecha <= domingo && horaLocal(a.created_at, e.zona).h < HORA_A_TIEMPO).length;
    return { persona_id: p.id, nombre: p.nombre, puesto: p.puesto, pct: c.pct, a_tiempo: c.a_tiempo, completadas, minutos: minutosTotales(tramos, ahora), abrio_a_tiempo: aTiempo };
  });
  filas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.completadas - a.completadas || b.minutos - a.minutos || a.nombre.localeCompare(b.nombre));
  const podio = filas.filter((f) => f.completadas > 0 || f.minutos > 0 || f.pct != null).slice(0, 3);
  return { filas, podio };
}

// ———————————————————————————————————————— LECTURAS ————————————————————————————————————————

export type Reprogramacion = { id: string; tarea_id: string; tipo: "prorroga" | "aplazamiento"; antes: string | null; despues: string | null; motivo: string; created_at: string };
export type BloqueoTarea = { id: string; tarea_id: string; causa: string; depende_de: string | null; desde: string; hasta: string | null };

/** Todo lo de una persona que necesita «Mi trabajo»: sus tareas, sus tramos, sus reprogramaciones y sus bloqueos. */
export async function trabajoDe(companyId: string, personaId: string) {
  const sb = supabaseAdmin();
  const { data: tareas } = await sb.from("os_tareas").select(COLUMNAS_TAREA).eq("company_id", companyId).eq("persona_id", personaId).order("created_at");
  const ids = (tareas ?? []).map((t) => t.id as string);
  const [registros, reprogramaciones, bloqueos, proyectos] = await Promise.all([
    ids.length
      ? sb.from("os_registros_tiempo").select(COLUMNAS_REGISTRO).eq("company_id", companyId).eq("persona_id", personaId).order("inicio", { ascending: false }).limit(500).then((r) => r.data ?? [])
      : Promise.resolve([]),
    ids.length
      ? sb.from("os_reprogramaciones").select("id,tarea_id,tipo,antes,despues,motivo,created_at").eq("company_id", companyId).in("tarea_id", ids).order("created_at").then((r) => r.data ?? [])
      : Promise.resolve([]),
    ids.length
      ? sb.from("os_bloqueos").select("id,tarea_id,causa,depende_de,desde,hasta").eq("company_id", companyId).in("tarea_id", ids).order("desde").then((r) => r.data ?? [])
      : Promise.resolve([]),
    sb.from("os_proyectos").select("id,nombre").eq("company_id", companyId).is("cerrado_at", null).order("nombre").then((r) => r.data ?? []),
  ]);
  return {
    tareas: (tareas ?? []) as TareaOS[],
    registros: registros as RegistroTiempo[],
    reprogramaciones: reprogramaciones as Reprogramacion[],
    bloqueos: bloqueos as BloqueoTarea[],
    proyectos: proyectos as { id: string; nombre: string }[],
  };
}

/** Una tarea de la empresa, con la pregunta de si quien entra puede tocarla (la suya, o cualquiera si es gestión). */
export async function tareaTocable(companyId: string, tareaId: string, persona: PersonaOS | null, gestion: boolean): Promise<TareaOS | null> {
  const { data } = await supabaseAdmin().from("os_tareas").select(COLUMNAS_TAREA).eq("company_id", companyId).eq("id", tareaId).maybeSingle();
  if (!data) return null;
  const t = data as TareaOS;
  if (t.persona_id !== persona?.id && !gestion) return null;
  return t;
}

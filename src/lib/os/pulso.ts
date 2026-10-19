/**
 * RENASER OS · EL PULSO DE LAS EMPRESAS (la vista multiempresa de la consultora, 19-10-2026). Una fila por empresa con
 * cómo está trabajando hoy su equipo: cuántos abrieron el día, cuánto cumplió en los últimos 7 días, qué está bloqueado, qué
 * cronómetro quedó corriendo y si cerró la semana. Arriba de todo, lo que pide atención primero.
 *
 * `armarPulso` es pura (la prueba tests/os-pulso.test.ts sin base); `cargarPulso` solo lee con la credencial del
 * servidor y se la pasa. Lo que no se pudo leer no se convierte en cero: la lectura falla entera y la página lo dice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZONA_POR_DEFECTO, zonaValida } from "@/lib/revision-semanal";
import { cumplimiento, cronometroOlvidado, hoyEn, lunesDe, sumarDias, type EstadoTarea } from "./calculos";

export type EstadoPulso = "critico" | "atento" | "bien" | "sin_os";

export const NOMBRE_ESTADO_PULSO: Record<EstadoPulso, string> = {
  critico: "Crítico",
  atento: "Atento",
  bien: "Bien",
  sin_os: "Sin RENASER OS",
};

export type Punto = { texto: string; tono: "rojo" | "ambar" | "azul" | "verde" };

export type FilaPulso = {
  id: string;
  nombre: string;
  estado: EstadoPulso;
  personas: number;
  sinCuenta: number;
  conCuenta: number;
  abrieron: number;
  /** ¿Ya es hora de exigir la apertura? (día hábil y desde las 10 de la empresa). */
  horaDeAbrir: boolean;
  cumplimiento: { a_tiempo: number; atrasadas: number; pct: number | null };
  bloqueos: number;
  olvidados: number;
  vencidas: number;
  /** null antes del viernes: el cierre semanal todavía no se pide. */
  cierres: number | null;
  avisosSinLeer: number;
  puntos: Punto[];
};

export type Pulso = {
  filas: FilaPulso[];
  resumen: { empresas: number; conOS: number; conCuenta: number; abrieron: number; bloqueos: number; avisosSinLeer: number };
};

/** Lo que se lee de la base, ya plano. Cada lista trae company_id para repartirla. */
export type Lectura = {
  ahora: Date;
  empresas: { id: string; nombre: string; zona_horaria: string | null }[];
  personas: { id: string; company_id: string; user_id: string | null }[];
  aperturas: { company_id: string; persona_id: string; fecha: string }[];
  tareas: { company_id: string; estado: EstadoTarea; fecha_limite: string | null; completada_at: string | null }[];
  bloqueos: { company_id: string; desde: string; titulo: string | null }[];
  cronometros: { company_id: string; inicio: string; fin: string | null }[];
  cierres: { company_id: string; persona_id: string; semana: string }[];
  avisos: { company_id: string }[];
};

const zonaDe = (z: string | null) => (zonaValida(z) ? z : ZONA_POR_DEFECTO);

/** Hora (0–23) y día ISO (1 lunes … 7 domingo) en el reloj de la empresa. */
export function horaYDia(ahora: Date, zona: string): { hora: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(ahora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(partes.find((p) => p.type === "weekday")?.value ?? "Mon") + 1;
  return { hora, dia };
}

const horas = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h} h` : `${Math.max(1, Math.round(ms / 60000))} min`;
};

/**
 * EL ESTADO, CON REGLAS QUE SE PUEDEN DECIR EN VOZ ALTA:
 *  - CRÍTICO: cumplió menos del 60% de lo que venció en los últimos 7 días; o tiene 3 bloqueos abiertos o más; o, en día hábil
 *    y desde las 10 de la mañana, menos de la mitad del equipo con cuenta abrió el día.
 *  - ATENTO: cumplió menos del 80%; o tiene algún bloqueo abierto, algún cronómetro olvidado o alguna tarea vencida;
 *    o, en día hábil y desde las 10, alguien con cuenta no abrió el día; o acumula 5 avisos de gestión sin leer.
 *  - BIEN: nada de lo anterior.
 *  - SIN RENASER OS: la empresa no tiene a nadie en su equipo (os_personas activas).
 * Sin tareas que midan, el cumplimiento no cuenta ni a favor ni en contra.
 */
export function estadoDe(f: Omit<FilaPulso, "estado" | "puntos" | "id" | "nombre">): EstadoPulso {
  if (!f.personas) return "sin_os";
  const pct = f.cumplimiento.pct;
  const faltan = f.horaDeAbrir ? f.conCuenta - f.abrieron : 0;
  if ((pct != null && pct < 60) || f.bloqueos >= 3 || (f.conCuenta > 0 && faltan * 2 > f.conCuenta)) return "critico";
  if ((pct != null && pct < 80) || f.bloqueos > 0 || f.olvidados > 0 || f.vencidas > 0 || faltan > 0 || f.avisosSinLeer >= 5) return "atento";
  return "bien";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function armarPulso(l: Lectura): Pulso {
  const por = <T extends { company_id: string }>(lista: readonly T[], id: string) => lista.filter((x) => x.company_id === id);
  const filas = l.empresas.map((e): FilaPulso => {
    const zona = zonaDe(e.zona_horaria);
    const hoy = hoyEn(zona, l.ahora);
    const lunes = lunesDe(hoy);
    const { hora, dia } = horaYDia(l.ahora, zona);
    const personas = por(l.personas, e.id);
    const conCuenta = personas.filter((p) => p.user_id);
    const ids = new Set(conCuenta.map((p) => p.id));
    const abrieron = new Set(por(l.aperturas, e.id).filter((a) => a.fecha === hoy && ids.has(a.persona_id)).map((a) => a.persona_id)).size;
    const tareas = por(l.tareas, e.id);
    // Los últimos 7 días, no «esta semana»: un lunes casi nada venció todavía y la columna salía vacía en todas.
    const c = cumplimiento(tareas, sumarDias(hoy, -6), hoy, hoy, zona);
    const bloqueos = por(l.bloqueos, e.id).sort((a, b) => a.desde.localeCompare(b.desde));
    const olvidados = por(l.cronometros, e.id).filter((r) => cronometroOlvidado(r, l.ahora)).length;
    const vencidas = tareas.filter((t) => t.estado !== "completada" && t.fecha_limite && t.fecha_limite < hoy).length;
    const viernesOMas = dia >= 5;
    const cierres = viernesOMas ? new Set(por(l.cierres, e.id).filter((w) => w.semana === lunes && ids.has(w.persona_id)).map((w) => w.persona_id)).size : null;
    const avisosSinLeer = por(l.avisos, e.id).length;
    const base = {
      personas: personas.length,
      sinCuenta: personas.length - conCuenta.length,
      conCuenta: conCuenta.length,
      abrieron,
      horaDeAbrir: dia <= 5 && hora >= 10,
      cumplimiento: c,
      bloqueos: bloqueos.length,
      olvidados,
      vencidas,
      cierres,
      avisosSinLeer,
    };
    const estado = estadoDe(base);

    // Los puntos concretos de «Requiere tu atención», del más grave al más leve.
    const puntos: Punto[] = [];
    if (estado === "sin_os") {
      puntos.push({ texto: "Todavía no tiene a nadie en su equipo de RENASER OS. Se activa cargando a las personas en «Equipo y talento».", tono: "azul" });
    } else {
      const faltan = base.conCuenta - abrieron;
      if (base.horaDeAbrir && faltan > 0) puntos.push({ texto: `${plural(faltan, "persona no abrió", "personas no abrieron")} el día (abrieron ${abrieron} de ${base.conCuenta}).`, tono: faltan * 2 > base.conCuenta ? "rojo" : "ambar" });
      else if (!base.horaDeAbrir && base.conCuenta) puntos.push({ texto: `Abrieron el día ${abrieron} de ${base.conCuenta}.`, tono: "azul" });
      if (c.pct != null) puntos.push({ texto: `Cumplimiento de los últimos 7 días: ${c.pct}% (${c.a_tiempo} a tiempo, ${c.atrasadas} ${c.atrasadas === 1 ? "atrasada" : "atrasadas"}).`, tono: c.pct < 60 ? "rojo" : c.pct < 80 ? "ambar" : "verde" });
      if (bloqueos.length) {
        const viejo = bloqueos[0]!;
        puntos.push({
          texto: `${plural(bloqueos.length, "bloqueo abierto", "bloqueos abiertos")}; el más antiguo${viejo.titulo ? `, «${viejo.titulo}»,` : ""} hace ${horas(l.ahora.getTime() - new Date(viejo.desde).getTime())}.`,
          tono: bloqueos.length >= 3 ? "rojo" : "ambar",
        });
      }
      if (olvidados) puntos.push({ texto: `${plural(olvidados, "cronómetro olvidado", "cronómetros olvidados")} (más de 10 horas corriendo).`, tono: "ambar" });
      if (vencidas) puntos.push({ texto: `${plural(vencidas, "tarea vencida", "tareas vencidas")} sin terminar.`, tono: "ambar" });
      if (avisosSinLeer) puntos.push({ texto: `${plural(avisosSinLeer, "aviso de gestión sin leer", "avisos de gestión sin leer")}.`, tono: avisosSinLeer >= 5 ? "ambar" : "azul" });
      if (cierres != null && base.conCuenta) puntos.push({ texto: `Cierre semanal: ${cierres} de ${base.conCuenta}.`, tono: cierres < base.conCuenta ? "ambar" : "verde" });
      if (base.sinCuenta) puntos.push({ texto: `${plural(base.sinCuenta, "persona del equipo todavía no entra", "personas del equipo todavía no entran")} con su correo.`, tono: "azul" });
      if (estado === "bien" && !puntos.some((p) => p.tono === "rojo" || p.tono === "ambar")) puntos.unshift({ texto: "El equipo está al día.", tono: "verde" });
    }
    return { id: e.id, nombre: e.nombre, estado, ...base, puntos };
  });

  // Primero lo que pide atención: crítico, atento, bien, y al final las que no usan RENASER OS; dentro, por nombre.
  const orden: Record<EstadoPulso, number> = { critico: 0, atento: 1, bien: 2, sin_os: 3 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  const conOS = filas.filter((f) => f.estado !== "sin_os");
  return {
    filas,
    resumen: {
      empresas: filas.length,
      conOS: conOS.length,
      conCuenta: conOS.reduce((s, f) => s + f.conCuenta, 0),
      abrieron: conOS.reduce((s, f) => s + f.abrieron, 0),
      bloqueos: conOS.reduce((s, f) => s + f.bloqueos, 0),
      avisosSinLeer: conOS.reduce((s, f) => s + f.avisosSinLeer, 0),
    },
  };
}

/** Lee todo de una vez. Si alguna lectura falla, lanza: la página dice que no pudo leer en vez de mostrar ceros. */
export async function cargarPulso(sb: SupabaseClient, ahora: Date = new Date()): Promise<Pulso> {
  // Desde el lunes anterior basta: la semana en curso de cualquier zona empieza después.
  const desde = lunesDe(new Date(ahora.getTime() - 8 * 86400000).toISOString().slice(0, 10));
  const [empresas, personas, aperturas, tareas, bloqueos, cronometros, cierres, avisos] = await Promise.all([
    sb.from("companies").select("id,nombre,zona_horaria").order("nombre"),
    sb.from("os_personas").select("id,company_id,user_id").eq("activo", true),
    sb.from("os_aperturas").select("company_id,persona_id,fecha").gte("fecha", desde),
    sb.from("os_tareas").select("company_id,estado,fecha_limite,completada_at").or(`estado.neq.completada,fecha_limite.gte.${desde}`),
    sb.from("os_bloqueos").select("company_id,desde,os_tareas(titulo)").is("hasta", null),
    sb.from("os_registros_tiempo").select("company_id,inicio,fin").is("fin", null),
    sb.from("os_cierres_semanales").select("company_id,persona_id,semana").gte("semana", desde),
    sb.from("os_avisos").select("company_id").eq("para_gestion", true).is("leido_at", null),
  ]);
  for (const [nombre, r] of Object.entries({ empresas, personas, aperturas, tareas, bloqueos, cronometros, cierres, avisos })) {
    if (r.error) throw new Error(`No se pudo leer ${nombre}: ${r.error.message}`);
  }
  type ConTarea = { company_id: string; desde: string; os_tareas: { titulo: string } | { titulo: string }[] | null };
  return armarPulso({
    ahora,
    empresas: empresas.data ?? [],
    personas: personas.data ?? [],
    aperturas: aperturas.data ?? [],
    tareas: (tareas.data ?? []) as Lectura["tareas"],
    bloqueos: ((bloqueos.data ?? []) as ConTarea[]).map((b) => ({
      company_id: b.company_id,
      desde: b.desde,
      titulo: (Array.isArray(b.os_tareas) ? b.os_tareas[0]?.titulo : b.os_tareas?.titulo) ?? null,
    })),
    cronometros: cronometros.data ?? [],
    cierres: cierres.data ?? [],
    avisos: avisos.data ?? [],
  });
}

/** El enlace que hace entrar a la consultora al RENASER OS de una empresa (cookie ver_como + destino). */
export function enlaceAEmpresa(companyId: string, destino: string): string {
  return `/api/consultor/ver-portal?empresa=${encodeURIComponent(companyId)}&destino=${encodeURIComponent(destino)}`;
}

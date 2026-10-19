/**
 * RENASER OS · REPORTE SEMANAL, DE LUNES A VIERNES (19-10-2026). Por persona y por día: si abrió y cerró, cuánto tiempo
 * registró con el cronómetro y cuántas tareas terminó; y para la semana: cumplimiento, tiempo bloqueado, lo que más
 * se trabó y lo que cada uno dijo en su cierre semanal.
 *
 * `armarReporte` es pura (la prueba tests/os-equipo.test.ts); `leerReporte` junta los datos de la semana de la empresa.
 * La semana va de la medianoche del lunes a la del lunes siguiente en el reloj de la empresa; la matriz muestra de lunes
 * a viernes, pero lo que se hizo el sábado o el domingo también suma en los totales.
 *
 * Cuentan las personas activas CON cuenta (el mismo criterio de Equipo en vivo y del pulso): una ficha sin cuenta no
 * puede abrir, cerrar ni registrar tiempo, y contarla como «falta su cierre» sería culparla de algo que no puede hacer.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PersonaOS } from "./acceso";
import { cumplimiento, diasHabiles, minutosDe, sumarDias, type RegistroTiempo, type TareaOS } from "./calculos";
import { aperturasEntre, personasDeLaEmpresa, tareasDe, type Apertura, type Bloqueo } from "./datos";
import { diaDeInstante, inicioDelDia } from "./equipo";

export type DiaReporte = { dia: string; abrio: boolean; cerro: boolean; minutos: number; terminadas: number };
export type FilaReporte = {
  persona: Pick<PersonaOS, "id" | "nombre" | "puesto">;
  dias: DiaReporte[];
  minutos: number;
  terminadas: number;
  cierreSemanal: boolean;
};
export type Traba = { tarea: string; persona: string; veces: number; minutos: number };
export type Dicho = { nombre: string; logros: string | null; trabas: string | null; compromiso: string | null };

export type Reporte = {
  lunes: string;
  dias: string[];
  filas: FilaReporte[];
  terminadas: number;
  cumplimiento: { a_tiempo: number; atrasadas: number; pct: number | null };
  minutos: number;
  minutosBloqueado: number;
  bloqueos: number;
  cierresHechos: number;
  faltanCierre: string[];
  trabas: Traba[];
  dichos: Dicho[];
};

export type CierreDia = { persona_id: string; fecha: string };
export type CierreSemanal = { persona_id: string; logros: string | null; trabas: string | null; compromiso: string | null };

export type EntradaReporte = {
  lunes: string;
  hoy: string;
  zona: string;
  ahora: Date;
  personas: readonly Pick<PersonaOS, "id" | "nombre" | "puesto">[];
  tareas: readonly TareaOS[];
  registros: readonly RegistroTiempo[];
  aperturas: readonly Pick<Apertura, "persona_id" | "fecha">[];
  cierres: readonly CierreDia[];
  cierresSemanales: readonly CierreSemanal[];
  bloqueos: readonly Bloqueo[];
};

export function armarReporte(e: EntradaReporte): Reporte {
  const dias = diasHabiles(e.lunes);
  const domingo = sumarDias(e.lunes, 6);
  const enSemana = (dia: string | null) => !!dia && dia >= e.lunes && dia <= domingo;
  const inicio = inicioDelDia(e.lunes, e.zona).getTime();
  const fin = Math.min(inicioDelDia(sumarDias(e.lunes, 7), e.zona).getTime(), e.ahora.getTime());
  const nombreDe = new Map(e.personas.map((p) => [p.id, p.nombre]));
  const tituloDe = new Map(e.tareas.map((t) => [t.id, t.titulo]));
  const diaDe = (instante: string | null) => diaDeInstante(instante, e.zona);
  const terminadaEn = (t: TareaOS) => (t.estado === "completada" ? diaDe(t.completada_at) : null);

  const filas: FilaReporte[] = e.personas.map((p) => {
    const susRegistros = e.registros.filter((r) => r.persona_id === p.id && enSemana(diaDe(r.inicio)));
    const susTareas = e.tareas.filter((t) => t.persona_id === p.id);
    const fila = dias.map((dia) => ({
      dia,
      abrio: e.aperturas.some((a) => a.persona_id === p.id && a.fecha === dia),
      cerro: e.cierres.some((c) => c.persona_id === p.id && c.fecha === dia),
      minutos: susRegistros.filter((r) => diaDe(r.inicio) === dia).reduce((s, r) => s + minutosDe(r, e.ahora), 0),
      terminadas: susTareas.filter((t) => terminadaEn(t) === dia).length,
    }));
    return {
      persona: { id: p.id, nombre: p.nombre, puesto: p.puesto },
      dias: fila,
      minutos: susRegistros.reduce((s, r) => s + minutosDe(r, e.ahora), 0),
      terminadas: susTareas.filter((t) => enSemana(terminadaEn(t))).length,
      cierreSemanal: e.cierresSemanales.some((c) => c.persona_id === p.id),
    };
  });

  // El tiempo bloqueado que cae dentro de la semana (un bloqueo abierto cuenta hasta ahora).
  const dentro = (b: Bloqueo) => {
    const desde = Math.max(new Date(b.desde).getTime(), inicio);
    const hasta = Math.min(b.hasta ? new Date(b.hasta).getTime() : e.ahora.getTime(), fin);
    return hasta > desde ? Math.round((hasta - desde) / 60000) : 0;
  };
  const enLaSemana = e.bloqueos.filter((b) => new Date(b.desde).getTime() < fin && (!b.hasta || new Date(b.hasta).getTime() > inicio));
  const porTarea = new Map<string, Traba>();
  for (const b of enLaSemana) {
    const t = porTarea.get(b.tarea_id) ?? { tarea: tituloDe.get(b.tarea_id) ?? "Una tarea", persona: nombreDe.get(b.persona_id) ?? "", veces: 0, minutos: 0 };
    t.veces++;
    t.minutos += dentro(b);
    porTarea.set(b.tarea_id, t);
  }

  return {
    lunes: e.lunes,
    dias,
    filas,
    terminadas: filas.reduce((s, f) => s + f.terminadas, 0),
    cumplimiento: cumplimiento(e.tareas, e.lunes, domingo, e.hoy, e.zona),
    minutos: filas.reduce((s, f) => s + f.minutos, 0),
    minutosBloqueado: enLaSemana.reduce((s, b) => s + dentro(b), 0),
    bloqueos: enLaSemana.length,
    cierresHechos: filas.filter((f) => f.cierreSemanal).length,
    faltanCierre: filas.filter((f) => !f.cierreSemanal).map((f) => f.persona.nombre),
    trabas: [...porTarea.values()].sort((a, b) => b.minutos - a.minutos || b.veces - a.veces).slice(0, 5),
    dichos: e.cierresSemanales
      .filter((c) => c.logros || c.trabas || c.compromiso)
      .map((c) => ({ nombre: nombreDe.get(c.persona_id) ?? "", logros: c.logros, trabas: c.trabas, compromiso: c.compromiso })),
  };
}

export async function leerReporte(companyId: string, zona: string, lunes: string, hoy: string, ahora: Date = new Date()): Promise<Reporte> {
  const sb = supabaseAdmin();
  const domingo = sumarDias(lunes, 6);
  const desde = inicioDelDia(lunes, zona).toISOString();
  const hasta = inicioDelDia(sumarDias(lunes, 7), zona).toISOString();
  const personas = (await personasDeLaEmpresa(companyId)).filter((p) => p.user_id);
  const ids = personas.map((p) => p.id);
  const [tareas, registros, aperturas, cierres, semanales, bloqueos] = await Promise.all([
    tareasDe(companyId, ids),
    sb.from("os_registros_tiempo").select("id,tarea_id,persona_id,inicio,fin,nota").eq("company_id", companyId).gte("inicio", desde).lt("inicio", hasta),
    aperturasEntre(companyId, lunes, domingo),
    sb.from("os_cierres").select("persona_id,fecha").eq("company_id", companyId).gte("fecha", lunes).lte("fecha", domingo),
    sb.from("os_cierres_semanales").select("persona_id,logros,trabas,compromiso").eq("company_id", companyId).eq("semana", lunes),
    sb.from("os_bloqueos").select("id,tarea_id,persona_id,causa,depende_de,desde,hasta").eq("company_id", companyId).lt("desde", hasta).or(`hasta.is.null,hasta.gt.${desde}`),
  ]);
  return armarReporte({
    lunes,
    hoy,
    zona,
    ahora,
    personas,
    tareas,
    registros: (registros.data ?? []) as RegistroTiempo[],
    aperturas,
    cierres: (cierres.data ?? []) as CierreDia[],
    cierresSemanales: (semanales.data ?? []) as CierreSemanal[],
    bloqueos: (bloqueos.data ?? []) as Bloqueo[],
  });
}

/**
 * LO QUE LEE LA PÁGINA DE LA ESTRATEGIA (spec-estrategia-8x.md §8.1). SERVIDOR.
 *
 * Una sola lectura por pantalla, con `supabaseAdmin()` y SIEMPRE filtrando por la empresa en la consulta (las
 * funciones de datos.ts, acciones.ts y preguntas.ts ya lo hacen con columnas explícitas). Devuelve en cuál de los
 * estados está la estrategia de la empresa, con lo que necesita cada uno:
 *  - `no_habilitada`: la base todavía no tiene la migración de la estrategia;
 *  - `preparacion`: no hay ninguna versión que mostrar; cuántos hechos, estimados, percepciones y sin dato hay, lo que
 *    falta del mínimo y el consumo de la empresa, para decir ANTES de gastar si se puede generar;
 *  - `generando`: la versión abierta se está generando (en qué va cada etapa);
 *  - `descartada`: la versión pedida se descartó;
 *  - `estrategia`: una versión con su estrategia, armada para pintar (pantalla.ts), con su rastro, «qué cambió», las
 *    respuestas nuevas del dueño y las preguntas para él;
 *  - `no_existe`: se pidió una versión que la empresa no tiene.
 * Nada aquí gasta una consulta al asistente ni escribe en la base.
 */
import { supabaseAdmin } from "../supabase/admin";
import { listarSolicitudes } from "../solicitudes";
import { resumenDeEstrategias, detalleDeVersion, type Detalle, type Resumen } from "./acciones";
import { armarPaquete, minimoParaEstrategia, type Paquete } from "./paquete";
import { leerEntradasPaquete, ErrorLecturaCritica } from "./paquete-datos";
import { listarPreguntas, vistaPreviaDeEnvio } from "./preguntas";
import { TOKENS_POR_ESTRATEGIA } from "./motor";
import { API, MOTOR, PANTALLA, PREGUNTAS, pedidoPorMinimo } from "./textos";
import { armarVista, elegirVersion, type PreguntaFila, type VistaEstrategia } from "./pantalla";
import type { EstadoDeEtapas, ErrorEtapa, ResumenVersion } from "./datos";
import type { EsperaPregunta } from "./pedidos";

export type EmpresaPantalla = { id: string; nombre: string; zona: string };

export type Preparacion = {
  conteo: Paquete["conteo"] | null;
  /** La lectura que no se pudo hacer (la tabla en palabras y el motivo): sin ella no se cuenta nada. */
  lectura_fallida: string | null;
  /** Las partes que esta base todavía no tiene: salen «sin dato». */
  no_habilitadas: string[];
  /** Lo que falta del mínimo para generar (§3.6), en palabras de consultora. */
  faltan: string[];
  /** El pedido que 8X le haría al dueño para alcanzar el mínimo («Pedírselo al cliente»); null si no hay qué pedirle. */
  pedir: { seccion: "datos_faltantes"; nota: string } | null;
  /** Si ya se le pidió: el activo, o el último que entregó. */
  pedido: { estado: "activa" | "completada"; desde: string } | null;
  consumo: Resumen["consumo"];
  /** La empresa ya no tiene tope para una estrategia: el texto que lo dice (y no se ofrece generar). */
  tope: string | null;
};

export type DatosPantalla =
  | { tipo: "no_habilitada"; empresa: EmpresaPantalla; texto: string }
  | { tipo: "no_existe"; empresa: EmpresaPantalla; v: number; versiones: ResumenVersion[] }
  | { tipo: "preparacion"; empresa: EmpresaPantalla; prep: Preparacion; versiones: ResumenVersion[] }
  | { tipo: "generando"; empresa: EmpresaPantalla; version: ResumenVersion; etapas: EstadoDeEtapas; versiones: ResumenVersion[] }
  | { tipo: "descartada"; empresa: EmpresaPantalla; version: ResumenVersion; motivo: string | null; versiones: ResumenVersion[] }
  | {
      tipo: "estrategia";
      empresa: EmpresaPantalla;
      vista: VistaEstrategia;
      detalle: Omit<Detalle, "version">;
      versiones: ResumenVersion[];
      /** Otra versión que se está generando mientras se mira esta. */
      enCurso: { version: number } | null;
      /** Lo que se le abriría al dueño al enviar las preguntas propuestas. */
      envio: { resumen: string } | null;
      consumo: Resumen["consumo"];
    };

/** El nombre y la zona horaria de la empresa (sin la columna nueva, la de Perú). */
async function leerEmpresa(id: string): Promise<EmpresaPantalla> {
  const sb = supabaseAdmin();
  const r = await sb.from("companies").select("id,nombre,zona_horaria").eq("id", id).maybeSingle();
  const fila = (r.error ? (await sb.from("companies").select("id,nombre").eq("id", id).maybeSingle()).data : r.data) as { nombre?: string | null; zona_horaria?: string | null } | null;
  return { id, nombre: fila?.nombre?.trim() || "la empresa", zona: fila?.zona_horaria || "America/Lima" };
}

/** El pedido de «Los números que faltan»: el activo, o el último completado. Sin la tabla, ninguno. */
async function pedidoDeNumeros(companyId: string): Promise<Preparacion["pedido"]> {
  try {
    const deEsta = (await listarSolicitudes(companyId)).filter((s) => s.seccion === "datos_faltantes");
    const activa = deEsta.find((s) => s.estado === "activa");
    if (activa) return { estado: "activa", desde: activa.activada_at };
    const hecha = deEsta.filter((s) => s.estado === "completada" && s.completada_at).sort((a, b) => String(b.completada_at).localeCompare(String(a.completada_at)))[0];
    return hecha ? { estado: "completada", desde: hecha.completada_at as string } : null;
  } catch {
    return null;
  }
}

/** Lo que dice la pantalla antes de generar: los datos con que se haría, lo que falta y si alcanza el tope. */
async function preparacion(companyId: string, consumo: Resumen["consumo"], ahora: Date): Promise<Preparacion> {
  const tope = consumo && consumo.usados + consumo.por_estrategia > consumo.tope ? MOTOR.tope_empresa(consumo.usados, consumo.tope, TOKENS_POR_ESTRATEGIA) : null;
  let paquete: Paquete;
  try {
    paquete = armarPaquete(await leerEntradasPaquete(companyId), ahora);
  } catch (e) {
    if (!(e instanceof ErrorLecturaCritica)) throw e;
    const tabla = PANTALLA.tablas[e.tabla] ?? PANTALLA.una_parte;
    return { conteo: null, lectura_fallida: `${tabla}: ${e.motivo}`, no_habilitadas: [], faltan: [], pedir: null, pedido: null, consumo, tope };
  }
  const faltan = minimoParaEstrategia(paquete);
  const no_habilitadas = [...new Set(paquete.lecturas_fallidas.map((l) => PANTALLA.tablas[l.tabla] ?? PANTALLA.una_parte))];
  return { conteo: paquete.conteo, lectura_fallida: null, no_habilitadas, faltan, pedir: pedidoPorMinimo(faltan), pedido: faltan.length ? await pedidoDeNumeros(companyId) : null, consumo, tope };
}

/** Las preguntas de la empresa como las ve la consultora (sin las retiradas). Sin la tabla, ninguna. */
async function preguntasDe(companyId: string): Promise<PreguntaFila[]> {
  const r = await listarPreguntas(companyId);
  if (!r.ok) return [];
  return r.preguntas
    .filter((p) => p.estado === "propuesta" || p.estado === "enviada" || p.estado === "respondida")
    .map((p) => ({
      id: String(p.id),
      texto: String(p.texto ?? ""),
      por_que: (p.por_que as string | null) ?? null,
      estado: p.estado as PreguntaFila["estado"],
      espera: Array.isArray(p.espera) ? (p.espera as EsperaPregunta[]) : [],
      respondida_at: (p.respondida_at as string | null) ?? null,
    }));
}

/** El último motivo anotado de una versión que no siguió (se descartó al ponerla en marcha, o falló una etapa). */
const ultimoMotivo = (errores: readonly ErrorEtapa[] | null | undefined): string | null => (errores?.length ? errores[errores.length - 1]!.motivo : null);

/** Todo lo que pinta /empresa/[id]/estrategia (`v`: la versión pedida con `?v=N`). */
export async function leerPantallaEstrategia(companyId: string, o: { v?: number | null; ahora?: Date } = {}): Promise<DatosPantalla> {
  const ahora = o.ahora ?? new Date();
  const empresa = await leerEmpresa(companyId);
  const resumen = await resumenDeEstrategias(companyId);
  if (!resumen.ok) return { tipo: "no_habilitada", empresa, texto: resumen.codigo === "no_habilitada" ? resumen.texto : API.no_habilitada };
  const { versiones, consumo } = resumen;

  const elegida = elegirVersion(versiones, o.v ?? null);
  if (elegida === "no_existe") return { tipo: "no_existe", empresa, v: o.v!, versiones };
  if (!elegida) return { tipo: "preparacion", empresa, prep: await preparacion(companyId, consumo, ahora), versiones };

  if (elegida.estado === "en_curso") {
    const etapas = resumen.en_curso?.id === elegida.id ? resumen.en_curso.etapas : null;
    if (etapas) return { tipo: "generando", empresa, version: elegida, etapas, versiones };
  }

  const d = await detalleDeVersion(companyId, elegida.id);
  if (!d.ok) return { tipo: "no_existe", empresa, v: elegida.version, versiones };
  if (d.version.estado === "en_curso" && d.etapas) return { tipo: "generando", empresa, version: elegida, etapas: d.etapas, versiones };
  if (d.version.estado === "descartada" || !d.version.vigente) return { tipo: "descartada", empresa, version: elegida, motivo: ultimoMotivo(d.version.errores), versiones };

  const preguntas = await preguntasDe(companyId);
  const vista = armarVista({ companyId, v: d.version, preguntas });
  if (!vista) return { tipo: "descartada", empresa, version: elegida, motivo: null, versiones };

  const propuestas = preguntas.filter((p) => p.estado === "propuesta").length;
  let envio: { resumen: string } | null = null;
  if (propuestas) {
    try {
      const previa = await vistaPreviaDeEnvio(companyId, d.version.id);
      envio = { resumen: PREGUNTAS.resumen_envio(propuestas, previa.ok ? previa.secciones.map((s) => s.nombre) : []) };
    } catch {
      envio = { resumen: PREGUNTAS.resumen_envio(propuestas, []) };
    }
  }
  const curso = versiones.find((x) => x.estado === "en_curso" && x.id !== d.version.id);
  const { version: _v, ...detalle } = d;
  void _v;
  return { tipo: "estrategia", empresa, vista, detalle, versiones, enCurso: curso ? { version: curso.version } : null, envio, consumo };
}

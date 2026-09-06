/**
 * LA RADIOGRAFÍA DE UNA EMPRESA: en qué nivel está, qué necesita y qué le falta para subir.
 *
 * Aquí se juntan las cuatro piezas de la metodología que hasta ahora vivían sueltas en el código:
 *   · perfil.ts   — qué clase de negocio es, leído de lo que ya contó (nunca de un formulario)
 *   · matriz.ts   — qué documentos y procesos necesita ESE negocio para escalar
 *   · pcf.ts      — dónde cae cada proceso en el mapa de las 13 partes de cualquier empresa (APQC)
 *   · madurez.ts  — el nivel 0–5 de cada proceso y de la empresa entera (CMMI)
 *
 * REGLA DE LA CASA: nada se afirma sin con qué. Un proceso no llega a «medido» porque tenga escrita
 * una meta bonita, sino porque su número está anotado de verdad al menos dos veces. Lo que la
 * empresa no ha contado no se asume: se devuelve como pregunta pendiente.
 */
import { supabaseAdmin } from "./supabase/admin";
import { perfilDe, type Perfil } from "./perfil";
import { matrizDe, type Matriz, type PiezaProceso } from "./matriz";
import { CATEGORIAS, type ClaveCategoria } from "./pcf";
import { madurezProceso, madurezEmpresa, type Evaluacion } from "./madurez";
import { normalizarParaConfirmar } from "./confirmacion";
import { traspasosDe, primerCorte, type Traspaso, type Eslabon } from "./rules/cadena-valor";
import { leerCultura, type LecturaCultura } from "./rules/cultura";

/** Un documento de la matriz con el estado real en el que está hoy. */
export type EstadoDoc = "falta" | "levantado" | "listo";

export type DocConEstado = { clave: string; nombre: string; prioridad: 1 | 2 | 3; porque: string; estado: EstadoDoc };

/** Un proceso ya mapeado, con su nivel y lo que le falta para el siguiente. */
export type ProcesoEvaluado = {
  id: string;
  nombre: string;
  categoria: ClaveCategoria | null;
  evaluacion: Evaluacion;
};

/** Una de las 13 partes del negocio, con lo que la empresa tiene y lo que le falta ahí. */
export type Parte = {
  clave: ClaveCategoria;
  nombre: string;
  pregunta: string;
  apqc: string;
  familia: "operacion" | "soporte";
  mapeados: ProcesoEvaluado[];
  /** Procesos que su matriz pide en esta parte y que todavía nadie ha contado. */
  faltan: PiezaProceso[];
};

export type MapaEmpresa = {
  perfil: Perfil;
  matriz: Matriz;
  documentos: DocConEstado[];
  procesos: ProcesoEvaluado[];
  partes: Parte[];
  /** Se deriva de madurez.ts: si allí se agrega un número, aquí no hay que acordarse de copiarlo. */
  empresa: ReturnType<typeof madurezEmpresa>;
  /** Procesos sin categoría asignada: se muestran aparte en vez de colgarlos donde no van. */
  sinCategoria: ProcesoEvaluado[];
  /** La cadena: dónde se corta y en qué traspasos se pierde lo que se prometió. */
  cadena: { traspasos: Traspaso[]; corte: Eslabon | null };
  /** Cómo es esta empresa, leído de sus historias. Nunca deducido del rubro. */
  cultura: LecturaCultura;
};

const LISTO = new Set(["construido", "en_uso"]);
const LEVANTADO = new Set(["contado", "lo_tengo", "incompleto"]);

/** Para cruzar el indicador escrito en un proceso con los números que la empresa anota de verdad. */
const normalizar = normalizarParaConfirmar;

export async function mapaDe(companyId: string): Promise<MapaEmpresa | null> {
  const sb = supabaseAdmin();

  const { data: empresa } = await sb.from("companies").select("id,sector,ficha").eq("id", companyId).single();
  if (!empresa) return null;

  const [{ data: procesos }, { data: activos }, { data: sesiones }, { data: indicadores }, { data: mediciones }] = await Promise.all([
    sb
      .from("processes")
      .select("id,nombre,area,categoria,version,responsable,tiempo,inicio,resultado,proveedor,cliente_proceso,indicador,descripcion_original, process_nodes(count), sops(count)")
      .eq("company_id", companyId)
      .neq("version", "to_be")
      .order("created_at"),
    sb.from("company_assets").select("clave,estado,nota").eq("company_id", companyId),
    sb.from("interview_sessions").select("id").eq("company_id", companyId),
    sb.from("indicadores").select("clave,nombre,estado").eq("company_id", companyId).neq("estado", "archivado"),
    sb.from("mediciones").select("valores").eq("company_id", companyId),
  ]);

  const ids = (sesiones ?? []).map((s) => s.id);
  const { data: respuestas } = ids.length
    ? await sb.from("interview_responses").select("respuesta").in("session_id", ids).not("respuesta", "is", null)
    : { data: [] };

  // EL PERFIL sale de todo lo que la empresa ya dijo. Ni una pregunta nueva.
  const perfil = perfilDe({
    ficha: (empresa.ficha as Record<string, unknown> | null) ?? null,
    sector: empresa.sector,
    textos: [
      ...(activos ?? []).map((a) => a.nota),
      ...(procesos ?? []).flatMap((p) => [p.nombre, p.descripcion_original]),
      ...(respuestas ?? []).map((r) => (r as { respuesta: string | null }).respuesta),
    ],
  });

  const matriz = matrizDe(perfil);

  // LOS DOCUMENTOS: qué pide su matriz y en qué estado real está cada uno.
  const estadoActivo = new Map((activos ?? []).map((a) => [a.clave, a.estado as string]));
  const documentos: DocConEstado[] = matriz.documentos.map((d) => {
    const e = estadoActivo.get(d.clave) ?? "";
    return { clave: d.clave, nombre: d.nombre, prioridad: d.prioridad, porque: d.porque, estado: LISTO.has(e) ? "listo" : LEVANTADO.has(e) ? "levantado" : "falta" };
  });

  // LOS NÚMEROS QUE SE ANOTAN DE VERDAD: cuántas veces aparece cada clave con un valor real.
  const vecesAnotado = new Map<string, number>();
  for (const m of mediciones ?? []) {
    const valores = (m.valores ?? {}) as Record<string, unknown>;
    for (const [clave, v] of Object.entries(valores)) {
      if (v == null || v === "" || Number.isNaN(Number(v))) continue;
      vecesAnotado.set(clave, (vecesAnotado.get(clave) ?? 0) + 1);
    }
  }
  // El indicador de un proceso es texto libre; solo cuenta si además es un número registrado.
  const claveDeIndicador = new Map<string, string>();
  for (const i of indicadores ?? []) {
    if (i.clave) claveDeIndicador.set(normalizar(i.nombre ?? i.clave), i.clave);
  }

  const evaluar = (p: NonNullable<typeof procesos>[number]): ProcesoEvaluado => {
    const nodos = (p.process_nodes as unknown as { count: number }[])?.[0]?.count ?? 0;
    const tieneSop = ((p.sops as unknown as { count: number }[])?.[0]?.count ?? 0) > 0;
    const clave = p.indicador ? claveDeIndicador.get(normalizar(p.indicador)) : undefined;
    const medicionesReales = clave ? (vecesAnotado.get(clave) ?? 0) : 0;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: (p.categoria as ClaveCategoria | null) ?? null,
      evaluacion: madurezProceso({
        nodos,
        responsable: p.responsable,
        tiempo: p.tiempo,
        inicio: p.inicio,
        resultado: p.resultado,
        proveedor: p.proveedor,
        cliente_proceso: p.cliente_proceso,
        documentado: tieneSop,
        indicador: p.indicador,
        medicionesReales,
        // Que el número haya mejorado se responde en la pantalla de resultados, con línea base y
        // corte. Aquí no se adivina: sin esa comparación, el proceso no pasa de «medido».
        mejoro: null,
      }),
    };
  };

  const evaluados = (procesos ?? []).map(evaluar);
  const porNombre = new Map(evaluados.map((e) => [normalizar(e.nombre), e]));

  const partes: Parte[] = CATEGORIAS.map((c) => ({
    clave: c.clave as ClaveCategoria,
    nombre: c.nombre,
    pregunta: c.pregunta,
    apqc: c.apqc,
    familia: c.familia,
    mapeados: evaluados.filter((e) => e.categoria === c.clave),
    faltan: matriz.procesos.filter((p) => p.categoria === c.clave && !porNombre.has(normalizar(p.nombre))),
  }));

  // Los procesos esperados son los de su matriz MÁS los que ya mapeó de más: una empresa no se mide
  // solo contra lo hecho, porque entonces cualquiera con un proceso perfecto estaría en nivel 5.
  const esperados = new Set([...matriz.procesos.map((p) => normalizar(p.nombre)), ...evaluados.map((e) => normalizar(e.nombre))]);

  // LA CADENA se lee de las categorías donde la empresa YA mapeó algo: preguntarle a una consultora
  // por su despacho de mercadería es exactamente el ruido que hace desconfiar de un diagnóstico.
  const categoriasConProceso = evaluados.map((e) => e.categoria).filter((c): c is ClaveCategoria => !!c);

  return {
    perfil,
    matriz,
    documentos,
    procesos: evaluados,
    partes,
    cadena: { traspasos: traspasosDe(categoriasConProceso), corte: primerCorte(categoriasConProceso) },
    cultura: leerCultura([
      ...(activos ?? []).map((a) => a.nota),
      ...(respuestas ?? []).map((r) => (r as { respuesta: string | null }).respuesta),
    ]),
    empresa: madurezEmpresa(
      evaluados.map((e) => e.evaluacion),
      esperados.size
    ),
    sinCategoria: evaluados.filter((e) => !e.categoria),
  };
}

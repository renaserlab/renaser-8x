import { z } from "zod";
import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { valoresActuales, derivadosActuales, type Condiciones } from "@/lib/medicion";
import { radiografia, type Metrica } from "@/lib/metricas";
import { cargarMediciones } from "@/components/medicion/datos";
import { indicadoresLegibles } from "@/lib/plan-reglas";
import { CondicionesZ, validarPeriodo } from "../medicion/esquemas";

type Ctx = { params: Promise<{ id: string }> };

type Regresion = { proceso?: string; que_volvio?: string; evidencia?: string };

type Numeros = Record<string, number | null>;

/** Los topes de largo, en un solo sitio: los aplica el esquema y los nombra el mensaje cuando algo se pasa. */
const TOPE = { texto: 2000, valor: 600, nombre: 200, clave: 80, unidad: 60, cuantos: 40 } as const;

const ValorSimpleZ = z.union([z.string().max(TOPE.valor), z.number(), z.boolean(), z.null()]);
const NombreZ = z.string().trim().min(1).max(TOPE.nombre);
const ElementoZ = z.union([
  z.string().trim().min(1).max(TOPE.valor),
  z
    .strictObject({ nombre: NombreZ.optional(), indicador: NombreZ.optional(), clave: NombreZ.optional(), valor: ValorSimpleZ, unidad: z.string().trim().max(TOPE.unidad).nullable().optional() })
    .refine((e) => Boolean(e.nombre ?? e.indicador ?? e.clave), "cada indicador lleva su nombre"),
]);

/**
 * LA FORMA DE LOS INDICADORES DE UN CORTE. `checkpoints.indicadores` es jsonb libre y hasta el 13-10-2026 esta
 * ruta guardaba lo que llegara: un objeto anidado, un JSON metido como texto o un número suelto quedaban
 * guardados, y la pantalla solo podía decir «hay números, pídeselos a tu consultora». Ahora se aceptan las tres
 * formas que la pantalla sabe leer (`indicadoresLegibles`): un texto (suelto o en `{ texto }`), pares de nombre
 * y valor sencillos, o una lista corta de `{ nombre, valor, unidad }`. Y además de la forma se comprueba el
 * contenido: lo que llegaría a la pantalla como «no se puede leer» no se guarda.
 *
 * `{ texto }` TIENE SU PROPIA RAMA, Y VA ANTES DE LOS PARES. Es lo que manda el único formulario (CortesPlan): el
 * texto de la consultora, con el mismo tope que el texto suelto. Sin esa rama caía en los pares, donde «texto» era
 * un valor más y topaba en 600: un texto legible de 601 caracteres se rechazaba, y con el mensaje de la forma.
 */
const IndicadoresZ = z
  .union([
    z.string().max(TOPE.texto),
    z.strictObject({ texto: z.string().max(TOPE.texto) }),
    z.array(ElementoZ).max(TOPE.cuantos),
    z.record(z.string().min(1).max(TOPE.clave), ValorSimpleZ).refine((o) => Object.keys(o).length <= TOPE.cuantos, "demasiados indicadores"),
  ])
  .nullable()
  .refine((v) => indicadoresLegibles(v, "consultor")?.legible !== false, "los indicadores no se dejan leer");

const ERROR_INDICADORES =
  "Los indicadores del corte van como un texto («qué indicador se movió y cuánto») o como una lista corta de nombre y valor. Llegaron con otra forma y no se guardó nada.";

const errorIndicadoresLargos = (detalle: string) =>
  `Los indicadores del corte no se guardaron porque son demasiado largos: ${detalle}. Acórtalos y vuelve a registrar el corte.`;

/**
 * QUÉ SE PASA DE LARGO, dicho en palabras, o null si nada se pasa. Un texto legible pero largo recibía el mensaje
 * de la forma («llegaron con otra forma»): era falso y no decía qué acortar. Aquí se mira solo el tamaño, con los
 * mismos topes del esquema; la forma la sigue juzgando el esquema. Se usa únicamente cuando el esquema ya rechazó.
 */
function loQueSePasaDeLargo(v: unknown): string | null {
  const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  // El esquema recorta nombres, unidades y líneas antes de medirlos; el texto y los valores se miden como llegan.
  const largo = (x: unknown, recortado = false): number => (typeof x === "string" ? (recortado ? x.trim() : x).length : 0);
  const dice = (que: string, tiene: number, tope: number, unidad = "caracteres") => `${que} tiene ${tiene} ${unidad} y se admiten hasta ${tope}`;

  const texto = typeof v === "string" ? v : esObjeto(v) && Object.keys(v).length === 1 && typeof v.texto === "string" ? v.texto : null;
  if (texto !== null) return texto.length > TOPE.texto ? dice("el texto", texto.length, TOPE.texto) : null;

  if (Array.isArray(v)) {
    if (v.length > TOPE.cuantos) return dice("la lista", v.length, TOPE.cuantos, "indicadores");
    for (const e of v) {
      if (typeof e === "string" && largo(e, true) > TOPE.valor) return dice("una línea de la lista", largo(e, true), TOPE.valor);
      if (!esObjeto(e)) continue;
      for (const n of [e.nombre, e.indicador, e.clave]) if (largo(n, true) > TOPE.nombre) return dice("el nombre de un indicador", largo(n, true), TOPE.nombre);
      if (largo(e.valor) > TOPE.valor) return dice("el valor de un indicador", largo(e.valor), TOPE.valor);
      if (largo(e.unidad, true) > TOPE.unidad) return dice("la unidad de un indicador", largo(e.unidad, true), TOPE.unidad);
    }
    return null;
  }
  if (!esObjeto(v)) return null;
  const pares = Object.entries(v);
  if (pares.length > TOPE.cuantos) return dice("la lista", pares.length, TOPE.cuantos, "indicadores");
  for (const [k, x] of pares) {
    if (k.length > TOPE.clave) return dice("el nombre de un indicador", k.length, TOPE.clave);
    if (largo(x) > TOPE.valor) return dice("el valor de un indicador", largo(x), TOPE.valor);
  }
  return null;
}

/** Mismas claves con los mismos valores; una clave ausente y una en null son lo mismo (no se midió). */
function mismosNumeros(a: unknown, b: Numeros): boolean {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(b)])) if ((x[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
}

/**
 * LA MEDICIÓN QUE UN INTENTO ANTERIOR DEJÓ SIN CORTE. Congelar la medición y guardar el corte son dos
 * escrituras y aquí no hay transacción que las una (haría falta una función de base nueva). Si la segunda
 * falla, la medición queda congelada sin su corte; el dueño la ve como «Corte N» y reintentar congelaba
 * OTRA idéntica. Antes de congelar se busca esa medición: el último corte que congeló esta misma persona,
 * con la misma nota y los mismos números, contra el mismo punto de partida, y que ningún corte del plan
 * referencia todavía. Si existe se reutiliza. No se borra ni se modifica nada de lo congelado.
 */
async function medicionSinCorte(
  sb: ReturnType<typeof supabaseAdmin>,
  p: { company: string; por: string; nota: string | null; valores: Numeros; derivados: Numeros; lineaBaseId: string }
): Promise<{ id: string; linea_base_id: string | null } | null> {
  const { data, error } = await sb
    .from("mediciones")
    .select("id,numero,valores,derivados,nota,linea_base_id")
    .eq("company_id", p.company).eq("tipo", "corte").eq("creado_por", p.por)
    .order("numero", { ascending: false }).limit(5);
  if (error || !data?.length) return null;
  const ultima = [...data].sort((a, b) => Number(b.numero) - Number(a.numero))[0];
  if (!ultima?.id || ultima.linea_base_id !== p.lineaBaseId || (ultima.nota ?? null) !== p.nota) return null;
  if (!mismosNumeros(ultima.valores, p.valores) || !mismosNumeros(ultima.derivados, p.derivados)) return null;
  const { data: enlazada, error: eEnlace } = await sb.from("checkpoints").select("id").eq("medicion_id", ultima.id).limit(1);
  // Si no se pudo comprobar, no se reutiliza: ante la duda se congela una medición propia.
  if (eEnlace || enlazada?.length) return null;
  return { id: ultima.id as string, linea_base_id: (ultima.linea_base_id as string | null) ?? null };
}

/** body: { corte: {…, regresiones: [{proceso, que_volvio, evidencia}] } } · { monitoreo: true } · { cerrar: true, resultado_90d } */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  // Un corte congela una medición y un cierre da el caso por terminado: las dos cosas comprometen a la consultora.
  await exigirAutoridad(perfil, "cerrar_medicion");
  const b = await leerJSON<{ corte?: { que_se_hizo?: string; que_se_trabo?: string; indicadores?: unknown; regresiones?: Regresion[]; periodo_desde?: string; periodo_hasta?: string; condiciones?: unknown }; cerrar?: boolean; resultado_90d?: unknown; monitoreo?: boolean }>(req);
  const sb = supabaseAdmin();
  if (b.corte) {
    // El período del corte, si viene, viene entero, en orden y como fecha: se rechaza antes de congelar nada.
    const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    if ((b.corte.periodo_desde && !ES_FECHA.test(b.corte.periodo_desde)) || (b.corte.periodo_hasta && !ES_FECHA.test(b.corte.periodo_hasta)))
      return fallo("Las fechas del período van como AAAA-MM-DD.", 400);
    const errorPeriodo = validarPeriodo(b.corte.periodo_desde, b.corte.periodo_hasta);
    if (errorPeriodo) return fallo(errorPeriodo, 400);
    // Los indicadores, si vienen, vienen con una forma que la pantalla sabe leer: se rechaza antes de congelar nada.
    // Y se dice por qué: si lo que falla es el largo, se nombra qué se pasa y cuánto se admite, no «otra forma».
    const indicadoresLeidos = IndicadoresZ.safeParse(b.corte.indicadores ?? null);
    if (!indicadoresLeidos.success) {
      const largos = loQueSePasaDeLargo(b.corte.indicadores);
      return fallo(largos ? errorIndicadoresLargos(largos) : ERROR_INDICADORES, 400);
    }
    const indicadores = indicadoresLeidos.data;
    // Las condiciones pasan por el mismo esquema que en la ruta de medición: un cambio sin «desde» o sin
    // efecto esperado no es un registro, y la columna no recibe JSON arbitrario.
    let condiciones: Condiciones | undefined;
    if (b.corte.condiciones != null) {
      const r = CondicionesZ.safeParse(b.corte.condiciones);
      if (!r.success) return fallo("Las condiciones del corte no están completas: cada cambio lleva qué cambió, desde cuándo (AAAA-MM-DD) y qué efecto se espera.", 400);
      condiciones = r.data;
    }
    const { data: prev } = await sb.from("checkpoints").select("numero").eq("company_id", id).order("numero", { ascending: false }).limit(1);
    const numero = (prev?.[0]?.numero ?? 0) + 1;

    // LOS NÚMEROS DEL CORTE (30-08-2026): el corte guardaba sus indicadores como texto libre, así que
    // aunque se hiciera, nada podía calcular si el indicador se movió. Ahora se congela también una
    // medición con los nueve vitales de hoy, y las dos historias —lo que se hizo y lo que se movió—
    // quedan enlazadas. Si la empresa todavía no tiene números, el corte cualitativo se guarda igual.
    const { data: metricasRaw } = await sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", id).limit(300);
    const metricas = (metricasRaw ?? []) as Metrica[];
    const valores = valoresActuales(metricas);
    let medicionId: string | null = null;
    let medicionInfo: { id: string; linea_base_id: string | null; version_linea_base: number | null; aviso?: string; reutilizada?: true } | null = null;
    // Un corte con números y sin período se guarda, pero se dice: sin saber de qué fechas son, no es un resultado.
    let avisoPeriodo: string | null = null;
    if (Object.keys(valores).length > 0) {
      // SIN PUNTO DE PARTIDA VIGENTE NO NACE NINGÚN CORTE CON NÚMEROS (regla 7: cada medición referencia la
      // versión exacta de la línea base). Si se congelara igual, nacería con linea_base_id nulo y mañana alguien
      // lo compararía con un punto de partida fijado DESPUÉS: eso es inventar el «antes». Un corte sin ningún
      // número (solo qué se hizo y qué se trabó) sigue pudiendo guardarse: no es una medición.
      // 409 y no 400: la petición está bien formada; lo que choca es el estado de la empresa (aún no tiene
      // punto de partida). No se escribe NADA: ni medición, ni corte, ni hallazgos de regresión.
      const existentes = await cargarMediciones(sb, id);
      if (!existentes.vigente) {
        const listos = radiografia(metricas).listos;
        return fallo(
          `Primero fija el punto de partida: sin él no hay contra qué medir este corte${listos < 5 ? ` (hacen falta al menos 5 de los 9 números; hoy hay ${listos})` : ""}.`,
          409
        );
      }
      const derivados = derivadosActuales(metricas);
      const nota = b.corte.que_se_hizo ?? null;
      // REINTENTO SIN DUPLICAR: si un intento anterior congeló esta misma medición y falló al guardar el corte,
      // se enlaza a ella en vez de congelar otra igual.
      const pendiente = await medicionSinCorte(sb, { company: id, por: perfil.id, nota, valores, derivados, lineaBaseId: existentes.vigente.id });
      let fila: { id?: string; linea_base_id?: string | null } | null = pendiente;
      if (!pendiente) {
        const { data: med, error: eMed } = await sb.rpc("congelar_medicion", {
          p_company: id, p_tipo: "corte", p_valores: valores,
          p_derivados: derivados, p_nota: nota, p_por: perfil.id,
        });
        fila = (Array.isArray(med) ? med[0] : med) as { id?: string; linea_base_id?: string | null } | null;
        // Si la medición no se pudo congelar, el corte no se guarda «sin números» en silencio: se dice y no se escribe nada.
        if (eMed || !fila?.id)
          return fallo(`No se pudo congelar la medición de este corte${eMed ? `: ${eMed.message}` : ""}. No se guardó nada; vuelve a intentarlo.`, 500);
      }
      medicionId = fila?.id ?? null;
      if (!medicionId) return fallo("No se pudo congelar la medición de este corte. No se guardó nada; vuelve a intentarlo.", 500);

      // Período y condiciones del corte: SOLO esas columnas. Valores y derivados quedan como se congelaron.
      const meta: Record<string, unknown> = {};
      if (b.corte.periodo_desde && b.corte.periodo_hasta) {
        meta.periodo_desde = b.corte.periodo_desde;
        meta.periodo_hasta = b.corte.periodo_hasta;
      } else {
        avisoPeriodo = "El corte se guardó sin período: mientras no se sepa de qué fechas son sus números, la comparación con el punto de partida se muestra como observada, no como resultado.";
      }
      if (condiciones) meta.condiciones = condiciones;
      let aviso: string | undefined;
      if (Object.keys(meta).length) {
        const { error: eMeta } = await sb.from("mediciones").update(meta).eq("id", medicionId);
        if (eMeta) aviso = `El corte quedó congelado, pero no se pudo guardar su período o condiciones: ${eMeta.message}`;
      }
      // Contra qué versión del punto de partida se midió: queda escrito en la respuesta, no solo en la base.
      let version: number | null = null;
      if (fila?.linea_base_id) {
        const { data: lb } = await sb.from("mediciones").select("version").eq("id", fila.linea_base_id).maybeSingle();
        version = (lb as { version?: number } | null)?.version ?? null;
      }
      medicionInfo = { id: medicionId, linea_base_id: fila?.linea_base_id ?? null, version_linea_base: version, ...(aviso ? { aviso } : {}), ...(pendiente ? { reutilizada: true as const } : {}) };
    }

    const { data, error: eCorte } = await sb.from("checkpoints").insert({ company_id: id, numero, que_se_hizo: b.corte.que_se_hizo ?? null, que_se_trabo: b.corte.que_se_trabo ?? null, indicadores, regresiones: b.corte.regresiones ?? null, medicion_id: medicionId }).select("*").single();
    // El corte no se da por guardado si no se guardó: antes un fallo aquí devolvía 200 con la respuesta vacía.
    // Si la medición ya quedó congelada, se dice cómo reintentar sin duplicarla (ver `medicionSinCorte`).
    if (eCorte)
      return fallo(
        medicionId
          ? `La medición del corte quedó congelada, pero no se pudo guardar el corte (qué se hizo y qué se trabó): ${eCorte.message}. Vuelve a registrarlo con el mismo texto y sin cambiar los números: se enlazará a esa medición, no se congelará otra.`
          : `No se pudo guardar el corte (qué se hizo y qué se trabó): ${eCorte.message}`,
        500
      );
    // P1-17: cada regresión detectada es un hallazgo nuevo con su evidencia (una observación directa del consultor = fuente fuerte).
    let creados = 0;
    for (const r of b.corte.regresiones ?? []) {
      if (!r.que_volvio?.trim()) continue;
      const { data: s } = await sb.from("sources").insert({ company_id: id, tipo: "observacion", nombre: `Corte ${numero}: regresión observada`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: `${r.proceso ? `Proceso ${r.proceso}: ` : ""}${r.que_volvio}. ${r.evidencia ?? ""}`, origen: "consultor", estado: "leido" }).select("id").single();
      if (!s) continue;
      const { data: c } = await sb.from("claims").insert({ company_id: id, source_id: s.id, texto: `${r.proceso ? `En ${r.proceso}, ` : ""}${r.que_volvio}`, pilar: "procesos", tipo: "proceso", temporalidad: "actual", fecha_afirmacion: new Date().toISOString().slice(0, 10), estado: "confirmado", validado_por: perfil.id, validado_at: new Date().toISOString() }).select("id").single();
      if (!c) continue;
      const { data: f } = await sb.from("findings").insert({ company_id: id, pilar: "procesos", patron: null, titulo: `Regresión en monitoreo (corte ${numero}): ${r.que_volvio}`, causa_raiz: "El cambio no se sostuvo sin el consultor encima", impacto: "medio", veredicto: "improve", recomendacion: "Revisar el frente correspondiente y volver a instalar el proceso con su indicador", filtros: { proposito: { resultado: "pasa", nota: "" }, sabiduria: { resultado: "pasa", nota: "" }, excelencia: { resultado: "pasa", nota: "" } }, origen: "consultor", estado_revision: "aprobado" }).select("id").single();
      if (f) {
        await sb.from("finding_evidence").insert({ finding_id: f.id, claim_id: c.id, relacion: "sustenta" });
        await sb.from("corrections").insert({ finding_id: f.id, user_id: perfil.id, accion: "aprobado", comentario: "Regresión registrada en corte de monitoreo" });
        creados++;
      }
    }
    return ok({ ...data, hallazgos_por_regresion: creados, medicion: medicionInfo, ...(avisoPeriodo ? { aviso_periodo: avisoPeriodo } : {}) });
  }
  if (b.monitoreo) {
    await sb.from("companies").update({ etapa: "monitoreo" }).eq("id", id);
    return ok({ etapa: "monitoreo" });
  }
  if (b.cerrar) {
    const [{ data: c }, { data: hallazgos }, { data: plan }, { data: claims }, { data: corr }] = await Promise.all([
      sb.from("companies").select("nombre,sector,admision").eq("id", id).single(),
      sb.from("findings").select("pilar,patron,titulo,causa_raiz,impacto,veredicto,recomendacion,estado_revision").eq("company_id", id).in("estado_revision", ["aprobado", "corregido"]),
      sb.from("actions").select("accion,responsable,kpi,semana_inicio,semana_cierre,estado,impacto").eq("company_id", id),
      sb.from("claims").select("estado").eq("company_id", id),
      sb.from("corrections").select("accion,motivo").eq("finding_id", id),
    ]);
    const perfil_ = { nombre: c?.nombre, sector: c?.sector, admision: c?.admision, afirmaciones: (claims ?? []).length, caducadas: (claims ?? []).filter((x) => x.estado === "caducado").length, contradichas: (claims ?? []).filter((x) => x.estado === "contradicho").length, correcciones: corr?.length ?? 0 };
    const { data: caso, error } = await sb.from("cases").insert({ company_id: id, perfil: perfil_, hallazgos_validados: hallazgos, plan_aplicado: plan, resultado_90d: b.resultado_90d ?? null, cerrado_at: new Date().toISOString() }).select("id").single();
    if (error) return fallo(error.message, 500);
    await sb.from("companies").update({ etapa: "cerrado" }).eq("id", id);
    return ok({ case_id: caso.id });
  }
  return fallo("Nada que hacer");
});

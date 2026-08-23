import { z } from "zod";

export const Pilar = z.enum(["personas", "procesos", "producto", "marketing", "transversal"]);
export const TipoClaim = z.enum(["vision", "proposito", "meta", "proceso", "rol", "kpi", "precio", "politica", "cliente", "producto", "canal", "otro"]);
export const Temporalidad = z.enum(["actual", "historica", "aspiracional"]);
export const EstadoClaim = z.enum(["sin_verificar", "confirmado", "caducado", "contradicho"]);
export const Impacto = z.enum(["alto", "medio", "bajo"]);
export const Veredicto = z.enum(["keep", "improve", "replace", "remove", "create"]);
export const Ejecutor = z.enum(["humano", "software", "ia", "hibrido"]);
export const TipoNodo = z.enum(["inicio", "actividad", "decision", "espera", "fin"]);
export const Filtro = z.enum(["pasa", "no_pasa"]);
export const TipoRelacion = z.enum(["supports", "contradicts", "updates", "explains", "depends_on"]);

const fechaONull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

// 23.1 EXTRACTOR
export const SalidaExtractor = z.object({
  afirmaciones: z.array(
    z.object({
      texto: z.string().min(3),
      pilar: Pilar.catch("transversal"),
      tipo: TipoClaim.catch("otro"),
      temporalidad: Temporalidad.catch("actual"),
      fecha_afirmacion: fechaONull,
      fragmento: z.string().nullable().optional(),
      pagina: z.number().int().nullable().optional(),
      seccion: z.string().nullable().optional(),
      celda: z.string().nullable().optional(), // "hoja!F17" o "fila 12, columna origen"
      posible_instruccion: z.boolean().optional(), // 14.1: el texto intentaba dar órdenes al modelo
    })
  ),
});
export type SalidaExtractor = z.infer<typeof SalidaExtractor>;

// 23.2 CONTRASTADOR — ahora devuelve el tipo de relación (1.12)
export const SalidaContrastador = z.object({
  se_contradicen: z.boolean(),
  relacion: z.enum(["contradicts", "updates", "supports", "explains", "depends_on", "ninguna"]).catch("ninguna"),
  explicacion: z.string(),
  cual_parece_vigente: z.string().nullable(),
  pregunta_sugerida: z.string().nullable(),
});
export type SalidaContrastador = z.infer<typeof SalidaContrastador>;

// 23.3 ENTREVISTADOR
export const SalidaEntrevistador = z.object({
  preguntas: z
    .array(
      z.object({
        texto: z.string().min(5),
        bloque: z.string(),
        pilar: Pilar.nullable().optional(),
        origen_claim_id: z.string().uuid().nullable().optional(),
      })
    )
    .max(3),
  sesion_completa: z.boolean().optional(),
  // Claves de bloques sin cubrir que en realidad YA quedaron comprendidos con lo dicho hasta ahora.
  bloques_cubiertos: z.array(z.string()).optional(),
});
export type SalidaEntrevistador = z.infer<typeof SalidaEntrevistador>;

// 23.4 MINERO DE KNOW-HOW (1.5)
export const SalidaMinero = z.object({
  unidades: z.array(
    z.object({
      situacion: z.string().nullable(),
      senal: z.string().nullable(),
      decision: z.string().nullable(),
      excepcion: z.string().nullable(),
      estandar: z.string().nullable(),
      error_frecuente: z.string().nullable(),
      regla_practica: z.string().nullable(),
      escalamiento: z.string().nullable(),
      criterio_experto: z.string().nullable().optional(),
      proceso: z.string().nullable().optional(), // nombre del proceso al que pertenece, si se infiere
      criticidad: z.enum(["alta", "media", "baja"]).catch("media"),
      documentado: z.boolean().catch(false),
      destino: z.enum(["sop", "entrenamiento", "checklist", "criterio_calidad", "agente", "pendiente"]).catch("pendiente"),
      falta_profundizar: z.string().nullable().optional(),
    })
  ),
  riesgo_know_how_vacio: z.boolean().optional(),
});
export type SalidaMinero = z.infer<typeof SalidaMinero>;

// 23.5 ARQUITECTO (1.13: más campos por nodo)
export const NodoSalida = z.object({
  id: z.string(),
  tipo: TipoNodo,
  etiqueta: z.string(),
  responsable: z.string().nullable().optional(),
  rol: z.string().nullable().optional(),
  ejecutor: Ejecutor.nullable().optional(),
  herramienta: z.string().nullable().optional(),
  tiempo: z.string().nullable().optional(),
  espera: z.string().nullable().optional(),
  entrada: z.string().nullable().optional(),
  salida: z.string().nullable().optional(),
  evidencia: z.string().nullable().optional(),
  estandar: z.string().nullable().optional(),
  problema: z.string().nullable().optional(),
  veredicto: Veredicto.nullable().optional(),
});
export const SalidaArquitecto = z.object({
  nombre: z.string(),
  area: z.string().nullable().optional(),
  nodos: z.array(NodoSalida),
  conexiones: z.array(z.object({ de: z.string(), a: z.string(), etiqueta: z.string().nullable().optional() })),
  // Una pregunta de alto valor sobre el hueco mas importante del proceso (o null si esta completo).
  pregunta_gap: z.string().nullable().optional(),
});
export type SalidaArquitecto = z.infer<typeof SalidaArquitecto>;

// 23.6 DIAGNOSTICADOR (1.8: sub-preguntas de cada filtro)
const FiltroDetalle = z.object({ resultado: Filtro, nota: z.string(), respuestas: z.array(z.string()).optional() });
export const SalidaDiagnosticador = z.object({
  hallazgos: z.array(
    z.object({
      titulo: z.string(),
      patron: z.string().nullable(),
      causa_raiz: z.string(),
      impacto: Impacto,
      veredicto: Veredicto.nullable(),
      recomendacion: z.string().nullable(),
      // Qué puede estar costando este problema (dinero, tiempo, calidad o libertad), sustentado; null si no se puede sustentar.
      costo_posible: z.string().nullable().optional(),
      // Puede venir vacío: el handler y el benchmark descartan el hallazgo ("sin evidencia no entra") sin perder el resto
      // de la respuesta. Verificado con Gemini: un hallazgo de know-how sin ids invalidaba los otros hallazgos del pilar.
      claim_ids: z.array(z.string()),
      claims_contrarios: z.array(z.string()).default([]),
      filtros: z.object({ proposito: FiltroDetalle, sabiduria: FiltroDetalle, excelencia: FiltroDetalle }),
      dimension: z.string().nullable().optional(),
      informacion_insuficiente: z.boolean().optional(),
      preserva: z.boolean().optional(), // fortaleza que NO debe destruirse
    })
  ),
  preguntas_pendientes: z.array(z.object({ texto: z.string(), dimension: z.string().nullable().optional(), para: z.enum(["dueno", "lider", "personal", "datos"]).catch("dueno") })).default([]),
  dimensiones_sin_evidencia: z.array(z.string()).default([]),
  resumen_pilar: z.string().optional(),
});
export type SalidaDiagnosticador = z.infer<typeof SalidaDiagnosticador>;

// 23.7 AUDITOR
export const SalidaAuditor = z.object({
  auditorias: z.array(
    z.object({
      id: z.string(),
      sustentado: z.boolean(),
      evidencia_contraria: z.array(z.string()).default([]),
      es_sintoma: z.boolean(),
      culpa_persona_sin_auditar: z.boolean().optional(),
      benchmark_como_hecho: z.boolean().optional(),
      duplicado_de: z.string().nullable().optional(),
      // Si el fenomeno es real y esta evidenciado pero la causa esta mal formulada, el auditor la corrige aqui
      // (y marca sustentado true): un hallazgo real no se entierra por una causa mal escrita.
      causa_corregida: z.string().nullable().optional(),
      observacion: z.string(),
    })
  ),
});
export type SalidaAuditor = z.infer<typeof SalidaAuditor>;

// 23.8 PLANIFICADOR
export const SalidaPlanificador = z.object({
  frentes: z.array(
    z.object({
      prioridad: z.number().int(),
      semana_inicio: z.number().int().min(1).max(7),
      semana_cierre: z.number().int().min(1).max(7),
      accion: z.string(),
      responsable: z.string(),
      kpi: z.string(),
      evidencia: z.string(),
      impacto: Impacto,
      finding_id: z.string(),
    })
  ),
});
export type SalidaPlanificador = z.infer<typeof SalidaPlanificador>;

// 23.9 REDACTOR
export const SalidaRedactor = z.object({
  titulo: z.string(),
  secciones: z.array(
    z.object({
      titulo: z.string(),
      parrafos: z.array(z.string()),
      fuentes: z.array(z.string()).default([]),
    })
  ),
});
export type SalidaRedactor = z.infer<typeof SalidaRedactor>;

// TO-BE
export const SalidaToBe = SalidaArquitecto.extend({
  justificacion: z.string().optional(),
  cambios: z.array(z.object({ nodo: z.string(), veredicto: Veredicto, por_que: z.string() })).default([]),
});

// SOP
export const SalidaSop = z.object({
  objetivo: z.string(),
  disparador: z.string(),
  responsable: z.string(),
  pasos: z.array(z.object({ n: z.number().int(), que: z.string(), quien: z.string().nullable().optional(), estandar: z.string().nullable().optional() })),
  entradas: z.array(z.string()).default([]),
  salidas: z.array(z.string()).default([]),
  estandar: z.string(),
  indicador: z.string(),
  excepciones: z.array(z.object({ situacion: z.string(), que_hacer: z.string() })).default([]),
});
export type SalidaSop = z.infer<typeof SalidaSop>;

// Admisión
export const SalidaAdmision = z.object({
  admisible: z.boolean(),
  motivo: z.string(),
  senales: z.array(z.string()).default([]),
});

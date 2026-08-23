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
    })
  ),
});
export type SalidaExtractor = z.infer<typeof SalidaExtractor>;

// 23.2 CONTRASTADOR
export const SalidaContrastador = z.object({
  se_contradicen: z.boolean(),
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
});
export type SalidaEntrevistador = z.infer<typeof SalidaEntrevistador>;

// 23.4 MINERO DE KNOW-HOW
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
      destino: z.enum(["sop", "entrenamiento", "checklist", "criterio_calidad", "agente", "pendiente"]).catch("pendiente"),
      falta_profundizar: z.string().nullable().optional(),
    })
  ),
  riesgo_know_how_vacio: z.boolean().optional(),
});
export type SalidaMinero = z.infer<typeof SalidaMinero>;

// 23.5 ARQUITECTO
export const SalidaArquitecto = z.object({
  nombre: z.string(),
  area: z.string().nullable().optional(),
  nodos: z.array(
    z.object({
      id: z.string(),
      tipo: TipoNodo,
      etiqueta: z.string(),
      responsable: z.string().nullable().optional(),
      ejecutor: Ejecutor.nullable().optional(),
      herramienta: z.string().nullable().optional(),
      tiempo: z.string().nullable().optional(),
      problema: z.string().nullable().optional(),
      veredicto: Veredicto.nullable().optional(),
    })
  ),
  conexiones: z.array(z.object({ de: z.string(), a: z.string(), etiqueta: z.string().nullable().optional() })),
});
export type SalidaArquitecto = z.infer<typeof SalidaArquitecto>;

// 23.6 DIAGNOSTICADOR
export const SalidaDiagnosticador = z.object({
  hallazgos: z.array(
    z.object({
      titulo: z.string(),
      patron: z.string().nullable(),
      causa_raiz: z.string(),
      impacto: Impacto,
      veredicto: Veredicto.nullable(),
      recomendacion: z.string().nullable(),
      claim_ids: z.array(z.string()).min(1),
      claims_contrarios: z.array(z.string()).default([]),
      filtros: z.object({
        proposito: z.object({ resultado: Filtro, nota: z.string() }),
        sabiduria: z.object({ resultado: Filtro, nota: z.string() }),
        excelencia: z.object({ resultado: Filtro, nota: z.string() }),
      }),
      informacion_insuficiente: z.boolean().optional(),
    })
  ),
  preguntas_pendientes: z.array(z.string()).default([]),
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
      duplicado_de: z.string().nullable().optional(),
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

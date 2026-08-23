/**
 * EMPRESA DEMO — "Frutas del Valle SAC" (distribuidora de fruta a restaurantes, Lima). 14 personas.
 * Sin Supabase, sin IA. Modela el flujo completo con los mismos tipos que usa el código real.
 *
 * Lo que esconde a propósito:
 *  - Visión 2022 "expansión a provincias" que el dueño ya no quiere (caducada).
 *  - Organigrama declara un jefe de ventas; las decisiones vuelven al dueño (contradicción documentos vs equipo).
 *  - Canal único: 92% de clientes nuevos por referidos de un solo chef (el dueño no lo ve como riesgo).
 *  - Rosa (Compras, 14 años) tiene know-how crítico no escrito: la fortaleza que no se debe destruir.
 *  - El dueño dice "ventas funciona bien"; el CSV muestra 38% de pedidos con reclamo por fruta pasada (producto, no ventas).
 *  - Problema que el dueño no vio: la fruta se pasa porque Compras compra por precio cuando Rosa no está.
 */

import type { ClaimC } from "@/lib/rules/contradiccion";
import type { ClaimMin } from "@/lib/rules/vigencia";
import type { ClaimEvidencia } from "@/lib/rules/evidencia";
import type { Flujo } from "@/lib/rules/grafo";

export const EMPRESA = { id: "emp-demo", nombre: "Frutas del Valle SAC", sector: "Distribución de alimentos" };

export const PARTICIPANTES = [
  { id: "p-dueno", nombre: "Julio", puesto: "Gerente general", rol: "dueno" },
  { id: "p-socio", nombre: "Marta", puesto: "Socia / Finanzas", rol: "socio" },
  { id: "p-lider-ventas", nombre: "Diego", puesto: "Jefe de ventas", rol: "lider" },
  { id: "p-lider-ops", nombre: "Carmen", puesto: "Jefa de operaciones", rol: "lider" },
  { id: "p-rosa", nombre: "Rosa", puesto: "Compradora", rol: "empleado" },
  { id: "p-chofer", nombre: "Luis", puesto: "Chofer repartidor", rol: "empleado" },
  { id: "p-asesor", nombre: "Pamela", puesto: "Asesora comercial", rol: "empleado" },
] as const;

export const FUENTES = [
  { id: "s-plan", tipo: "documento", nombre: "Plan estratégico 2022", fecha_origen: "2022-03-15", origen: "cliente" },
  { id: "s-org", tipo: "foto", nombre: "Organigrama (foto de la pared)", fecha_origen: null, origen: "cliente" },
  { id: "s-precios", tipo: "foto", nombre: "Lista de precios", fecha_origen: "2025-11-01", origen: "cliente" },
  { id: "s-ventas", tipo: "dato", nombre: "pedidos_2026.csv", fecha_origen: "2026-08-01", origen: "consultor" },
  { id: "s-ent-dueno", tipo: "entrevista", nombre: "Entrevista · dueño", fecha_origen: "2026-08-22", origen: "cliente" },
  { id: "s-ent-diego", tipo: "entrevista", nombre: "Entrevista · jefe de ventas", fecha_origen: "2026-08-22", origen: "cliente" },
  { id: "s-ent-rosa", tipo: "entrevista", nombre: "Entrevista · compradora", fecha_origen: "2026-08-22", origen: "cliente" },
  { id: "s-ent-pamela", tipo: "entrevista", nombre: "Entrevista · asesora", fecha_origen: "2026-08-22", origen: "cliente" },
  { id: "s-ent-luis", tipo: "entrevista", nombre: "Entrevista · chofer", fecha_origen: "2026-08-22", origen: "cliente" },
] as const;

export const FRAGMENTOS = [
  { id: "fr-plan-vision", source_id: "s-plan", pagina: 3, seccion: "Visión", celda: null, audio_desde: null, texto: "Ser el distribuidor de fruta líder en Lima y provincias para 2026." },
  { id: "fr-plan-meta", source_id: "s-plan", pagina: 7, seccion: "Metas comerciales", celda: null, audio_desde: null, texto: "Alcanzar S/ 5 millones de facturación anual." },
  { id: "fr-plan-cliente", source_id: "s-plan", pagina: 9, seccion: "Cliente objetivo", celda: null, audio_desde: null, texto: "Cadenas de restaurantes con más de 5 locales." },
  { id: "fr-org-jefe", source_id: "s-org", pagina: null, seccion: "Organigrama", celda: null, audio_desde: null, texto: "Jefe de Ventas: aprueba descuentos y condiciones de pago." },
  { id: "fr-precio", source_id: "s-precios", pagina: null, seccion: "Lista", celda: null, audio_desde: null, texto: "Palta Hass: S/ 9.50 el kilo." },
  { id: "fr-csv-reclamos", source_id: "s-ventas", pagina: null, seccion: "pedidos", celda: "reclamo!G2:G1340", audio_desde: null, texto: "38% de los pedidos de julio tienen reclamo por fruta pasada." },
  { id: "fr-csv-canal", source_id: "s-ventas", pagina: null, seccion: "pedidos", celda: "origen!C2:C1340", audio_desde: null, texto: "92% de clientes nuevos 2026 con origen = 'referido chef Ramos'." },
  { id: "fr-csv-tickets", source_id: "s-ventas", pagina: null, seccion: "pedidos", celda: "cliente!B", audio_desde: null, texto: "81% de la facturación proviene de restaurantes independientes de 1 local." },
  { id: "fr-ent-dueno-ventas", source_id: "s-ent-dueno", pagina: null, seccion: "Pregunta 4", celda: null, audio_desde: 201, texto: "Ventas funciona bien, Diego lo tiene controlado." },
  { id: "fr-ent-dueno-vision", source_id: "s-ent-dueno", pagina: null, seccion: "Pregunta 2", celda: null, audio_desde: 95, texto: "Ya no quiero provincias. Quiero ser el mejor de Lima y trabajar 30 horas, no 70." },
  { id: "fr-ent-dueno-meta", source_id: "s-ent-dueno", pagina: null, seccion: "Pregunta 5", celda: null, audio_desde: 260, texto: "La meta real es USD 3 millones, ya no 5 millones de soles." },
  { id: "fr-ent-diego", source_id: "s-ent-diego", pagina: null, seccion: "Pregunta 3", celda: null, audio_desde: 140, texto: "Todo descuento lo tengo que consultar con Julio, aunque sea de 2%." },
  { id: "fr-ent-pamela", source_id: "s-ent-pamela", pagina: null, seccion: "Pregunta 2", celda: null, audio_desde: 60, texto: "Cuando Julio está de viaje los pedidos con descuento se quedan parados dos o tres días." },
  { id: "fr-ent-rosa", source_id: "s-ent-rosa", pagina: null, seccion: "Pregunta 4", celda: null, audio_desde: 180, texto: "Cuando la palta tiene esta pequeña textura, en dos días está perfecta. Cuando no estoy, compran por precio y llega pasada." },
  { id: "fr-ent-luis", source_id: "s-ent-luis", pagina: null, seccion: "Pregunta 3", celda: null, audio_desde: 120, texto: "Los martes reparto fruta que ya está blanda; los restaurantes me la devuelven en la puerta." },
] as const;

type Claim = ClaimC & ClaimMin & ClaimEvidencia & { fragment_id: string; pilar: string; fecha_afirmacion: string | null; source_tipo: string };

function claim(o: { id: string; texto: string; pilar: string; tipo: string; temporalidad: string; fragment_id: string; participant_id?: string | null; fecha?: string | null; estado?: string }): Claim {
  const fr = FRAGMENTOS.find((f) => f.id === o.fragment_id)!;
  const src = FUENTES.find((s) => s.id === fr.source_id)!;
  return {
    id: o.id,
    texto: o.texto,
    pilar: o.pilar,
    tipo: o.tipo,
    temporalidad: o.temporalidad,
    fragment_id: o.fragment_id,
    source_id: src.id,
    source_tipo: src.tipo,
    participant_id: o.participant_id ?? null,
    fecha_afirmacion: o.fecha === undefined ? src.fecha_origen : o.fecha,
    estado: o.estado ?? "sin_verificar",
    contradice_a: null,
  };
}

/** Afirmaciones tal como saldrían del EXTRACTOR (documentos) y de extraerDeRespuesta (entrevistas). */
export const CLAIMS: Claim[] = [
  claim({ id: "c-vision-2022", texto: "Ser el distribuidor de fruta líder en Lima y provincias para 2026", pilar: "transversal", tipo: "vision", temporalidad: "aspiracional", fragment_id: "fr-plan-vision" }),
  claim({ id: "c-meta-2022", texto: "Meta: S/ 5 millones de facturación anual", pilar: "marketing", tipo: "meta", temporalidad: "actual", fragment_id: "fr-plan-meta" }),
  claim({ id: "c-cliente-2022", texto: "El cliente objetivo son cadenas con más de 5 locales", pilar: "marketing", tipo: "cliente", temporalidad: "actual", fragment_id: "fr-plan-cliente" }),
  claim({ id: "c-org-jefe", texto: "El jefe de ventas aprueba descuentos y condiciones de pago", pilar: "personas", tipo: "rol", temporalidad: "actual", fragment_id: "fr-org-jefe", fecha: null }),
  claim({ id: "c-precio", texto: "La palta Hass cuesta S/ 9.50 el kilo", pilar: "producto", tipo: "precio", temporalidad: "actual", fragment_id: "fr-precio" }),
  claim({ id: "c-csv-reclamos", texto: "38% de los pedidos de julio tienen reclamo por fruta pasada", pilar: "producto", tipo: "kpi", temporalidad: "actual", fragment_id: "fr-csv-reclamos", estado: "confirmado" }),
  claim({ id: "c-csv-canal", texto: "92% de los clientes nuevos de 2026 llegan por referido del chef Ramos", pilar: "marketing", tipo: "canal", temporalidad: "actual", fragment_id: "fr-csv-canal", estado: "confirmado" }),
  claim({ id: "c-csv-cliente", texto: "81% de la facturación proviene de restaurantes independientes de 1 local", pilar: "marketing", tipo: "cliente", temporalidad: "actual", fragment_id: "fr-csv-tickets", estado: "confirmado" }),
  claim({ id: "c-dueno-ventas", texto: "Ventas funciona bien y el jefe de ventas lo tiene controlado", pilar: "procesos", tipo: "proceso", temporalidad: "actual", fragment_id: "fr-ent-dueno-ventas", participant_id: "p-dueno", estado: "confirmado" }),
  claim({ id: "c-dueno-vision", texto: "El dueño quiere ser el mejor distribuidor de Lima, sin provincias, trabajando 30 horas", pilar: "transversal", tipo: "vision", temporalidad: "aspiracional", fragment_id: "fr-ent-dueno-vision", participant_id: "p-dueno", estado: "confirmado" }),
  claim({ id: "c-dueno-meta", texto: "La meta actual es USD 3 millones", pilar: "marketing", tipo: "meta", temporalidad: "actual", fragment_id: "fr-ent-dueno-meta", participant_id: "p-dueno", estado: "confirmado" }),
  claim({ id: "c-diego-descuentos", texto: "Todo descuento, incluso de 2%, lo decide el dueño", pilar: "personas", tipo: "rol", temporalidad: "actual", fragment_id: "fr-ent-diego", participant_id: "p-lider-ventas" }),
  claim({ id: "c-pamela-parados", texto: "Cuando el dueño viaja, los pedidos con descuento se detienen dos o tres días", pilar: "procesos", tipo: "proceso", temporalidad: "actual", fragment_id: "fr-ent-pamela", participant_id: "p-asesor" }),
  claim({ id: "c-rosa-compra", texto: "Cuando Rosa no está, se compra por precio y la fruta llega pasada", pilar: "procesos", tipo: "proceso", temporalidad: "actual", fragment_id: "fr-ent-rosa", participant_id: "p-rosa" }),
  claim({ id: "c-luis-devol", texto: "Los martes se reparte fruta blanda y los restaurantes la devuelven", pilar: "producto", tipo: "producto", temporalidad: "actual", fragment_id: "fr-ent-luis", participant_id: "p-chofer" }),
];

/** Lo que el CONTRASTADOR respondería para los pares candidatos (simulado, determinista). */
export const JUICIOS_CONTRASTE: Record<string, { se_contradicen: boolean; cual_parece_vigente: string | null; pregunta_sugerida: string | null }> = {
  "c-meta-2022|c-dueno-meta": { se_contradicen: true, cual_parece_vigente: "c-dueno-meta", pregunta_sugerida: "Encontré dos metas: S/ 5 millones en el plan 2022 y USD 3 millones en lo que dijiste hoy. ¿Cuál es la dirección actual?" },
  "c-cliente-2022|c-csv-cliente": { se_contradicen: true, cual_parece_vigente: "c-csv-cliente", pregunta_sugerida: "El plan dice cadenas de más de 5 locales; el 81% de la venta es a restaurantes de 1 local. ¿Quién es tu cliente real?" },
  "c-diego-descuentos|c-org-jefe": { se_contradicen: true, cual_parece_vigente: "c-diego-descuentos", pregunta_sugerida: "El organigrama dice que el jefe de ventas aprueba descuentos; él dice que todo pasa por ti. ¿Quién decide hoy?" },
  "c-dueno-ventas|c-pamela-parados": { se_contradicen: false, cual_parece_vigente: null, pregunta_sugerida: null }, // niveles distintos: una es percepción global, otra un hecho puntual → ante la duda, false
  "c-dueno-ventas|c-rosa-compra": { se_contradicen: false, cual_parece_vigente: null, pregunta_sugerida: null },
  "c-pamela-parados|c-rosa-compra": { se_contradicen: false, cual_parece_vigente: null, pregunta_sugerida: null },
};

/** Respuestas del dueño en la sesión de validación (los tres botones). */
export const VALIDACIONES: Record<string, "si" | "ya_no" | "nunca"> = {
  "c-vision-2022": "ya_no",
  "c-meta-2022": "ya_no",
  "c-cliente-2022": "nunca",
  "c-org-jefe": "ya_no",
  "c-precio": "si",
};

/** Sesiones y respuestas (trazabilidad persona → rol → sesión → pregunta → respuesta → afirmación). */
export const SESIONES = [
  { id: "ses-dueno-sueno", participant_id: "p-dueno", tipo: "sueno_dueno" },
  { id: "ses-dueno-empresa", participant_id: "p-dueno", tipo: "empresa_dueno" },
  { id: "ses-diego", participant_id: "p-lider-ventas", tipo: "lider" },
  { id: "ses-rosa", participant_id: "p-rosa", tipo: "personal" },
  { id: "ses-rosa-kh", participant_id: "p-rosa", tipo: "know_how" },
  { id: "ses-pamela", participant_id: "p-asesor", tipo: "personal" },
  { id: "ses-luis", participant_id: "p-chofer", tipo: "personal" },
] as const;

export const RESPUESTAS = [
  { id: "r1", session_id: "ses-dueno-sueno", bloque: "vida_deseada", orden: 2, pregunta: "Imagina un martes normal dentro de tres años. ¿Dónde estás y qué ya no haces?", respuesta: "Ya no quiero provincias. Quiero ser el mejor de Lima y trabajar 30 horas, no 70.", claim_id: "c-dueno-vision" },
  { id: "r2", session_id: "ses-dueno-empresa", bloque: "hoy", orden: 4, pregunta: "¿Qué área funciona especialmente bien?", respuesta: "Ventas funciona bien, Diego lo tiene controlado.", claim_id: "c-dueno-ventas" },
  { id: "r3", session_id: "ses-dueno-empresa", bloque: "validacion", orden: 5, pregunta: "Encontré dos metas distintas. ¿Cuál refleja la dirección actual?", respuesta: "La meta real es USD 3 millones, ya no 5 millones de soles.", claim_id: "c-dueno-meta" },
  { id: "r4", session_id: "ses-diego", bloque: "personas", orden: 3, pregunta: "¿Puedes decidir un descuento sin pedir permiso?", respuesta: "Todo descuento lo tengo que consultar con Julio, aunque sea de 2%.", claim_id: "c-diego-descuentos" },
  { id: "r5", session_id: "ses-pamela", bloque: "trabajo_real", orden: 2, pregunta: "¿Dónde se traba tu trabajo?", respuesta: "Cuando Julio está de viaje los pedidos con descuento se quedan parados dos o tres días.", claim_id: "c-pamela-parados" },
  { id: "r6", session_id: "ses-rosa-kh", bloque: "know_how", orden: 4, pregunta: "¿Qué señal ves antes de que aparezca el problema?", respuesta: "Cuando la palta tiene esta pequeña textura, en dos días está perfecta. Cuando no estoy, compran por precio y llega pasada.", claim_id: "c-rosa-compra" },
  { id: "r7", session_id: "ses-luis", bloque: "trabajo_real", orden: 3, pregunta: "¿Qué se rehace más de una vez?", respuesta: "Los martes reparto fruta que ya está blanda; los restaurantes me la devuelven en la puerta.", claim_id: "c-luis-devol" },
] as const;

/** Lo que el MINERO devolvería para Rosa (simulado). */
export const KNOW_HOW_ROSA = {
  unidades: [
    { situacion: "Compra de palta en el mercado mayorista", senal: "Pequeña textura en la cáscara: en dos días está en su punto", decision: "Comprar esa aunque cueste 10% más", excepcion: "Si el cliente la necesita hoy, elegir la de cáscara lisa y más oscura", estandar: "Fruta que llega al restaurante con 2 días de vida útil", error_frecuente: "Comprar por precio o por color", regla_practica: "Precio no decide; textura decide", escalamiento: "Si ningún proveedor tiene textura correcta, avisar a Carmen antes de comprar", destino: "criterio_calidad" as const, falta_profundizar: null },
  ],
  riesgo_know_how_vacio: false,
};

/** Lo que el DIAGNOSTICADOR devolvería por pilar (simulado). Incluye un hallazgo que el auditor debe derribar. */
export const DIAGNOSTICO_SIMULADO = {
  personas: {
    hallazgos: [
      { titulo: "Las decisiones de descuento vuelven al dueño aunque el organigrama las delega", patron: "dependencia_fundador", causa_raiz: "No existe una política de descuentos con rangos de autoridad por puesto", impacto: "alto" as const, veredicto: "create" as const, recomendacion: "Definir rangos de descuento que el jefe de ventas decide solo, y medir pedidos detenidos por semana", claim_ids: ["c-diego-descuentos", "c-pamela-parados"], claims_contrarios: ["c-org-jefe"], filtros: { proposito: { resultado: "pasa" as const, nota: "Libera tiempo del dueño" }, sabiduria: { resultado: "pasa" as const, nota: "Ataca la causa: la política, no a Diego" }, excelencia: { resultado: "pasa" as const, nota: "Mejora el tiempo de respuesta" } } },
      { titulo: "El jefe de ventas es incompetente", patron: null, causa_raiz: "Diego no decide", impacto: "alto" as const, veredicto: "replace" as const, recomendacion: "Reemplazar al jefe de ventas", claim_ids: ["c-diego-descuentos"], claims_contrarios: [], filtros: { proposito: { resultado: "pasa" as const, nota: "" }, sabiduria: { resultado: "no_pasa" as const, nota: "Culpa a la persona sin auditar el puesto ni la autoridad" }, excelencia: { resultado: "pasa" as const, nota: "" } } },
    ],
  },
  producto: {
    hallazgos: [
      { titulo: "Fruta pasada en el 38% de los pedidos cuando Rosa no compra", patron: "personas_disfrazado_de_proceso", causa_raiz: "El criterio de compra vive en una sola persona y no está escrito: sin Rosa se compra por precio", impacto: "alto" as const, veredicto: "keep" as const, recomendacion: "Conservar el criterio de Rosa, escribirlo como estándar de compra y entrenar a un segundo comprador", claim_ids: ["c-csv-reclamos", "c-rosa-compra", "c-luis-devol"], claims_contrarios: ["c-dueno-ventas"], filtros: { proposito: { resultado: "pasa" as const, nota: "Preserva lo que hace especial a la empresa" }, sabiduria: { resultado: "pasa" as const, nota: "Causa, no síntoma" }, excelencia: { resultado: "pasa" as const, nota: "Sube el estándar" } } },
    ],
  },
  marketing: {
    hallazgos: [
      { titulo: "El 92% de los clientes nuevos depende de un solo referidor", patron: "canal_unico", causa_raiz: "No existe ningún proceso de captación propio; la adquisición es un favor personal", impacto: "alto" as const, veredicto: "create" as const, recomendacion: "Abrir un segundo canal de captación y medir clientes nuevos por canal cada mes", claim_ids: ["c-csv-canal"], claims_contrarios: [], filtros: { proposito: { resultado: "pasa" as const, nota: "" }, sabiduria: { resultado: "pasa" as const, nota: "" }, excelencia: { resultado: "pasa" as const, nota: "" } } },
      { titulo: "Subir el precio de la palta 40% para compensar reclamos", patron: null, causa_raiz: "Margen bajo", impacto: "medio" as const, veredicto: "improve" as const, recomendacion: "Subir el precio 40%", claim_ids: ["c-precio"], claims_contrarios: [], filtros: { proposito: { resultado: "no_pasa" as const, nota: "Cobra más por un producto que llega pasado: vacía la promesa de calidad" }, sabiduria: { resultado: "no_pasa" as const, nota: "Victoria inmediata, problema futuro" }, excelencia: { resultado: "no_pasa" as const, nota: "No mejora el estándar" } } },
    ],
  },
};

/** Lo que el AUDITOR respondería (simulado): derriba el hallazgo que culpa a la persona. */
export const AUDITORIA_SIMULADA: Record<string, { sustentado: boolean; es_sintoma: boolean; observacion: string }> = {
  "Las decisiones de descuento vuelven al dueño aunque el organigrama las delega": { sustentado: true, es_sintoma: false, observacion: "Dos fuentes de áreas distintas coinciden" },
  "El jefe de ventas es incompetente": { sustentado: false, es_sintoma: true, observacion: "Una sola afirmación sin verificar; no se auditó puesto ni autoridad" },
  "Fruta pasada en el 38% de los pedidos cuando Rosa no compra": { sustentado: true, es_sintoma: false, observacion: "Dato operativo + dos personas de áreas distintas" },
  "El 92% de los clientes nuevos depende de un solo referidor": { sustentado: true, es_sintoma: false, observacion: "Dato operativo" },
  "Subir el precio de la palta 40% para compensar reclamos": { sustentado: true, es_sintoma: true, observacion: "Es un síntoma del problema de producto" },
};

export const AS_IS_VENTAS: Flujo = {
  nodos: [
    { id: "n1", tipo: "inicio", etiqueta: "Restaurante pide por WhatsApp" },
    { id: "n2", tipo: "actividad", etiqueta: "Pamela arma el pedido", ejecutor: "humano", veredicto: "keep" },
    { id: "n3", tipo: "decision", etiqueta: "¿Pide descuento?" },
    { id: "n4", tipo: "espera", etiqueta: "Espera que Julio apruebe", veredicto: "remove" },
    { id: "n5", tipo: "actividad", etiqueta: "Compras arma la fruta", ejecutor: "humano", veredicto: "improve" },
    { id: "n6", tipo: "actividad", etiqueta: "Luis reparte", ejecutor: "humano", veredicto: "keep" },
    { id: "n7", tipo: "decision", etiqueta: "¿Restaurante acepta la fruta?" },
    { id: "n8", tipo: "fin", etiqueta: "Pedido cobrado" },
    { id: "n9", tipo: "fin", etiqueta: "Fruta devuelta, pedido perdido" },
  ],
  conexiones: [
    { de: "n1", a: "n2" },
    { de: "n2", a: "n3" },
    { de: "n3", a: "n4", etiqueta: "sí" },
    { de: "n3", a: "n5", etiqueta: "no" },
    { de: "n4", a: "n5" },
    { de: "n5", a: "n6" },
    { de: "n6", a: "n7" },
    { de: "n7", a: "n8", etiqueta: "sí" },
    { de: "n7", a: "n9", etiqueta: "no" },
  ],
};

export const TO_BE_VENTAS: Flujo = {
  nodos: [
    { id: "t1", tipo: "inicio", etiqueta: "Restaurante pide por WhatsApp", veredicto: "keep" },
    { id: "t2", tipo: "actividad", etiqueta: "Pamela arma el pedido", ejecutor: "humano", veredicto: "keep" },
    { id: "t3", tipo: "decision", etiqueta: "¿Pide descuento?", veredicto: "keep" },
    { id: "t4", tipo: "actividad", etiqueta: "Jefe de ventas aprueba dentro de su rango", ejecutor: "humano", veredicto: "create" },
    { id: "t5", tipo: "actividad", etiqueta: "Compras arma la fruta", ejecutor: "humano", veredicto: "improve" },
    { id: "t6", tipo: "actividad", etiqueta: "Luis reparte", ejecutor: "humano", veredicto: "keep" },
    { id: "t7", tipo: "decision", etiqueta: "¿Restaurante acepta la fruta?", veredicto: "keep" },
    { id: "t8", tipo: "fin", etiqueta: "Pedido cobrado", veredicto: "keep" },
    { id: "t9", tipo: "fin", etiqueta: "Fruta devuelta, pedido perdido", veredicto: "keep" },
    { id: "t10", tipo: "actividad", etiqueta: "Registrar reclamo y causa", ejecutor: "software", veredicto: "create" },
  ],
  conexiones: [
    { de: "t1", a: "t2" },
    { de: "t2", a: "t3" },
    { de: "t3", a: "t4", etiqueta: "sí" },
    { de: "t3", a: "t5", etiqueta: "no" },
    { de: "t4", a: "t5" },
    { de: "t5", a: "t6" },
    { de: "t6", a: "t7" },
    { de: "t7", a: "t8", etiqueta: "sí" },
    { de: "t7", a: "t10", etiqueta: "no" },
    { de: "t10", a: "t9" },
  ],
};

/** Lo que el PLANIFICADOR devolvería (simulado): viola el tope a propósito para probar la regla en código. */
export const PLAN_SIMULADO = [
  { prioridad: 1, semana_inicio: 1, semana_cierre: 2, accion: "Escribir el estándar de compra de Rosa y entrenar a Carmen como segunda compradora", responsable: "Jefa de operaciones", kpi: "% pedidos con reclamo por fruta pasada", evidencia: "Estándar impreso en Compras", impacto: "alto", finding_id: "h-producto" },
  { prioridad: 2, semana_inicio: 1, semana_cierre: 2, accion: "Definir rangos de descuento que el jefe de ventas aprueba solo", responsable: "Gerente general", kpi: "Pedidos detenidos por aprobación / semana", evidencia: "Política firmada", impacto: "alto", finding_id: "h-personas" },
  { prioridad: 3, semana_inicio: 1, semana_cierre: 3, accion: "Abrir un segundo canal: visitas a 10 restaurantes nuevos por semana", responsable: "Asesora comercial", kpi: "Clientes nuevos por canal", evidencia: "Registro de visitas", impacto: "alto", finding_id: "h-marketing" },
  { prioridad: 4, semana_inicio: 1, semana_cierre: 2, accion: "Registrar cada reclamo con su causa", responsable: "Chofer repartidor", kpi: "Reclamos registrados / reclamos totales", evidencia: "Hoja de reclamos", impacto: "medio", finding_id: "h-producto" },
  { prioridad: 5, semana_inicio: 2, semana_cierre: 4, accion: "Frente huérfano", responsable: "Nadie", kpi: "x", evidencia: "x", impacto: "bajo", finding_id: "h-inexistente" },
];

/**
 * DOS EMPRESAS FICTICIAS PARA LA ESTRATEGIA (spec-estrategia-8x.md §9.1). Nunca datos de un cliente real: el repositorio
 * es público. Montos redondos e inventados; los rubros no son los de ningún cliente.
 *
 *  · «Frutas del Valle SAC» (la de tests/fixtures/empresa-demo.ts, que ya es inventada): distribuidora de fruta a
 *    restaurantes. Tabla de productos (una línea que resta y una sin costo), gastos del mes, ficha de negocio con
 *    crédito e inventario, afirmaciones de las cuatro clases, hallazgos revisados, pendientes, provisionales y
 *    rechazados, ficha de dirección con propuestas sin revisar, procesos y respuestas del dueño a las preguntas de la
 *    estrategia.
 *  · «Consultorio Dental Sonrisa Norte» (ficticio): cobra por caso y casi no tiene datos. Sirve para el mínimo, los «sin
 *    dato» y las preguntas.
 *
 * Toda cifra esperada de las pruebas se puede rehacer a mano con lo de aquí; las cuentas están en cada prueba.
 *
 * Al final, las SALIDAS FALSAS DEL MODELO para «Frutas del Valle» (§9.1): las buenas (LENTE_DINERO_BUENA,
 * LENTE_TERRENO_BUENA, ROJO_BUENO) y las malas a propósito, cada una con lo que la lista de control tiene que rechazar.
 * Ninguna cifra va escrita en sus textos: todas como {{id}}, como se le pide al modelo.
 */
import { FICHA_VACIA, type CostoMes, type FichaNegocio } from "@/lib/rentabilidad";
import { fichaVacia, type Ficha, type Item } from "@/lib/ficha-direccion";
import type { LineaProducto } from "@/lib/producto";
import type { AfirmacionEntrada, EntradasPaquete, HallazgoEntrada, MetricaEntrada, RespuestaEntrada } from "@/lib/estrategia/paquete";
import type { Jugada, SalidaEquipoRojo, SalidaLenteDinero, SalidaLenteTerreno, SupuestoIA } from "@/lib/estrategia/esquemas";

/** El 16-10-2026 a media mañana en Lima. */
export const HOY = new Date("2026-10-16T15:00:00Z");

// ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

export const uuid = (prefijo: string, n: number) => `${prefijo}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Una línea armada a mano; lo que no se dice queda null, como llega de la base. */
export const linea = (id: string, nombre: string, extra: Partial<LineaProducto> = {}): LineaProducto => ({
  id, company_id: "emp-frutas", codigo: null, nombre, tipo: "producto", cliente_objetivo: null, necesidad: null, promesa: null,
  precio: null, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null,
  decision: null, decision_motivo: null, modelo: "compra_y_revende", grupo: null, canal: null, precio_segundo: null, segundo_precio_es: null,
  de_cada_10_segundo: null, componentes_costo: [], unidades_mes: null, unidades_mes_desde: null, unidades_mes_hasta: null, participacion_de_10: null,
  estados: {}, datos_modelo: null, creada_por: null, ...extra,
});

const metrica = (clave: string, periodo: string, valor: number | null, estado: string, n: number): MetricaEntrada => ({ id: uuid("a0000000", n), clave, periodo, valor, estado, updated_at: "2026-10-01T12:00:00Z" });

const afirmacion = (id: string, texto: string, extra: Partial<AfirmacionEntrada> = {}): AfirmacionEntrada => ({
  id, texto, pilar: "procesos", tipo: "proceso", temporalidad: "actual", estado: "sin_verificar", comprobacion: null,
  fecha_afirmacion: "2026-09-10", created_at: "2026-09-10T10:00:00Z", contradice_a: null, explicacion_contradiccion: null,
  fuente: { tipo: "entrevista", origen: "cliente", revision: null, fidelidad_extraccion: null, fecha_origen: "2026-09-10" },
  persona: { rol: "dueno", puesto: "Gerente general" },
  ...extra,
});

const hallazgo = (id: string, titulo: string, extra: Partial<HallazgoEntrada> = {}): HallazgoEntrada => ({
  id, titulo, causa_raiz: `causa de ${titulo.toLowerCase()}`, impacto: "alto", pilar: "procesos", estado_revision: "aprobado", provisional: false, origen: "ia", created_at: "2026-09-20T10:00:00Z", claim_ids: [], ...extra,
});

const item = (id: string, texto: string, extra: Partial<Item> = {}): Item => ({ id, texto, tipo: "declaracion", origen: "sistema", fuentes: [], fecha: "2026-09-15", ...extra });

const respuesta = (clave: string, texto: string, valor: number, estado: "estimado" | "contado", unidad: RespuestaEntrada["unidad"], n: number): RespuestaEntrada => ({
  id: uuid("d0000000", n), clave, texto, unidad, respuesta: { valor, estado }, respuesta_texto: null, respondida_at: "2026-10-12T15:00:00Z",
});

// ─── Frutas del Valle SAC (ficticia) ─────────────────────────────────────────────────────────────

/** Los ids de las líneas: los primeros ocho caracteres distintos, para que los ids cortos se lean en las pruebas. */
export const L = {
  palta: uuid("1a1a0001", 1),
  mango: uuid("1a1a0002", 2),
  fresa: uuid("1a1a0003", 3),
  picada: uuid("1a1a0004", 4),
  uva: uuid("1a1a0005", 5),
};

/**
 * Lo que vende (compra y revende, por caja):
 *  palta  10 − 6 = 4 por caja × 5.000 cajas = 20.000 al mes (costo por partes: compra 5,5 + flete 0,5)
 *  mango   5 − 3 = 2 × 8.000 = 16.000
 *  fresa   8 − 7 = 1 × 2.000 = 2.000
 *  picada 12 − 13 = −1 × 500 = −500: resta
 *  uva    15, costo «no lo sé», 200 al mes: sin datos completos
 * Ventas de las cuatro con datos: 50.000 + 40.000 + 16.000 + 6.000 = 112.000; dejan 37.500 → lo que deja cada sol
 * vendido = 37.500 ÷ 112.000 ≈ 0,3348.
 */
export const LINEAS_FRUTAS: LineaProducto[] = [
  linea(L.palta, "Palta", { precio: 10, componentes_costo: [{ nombre: "compra", valor: 5.5, estado: "contado" }, { nombre: "flete", valor: 0.5, estado: "contado" }], unidades_mes: 5000, estados: { precio: "contado", unidades: "estimado" } }),
  linea(L.mango, "Mango", { precio: 5, costo_variable_unitario: 3, unidades_mes: 8000, estados: { precio: "contado", costo: "contado", unidades: "contado" } }),
  linea(L.fresa, "Fresa", { precio: 8, costo_variable_unitario: 7, unidades_mes: 2000, estados: { precio: "contado", costo: "contado", unidades: "contado" } }),
  linea(L.picada, "Fruta picada", { precio: 12, costo_variable_unitario: 13, unidades_mes: 500, estados: { precio: "contado", costo: "estimado", unidades: "contado" } }),
  linea(L.uva, "Uva importada", { precio: 15, componentes_costo: [{ nombre: "compra", estado: "no_lo_se" }], unidades_mes: 200, estados: { precio: "contado", unidades: "contado" } }),
];

/** Gastos del mes típico: 8.000 + 18.000 + (2.000 a 3.000) fijos y 2.000 de vender → entre 30.000 y 31.000. */
export const COSTOS_FRUTAS: CostoMes[] = [
  { id: uuid("2b2b0001", 1), periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del almacén", dato: { valor: 8000, estado: "contado" }, nota: null },
  { id: uuid("2b2b0002", 2), periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", dato: { valor: 18000, estado: "contado" }, nota: null },
  { id: uuid("2b2b0003", 3), periodo: "mes_tipico", tipo: "fijo", nombre: "Combustible del camión", dato: { desde: 2000, hasta: 3000, estado: "estimado" }, nota: null },
  { id: uuid("2b2b0004", 4), periodo: "mes_tipico", tipo: "comercializacion", nombre: "Comisiones", dato: { valor: 2000, estado: "contado" }, nota: null },
];

/**
 * Crédito: 6 de cada 10 ventas al crédito, a 20 días, 1 de cada 10 que deben no paga.
 *   al crédito = 120.000 × 6/10 = 72.000; pérdida al mes = 72.000 × 1/10 = 7.200.
 * Inventario: 15.000 en mercadería; parada entre 2.000 y 4.000.
 */
export const FICHA_NEGOCIO_FRUTAS: FichaNegocio = {
  ...FICHA_VACIA,
  modulos: { credito: true, inventario: true, moneda: false },
  credito: { de_cada_10: { valor: 6, estado: "contado" }, dias: { valor: 20, estado: "estimado" }, incobrables_de_cada_10: { valor: 1, estado: "estimado" } },
  inventario: { valor: { valor: 15000, estado: "contado" }, parado: { desde: 2000, hasta: 4000, estado: "estimado" } },
  historia: { mejor_epoca: { cuando: "antes de que abrieran dos distribuidoras cerca", venta_mes: { valor: 160000, estado: "estimado" }, que_pasaba: "Vendíamos a hoteles además de restaurantes" } },
};

export const METRICAS_FRUTAS: MetricaEntrada[] = [
  metrica("venta_mes", "2026-09", 120000, "contado", 1),
  metrica("venta_mes", "2026-08", 110000, "verificado", 2),
  metrica("venta_mes", "epoca_dorada", 160000, "contado", 3),
  metrica("ganancia_mes", "2026-09", 10000, "contado", 4),
  metrica("caja_hoy", "actual", 30000, "contado", 5),
  metrica("gasto_fijo_mes", "2026-09", 30000, "contado", 6),
  metrica("costo_variable_mes", "2026-09", 80000, "extraido", 7),
  metrica("conversion_de_cada_10", "actual", 4, "contado", 8),
  metrica("deuda_clientes", "actual", 45000, "verificado", 9),
  metrica("deuda_propia", "actual", 20000, "contado", 10),
  metrica("precio_producto_estrella", "actual", 10, "contado", 11),
  metrica("costo_producto_estrella", "actual", 6, "contado", 12),
  // Descartada al revisar: no entra aunque conserve el valor.
  metrica("gasto_fijo_mes", "2026-07", 1, "descartado", 13),
  // Sin estado: no se sabe de dónde salió.
  metrica("caja_hoy", "2026-06", 99, "", 14),
];

/** Ids de afirmaciones: dos comparten los primeros ocho caracteres a propósito (se alargan a doce). */
export const K = {
  registro: uuid("3c3c0001", 1),
  vio: uuid("3c3c0002", 2),
  documentoPendiente: uuid("3c3c0003", 3),
  cifraEntrevista: uuid("3c3c0004", 4),
  confirmada: uuid("3c3c0005", 5),
  equipo: uuid("3c3c0006", 6),
  deseo: uuid("3c3c0007", 7),
  contradicha: uuid("3c3c0008", 8),
  comprobada: uuid("3c3c0009", 9),
  refutada: uuid("3c3c000a", 10),
  precioDicho: uuid("3c3c000b", 11),
  audio: uuid("3c3c000c", 12),
  fotoBorrosa: uuid("3c3c000d", 13),
  documentoRevisado: uuid("3c3c000e", 14),
  chocaA: "3c3c00ff-aaaa-4000-8000-000000000015",
  chocaB: "3c3c00ff-bbbb-4000-8000-000000000016",
};

export const CLAIMS_FRUTAS: AfirmacionEntrada[] = [
  afirmacion(K.registro, "De los pedidos de julio, 4 de cada 10 tuvieron reclamo por fruta pasada", { pilar: "producto", tipo: "kpi", fuente: { tipo: "dato", origen: "consultor", fecha_origen: "2026-08-01" }, persona: null }),
  afirmacion(K.vio, "Las cajas de palta se apilan sin separar por madurez", { pilar: "procesos", fuente: { tipo: "observacion", origen: "consultor", fecha_origen: "2026-09-12" }, persona: null }),
  afirmacion(K.documentoPendiente, "El jefe de ventas aprueba descuentos y condiciones de pago", { pilar: "personas", tipo: "rol", fuente: { tipo: "documento", origen: "cliente", revision: "pendiente", fidelidad_extraccion: "alta", fecha_origen: "2025-03-01" }, persona: null }),
  afirmacion(K.cifraEntrevista, "Vendemos unas cinco mil cajas de palta al mes", { pilar: "producto", tipo: "kpi" }),
  afirmacion(K.confirmada, "Ventas funciona bien y el jefe de ventas lo tiene controlado", { estado: "confirmado", fecha_afirmacion: "2026-09-20" }),
  afirmacion(K.equipo, "Cuando la compradora no está, se compra por precio y la fruta llega pasada", { persona: { rol: "empleado", puesto: "Compradora" } }),
  afirmacion(K.deseo, "El dueño quiere ser el mejor distribuidor de la ciudad y trabajar menos horas", { temporalidad: "aspiracional", pilar: "transversal", estado: "confirmado" }),
  afirmacion(K.contradicha, "El cliente objetivo son cadenas con muchos locales", { estado: "contradicho", contradice_a: K.comprobada, pilar: "marketing" }),
  afirmacion(K.comprobada, "Casi toda la venta es a restaurantes de un solo local", { comprobacion: "comprobado_por_consultor", pilar: "marketing", tipo: "cliente" }),
  afirmacion(K.refutada, "Todos los clientes pagan a tiempo", { comprobacion: "refutado", explicacion_contradiccion: "lo que le deben dice otra cosa", pilar: "marketing" }),
  afirmacion(K.precioDicho, "La caja de mango se vende a cinco", { tipo: "precio", estado: "confirmado", pilar: "producto" }),
  afirmacion(K.audio, "Yo reviso cada pedido antes de que salga", { fuente: { tipo: "audio", origen: "cliente", fecha_origen: "2026-09-25" }, fecha_afirmacion: null }),
  afirmacion(K.fotoBorrosa, "La lista de precios del año pasado", { tipo: "precio", pilar: "producto", fuente: { tipo: "foto", origen: "cliente", revision: "consolidada", fidelidad_extraccion: "baja", fecha_origen: "2025-11-01" }, persona: null }),
  afirmacion(K.documentoRevisado, "El reparto sale a las seis de la mañana", { fuente: { tipo: "documento", origen: "cliente", revision: "consolidada", fidelidad_extraccion: "alta", fecha_origen: "2026-05-01" }, persona: null }),
  afirmacion(K.chocaA, "Los martes se reparte fruta blanda", { persona: { rol: "empleado", puesto: "Chofer" } }),
  afirmacion(K.chocaB, "Los restaurantes devuelven la fruta blanda en la puerta", { persona: { rol: "empleado", puesto: "Chofer" } }),
];

export const F = {
  revisado: uuid("4d4d0001", 1),
  pendiente: uuid("4d4d0002", 2),
  provisional: uuid("4d4d0003", 3),
  rechazado: uuid("4d4d0004", 4),
  anterior: uuid("4d4d0005", 5),
  pendienteProvisional: uuid("4d4d0006", 6),
};

export const FINDINGS_FRUTAS: HallazgoEntrada[] = [
  hallazgo(F.revisado, "El criterio de compra vive en una sola persona", { claim_ids: [K.equipo, K.registro, "no-esta-en-el-paquete"], pilar: "producto" }),
  hallazgo(F.pendiente, "Los descuentos esperan al dueño", { estado_revision: "pendiente", impacto: "medio", pilar: "personas", claim_ids: [K.documentoPendiente] }),
  hallazgo(F.provisional, "TITULO-provisional", { provisional: true }),
  hallazgo(F.rechazado, "TITULO-rechazado", { estado_revision: "rechazado" }),
  hallazgo(F.anterior, "Un solo canal trae a casi todos los clientes nuevos", { provisional: null, estado_revision: "corregido", pilar: "marketing", impacto: null }),
  hallazgo(F.pendienteProvisional, "TITULO-pendiente-provisional", { estado_revision: "pendiente", provisional: true }),
];

export function fichaDireccionFrutas(): Ficha {
  const f = fichaVacia();
  f.bloques.proposito = [item("proposito:p1", "Que los restaurantes reciban la fruta en su punto")];
  f.bloques.fortalezas = [item("fortalezas:f1", "La compradora sabe elegir la fruta por la textura", { tipo: "interpretacion", origen: "consultor", revisado_por: "consultora-1" })];
  f.bloques.empresa_deseada = [item("empresa_deseada:e1", "PROPUESTA-SIN-REVISAR", { tipo: "interpretacion", origen: "director" })];
  f.bloques.distancia = [item("distancia:d1", "Hoy vende 120.000 y quiere 200.000: le faltan 80.000", { calculo: true })];
  f.bloques.resultados_deseados = [
    item("resultados_deseados:r1", "Vender 200.000 al mes", { momento: "deseado" }),
    item("resultados_deseados:r2", "Ventas de hoy: 120.000", { momento: "hoy", fuentes: ["metrica:x"] }),
  ];
  f.bloques.decisiones_pendientes = [item("decisiones_pendientes:x1", "DESCARTADO", { descartado: true })];
  f.dependencia.dimensiones.comercial = { ...f.dependencia.dimensiones.comercial, que_se_detiene: "Sin el dueño no se aprueban descuentos", origen: "sistema" };
  f.dependencia.dimensiones.operativa = { ...f.dependencia.dimensiones.operativa, que_se_detiene: "DIMENSION-SIN-REVISAR", origen: "director" };
  f.dependencia.procesos = {
    total: 4, con_dueno: 3, decide_solo: 2, nombres_con_dueno: ["Compras", "Ventas y pedidos", "Cobranza"], nombres_decide_solo: ["Compras", "Cobranza"],
    texto: "participa en 3 de 4 procesos del mapa; en 2 de ellos es el único que decide",
  };
  return f;
}

export const PROCESOS_FRUTAS = [
  { id: uuid("5e5e0001", 1), nombre: "Compras", area: "Operaciones", confirmacion: "confirmado" },
  { id: uuid("5e5e0002", 2), nombre: "Ventas y pedidos", area: "Comercial", confirmacion: "por_confirmar" },
  { id: uuid("5e5e0003", 3), nombre: "Reparto", area: "Operaciones", confirmacion: "confirmado" },
  { id: uuid("5e5e0004", 4), nombre: "Cobranza", area: "Administración", confirmacion: "borrador" },
];

export const PARTICIPANTES_FRUTAS = [
  { id: uuid("6f6f0001", 1), nombre: "Julio", puesto: "Gerente general", rol: "dueno" },
  { id: uuid("6f6f0002", 2), nombre: "Marta", puesto: "Socia / Finanzas", rol: "socio" },
  { id: uuid("6f6f0003", 3), nombre: "Diego", puesto: "Jefe de ventas", rol: "lider" },
  { id: uuid("6f6f0004", 4), nombre: "Rosa", puesto: "Compradora", rol: "empleado" },
  { id: uuid("6f6f0005", 5), nombre: "Restaurante cliente", puesto: null, rol: "cliente" },
];

/** Lo que el dueño respondió a las preguntas de la estrategia. */
export const RESPUESTAS_FRUTAS: RespuestaEntrada[] = [
  respuesta("interesados_mes", "El mes pasado, ¿cuántas personas te preguntaron precio o te pidieron información?", 500, "contado", "unidades_mes", 1),
  respuesta("ticket_promedio", "La última vez que un cliente te compró, ¿cuánto gastó en esa compra?", 400, "estimado", "soles", 2),
  respuesta("clientes_activos_mes", "El mes pasado, ¿a cuántos clientes distintos les vendiste?", 150, "contado", "personas", 3),
  respuesta("clientes_que_vuelven_de_cada_10", "De cada 10 clientes que te compran, ¿cuántos vuelven a comprarte?", 7, "estimado", "de_cada_10", 4),
  respuesta("dias_pago_proveedor", "La última vez que le compraste a tu proveedor principal, ¿cuántos días después le pagaste?", 15, "contado", "dias", 5),
  respuesta("horas_dueno_operacion_semana", "La semana pasada, ¿cuántas horas se te fueron en tareas que otra persona del negocio podría hacer?", 20, "estimado", "horas_semana", 6),
  respuesta("merma_mes", "El mes pasado, ¿cuánto se perdió en mercadería dañada o vencida?", 3000, "estimado", "soles", 7),
];

export function entradasFrutas(cambios: Partial<EntradasPaquete> = {}): EntradasPaquete {
  return {
    empresa: { sector: "Distribución de alimentos", ficha: { personas: "14" }, modelo_negocio: ["compra_y_revende"], tipo_trabajo: "estructurar_y_sistematizar", pais: "PE", moneda: "PEN", zona_horaria: "America/Lima" },
    metricas: METRICAS_FRUTAS.map((m) => ({ ...m })),
    lineas: LINEAS_FRUTAS.map((l) => ({ ...l })),
    costos: COSTOS_FRUTAS.map((c) => ({ ...c })),
    ficha_negocio: structuredClone(FICHA_NEGOCIO_FRUTAS),
    operaciones: [],
    claims: CLAIMS_FRUTAS.map((c) => ({ ...c })),
    findings: FINDINGS_FRUTAS.map((f) => ({ ...f })),
    ficha_direccion: fichaDireccionFrutas(),
    procesos: PROCESOS_FRUTAS.map((p) => ({ ...p })),
    participantes: PARTICIPANTES_FRUTAS.map((p) => ({ ...p })),
    respuestas: RESPUESTAS_FRUTAS.map((r) => ({ ...r })),
    referencia: [{ clave: "rubro.merma", texto: "En la distribución de perecibles, la merma suele ser una de las fugas más grandes" }],
    totales: { claims: 640 },
    lecturas_fallidas: [],
    ...cambios,
  };
}

// ─── Consultorio Dental Sonrisa Norte (ficticio): casi sin datos ─────────────────────────────────

export function entradasDental(cambios: Partial<EntradasPaquete> = {}): EntradasPaquete {
  return {
    empresa: { sector: "Salud dental", ficha: { personas: "tres" }, modelo_negocio: ["vende_horas_o_casos"], tipo_trabajo: null, pais: "PE", moneda: "PEN", zona_horaria: "America/Lima" },
    metricas: [
      { id: uuid("7a7a0001", 1), clave: "ventas_mes", periodo: "2026-09", valor: 18000, estado: "contado", updated_at: "2026-10-02T10:00:00Z" },
      { id: uuid("7a7a0002", 2), clave: "gasto_fijo_mes", periodo: "2026-09", valor: null, estado: "sin_dato", updated_at: "2026-10-02T10:00:00Z" },
    ],
    lineas: [linea(uuid("7b7b0001", 1), "Limpieza dental", { tipo: "servicio", modelo: "vende_horas_o_casos", precio: 120, estados: { precio: "contado" } })],
    costos: [{ id: uuid("7c7c0001", 1), periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del local", dato: { estado: "no_lo_se" }, nota: null }],
    ficha_negocio: { ...FICHA_VACIA },
    operaciones: [],
    claims: [
      afirmacion(uuid("7d7d0001", 1), "Los pacientes llegan por recomendación", { pilar: "marketing", persona: { rol: "dueno", puesto: "Odontóloga" } }),
      afirmacion(uuid("7d7d0002", 2), "Muchos pacientes no vuelven a su control", { pilar: "marketing", persona: { rol: "empleado", puesto: "Asistente" } }),
      afirmacion(uuid("7d7d0003", 3), "La agenda se lleva en un cuaderno", { pilar: "procesos", persona: { rol: "empleado", puesto: "Asistente" } }),
    ],
    findings: [],
    ficha_direccion: null,
    procesos: [],
    participantes: [{ id: uuid("7e7e0001", 1), nombre: "Lucía", puesto: "Odontóloga", rol: "dueno" }],
    respuestas: [],
    referencia: [],
    lecturas_fallidas: [{ tabla: "ficha_negocio", motivo: "esta parte no está habilitada en esta base" }],
    ...cambios,
  };
}

// ─── Salidas falsas del modelo para «Frutas del Valle» (§9.1) ────────────────────────────────────
//
// Los ids que citan salen del paquete y de los cálculos de la empresa ficticia: las líneas (L:1a1a0001 «Palta»,
// L:1a1a0002 «Mango», L:1a1a0004 «Fruta picada»), los procesos (P:5e5e0001 Compras, P:5e5e0002 Ventas y pedidos,
// P:5e5e0003 Reparto, P:5e5e0004 Cobranza), las afirmaciones (K:…), los hallazgos (F:…), las fugas (C:fuga.…) y las
// respuestas del dueño (Q:…). Las cuentas de lo que deja cada camino están en tests/estrategia-calidad.test.ts.

/** Una copia profunda, para armar las variantes malas sin tocar las buenas. */
const copia = <T>(x: T): T => structuredClone(x);

const SUPUESTOS_DINERO: SupuestoIA[] = [
  { id: "SA1", clave: "precio.pct", que_se_supone: "Cuánto sube el precio de «Fruta picada» en los pedidos nuevos", unidad: "pct", rango: { bajo: 10, alto: 15 }, ancla: "L:1a1a0004.precio", por_que: "Lo justo para que deje de restar en cada venta sin salirse de lo que paga un restaurante" },
  { id: "SA2", clave: "cierre_fuga.de_cada_10", que_se_supone: "Cuánto del crédito que no se cobra se recupera con la regla", unidad: "de_cada_10", rango: { bajo: 4, alto: 6 }, ancla: "C:fuga.credito_incobrable", por_que: "Las reglas cortan el crédito a quien se pasa de su plazo, que es de donde sale casi todo lo que no vuelve" },
  { id: "SA3", clave: "dias_cobro.menos_dias", que_se_supone: "Cuántos días antes se cobra con la factura que vence a la semana", unidad: "dias", rango: { bajo: 4, alto: 8 }, ancla: "C:poder.dias_cobro_hoy", por_que: "Cobrar a la semana en vez de cuando el cliente quiere" },
  { id: "SA4", clave: "precio.pct", que_se_supone: "Cuánto sube el precio de «Palta» en los pedidos nuevos", unidad: "pct", rango: { bajo: 5, alto: 8 }, ancla: "L:1a1a0001.precio", por_que: "Una subida que el restaurante acepta si la fruta le llega en su punto" },
];

const JUGADAS_DINERO: Jugada[] = [
  {
    que_se_mueve: "«Fruta picada» deja de venderse por debajo de su costo: sube su precio en los pedidos nuevos",
    por_que: "Hoy cada venta de «Fruta picada» resta: se pierden {{C:fuga.productos_que_restan}} al mes",
    refs: ["C:producto.1a1a0004.deja_mes", "C:fuga.productos_que_restan", "L:1a1a0004"],
    respuesta_del_mercado: "La mayoría paga: es un producto de conveniencia. Quien la compra solo por precio se va, y su pérdida se va con él",
    si_responde_distinto: "Si caen los pedidos de fruta picada, se ofrece junto con la palta, sin volver al precio de antes",
    que_abre: "Deja de esconder pérdidas detrás de las ventas y prepara la lista de precios de la jugada 4",
    efecto: { tipo: "precio_linea", linea: "L:1a1a0004", pct: "SA1" },
    desde_dia: 7, responsable: "Diego", pilar: "orden", eslabon: "vender", reduce_dependencia_del_dueno: false,
  },
  {
    que_se_mueve: "Crédito con reglas escritas: cada cliente tiene un tope y un plazo, y al que se pasa del plazo se le suspende el crédito hasta ponerse al día",
    por_que: "El crédito que no vuelve es la fuga más grande de la caja: {{C:fuga.credito_incobrable}} al mes",
    refs: ["C:fuga.credito_incobrable", "P:5e5e0004", "B:credito.incobrables_de_cada_10"],
    respuesta_del_mercado: "Los clientes puntuales siguen igual; los atrasados se ponen al día para no perder el crédito",
    si_responde_distinto: "Si un cliente grande no acepta su tope, se le atiende al contado mientras tanto",
    que_abre: "Hace posible cobrar antes sin perder a los buenos clientes",
    efecto: { tipo: "cierre_fuga", fuga: "C:fuga.credito_incobrable", de_cada_10: "SA2" },
    desde_dia: 14, responsable: "Marta", pilar: "orden", eslabon: "cobrar", reduce_dependencia_del_dueno: true,
  },
  {
    que_se_mueve: "Cobrar antes: la factura vence a la semana, y quien paga al recibir lleva su pedido primero en el reparto",
    por_que: "Cada día menos de cobro libera {{C:poder.dias_cobro}} de una vez, y hoy le deben {{C:parado.deuda_clientes}}",
    refs: ["C:poder.dias_cobro", "C:parado.deuda_clientes", "P:5e5e0004"],
    respuesta_del_mercado: "Los restaurantes ordenados aceptan a cambio de llegar primero; los demás piden plazo y se les da solo si están al día",
    si_responde_distinto: "Si no aceptan la semana, se cobra contra entrega solo a los atrasados",
    que_abre: "Con la caja liberada, comprar al contado y negociar mejor la fruta",
    efecto: { tipo: "dias_cobro", menos_dias: "SA3" },
    desde_dia: 14, responsable: "Marta", pilar: "orden", eslabon: "cobrar", reduce_dependencia_del_dueno: false,
  },
  {
    que_se_mueve: "Subir el precio de «Palta» en los pedidos nuevos desde el día 30, con la fruta elegida por madurez como razón",
    por_que: "Es la línea que más deja y la que más se vende: un poco más de precio pesa más que cualquier otra palanca",
    refs: ["C:palanca.1a1a0001.precio5", "L:1a1a0001", "C:poder.precio"],
    respuesta_del_mercado: "Algún cliente compara con la distribuidora vecina; el que recibe fruta en su punto se queda",
    si_responde_distinto: "Si se va un cliente puntual, se le ofrece la palta elegida para el día en que la usa",
    que_abre: "Prepara la preventa de diciembre al precio nuevo",
    efecto: { tipo: "precio_linea", linea: "L:1a1a0001", pct: "SA4" },
    desde_dia: 30, responsable: "Diego", pilar: "crecimiento", eslabon: "vender", reduce_dependencia_del_dueno: false,
  },
];

export const LENTE_DINERO_BUENA: SalidaLenteDinero = {
  lectura:
    "Vende {{N:venta_mes}} al mes y, con las cuentas, le quedan {{C:mult.utilidad_hoy}}. Buena parte de lo vendido tarda en volver: le deben {{C:parado.deuda_clientes}}, y {{C:fuga.credito_incobrable}} al mes se venden al crédito y nunca se cobran. Cada día menos de cobro libera {{C:poder.dias_cobro}} de una vez. Antes de vender más, hay que ordenar el crédito y cobrar lo justo por lo que más deja.",
  modelo_de_dinero: {
    como_entra_hoy: "Entra por restaurantes de un solo local que piden por mensaje y pagan al crédito: {{B:credito.de_cada_10}} se venden fiadas. «Palta» sostiene el negocio y «Fruta picada» resta en cada venta.",
    que_falta: ["Una regla de crédito que diga a quién, hasta cuánto y por cuántos días", "Un precio que pague la fruta que se pierde en el camino"],
  },
  caja: "Hoy cobra a {{C:poder.dias_cobro_hoy}} y paga a su proveedor a {{C:poder.dias_pago_hoy}}: si cobra más tarde, le paga al proveedor con dinero que todavía no entró. La caja de hoy, {{N:caja_hoy}}, aguanta {{C:dias_aguante}} sin vender.",
  foda: {
    f: [
      { texto: "«Palta» es la línea que más deja: {{C:producto.1a1a0001.deja_mes}} al mes", refs: ["C:producto.1a1a0001.deja_mes", "C:producto.1a1a0001.cuadrante"] },
      { texto: "Los clientes vuelven: {{Q:clientes_que_vuelven_de_cada_10}} compran otra vez", refs: ["Q:clientes_que_vuelven_de_cada_10"] },
    ],
    d: [
      { texto: "Fía sin regla: se pierden {{C:fuga.credito_incobrable}} al mes en crédito que no se cobra", refs: ["C:fuga.credito_incobrable", "B:credito.de_cada_10"] },
      { texto: "«Fruta picada» cuesta más de lo que se cobra por ella", refs: ["C:producto.1a1a0004.deja_mes"] },
    ],
    o: [{ texto: "Diciembre trae el otro pico grande del año en los restaurantes", refs: ["T:2026-12"] }],
    a: [{ texto: "Enero baja el consumo después de las fiestas", refs: ["T:2027-01"] }],
  },
  tows: [
    {
      cuadrante: "FO", cruza: ["F1", "O1"],
      estrategia: "Llegar a diciembre con «Palta» a su precio justo: subirla para los pedidos nuevos antes del pico, cuando el restaurante necesita asegurar su fruta.",
      efecto: { tipo: "precio_linea", linea: "L:1a1a0001", pct: "SA4" }, pregunta_si_no_hay_cuenta: null,
      recursos: "La lista de precios nueva y una conversación de Diego con cada cliente", cambio_de_estructura: "El precio lo fija la empresa con una lista; no se negocia pedido por pedido",
      plazo_dias: 30, indicador: "Pedidos de palta al precio nuevo",
    },
    {
      cuadrante: "DA", cruza: ["D1", "A1"],
      estrategia: "Ordenar el crédito antes de que enero enfríe las compras: lo que se atrasa en las fiestas cuesta mucho más cobrarlo después.",
      efecto: { tipo: "cierre_fuga", fuga: "C:fuga.credito_incobrable", de_cada_10: "SA2" }, pregunta_si_no_hay_cuenta: null,
      recursos: "La hoja de crédito de cada cliente y las visitas de cobranza", cambio_de_estructura: "Cada cliente con su tope y su plazo de crédito por escrito",
      plazo_dias: 30, indicador: "Deuda atrasada al cierre de cada semana",
    },
  ],
  oferta: {
    para_quien: "Restaurantes de un solo local que necesitan la fruta lista para usar el día que la piden",
    resultado_sonado: { texto: "Fruta en su punto el día que la cocina la necesita, sin devolverla en la puerta", refs: ["K:3c3c00ffbbbb"] },
    probabilidad_percibida: { texto: "La caja que llega pasada se repone en el siguiente reparto sin cobrarla", refs: ["K:3c3c0001"] },
    tiempo: { texto: "El pedido de la noche llega temprano a la mañana siguiente", refs: ["K:3c3c000e"] },
    esfuerzo: { texto: "Un solo mensaje con el pedido de la semana; la compradora elige cada caja por madurez", refs: ["D:fortalezas:f1"] },
    nombre: "Fruta en su punto",
    promesa: "Cada caja llega lista para usarse el día que el restaurante la pide",
    garantia: "Si una caja llega pasada, se repone en el siguiente reparto y no se cobra",
    bonos: ["Aviso cada lunes de qué fruta está en su mejor momento"],
    urgencia_real: "En diciembre el camión no alcanza para todos: el día de entrega se reserva con anticipación",
    precio: "L:1a1a0001.precio",
    oferta_escrita:
      "Fruta en su punto. Tu pedido de la semana, elegido caja por caja según su madurez y entregado temprano. Si una caja llega pasada, te la reponemos en el siguiente reparto y no te la cobramos. Cada lunes te avisamos qué fruta está en su mejor momento. Para diciembre, reserva desde ya tu día de entrega: el camión no alcanza para todos.",
  },
  supuestos: SUPUESTOS_DINERO,
  faltan: [
    { clave: "clientes_dormidos", por_que_importa: "Son clientes que ya confiaron: recuperarlos cuesta menos que buscar nuevos", pregunta_si_otra: null, unidad_si_otra: null },
    { clave: "inversion_disponible_mes", por_que_importa: "Para saber si alguna jugada pide más dinero del que hay", pregunta_si_otra: null, unidad_si_otra: null },
  ],
  camino: {
    nombre: "Cobrar antes de crecer",
    filosofia: "Antes de buscar ventas nuevas, recuperar lo que ya se vendió y poner reglas al crédito; después, subir el precio de lo que más deja.",
    jugadas: JUGADAS_DINERO,
    que_pide: {
      dinero: "Ninguna inversión: el tope de crédito y la lista de precios se escriben en una hoja",
      horas_del_dueno: "Las visitas a los clientes con más deuda atrasada, junto a Marta, en las primeras semanas",
      personas: "Marta lleva la cobranza; Diego anuncia los precios",
      herramientas: "Una hoja con el tope, el plazo y la deuda de cada cliente",
    },
    casos: [
      { caso: "Un restaurante grande con deuda atrasada se molesta cuando se le suspende el crédito", por_que_puede_pasar: "Lleva años comprando con plazo abierto", refs: ["C:parado.deuda_clientes"], solucion: "Diego le propone un calendario de pagos por semana y le mantiene el reparto mientras cumpla sus cuotas", senal: "Cuotas pagadas en su fecha" },
      { caso: "Bajan los pedidos de los clientes atrasados en las primeras semanas", por_que_puede_pasar: "Algunos pedían de más porque pagaban cuando querían", refs: ["B:credito.de_cada_10"], solucion: "Esa fruta se ofrece a los clientes puntuales, con entrega el mismo día", senal: "Pedidos de los clientes puntuales en las semanas siguientes" },
    ],
    anticipar: [{ evento: "Diciembre trae el pico de pedidos de los restaurantes", cuando: "2026-12", refs: ["T:2026-12"], que_hacemos_antes: "En noviembre se arma el calendario de reparto de diciembre, con los clientes puntuales primero" }],
    senales_tempranas: [
      { senal: "Clientes atrasados con su calendario de pagos acordado", indicador: "Calendarios acordados", mirar_el_dia: 7 },
      { senal: "Pedidos al crédito de clientes que ya pasaron su plazo", indicador: "Pedidos al crédito fuera de regla", mirar_el_dia: 14 },
    ],
    punto_de_decision: {
      dia: 30,
      que_mirar: "Lo cobrado de la deuda atrasada y los pedidos al crédito fuera de regla",
      si_va_bien: "Se sube el precio de «Palta» como estaba previsto",
      si_no: "Si la deuda atrasada no baja, se cobra contra entrega a los clientes que no cumplen su calendario",
    },
  },
};

const JUGADAS_TERRENO: Jugada[] = [
  {
    que_se_mueve: "Escribir con Rosa el criterio de compra por madurez y enseñárselo a un segundo comprador",
    por_que: "Hoy, cuando Rosa no está, se compra por precio y la fruta llega pasada",
    refs: ["F:4d4d0001", "P:5e5e0001", "D:fortalezas:f1"],
    respuesta_del_mercado: "Adentro, la compra deja de depender de una persona; el cliente todavía no ve el cambio",
    si_responde_distinto: "Si el segundo comprador no aprende a tiempo, Rosa sigue comprando y él separa al recibir",
    que_abre: "Permite bajar la merma con la jugada 2",
    efecto: { tipo: "habilitador", abre: "J2" },
    desde_dia: 1, responsable: "Rosa", pilar: "orden", eslabon: "abastecer", reduce_dependencia_del_dueno: true,
  },
  {
    que_se_mueve: "Separar las cajas por madurez al recibirlas: lo que madura primero sale primero en el reparto",
    por_que: "Se pierden {{C:fuga.merma}} al mes en fruta dañada o vencida",
    refs: ["C:fuga.merma", "K:3c3c0002", "P:5e5e0003"],
    respuesta_del_mercado: "El restaurante recibe fruta para usar ese día y devuelve menos en la puerta",
    si_responde_distinto: "Si las devoluciones no bajan, se revisa qué fruta llega pasada desde el mercado",
    que_abre: "Con menos devoluciones, el cliente vuelve más",
    efecto: { tipo: "cierre_fuga", fuga: "C:fuga.merma", de_cada_10: "SB1" },
    desde_dia: 7, responsable: "Rosa", pilar: "excelencia", eslabon: "entregar", reduce_dependencia_del_dueno: false,
  },
  {
    que_se_mueve: "Llamar cada viernes a los clientes que devolvieron fruta y reponerles en el siguiente reparto",
    por_que: "El que recibe fruta pasada se va con la vecina; el que ve que se le repone, vuelve",
    refs: ["K:3c3c0006", "Q:clientes_que_vuelven_de_cada_10", "P:5e5e0002"],
    respuesta_del_mercado: "Los clientes ven que alguien responde por la fruta y dejan de comparar solo por precio",
    si_responde_distinto: "Si el cliente no contesta, Diego le deja la reposición con el siguiente pedido",
    que_abre: "Prepara la venta a hoteles con clientes contentos como referencia",
    efecto: { tipo: "recompra", clientes: "Q:clientes_activos_mes", de_cada_10: "SB2", veces_mes: null },
    desde_dia: 30, responsable: "Diego", pilar: "servicio", eslabon: "retener", reduce_dependencia_del_dueno: false,
  },
  {
    que_se_mueve: "Volver a vender «Mango» a hoteles con la fruta en su punto como argumento",
    por_que: "Ya vendió a hoteles en su mejor época, y «Mango» es la línea que más se vende",
    refs: ["B:historia.que_pasaba", "L:1a1a0002", "C:palanca.1a1a0002.volumen10"],
    respuesta_del_mercado: "Los hoteles piden muestras y prueban unas semanas antes de comprar fijo",
    si_responde_distinto: "Si los hoteles no pasan de la muestra, el mango se ofrece a los restaurantes que ya compran",
    que_abre: "Abre un segundo tipo de cliente que compra todo el año",
    efecto: { tipo: "volumen_linea", linea: "L:1a1a0002", pct: "SB3" },
    desde_dia: 45, responsable: "Diego", pilar: "crecimiento", eslabon: "atraer", reduce_dependencia_del_dueno: false,
  },
];

export const LENTE_TERRENO_BUENA: SalidaLenteTerreno = {
  lectura:
    "La empresa no tiene un problema de demanda: tiene un problema de punto. Cuando la compradora no está, se compra por precio y la fruta llega pasada; el restaurante la devuelve en la puerta y se pierden {{C:fuga.merma}} al mes. El criterio de compra vive en una sola persona, y el dueño decide solo en las compras.",
  restriccion: {
    cual: "El criterio de compra vive en una sola persona: cuando ella no está, la fruta llega pasada",
    refs: ["F:4d4d0001", "K:3c3c0006", "C:fuga.merma"],
    por_que_manda: "Todo lo demás depende de que la fruta llegue en su punto: la merma, las devoluciones y que el cliente vuelva",
  },
  personas: "Rosa sabe elegir la fruta por su textura; Diego vende; Marta lleva las finanzas. Nadie más sabe comprar.",
  procesos: "Las compras están confirmadas, pero el criterio no está escrito. Las cajas se apilan sin separar por madurez.",
  producto: "«Palta» y «Mango» dejan casi todo; «Fresa» deja poco y «Fruta picada» resta.",
  dependencia_del_dueno: "El dueño {{C:dependencia.procesos}}. Sin él no se aprueban descuentos.",
  tiempo_del_dueno: "Se le van {{Q:horas_dueno_operacion_semana}} en tareas que otra persona del negocio podría hacer.",
  arbol: {
    problemas: [
      {
        efecto: "La fruta llega pasada y el restaurante la devuelve en la puerta",
        refs: ["K:3c3c00ffbbbb", "C:fuga.merma"],
        causas: [{ causa: "Se compra por precio cuando la compradora no está", refs: ["K:3c3c0006"] }, { causa: "Las cajas se apilan sin separar por madurez", refs: ["K:3c3c0002"] }],
      },
    ],
    soluciones: [
      { causa: "Se compra por precio", medio: "El criterio de compra por madurez, escrito con Rosa", aterriza_en: "proceso", que: "Compras" },
      { causa: "Cajas sin separar", medio: "Separar al recibir: lo que madura primero sale primero", aterriza_en: "politica", que: "Recepción de la fruta" },
    ],
  },
  terreno: {
    eliminar: ["Comprar por precio sin mirar la fruta"],
    reducir: ["Las devoluciones en la puerta"],
    incrementar: ["El punto de la fruta como firma de la casa"],
    crear: ["Fruta elegida para el día en que se usa"],
    donde_ganar_sin_pelear: "Las distribuidoras vecinas compiten por precio; esta empresa puede ganar por punto: fruta lista para el día en que la cocina la usa.",
  },
  canvas: {
    segmentos: { texto: "Restaurantes de un solo local que compran fruta cada semana", refs: ["K:3c3c0009"], estado: "comprobado" },
    propuesta: { texto: "Fruta en su punto para el día en que la cocina la usa", refs: ["D:proposito:p1"], estado: "por_validar" },
    canales: { texto: "Pedidos por mensaje y reparto propio en la mañana", refs: ["K:3c3c000e"], estado: "comprobado" },
    relacion: { texto: "El vendedor conoce a cada cliente y negocia pedido por pedido", refs: ["K:3c3c0003"], estado: "por_validar" },
    ingresos: { texto: "Venta por caja, casi toda fiada", refs: ["B:credito.de_cada_10"], estado: "comprobado" },
    recursos: { texto: "La compradora, el camión y el almacén", refs: ["D:fortalezas:f1"], estado: "comprobado" },
    actividades: { texto: "Comprar, separar, repartir y cobrar", refs: ["P:5e5e0001"], estado: "por_validar" },
    socios: { texto: "Los proveedores de fruta del mercado mayorista", refs: [], estado: "por_validar" },
    costos: { texto: "Sueldos, alquiler del almacén y combustible del camión", refs: ["G:2b2b0002"], estado: "comprobado" },
  },
  foda: {
    f: [{ texto: "La compradora elige la fruta por su textura", refs: ["D:fortalezas:f1"] }],
    d: [
      { texto: "El criterio de compra vive en una sola persona", refs: ["F:4d4d0001", "K:3c3c0006"] },
      { texto: "Se pierden {{C:fuga.merma}} al mes en fruta dañada o vencida", refs: ["C:fuga.merma"] },
    ],
    o: [
      { texto: "Diciembre: el otro pico grande del año", refs: ["T:2026-12"] },
      { texto: "Ya vendió a hoteles en su mejor época", refs: ["B:historia.que_pasaba"], sin_fuente_externa: true },
    ],
    a: [{ texto: "Distribuidoras vecinas que compiten por precio", refs: ["B:historia.mejor_epoca"], sin_fuente_externa: true }],
  },
  tows: [
    {
      cuadrante: "FA", cruza: ["F1", "A1"],
      estrategia: "Hacer del punto de la fruta la firma de la casa antes de que la pelea sea por precio: el que elige mejor no necesita ser el más barato.",
      efecto: null, pregunta_si_no_hay_cuenta: "El mes pasado, ¿cuántas cajas te devolvieron en la puerta?",
      recursos: "El tiempo de Rosa para enseñar el criterio", cambio_de_estructura: "El criterio de compra pasa a ser de la empresa, no de una persona",
      plazo_dias: 90, indicador: "Cajas devueltas en la puerta",
    },
    {
      cuadrante: "DO", cruza: ["D2", "O1"],
      estrategia: "Llegar a diciembre con la merma bajo control: con el pico de pedidos crece la fruta que se pierde si no se separa por madurez.",
      efecto: { tipo: "cierre_fuga", fuga: "C:fuga.merma", de_cada_10: "SB1" }, pregunta_si_no_hay_cuenta: null,
      recursos: "Separar las cajas al recibir y anotar cada día lo que se bota", cambio_de_estructura: "Lo que madura primero sale primero",
      plazo_dias: 30, indicador: "Merma de la semana",
    },
  ],
  supuestos: [
    { id: "SB1", clave: "cierre_fuga.de_cada_10", que_se_supone: "Cuánto de la merma se evita separando por madurez y comprando con criterio", unidad: "de_cada_10", rango: { bajo: 4, alto: 6 }, ancla: "C:fuga.merma", por_que: "La mayor parte de la merma viene de fruta comprada pasada o apilada sin orden" },
    { id: "SB2", clave: "recompra.de_cada_10_nuevo", que_se_supone: "Cuántos de cada 10 clientes volverían con la fruta en su punto", unidad: "de_cada_10", rango: { bajo: 8, alto: 9 }, ancla: "Q:clientes_que_vuelven_de_cada_10", por_que: "El cliente que deja de recibir fruta pasada deja de buscar otra distribuidora" },
    { id: "SB3", clave: "volumen.pct", que_se_supone: "Cuánto más «Mango» se vende ofreciéndolo a hoteles", unidad: "pct", rango: { bajo: 10, alto: 20 }, ancla: "L:1a1a0002.unidades", por_que: "Ya vendió a hoteles en su mejor época" },
  ],
  faltan: [
    { clave: "capacidad_extra_mes", por_que_importa: "Para saber si vender más choca con lo que el camión y el almacén pueden atender", pregunta_si_otra: null, unidad_si_otra: null },
    { clave: "otra", por_que_importa: "Para medir cuánto se pierde en la puerta", pregunta_si_otra: "El mes pasado, ¿cuántas cajas te devolvieron en la puerta?", unidad_si_otra: "unidades_mes" },
  ],
  camino: {
    nombre: "Ganar por el punto de la fruta",
    filosofia: "Competir por la fruta que llega lista para usarse, no por el precio más bajo. Primero la compra deja de vivir en una sola persona; después el cliente vuelve solo.",
    jugadas: JUGADAS_TERRENO,
    que_pide: {
      dinero: "Nada más que tiempo: el de Rosa para enseñar y el de Diego para llamar",
      horas_del_dueno: "Ninguna: el criterio lo escribe Rosa y el dueño lo revisa una vez",
      personas: "Un segundo comprador que aprenda de Rosa",
      herramientas: "Una hoja con el criterio de madurez de cada fruta",
    },
    casos: [
      { caso: "El segundo comprador tarda en aprender", por_que_puede_pasar: "Elegir por textura se aprende con la mano, no leyendo", refs: ["D:fortalezas:f1"], solucion: "Compran juntos durante el primer mes; Rosa revisa cada compra hasta que coincidan", senal: "Las compras del segundo comprador que Rosa aprueba sin cambios" },
      { caso: "Separar por madurez retrasa el reparto de la mañana", por_que_puede_pasar: "Hoy las cajas se cargan como llegan", refs: ["K:3c3c000e"], solucion: "Se separa al recibir en la tarde, no al cargar en la mañana", senal: "La hora de salida del reparto" },
    ],
    anticipar: [{ evento: "Diciembre trae más pedidos y más fruta que madura a la vez", cuando: "2026-12", refs: ["T:2026-12"], que_hacemos_antes: "En noviembre el criterio de compra ya está escrito y el segundo comprador compra solo" }],
    senales_tempranas: [{ senal: "Cajas devueltas en la puerta cada semana", indicador: "Cajas devueltas", mirar_el_dia: 14 }],
    punto_de_decision: {
      dia: 30,
      que_mirar: "Las cajas devueltas y la merma de la semana",
      si_va_bien: "Se empieza a llamar a los hoteles",
      si_no: "Si la merma no baja, Rosa vuelve a comprar sola mientras se corrige el criterio, y se revisa la recepción",
    },
  },
};

/** La jugada que el equipo rojo agrega al camino del dinero: quitarle al dueño los descuentos. */
const JUGADA_DESCUENTOS: Jugada = {
  que_se_mueve: "Diego aprueba los descuentos dentro de una regla escrita, sin esperar al dueño",
  por_que: "Sin el dueño no se aprueban descuentos y los pedidos esperan",
  refs: ["D:dependencia.comercial.que_se_detiene", "F:4d4d0002", "P:5e5e0002"],
  respuesta_del_mercado: "El cliente recibe respuesta el mismo día y deja de pedir rebajas fuera de la regla",
  si_responde_distinto: "Si alguien pide más de lo que dice la regla, Diego lo consulta con el dueño una vez por semana",
  que_abre: "Permite que la regla de crédito se cumpla sin que el dueño esté en cada pedido",
  efecto: { tipo: "habilitador", abre: "J2" },
  desde_dia: 7, responsable: "Diego", pilar: "orden", eslabon: "gobernar", reduce_dependencia_del_dueno: true,
};

export const ROJO_BUENO: SalidaEquipoRojo = {
  objeciones: [
    { a: "a", objecion: "Subir el precio de «Palta» mientras se ordena el crédito puede espantar a los clientes puntuales", gravedad: "ajuste", arreglo: "El precio nuevo rige desde el día 30 y solo en pedidos nuevos, cuando el crédito ya tiene sus reglas" },
    { a: "b", objecion: "Vender «Mango» a hoteles en las primeras semanas agranda la merma antes de controlarla, y hoy lo que frena no es la demanda", gravedad: "cambia_el_camino", arreglo: "Se quita la jugada de los hoteles: vuelve cuando la merma esté bajo control" },
    { a: "general", objecion: "Los descuentos esperan al dueño y frenan los pedidos", gravedad: "ajuste", arreglo: "Diego aprueba los descuentos dentro de una regla escrita" },
  ],
  lectura: [
    "Vende {{N:venta_mes}} al mes y, con las cuentas, le quedan {{C:mult.utilidad_hoy}}.",
    "Lo frena un crédito sin reglas y la fruta que llega pasada cuando falta la compradora.",
    "Seguir igual deja irse {{C:no_actuar.mes}} de la caja cada mes.",
    "La apuesta: poner reglas al crédito, cobrar a tiempo y cobrar más por lo que mejor se vende.",
    "Lo sabremos el día 30, con la deuda atrasada bajando y ningún pedido al crédito fuera de regla.",
  ],
  gran_apuesta: {
    frase: "Que el crédito deje de frenar la caja: cobrar a tiempo lo ya vendido y cobrar más por lo que mejor se vende",
    por_que: "Le deben {{C:parado.deuda_clientes}} y cada mes se van {{C:fuga.credito_incobrable}} en crédito que no vuelve. Cobrar un día antes libera {{C:poder.dias_cobro}}, y con eso se compra mejor la fruta.",
    refs: ["C:parado.deuda_clientes", "C:fuga.credito_incobrable", "C:poder.dias_cobro"],
    camino: "a",
  },
  foda: {
    f: [{ de: "A.F1", texto: null }, { de: "B.F1", texto: null }],
    d: [{ de: "A.D1", texto: null }, { de: "B.D1", texto: null }],
    o: [{ de: "A.O1", texto: null }, { de: "B.O2", texto: null }],
    a: [{ de: "A.A1", texto: null }, { de: "B.A1", texto: null }],
  },
  tows: [{ de: "A.T1", estrategia: null }, { de: "A.T2", estrategia: null }, { de: "B.T1", estrategia: null }, { de: "B.T2", estrategia: null }],
  cambios: {
    a: {
      quitar: [],
      reemplazar: [],
      agregar: [JUGADA_DESCUENTOS],
      casos_nuevos: [{ caso: "Un cliente puntual pide un plazo más largo para las fiestas", por_que_puede_pasar: "En las fiestas los restaurantes compran más y cobran después", refs: ["T:2026-12"], solucion: "Se le amplía el plazo una sola vez, con fecha escrita, y en enero vuelve a su plazo de siempre", senal: "Pagos en fecha de los plazos ampliados" }],
      punto_de_decision: null,
      conviene_si: "La deuda atrasada es la mayor parte de lo fiado y los clientes puntuales aceptan pagar a la semana",
      para_el_dueno: {
        titulo: "Cobrar antes de crecer",
        por_que: "Una parte grande de lo que vendes tarda en volver a tu caja: te deben {{C:parado.deuda_clientes}}, y cada mes se pierden ventas al crédito que nunca se cobran. Primero ordenamos el crédito; después cobramos lo justo por la fruta.",
        pasos: [
          "Subimos el precio de la fruta picada, que hoy se vende por debajo de lo que cuesta",
          "Cada cliente tiene por escrito su tope y su plazo de crédito",
          "Cobramos antes: la factura vence a la semana",
          "Subimos el precio de la palta en los pedidos nuevos",
          "Diego aprueba los descuentos con una regla, sin esperarte",
        ],
        te_pedimos: ["Que visites con Marta a los clientes con más deuda atrasada", "Que apruebes el tope de crédito de cada cliente"],
      },
    },
    b: {
      quitar: [4],
      reemplazar: [],
      agregar: [],
      casos_nuevos: [],
      punto_de_decision: null,
      conviene_si: "Las devoluciones en la puerta pesan más que el crédito que no vuelve y la compradora no puede faltar un día",
      para_el_dueno: {
        titulo: "Ganar por el punto de la fruta",
        por_que: "La fruta que llega pasada se devuelve y se pierde. Si la compra deja de depender de una sola persona, tus clientes reciben fruta lista y vuelven.",
        pasos: ["Rosa escribe cómo elegir la fruta y se lo enseña a otra persona", "Separamos las cajas por madurez al recibirlas", "Llamamos cada viernes a quien devolvió fruta y le reponemos"],
        te_pedimos: ["Que revises con Rosa el criterio de compra una vez"],
      },
    },
  },
  recomendado: {
    camino: "a",
    por_que: "Ataca la fuga más grande con dinero que ya es de la empresa, no pide inversión, y a 90 días la utilidad llegaría a {{R:a.utilidad.d90}} al mes: {{R:a.multiplo.d90}} la de hoy.",
    por_que_no_el_otro: "El camino de la fruta en su punto hace falta, pero a 90 días deja {{R:b.total.d90}} más al mes. Sus dos primeras jugadas se pueden hacer a la vez sin costo.",
  },
  victorias_14_dias: [
    { que: "Escribir el tope y el plazo de crédito de cada cliente y avisarles por mensaje", responsable: "Marta", desde_dia: 1, refs: ["C:fuga.credito_incobrable"], efecto: null },
    { que: "Visitar a los clientes con más deuda atrasada y acordar con cada uno un calendario de pagos", responsable: "Julio", desde_dia: 3, refs: ["C:parado.deuda_clientes"], efecto: { tipo: "dias_cobro", menos_dias: "SR1" } },
    { que: "Separar las cajas de palta por madurez al recibirlas", responsable: "Rosa", desde_dia: 2, refs: ["K:3c3c0002"], efecto: { tipo: "cierre_fuga", fuga: "C:fuga.merma", de_cada_10: "SR2" } },
  ],
  oferta: { de: "a", reescrita: null },
  medir_desde_el_dia_1: [
    { nombre: "Deuda atrasada", como_se_mide: "Lo que debe cada cliente pasado su plazo, sumado al cierre de la semana", quien_anota: "Marta", frecuencia: "semanal", base: "N:deuda_clientes", meta_30: null, meta_90: null },
    { nombre: "Cajas devueltas en la puerta", como_se_mide: "El chofer anota cada caja devuelta al volver del reparto", quien_anota: "Rosa", frecuencia: "diaria", base: null, meta_30: null, meta_90: null },
  ],
  supuestos: [
    { id: "SR1", clave: "dias_cobro.menos_dias", que_se_supone: "Cuántos días antes pagan los que acuerdan su calendario", unidad: "dias", rango: { bajo: 2, alto: 4 }, ancla: "C:poder.dias_cobro_hoy", por_que: "Solo los que más deben, y solo lo atrasado" },
    { id: "SR2", clave: "cierre_fuga.de_cada_10", que_se_supone: "Cuánto de la merma se evita separando la palta al recibirla", unidad: "de_cada_10", rango: { bajo: 1, alto: 2 }, ancla: "C:fuga.merma", por_que: "Es una sola línea y la primera semana" },
  ],
  faltan: [{ clave: "descuentos_mes", por_que_importa: "Puede ser otra fuga de caja que hoy nadie cuenta", pregunta_si_otra: null, unidad_si_otra: null }],
  // Honesta: en lo más optimista llega, en el medio de su rango no; lo dice con la cuenta y con lo que faltaría.
  por_que_no_llega:
    "A 90 días el camino lleva la utilidad a {{R:a.multiplo.d90}} la de hoy: para duplicarla habría que vender {{C:mult.venta_x2}} al mes con el mismo margen. Lo que falta lo traen los hoteles cuando la merma esté bajo control.",
};

// ─── Las malas a propósito ───────────────────────────────────────────────────────────────────────

/** Una jugada que no mueve nada: solo prepara otra. */
const habilitadora = (que: string, abre: string, reduce = false): Jugada => ({
  que_se_mueve: que,
  por_que: "Antes de mover el dinero conviene ordenar la casa",
  refs: ["C:fuga.credito_incobrable", "P:5e5e0004"],
  respuesta_del_mercado: "El cliente no ve ningún cambio",
  si_responde_distinto: "Si no se nota nada, se sigue igual",
  que_abre: "Prepara lo que viene",
  efecto: { tipo: "habilitador", abre },
  desde_dia: 7, responsable: "Marta", pilar: "orden", eslabon: "gobernar", reduce_dependencia_del_dueno: reduce,
});

/**
 * TÍMIDA: el equipo rojo deja el camino recomendado con tres jugadas que no mueven dinero, y no dice por qué no llega
 * a duplicar. Tiene que fallar `ambicion` y `mueve_dinero`.
 */
export const ROJO_TIMIDO: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  r.cambios.a = {
    ...r.cambios.a,
    quitar: [3, 4],
    reemplazar: [
      { n: 1, jugada: habilitadora("Ordenar la lista de deudores antes de decidir nada", "J6") },
      { n: 2, jugada: habilitadora("Conversar con el equipo sobre cómo se da crédito hoy", "J7", true) },
    ],
    agregar: [habilitadora("Revisar a fin de mes cómo va todo", "J5")],
    para_el_dueno: { ...r.cambios.a.para_el_dueno, pasos: ["Ordenamos la lista de deudores", "Conversamos con el equipo sobre cómo se da crédito", "Revisamos a fin de mes cómo va todo"] },
  };
  r.por_que_no_llega = null;
  return r;
})();

/**
 * GENÉRICA: jugadas que le servirían a cualquier negocio, sin nada propio de la empresa. Tiene que fallar
 * `de_esta_empresa`, `sin_frases_de_relleno` y `cuelga_de_lo_que_importa`.
 */
export const ROJO_GENERICO: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  const generica = (que: string, efecto: Jugada["efecto"], reduce = false): Jugada => ({
    que_se_mueve: que,
    por_que: "Los clientes valoran que se les escuche",
    refs: ["K:3c3c0005"],
    respuesta_del_mercado: "Los clientes se sienten mejor atendidos",
    si_responde_distinto: "Si no funciona, se prueba otra cosa",
    que_abre: "Abre nuevas oportunidades",
    efecto,
    desde_dia: 14, responsable: "Diego", pilar: "servicio", eslabon: "vender", reduce_dependencia_del_dueno: reduce,
  });
  r.cambios.a = {
    ...r.cambios.a,
    quitar: [3, 4],
    reemplazar: [
      { n: 1, jugada: generica("Mejorar la comunicación con los clientes para que compren más", { tipo: "conversion", interesados: "Q:interesados_mes", de_cada_10_nuevo: "SR3" }) },
      { n: 2, jugada: generica("Fortalecer la marca en redes sociales", { tipo: "precio_general", pct: "SR4" }) },
    ],
    agregar: [generica("Brindar calidad y atención personalizada a cada cliente", { tipo: "recompra", clientes: "Q:clientes_activos_mes", de_cada_10: "SR5", veces_mes: null }, true)],
    para_el_dueno: { ...r.cambios.a.para_el_dueno, pasos: ["Hablamos más con tus clientes", "Hacemos que tu negocio se conozca", "Cuidamos a cada cliente"] },
  };
  // El de la victoria de cobrar antes (SR1) se queda; la de la merma, sin cuenta (caben cuatro supuestos).
  r.victorias_14_dias[2] = { ...r.victorias_14_dias[2]!, efecto: null };
  r.supuestos = [
    r.supuestos[0]!,
    { id: "SR3", clave: "conversion.de_cada_10_nuevo", que_se_supone: "Cuántos de cada 10 interesados comprarían", unidad: "de_cada_10", rango: { bajo: 5, alto: 6 }, ancla: "N:conversion_de_cada_10", por_que: "Con mejor trato compran más" },
    { id: "SR4", clave: "precio.pct", que_se_supone: "Cuánto sube el precio de todo", unidad: "pct", rango: { bajo: 3, alto: 5 }, ancla: null, por_que: "Una marca más conocida cobra más" },
    { id: "SR5", clave: "recompra.de_cada_10_nuevo", que_se_supone: "Cuántos de cada 10 clientes volverían", unidad: "de_cada_10", rango: { bajo: 8, alto: 9 }, ancla: "Q:clientes_que_vuelven_de_cada_10", por_que: "El cliente bien atendido vuelve" },
  ];
  return r;
})();

/** ALARMISTA: asusta en vez de dar salida, y un caso sin solución. Tiene que fallar `tono_sereno` y `casos_con_solucion`. */
export const ROJO_ALARMISTA: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  r.lectura[1] = "Lo frena un grave riesgo de quiebra si sigue dando crédito sin reglas.";
  r.cambios.a.casos_nuevos = [{ caso: "Una crisis de caja en enero", por_que_puede_pasar: "El crédito sin reglas se come la caja", refs: [], solucion: "No hay solución si el dueño no cambia", senal: "Lo que queda en caja cada semana" }];
  return r;
})();

/**
 * CON CIFRAS: una cifra suelta, un número en palabras con su unidad, «duplicar» sin cuenta y un id que no existe.
 * Tiene que fallar `cifras_con_origen` (y solo esa).
 */
export const ROJO_CON_CIFRAS: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  r.lectura[0] = "Vende 120 mil al mes y, con las cuentas, le quedan {{C:mult.utilidad_hoy}}.";
  r.lectura[2] = "Seguir igual cuesta dos mil soles cada mes.";
  r.lectura[4] = "Lo sabremos el día 30, mirando {{K:ffffffff}}.";
  r.gran_apuesta.por_que = "Cobrar antes permite duplicar la utilidad en pocos meses.";
  return r;
})();

/** CAMINOS IGUALES: el equipo rojo rehace el camino de la operación con las jugadas del dinero. Tiene que fallar `dos_caminos_distintos`. */
export const ROJO_CAMINOS_IGUALES: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  r.cambios.b = {
    ...r.cambios.b,
    quitar: [3, 4],
    reemplazar: [{ n: 1, jugada: copia(JUGADAS_DINERO[0]!) }, { n: 2, jugada: copia(JUGADAS_DINERO[1]!) }],
    agregar: [copia(JUGADAS_DINERO[2]!)],
  };
  return r;
})();

/** CAMINO ROTO: los cambios dejan el camino de la operación con dos jugadas. Tiene que fallar `cifras_con_origen` (efecto mal armado). */
export const ROJO_CAMINO_ROTO: SalidaEquipoRojo = (() => {
  const r = copia(ROJO_BUENO);
  r.cambios.b = { ...r.cambios.b, quitar: [1, 4] };
  return r;
})();

/**
 * LA LENTE QUE SUPONE CUÁNTO ES HOY: un supuesto de «interesados al mes» con un rango inventado y la referencia del
 * rubro como ancla. Tiene que fallar `cifras_con_origen` (supuesto de estado actual y referencia como dato).
 */
export const LENTE_SUPONE_HOY: SalidaLenteDinero = (() => {
  const l = copia(LENTE_DINERO_BUENA);
  l.supuestos.push({ id: "SA5", clave: "interesados_mes", que_se_supone: "Cuántas personas preguntan precio al mes", unidad: "veces_mes", rango: { bajo: 300, alto: 600 }, ancla: "Z:rubro.merma", por_que: "Lo que se ve en el rubro" });
  return l;
})();

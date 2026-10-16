/**
 * Reglas de evidencia para hallazgos. Capítulo 11 y 1.11. Sin IA.
 * Fuerza de fuente: STRONG / MEDIUM / WEAK. Un hallazgo ALTO exige dos fuentes independientes o una STRONG.
 * Si no alcanza → NEEDS_VALIDATION (columna findings.requiere_validacion).
 *
 * DIMENSIONES SEPARADAS (instrucción de Dirección 13-10-2026, sección 10). Hasta hoy "fuerte" mezclaba cosas
 * distintas. Aquí cada una se mide por su lado y ninguna se infiere de otra:
 *  - origen y tipo de la fuente (quién la subió y qué es)              → fuerzaFuente
 *  - autor (quién produjo el papel; dos papeles del mismo autor son UNA voz;
 *    la persona entrevistada manda sobre el autor de la fuente)         → fuentesIndependientes
 *  - período que cubre (antigüedad) y fidelidad de la extracción       → confianzaDeHallazgo
 *  - confirmación de lo declarado (claims.estado)                      → esProvisional, confianzaDeHallazgo
 *  - comprobación del hecho contra un dato (claims.comprobacion)       → confianzaDeHallazgo
 *  - vigencia (claims.vigente_hasta)                                   → vigencia
 *  - impacto potencial (qué tan grave sería si es cierto) ≠ confianza (qué tan seguro es) → calibrarImpacto
 * claims.confianza se transporta en ClaimEvidencia pero ninguna regla la lee todavía: nadie la escribe y no está
 * fijado de quién es esa duda (del extractor, del consultor). Mejor no inventarle un peso.
 * Todos los campos nuevos son opcionales: quien llame con la forma antigua obtiene la respuesta antigua.
 */

/** Sobre qué habla la conclusión: decide qué fuentes la prueban. Ver la tienda prueba cómo opera, no cuánto gana. */
export type Naturaleza = "operativa" | "organizativa" | "financiera" | "comercial";
export type Comprobacion = "no_comprobado" | "comprobado_con_dato" | "comprobado_por_consultor" | "refutado";
export type Fidelidad = "alta" | "media" | "baja" | "no_analizado";
export type Vigencia = "vigente" | "caducado" | "sin_fecha";

export type ClaimEvidencia = {
  id: string;
  source_id: string;
  participant_id: string | null;
  estado: string;
  source_tipo?: string | null; // 'documento' | 'foto' | 'audio' | 'entrevista' | 'dato' | 'observacion'
  source_origen?: string | null; // 'cliente' | 'consultor'
  participant_rol?: string | null;
  // Dimensiones nuevas (migracion-evidencia-dimensiones.sql). Opcionales: sin ellas rige la regla anterior.
  source_autor?: string | null; // sources.autor: quién produjo el documento o dio la observación
  source_periodo_desde?: string | null; // sources.periodo_desde (fecha ISO)
  source_periodo_hasta?: string | null; // sources.periodo_hasta (fecha ISO)
  source_fidelidad?: Fidelidad | string | null; // sources.fidelidad_extraccion
  comprobacion?: Comprobacion | string | null; // claims.comprobacion: el HECHO, no lo declarado
  confianza?: number | null; // claims.confianza (0-1), si alguien la puso. Se transporta; ninguna regla la usa aún (ver cabecera).
  vigente_hasta?: string | null; // claims.vigente_hasta (fecha ISO)
  naturaleza_conclusion?: Naturaleza | null; // sobre qué concluye el hallazgo que usa este claim
};

export type Impacto = "alto" | "medio" | "bajo";
export type Fuerza = "strong" | "medium" | "weak";
export type ResultadoFiltro = { resultado: "pasa" | "no_pasa"; nota: string };
export type Filtros = { proposito: ResultadoFiltro; sabiduria: ResultadoFiltro; excelencia: ResultadoFiltro };

/**
 * Fuerza de una fuente:
 *  strong — dato operativo/transaccional; observación directa del consultor (gemba) sobre lo OBSERVABLE.
 *  medium — documento o foto de documento vigente; entrevista del dueño o de un líder.
 *  weak   — nota/observación escrita por el cliente sobre sí mismo; entrevista de una sola persona de primera línea sin respaldo; fuente sin fecha.
 *
 * "Una observación del consultor no es automáticamente fuerte para cualquier conclusión" (Dirección). Lo que el
 * consultor VIO prueba conclusiones operativas u organizativas (cómo fluye el trabajo, quién decide). Para una
 * conclusión financiera o comercial (margen, precio, ventas) esa misma visita vale medium: ver la tienda no prueba
 * el margen. Sin naturaleza declarada se conserva la regla anterior, para no cambiar lo que ya se calculó.
 */
export function fuerzaFuente(c: Pick<ClaimEvidencia, "source_tipo" | "source_origen" | "participant_rol" | "naturaleza_conclusion">, conclusion?: Naturaleza | null): Fuerza {
  const naturaleza = conclusion ?? c.naturaleza_conclusion ?? null;
  if (c.source_tipo === "dato") return "strong";
  if (c.source_tipo === "observacion") {
    if (c.source_origen !== "consultor") return "weak";
    return naturaleza === "financiera" || naturaleza === "comercial" ? "medium" : "strong";
  }
  if (c.source_tipo === "documento" || c.source_tipo === "foto") return "medium";
  if (c.source_tipo === "entrevista" || c.source_tipo === "audio") return c.participant_rol === "empleado" || !c.participant_rol ? "weak" : "medium";
  return "weak";
}

/** El autor, normalizado para agrupar: "Juan Pérez" y "juan perez " son la misma voz. */
const claveAutor = (autor: string): string => autor.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Fuentes cuya voz es la de quien las escribió o las dio: ahí el autor agrupa. En una entrevista la voz es la persona entrevistada. */
const CON_AUTORIA_PROPIA = new Set(["documento", "foto", "observacion"]);

/**
 * Identidad de fuente independiente, en este orden:
 *  1. Si hay persona entrevistada (participant_id), la voz es ESA persona. El autor de la fuente no manda aquí:
 *     si el extractor pusiera al consultor como autor de todas las entrevistas, dos dueños distintos colapsarían en uno.
 *  2. Si es un papel o una observación (documento, foto, observacion) con autor conocido, la voz es el autor:
 *     "dos documentos no son necesariamente independientes" (Dirección); dos papeles del mismo autor son UNA voz.
 *     Si no se sabe qué tipo de fuente es, el autor también agrupa: ante la duda, menos fuentes, no más.
 *  3. Si no, cada fuente (source_id) es una voz, como antes.
 * Límite honesto: un autor escrito ("Juan Pérez") y esa misma persona entrevistada (participant_id) no se
 * pueden unir sin un vínculo que hoy no existe; se cuentan como dos.
 */
export function fuentesIndependientes(claims: ClaimEvidencia[]): number {
  const voz = (c: ClaimEvidencia): string => {
    if (c.participant_id) return `persona:${c.participant_id}`;
    const autor = c.source_autor?.trim();
    if (autor && (c.source_tipo == null || CON_AUTORIA_PROPIA.has(c.source_tipo))) return `autor:${claveAutor(autor)}`;
    return `fuente:${c.source_id}`;
  };
  return new Set(claims.map(voz)).size;
}

export function tieneFuenteObjetiva(claims: ClaimEvidencia[], conclusion?: Naturaleza | null): boolean {
  return claims.some((c) => fuerzaFuente(c, conclusion) === "strong");
}

/** Fecha ISO (AAAA-MM-DD o con hora) a número de día; null si no se puede leer. */
const dia = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
};

/**
 * Vigencia de una afirmación en la fecha `hoy`. Es una dimensión propia: un tarifario 2025 puede estar
 * confirmado por el dueño (confirmación) y aun así haber dejado de valer (vigencia).
 *  caducado  — el estado ya lo dice, o vigente_hasta quedó atrás.
 *  vigente   — tiene fecha de caducidad y todavía no llegó.
 *  sin_fecha — nadie dijo hasta cuándo vale: no se asume ni lo uno ni lo otro.
 */
export function vigencia(c: Pick<ClaimEvidencia, "estado" | "vigente_hasta">, hoy: string | Date = new Date()): Vigencia {
  if (c.estado === "caducado") return "caducado";
  const limite = dia(c.vigente_hasta);
  if (limite == null) return "sin_fecha";
  const d = dia(typeof hoy === "string" ? hoy : hoy.toISOString().slice(0, 10));
  if (d == null) return "sin_fecha";
  return d > limite ? "caducado" : "vigente";
}

/** Provisional = se formó con afirmaciones que nadie confirmó. Comprobar el hecho sube la confianza, pero la bandera sigue a la confirmación: son dimensiones distintas. */
export function esProvisional(claims: Pick<ClaimEvidencia, "estado">[]): boolean {
  return !claims.some((c) => c.estado === "confirmado");
}

export type ConfianzaHallazgo = { confianza: number; motivo: string; provisional: boolean; vigentes: number; caducadas: number };

/** Días que separan dos fechas ISO; null si alguna no se puede leer. */
const diasEntre = (desde: string | null | undefined, hasta: string | Date): number | null => {
  const a = dia(desde);
  const b = dia(typeof hasta === "string" ? hasta : hasta.toISOString().slice(0, 10));
  return a == null || b == null ? null : b - a;
};

/** Más de un año: lo que una fuente cuenta de un período así de viejo describe otra empresa, no la de hoy. */
const DIAS_ANTIGUEDAD = 365;

/**
 * Antigüedad del período que cubre la fuente (sources.periodo_hasta, o periodo_desde si no hay cierre).
 * Es distinta de la vigencia: un inventario de 2024 puede seguir "vigente" (nadie le puso fecha de caducidad) y
 * aun así hablar de hace más de un año. Sin período declarado no se asume nada.
 */
export function esAntigua(c: Pick<ClaimEvidencia, "source_periodo_desde" | "source_periodo_hasta">, hoy: string | Date = new Date()): boolean {
  const transcurridos = diasEntre(c.source_periodo_hasta ?? c.source_periodo_desde, hoy);
  return transcurridos != null && transcurridos > DIAS_ANTIGUEDAD;
}

/**
 * Confianza 0-1 de un hallazgo a partir de sus afirmaciones. Reglas sumadas, explicadas, sin IA:
 *  0,20 por existir evidencia vigente (si no hay, 0 y se dice).
 *  +0,25 si alguna afirmación está confirmada; +0,10 más si todas lo están.      (confirmación de lo declarado)
 *  +0,20 si alguna está comprobada con dato; +0,10 si solo por el consultor;
 *  −0,30 si alguna fue refutada.                                               (comprobación del hecho)
 *  +0,15 con dos fuentes independientes; +0,05 más con tres o más.             (independencia)
 *  −0,15 si alguna fuente tiene fidelidad de extracción baja.                  (fidelidad)
 *  −0,05 si alguna fuente cubre un período que terminó hace más de un año.     (antigüedad del período)
 *  −0,10 si parte de la evidencia caducó (por estado o por vigente_hasta).     (vigencia)
 * Lectura: < 0,50 baja · 0,50-0,74 media · ≥ 0,75 alta (nivelConfianza). Un documento solo, sin confirmar, da 0,20:
 * baja, y el motivo lo dice con sus palabras. Nada de esto es cero por falta de dato: lo que no se sabe no suma ni resta.
 */
export function confianzaDeHallazgo(claims: ClaimEvidencia[], hoy: string | Date = new Date()): ConfianzaHallazgo {
  const caducadas = claims.filter((c) => vigencia(c, hoy) === "caducado");
  const vivas = claims.filter((c) => vigencia(c, hoy) !== "caducado");
  if (vivas.length === 0) return { confianza: 0, motivo: claims.length ? "toda la evidencia caducó" : "sin evidencia", provisional: true, vigentes: 0, caducadas: caducadas.length };

  const motivos: string[] = [];
  let puntos = 0.2;
  const confirmadas = vivas.filter((c) => c.estado === "confirmado").length;
  const provisional = confirmadas === 0;
  if (confirmadas > 0) {
    puntos += 0.25;
    if (confirmadas === vivas.length) puntos += 0.1;
    motivos.push(confirmadas === vivas.length ? `las ${vivas.length} afirmaciones están confirmadas` : `${confirmadas} de ${vivas.length} afirmaciones confirmadas`);
  } else {
    const docs = vivas.filter((c) => c.source_tipo === "documento" || c.source_tipo === "foto").length;
    motivos.push(`se apoya en ${vivas.length} afirmaci${vivas.length === 1 ? "ón" : "ones"}${docs === vivas.length ? ` de documento${vivas.length === 1 ? "" : "s"}` : ""} no confirmada${vivas.length === 1 ? "" : "s"}`);
  }
  const comprobaciones = vivas.map((c) => c.comprobacion ?? "no_comprobado");
  if (comprobaciones.includes("refutado")) {
    puntos -= 0.3;
    motivos.push("una afirmación fue refutada contra un dato");
  } else if (comprobaciones.includes("comprobado_con_dato")) {
    puntos += 0.2;
    motivos.push("comprobado contra un dato");
  } else if (comprobaciones.includes("comprobado_por_consultor")) {
    puntos += 0.1;
    motivos.push("comprobado por el consultor");
  } else {
    motivos.push("ningún hecho comprobado contra datos");
  }
  const indep = fuentesIndependientes(vivas);
  if (indep >= 2) {
    puntos += indep >= 3 ? 0.2 : 0.15;
    motivos.push(`${indep} fuentes independientes`);
  } else {
    motivos.push("una sola fuente");
  }
  if (vivas.some((c) => c.source_fidelidad === "baja")) {
    puntos -= 0.15;
    motivos.push("alguna fuente se extrajo con fidelidad baja");
  }
  const antiguas = vivas.filter((c) => esAntigua(c, hoy)).length;
  if (antiguas) {
    puntos -= 0.05;
    motivos.push(`${antiguas} afirmaci${antiguas === 1 ? "ón" : "ones"} de un período de hace más de un año`);
  }
  if (caducadas.length) {
    puntos -= 0.1;
    motivos.push(`${caducadas.length} afirmaci${caducadas.length === 1 ? "ón" : "ones"} caducada${caducadas.length === 1 ? "" : "s"}`);
  }
  const confianza = Math.round(Math.min(1, Math.max(0, puntos)) * 100) / 100;
  return { confianza, motivo: motivos.join("; "), provisional, vigentes: vivas.length, caducadas: caducadas.length };
}

/** Palabra para un empresario: alta / media / baja. */
export function nivelConfianza(confianza: number | null | undefined): "alta" | "media" | "baja" | "desconocida" {
  if (confianza == null || Number.isNaN(confianza)) return "desconocida";
  return confianza >= 0.75 ? "alta" : confianza >= 0.5 ? "media" : "baja";
}

/** Un riesgo grave que nadie corroboró se MUESTRA como tal: impacto potencial alto con confianza baja. */
export function esRiesgoGravePendiente(h: { impacto_potencial?: string | null; confianza?: number | null }): boolean {
  return h.impacto_potencial === "alto" && nivelConfianza(h.confianza) === "baja";
}

/**
 * Qué hallazgo se rotula "por corroborar" en vez de "crítico" en el tablero del consultor: todo provisional (nadie
 * confirmó ninguna de sus afirmaciones, aunque la evidencia fuera fuerte y el impacto haya quedado en alto) y todo
 * riesgo grave pendiente. Un dato sin verificar basta para un impacto alto, pero no para pasarlo por conclusión.
 */
export function porCorroborar(h: { provisional?: boolean | null; impacto_potencial?: string | null; confianza?: number | null }): boolean {
  return !!h.provisional || esRiesgoGravePendiente(h);
}

const DIMENSION_FINANCIERA = /margen|precio|costo|caja|cobranza|rentab|financ|utilidad|deuda|liquidez/i;
const DIMENSION_COMERCIAL = /venta|captaci|canal|mercado|cliente|oferta|posicionam|mensaje|retenci|recomendaci|propuesta de valor|prueba/i;
const PATRON_FINANCIERO = new Set(["cuello_financiero_invisible"]);
const PATRON_COMERCIAL = new Set(["canal_unico", "producto_excelente_marketing_mediocre", "marketing_excelente_producto_debil"]);

/**
 * Sobre qué concluye un hallazgo, deducido de lo que ya tiene (patrón, dimensión, pilar), sin leer su texto libre
 * ni preguntarle a un modelo. Primero lo financiero (margen, precio, caja), luego lo comercial (venta, canal,
 * cliente), luego el pilar: personas → organizativa; procesos, producto y transversal → operativa.
 */
export function naturalezaDeHallazgo(h: { pilar?: string | null; patron?: string | null; dimension?: string | null }): Naturaleza {
  if (h.patron && PATRON_FINANCIERO.has(h.patron)) return "financiera";
  if (h.dimension && DIMENSION_FINANCIERA.test(h.dimension)) return "financiera";
  if (h.patron && PATRON_COMERCIAL.has(h.patron)) return "comercial";
  if (h.pilar === "marketing") return "comercial";
  if (h.dimension && DIMENSION_COMERCIAL.test(h.dimension)) return "comercial";
  if (h.pilar === "personas") return "organizativa";
  return "operativa";
}

export type Calibracion = {
  impacto: Impacto;
  requiere_validacion: boolean;
  motivo: string | null;
  fuerza_maxima: Fuerza;
  fuentes: number;
  /** Qué tan grave sería si todo lo afirmado fuera cierto: el impacto propuesto, sin rebajar por la evidencia. */
  impacto_potencial: Impacto;
  /** Qué tan seguro es (0-1), con su porqué. Independiente del impacto. */
  confianza: number;
  confianza_motivo: string;
  /** Se formó solo con afirmaciones no confirmadas. */
  provisional: boolean;
};

export type OpcionesCalibracion = { naturaleza?: Naturaleza | null; hoy?: string | Date };

/**
 * Impacto permitido según la evidencia. ALTO exige ≥2 fuentes independientes o una STRONG; si no, baja a medio y NEEDS_VALIDATION.
 * Si el AUDITOR no lo sustenta, baja a bajo y NEEDS_VALIDATION. Evidencia caducada no sostiene nada.
 * Además devuelve, SEPARADOS, el impacto potencial (el propuesto: qué pasaría si es cierto) y la confianza (qué tan
 * seguro es). Rebajar el impacto por falta de evidencia protege al cliente; guardar el potencial evita que un riesgo
 * grave sin corroborar desaparezca de la vista. La naturaleza de la conclusión decide qué vale una observación.
 */
export function calibrarImpacto(impactoPropuesto: Impacto, evidencia: ClaimEvidencia[], auditorSustenta: boolean | null, opciones: OpcionesCalibracion = {}): Calibracion {
  const naturaleza = opciones.naturaleza ?? null;
  // Caducado por estado o porque su vigente_hasta quedó atrás: ninguna de las dos sostiene un hallazgo.
  const sustento = evidencia.filter((c) => vigencia(c, opciones.hoy) !== "caducado");
  const indep = fuentesIndependientes(sustento);
  const fuerzas = sustento.map((c) => fuerzaFuente(c, naturaleza));
  const fuerza_maxima: Fuerza = fuerzas.includes("strong") ? "strong" : fuerzas.includes("medium") ? "medium" : "weak";
  const conf = confianzaDeHallazgo(evidencia, opciones.hoy);
  // El auditor que no sustenta no borra la evidencia, pero sí la confianza que merece.
  const confianza = auditorSustenta === false ? Math.min(conf.confianza, 0.25) : conf.confianza;
  const confianza_motivo = auditorSustenta === false ? `${conf.motivo}; el auditor no lo sustenta` : conf.motivo;
  const comun = { fuerza_maxima, impacto_potencial: impactoPropuesto, confianza, confianza_motivo, provisional: conf.provisional };
  if (auditorSustenta === false) return { impacto: "bajo", requiere_validacion: true, motivo: "El auditor no lo sustenta", fuentes: indep, ...comun };
  if (sustento.length === 0) return { impacto: "bajo", requiere_validacion: true, motivo: "Sin evidencia vigente", fuentes: 0, ...comun };
  if (impactoPropuesto === "alto") {
    if (indep < 2 && fuerza_maxima !== "strong") return { impacto: "medio", requiere_validacion: true, motivo: `Impacto alto con ${indep} fuente(s) y ninguna fuerte`, fuentes: indep, ...comun };
  }
  return { impacto: impactoPropuesto, requiere_validacion: false, motivo: null, fuentes: indep, ...comun };
}

/** Un hallazgo sin evidencia que lo sustente no existe. */
export function tieneEvidencia(claimIds: string[]): boolean {
  return claimIds.length > 0;
}

/** Los tres filtros: uno reprobado bloquea la recomendación y deja en su lugar la tensión encontrada. */
export function aplicarFiltros(filtros: Filtros, recomendacion: string | null): { bloqueada: boolean; recomendacion: string | null; tension: string | null; reprobados: string[] } {
  const reprobados = (["proposito", "sabiduria", "excelencia"] as const).filter((k) => filtros[k]?.resultado === "no_pasa");
  if (reprobados.length) return { bloqueada: true, recomendacion: null, tension: recomendacion, reprobados };
  return { bloqueada: false, recomendacion, tension: null, reprobados: [] };
}

/** Estado del pilar a partir de los impactos de sus hallazgos válidos. */
export function estadoPilar(impactos: Impacto[], confirmadas: number, minConfirmadas: number): "solido" | "mejorable" | "critico" | "desconocido" {
  if (confirmadas < minConfirmadas) return "desconocido";
  if (impactos.includes("alto")) return "critico";
  if (impactos.includes("medio")) return "mejorable";
  return "solido";
}

export type HallazgoPuntaje = { impacto: string | null; preserva?: boolean; requiere_validacion?: boolean | null };

/**
 * Puntaje 0-100 del pilar, calculado de sus hallazgos vigentes (no rechazados) — no una etiqueta disfrazada.
 * Antes sólido/mejorable/crítico se traducían a 85/60/35 fijos y toda empresa "mejorable" salía 60: un
 * número que parecía medido y no medía nada. Ahora cada hallazgo pesa: alto -20, medio -10, bajo -4 —
 * COMPLETO aunque espere validación: un problema comentado cuenta hasta demostrarse lo contrario
 * (el candado de validación protege lo que llega al cliente; no maquilla el tablero del consultor).
 * Cada fortaleza suma 3. Base 90 (sólido no es perfecto), piso 10, techo 95.
 *
 * Y el techo CRECE con la evidencia confirmada: la salud no se regala, se demuestra. Cada
 * confirmación da derecho a 5 puntos de techo — con el mínimo para diagnosticar (5) el máximo
 * es 25: sabemos poco y el número lo dice sin maquillaje. El techo pleno de 95 se gana con una
 * conversación de verdad (19+ confirmadas). Criterio de Kelin, afinado en tres pasadas: "¿86?
 * es imposible si casi no tienen nada", "65 sigue demasiado alto", "yo diría un 20, 30, lo que
 * realmente sea".
 */
export function techoPorEvidencia(confirmadas: number): number {
  return Math.min(95, 5 * confirmadas);
}

/**
 * EVALUACIÓN SEGÚN EL TIPO DE EMPRESA (pedido de Kelin: "deberías tener un sistema que realmente
 * evalúe ello según el tipo de empresa"). El puntaje combina TRES verdades:
 *  1. Lo que se SABE — techo por evidencia confirmada.
 *  2. Lo que se VIO — salud por hallazgos (arriba).
 *  3. Lo que está CONSTRUIDO de lo que SU TAMAÑO exige — la biblioteca proporcional del pilar y,
 *     en procesos, los procesos dibujados y confirmados frente a los que su tamaño espera.
 * puntaje = min(techoEvidencia, 60% salud vista + 40% construcción). Una empresa de 11 personas
 * con todo en la cabeza del dueño no puede lucir sana aunque converse mucho.
 */
export function puntajePilar(hallazgos: HallazgoPuntaje[], confirmadas?: number, avanceConstruccion?: number | null): number {
  let salud = 90;
  for (const h of hallazgos) {
    if (h.preserva) {
      salud += 3;
      continue;
    }
    salud -= h.impacto === "alto" ? 20 : h.impacto === "medio" ? 10 : 4;
  }
  const p = avanceConstruccion == null ? salud : 0.6 * salud + 0.4 * avanceConstruccion;
  const techo = confirmadas == null ? 95 : techoPorEvidencia(confirmadas);
  return Math.round(Math.max(10, Math.min(techo, p)));
}

/** Procesos medulares que una empresa de este tamaño debería tener dibujados y confirmados. */
export function procesosEsperados(personas: number | null | undefined): number {
  const n = personas == null || Number.isNaN(personas) ? null : personas;
  return n == null ? 5 : n <= 3 ? 3 : n <= 10 ? 5 : 8;
}

/** Avance 0-100 del trabajo de procesos: confirmado por el dueño vale entero, dibujado la mitad. */
export function avanceProcesos(dibujados: number, confirmados: number, esperados: number): number {
  if (esperados <= 0) return 100;
  return Math.round(Math.min(100, (100 * (confirmados + 0.5 * Math.max(0, dibujados - confirmados))) / esperados));
}

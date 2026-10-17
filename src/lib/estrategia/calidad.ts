/**
 * LA LISTA DE CONTROL: QUE NO SALGA TÍMIDA NI GENÉRICA (spec-estrategia-8x.md §9.2).
 *
 * Lo que Kelin rechazó con nombre propio —una estrategia que no se juega nada, que le serviría a cualquier negocio, que
 * asusta en vez de dar salida— se comprueba aquí, en código, con las mismas reglas que corren en las pruebas contra las
 * salidas falsas. EL CÓDIGO DECIDE: `cumple` de cada ítem es el único veredicto que se muestra. El equipo rojo dice lo
 * suyo en sus objeciones; un segundo «cumple / no cumple» que contradiga a este confundiría.
 *
 * Un ítem que no cumple no bloquea la aprobación (salvo las cifras sin origen, que ya bloquea el validador): se ve en
 * rojo en «Lista de control» y la consultora decide.
 *
 * Puro: sin base, sin red, sin IA.
 */
import type { Paquete, RefValor } from "./paquete";
import type { Calculos } from "./calculos";
import { refsDeEfecto, refsDeEstrategia, type CaminoFinal, type Estrategia, type JugadaFinal, type LetraCamino, idJugada } from "./armar";
import { CAMPOS_DE_TEXTO, partesDeLineas, sinTildes, textosEn, validar, type TipoViolacion, type Validacion } from "./validador";
import { refsEnTexto } from "./texto";
import { normalizar } from "../plan-reglas";

export const CLAVES_CONTROL = [
  "ambicion", "mueve_dinero", "sale_a_ganar", "de_esta_empresa", "sin_frases_de_relleno", "cuelga_de_lo_que_importa", "dos_caminos_distintos",
  "casos_con_solucion", "tono_sereno", "cifras_con_origen", "foda_con_hechos", "cuatro_cruces", "contra_no_actuar",
  "punto_de_decision", "victorias_reales", "oferta_completa", "dependencia_del_dueno", "preguntas_orales", "dueno_sin_jerga",
] as const;
export type ClaveControl = (typeof CLAVES_CONTROL)[number];

/** Lo que se exige, en palabras (es lo que lee la consultora y lo que recibe el equipo rojo para atacar). */
export const LISTA_DE_CONTROL: Record<ClaveControl, { nombre: string; exige: string }> = {
  ambicion: { nombre: "Ambición", exige: "El camino recomendado duplica la utilidad o más a 90 días en el medio de su rango (no solo en lo más optimista), o dice con cuentas por qué no y qué faltaría. Si hoy no hay utilidad, apunta a pasar el punto de equilibrio." },
  mueve_dinero: { nombre: "Mueve dinero", exige: "Al menos dos jugadas de cada camino mueven la utilidad o la caja con número." },
  sale_a_ganar: { nombre: "Sale a ganar", exige: "Uno de los dos caminos sale a ganar clientes: la oferta como arma y al menos dos jugadas de atraer o de vender (si la regla de volumen las retrasa, entran en su punto de decisión)." },
  de_esta_empresa: { nombre: "De esta empresa", exige: "Cada jugada nombra algo propio: un producto, un proceso, un gasto, una fuga o una persona de la empresa." },
  sin_frases_de_relleno: { nombre: "Sin frases de relleno", exige: "Nada que le serviría igual a cualquier negocio, y ningún autor ni empresa citados." },
  cuelga_de_lo_que_importa: { nombre: "Cuelga de lo que importa", exige: "Cada jugada cuelga de la restricción, de una fuga con monto o de una palanca calculada." },
  dos_caminos_distintos: { nombre: "Dos caminos distintos", exige: "Los dos caminos no se repiten: si son el mismo, no hay elección." },
  casos_con_solucion: { nombre: "Casos con solución", exige: "Al menos dos casos por camino, cada uno con lo que haremos y la señal que lo avisa." },
  tono_sereno: { nombre: "Tono sereno", exige: "Sin alarmismo en la lectura, la gran apuesta ni los casos." },
  cifras_con_origen: { nombre: "Cifras con origen", exige: "Ninguna cifra sin origen, ningún dato inventado y ninguna cuenta mal armada." },
  foda_con_hechos: { nombre: "FODA con hechos", exige: "Cada ítem con al menos un dato de respaldo; las oportunidades y amenazas, con fuente de afuera o marcadas «falta investigar»." },
  cuatro_cruces: { nombre: "Cuatro cruces", exige: "Cruces FO, FA, DO y DA, cada uno con su impacto calculado o con la pregunta que lo calcularía." },
  contra_no_actuar: { nombre: "Contra seguir igual", exige: "Cada camino se compara con lo que cuesta seguir igual." },
  punto_de_decision: { nombre: "Punto de decisión", exige: "Cada camino dice qué día se mira, qué se mira y qué se hace si no va." },
  victorias_reales: { nombre: "Victorias reales", exige: "De dos a cuatro victorias que empiezan en la primera semana, cada una con una persona de la empresa." },
  oferta_completa: { nombre: "Oferta completa", exige: "Los cuatro términos de la oferta con respaldo o «sin dato», y su nombre, su promesa y su garantía." },
  dependencia_del_dueno: { nombre: "Dependencia del dueño", exige: "Si el dueño decide solo en algún proceso, el camino recomendado tiene al menos una jugada que se lo quita." },
  preguntas_orales: { nombre: "Preguntas orales", exige: "Cada pregunta para el dueño es una sola, corta, por el episodio y sin cifras ni jerga." },
  dueno_sin_jerga: { nombre: "Sin jerga para el dueño", exige: "Nada de lo que lee el dueño trae palabras del método." },
};

export type ResultadoControl = { clave: ClaveControl; nombre: string; exige: string; cumple: boolean; detalle: string[] };

/**
 * Frases que le servirían igual a cualquier negocio (§9.2). Las que dependen de su contexto («capacitar al personal»
 * sin qué ni quién, «redes sociales» sin canal ni cifra) pasan si la misma jugada nombra algo propio.
 */
export const FRASES_GENERICAS: readonly { frase: string; re: RegExp; salvo?: "algo_propio" | "canal_o_cifra" }[] = [
  { frase: "mejorar la comunicación", re: /\bmejorar la comunicacion\b/ },
  { frase: "fortalecer la marca", re: /\bfortalecer la marca\b/ },
  { frase: "posicionar la marca", re: /\bposicionar la marca\b/ },
  { frase: "brindar calidad", re: /\bbrindar (?:un servicio de )?calidad\b/ },
  { frase: "atención personalizada", re: /\batencion personalizada\b/ },
  { frase: "optimizar procesos", re: /\boptimizar (?:los )?procesos\b/ },
  { frase: "mejora continua", re: /\bmejora continua\b/ },
  { frase: "trabajo en equipo", re: /\btrabajo en equipo\b/ },
  { frase: "sinergia", re: /\bsinergias?\b/ },
  { frase: "mejorar el servicio", re: /\bmejorar el servicio\b/ },
  { frase: "fidelizar a los clientes", re: /\bfidelizar a (?:los )?clientes\b/ },
  { frase: "aumentar las ventas", re: /\baumentar las ventas\b/ },
  { frase: "capacitar al personal", re: /\bcapacitar al personal\b/, salvo: "algo_propio" },
  { frase: "redes sociales", re: /\bredes sociales\b/, salvo: "canal_o_cifra" },
];
const CANALES = /\b(?:instagram|facebook|tiktok|whatsapp|youtube|linkedin|google maps)\b/;

/** Palabras que asustan en vez de dar salida (§9.2). Sin tildes, con borde de palabra; y cualquier «!». */
export const PALABRAS_ALARMA: readonly string[] = ["grave", "graves", "peligro", "peligroso", "peligrosa", "crisis", "catastrofe", "catastrofico", "catastrofica", "quiebra", "quebrar", "urgente", "urgentes", "alarmante", "alarmantes", "fracaso", "fracasar", "colapso", "desastre"];
const RE_ALARMA = new RegExp(`\\b(?:${PALABRAS_ALARMA.join("|")})\\b`);

/** Una solución que no es solución. */
const SIN_SOLUCION = /^\s*(?:no hay (?:solucion|salida|nada que hacer)\b.*|sin solucion\b.*|ninguna\.?|nada\.?|no se puede\b.*|n\/a|-+|\.+|…|por definir\.?)\s*$/;

/** Los tipos de error del validador que cuenta cada ítem: cada error, en un solo ítem. */
const ERRORES_DE: Partial<Record<ClaveControl, readonly TipoViolacion[]>> = {
  cifras_con_origen: ["cifra_sin_origen", "ref_desconocida", "efecto_mal_armado", "supuesto_fuera_de_limite", "supuesto_de_estado_actual", "referencia_como_dato"],
  sin_frases_de_relleno: ["nombre_de_referente"],
  preguntas_orales: ["pregunta_mal_hecha"],
  dueno_sin_jerga: ["palabra_que_el_dueno_no_ve"],
};

const PREFIJOS_PROPIOS = /^(?:L:|P:|G:|C:fuga\.|C:producto\.)/;

/** Los nombres propios de la empresa: lo que vende, sus procesos y sus personas. */
function nombresPropios(p: Paquete): string[] {
  const procesos = p.hechos.filter((h) => h.id.startsWith("P:")).map((h) => /«([^»]+)»/.exec(h.texto)?.[1] ?? "").filter(Boolean);
  return [...p.lineas.map((l) => l.nombre), ...procesos, ...p.personas.map((x) => x.nombre)].map(normalizar).filter((n) => n.length >= 3);
}

const todosLosRefs = (j: JugadaFinal): string[] => [...j.refs, ...refsDeEfecto(j.efecto)];

/** «Una jugada mueve dinero»: tiene efecto que no es habilitador y su cuenta tiene número. */
function mueveDinero(c: CaminoFinal, j: JugadaFinal): boolean {
  if (!j.efecto || j.efecto.tipo === "habilitador") return false;
  const p = c.proyeccion.jugadas.find((x) => x.id === j.id)?.proyeccion;
  return !!p && p.estado === "con_numero" && !!(p.utilidad_mes.valor || p.caja_una_vez.valor);
}

/** El parecido de dos caminos: de las jugadas del más corto, cuántas tienen el mismo tipo de efecto y la misma primera ref en el otro. */
export function parecidoDeCaminos(a: Pick<CaminoFinal, "jugadas">, b: Pick<CaminoFinal, "jugadas">): number {
  const firma = (j: JugadaFinal) => `${j.efecto?.tipo ?? "sin_efecto"}|${j.refs[0] ?? ""}`;
  const fa = a.jugadas.map(firma);
  const fb = new Set(b.jugadas.map(firma));
  const menor = Math.min(a.jugadas.length, b.jugadas.length);
  if (!menor) return 0;
  return Math.min(1, fa.filter((f) => fb.has(f)).length / menor);
}

/**
 * Corre la lista de control sobre una estrategia armada. `validacion` se puede pasar si ya se corrió el validador; si
 * no, se corre aquí con los ids de la versión.
 */
export function revisarCalidad(e: Estrategia, paquete: Paquete, calculos: Calculos, opciones: { validacion?: Validacion; refs?: ReadonlyMap<string, RefValor> } = {}): ResultadoControl[] {
  const refs = opciones.refs ?? refsDeEstrategia(e, paquete, calculos);
  const validacion = opciones.validacion ?? validar(e, refs, { partes: partesDeLineas(calculos) });
  const letras = ["a", "b"] as const;
  const camino = (l: LetraCamino) => e.caminos[l];
  const nombreCamino = (l: LetraCamino) => (l === "a" ? "Camino A" : "Camino B");
  const resultado: ResultadoControl[] = [];
  const poner = (clave: ClaveControl, cumple: boolean, detalle: string[] = []) => resultado.push({ clave, ...LISTA_DE_CONTROL[clave], cumple, detalle });
  const erroresDe = (clave: ClaveControl) => validacion.errores.filter((x) => (ERRORES_DE[clave] ?? []).includes(x.tipo));
  const posicion = (c: CaminoFinal, j: JugadaFinal) => c.jugadas.indexOf(j) + 1;

  // ── ambicion
  {
    const rec = camino(e.recomendado.camino);
    const pc = rec.proyeccion;
    const explica = (patron: RegExp) => !!e.por_que_no_llega && refsEnTexto(e.por_que_no_llega).some((id) => patron.test(id));
    const estado = calculos.multiplicador.estado;
    // La ambición se mide con el MEDIO del rango, no con su alto: con el alto, bastaba poner los supuestos en el tope
    // para «duplicar» (revisión del 17-10). Lo optimista se ve aparte, en el aviso de supuesto en el tope.
    const medio = (v: { bajo: number; alto: number } | null | undefined) => (v ? (v.bajo + v.alto) / 2 : null);
    if (estado === "multiplicar") {
      const m = medio(pc.multiplo.d90.valor);
      const llega = m != null && m >= 2;
      poner("ambicion", llega || explica(/^C:mult\./), llega ? [] : [m == null ? `${nombreCamino(rec.letra)}: a 90 días no tiene número (${pc.multiplo.d90.motivo_nulo ?? "sin cuenta"}).` : `${nombreCamino(rec.letra)}: a 90 días, en el medio de su rango, multiplica la utilidad por ${m.toFixed(1)}, no por dos.`, ...(e.por_que_no_llega ? [] : ["Y no dice con la cuenta del multiplicador por qué no llega ni qué faltaría."])]);
    } else if (estado === "equilibrio_primero") {
      const alto = medio(pc.utilidad.d90.valor);
      const pasa = alto != null && alto > 0;
      poner("ambicion", pasa || explica(/^C:(mult\.|equilibrio\.)/), pasa ? ["Hoy la utilidad podría ser cero o negativa: se mide si el camino pasa el punto de equilibrio."] : ["Hoy la utilidad podría ser cero o negativa, y a 90 días el camino no pasa el punto de equilibrio.", ...(e.por_que_no_llega ? [] : ["Y no dice con la cuenta por qué no ni qué faltaría."])]);
    } else {
      poner("ambicion", explica(/^C:/), ["Sin la utilidad de hoy no hay cuenta del multiplicador: hace falta la venta, lo que deja cada venta y los gastos."]);
    }
  }

  // ── mueve_dinero
  {
    const detalle: string[] = [];
    let cumple = true;
    for (const l of letras) {
      const c = camino(l);
      const mueven = c.jugadas.filter((j) => mueveDinero(c, j)).length;
      if (mueven < 2) {
        cumple = false;
        detalle.push(`${nombreCamino(l)}: ${mueven === 1 ? "solo una jugada mueve" : mueven === 0 ? "ninguna jugada mueve" : `${mueven} jugadas mueven`} dinero con número.`);
      }
      for (const j of c.proyeccion.jugadas.filter((x) => x.proyeccion.estado === "por_probar")) {
        const jug = c.jugadas.find((x) => x.id === j.id);
        detalle.push(`${nombreCamino(l)}, jugada ${jug ? posicion(c, jug) : "?"}: por probar; la destraba saber ${j.proyeccion.por_probar.map((f) => f.pregunta ?? f.que_falta).join(" / ")}.`);
      }
    }
    poner("mueve_dinero", cumple, detalle);
  }

  // ── sale_a_ganar: dos caminos que solo ordenan la casa no le dan a la consultora una opción de crecer.
  {
    const ofensivas = (l: LetraCamino) => camino(l).jugadas.filter((j) => j.eslabon === "atraer" || j.eslabon === "vender").length;
    const cuantas = letras.map((l) => ({ l, n: ofensivas(l) }));
    const sale = cuantas.some((x) => x.n >= 2);
    poner("sale_a_ganar", sale, sale ? [] : [`Ninguno de los dos caminos sale a ganar clientes: ${cuantas.map((x) => `${nombreCamino(x.l)} tiene ${x.n === 0 ? "ninguna jugada" : x.n === 1 ? "una jugada" : `${x.n} jugadas`} de atraer o de vender`).join("; ")}.`]);
  }

  // ── de_esta_empresa
  {
    const nombres = nombresPropios(paquete);
    const detalle: string[] = [];
    for (const l of letras) {
      const c = camino(l);
      for (const j of c.jugadas) {
        const propio = todosLosRefs(j).some((id) => PREFIJOS_PROPIOS.test(id));
        const texto = ` ${normalizar(`${j.que_se_mueve} ${j.por_que}`)} `;
        const nombra = nombres.some((n) => texto.includes(` ${n} `));
        if (!propio && !nombra) detalle.push(`${nombreCamino(l)}, jugada ${posicion(c, j)}: no nombra nada propio de la empresa.`);
      }
    }
    poner("de_esta_empresa", !detalle.length, detalle);
  }

  // ── sin_frases_de_relleno
  {
    const detalle: string[] = [];
    const nombres = nombresPropios(paquete);
    for (const { puntero, texto } of textosEn(e, CAMPOS_DE_TEXTO)) {
      const plano = sinTildes(texto);
      for (const f of FRASES_GENERICAS) {
        if (!f.re.test(plano)) continue;
        if (f.salvo === "canal_o_cifra" && (CANALES.test(plano) || refsEnTexto(texto).length)) continue;
        if (f.salvo === "algo_propio" && (refsEnTexto(texto).length || nombres.some((n) => ` ${normalizar(texto)} `.includes(` ${n} `)))) continue;
        detalle.push(`«${f.frase}» en ${puntero}.`);
      }
    }
    for (const x of erroresDe("sin_frases_de_relleno")) detalle.push(`${x.texto} (${x.puntero})`);
    poner("sin_frases_de_relleno", !detalle.length, detalle);
  }

  // ── cuelga_de_lo_que_importa
  {
    const restriccion = new Set(e.anexos.terreno.restriccion.refs);
    const detalle: string[] = [];
    for (const l of letras) {
      const c = camino(l);
      const cuelgaPorSi = (j: JugadaFinal) =>
        todosLosRefs(j).some((id) => restriccion.has(id) || (id.startsWith("C:fuga.") && refs.get(id)?.valor != null) || id.startsWith("C:poder.") || id.startsWith("C:palanca."));
      for (const j of c.jugadas) {
        let cuelga = cuelgaPorSi(j);
        // Una habilitadora cuelga también de lo que abre.
        if (!cuelga && j.efecto?.tipo === "habilitador") {
          const abre = c.jugadas.find((x) => x.id === idJugada((j.efecto as { abre: string }).abre));
          cuelga = !!abre && cuelgaPorSi(abre);
        }
        if (!cuelga) detalle.push(`${nombreCamino(l)}, jugada ${posicion(c, j)}: no cuelga de la restricción, de una fuga con monto ni de una palanca calculada.`);
      }
    }
    poner("cuelga_de_lo_que_importa", !detalle.length, detalle);
  }

  // ── dos_caminos_distintos
  {
    const p = parecidoDeCaminos(camino("a"), camino("b"));
    const misma = normalizar(camino("a").filosofia) === normalizar(camino("b").filosofia);
    poner("dos_caminos_distintos", p <= 0.5 && !misma, p > 0.5 || misma ? [`Se parecen: ${Math.round(p * 10)} de cada 10 jugadas del más corto están también en el otro${misma ? ", y dicen la misma filosofía" : ""}.`] : []);
  }

  // ── casos_con_solucion
  {
    const detalle: string[] = [];
    for (const l of letras) {
      const c = camino(l);
      if (c.casos.length < 2) detalle.push(`${nombreCamino(l)}: tiene ${c.casos.length} caso${c.casos.length === 1 ? "" : "s"} a tener en cuenta; hacen falta dos.`);
      c.casos.forEach((x, i) => {
        if (!x.solucion?.trim() || SIN_SOLUCION.test(sinTildes(x.solucion))) detalle.push(`${nombreCamino(l)}, caso ${i + 1}: no trae lo que haremos.`);
        if (!x.senal?.trim() || SIN_SOLUCION.test(sinTildes(x.senal))) detalle.push(`${nombreCamino(l)}, caso ${i + 1}: no dice qué señal lo avisa.`);
      });
    }
    poner("casos_con_solucion", !detalle.length, detalle);
  }

  // ── tono_sereno
  {
    const textos = [
      ...e.lectura.map((t, i) => ({ donde: `lectura, línea ${i + 1}`, t })),
      { donde: "la gran apuesta", t: `${e.gran_apuesta.frase} ${e.gran_apuesta.por_que}` },
      ...letras.flatMap((l) => camino(l).casos.map((x, i) => ({ donde: `${nombreCamino(l)}, caso ${i + 1}`, t: `${x.caso} ${x.por_que_puede_pasar} ${x.solucion} ${x.senal}` }))),
    ];
    const detalle = textos.filter(({ t }) => RE_ALARMA.test(sinTildes(t)) || t.includes("!")).map(({ donde, t }) => `${donde}: «${(RE_ALARMA.exec(sinTildes(t)) ?? ["!"])[0]}».`);
    poner("tono_sereno", !detalle.length, detalle);
  }

  // ── cifras_con_origen
  {
    const errs = erroresDe("cifras_con_origen");
    const pendientes = e.quitado.filter((q) => !q.resuelto);
    poner("cifras_con_origen", !errs.length, [...errs.map((x) => `${x.texto} (${x.puntero})`), ...(pendientes.length ? [`8X quitó ${pendientes.length} ${pendientes.length === 1 ? "cosa" : "cosas"} que la consultora todavía no revisó.`] : [])]);
  }

  // ── foda_con_hechos
  {
    const detalle: string[] = [];
    const NOMBRE = { f: "fortalezas", d: "debilidades", o: "oportunidades", a: "amenazas" } as const;
    for (const q of ["f", "d", "o", "a"] as const) {
      if (!e.foda[q].length) detalle.push(`Sin ${NOMBRE[q]}.`);
      e.foda[q].forEach((it, i) => {
        if (!it.refs.length) detalle.push(`${NOMBRE[q]}, ítem ${i + 1}: sin ningún dato de respaldo.`);
        if ((q === "o" || q === "a") && !it.refs.some((id) => /^[TZ]:/.test(id)) && !it.sin_fuente_externa) detalle.push(`${NOMBRE[q]}, ítem ${i + 1}: sin fuente de afuera y sin marcar «falta investigar».`);
      });
    }
    poner("foda_con_hechos", !detalle.length, detalle);
  }

  // ── cuatro_cruces
  {
    const detalle: string[] = [];
    for (const q of ["FO", "FA", "DO", "DA"] as const) {
      const cruces = e.tows.filter((t) => t.cuadrante === q);
      if (!cruces.length) detalle.push(`Falta el cruce ${q}.`);
      for (const t of cruces) {
        const ok = t.impacto.estado === "con_numero" || (t.impacto.estado === "por_probar" && t.impacto.por_probar.length > 0) || (!t.efecto && !!t.pregunta_si_no_hay_cuenta?.trim());
        if (!ok) detalle.push(`El cruce ${q} no tiene su impacto calculado ni la pregunta que lo calcularía.`);
      }
    }
    poner("cuatro_cruces", !detalle.length, detalle);
  }

  // ── contra_no_actuar
  {
    const r = refs.get(e.si_seguimos_igual.mes);
    poner("contra_no_actuar", !!r && (r.valor != null || !!r.motivo_nulo), r ? [] : ["No está la cuenta de lo que cuesta seguir igual."]);
  }

  // ── punto_de_decision
  {
    const detalle: string[] = [];
    for (const l of letras) {
      const p = camino(l).punto_de_decision;
      if (!(p.dia >= 1 && p.dia <= 90) || !p.que_mirar?.trim() || !p.si_no?.trim()) detalle.push(`${nombreCamino(l)}: falta el día, qué se mira o qué se hace si no va.`);
    }
    poner("punto_de_decision", !detalle.length, detalle);
  }

  // ── victorias_reales
  {
    const v = e.victorias_14_dias;
    const detalle: string[] = [];
    if (v.length < 2 || v.length > 4) detalle.push(`Son ${v.length} victorias; tienen que ser de dos a cuatro.`);
    v.forEach((x, i) => {
      if (x.desde_dia > 7) detalle.push(`Victoria ${i + 1}: empieza después de la primera semana.`);
      if (!x.responsable_encontrado) detalle.push(`Victoria ${i + 1}: «${x.responsable_dicho ?? x.responsable}» no es una persona de la empresa.`);
    });
    poner("victorias_reales", !detalle.length, detalle);
  }

  // ── oferta_completa
  {
    const o = e.oferta;
    const detalle: string[] = [];
    const TERMINOS = { resultado_sonado: "el resultado que sueña", probabilidad_percibida: "por qué cree que le va a funcionar", tiempo: "cuánto tarda", esfuerzo: "cuánto le cuesta" } as const;
    for (const [k, nombre] of Object.entries(TERMINOS) as [keyof typeof TERMINOS, string][]) {
      const t = o[k];
      if (!t?.texto?.trim() || (!t.refs.length && !/sin dato/i.test(t.texto))) detalle.push(`Falta ${nombre} con su respaldo o «sin dato».`);
    }
    if (!o.nombre?.trim() || !o.promesa?.trim() || !o.garantia?.trim()) detalle.push("Falta el nombre, la promesa o la garantía.");
    poner("oferta_completa", !detalle.length, detalle);
  }

  // ── dependencia_del_dueno
  {
    const conteo = calculos.dependencia.conteo;
    const rec = camino(e.recomendado.camino);
    if (!conteo || conteo.decide_solo <= 0) poner("dependencia_del_dueno", true, [conteo ? "El dueño no decide solo en ningún proceso del mapa." : "Sin la ficha de dirección no se contó en qué procesos decide solo el dueño."]);
    else {
      const reduce = rec.jugadas.some((j) => j.reduce_dependencia_del_dueno);
      poner("dependencia_del_dueno", reduce, reduce ? [] : [`El dueño decide solo en ${conteo.nombres_decide_solo.map((n) => `«${n}»`).join(", ")}, y el camino recomendado no tiene una jugada que se lo quite.`]);
    }
  }

  // ── preguntas_orales y dueno_sin_jerga
  for (const clave of ["preguntas_orales", "dueno_sin_jerga"] as const) {
    const errs = erroresDe(clave);
    poner(clave, !errs.length, errs.map((x) => `${x.texto} (${x.puntero})`));
  }

  // En el orden de la lista.
  return CLAVES_CONTROL.map((k) => resultado.find((r) => r.clave === k)!);
}

/** Las claves que no cumplen. */
export const queNoCumple = (r: readonly ResultadoControl[]): ClaveControl[] => r.filter((x) => !x.cumple).map((x) => x.clave);

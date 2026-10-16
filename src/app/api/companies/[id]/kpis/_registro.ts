import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarValor, zonaDe, granularidad, nombreDePeriodoKpi, type Kpi, type EstadoValidacionValor } from "@/lib/kpis";
import { etiquetaEstado, normalizarMetrica, VITAL_POR_CLAVE, type Vital } from "@/lib/metricas";
import { conCifraDesplazada, declaradoAlLado, escribirConservando, faltaUnaColumna, formatoCifra, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";

/**
 * EL ÚNICO CAMINO PARA ESCRIBIR EL VALOR DE UN PERIODO. Lo usan la ruta nueva (POST /kpis/[kid]/valor) y la
 * vieja (PATCH /indicadores): hasta el 13-10-2026 la vieja anotaba por su cuenta en `company_metricas`, con
 * `null` guardado como si fuera un dato y sin mirar ni el periodo ni quién registraba. Ahora las dos pasan
 * por `registrarValor` (src/lib/kpis.ts) y escriben lo mismo, en el mismo orden y en los mismos sitios.
 *
 * DOS TABLAS, UN SOLO ESCRITOR. La historia de un indicador vive en `indicador_valores`, con qué tan comprobado
 * está cada valor. «Tus números» lee `company_metricas`, que es donde vivían estos valores antes de que hubiera
 * historia (migracion-evidencia-indicadores.sql). Para que las dos pantallas digan lo mismo, TODO valor mensual
 * se refleja ahí, entre por la ruta que entre: antes solo reflejaba la ruta vieja, y lo que se registraba en
 * «Tus indicadores» no aparecía en «Tus números». Lo que no es mensual no se refleja (esa tabla guarda meses):
 * su historia está solo en «Tus indicadores», y la pantalla lo dice.
 *
 * EL ESPEJO Y LOS NUEVE NÚMEROS (cierre Z1, 13-10-2026). Un indicador puede llevar la clave de uno de los nueve
 * números del negocio (`venta_mes`, `caja_hoy`…): entonces su reflejo ES ese número en ese mes, y lo leen la
 * radiografía y los cortes. Cinco reglas, todas probadas en tests/sql/contraste.test.ts:
 *  - el espejo escribe siempre en SU periodo (el mes que se registró), nunca en «hoy» ni en otro mes;
 *  - escribe en la fila de la clave CANÓNICA. Un indicador llamado `ventas_mes` es «Ventas del mes»: si ese mes
 *    ya tiene su fila `venta_mes`, se escribe en ella, y si no la tiene se crea con la clave canónica. Antes
 *    quedaba una segunda fila con el sinónimo, el aviso decía «cambió» con «antes: nada» y los cortes seguían
 *    tomando la cifra vieja;
 *  - una cifra EXTRAÍDA de un documento que nadie revisó tampoco se reemplaza, pero lo registrado no se pierde
 *    para el contraste: se guarda AL LADO de esa cifra, como declarado (`cifra_desplazada`), y el aviso lo dice.
 *    Así el consultor ve las dos; antes la pantalla decía «falta la cifra declarada» cuando sí la había;
 *  - nunca reemplaza un valor verificado o conciliado de ese mismo periodo, lo haya guardado quien lo haya
 *    guardado y con la clave canónica o con un sinónimo: queda intacto y se avisa. Conciliado quiere decir
 *    CON CIFRA: una lectura que el consultor aceptó «sin cifra» (el documento no traía el número) no es un
 *    valor verificado, y lo que se registra aquí sí entra, como contado y sin figurar ya como conciliado;
 *  - cuando SÍ cambia uno de los nueve por este camino, la respuesta lo dice (`aviso` y `numero_vital`): antes
 *    el número del mes cambiaba sin que nadie se enterase.
 * Como los otros dos que guardan números, lee la fila previa ENTERA y arma la suya con `conCifraDesplazada`
 * (lado «declarado»): si esa fila guardaba al lado la cifra de un documento, ahí sigue.
 *
 * No importa nada de Next ni de la sesión: recibe el cliente de base y quién registra. Así se prueba con un
 * doble en memoria (tests/kpis.test.ts) y contra el esquema real (tests/sql/kpis.test.ts), y la regla no depende
 * de la ruta por la que se entra. Por eso tampoco escribe el rastro ni el registro de errores: devuelve lo que
 * hay que anotar (`rastroDeValor`, `tecnico`) y la ruta lo anota.
 */

export type QuienRegistra = { id: string | null; rol: string };

export type PedidoDeValor = {
  periodo: string;
  /** null = este periodo no tiene dato. No se guarda cero ni se inventa nada. */
  valor: number | null;
  fuente?: string | null;
  estado_validacion?: EstadoValidacionValor | null;
  nota?: string | null;
};

/**
 * Qué pasó con el reflejo del valor en «Tus números» (`company_metricas`):
 *  - `no_aplica`: el periodo no es un mes; esa tabla no guarda semanas, quincenas ni trimestres.
 *  - `reflejado`: quedó también ahí, como «contado» (lo que se registra en un indicador nunca asciende solo a verificado).
 *    Si la clave es uno de los nueve números del negocio, `numero_vital` y `aviso` dicen que ese número cambió.
 *  - `intacto`: ahí ya había un dato que un valor declarado no puede reemplazar (verificado, extraído o
 *    descartado en la revisión). El número no se tocó, y `aviso` lo dice. Si el dato era una cifra extraída
 *    sin revisar, lo registrado quedó guardado al lado para compararlas (`declarado_al_lado`).
 *  - `pendiente`: no llegó a escribirse; `pendiente` dice por qué.
 */
export type Espejo = "no_aplica" | "reflejado" | "intacto" | "pendiente";

/** Lo que quedó sin escribir DESPUÉS de que el valor entró en la historia. `motivo` es para quien registra; `tecnico`, para el registro de errores. */
export type Pendiente = { que: "valor_actual" | "tus_numeros"; motivo: string; tecnico: string };

export type ValorGuardado =
  /** No se escribió nada. `tecnico` trae el mensaje de la base cuando el fallo fue suyo: no se le muestra a quien registra. */
  | { ok: false; status: number; motivo: string; tecnico?: string }
  | { ok: true; sin_dato: true; periodo: string; texto: string; es_periodo_anterior: boolean }
  | {
      /** El valor está en la historia. Si además quedó algo sin escribir, `pendiente` lo dice. */
      ok: true;
      sin_dato: false;
      periodo: string;
      valor: number;
      estado_validacion: EstadoValidacionValor;
      texto: string;
      es_periodo_anterior: boolean;
      /** true si ya había un valor para ese periodo: es una corrección, y `antes` conserva lo que había. */
      corregido: boolean;
      antes: Record<string, unknown> | null;
      espejo: Espejo;
      /** Algo que quien registró tiene que saber aunque todo haya salido bien. */
      aviso: string | null;
      pendiente: Pendiente | null;
      /** Solo cuando el reflejo cambió uno de los nueve números del negocio: cuál, en qué mes y qué decía antes ese mes (null: nada). */
      numero_vital?: NumeroVitalCambiado;
      /** Solo con espejo «intacto» sobre una cifra extraída sin revisar: lo registrado quedó al lado de esa cifra, como declarado. */
      declarado_al_lado?: true;
    };

export type NumeroVitalCambiado = { clave: string; nombre: string; periodo: string; antes: number | null };

export type OpcionesDeRegistro = {
  /** companies.zona_horaria tal como venga; vacía o desconocida cae a America/Lima. */
  zona?: unknown;
  hoy?: Date;
};

/** Lo que se le dice a quien registra cuando la base falla antes de escribir nada. El mensaje de la base no es para él. */
export const TEXTO_NO_SE_GUARDO = "No pudimos guardarlo y no quedó nada registrado. Inténtalo de nuevo.";

/** Lo que se le dice cuando el valor entró en la historia y lo demás no. Guardar otra vez lo completa: es una corrección con el mismo número. */
export const TEXTO_PENDIENTE: Record<Pendiente["que"], string> = {
  valor_actual: "El valor quedó en la historia del indicador, pero no pudimos dejarlo como su último valor. Guárdalo otra vez para terminar.",
  tus_numeros: "El valor quedó guardado en el indicador, pero no llegó a «Tus números». Guárdalo otra vez para que aparezca también ahí.",
};

/** Lo que se añade al aviso cuando lo registrado quedó junto a una cifra extraída sin revisar. No dice cuál es la buena. */
export const TEXTO_AL_LADO = " También quedó guardado junto a esa cifra, como lo declarado, para que se comparen las dos antes de dar una por buena.";

/** La zona horaria de la empresa. Si la columna no existe todavía o viene vacía, America/Lima. */
export async function zonaDeEmpresa(sb: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await sb.from("companies").select("zona_horaria").eq("id", companyId).maybeSingle();
  return zonaDe((data as { zona_horaria?: unknown } | null)?.zona_horaria);
}

/**
 * Lo que un valor registrado en un indicador puede reemplazar en `company_metricas`: lo que se contó de
 * memoria, un «no lo sé», o una fila sin rotular. Lo demás salió de un documento (verificado, extraído) o de
 * su revisión (descartado) y no lo pisa un número declarado (src/lib/metricas.ts, «CÓMO LLEGÓ UN NÚMERO»).
 */
const REEMPLAZABLE: ReadonlySet<string> = new Set(["", "contado", "sin_dato"]);

type Reflejo =
  | { espejo: "reflejado"; antes: number | null }
  /** `al_lado`: el número no se tocó, pero lo registrado quedó guardado junto a él como declarado. */
  | { espejo: "intacto"; estado: string; al_lado: boolean }
  | { espejo: "pendiente"; tecnico: string };

/** numeric de Postgres llega como texto; lo que no es un número (null, cadena vacía) no es cero. */
function numeroDe(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ¿Esa clave es uno de los nueve números del negocio? También si viene con uno de sus sinónimos (`ventas_mes`). */
function vitalDe(clave: string, periodo: string): Vital | null {
  return VITAL_POR_CLAVE.get(normalizarMetrica(clave, periodo).clave) ?? null;
}

async function reflejarEnNumeros(sb: SupabaseClient, kpi: Pick<Kpi, "company_id" | "clave">, periodo: string, valor: number, hoy: Date): Promise<Reflejo> {
  const donde = `${kpi.clave}/${periodo}`;
  // SIEMPRE EN SU PERIODO: se lee y se escribe la fila de este mes, ninguna otra.
  // Sin maybeSingle: esa tabla no tiene restricción única, y con dos filas para el mismo mes la lectura fallaría siempre.
  // La fila ENTERA: hace falta para no pisar lo conciliado y para conservar la cifra de documento que guardara al lado.
  // Si la clave es un sinónimo de uno de los nueve (`ventas_mes`), se mira también la canónica: un verificado guardado
  // como `venta_mes` es el mismo número.
  const canonica = normalizarMetrica(kpi.clave, periodo).clave;
  const lectura = sb.from("company_metricas").select("*").eq("company_id", kpi.company_id).eq("periodo", periodo);
  const { data, error: errorLectura } = await (canonica === kpi.clave ? lectura.eq("clave", kpi.clave) : lectura.in("clave", [kpi.clave, canonica]));
  if (errorLectura) return { espejo: "pendiente", tecnico: `company_metricas.select (${donde}): ${errorLectura.message}` };
  const filas = (data ?? []) as (MetricaGuardada & { id: string })[];
  const estadoDe = (f: MetricaGuardada): string => (f.estado ?? "").trim();
  // La fila del número es la de la clave canónica; la del sinónimo solo cuenta si no hay otra.
  const laDelNumero = <T extends MetricaGuardada>(candidatas: T[]): T | null => candidatas.find((f) => f.clave === canonica) ?? candidatas[0] ?? null;

  // Nunca se toca lo verificado, lo conciliado ni lo descartado en la revisión: ya pasó por una persona. Lo conciliado
  // SIN cifra (una lectura aceptada «sin dato») no es un valor: decir «ya tiene un dato verificado» sería falso.
  const firme = filas.find((f) => (f.origen === "conciliado" && numeroDe(f.valor) !== null) || (!REEMPLAZABLE.has(estadoDe(f)) && estadoDe(f) !== "extraido"));
  if (firme) return { espejo: "intacto", estado: REEMPLAZABLE.has(estadoDe(firme)) ? "verificado" : estadoDe(firme), al_lado: false };

  // UNA CIFRA EXTRAÍDA QUE NADIE REVISÓ: el número de la fila tampoco se reemplaza (lo decide el consultor con el
  // documento delante), pero lo registrado es la cifra DECLARADA de ese mismo número y de ese mismo mes. Se guarda al
  // lado, y solo eso: ni el valor, ni el estado, ni la fuente, ni la fecha de la cifra del documento cambian.
  const extraida = laDelNumero(filas.filter((f) => estadoDe(f) === "extraido"));
  if (extraida) {
    const { error } = await sb.from("company_metricas").update({ cifra_desplazada: declaradoAlLado(valor) }).eq("id", extraida.id);
    if (!error) return { espejo: "intacto", estado: "extraido", al_lado: true };
    if (!faltaUnaColumna(error)) return { espejo: "pendiente", tecnico: `company_metricas.update, cifra al lado (${donde}): ${error.message}` };
    // La base todavía no tiene la columna: el número extraído sigue intacto y el registrado está en la historia del
    // indicador. Lo que no existe en esa base es el par, y se dice.
    console.warn(
      `[numeros] ${donde}: lo registrado en el indicador no se pudo guardar al lado de la cifra extraída porque la base todavía no tiene la columna cifra_desplazada (falta aplicar supabase/migracion-cifra-desplazada.sql). Ese par no se podrá contrastar.`
    );
    return { espejo: "intacto", estado: "extraido", al_lado: false };
  }

  const previa = laDelNumero(filas);
  // Lo que se registra en un indicador es DECLARADO. El texto, la nota y la respuesta de entrevista que acompañaban
  // al número anterior hablaban de ESE número: no se dejan pegados al nuevo. La clave que se escribe es la canónica:
  // la fila de «Ventas del mes» se sigue llamando `venta_mes` aunque el indicador se llame `ventas_mes`.
  const fila = conCifraDesplazada(
    {
      company_id: kpi.company_id, clave: canonica, periodo, valor, estado: "contado", updated_at: hoy.toISOString(),
      ...(previa?.valor_texto ? { valor_texto: null } : {}),
      ...(previa?.nota ? { nota: null } : {}),
      ...(previa?.response_id ? { response_id: null } : {}),
      // La fila era una lectura aceptada «sin cifra»: con el número de quien registra deja de ser conciliada
      // y de ser «del documento». Dejarla conciliada rotularía como comprobado lo que alguien contó.
      ...(previa?.origen === "conciliado" ? { origen: "declarado", ...(previa.source_id ? { source_id: null } : {}) } : {}),
    },
    previa,
    "declarado"
  );
  const escritura = await escribirConservando(fila, (f) => (previa ? sb.from("company_metricas").update(f).eq("id", previa.id) : sb.from("company_metricas").insert(f)), donde);
  if (escritura.error) return { espejo: "pendiente", tecnico: `company_metricas.${previa ? "update" : "insert"} (${donde}): ${escritura.error.message}` };
  return { espejo: "reflejado", antes: previa ? numeroDe(previa.valor) : null };
}

/**
 * Lo que se le dice a quien registró un valor en un indicador cuya clave es uno de los nueve números del
 * negocio: ese número cambió en «Tus números» para ese mes, quedó como contado de memoria, y qué decía antes.
 */
function avisoDeNumeroVital(vital: Vital, periodo: string, valor: number, antes: number | null): string {
  const reemplazo = antes !== null && antes !== valor ? ` Antes decía ${formatoCifra(antes, vital.unidad)}.` : "";
  return `«${vital.nombre}» es uno de los nueve números del negocio: lo que registraste quedó también como ese número en ${nombreDePeriodoKpi(periodo)} de «Tus números», contado de memoria (no verificado).${reemplazo} Si es el mes más reciente, es el que toman los cortes.`;
}

export async function guardarValor(sb: SupabaseClient, kpi: Kpi, pedido: PedidoDeValor, quien: QuienRegistra, opciones: OpcionesDeRegistro = {}): Promise<ValorGuardado> {
  // Un indicador archivado no sigue recibiendo números: es ruido en la historia.
  if (kpi.estado === "archivado") return { ok: false, status: 400, motivo: "Ese indicador está archivado. Actívalo antes de registrarle un valor." };

  // Lo que registra la empresa es lo que la empresa declara. Conciliar o verificar es de la consultora.
  let estado_validacion: EstadoValidacionValor = pedido.estado_validacion ?? "declarado";
  if (quien.rol !== "consultor") {
    if (pedido.estado_validacion && pedido.estado_validacion !== "declarado") {
      return { ok: false, status: 403, motivo: "Lo que registra la empresa entra como declarado; conciliarlo o verificarlo lo hace la consultora con los documentos." };
    }
    estado_validacion = "declarado";
  }

  const hoy = opciones.hoy ?? new Date();
  const plan = registrarValor(kpi, { periodo: pedido.periodo, valor: pedido.valor, fuente: pedido.fuente, estado_validacion, nota: pedido.nota }, hoy, zonaDe(opciones.zona));
  if (!plan.ok) return { ok: false, status: 400, motivo: plan.motivo };
  const periodo = pedido.periodo.trim();
  const donde = `${kpi.clave}/${periodo}`;

  if (plan.sin_dato) {
    // Sin fila en la historia. Y si el hueco es de un periodo anterior al del valor actual, tampoco se toca el indicador.
    if (Object.keys(plan.actualizar).length > 0) {
      const { error } = await sb.from("indicadores").update(plan.actualizar).eq("id", kpi.id);
      if (error) return { ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: `indicadores.update, sin dato (${donde}): ${error.message}` };
    }
    return { ok: true, sin_dato: true, periodo, texto: plan.texto, es_periodo_anterior: plan.es_periodo_anterior };
  }

  // Un valor del mismo periodo es una corrección: se reemplaza, y quien llama deja el anterior en el rastro.
  const { data: previo, error: errorPrevio } = await sb
    .from("indicador_valores")
    .select("id,valor,fuente,estado_validacion,nota")
    .eq("indicador_id", kpi.id)
    .eq("periodo", plan.insertar.periodo)
    .maybeSingle();
  if (errorPrevio) return { ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: `indicador_valores.select (${donde}): ${errorPrevio.message}` };
  const fila = { ...plan.insertar, registrado_por: quien.id };
  const escritura = previo
    ? await sb.from("indicador_valores").update(fila).eq("id", (previo as { id: string }).id)
    : await sb.from("indicador_valores").insert(fila);
  if (escritura.error) return { ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: `indicador_valores.${previo ? "update" : "insert"} (${donde}): ${escritura.error.message}` };

  // DESDE AQUÍ EL VALOR YA ESTÁ EN LA HISTORIA. Lo que falle después no lo deshace: se devuelve como
  // `pendiente`, para que la ruta deje el rastro de lo guardado ANTES de decir que algo no terminó. Antes se
  // devolvía un fallo sin más, con el mensaje de la base, y el valor quedaba escrito sin rastro.
  const mensual = granularidad(periodo) === "mes";
  const guardado = {
    ok: true as const, sin_dato: false as const, periodo, valor: plan.insertar.valor, estado_validacion, texto: plan.texto,
    es_periodo_anterior: plan.es_periodo_anterior, corregido: !!previo, antes: (previo as Record<string, unknown> | null) ?? null,
  };

  if (Object.keys(plan.actualizar).length > 0) {
    const { error } = await sb.from("indicadores").update(plan.actualizar).eq("id", kpi.id);
    if (error) {
      return {
        ...guardado, espejo: mensual ? "pendiente" : "no_aplica", aviso: null,
        pendiente: { que: "valor_actual", motivo: TEXTO_PENDIENTE.valor_actual, tecnico: `indicadores.update (${donde}): ${error.message}` },
      };
    }
  }

  if (!mensual) return { ...guardado, espejo: "no_aplica", aviso: null, pendiente: null };

  const reflejo = await reflejarEnNumeros(sb, kpi, periodo, plan.insertar.valor, hoy);
  if (reflejo.espejo === "pendiente") {
    return { ...guardado, espejo: "pendiente", aviso: null, pendiente: { que: "tus_numeros", motivo: TEXTO_PENDIENTE.tus_numeros, tecnico: reflejo.tecnico } };
  }
  if (reflejo.espejo === "intacto") {
    return {
      ...guardado, espejo: "intacto", pendiente: null,
      aviso: `En «Tus números», ${nombreDePeriodoKpi(periodo)} ya tiene un dato que no se reemplaza desde aquí (${etiquetaEstado(reflejo.estado)}). Lo que registraste quedó en la historia del indicador.${reflejo.al_lado ? TEXTO_AL_LADO : ""}`,
      ...(reflejo.al_lado ? { declarado_al_lado: true as const } : {}),
    };
  }
  // Reflejado. Si la clave es uno de los nueve números del negocio, ese número cambió por este camino: se dice.
  const vital = vitalDe(kpi.clave, periodo);
  if (!vital) return { ...guardado, espejo: "reflejado", aviso: null, pendiente: null };
  return {
    ...guardado, espejo: "reflejado", pendiente: null,
    aviso: avisoDeNumeroVital(vital, periodo, plan.insertar.valor, reflejo.antes),
    numero_vital: { clave: vital.clave, nombre: vital.nombre, periodo, antes: reflejo.antes },
  };
}

/**
 * Lo que queda en el rastro por un valor registrado (o anotado sin dato). Las dos rutas dejan lo mismo, con
 * las mismas claves: así el rastro no depende de por dónde se entró. Si algo quedó pendiente, también lo dice.
 */
export function rastroDeValor(kpi: Pick<Kpi, "clave">, r: Extract<ValorGuardado, { ok: true }>): { accion: "crear" | "editar"; detalle: Record<string, unknown> } {
  if (r.sin_dato) {
    return { accion: "editar", detalle: { clave: kpi.clave, periodo: r.periodo, sin_dato: true, texto: r.texto, es_periodo_anterior: r.es_periodo_anterior } };
  }
  return {
    accion: r.corregido ? "editar" : "crear",
    detalle: {
      clave: kpi.clave, periodo: r.periodo, valor: r.valor, estado_validacion: r.estado_validacion, antes: r.antes,
      es_periodo_anterior: r.es_periodo_anterior, espejo: r.espejo, ...(r.pendiente ? { pendiente: r.pendiente.que } : {}),
      // Uno de los nueve números del negocio cambió por este camino: queda en el rastro cuál y qué decía antes.
      ...(r.numero_vital ? { numero_vital: r.numero_vital.clave, numero_vital_antes: r.numero_vital.antes } : {}),
      // El número de «Tus números» no cambió, pero lo registrado quedó al lado de la cifra del documento.
      ...(r.declarado_al_lado ? { declarado_al_lado: true } : {}),
    },
  };
}

/**
 * Deja escrito el motivo ANTES de archivar. El rastro normal (`registrar`) nunca falla en voz alta, y aquí
 * eso dejaría un indicador archivado sin motivo: si el motivo no queda escrito, quien llama no archiva.
 * `antes` y `despues` son el cambio completo (al menos el estado), para que el rastro tenga una sola fila.
 */
export async function dejarMotivoDeArchivo(
  sb: SupabaseClient,
  e: {
    companyId: string; indicadorId: string; clave: string; motivo: string; quien: QuienRegistra; ruta: string; ip: string | null;
    antes: Record<string, unknown>; despues: Record<string, unknown>;
  }
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { error } = await sb.from("audit_log").insert({
    company_id: e.companyId,
    actor_id: e.quien.id,
    actor_rol: e.quien.rol,
    accion: "editar",
    entidad: "indicador",
    entidad_id: e.indicadorId,
    detalle: { clave: e.clave, antes: e.antes, despues: e.despues, motivo: e.motivo.trim() },
    ruta: e.ruta,
    ip: e.ip,
  });
  return error ? { ok: false, motivo: "No pudimos guardar el motivo, así que el indicador no se archivó. Inténtalo de nuevo." } : { ok: true };
}

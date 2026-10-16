import { z } from "zod";
import { protegido, ok, fallo, exigirAcceso, leerValidado, uuid } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NOTA_CONSOLIDADA_EN_PARTE, NOTA_NUMERO_DESCARTADO, afirmacionYaDecidida, esLecturaEnParte, numeroYaDecidido, pasaPorRevision } from "@/lib/documentos/fidelidad";

type Ctx = { params: Promise<{ id: string }> };

/**
 * REVISAR LO QUE LEÍMOS ANTES DE QUE CUENTE (R10.2).
 *
 * Una fuente de documento o datos (PDF, Word, Excel, CSV) termina su extracción con `revision = pendiente`:
 * sus afirmaciones existen como `sin_verificar` y sus números como `extraido`. Esta ruta es el momento en
 * que el consultor dice qué va y qué no:
 *  - afirmación confirmada → `confirmado`, con quién y cuándo;
 *  - corregida → el texto nuevo queda confirmado y el original se conserva en `comprobacion_nota`;
 *  - descartada → `caducado` y `comprobacion = refutado` con el motivo: no se borra, se dice por qué no vale;
 *  - número aceptado → `verificado` y `origen = conciliado` (ESTE es el único camino a «verificado» para una cifra de documento);
 *    si la lectura no traía cifra (un «sin dato» leído del documento), aceptar confirma que no la hay: el estado
 *    sigue `sin_dato`, conciliado. Un número sin valor nunca se rotula «verificado»;
 *  - corregido → el valor nuevo, conciliado, y la cifra que decía el documento en la nota;
 *  - descartado → el valor se vacía y el estado queda `descartado`: así no entra en ningún cálculo ni en la radiografía.
 * La fuente queda `consolidada`, con quién la revisó y cuándo, SOLO cuando ya no queda nada sin decidir: ni una
 * afirmación abierta ni un número extraído sin decisión. «Abierta» es toda afirmación que nadie confirmó ni
 * descartó: `sin_verificar` y también `contradicho` (el contraste la marca así al terminar la lectura, y la
 * pantalla la pide igual). La regla es una sola y la comparten ruta y pantalla (fidelidad.ts · afirmacionYaDecidida,
 * numeroYaDecidido): si cada una contara a su manera, la ruta cerraría una fuente con filas que la pantalla
 * todavía muestra. Si el cuerpo trae un subconjunto, las decisiones que trae se aplican igual (el consultor puede
 * revisar por tandas), pero la respuesta dice `revision: "pendiente"` y `pendientes: n`, y la fuente sigue
 * pendiente, con su pantalla de revisión. Marcar consolidada una fuente con filas sin mirar sería decir que se
 * revisó lo que nadie revisó.
 *
 * Tandas: una fuente grande llega en varias llamadas. Todas menos la última traen `cerrar: false` («guarda esto,
 * pero no cierres todavía»): así la fuente no puede quedar consolidada a mitad de camino y dejar sin sitio las
 * decisiones que aún no llegaron. Solo la llamada que cierra (por defecto, cualquiera) puede consolidar.
 *
 * Lo ya decidido no se vuelve a decidir por aquí: si una tanda posterior (o una pestaña vieja) reenvía una fila
 * que ya se confirmó, corrigió o descartó, se salta y se cuenta en `ya_decididas`. Reaplicarla pisaría el rastro
 * («la lectura decía…» pasaría a citar el texto ya corregido) o resucitaría un número descartado como
 * «verificado» sin valor. Un cuerpo vacío solo se acepta cuando la fuente no tiene nada por decidir (la lectura
 * no encontró nada, o ya se decidió todo): entonces consolidar deja constancia de que se revisó.
 *
 * Solo se revisa una lectura TERMINADA. La ruta responde 409, sin escribir nada, si la lectura no terminó
 * (`estado` distinto de `leido`), si todavía tiene trabajos de extracción en cola o corriendo, o si la fuente no
 * está esperando revisión (`revision` distinto de `pendiente`). Sin esto, al reextraer un cuerpo vacío sellaba
 * como revisada una lectura en curso o cortada. Desde el cierre del 13-10-2026 la reextracción además saca la
 * fuente de revisión hasta que la nueva lectura termina (api/sources/[id]/extract).
 *
 * El 409 «no está esperando revisión» dice qué hacer SEGÚN LA FUENTE. A un documento o una tabla de datos se le
 * dice «vuelve a extraerla», porque al terminar de leerse queda pendiente. A una entrevista, una nota de voz, una
 * foto o una observación no: esas nunca pasan por esta pantalla, por más veces que se relean, y mandar a
 * reextraerlas era mandar a dar vueltas. Y a un archivo que no se pudo analizar se le repite por qué y qué hacer.
 *
 * UNA LECTURA EN PARTE NO SE CONSOLIDA CALLADA. Si un tramo de la fuente falló del todo, la fuente queda «leída»
 * con la nota «Se leyó en parte…» y se puede revisar lo que sí se leyó. Al consolidarla, la respuesta lo dice
 * (`lectura_en_parte`, `aviso`) y queda escrito en la nota de la fuente, con la fecha: se revisó media lectura, no
 * la fuente entera. Volver a extraerla retira esa nota y la deja otra vez pendiente.
 *
 * Una fuente ya consolidada no se reconsolida por esta ruta: responde 409 y dice quién la revisó. Si hay que
 * volver a mirarla, el camino es reextraerla (api/sources/[id]/extract), que archiva lo anterior y la deja
 * otra vez «pendiente». Así una revisión hecha no se pisa por un doble clic ni por una pestaña vieja.
 *
 * Tres preguntas, en orden: sesión de consultor (protegido), acceso a la empresa (exigirAcceso) y autoridad
 * para aprobar hallazgos (exigirAutoridad): consolidar evidencia compromete el diagnóstico tanto como aprobar un hallazgo.
 * Cada id se comprueba contra ESTA fuente: un id de otra fuente, aunque sea de la misma empresa, no se toca.
 * La pertenencia se comprueba leyendo las filas de la fuente (por páginas) y mirando en memoria, no con una
 * lista de ids en la consulta: cientos de UUID en la URL de PostgREST es lo que hace rebotar una fuente grande.
 */
const Cuerpo = z.object({
  claims: z
    .array(z.object({ id: uuid, accion: z.enum(["confirmar", "descartar", "corregir"]), texto: z.string().trim().max(2000).optional() }))
    .max(500)
    .default([]),
  metricas: z
    .array(z.object({ id: uuid, accion: z.enum(["aceptar", "corregir", "descartar"]), valor: z.number().finite().nullable().optional(), nota: z.string().trim().max(1000).optional() }))
    .max(500)
    .default([]),
  /** false = «guarda estas decisiones, pero no cierres la revisión»: lo mandan todas las tandas menos la última. */
  cerrar: z.boolean().default(true),
});

export type CuerpoConsolidar = z.infer<typeof Cuerpo>;

type Base = ReturnType<typeof supabaseAdmin>;
type FuentePorRevisar = { id: string; company_id: string; tipo?: string | null; estado: string | null; revision: string | null; fidelidad_extraccion?: string | null; fidelidad_nota?: string | null };
type ClaimPrevia = { id: string; texto?: string; estado: string | null };
type MetricaPrevia = { id: string; valor: number | null; nota: string | null; estado: string | null; origen: string | null };

const LECTURA_SIN_TERMINAR =
  "Esta fuente todavía no terminó de leerse: la lectura sigue en curso o se cortó. Espera a que termine o vuelve a extraerla; se revisa cuando está leída entera, para no dar por revisado lo que nadie leyó.";
const SIN_REVISION_PENDIENTE =
  "Esta fuente no está esperando revisión: aquí solo se revisan los documentos y datos que terminamos de leer. Si quieres revisarla, vuelve a extraerla.";

/** Cómo se le nombra al consultor cada clase de fuente que NO pasa por esta revisión. */
const CLASE_SIN_REVISION: Record<string, string> = { entrevista: "una entrevista", audio: "una nota de voz", foto: "una foto", observacion: "una observación" };

/**
 * Por qué esta fuente no espera revisión, y qué hacer, según lo que es. «Vuelve a extraerla» solo se le dice a la
 * que al releerse SÍ queda pendiente (un documento o una tabla de datos que sabemos leer).
 */
function motivoSinRevision(s: { tipo?: string | null; fidelidad_extraccion?: string | null; fidelidad_nota?: string | null }): string {
  if (s.fidelidad_extraccion === "no_analizado") {
    const porQue = (s.fidelidad_nota ?? "").trim() || "Súbelo de nuevo en un formato que sepamos leer: PDF con texto, Word (.docx), Excel (.xlsx), CSV o fotos.";
    return `Esta fuente no está esperando revisión: el archivo no se pudo analizar, así que no hay nada leído que revisar. Volver a leerlo tal como está dará el mismo resultado. ${porQue}`;
  }
  if (pasaPorRevision(s.tipo)) return SIN_REVISION_PENDIENTE;
  const clase = CLASE_SIN_REVISION[s.tipo ?? ""] ?? "una fuente que no es un documento ni una tabla de datos";
  return `Esta fuente no está esperando revisión: es ${clase} y no pasa por esta pantalla, tampoco después de volver a leerla. Sus afirmaciones se confirman o se descartan una por una en «Afirmaciones».`;
}

export const POST = protegido<Ctx>({ consultor: true, cupo: "escritura" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,tipo,estado,revision,revisada_at,fidelidad_extraccion,fidelidad_nota").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  await exigirAutoridad(perfil, "aprobar_hallazgo");
  if (s.revision === "consolidada") {
    const cuando = s.revisada_at ? ` el ${String(s.revisada_at).slice(0, 10)}` : "";
    return fallo(`Esta fuente ya fue revisada y consolidada${cuando}. Para revisarla de nuevo, vuelve a extraerla: lo anterior se archiva y queda otra vez pendiente.`, 409);
  }
  // Antes de leer una sola decisión: una lectura en curso o cortada no se revisa, ni entera ni por partes.
  const lectura = await lecturaSinTerminar(sb, s as FuentePorRevisar);
  if ("error" in lectura) return fallo(lectura.error, 500);
  if (lectura.motivo) return fallo(lectura.motivo, 409);

  const b = await leerValidado(req, Cuerpo);
  const sinDecisiones = !b.claims.length && !b.metricas.length;
  if (sinDecisiones && !b.cerrar) return fallo("No hay nada que guardar: la tanda no trae ninguna decisión.");
  if (b.claims.some((c) => c.accion === "corregir" && !c.texto)) return fallo("Para corregir una afirmación escribe cómo debe decir.");
  if (b.metricas.some((m) => m.accion === "corregir" && (m.valor === undefined || m.valor === null))) return fallo("Para corregir un número escribe el valor correcto.");
  // Una fila, una decisión: si la misma viene dos veces no se adivina cuál vale.
  if (new Set(b.claims.map((c) => c.id)).size !== b.claims.length || new Set(b.metricas.map((m) => m.id)).size !== b.metricas.length) return fallo("Una misma fila viene más de una vez: cada afirmación o número lleva una sola decisión.");

  const antes = await leerFilas(sb, id, s.company_id, true);
  if ("error" in antes) return fallo(antes.error, 500);
  // Sin decisiones solo se consolida lo que no tiene nada por decidir; si queda algo, hay que mirarlo.
  if (sinDecisiones && pendientesDe(antes) > 0) return fallo("No hay nada que consolidar: revisa al menos una afirmación o un número.");
  const claimPrevia = new Map(antes.claims.map((c) => [c.id, c]));
  const metricaPrevia = new Map(antes.metricas.map((m) => [m.id, m]));
  if (b.claims.some((c) => !claimPrevia.has(c.id))) return fallo("Alguna afirmación no pertenece a esta fuente.", 400);
  if (b.metricas.some((m) => !metricaPrevia.has(m.id))) return fallo("Algún número no pertenece a esta fuente.", 400);

  const ahora = new Date().toISOString();
  const cuenta = { claims: { confirmadas: 0, corregidas: 0, descartadas: 0 }, metricas: { aceptadas: 0, corregidas: 0, descartadas: 0 } };
  let yaDecididas = 0;
  const quien = { validado_por: perfil.id, validado_at: ahora };
  const conciliado = { origen: "conciliado", conciliado_por: perfil.id, conciliado_at: ahora, updated_at: ahora };
  // La misma decisión sobre muchas filas (lo normal: casi todo se confirma o se acepta) va en una escritura por
  // trozo, no en una por fila. Lo que lleva texto propio (una corrección, un motivo, la cifra que decía la lectura) va fila a fila.
  const confirmar: string[] = [];
  const descartarSinMotivo: string[] = [];
  const aceptarConCifra: string[] = [];
  const aceptarSinCifra: string[] = [];

  for (const c of b.claims) {
    const prev = claimPrevia.get(c.id);
    // Confirmada o descartada en una tanda anterior: esa decisión queda como está.
    if (afirmacionYaDecidida(prev?.estado)) {
      yaDecididas++;
      continue;
    }
    if (c.accion === "confirmar") {
      confirmar.push(c.id);
      cuenta.claims.confirmadas++;
      continue;
    }
    if (c.accion === "descartar" && !c.texto) {
      descartarSinMotivo.push(c.id);
      cuenta.claims.descartadas++;
      continue;
    }
    let cambios: Record<string, unknown>;
    if (c.accion === "corregir") {
      cambios = { texto: c.texto, estado: "confirmado", ...quien, comprobacion: "comprobado_por_consultor", comprobacion_nota: `Corregida al revisar la extracción. La lectura decía: «${prev?.texto ?? ""}».` };
      cuenta.claims.corregidas++;
    } else {
      cambios = { estado: "caducado", ...quien, comprobacion: "refutado", comprobacion_nota: `Descartada al revisar la extracción: ${c.texto}` };
      cuenta.claims.descartadas++;
    }
    const { error } = await sb.from("claims").update(cambios).eq("id", c.id).eq("source_id", id);
    if (error) return fallo(error.message, 500);
  }
  const eConfirmar = await escribirEnBloque(sb, "claims", id, confirmar, { estado: "confirmado", ...quien });
  if (eConfirmar) return fallo(eConfirmar, 500);
  const eDescartar = await escribirEnBloque(sb, "claims", id, descartarSinMotivo, { estado: "caducado", ...quien, comprobacion: "refutado", comprobacion_nota: "Descartada al revisar la extracción: no es una afirmación de la empresa o la lectura fue errónea." });
  if (eDescartar) return fallo(eDescartar, 500);

  for (const m of b.metricas) {
    const prev = metricaPrevia.get(m.id);
    // Aceptado, corregido o descartado en una tanda anterior: esa decisión queda como está.
    if (prev && numeroYaDecidido(prev)) {
      yaDecididas++;
      continue;
    }
    const sinCifra = prev?.valor === null || prev?.valor === undefined;
    if (m.accion === "aceptar") {
      // Aceptar una lectura sin cifra confirma que el documento no la trae: sigue «sin_dato», nunca «verificado».
      (sinCifra ? aceptarSinCifra : aceptarConCifra).push(m.id);
      cuenta.metricas.aceptadas++;
      continue;
    }
    const decia = sinCifra ? "(sin valor)" : String(prev?.valor);
    let cambios: Record<string, unknown>;
    if (m.accion === "corregir") {
      cambios = { valor: m.valor, estado: "verificado", ...conciliado, nota: `Corregido al revisar la extracción: la lectura decía ${decia}.${m.nota ? ` ${m.nota}` : ""}${prev?.nota ? ` | Antes: ${prev.nota}` : ""}` };
      cuenta.metricas.corregidas++;
    } else {
      // Sin valor y con estado propio: la radiografía y los cálculos solo miran valores, así que un
      // número descartado deja de contar sin borrar el rastro de que el documento lo traía.
      cambios = { valor: null, estado: "descartado", updated_at: ahora, nota: `${NOTA_NUMERO_DESCARTADO} (la lectura decía ${decia}).${m.nota ? ` ${m.nota}` : ""}${prev?.nota ? ` | Antes: ${prev.nota}` : ""}` };
      cuenta.metricas.descartadas++;
    }
    const { error } = await sb.from("company_metricas").update(cambios).eq("id", m.id).eq("source_id", id);
    if (error) return fallo(error.message, 500);
  }
  const eAceptar = await escribirEnBloque(sb, "company_metricas", id, aceptarConCifra, { estado: "verificado", ...conciliado });
  if (eAceptar) return fallo(eAceptar, 500);
  const eSinCifra = await escribirEnBloque(sb, "company_metricas", id, aceptarSinCifra, { estado: "sin_dato", ...conciliado });
  if (eSinCifra) return fallo(eSinCifra, 500);

  // ¿Queda algo sin decidir? Se mira en la base, no en el cuerpo: así cuenta también lo que otra pestaña
  // o una reextracción pudo añadir mientras el consultor revisaba.
  const despues = await leerFilas(sb, id, s.company_id, false);
  if ("error" in despues) return fallo(despues.error, 500);
  const pendientes = pendientesDe(despues);
  if (pendientes > 0 || !b.cerrar) return ok({ id, revision: "pendiente", pendientes, ya_decididas: yaDecididas, ...cuenta });

  // Justo antes de sellar se vuelve a mirar la lectura: si entre tanto alguien pidió reextraer, las filas de
  // antes ya no están y «no queda nada por decidir» sería verdad solo porque todavía no se leyó nada.
  const { data: s2 } = await sb.from("sources").select("id,company_id,tipo,estado,revision,fidelidad_extraccion,fidelidad_nota").eq("id", id).single();
  const alSellar = s2 ? await lecturaSinTerminar(sb, s2 as FuentePorRevisar) : { motivo: LECTURA_SIN_TERMINAR };
  if ("error" in alSellar) return fallo(alSellar.error, 500);
  if (alSellar.motivo) return fallo(`${alSellar.motivo} Las decisiones de esta tanda sí se guardaron.`, 409);

  // ¿Se está dando por revisada una lectura a la que le falta una parte? Se puede, pero no callado: queda escrito
  // en la nota de la fuente (con la fecha) y la respuesta lo dice, para que la pantalla lo repita al consolidar.
  const notaLectura = String((s2 as FuentePorRevisar | null)?.fidelidad_nota ?? "");
  const enParte = esLecturaEnParte(notaLectura);
  const constancia = `${NOTA_CONSOLIDADA_EN_PARTE} el ${ahora.slice(0, 10)}: se revisó lo que se leyó; lo que traía la parte que falló no se leyó ni se revisó.`;
  const notaAlSellar = enParte && !notaLectura.includes(NOTA_CONSOLIDADA_EN_PARTE) ? { fidelidad_nota: `${notaLectura.trim()} ${constancia}` } : {};

  const { error: eS } = await sb.from("sources").update({ revision: "consolidada", revisada_por: perfil.id, revisada_at: ahora, ...notaAlSellar }).eq("id", id).eq("revision", "pendiente");
  if (eS) return fallo(eS.message, 500);
  return ok({
    id,
    revision: "consolidada",
    pendientes: 0,
    ya_decididas: yaDecididas,
    ...cuenta,
    ...(enParte ? { lectura_en_parte: true, aviso: "Esta fuente se leyó en parte: quedó consolidado lo que se leyó, y así quedó anotado en la fuente. Para leer lo que falta, vuelve a extraerla." } : {}),
  });
});

/**
 * ¿Se puede revisar ya esta fuente? Devuelve el motivo, en palabras, si todavía no: su lectura no terminó, quedan
 * trabajos de extracción vivos (una reextracción recién pedida deja la fuente en «leido» hasta que el trabajo raíz
 * arranca: por eso se miran los trabajos y no solo el estado), o no está esperando revisión.
 * Los trabajos se miran ANTES que la revisión: una fuente que se está releyendo ya no espera revisión (la
 * reextracción la saca), y decirle «vuelve a extraerla» a quien acaba de pedirlo sería mandarlo a dar vueltas.
 * Un trabajo fallido no cuenta como vivo: no va a traer filas nuevas, y sigue a la vista en la lista de fallidos.
 */
async function lecturaSinTerminar(sb: Base, s: FuentePorRevisar): Promise<{ motivo: string | null } | { error: string }> {
  if (s.estado !== "leido") return { motivo: LECTURA_SIN_TERMINAR };
  const { data: vivos, error } = await sb.from("jobs").select("id").eq("company_id", s.company_id).eq("tipo", "extraer").in("estado", ["pendiente", "corriendo"]).contains("payload", { source_id: s.id }).limit(1);
  if (error) return { error: error.message };
  if ((vivos ?? []).length) return { motivo: LECTURA_SIN_TERMINAR };
  return { motivo: s.revision !== "pendiente" ? motivoSinRevision(s) : null };
}

/** Filas por página al leer una fuente entera. PostgREST corta las respuestas largas (1.000 filas por defecto): por eso se pagina y se cuenta. */
const FILAS_POR_PAGINA = 1000;

type Pagina = { data: unknown; error: { message: string } | null; count?: number | null };

/**
 * Lee TODAS las filas de una consulta, página a página. Se detiene cuando ya tiene las que la base dice que hay
 * (`count: "exact"`), no cuando una página llega corta: si el servidor recorta la página por su cuenta, una
 * lectura que se fiara del tamaño daría por leída media fuente, y media fuente sin pendientes es una consolidación falsa.
 */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<Pagina>): Promise<{ filas: T[] } | { error: string }> {
  const filas: T[] = [];
  for (;;) {
    const { data, error, count } = await pedir(filas.length, filas.length + FILAS_POR_PAGINA - 1);
    if (error) return { error: error.message };
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    const total = typeof count === "number" ? count : null;
    if (!pagina.length || (total !== null ? filas.length >= total : pagina.length < FILAS_POR_PAGINA)) return { filas };
  }
}

/** Las afirmaciones y los números de ESTA fuente, enteros. `conTexto` solo hace falta antes de escribir (para citar lo que decía la lectura). */
async function leerFilas(sb: Base, sourceId: string, companyId: string, conTexto: boolean): Promise<{ claims: ClaimPrevia[]; metricas: MetricaPrevia[] } | { error: string }> {
  const claims = await todas<ClaimPrevia>((desde, hasta) => sb.from("claims").select(conTexto ? "id,texto,estado" : "id,estado", { count: "exact" }).eq("source_id", sourceId).order("id").range(desde, hasta));
  if ("error" in claims) return claims;
  const metricas = await todas<MetricaPrevia>((desde, hasta) => sb.from("company_metricas").select("id,valor,nota,estado,origen", { count: "exact" }).eq("company_id", companyId).eq("source_id", sourceId).order("id").range(desde, hasta));
  if ("error" in metricas) return metricas;
  return { claims: claims.filas, metricas: metricas.filas };
}

/**
 * Cuántas filas de esta fuente siguen sin decisión: afirmaciones que nadie confirmó ni descartó (`sin_verificar`
 * y `contradicho`) y números con origen `extraido` que nadie aceptó, corrigió ni descartó. Un número decidido
 * deja de ser «extraido» (aceptado o corregido pasa a conciliado) o cambia de estado (descartado conserva el
 * origen). Es la misma regla que usa la pantalla (fidelidad.ts · afirmacionYaDecidida, numeroYaDecidido).
 */
function pendientesDe(f: { claims: ClaimPrevia[]; metricas: MetricaPrevia[] }): number {
  return f.claims.filter((c) => !afirmacionYaDecidida(c.estado)).length + f.metricas.filter((m) => m.origen === "extraido" && !numeroYaDecidido(m)).length;
}

/** Cuántos ids caben en una escritura: 50 UUID son unos 2 KB de URL, lejos del tope de cualquier pasarela. */
const IDS_POR_ESCRITURA = 50;

/** Aplica los mismos cambios a muchas filas de la fuente, por trozos. Devuelve el mensaje de error, o null si todo se escribió. */
async function escribirEnBloque(sb: Base, tabla: "claims" | "company_metricas", sourceId: string, ids: string[], cambios: Record<string, unknown>): Promise<string | null> {
  for (let i = 0; i < ids.length; i += IDS_POR_ESCRITURA) {
    const { error } = await sb.from(tabla).update(cambios).eq("source_id", sourceId).in("id", ids.slice(i, i + IDS_POR_ESCRITURA));
    if (error) return error.message;
  }
  return null;
}

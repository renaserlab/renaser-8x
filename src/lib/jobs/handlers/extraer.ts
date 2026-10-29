import { PDFDocument } from "pdf-lib";
import { normalizarMetrica } from "@/lib/metricas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { anotarFuentes } from "../contexto";
import { correrExtractor } from "@/lib/ai/agents/extractor";
import type { Adjunto, Segmento } from "@/lib/ai/provider";
import { registrarLlamada } from "@/lib/db/queries";
import { requiereValidacionPrioritaria } from "@/lib/rules/vigencia";
import { encolar, PRIORIDAD, progreso, claveIdempotente } from "../queue";
import { ai } from "@/lib/ai";
import { detectarYLeer, MIME_EXCEL, MIME_WORD, type Fidelidad } from "@/lib/documentos";
import { NOTA_CONSOLIDADA_EN_PARTE } from "@/lib/documentos/fidelidad";
import { excelComoTexto } from "@/lib/documentos/excel";
import { tituloDe, type Parrafo } from "@/lib/documentos/word";
import { conCifraDesplazada, escribirConservando, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";

const PALABRAS_POR_TRAMO = 8000;
const PAGINAS_POR_TRAMO = 15;
const FILAS_POR_TRAMO = 400;

export function trocear(texto: string, palabras = PALABRAS_POR_TRAMO): string[] {
  const w = texto.split(/\s+/);
  const tramos: string[] = [];
  for (let i = 0; i < w.length; i += palabras) tramos.push(w.slice(i, i + palabras).join(" "));
  return tramos.length ? tramos : [""];
}

/**
 * Un Word se trocea por párrafos enteros, nunca por mitad de una frase: cada tramo conserva sus
 * párrafos con índice y estilo, que es lo que permite citar «párrafo 14 · Vendedora — Carmen Huamán».
 */
export function trocearParrafos(parrafos: Parrafo[], palabras = PALABRAS_POR_TRAMO): Parrafo[][] {
  const tramos: Parrafo[][] = [];
  let actual: Parrafo[] = [];
  let cuenta = 0;
  for (const p of parrafos) {
    const n = p.texto.split(/\s+/).length;
    if (actual.length && cuenta + n > palabras) {
      tramos.push(actual);
      actual = [];
      cuenta = 0;
    }
    actual.push(p);
    cuenta += n;
  }
  if (actual.length) tramos.push(actual);
  return tramos.length ? tramos : [[]];
}

/** CSV → texto con número de fila y nombre de columna, para que el extractor cite "fila N, columna X". */
export function csvComoTexto(csv: string): { tramos: string[]; filas: number } {
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { tramos: [""], filas: 0 };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = lineas[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const filas = lineas.slice(1);
  const tramos: string[] = [];
  for (let i = 0; i < filas.length; i += FILAS_POR_TRAMO) {
    const bloque = filas.slice(i, i + FILAS_POR_TRAMO).map((l, j) => {
      const v = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      return `fila ${i + j + 2}: ` + cab.map((c, k) => `${c}=${v[k] ?? ""}`).join(" | ");
    });
    tramos.push(`columnas: ${cab.join(", ")}\n${bloque.join("\n")}`);
  }
  return { tramos: tramos.length ? tramos : [""], filas: filas.length };
}

/** Busca el segmento de audio donde aparece un fragmento (1.10). */
export function segmentoDe(fragmento: string | null | undefined, segmentos: Segmento[]): Segmento | null {
  if (!fragmento || !segmentos.length) return null;
  const f = fragmento.toLowerCase().slice(0, 40);
  return segmentos.find((s) => s.texto.toLowerCase().includes(f) || f.includes(s.texto.toLowerCase().slice(0, 25))) ?? null;
}

/**
 * De qué párrafo salió un fragmento y bajo qué título: «párrafo 14 · Vendedora — Carmen Huamán». Si el
 * fragmento no se encuentra literal (el modelo lo parafraseó), se devuelve lo que el modelo dijo de sección.
 */
export function seccionDeParrafo(fragmento: string | null | undefined, parrafos: Parrafo[], seccionModelo?: string | null): string | null {
  const f = (fragmento ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (f) {
    const aguja = f.slice(0, 60);
    const p = parrafos.find((x) => {
      const t = x.texto.toLowerCase().replace(/\s+/g, " ");
      return t.includes(aguja) || (aguja.length >= 25 && aguja.includes(t.slice(0, 40)));
    });
    if (p) {
      const titulo = tituloDe(parrafos, p.indice);
      return titulo && titulo.indice !== p.indice ? `párrafo ${p.indice} · ${titulo.texto}` : `párrafo ${p.indice}`;
    }
  }
  return seccionModelo ?? null;
}

/** «F3» → «Inventario!F3»; «Inventario!F3» se queda. Sin celda, nada. */
export function celdaConHoja(celda: string | null | undefined, hoja: string | null): string | null {
  const c = (celda ?? "").trim();
  if (!c) return null;
  if (!hoja || c.includes("!")) return c;
  return `${hoja}!${c}`;
}

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

type MetricaExtraida = { clave: string; periodo: string; valor: number | null; valor_texto?: string | null; estado: "contado" | "verificado" | "sin_dato"; nota?: string | null };

/**
 * De dónde nace un número: «declarado» lo dijo una persona (entrevista); «extraido» lo leyó el sistema
 * de un documento, foto, PDF, Word o Excel. «conciliado» solo lo pone el consultor al revisar
 * (api/sources/[id]/consolidar); «calculado», las fórmulas. Aquí nunca se escriben esos dos.
 */
export type OrigenMetrica = "declarado" | "extraido";

export type MetricaPrevia = { id: string; estado: string | null; origen?: string | null };

/**
 * Hasta el 13-10-2026 un número leído de un PDF nacía «verificado» sin que nadie lo hubiera conciliado
 * (minEstado "verificado"). Verificado significa que alguien lo comprobó; lo que sale de un documento
 * está EXTRAÍDO, y pasa a verificado cuando el consultor lo acepta al consolidar. Lo que una persona
 * dice en una entrevista sigue como hasta hoy: lo que el extractor diga, que casi siempre es «contado».
 */
export function estadoAlGuardar(estadoModelo: MetricaExtraida["estado"], origen: OrigenMetrica): string {
  if (estadoModelo === "sin_dato") return "sin_dato";
  if (origen === "extraido") return "extraido";
  return estadoModelo;
}

/**
 * ¿Puede este guardado pisar lo que ya hay? Un número conciliado por el consultor no lo toca ninguna
 * extracción: solo otra conciliación. Y un verificado no se degrada a contado ni a extraído.
 *
 * Conciliado quiere decir CON CIFRA. Una lectura que el consultor aceptó «sin cifra» queda «sin dato» y
 * conciliada: confirma que ESE documento no trae el número, no que el número esté resuelto. Si después
 * una persona lo declara u otro documento lo trae, esa cifra entra (declarada o extraída, pendiente
 * como cualquier otra); antes se descartaba sin aviso. Otro «sin dato» no cambia nada y no la toca.
 */
export function puedePisar(previa: MetricaPrevia | null, nueva: { estado: string; origen: OrigenMetrica }): boolean {
  if (!previa) return true;
  if (previa.origen === "conciliado") return previa.estado === "sin_dato" && nueva.estado !== "sin_dato";
  if (previa.estado === "verificado" && nueva.estado !== "verificado") return false;
  return true;
}

/**
 * Sistema Adaptativo v2: guarda los números en company_metricas (upsert por clave+periodo) con su origen.
 *
 * LO QUE DIJO EL DUEÑO Y LO QUE DICE SU EXCEL, LOS DOS (cierre Z1, 13-10-2026). La tabla guarda una fila
 * por clave y periodo, así que el número nuevo reemplaza al que había. Si el que había es del OTRO lado
 * (el documento reemplaza lo declarado, o al revés), no se pierde: se conserva en `cifra_desplazada`,
 * en la misma fila, y con eso el contraste puede poner las dos cifras al lado. Para eso la fila previa
 * se lee ENTERA. Si la base aún no tiene esa columna, el número se guarda igual y se avisa en consola.
 */
export async function guardarMetricas(sb: ReturnType<typeof supabaseAdmin>, companyId: string, metricas: MetricaExtraida[] | undefined, ref: { response_id?: string; source_id?: string; origen: OrigenMetrica }) {
  for (const m of metricas ?? []) {
    // NORMALIZACIÓN (30-08-2026): la IA inventaba una clave distinta cada vez para el mismo número
    // (`utilidad_mes`, `ganancia_neta_mes`, `ganancia_mes_western_union`), así que la radiografía
    // nunca se cerraba: Qori tenía 18 números y solo 3 de los nueve vitales. Aquí se lleva a la
    // clave canónica antes de guardar, y `venta_epoca_dorada` cae en venta_mes/epoca_dorada.
    const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
    const estado = estadoAlGuardar(m.estado, ref.origen);
    const { data: prev, error: ePrev } = await sb.from("company_metricas").select("*").eq("company_id", companyId).eq("clave", clave).eq("periodo", periodo).maybeSingle();
    sinSilencio(ePrev, `No se pudo leer el número ${clave}/${periodo}`);
    const previa = (prev as (MetricaGuardada & { id: string }) | null) ?? null;
    if (!puedePisar(previa as MetricaPrevia | null, { estado, origen: ref.origen })) continue;
    // `ref.origen` dice por dónde entra el número: «declarado» (entrevista) o «extraido» (lector de documentos).
    const fila = conCifraDesplazada(
      { company_id: companyId, clave, periodo, valor: m.valor, valor_texto: m.valor_texto ?? null, estado, origen: ref.origen, nota: m.nota ?? null, response_id: ref.response_id ?? null, source_id: ref.source_id ?? null, updated_at: new Date().toISOString() },
      previa,
      ref.origen
    );
    const { error: eGuardar } = await escribirConservando(fila, (f) => (previa ? sb.from("company_metricas").update(f).eq("id", previa.id) : sb.from("company_metricas").insert(f)), `${clave}/${periodo}`);
    sinSilencio(eGuardar, `No se pudo guardar el número ${clave}/${periodo}`);
  }
}

/**
 * LA PISTA SE SACA DEL ERROR, NO SE ADIVINA.
 *
 * Antes había una sola pista fija —«¿falta aplicar migracion-evidencia-dimensiones.sql?»— y costó diez
 * días: el 18-10 murieron cuatro extracciones, el mensaje acusó a esa migración, esa migración SÍ
 * estaba aplicada, y nadie siguió buscando. El culpable era otro: un check sobre `estado` que la base
 * de producción tenía y que ningún SQL del repositorio declaraba.
 *
 * Un error que acusa al inocente cuesta más que uno que no dice nada, porque manda a buscar al lugar
 * equivocado y con autoridad. Así que ahora la pista se lee del propio mensaje de Postgres: él sabe
 * qué restricción se quejó y dice su nombre.
 */
function pistaDe(mensaje: string): string {
  const violado = mensaje.match(/violates check constraint "([^"]+)"/i)?.[1];
  if (violado) {
    return `la base rechazó el valor por la restricción «${violado}». Búscala por ese nombre: si no está en supabase/, es un candado que vive solo en producción y hay que escribirle su migración`;
  }
  // Las tres formas en que Postgres y PostgREST dicen lo mismo. La primera —«column "x" does not
  // exist»— es la más común y era justamente la que no se reconocía.
  const columna =
    mensaje.match(/column "([^"]+)" does not exist/i)?.[1] ??
    mensaje.match(/column "([^"]+)" of relation/i)?.[1] ??
    mensaje.match(/could not find the '([^']+)' column/i)?.[1];
  if (columna) {
    return `falta una columna, «${columna}»: revisa qué migración de supabase/ la crea y si está aplicada`;
  }
  return "revisa en supabase/orden-aplicacion.json qué migración falta por aplicar";
}

/**
 * Las escrituras que usan columnas nuevas (origen, fidelidad_*, revision) no pueden fallar en silencio: si
 * la migración no está aplicada, el trabajo falla con la causa escrita y se ve en la tabla de fallidos,
 * en vez de dejar la fuente «leyendo» para siempre o perder un número sin que nadie lo note.
 */
function sinSilencio(error: { message: string } | null, que: string): void {
  if (error) throw new Error(`${que} — ${pistaDe(error.message)}: ${error.message}`);
}

/**
 * ¿De dónde se lee la fuente esta vez: del archivo o del `contenido` ya guardado?
 *
 * Un Word o un Excel se relee SIEMPRE del archivo. Su `contenido` es solo el texto plano que se guardó para
 * buscar y mostrar; no trae los párrafos con índice y título ni la hoja y la celda. Si al reextraer se
 * troceara ese texto plano, la segunda lectura citaría peor que la primera («sin ubicación» en vez de
 * «párrafo 14 · Vendedora — Carmen Huamán» o «Inventario!F3») y la fidelidad no se recalcularía. Lo demás
 * (audio ya transcrito, texto pegado, CSV) sigue reutilizando el contenido: ahí no se pierde nada.
 */
export function releerDelArchivo(mime: string, contenido: string | null | undefined, storagePath: string | null | undefined): boolean {
  if (!storagePath) return false;
  if (mime === MIME_WORD || mime === MIME_EXCEL) return true;
  return !contenido;
}

/**
 * UNA FUENTE LEÍDA EN PARTE LO DICE. Cuando el último tramo termina, la fuente pasa a «leído»; si otro
 * tramo falló del todo (agotó sus intentos), lo que traía no está en la lectura. Antes eso no quedaba
 * escrito en ninguna parte y el consultor revisaba media fuente creyéndola entera. Aquí sale lo que se
 * anota en `fidelidad_extraccion` y `fidelidad_nota`; null si no falló ninguno. `tramosCaidos` son los
 * índices de tramo tal como van en el trabajo (desde 0); al consultor se le dicen desde 1. La nota que la
 * fuente ya tenía (avisos del Word, celdas vacías del Excel) se conserva detrás, también cuando la fuente
 * ya estaba marcada en parte y se vuelve a marcar con otros tramos.
 */
export function lecturaEnParte(tramosCaidos: number[], total: number, notaPrevia?: string | null): { fidelidad_extraccion: Fidelidad; fidelidad_nota: string } | null {
  const caidos = [...new Set(tramosCaidos.filter((i) => Number.isInteger(i) && i >= 0))].sort((a, b) => a - b).map((i) => i + 1);
  if (!caidos.length) return null;
  const cuales = caidos.length === 1 ? `falló el tramo ${caidos[0]}` : `fallaron los tramos ${caidos.slice(0, -1).join(", ")} y ${caidos[caidos.length - 1]}`;
  const aviso = `${LEIDA_EN_PARTE}: ${cuales} de ${total}. Lo que traía esa parte no está en la lectura: ${FIN_DEL_AVISO}`;
  const previa = notaDetrasDelAviso(notaPrevia);
  return { fidelidad_extraccion: "baja", fidelidad_nota: previa ? `${aviso} ${previa}` : aviso };
}

/** Así empieza la nota de una fuente leída en parte. Por aquí se reconoce para retirarla cuando una relectura sale entera. */
const LEIDA_EN_PARTE = "Se leyó en parte";
/** Así termina siempre el aviso de lectura en parte: lo que venga detrás es la nota que la fuente ya tenía. */
const FIN_DEL_AVISO = "vuelve a extraer la fuente antes de darla por revisada.";

/**
 * Lo que la nota de una fuente decía ANTES del aviso de lectura en parte: los avisos propios del Word, del
 * Excel o del PDF. Una nota sin ese aviso se devuelve tal cual. La constancia que deja la consolidación
 * («Consolidada con la lectura en parte el …») no se arrastra: hablaba de una lectura que ya cambió.
 */
export function notaDetrasDelAviso(nota: string | null | undefined): string {
  const texto = (nota ?? "").trim();
  if (!texto.startsWith(LEIDA_EN_PARTE)) return texto;
  const fin = texto.indexOf(FIN_DEL_AVISO);
  const detras = fin < 0 ? "" : texto.slice(fin + FIN_DEL_AVISO.length);
  const constancia = detras.indexOf(NOTA_CONSOLIDADA_EN_PARTE);
  return (constancia < 0 ? detras : detras.slice(0, constancia)).trim();
}

/** Un trabajo de extracción de un tramo: qué tramo era y cuándo se creó. */
export type TrabajoDeTramo = { tramo: number; creado?: string | null };

/**
 * QUÉ TRAMOS FALTAN DE VERDAD EN LA LECTURA. Un tramo cuyo trabajo falló falta, salvo que se haya vuelto a
 * intentar y haya salido bien. Reencolar (`reencolarSeguro`, src/lib/jobs/queue.ts) NO borra el trabajo que
 * falló: lo deja como constancia y crea otro. Hasta el 13-10-2026 aquí se contaba todo trabajo fallido de la
 * fuente, así que una fuente cuyo tramo caído se releyó con éxito seguía diciendo «Se leyó en parte… vuelve
 * a extraer», con fidelidad baja: falso, y pedía rehacer un trabajo ya hecho.
 *
 * `fallidos`: los trabajos de tramo que fallaron. `releidos`: los que terminaron bien. `tramoActual`: el que
 * está terminando ahora mismo, que por eso ya está leído. Un fallo queda cubierto solo por un trabajo bueno
 * del MISMO tramo y POSTERIOR a él. Si no se sabe cuál fue antes (falta la fecha de alguno), no lo cubre:
 * ante la duda la fuente sigue «en parte», que es lo que no esconde nada.
 */
export function tramosSinLeer(fallidos: TrabajoDeTramo[], releidos: TrabajoDeTramo[], tramoActual: number): number[] {
  const cuando = (t: TrabajoDeTramo): number => (t.creado ? Date.parse(t.creado) : NaN);
  const faltan = new Set<number>();
  for (const f of fallidos) {
    if (!Number.isInteger(f.tramo) || f.tramo < 0 || f.tramo === tramoActual) continue;
    if (!releidos.some((r) => r.tramo === f.tramo && cuando(r) > cuando(f))) faltan.add(f.tramo);
  }
  return [...faltan].sort((a, b) => a - b);
}

const NIVELES: readonly string[] = ["alta", "media", "baja", "no_analizado"];

/**
 * UNA LECTURA QUE YA ESTÁ ENTERA DEJA DE DECIR «EN PARTE». Se retira el aviso y vuelve lo que la fuente decía
 * antes de él: la nota propia del Word, del Excel o del PDF (sus celdas vacías, sus avisos) y su nivel de
 * fidelidad, que el trabajo que la marcó «en parte» dejó escrito en su resultado (`fidelidad_anterior`).
 * Texto, audio y fotos no llevan fidelidad propia: quedan sin nota y sin nivel, como antes de fallar.
 * Si el nivel anterior no consta, no se inventa: queda sin nivel y con su nota.
 */
export function lecturaYaEntera(nota: string | null | undefined, nivelAnterior: unknown): { fidelidad_extraccion: Fidelidad | null; fidelidad_nota: string | null } {
  const detras = notaDetrasDelAviso(nota);
  const nivel = typeof nivelAnterior === "string" && NIVELES.includes(nivelAnterior) ? (nivelAnterior as Fidelidad) : null;
  return { fidelidad_extraccion: detras ? nivel : null, fidelidad_nota: detras || null };
}

/** Las fuentes que el consultor revisa antes de que cuenten (R10.2). Entrevistas, audio y observaciones no pasan por ahí. */
export function requiereRevision(tipo: string | null | undefined): boolean {
  return tipo === "documento" || tipo === "dato";
}

/**
 * payload: { source_id } → lee la fuente, la trocea (texto, CSV, Word por párrafos, Excel por hoja, PDF por páginas) y crea un job por tramo.
 * payload: { source_id, chunk_index, total, texto? | parrafos? | hoja? | pdf_desde?, pdf_hasta? | adjunto? } → extrae ese tramo.
 * payload: { response_id } → extrae afirmaciones de una respuesta de entrevista.
 */
export async function handleExtraer(job: Job) {
  const sb = supabaseAdmin();
  const p = job.payload;
  if (p.response_id) return extraerDeRespuesta(job, String(p.response_id));

  const sourceId = String(p.source_id);
  // Procedencia: esta ejecucion leyo ESTA fuente. Referencia y version, nunca una copia.
  void anotarFuentes([sourceId]);
  const { data: src, error } = await sb.from("sources").select("*").eq("id", sourceId).single();
  if (error || !src) throw new Error("Fuente no encontrada");
  const mime = ((src.mime as string | null) ?? "").split(";")[0].trim().toLowerCase();
  const esImagen = mime.startsWith("image/");
  const esTextoPlano = mime.startsWith("text/") || mime.includes("csv") || (src.tipo === "dato" && mime !== MIME_EXCEL && !mime.startsWith("application/"));

  // --- Fase 1: preparar y trocear ---
  if (p.chunk_index === undefined) {
    await sb.from("sources").update({ estado: "leyendo", error: null }).eq("id", sourceId);
    let texto = src.contenido as string | null;
    let segmentos: Segmento[] = [];
    let tramos: string[] | null = null;
    let tramosWord: Parrafo[][] | null = null;
    let tramosExcel: { hoja: string; texto: string }[] | null = null;
    let pdfPaginas = 0;

    if (releerDelArchivo(mime, texto, src.storage_path as string | null)) {
      const { data: blob, error: e2 } = await sb.storage.from("fuentes").download(src.storage_path);
      if (e2 || !blob) throw new Error("No pudimos descargar el archivo de la fuente");
      if (src.tipo === "audio") {
        await progreso(job.id, "Escuchando la nota de voz");
        const t = await ai().transcribe(blob, mime || "audio/webm");
        texto = t.texto;
        segmentos = t.segmentos;
        await sb.from("sources").update({ contenido: texto }).eq("id", sourceId);
      } else if (esTextoPlano) {
        const crudo = await blob.text();
        await sb.from("sources").update({ contenido: crudo }).eq("id", sourceId);
        if (src.tipo === "dato" || mime.includes("csv")) {
          const c = csvComoTexto(crudo);
          tramos = c.tramos;
        } else texto = crudo;
      } else if (!esImagen) {
        // Word, Excel, PDF o algo que no sabemos leer: una sola puerta decide qué es y con qué fidelidad.
        const lectura = await detectarYLeer(mime, Buffer.from(await blob.arrayBuffer()));
        const fidelidad: { fidelidad_extraccion: Fidelidad; fidelidad_nota: string } = { fidelidad_extraccion: lectura.fidelidad, fidelidad_nota: lectura.nota };
        if (lectura.clase === "no_analizado") {
          // Se conserva el archivo, la fuente queda leída con cero afirmaciones y la limitación escrita.
          // Nada de «leyendo» eterno ni de error: es un resultado, y el consultor ve qué hacer.
          const { error: eNo } = await sb.from("sources").update({ estado: "leido", error: null, ...fidelidad }).eq("id", sourceId);
          sinSilencio(eNo, "No se pudo registrar que la fuente no se analizó");
          await progreso(job.id, `No analizamos ${src.nombre}: ${lectura.nota}`);
          // El detalle técnico (mensaje crudo de la librería) va al resultado del trabajo, no a la pantalla.
          return { tramos: 0, fidelidad: lectura.fidelidad, nota: lectura.nota, detalle_tecnico: lectura.detalle ?? null };
        }
        let eFid: { message: string } | null = null;
        // Al releer un Word o un Excel, el texto plano anterior no debe colarse como tramo: se parte de cero.
        texto = null;
        if (lectura.clase === "word") {
          ({ error: eFid } = await sb.from("sources").update({ contenido: lectura.word.texto, ...fidelidad }).eq("id", sourceId));
          tramosWord = trocearParrafos(lectura.word.parrafos);
        } else if (lectura.clase === "excel") {
          const t = excelComoTexto(lectura.excel.hojas, FILAS_POR_TRAMO);
          ({ error: eFid } = await sb.from("sources").update({ contenido: t.tramos.map((x) => x.texto).join("\n\n"), ...fidelidad }).eq("id", sourceId));
          tramosExcel = t.tramos.map((x) => ({ hoja: x.hoja, texto: x.texto }));
        } else {
          ({ error: eFid } = await sb.from("sources").update(fidelidad).eq("id", sourceId));
          pdfPaginas = lectura.paginas;
        }
        sinSilencio(eFid, "No se pudo guardar la fidelidad de la lectura");
      }
    }

    if (!tramos && !tramosWord && !tramosExcel && texto) tramos = trocear(texto);
    let n = 0;
    const encolarTramo = (i: number, total: number, extra: Record<string, unknown>) =>
      encolar({ company_id: job.company_id, tipo: "extraer", payload: { source_id: sourceId, chunk_index: i, total, ...extra }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", sourceId, i]) });
    if (tramos) {
      for (let i = 0; i < tramos.length; i++) await encolarTramo(i, tramos.length, { texto: tramos[i], segmentos: segmentos.length ? segmentos : undefined });
      n = tramos.length;
    } else if (tramosWord) {
      for (let i = 0; i < tramosWord.length; i++) await encolarTramo(i, tramosWord.length, { parrafos: tramosWord[i] });
      n = tramosWord.length;
    } else if (tramosExcel) {
      for (let i = 0; i < tramosExcel.length; i++) await encolarTramo(i, tramosExcel.length, { texto: tramosExcel[i].texto, hoja: tramosExcel[i].hoja });
      n = tramosExcel.length;
    } else if (pdfPaginas > 0) {
      const total = Math.ceil(pdfPaginas / PAGINAS_POR_TRAMO);
      for (let i = 0; i < total; i++) await encolarTramo(i, total, { pdf_desde: i * PAGINAS_POR_TRAMO, pdf_hasta: Math.min(pdfPaginas, (i + 1) * PAGINAS_POR_TRAMO) });
      n = total;
    } else {
      // imagen u otro adjunto: una sola llamada
      await encolarTramo(0, 1, { adjunto: true });
      n = 1;
    }
    await progreso(job.id, `Leyendo ${src.nombre}: ${n} tramo(s)`);
    return { tramos: n };
  }

  // --- Fase 2: extraer un tramo ---
  const idx = Number(p.chunk_index), total = Number(p.total ?? 1);
  await progreso(job.id, `Leyendo ${src.nombre} — tramo ${idx + 1} de ${total}`);

  let adjuntos: Adjunto[] | undefined;
  let paginaBase = 0;
  if ((p.adjunto || p.pdf_desde !== undefined) && src.storage_path) {
    const { data: blob } = await sb.storage.from("fuentes").download(src.storage_path);
    if (!blob) throw new Error("No pudimos descargar el archivo");
    const bytes = await blob.arrayBuffer();
    if (mime === "application/pdf") {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const desde = Number(p.pdf_desde ?? 0), hasta = Number(p.pdf_hasta ?? doc.getPageCount());
      paginaBase = desde;
      const parte = await PDFDocument.create();
      const idxs = Array.from({ length: hasta - desde }, (_, i) => desde + i);
      const paginas = await parte.copyPages(doc, idxs);
      paginas.forEach((pg) => parte.addPage(pg));
      adjuntos = [{ tipo: "pdf", base64: Buffer.from(await parte.save()).toString("base64") }];
    } else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
      adjuntos = [{ tipo: "imagen", mime: mime as "image/jpeg", base64: Buffer.from(bytes).toString("base64") }];
    } else throw new Error(`No pudimos leer ese archivo (${mime || "tipo desconocido"}). Súbelo como PDF, Word (.docx), Excel (.xlsx), foto o texto.`);
  }

  // Un tramo de Word trae sus párrafos (con índice y estilo); uno de Excel, el texto de una hoja.
  const parrafos = Array.isArray(p.parrafos) ? (p.parrafos as Parrafo[]) : null;
  const hoja = p.hoja ? String(p.hoja) : null;
  const textoTramo = p.texto ? String(p.texto) : parrafos ? parrafos.map((x) => x.texto).join("\n") : undefined;

  const fechaDoc = src.fecha_origen ? `Fecha del documento: ${src.fecha_origen}.` : "El documento no indica fecha.";
  const pistaFormato = parrafos
    ? ` Es un Word leído por párrafos (${mime === MIME_WORD ? "docx" : "documento"}); si una sección tiene título, ponlo en "seccion".`
    : hoja
      ? ` Es la hoja «${hoja}» de un Excel: en "celda" cita hoja y celda tal como aparecen delante de cada valor (por ejemplo ${hoja}!F3). Una celda «(vacío)» no tiene dato: no la rellenes, no la estimes y no la cuentes como cero.`
      : "";
  const contexto = `Fuente: "${src.nombre}" (tipo: ${src.tipo}). ${fechaDoc} Tramo ${idx + 1} de ${total}.${paginaBase ? ` Reporta la página tal como la ves dentro de este tramo (1 = primera página del tramo); el sistema la convierte a la página del documento original.` : ""}${pistaFormato}`;
  const r = await correrExtractor({ texto: textoTramo, adjuntos, contexto });
  await registrarLlamada(job.company_id, job.id, "extractor", r);

  const segmentos = (p.segmentos as Segmento[] | undefined) ?? [];
  let nuevas = 0;
  for (let i = 0; i < r.data.afirmaciones.length; i++) {
    const a = r.data.afirmaciones[i];
    const seg = segmentoDe(a.fragmento, segmentos);
    // Trazabilidad por formato: Word → párrafo y título; Excel → hoja y celda; PDF → página; CSV → lo que dijo el modelo.
    const seccion = parrafos ? seccionDeParrafo(a.fragmento, parrafos, a.seccion) : hoja ? hoja : (a.seccion ?? null);
    const celda = hoja ? celdaConHoja(a.celda, hoja) : (a.celda ?? null);
    let fragmentId: string | null = null;
    if (a.fragmento || a.pagina || seccion || celda || seg) {
      const { data: fr } = await sb
        .from("source_fragments")
        .insert({ source_id: sourceId, pagina: a.pagina != null ? a.pagina + paginaBase : null, seccion, celda, audio_desde: seg?.desde ?? null, audio_hasta: seg?.hasta ?? null, texto: a.fragmento ?? null })
        .select("id")
        .single();
      fragmentId = fr?.id ?? null;
    }
    const fecha = a.fecha_afirmacion ?? (src.fecha_origen as string | null) ?? null;
    const prioridad = requiereValidacionPrioritaria({ id: "", tipo: a.tipo, temporalidad: a.temporalidad, estado: "sin_verificar", fecha_afirmacion: fecha, source_tipo: src.tipo });
    // P1-10: un reintento del mismo tramo no duplica (índice único parcial sobre idempotency_key).
    const { error: e3 } = await sb.from("claims").insert({
      company_id: job.company_id,
      source_id: sourceId,
      fragment_id: fragmentId,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.posible_instruccion ? "otro" : a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: fecha,
      prioridad_validacion: prioridad,
      idempotency_key: claveIdempotente(["claim", sourceId, idx, i, a.texto.slice(0, 80)]),
    });
    if (!e3) nuevas++;
    else if (e3.code !== "23505") throw e3;
  }

  // Lo que sale de un documento nace EXTRAÍDO, nunca verificado: lo verifica el consultor al consolidar.
  await guardarMetricas(sb, job.company_id, r.data.metricas, { source_id: sourceId, origen: "extraido" });

  // ¿Terminaron todos los tramos? → fuente leída + contraste en continuo (clave idempotente por fuente)
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("tipo", "extraer").in("estado", ["pendiente", "corriendo"]).neq("id", job.id).contains("payload", { source_id: sourceId });
  let parcial: ReturnType<typeof lecturaEnParte> = null;
  /** El nivel que la fuente tenía antes de marcarla «en parte»: queda en el resultado de este trabajo para poder devolvérselo. */
  let nivelAntes: { fidelidad_anterior: string | null } | null = null;
  let seRetiroElAviso = false;
  if (!count) {
    const sinComprobar = (e: { message: string }) => new Error(`No se pudo comprobar si algún tramo de la fuente falló, así que no se marca como leída: ${e.message}`);
    // ¿Algún tramo de esta lectura falló del todo? Entonces la fuente se leyó en parte, y se dice en la fuente.
    const { data: caidos, error: eCaidos } = await sb.from("jobs").select("payload,created_at").eq("company_id", job.company_id).eq("tipo", "extraer").eq("estado", "fallido").contains("payload", { source_id: sourceId });
    if (eCaidos) throw sinComprobar(eCaidos);
    const fallidos: TrabajoDeTramo[] = (caidos ?? []).map((j) => ({ tramo: Number((j.payload as { chunk_index?: unknown } | null)?.chunk_index ?? NaN), creado: (j as { created_at?: string | null }).created_at ?? null }));
    // Un tramo que falló pudo releerse después (reencolar deja el trabajo fallido donde estaba y crea otro): se
    // busca, tramo por tramo y sin traer otra vez su texto, si hay un trabajo bueno de ese mismo tramo.
    const releidos: TrabajoDeTramo[] = [];
    for (const tramo of new Set(fallidos.map((f) => f.tramo).filter((t) => Number.isInteger(t) && t >= 0 && t !== idx))) {
      const { data: buenos, error: eBuenos } = await sb.from("jobs").select("created_at").eq("company_id", job.company_id).eq("tipo", "extraer").eq("estado", "hecho").contains("payload", { source_id: sourceId, chunk_index: tramo });
      if (eBuenos) throw sinComprobar(eBuenos);
      for (const b of buenos ?? []) releidos.push({ tramo, creado: (b as { created_at?: string | null }).created_at ?? null });
    }
    const notaActual = src.fidelidad_nota as string | null;
    const yaEnParte = String(notaActual ?? "").startsWith(LEIDA_EN_PARTE);
    parcial = lecturaEnParte(tramosSinLeer(fallidos, releidos, idx), total, notaActual);
    if (parcial && !yaEnParte) nivelAntes = { fidelidad_anterior: (src.fidelidad_extraccion as string | null) ?? null };
    // Una lectura que sale entera retira el aviso de la anterior: una relectura completa (el texto, el audio y las
    // fotos no llevan fidelidad propia, y sin esto el «se leyó en parte» se quedaría para siempre) o el tramo caído
    // que se reencoló y ahora sí se leyó. En el segundo caso Word, Excel y PDF recuperan la nota y el nivel que tenían.
    let yaEntera: Partial<ReturnType<typeof lecturaYaEntera>> = {};
    if (!parcial && yaEnParte) {
      const { data: hechos, error: eHechos } = await sb.from("jobs").select("resultado,created_at").eq("company_id", job.company_id).eq("tipo", "extraer").eq("estado", "hecho").contains("payload", { source_id: sourceId });
      if (eHechos) throw sinComprobar(eHechos);
      const conNivel = ((hechos ?? []) as { resultado?: unknown; created_at?: string | null }[])
        .filter((h) => !!h.resultado && typeof h.resultado === "object" && "fidelidad_anterior" in (h.resultado as object))
        .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
      yaEntera = lecturaYaEntera(notaActual, (conNivel[0]?.resultado as { fidelidad_anterior?: unknown } | undefined)?.fidelidad_anterior);
      seRetiroElAviso = true;
    }
    // Documentos y datos esperan la revisión del consultor (R10.2): sus afirmaciones existen como
    // sin_verificar y la fuente queda «pendiente» hasta que alguien consolide. Entrevistas y audio, como siempre.
    const { error: eFin } = await sb.from("sources").update({ estado: "leido", ...(requiereRevision(src.tipo as string | null) ? { revision: "pendiente" } : {}), ...(parcial ?? yaEntera) }).eq("id", sourceId);
    sinSilencio(eFin, "No se pudo marcar la fuente como leída y pendiente de revisión");
    await encolar({ company_id: job.company_id, tipo: "contrastar", payload: { source_id: sourceId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", sourceId]) });
  }
  const cierre = parcial ? `. ${parcial.fidelidad_nota}` : seRetiroElAviso ? ". La lectura quedó entera: se retiró el aviso de que se había leído en parte." : "";
  await progreso(job.id, `Encontramos ${nuevas} definiciones en el tramo ${idx + 1} de ${total}${cierre}`);
  return { nuevas, ...(parcial ? { lectura_en_parte: parcial.fidelidad_nota, ...(nivelAntes ?? {}) } : {}), ...(seRetiroElAviso ? { lectura_completada: true } : {}) };
}

async function extraerDeRespuesta(job: Job, responseId: string) {
  const sb = supabaseAdmin();
  const { data: r } = await sb.from("interview_responses").select("*, interview_sessions(id,company_id,participant_id,tipo,participants(nombre,puesto,rol))").eq("id", responseId).single();
  if (!r || !r.respuesta) return { nuevas: 0 };
  // «NO LO SÉ» NO ES UN DATO: una respuesta marcada con certeza no_lo_se no va al extractor. De ahí no
  // sale ninguna afirmación ni ningún número, ni un cero: el modelo, puesto a leer «No lo sé», a veces
  // devuelve uno. Se dice en el resultado del trabajo por qué no se extrajo.
  if (r.certeza === "no_lo_se") return { nuevas: 0, sin_extraer: "La respuesta es «no lo sé»: no se manda al extractor ni produce ningún número." };
  const ses = r.interview_sessions as { id: string; company_id: string; participant_id: string; tipo: string; participants: { nombre: string; puesto: string | null; rol: string | null } };

  const nombreFuente = `Entrevista · ${ses.participants?.puesto ?? ses.participants?.rol ?? "participante"} · ${ses.id.slice(0, 8)}`;
  let { data: src } = await sb.from("sources").select("id").eq("company_id", ses.company_id).eq("tipo", "entrevista").eq("nombre", nombreFuente).maybeSingle();
  if (!src) {
    const { data: s2 } = await sb.from("sources").insert({ company_id: ses.company_id, tipo: "entrevista", nombre: nombreFuente, fecha_origen: new Date().toISOString().slice(0, 10), origen: "cliente", estado: "leido" }).select("id").single();
    src = s2;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const rol = ses.participants?.rol;
  const quien = rol === "dueno" ? "el dueño" : rol === "socio" ? "un socio" : `una persona del equipo (${ses.participants?.puesto ?? rol})`;
  const contexto = `Transcripción de entrevista a ${quien}. Fecha: ${hoy}. Lo que dice es su percepción actual: temporalidad actual salvo que hable del pasado o de metas.`;
  const texto = `PREGUNTA: ${r.pregunta}\nRESPUESTA: ${r.respuesta}`;
  const out = await correrExtractor({ texto, contexto });
  await registrarLlamada(ses.company_id, job.id, "extractor", out);

  let nuevas = 0;
  for (let i = 0; i < out.data.afirmaciones.length; i++) {
    const a = out.data.afirmaciones[i];
    const { data: fr } = await sb.from("source_fragments").insert({ source_id: src!.id, seccion: `Pregunta ${r.orden ?? ""}: ${String(r.pregunta).slice(0, 120)}`, texto: a.fragmento ?? r.respuesta }).select("id").single();
    const { error } = await sb.from("claims").insert({
      company_id: ses.company_id,
      source_id: src!.id,
      fragment_id: fr?.id ?? null,
      participant_id: ses.participant_id,
      response_id: responseId,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.posible_instruccion ? "otro" : a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: a.fecha_afirmacion ?? hoy,
      // P1-01: lo que una persona dice hoy, lo sostiene hoy → confirmado por quien lo dijo. La independencia de
      // fuentes (rules/evidencia.ts) impide que una sola opinión sostenga un hallazgo crítico.
      estado: "confirmado",
      validado_at: new Date().toISOString(),
      idempotency_key: claveIdempotente(["claim", "resp", responseId, i, a.texto.slice(0, 80)]),
    });
    if (!error) nuevas++;
    else if (error.code !== "23505") throw error;
  }
  // Lo dicho en una entrevista es DECLARADO: el estado lo pone el extractor (contado, casi siempre), como hasta hoy.
  await guardarMetricas(sb, ses.company_id, out.data.metricas, { response_id: responseId, origen: "declarado" });
  if (nuevas) await encolar({ company_id: ses.company_id, tipo: "contrastar", payload: { response_id: responseId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", "resp", responseId]) });
  return { nuevas };
}

import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { CLAVES_VARA } from "@/lib/metodo/varas";
import { ESTADOS, puedePasar, type Estado } from "@/lib/expediente";

type Ctx = { params: Promise<{ id: string }> };

/**
 * LOS DOCUMENTOS DE LA EMPRESA: darlos de alta y moverlos de estado.
 *
 * POR QUÉ EXISTE ESTA RUTA. Hasta el 22-10-2026 la tabla `expediente_documental` solo se podía
 * llenar pegando SQL en el editor de Supabase. La consultora tenía veinticuatro documentos de su
 * primer cliente dentro y ninguna pantalla desde donde verlos, abrirlos o moverlos: el expediente
 * documental existía para el producto y no para quien trabaja con él. Un sistema que solo se puede
 * alimentar desde la terminal no es un sistema, es una base de datos con un informe encima.
 *
 * SOLO TEXTO. Un documento entra con su texto, porque sin texto no se puede medir contra su vara y
 * un documento que no se puede medir es un nombre en una lista. Lo que viene en PDF o en Word pasa
 * primero por Fuentes, que es donde vive la extracción; aquí no se duplica ese trabajo.
 */

const MAX = 400_000; // Unos cien folios. Más que eso no es un documento, es un archivo mal armado.

// Entra un archivo, así que el cupo es el de subidas y no el de escritura: lo que protege
// es el ancho de banda y el disco, no el número de filas.
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);

  const form = await req.formData();
  const archivo = form.get("archivo");
  const nombreDado = String(form.get("nombre") ?? "").trim();
  const pegado = String(form.get("texto") ?? "").trim();
  const vara = String(form.get("clave_vara") ?? "").trim();

  let texto = pegado;
  let nombre = nombreDado;

  if (archivo instanceof File && archivo.size > 0) {
    // Se mira la extensión y no el tipo que declara el navegador: Windows manda .md como vacío.
    if (!/\.(txt|md|csv|json)$/i.test(archivo.name)) {
      return fallo(
        `«${archivo.name}» no es texto plano. Lo que viene en PDF, Word o foto entra por Fuentes, que es donde se le saca el texto; cuando esté leído, vuelve aquí y se registra. Aquí solo entra lo que ya es texto.`,
      );
    }
    texto = (await archivo.text()).trim();
    if (!nombre) nombre = archivo.name.replace(/\.[^.]+$/, "");
  }

  if (!nombre) return fallo("Falta el nombre del documento: es con lo que se va a buscar después.");
  if (!texto) return fallo("Falta el texto. Un documento sin texto no se puede medir contra su vara.");
  if (texto.length > MAX) return fallo(`Son ${Math.round(texto.length / 1000)} mil caracteres y el tope es ${MAX / 1000} mil. Súbelo por partes o revisa si son varios documentos en uno.`);
  if (vara && !CLAVES_VARA.includes(vara)) return fallo(`No existe la vara «${vara}».`);

  const sb = supabaseAdmin();
  // Mismo nombre en la misma empresa: es la segunda vez que alguien sube lo mismo, y conviene
  // decirlo en vez de dejar dos filas que después nadie sabe cuál manda.
  const { data: ya } = await sb.from("expediente_documental").select("id").eq("company_id", id).eq("nombre", nombre).maybeSingle();
  if (ya) return fallo(`Ya hay un documento llamado «${nombre}» en esta empresa. Si es una versión nueva, ábrelo y súbela desde ahí, para que quede el rastro de qué cambió.`, 409);

  const { data, error } = await sb
    .from("expediente_documental")
    .insert({
      company_id: id,
      nombre,
      contenido: texto,
      clave_vara: vara || null,
      origen: "cliente",
      estado: "recibido",
      nota_consultora: `Subido por la consultora el ${new Date().toISOString().slice(0, 10)}.`,
    })
    .select("id")
    .single();
  if (error) return fallo(`No se pudo guardar: ${error.message}`);
  return ok({ id: data.id });
});

/**
 * MOVER UN DOCUMENTO: su estado o su vara.
 *
 * El estado no se escribe a dedo: se comprueba contra la máquina de estados, que es la que sabe que
 * un documento no pasa a vigente sin haber sido aprobado. Sin esa comprobación aquí, la pantalla
 * podría ofrecer un salto que la base acepta y que deja al cliente viendo como oficial algo que
 * nadie firmó.
 */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);

  const b = (await req.json()) as { documento?: string; estado?: string; clave_vara?: string | null; medir?: boolean };
  if (!b.documento) return fallo("Falta decir qué documento.");

  const sb = supabaseAdmin();
  const { data: doc, error: errLeer } = await sb
    .from("expediente_documental")
    .select("estado,nombre,clave_vara,contenido")
    .eq("company_id", id)
    .eq("id", b.documento)
    .maybeSingle();
  if (errLeer) return fallo(`No se pudo leer el documento: ${errLeer.message}`);
  if (!doc) return fallo("Ese documento no es de esta empresa.", 404);

  const cambios: Record<string, unknown> = {};

  if (b.estado) {
    if (!(b.estado in ESTADOS)) return fallo(`No existe el estado «${b.estado}».`);
    const de = doc.estado as Estado;
    const a = b.estado as Estado;
    if (de !== a && !puedePasar(de, a)) {
      const posibles = (Object.keys(ESTADOS) as Estado[]).filter((x) => puedePasar(de, x));
      return fallo(
        `Desde «${ESTADOS[de].nombre}» no se puede pasar a «${ESTADOS[a].nombre}». Desde donde está hoy se puede ir a: ${posibles.map((x) => ESTADOS[x].nombre).join(", ") || "ningún otro estado"}.`,
      );
    }
    cambios.estado = a;
  }

  if (b.clave_vara !== undefined) {
    if (b.clave_vara && !CLAVES_VARA.includes(b.clave_vara)) return fallo(`No existe la vara «${b.clave_vara}».`);
    cambios.clave_vara = b.clave_vara || null;
  }

  /**
   * MEDIR UN DOCUMENTO QUE YA ESTÁ EN EL EXPEDIENTE.
   *
   * Esto faltaba, y era el eslabón que trababa diez de los once activos de la empresa. El 18-10 se
   * puso la guarda que impide construir un documento sin haber medido antes el que la empresa ya
   * tenía —«lo que el cliente entrega es materia prima, no basura»—, pero el trabajo que mide solo
   * se encolaba al DAR DE ALTA un documento nuevo. Para los veinticuatro que ya estaban dentro no
   * había forma de pedirlo desde ninguna pantalla.
   *
   * Resultado: la guarda decía «mídelo primero» y no existía el botón de medir. Se puso el candado
   * y no la llave.
   */
  if (b.medir) {
    const vara = (cambios.clave_vara as string | undefined) ?? (doc.clave_vara as string | null);
    if (!vara) return fallo("Este documento no tiene vara asignada, así que no hay contra qué medirlo. Elígele una y vuelve a pedirlo.");
    if (!((doc.contenido as string | null) ?? "").trim()) {
      return fallo("Este documento está registrado pero no tiene texto, y sin texto no hay nada que medir. Tráelo primero por Fuentes.");
    }
    // Si en la misma llamada se cambió la vara, el cambio se guarda ANTES de encolar: medir contra
    // la vara vieja daría un resultado que nadie pidió y que además parecería válido.
    if (Object.keys(cambios).length) {
      const { error } = await sb.from("expediente_documental").update(cambios).eq("company_id", id).eq("id", b.documento);
      if (error) return fallo(`No se pudo guardar: ${error.message}`);
    }
    const job = await encolar({
      company_id: id,
      tipo: "revisar_documento",
      payload: { documento_id: b.documento },
      prioridad: PRIORIDAD.diagnosticar,
      // La ronda es el número de mediciones que ya tiene: pedir «medir» dos veces seguidas no abre
      // dos trabajos, y volver a pedirlo después de una medición sí abre el siguiente.
      idempotency_key: claveIdempotente(["revisar", String(b.documento), String(vara)]),
    });
    return ok({ job_id: job.id, midiendo_con: vara, cambiado: Object.keys(cambios) });
  }

  if (!Object.keys(cambios).length) return fallo("No se pidió ningún cambio.");

  const { error } = await sb.from("expediente_documental").update(cambios).eq("company_id", id).eq("id", b.documento);
  if (error) return fallo(`No se pudo guardar: ${error.message}`);
  return ok({ cambiado: Object.keys(cambios) });
});

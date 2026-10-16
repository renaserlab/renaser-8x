import { z } from "zod";
import { protegido, ok, fallo, exigirAcceso, leerValidado, uuid, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { nivelEnEmpresa, exigirLlenado } from "@/lib/solicitudes";
import { TEXTOS_DIBUJO, armarDescripcion, avisoRecorte, textoDeFuente, type FragmentoTexto } from "@/components/procesos/subidas";

type Ctx = { params: Promise<{ id: string }> };

const RUTA = "/api/processes/dibujar";
const Cuerpo = z.object({ source_id: uuid, reemplazar: z.boolean().optional() });

/**
 * DIBUJAR UN PROCESO CON EL ARCHIVO QUE SE SUBIÓ (16-10-2026), paso 3 de 3 de «subir un proceso que ya tienes».
 *
 * body: { source_id, reemplazar? } → { job_id, recortado, aviso? }. Encola `generar_proceso` (el mismo trabajo que dibuja
 * lo que se dicta) con { descripcion, process_id }, con la prioridad de dibujar un proceso. Lo caro va a la cola, no a la
 * petición. Como el trabajo recibe `process_id`, dibuja EN ese proceso: no crea otro (handlers/procesos.ts ·
 * guardarFlujograma); el primer paso lo pasa de «sin dibujar» a AS-IS por el disparador de la migración.
 *
 * Lo que se exige, en este orden, y lo que se responde si no:
 *  - el proceso existe (404) y es de una empresa a la que la persona entra (403);
 *  - quien pide es la consultora, o el dueño o un líder de la empresa (403): dibujar gasta del cupo de la empresa;
 *  - no es un TO-BE (409): un rediseño se dibuja desde el proceso de hoy;
 *  - la fuente es DE ESE PROCESO Y DE ESA EMPRESA (403, y queda en el rastro como acceso denegado);
 *  - terminó de leerse (409 «Todavía estamos leyendo el archivo…»; si la lectura terminó en error, 409 con qué hacer);
 *  - trae texto: `sources.contenido` o, si no, los fragmentos citados al leerla, en orden (409 «Este archivo no trae
 *    texto que podamos leer…», por ejemplo una foto sin letras);
 *  - si el proceso ya tiene pasos, solo con `reemplazar: true` (409): dibujarlo otra vez borra lo dibujado, y eso no
 *    pasa sin que la persona lo confirme. Del lado de la empresa, además, con «subir_procesos» abierta (403) y nunca
 *    sobre un proceso confirmado ni con su TO-BE o su SOP (409): ese trabajo de la consultora no lo pisa un archivo;
 *  - antes de reemplazar se guarda una copia de cómo estaba (process_versiones: la ficha, los pasos y las
 *    conexiones), para poder volver atrás; si la copia no se guarda, no se dibuja (409 o 500, nada encolado).
 * Dibujar por primera vez un proceso «sin dibujar» no exige la sección abierta: es el mismo camino de «subir un
 * proceso» (POST /api/companies/[id]/procesos), que tampoco la exige.
 * Si el texto pasa de 8.000 letras se recorta y la respuesta lo dice (`recortado`, `aviso`). Lo que ya se sabía del
 * proceso (la descripción de la lista, lo dictado) va delante del archivo: el trabajo de dibujo guarda la descripción
 * como «lo que contaste originalmente» y así no se pierde.
 */
export const POST = protegido<Ctx>({ cupo: "ia", entidad: "processes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  const { data: proceso, error: eP } = await sb.from("processes").select("id,company_id,nombre,version,descripcion_original,confirmacion").eq("id", id).maybeSingle();
  if (eP) return fallo(`No pudimos leer el proceso: ${eP.message}`, 500);
  if (!proceso) return fallo("No encontramos ese proceso.", 404);
  const p = proceso as { id: string; company_id: string; nombre: string; version: string | null; descripcion_original: string | null; confirmacion: string | null };
  await exigirAcceso(perfil, p.company_id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) {
    const nivel = await nivelEnEmpresa(perfil.id, p.company_id);
    if (nivel !== "dueno" && nivel !== "lider") throw new AccesoDenegado(TEXTOS_DIBUJO.soloDuenoOLider, "autoridad", p.company_id);
  }
  if (p.version === "to_be") return fallo(TEXTOS_DIBUJO.rediseno, 409);

  const { data: fuente, error: eF } = await sb.from("sources").select("id,company_id,process_id,nombre,estado,contenido").eq("id", b.source_id).maybeSingle();
  if (eF) return fallo(`No pudimos leer el archivo: ${eF.message}`, 500);
  const f = fuente as { id: string; company_id: string | null; process_id: string | null; nombre: string; estado: string | null; contenido: string | null } | null;
  // Una fuente de otro proceso o de otra empresa no se usa para dibujar este: es un hecho de seguridad, no un error.
  if (!f || f.company_id !== p.company_id || f.process_id !== p.id) throw new AccesoDenegado(TEXTOS_DIBUJO.ajeno, "pertenencia", p.company_id);
  if (f.estado === "error") return fallo(TEXTOS_DIBUJO.noSeLeyo, 409);
  if (f.estado !== "leido") return fallo(TEXTOS_DIBUJO.leyendo, 409);

  let texto = textoDeFuente(f.contenido);
  if (!texto) {
    const { data: frs, error: eFr } = await sb.from("source_fragments").select("texto,pagina,audio_desde").eq("source_id", f.id).order("pagina", { ascending: true }).limit(2000);
    if (eFr) return fallo(`No pudimos leer el texto del archivo: ${eFr.message}`, 500);
    texto = textoDeFuente(null, (frs ?? []) as FragmentoTexto[]);
  }
  if (!texto) return fallo(TEXTOS_DIBUJO.sinTexto, 409);

  const { count, error: eN } = await sb.from("process_nodes").select("id", { count: "exact", head: true }).eq("process_id", p.id);
  if (eN) return fallo(`No pudimos saber si el proceso ya está dibujado: ${eN.message}`, 500);
  const yaDibujado = (count ?? 0) > 0;
  if (yaDibujado && !b.reemplazar) return fallo(TEXTOS_DIBUJO.yaDibujado, 409);

  let copia: string | null = null;
  if (yaDibujado) {
    // Volver a dibujarlo BORRA sus pasos, y con ellos lo que colgaba de cada paso (las fichas de agente se van, el
    // know-how y las fuentes quedan sueltos) y la confirmación vuelve a «por confirmar». Del lado de la empresa, eso
    // solo con «subir_procesos» abierta, y nunca sobre lo que ya tiene trabajo: un proceso confirmado, o con su
    // rediseño (TO-BE) o su procedimiento escrito (SOP). La consultora puede siempre; para todos, antes de borrar se
    // guarda una copia de cómo estaba, y sin copia no se borra nada.
    if (!esConsultora) {
      await exigirLlenado(perfil, p.company_id, "subir_procesos");
      if (p.confirmacion === "confirmado") return fallo(TEXTOS_DIBUJO.confirmado, 409);
      const [tobe, sops] = await Promise.all([
        sb.from("processes").select("id", { count: "exact", head: true }).eq("padre_id", p.id).eq("version", "to_be"),
        sb.from("sops").select("id", { count: "exact", head: true }).eq("process_id", p.id),
      ]);
      if (tobe.error || sops.error) return fallo("No pudimos saber si tu consultora ya trabajó sobre este proceso. Inténtalo de nuevo en un momento.", 500);
      if ((tobe.count ?? 0) > 0 || (sops.count ?? 0) > 0) return fallo(TEXTOS_DIBUJO.conTrabajo, 409);
    }
    const [ficha, nodos, conexiones] = await Promise.all([
      sb.from("processes").select("*").eq("id", p.id).maybeSingle(),
      sb.from("process_nodes").select("*").eq("process_id", p.id).limit(2000),
      sb.from("process_edges").select("*").eq("process_id", p.id).limit(4000),
    ]);
    if (ficha.error || nodos.error || conexiones.error) return fallo(TEXTOS_DIBUJO.sinCopia, 500);
    const { data: guardada, error: eC } = await sb
      .from("process_versiones")
      .insert({
        company_id: p.company_id,
        process_id: p.id,
        motivo: `antes de volver a dibujarlo con «${f.nombre}»`.slice(0, 200),
        contenido: { proceso: ficha.data ?? null, nodos: nodos.data ?? [], conexiones: conexiones.data ?? [] },
        creado_por: perfil.id,
      })
      .select("id")
      .single();
    if (eC || !guardada) return fallo(TEXTOS_DIBUJO.sinCopia, eC && ["42P01", "PGRST205"].includes(eC.code ?? "") ? 409 : 500);
    copia = (guardada as { id: string }).id;
  }

  const d = armarDescripcion({ nombre: p.nombre, previa: p.descripcion_original, archivo: f.nombre, texto });
  const job = await encolar({ company_id: p.company_id, tipo: "generar_proceso", payload: { descripcion: d.descripcion, process_id: p.id }, prioridad: PRIORIDAD.proceso_voz });
  void registrar({
    companyId: p.company_id,
    actor: perfil,
    accion: "crear",
    entidad: "processes",
    entidadId: p.id,
    detalle: { que: "dibujar_desde_archivo", source_id: f.id, job_id: job.id, recortado: d.recortado, letras: d.letrasUsadas, reemplaza: yaDibujado, copia_anterior: copia },
    ruta: RUTA,
    ip: ipDe(req),
  });
  return ok({ job_id: job.id, recortado: d.recortado, ...(d.recortado ? { aviso: avisoRecorte(d.letrasUsadas, d.letrasArchivo) } : {}) });
});

import { z } from "zod";
import { protegido, ok, fallo, exigirAcceso, leerValidado, texto, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nivelEnEmpresa } from "@/lib/solicitudes";
import { TEXTOS_DIBUJO, normalizarNombre } from "@/components/procesos/subidas";

type Ctx = { params: Promise<{ id: string }> };

const RUTA = "/api/companies/procesos";
/** En la lista de la empresa y sin dibujar: ni AS-IS ni TO-BE. Ningún lector de `as_is` lo cuenta (ver procesos/importar). */
const VERSION_SIN_DIBUJAR = "sin_dibujar";
const ORIGEN_IMPORTADO = "importado";
const CHECK_VIOLADO = "23514";
const MIGRACION = "supabase/migracion-procesos-importados.sql";

const Cuerpo = z.object({ nombre: texto(120) });

/**
 * SUBIR UN PROCESO QUE LA EMPRESA YA TIENE (16-10-2026), paso 1 de 3: crear el proceso, sin dibujar, para colgarle el
 * archivo. El paso 2 es la subida de siempre (POST /api/sources con `process_id`); el 3, dibujarlo con lo que se leyó
 * (POST /api/processes/[id]/dibujar). No hay un segundo sistema de subidas: el archivo entra por la misma puerta que
 * todo lo demás y se lee con el mismo lector.
 *
 * Se crea igual que lo que trae la lista importada: `version = 'sin_dibujar'`, `origen = 'importado'`, en borrador, sin
 * un solo paso y con `fuentes_usadas` vacío (el archivo queda ligado por `sources.process_id`, no aquí). Así nada que lea
 * procesos dibujados lo cuenta hasta que tenga su primer paso; el disparador de la migración lo pasa a AS-IS solo.
 *
 * Si ya hay un proceso con ese nombre (sin mayúsculas ni tildes; un TO-BE no cuenta, lleva el nombre de su AS-IS a
 * propósito), no se duplica: responde 200 con ese proceso y `existia: true`, y el archivo se le suma a él.
 *
 * Quién: la consultora, o el dueño o un líder de la empresa. Un participante no crea procesos por la empresa. No hace
 * falta que la consultora haya abierto «subir_procesos»: contar un proceso tampoco lo exige; lo que sí lo exige es
 * importar la lista entera (procesos/importar).
 *
 * 409 si la base todavía no admite «sin dibujar» (migración sin aplicar): no se crea nada y no se reintenta como AS-IS.
 */
export const POST = protegido<Ctx>({ entidad: "processes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) {
    const nivel = await nivelEnEmpresa(perfil.id, id);
    if (nivel !== "dueno" && nivel !== "lider") throw new AccesoDenegado(TEXTOS_DIBUJO.soloDuenoOLider, "autoridad", id);
  }
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  const { data: leidos, error: eL } = await sb.from("processes").select("id,nombre,version").eq("company_id", id).limit(2000);
  if (eL) return fallo(`No pudimos leer los procesos de la empresa: ${eL.message}`, 500);
  const clave = normalizarNombre(b.nombre);
  const igual = ((leidos ?? []) as { id: string; nombre: string; version: string | null }[]).find((p) => p.version !== "to_be" && normalizarNombre(p.nombre) === clave);
  if (igual) return ok({ process_id: igual.id, existia: true, version: igual.version });

  const { data, error } = await sb
    .from("processes")
    .insert({ company_id: id, nombre: b.nombre, version: VERSION_SIN_DIBUJAR, origen: ORIGEN_IMPORTADO, confirmacion: "borrador", fuentes_usadas: [] })
    .select("id")
    .single();
  if (error?.code === CHECK_VIOLADO) {
    return fallo(
      esConsultora
        ? `Esta base todavía no deja guardar procesos «sin dibujar»: falta aplicar ${MIGRACION}. No se creó el proceso ni se subió el archivo.`
        : "Todavía no podemos guardar procesos subidos: tu consultora está terminando de preparar esta parte. No se guardó nada; inténtalo más tarde.",
      409
    );
  }
  if (error || !data) return fallo(`No pudimos crear el proceso: ${error?.message ?? "la base no devolvió el proceso creado"}`, 500);
  const processId = (data as { id: string }).id;
  void registrar({
    companyId: id,
    actor: perfil,
    accion: "crear",
    entidad: "processes",
    entidadId: processId,
    detalle: { nombre: b.nombre, version: VERSION_SIN_DIBUJAR, origen: ORIGEN_IMPORTADO, para: "subir_archivo", por: esConsultora ? "consultora" : "cliente" },
    ruta: RUTA,
    ip: ipDe(req),
  });
  return ok({ process_id: processId, existia: false, version: VERSION_SIN_DIBUJAR }, 201);
});

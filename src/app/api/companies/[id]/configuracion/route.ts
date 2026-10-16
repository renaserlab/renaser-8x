import { z } from "zod";
import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CODIGOS_PAIS, IDIOMAS_DISPONIBLES, MENSAJE, ConfiguracionInvalida, configDe, ejemplo, esMonedaValida, esZonaValida, porDefecto, type ConfigEmpresa } from "@/lib/formato";

type Ctx = { params: Promise<{ id: string }> };

const COLUMNAS = "pais,moneda,idioma,zona_horaria";
/**
 * La columna no existe: pasa si la migración de entrada y dirección no se aplicó en esa base. Postgres lo dice con
 * 42703 al leer; PostgREST, con PGRST204 al escribir una columna que no está en su esquema.
 */
const faltaColumna = (e: { code?: string } | null | undefined) => e?.code === "42703" || e?.code === "PGRST204";
const SIN_MIGRACION = "La configuración por empresa todavía no está habilitada en esta base: falta aplicar supabase/migracion-entrada-y-direccion.sql. No se cambió nada; mientras tanto rige Perú.";
const SOLO_ESTOS_CAMPOS = "Solo se pueden cambiar país, moneda, idioma y zona horaria.";
const CUERPO_INVALIDO = "Los datos enviados no son válidos. Manda país, moneda, idioma o zona horaria.";
const NO_ENCONTRADA = "Empresa no encontrada";
/** La forma de un identificador, sin exigir versión: lo que Postgres acepta como uuid. Lo demás no es una empresa. */
const esIdentificador = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const NADA_QUE_CAMBIAR = "No hay nada que cambiar: manda al menos país, moneda, idioma o zona horaria.";

/**
 * LO QUE SE PUEDE CAMBIAR Y CON QUÉ VALORES. País de la lista conocida; moneda con código ISO 4217 que Intl
 * reconozca (cualquiera, no solo las de la lista); idioma solo el disponible; zona IANA que Intl acepte.
 * Parcial: se puede mandar un solo campo. Una clave desconocida no se ignora en silencio: se rechaza.
 */
const Cuerpo = z
  .object({
    pais: z.enum(CODIGOS_PAIS, { error: MENSAJE.pais }),
    moneda: z.string().trim().toUpperCase().refine(esMonedaValida, { error: MENSAJE.moneda }),
    idioma: z.enum(IDIOMAS_DISPONIBLES, { error: MENSAJE.idioma }),
    zona_horaria: z.string().trim().refine(esZonaValida, { error: MENSAJE.zona_horaria }),
  })
  .partial()
  .strict();

/**
 * El mensaje que ve la persona. Sale del campo que falló, no del texto de Zod: un número donde iba la moneda
 * daría «Invalid input: expected string», que no le dice nada a nadie.
 */
function mensajeDe(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") return SOLO_ESTOS_CAMPOS;
  const campo = issue.path[0];
  if (typeof campo === "string" && campo in MENSAJE) return MENSAJE[campo as keyof typeof MENSAJE];
  return CUERPO_INVALIDO;
}

type FilaConfig = Partial<Record<keyof ConfigEmpresa, unknown>>;

/**
 * La muestra de cómo se escribe. No puede tumbar la respuesta: si la base guarda algo que no se puede escribir
 * (un país que no es un código, puesto a mano), se devuelve sin muestra y con el aviso que dice qué campo falla.
 */
function muestraDe(cfg: ConfigEmpresa): { ejemplo: ReturnType<typeof ejemplo> | null; aviso?: string } {
  try {
    return { ejemplo: ejemplo(cfg) };
  } catch (e) {
    if (e instanceof ConfiguracionInvalida) return { ejemplo: null, aviso: e.message };
    throw e;
  }
}

/** La configuración vigente, con Perú donde falte el dato, y una muestra de cómo se escribe. Lo lee cualquiera que pertenezca a la empresa. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  // Un identificador mal escrito no es una empresa: 404, no el error de Postgres sobre la forma de un uuid.
  if (!esIdentificador(id)) return fallo(NO_ENCONTRADA, 404);
  await exigirAcceso(perfil, id);
  const { data, error } = await supabaseAdmin().from("companies").select(COLUMNAS).eq("id", id).maybeSingle();
  if (faltaColumna(error)) return ok({ configuracion: { ...porDefecto }, ejemplo: ejemplo(porDefecto), aviso: SIN_MIGRACION });
  if (error) return fallo(error.message, 500);
  if (!data) return fallo(NO_ENCONTRADA, 404);
  const cfg = configDe(data as FilaConfig);
  return ok({ configuracion: cfg, ...muestraDe(cfg) });
});

/** Cambia país, moneda, idioma o zona horaria. Solo la consultora, y solo quien tiene autoridad para administrar. */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "configuracion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  if (!esIdentificador(id)) return fallo(NO_ENCONTRADA, 404);
  await exigirAcceso(perfil, id);
  // Cambiar la moneda o la hora de una empresa cambia cómo se leen todos sus números: es administrar, no editar un dato.
  await exigirAutoridad(perfil, "administrar");

  const r = Cuerpo.safeParse(await leerJSON(req));
  if (!r.success) return fallo(mensajeDe(r.error.issues[0]!), 400);
  const cambios = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)) as Partial<ConfigEmpresa>;
  if (Object.keys(cambios).length === 0) return fallo(NADA_QUE_CAMBIAR, 400);

  const sb = supabaseAdmin();
  const { data: antesFila, error: eLectura } = await sb.from("companies").select(COLUMNAS).eq("id", id).maybeSingle();
  if (faltaColumna(eLectura)) return fallo(SIN_MIGRACION, 503);
  if (eLectura) return fallo(eLectura.message, 500);
  if (!antesFila) return fallo(NO_ENCONTRADA, 404);

  const { data, error } = await sb.from("companies").update(cambios).eq("id", id).select(COLUMNAS).single();
  if (faltaColumna(error)) return fallo(SIN_MIGRACION, 503);
  if (error) return fallo(error.message, 500);

  const antes = configDe(antesFila as FilaConfig);
  const despues = configDe(data as FilaConfig);
  // Además del rastro genérico de `protegido`, este dice de qué empresa y qué había antes: es lo que se pregunta después.
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "configuracion", entidadId: id, detalle: { antes, despues, campos: Object.keys(cambios) }, ruta: new URL(req.url).pathname, ip: ipDe(req) });
  return ok({ configuracion: despues, ...muestraDe(despues) });
});

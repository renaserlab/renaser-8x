import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { generar, guardar, aplicarEscrito, semanaPorDefecto, zonaDeEmpresa, esLunes, AVISO_MARCA_SIN_FECHA, AVISO_YA_REVISADA } from "@/lib/revision-semanal";

type Ctx = { params: Promise<{ id: string }> };

const ERROR_SEMANA = "La semana se pide por su lunes, con la forma AAAA-MM-DD (por ejemplo 2026-10-05).";

const Fecha = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, ERROR_SEMANA);
const texto = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * Los tres textos son opcionales y su AUSENCIA significa algo: un campo que no viene es un campo que la consultora
 * no tocó, y se queda como estaba guardado. Nunca se rellena con la propuesta del sistema.
 */
const Cuerpo = z.object({
  semana: Fecha.optional(),
  /** 5 · Por qué pasó lo que pasó. La escribe la consultora. */
  explicacion: texto(4000),
  /** 6 · La decisión tomada (o la que hace falta tomar), escrita por la consultora. */
  decision_necesaria: texto(4000),
  /** 7 · Lo que viene la semana próxima, escrito por la consultora. */
  siguiente: texto(4000),
  /** Marca la semana como revisada: exige explicación y deja quién la revisó y cuándo. */
  marcar_revisada: z.boolean().optional(),
});

/**
 * GET: la revisión de la semana, armada ahora mismo con lo que hay en la base (determinista) más lo que la
 * consultora haya escrito para esa semana. No escribe nada. La leen la consultora y el dueño de la empresa.
 * Sin `semana` se entrega la que TERMINÓ, contada con el reloj de la empresa; un día que no es lunes se rechaza,
 * no se corrige en silencio.
 */
export const GET = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const pedida = new URL(req.url).searchParams.get("semana");
  if (pedida && !esLunes(pedida)) return fallo(ERROR_SEMANA, 400);
  const sb = supabaseAdmin();
  const ahora = new Date();
  const zona = await zonaDeEmpresa(id, sb);
  const revision = await generar(id, pedida || semanaPorDefecto(ahora, zona), sb, ahora, zona);
  return ok(revision);
});

/**
 * POST: guarda lo que la consultora escribió junto con la foto derivada de la semana. Upsert por (company_id,
 * semana). Solo se escribe lo que viene en el cuerpo: la propuesta del sistema no se guarda como decisión de
 * nadie. Con `marcar_revisada` exige la explicación y deja quién revisó y cuándo (`revisada_por`, `revisada_at`).
 * La primera marca manda: marcar una semana ya revisada guarda los textos y conserva a quien la revisó primero.
 * SOLO SE MARCA UNA SEMANA QUE TERMINÓ en el reloj de la empresa: pedirlo para la semana en curso o para una futura
 * responde 409 con desde qué día se podrá, y no se escribe nada (los textos se guardan sin la marca).
 * En una base sin la migración de esas columnas la marca se guarda como antes y se avisa que quedó sin fecha;
 * marcar no responde 500 por una migración pendiente. Cuando la marca no quedó como se pidió (ya estaba puesta, o
 * quedó sin fecha) la respuesta lo dice en `aviso`.
 * Es tarea de la consultora: revisar la semana es parte del método.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  if (perfil.rol !== "consultor") throw new AccesoDenegado("La revisión semanal la escribe la consultora; tú la lees en «Esta semana».", "rol", id);
  const b = await leerValidado(req, Cuerpo);
  if (b.semana && !esLunes(b.semana)) return fallo(ERROR_SEMANA, 400);

  const sb = supabaseAdmin();
  const ahora = new Date();
  const zona = await zonaDeEmpresa(id, sb);
  const semana = b.semana ?? semanaPorDefecto(ahora, zona);
  const aplicado = aplicarEscrito(await generar(id, semana, sb, ahora, zona), b, perfil.id, ahora);
  if (!aplicado.ok) return fallo(aplicado.error, aplicado.conflicto ? 409 : 400);
  const { vaciar, marca } = aplicado;

  const guardado = await guardar(aplicado.revision, sb, { vaciar });
  // Se devuelve lo que quedó guardado: una marca hecha sin la migración no tiene fecha, y no se le inventa.
  const revision = guardado.marca_sin_fecha ? { ...aplicado.revision, revisada_at: null } : aplicado.revision;
  const aviso = marca === "conservada" ? AVISO_YA_REVISADA : guardado.marca_sin_fecha ? AVISO_MARCA_SIN_FECHA : null;
  void registrar({
    companyId: id, actor: perfil, accion: guardado.creada ? "crear" : "editar", entidad: "revision_semanal", entidadId: guardado.id,
    detalle: { semana, desvios: revision.desvios.length, revisada: marca === "nueva" }, ruta: "/api/companies/revision", ip: ipDe(req),
  });
  return ok({ revision, guardado, aviso }, guardado.creada ? 201 : 200);
});

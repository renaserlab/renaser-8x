import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, uuid, texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { registrar, ipDe } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { desdeFila, registrarValor, motivoSuficiente, TEXTO_FALTA_MOTIVO } from "@/lib/kpis";
import { guardarValor, zonaDeEmpresa, dejarMotivoDeArchivo, rastroDeValor } from "../kpis/_registro";

type Ctx = { params: Promise<{ id: string }> };

/** Pedir que se propongan indicadores a partir de lo que sale mal seguido. */
export const POST = protegido<Ctx>({ cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();

  // Si ya hay uno en cola, no se encola otro: dos propuestas en paralelo se pisan y se paga doble.
  const { data: enCola } = await sb
    .from("jobs")
    .select("id")
    .eq("company_id", id)
    .eq("tipo", "proponer_indicadores")
    .in("estado", ["pendiente", "corriendo"])
    .maybeSingle();
  if (enCola) return ok({ job_id: enCola.id, ya_estaba: true });

  const job = await encolar({ company_id: id, tipo: "proponer_indicadores", payload: {}, prioridad: PRIORIDAD.diagnosticar });
  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "indicadores", ruta: "/api/companies/indicadores", ip: ipDe(req) });
  return ok({ job_id: job.id });
});

const Cambio = z.object({
  indicador_id: uuid,
  /** Adoptar, archivar, o anotar el valor de este periodo. */
  estado: z.enum(["activo", "archivado"]).optional(),
  /** null = este periodo no tiene dato. No se guarda cero ni se inventa nada. */
  valor: z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
  /** La forma la decide la frecuencia del indicador (registrarValor), no esta ruta. */
  periodo: z.string().trim().min(4).max(20).optional(),
  /** Por qué se archiva. Sin motivo no se archiva. */
  motivo: texto(400).optional(),
});

const RUTA = "/api/companies/indicadores";

/**
 * EL CAMINO VIEJO, que sigue sirviendo a «Tus números» (src/components/cliente/Indicadores.tsx): adoptar un
 * indicador, archivarlo, o anotar cuánto dio este mes. Mismo cuerpo y misma respuesta que siempre, pero ya
 * no decide nada por su cuenta: el valor entra por `guardarValor` (el mismo camino que POST /kpis/[kid]/valor),
 * que aplica `registrarValor`. Es decir: sin dato no inserta nada, el periodo tiene que ser el de la
 * frecuencia y haber cerrado en el reloj de la empresa, y lo que anota la empresa entra como «declarado».
 *
 * Esta ruta ya no añade nada propio: el reflejo mensual en `company_metricas` (de donde lee «Tus números») lo
 * hace `guardarValor` para las dos rutas. Si ahí ya hay un dato que no se puede reemplazar, la respuesta trae
 * además `aviso`; si no, es `{ listo: true }` como siempre. Archivar pide motivo, igual que en PATCH /kpis/[kid].
 *
 * Si la base falla, quien anota lee una frase y el mensaje de la base va al registro de errores. Y si el valor
 * ya entró en la historia cuando algo falló, primero se deja su rastro y después se responde el fallo.
 */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Cambio);
  const sb = supabaseAdmin();

  const { data: fila } = await sb.from("indicadores").select("*").eq("id", b.indicador_id).maybeSingle();
  if (!fila || fila.company_id !== id) return fallo("Ese indicador no es de esta empresa.", 404);
  const kpi = desdeFila(fila as Record<string, unknown>);

  const traeValor = b.valor !== undefined;
  if (traeValor && !b.periodo) return fallo("Falta decir de qué periodo es el valor.", 400);
  if (!b.estado && !traeValor) return fallo("No hay nada que cambiar.", 400);
  // Pedir el estado que ya tiene no es un error: no cambia nada y no deja rastro de un cambio que no hubo.
  const cambiaEstado = !!b.estado && b.estado !== kpi.estado;
  const archiva = cambiaEstado && b.estado === "archivado";
  if (archiva && !motivoSuficiente(b.motivo)) return fallo(TEXTO_FALTA_MOTIVO, 400);

  // Tal como quedará después del cambio de estado: activar y anotar en la misma petición sigue valiendo.
  const despues = cambiaEstado ? { ...kpi, estado: b.estado! } : kpi;
  const ahora = new Date();
  const zona = traeValor ? await zonaDeEmpresa(sb, id) : null;

  // Antes de escribir nada: si el valor no va a entrar, tampoco se cambia el estado. Nada a medias.
  if (traeValor) {
    if (despues.estado === "archivado") return fallo("Ese indicador está archivado. Actívalo antes de anotarle un valor.", 400);
    const plan = registrarValor(despues, { periodo: b.periodo!, valor: b.valor ?? null, estado_validacion: "declarado" }, ahora, zona!);
    if (!plan.ok) return fallo(plan.motivo, 400);
  }

  if (cambiaEstado) {
    if (archiva) {
      const dejado = await dejarMotivoDeArchivo(sb, {
        companyId: id, indicadorId: kpi.id, clave: kpi.clave, motivo: b.motivo!, quien: perfil, ruta: RUTA, ip: ipDe(req),
        antes: { estado: kpi.estado }, despues: { estado: "archivado" },
      });
      if (!dejado.ok) return fallo(dejado.motivo, 500);
    }
    const { error } = await sb.from("indicadores").update({ estado: b.estado }).eq("id", kpi.id);
    if (error) {
      if (archiva) void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "indicador", entidadId: kpi.id, detalle: { clave: kpi.clave, no_aplicado: true, sigue: kpi.estado }, ruta: RUTA, ip: ipDe(req) });
      void registrarError({ ruta: RUTA, metodo: "PATCH", mensaje: "No se cambió el estado de un indicador", detalle: `indicadores.update (${kpi.clave} → ${b.estado}): ${error.message}`, actorId: perfil.id, companyId: id });
      return fallo("No pudimos guardar el cambio y el indicador sigue como estaba. Inténtalo de nuevo.", 500);
    }
    if (!archiva) void registrar({ companyId: id, actor: perfil, accion: "aprobar", entidad: "indicador", entidadId: kpi.id, detalle: { clave: kpi.clave, estado: b.estado }, ruta: RUTA, ip: ipDe(req) });
  }

  let aviso: string | null = null;
  if (traeValor) {
    // El contrato viejo no deja elegir la validación: lo que entra por aquí es lo que la empresa declara.
    const r = await guardarValor(sb, despues, { periodo: b.periodo!, valor: b.valor ?? null, estado_validacion: "declarado" }, perfil, { zona, hoy: ahora });
    if (!r.ok) {
      if (r.tecnico) void registrarError({ ruta: RUTA, metodo: "PATCH", mensaje: "No se guardó el valor de un indicador", detalle: r.tecnico, actorId: perfil.id, companyId: id });
      return fallo(r.motivo, r.status);
    }
    const rastro = { companyId: id, actor: perfil, entidad: "indicador_valor", entidadId: kpi.id, ...rastroDeValor(kpi, r), ruta: RUTA, ip: ipDe(req) };
    if (!r.sin_dato && r.pendiente) {
      // El valor ya está en la historia: su rastro se escribe ANTES de responder que algo no terminó.
      await registrar(rastro);
      void registrarError({ ruta: RUTA, metodo: "PATCH", mensaje: `Valor de indicador guardado a medias: falta ${r.pendiente.que}`, detalle: r.pendiente.tecnico, actorId: perfil.id, companyId: id });
      return fallo(r.pendiente.motivo, 500);
    }
    void registrar(rastro);
    if (!r.sin_dato) aviso = r.aviso;
  }

  // El contrato de siempre; `aviso` solo viaja cuando hay algo que decirle a quien anotó.
  if (aviso) return ok({ listo: true, aviso });
  return ok({ listo: true });
});

import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { normalizarClave } from "@/lib/metricas";
import { desdeFila, completitud, listo, motivoSuficiente, TEXTO_FALTA_MOTIVO } from "@/lib/kpis";
import { Editar, COLUMNAS, comprobarCoherencia, comprobarReferencias, diferencias } from "../_comun";
import { dejarMotivoDeArchivo } from "../_registro";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; kid: string }> };

const RUTA = "/api/companies/kpis";

/**
 * PATCH: ajustar los atributos de un indicador. La consultora cambia lo que quiera; la empresa solo
 * decide si lo adopta o lo archiva (es su número, nadie se lo impone), nunca la definición. Todo cambio
 * deja en el rastro quién, qué había antes, qué hay después y por qué (`motivo`). Archivar EXIGE motivo
 * (al menos ocho letras): sin motivo no se archiva.
 */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id, kid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Editar);
  const sb = supabaseAdmin();

  const { data: fila } = await sb.from("indicadores").select("*").eq("id", kid).maybeSingle();
  if (!fila || fila.company_id !== id) return fallo("Ese indicador no es de esta empresa.", 404);
  const actual = desdeFila(fila as Record<string, unknown>);

  const clavesPedidas = Object.keys(b).filter((k) => k !== "motivo" && (b as Record<string, unknown>)[k] !== undefined);
  if (perfil.rol !== "consultor" && clavesPedidas.some((k) => k !== "estado")) {
    throw new AccesoDenegado("Como empresa puedes adoptar o archivar un indicador; la definición la ajusta la consultora.", "rol", id);
  }
  if (clavesPedidas.length === 0) return fallo("No hay nada que cambiar.", 400);

  const cambios: Record<string, unknown> = {};
  for (const col of COLUMNAS) if (b[col] !== undefined) cambios[col] = b[col];
  if (typeof b.clave === "string") {
    const clave = normalizarClave(b.clave);
    if (!clave) return fallo("La clave no puede quedar vacía.", 400);
    cambios.clave = clave;
  }

  const fusion = { ...actual, ...cambios } as typeof actual;
  const coherencia = comprobarCoherencia(fusion);
  if (!coherencia.ok) return fallo(coherencia.motivo, 400);
  cambios.moneda = coherencia.moneda;
  const ajeno = await comprobarReferencias(sb, id, { responsable_participant_id: b.responsable_participant_id, accion_asociada_id: b.accion_asociada_id, linea_base_medicion_id: b.linea_base_medicion_id });
  if (ajeno) return fallo(ajeno, 400);

  const dif = diferencias(fila as Record<string, unknown>, cambios);
  if (Object.keys(dif.despues).length === 0) return ok({ kpi: actual, sin_cambios: true });

  // Nada se archiva sin motivo, lo pida la empresa o la consultora. Y el motivo se escribe ANTES de
  // archivar y se comprueba que quedó: el rastro normal no avisa si falla, y entonces no habría motivo.
  const archiva = dif.despues.estado === "archivado";
  if (archiva) {
    if (!motivoSuficiente(b.motivo)) return fallo(TEXTO_FALTA_MOTIVO, 400);
    const dejado = await dejarMotivoDeArchivo(sb, {
      companyId: id, indicadorId: kid, clave: actual.clave, motivo: b.motivo!, quien: perfil, ruta: RUTA, ip: ipDe(req),
      antes: dif.antes, despues: dif.despues,
    });
    if (!dejado.ok) return fallo(dejado.motivo, 500);
  }

  const { data, error } = await sb.from("indicadores").update(dif.despues).eq("id", kid).select("*").single();
  if (error) {
    // El motivo ya quedó escrito: se anota que el archivo no llegó a aplicarse, para que el rastro no mienta.
    if (archiva) void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "indicador", entidadId: kid, detalle: { clave: actual.clave, no_aplicado: true, sigue: actual.estado }, ruta: RUTA, ip: ipDe(req) });
    if (error.code === "23505") return fallo("Ya hay un indicador con esa clave en esta empresa.", 409);
    // El mensaje de la base va al registro de errores; a quien está en la pantalla, una frase.
    void registrarError({ ruta: RUTA, metodo: "PATCH", mensaje: "No se guardó el cambio de un indicador", detalle: `indicadores.update (${actual.clave}): ${error.message}`, actorId: perfil.id, companyId: id });
    return fallo("No pudimos guardar el cambio y el indicador sigue como estaba. Inténtalo de nuevo.", 500);
  }
  const kpi = desdeFila(data as Record<string, unknown>);
  if (!archiva) {
    void registrar({
      companyId: id, actor: perfil, accion: dif.despues.estado === "activo" ? "aprobar" : "editar", entidad: "indicador", entidadId: kid,
      detalle: { antes: dif.antes, despues: dif.despues, motivo: b.motivo ?? null }, ruta: RUTA, ip: ipDe(req),
    });
  }
  refrescarRuta(id, "ruta");
  return ok({ kpi, completitud: completitud(kpi), listo: listo(kpi).ok });
});

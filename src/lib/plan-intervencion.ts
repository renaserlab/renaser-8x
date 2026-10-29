import { supabaseAdmin } from "./supabase/admin";
import { exigirAutoridad } from "./autoridad";
import type { Perfil } from "./auth";
export * from "./plan-reglas";
import { ESTADOS, type Estado, estadoCanonico, type Evento, type Actor, ROLES_POR_EVENTO, autoridadNecesaria, LIMITE_FRENTES_POR_DEFECTO, type AccionPlan, accionVacia, CAMPOS_EDITABLES, queLeFalta, frentesAbiertos, abreFrenteAlModificar, abreFrenteAlDesbloquear, validarModificacion, type DatosTransicion, type ResultadoTransicion, transicion, type Participante, ReglaDelPlan, type HistorialFila, type AccionConContexto, type LineaBase, type IndicadorBreve, type PlanCargado } from "./plan-reglas";

/** `companies.limite_frentes`; si la columna no existe todavía (migración sin aplicar), el valor por defecto. */
async function leerLimiteFrentes(companyId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from("companies").select("limite_frentes").eq("id", companyId).maybeSingle();
  if (error || !data) return LIMITE_FRENTES_POR_DEFECTO;
  const n = Number((data as { limite_frentes?: unknown }).limite_frentes);
  return Number.isFinite(n) && n >= 1 ? n : LIMITE_FRENTES_POR_DEFECTO;
}

/**
 * Las acciones de la empresa y su límite, para contar frentes (al aprobar, al marcar prioridad una acción
 * abierta y al desbloquear una prioridad). Si no se pueden leer se falla en voz alta: una lectura rota leída
 * como «no hay ninguna abierta» dejaría pasar cualquier prioridad por encima del límite.
 */
async function leerFrentes(companyId: string): Promise<NonNullable<DatosTransicion["frentes"]>> {
  const [{ data, error }, limite] = await Promise.all([
    supabaseAdmin().from("actions").select("id,accion,estado,es_prioridad,verificado_at").eq("company_id", companyId),
    leerLimiteFrentes(companyId),
  ]);
  if (error) throw new Error(`No se pudo contar las prioridades abiertas: ${error.message}`);
  return { acciones: (data ?? []) as Pick<AccionPlan, "id" | "accion" | "estado" | "es_prioridad" | "verificado_at">[], limite };
}

/** Las versiones de la línea base, la vigente primero. Si `vigente` no existe aún en la base, la más reciente se toma como vigente. */
async function leerLineasBase(companyId: string): Promise<LineaBase[]> {
  const sb = supabaseAdmin();
  const conVersion = await sb.from("mediciones").select("id,version,vigente,fecha").eq("company_id", companyId).eq("tipo", "linea_base").order("version", { ascending: false });
  if (!conVersion.error) {
    return (conVersion.data ?? []).map((m) => ({ id: m.id as string, version: Number(m.version ?? 1), fecha: (m.fecha as string | null) ?? null, vigente: Boolean(m.vigente) }));
  }
  const sinVersion = await sb.from("mediciones").select("id,fecha").eq("company_id", companyId).eq("tipo", "linea_base").order("created_at", { ascending: false });
  const filas = sinVersion.data ?? [];
  return filas.map((m, i) => ({ id: m.id as string, version: filas.length - i, fecha: (m.fecha as string | null) ?? null, vigente: i === 0 }));
}

export async function lineaBaseVigente(companyId: string): Promise<LineaBase | null> {
  const lb = await leerLineasBase(companyId);
  return lb.find((m) => m.vigente) ?? null;
}

function filaComoAccion(fila: Record<string, unknown>, companyId: string): AccionPlan {
  const a = accionVacia({ ...(fila as Partial<AccionPlan>), id: fila.id as string, company_id: companyId, accion: (fila.accion as string) ?? "" });
  a.evidencia_ids = Array.isArray(a.evidencia_ids) ? a.evidencia_ids : [];
  a.depende_de = Array.isArray(a.depende_de) ? a.depende_de : [];
  a.es_prioridad = Boolean(a.es_prioridad);
  return a;
}

/** Todo lo que las dos pantallas y la ruta GET necesitan, en una sola lectura. */
export async function cargarPlan(companyId: string): Promise<PlanCargado> {
  const sb = supabaseAdmin();
  const [{ data: acciones, error }, { data: participantes }, { data: indicadores }, lineasBase, limite, { data: pruebas }] = await Promise.all([
    sb.from("actions").select("*, findings(titulo)").eq("company_id", companyId).order("prioridad", { ascending: true, nullsFirst: false }).order("semana_inicio"),
    sb.from("participants").select("id,nombre,puesto,rol").eq("company_id", companyId).order("nombre"),
    sb.from("indicadores").select("id,nombre,unidad").eq("company_id", companyId).order("nombre"),
    leerLineasBase(companyId),
    leerLimiteFrentes(companyId),
    sb.from("evidencias").select("action_id").eq("company_id", companyId).not("action_id", "is", null),
  ]);
  if (error) throw new Error(`No se pudo leer el plan: ${error.message}`);
  const ids = (acciones ?? []).map((a) => a.id as string);
  // El historial es la mitad del plan (quién decidió qué). Si no se puede leer, la pantalla no puede decir
  // «sin historial todavía» como si fuera verdad: se falla en voz alta.
  const leido = ids.length
    ? await sb.from("accion_historial").select("*, users(nombre)").in("action_id", ids).order("created_at", { ascending: true })
    : { data: [] as Record<string, unknown>[], error: null };
  if (leido.error) throw new Error(`No se pudo leer el historial: ${leido.error.message}`);
  const historial = leido.data;
  const porAccion: Record<string, HistorialFila[]> = {};
  for (const h of (historial ?? []) as Record<string, unknown>[]) {
    const { users, ...resto } = h as Record<string, unknown> & { users?: { nombre?: string | null } | null };
    const k = resto.action_id as string;
    (porAccion[k] ??= []).push({ ...(resto as unknown as HistorialFila & { id: string; created_at: string }), actor_nombre: users?.nombre ?? null });
  }
  const pruebasPor: Record<string, number> = {};
  for (const p of pruebas ?? []) pruebasPor[p.action_id as string] = (pruebasPor[p.action_id as string] ?? 0) + 1;
  const nombres = new Map((participantes ?? []).map((p) => [p.id as string, p.nombre as string]));

  const listas: AccionConContexto[] = (acciones ?? []).map((fila) => {
    const { findings, ...resto } = fila as Record<string, unknown> & { findings?: { titulo?: string } | null };
    const a = filaComoAccion(resto, companyId);
    return {
      ...a,
      estado_canonico: estadoCanonico(a),
      falta: queLeFalta(a),
      responsable_nombre: a.responsable_participant_id ? nombres.get(a.responsable_participant_id) ?? null : null,
      pruebas: pruebasPor[a.id] ?? 0,
      historial: porAccion[a.id] ?? [],
      finding_titulo: findings?.titulo ?? null,
    };
  });
  return {
    acciones: listas,
    participantes: (participantes ?? []) as Participante[],
    indicadores: (indicadores ?? []) as IndicadorBreve[],
    lineasBase,
    lineaBaseVigente: lineasBase.find((m) => m.vigente) ?? null,
    limiteFrentes: limite,
    abiertas: frentesAbiertos(listas),
  };
}

export async function leerAccion(actionId: string): Promise<AccionPlan | null> {
  const { data } = await supabaseAdmin().from("actions").select("*").eq("id", actionId).maybeSingle();
  if (!data) return null;
  return filaComoAccion(data as Record<string, unknown>, data.company_id as string);
}

/**
 * ESCRIBIR UNA ACCIÓN A MANO. Hasta hoy la única puerta por la que nacía una fila de `actions` era el
 * planificador: si el modelo fallaba, si no había hallazgos aprobados, o si la consultora quería abrir un frente
 * que no salió de un hallazgo, no había por dónde. Un plan que solo puede escribir una máquina no es un plan de
 * la consultora.
 *
 * Nace PROPUESTA, como todas: aprobarla sigue siendo un acto aparte con sus reglas (los seis mínimos, la
 * autoridad y el límite de frentes). Y nace con su fila de historial —quién la propuso— porque eso es lo que
 * distingue una decisión de un apunte. Si el historial no entra, la acción se borra: una acción sin rastro de
 * quién la propuso no se deja a medias, y aquí sí se puede deshacer porque acaba de nacer y nadie la ha tocado.
 */
export async function crearAccion(
  companyId: string,
  perfil: Perfil,
  campos: Record<string, unknown>,
  motivo?: string | null
): Promise<{ accion: AccionPlan; historialId: string }> {
  const permitidos = Object.fromEntries(
    Object.entries(campos).filter(([k, v]) => v !== undefined && (CAMPOS_EDITABLES as readonly string[]).includes(k))
  );
  const texto = String(permitidos.accion ?? "").trim();
  if (!texto) throw new ReglaDelPlan("Una acción necesita decir qué se hace.");
  if (typeof permitidos.fecha_inicio === "string" && typeof permitidos.vence_at === "string" && permitidos.vence_at < permitidos.fecha_inicio) {
    throw new ReglaDelPlan("La fecha de vencimiento no puede ser anterior a la de inicio.");
  }
  // Lo que apunta a una persona, un indicador, una línea base u otra acción tiene que ser de ESTA empresa, y se
  // comprueba ANTES de insertar: una fila con una referencia de otra empresa no debería existir ni un instante.
  await comprobarReferencias(companyId, null, permitidos);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("actions")
    .insert({ ...permitidos, accion: texto, company_id: companyId, estado: "propuesto", fase: permitidos.fase ?? "implementacion", updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la acción: ${error?.message ?? "la base no devolvió la fila"}`);
  const accion = filaComoAccion(data as Record<string, unknown>, companyId);

  const { data: h, error: errorHistorial } = await sb
    .from("accion_historial")
    .insert({
      action_id: accion.id,
      accion: "proponer",
      despues: { estado: "propuesto", ...permitidos, accion: texto },
      motivo: (motivo ?? "").trim() || null,
      actor_id: perfil.id,
      actor_rol: perfil.rol,
    })
    .select("id")
    .single();
  if (errorHistorial || !h) {
    await sb.from("actions").delete().eq("id", accion.id);
    throw new Error(`La acción no se creó porque su historial no se pudo guardar: ${errorHistorial?.message ?? "la base no devolvió la fila"}`);
  }
  return { accion, historialId: h.id as string };
}

/**
 * Escribe el cambio y su historial. Primero la acción, después el historial; si el historial no entra, la
 * acción vuelve a como estaba y se lanza: un cambio sin rastro no se deja a medias.
 */
export async function escribirTransicion(a: AccionPlan, r: Extract<ResultadoTransicion, { ok: true }>): Promise<{ historialId: string }> {
  const sb = supabaseAdmin();
  const { error: e1 } = await sb.from("actions").update(r.cambios).eq("id", a.id);
  if (e1) throw new Error(`No se pudo guardar la acción: ${e1.message}`);
  const { data, error: e2 } = await sb.from("accion_historial").insert(r.historial).select("id").single();
  if (e2 || !data) {
    const vuelta: Record<string, unknown> = {};
    for (const k of Object.keys(r.cambios)) if (k !== "updated_at") vuelta[k] = (a as Record<string, unknown>)[k] ?? null;
    await sb.from("actions").update(vuelta).eq("id", a.id);
    throw new Error(`La acción no se cambió porque su historial no se pudo guardar: ${e2?.message ?? "la base no devolvió la fila"}`);
  }
  return { historialId: data.id as string };
}

/** Lo que la ruta de transición recibe del cuerpo, ya validado. */
export type PedidoTransicion = { evento: Evento; motivo?: string | null; implica?: string | null; evidencia_id?: string | null; escalado_a?: string | null };

/**
 * APLICA UN EVENTO CON TODO LO QUE LA REGLA NECESITA LEÍDO DE LA BASE: autoridad, límite de frentes (al
 * aprobar y al desbloquear una prioridad), línea base vigente, pruebas, estado previo del bloqueo. Quien
 * llama ya comprobó sesión y pertenencia. Un cliente que reporta una acción aprobada la inicia en el mismo
 * acto: quedan dos filas de historial. Primero se comprueba TODO y después se escribe: una petición que
 * falla no deja efectos a medias.
 */
export async function aplicarTransicion(a: AccionPlan, perfil: Perfil, pedido: PedidoTransicion): Promise<{ estado: Estado; historialIds: string[]; accion: AccionPlan }> {
  const sb = supabaseAdmin();
  const actor: Actor = { id: perfil.id, rol: perfil.rol };

  // El «iniciar» automático se calcula en memoria; se escribe solo si el reporte pasa sus comprobaciones.
  let inicio: Extract<ResultadoTransicion, { ok: true }> | null = null;
  let actual = a;
  if (pedido.evento === "reportar" && estadoCanonico(a) === "aprobado") {
    const ini = transicion(a, "iniciar", actor);
    if (!ini.ok) throw new ReglaDelPlan(ini.error);
    inicio = ini;
    actual = { ...a, ...(ini.cambios as Partial<AccionPlan>) };
  }

  const estado = estadoCanonico(actual);
  const autoridad = autoridadNecesaria(pedido.evento, estado);
  if (autoridad && ROLES_POR_EVENTO[pedido.evento].includes(actor.rol)) await exigirAutoridad(perfil, autoridad);

  const datos: DatosTransicion = { motivo: pedido.motivo, implica: pedido.implica, evidenciaId: pedido.evidencia_id ?? null, escaladoA: pedido.escalado_a ?? null };

  if (pedido.evento === "aprobar") {
    const [frentes, vigente] = await Promise.all([leerFrentes(actual.company_id), lineaBaseVigente(actual.company_id)]);
    datos.frentes = frentes;
    datos.lineaBaseVigenteId = vigente?.id ?? null;
  }
  if (pedido.evento === "reportar") {
    if (pedido.evidencia_id) {
      const { data: ev } = await sb.from("evidencias").select("id,action_id").eq("id", pedido.evidencia_id).maybeSingle();
      if (!ev || ev.action_id !== actual.id) throw new ReglaDelPlan("Esa prueba no es de esta acción.");
    } else {
      const { count } = await sb.from("evidencias").select("id", { count: "exact", head: true }).eq("action_id", actual.id);
      if ((count ?? 0) === 0) throw new ReglaDelPlan("Para reportarla sube una foto, un archivo o una nota de lo que se hizo. Sin prueba no hay reporte.");
    }
  }
  if (pedido.evento === "verificar") {
    const { count } = await sb.from("evidencias").select("id", { count: "exact", head: true }).eq("action_id", actual.id);
    let indicadorPosterior = false;
    if (actual.indicador_id && actual.reportado_at) {
      const { count: n } = await sb.from("indicador_valores").select("id", { count: "exact", head: true }).eq("indicador_id", actual.indicador_id).gt("created_at", actual.reportado_at);
      indicadorPosterior = (n ?? 0) > 0;
    }
    datos.evidencia = { pruebas: count ?? 0, indicadorPosterior };
  }
  if (pedido.evento === "desbloquear") {
    const { data: ultimo } = await sb.from("accion_historial").select("antes").eq("action_id", actual.id).eq("accion", "bloquear").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const previo = (ultimo?.antes as { estado?: string } | null)?.estado;
    datos.estadoPrevio = previo && (ESTADOS as readonly string[]).includes(previo) ? (previo as Estado) : null;
    // Una prioridad que vuelve de estar bloqueada ocupa frente otra vez: se cuenta contra el límite, la
    // desbloquee la consultora o el dueño. Antes se marcaba prioridad estando bloqueada y volvía sin contar.
    if (abreFrenteAlDesbloquear(actual, datos.estadoPrevio)) datos.frentes = await leerFrentes(actual.company_id);
  }

  const r = transicion(actual, pedido.evento, actor, datos);
  if (!r.ok) throw new ReglaDelPlan(r.error);

  // Todo comprobado: ahora sí se escribe, en orden (iniciar y después el evento pedido).
  const historialIds: string[] = [];
  if (inicio) historialIds.push((await escribirTransicion(a, inicio)).historialId);
  historialIds.push((await escribirTransicion(actual, r)).historialId);
  return { estado: r.estado, historialIds, accion: { ...actual, ...(r.cambios as Partial<AccionPlan>) } };
}

/**
 * LA FICHA SE EDITA. Propuesta: se completa y queda rastro de qué cambió. Ya decidida: pide motivo e
 * implicación y la autoridad de aprobar, porque cambiar lo aprobado es volver a decidir. Y si el cambio
 * marca como prioridad una acción abierta, pasa por el límite de frentes, con el mismo mensaje que al aprobar.
 */
export async function modificarAccion(a: AccionPlan, perfil: Perfil, cambios: Record<string, unknown>, motivo?: string | null, implica?: string | null): Promise<{ accion: AccionPlan; historialId: string | null }> {
  const estado = estadoCanonico(a);
  const permitidos = Object.fromEntries(Object.entries(cambios).filter(([k]) => (CAMPOS_EDITABLES as readonly string[]).includes(k)));
  const distintos = Object.fromEntries(Object.entries(permitidos).filter(([k, v]) => JSON.stringify((a as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null)));
  if (!Object.keys(distintos).length) return { accion: a, historialId: null };
  await comprobarReferencias(a.company_id, a.id, distintos);

  if (estado === "propuesto") {
    // Completar una propuesta no pide motivo, pero deja rastro igual: pasa por escribirTransicion, que
    // revierte la ficha si el historial no entra.
    const antes = Object.fromEntries(Object.keys(distintos).map((k) => [k, (a as Record<string, unknown>)[k] ?? null]));
    const { historialId } = await escribirTransicion(a, {
      ok: true,
      estado,
      cambios: { ...distintos, updated_at: new Date().toISOString() },
      historial: {
        action_id: a.id, accion: "modificar", antes: { estado, ...antes }, despues: { estado, ...distintos },
        motivo: (motivo ?? "").trim() || null, implica: (implica ?? "").trim() || null, actor_id: perfil.id, actor_rol: perfil.rol,
      },
    });
    return { accion: { ...a, ...(distintos as Partial<AccionPlan>) }, historialId };
  }
  const e = validarModificacion(estado, motivo, implica);
  if (e) throw new ReglaDelPlan(e);
  await exigirAutoridad(perfil, "aprobar_plan");
  const datos: DatosTransicion = { motivo, implica, cambios: distintos };
  // Marcar como prioridad una acción ya abierta abre un frente: se cuenta contra el límite igual que al
  // aprobar. Antes se aprobaba sin la marca y se marcaba después, y el límite no se enteraba.
  if (abreFrenteAlModificar(estado, distintos)) datos.frentes = await leerFrentes(a.company_id);
  const r = transicion(a, "modificar", { id: perfil.id, rol: perfil.rol }, datos);
  if (!r.ok) throw new ReglaDelPlan(r.error);
  const { historialId } = await escribirTransicion(a, r);
  return { accion: { ...a, ...(r.cambios as Partial<AccionPlan>) }, historialId };
}

/** Lo que se enlaza tiene que ser de la MISMA empresa: una ficha no puede apuntar a la persona, el indicador o la medición de otra. */
async function comprobarReferencias(companyId: string, actionId: string | null, cambios: Record<string, unknown>): Promise<void> {
  const sb = supabaseAdmin();
  const uuid = /^[0-9a-f-]{36}$/i;
  if (typeof cambios.responsable_participant_id === "string") {
    if (!uuid.test(cambios.responsable_participant_id)) throw new ReglaDelPlan("El responsable tiene que ser una persona registrada del equipo.");
    const { data } = await sb.from("participants").select("id").eq("id", cambios.responsable_participant_id).eq("company_id", companyId).maybeSingle();
    if (!data) throw new ReglaDelPlan("Esa persona no está registrada en el equipo de esta empresa.");
  }
  if (typeof cambios.indicador_id === "string") {
    const { data } = await sb.from("indicadores").select("id").eq("id", cambios.indicador_id).eq("company_id", companyId).maybeSingle();
    if (!data) throw new ReglaDelPlan("Ese indicador no es de esta empresa.");
  }
  if (typeof cambios.linea_base_id === "string") {
    const { data } = await sb.from("mediciones").select("id").eq("id", cambios.linea_base_id).eq("company_id", companyId).eq("tipo", "linea_base").maybeSingle();
    if (!data) throw new ReglaDelPlan("Esa línea base no es de esta empresa.");
  }
  if (Array.isArray(cambios.depende_de) && cambios.depende_de.length) {
    const ids = cambios.depende_de as string[];
    // Con `actionId` en nulo la acción todavía no existe (se está creando), así que no puede estar en la lista.
    if (actionId && ids.includes(actionId)) throw new ReglaDelPlan("Una acción no puede depender de sí misma.");
    const { data } = await sb.from("actions").select("id").eq("company_id", companyId).in("id", ids);
    if ((data ?? []).length !== ids.length) throw new ReglaDelPlan("Alguna de las acciones de las que depende no es de esta empresa.");
  }
}

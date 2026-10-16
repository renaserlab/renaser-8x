import { z } from "zod";
import { NextResponse } from "next/server";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { filasDeNumeros, VITAL_POR_CLAVE, RECONOCIDA_POR_CLAVE } from "@/lib/metricas";
import { conCifraDesplazada, escribirConservando, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";
import { nombreDePeriodo } from "@/lib/temporadas";
import { refrescarRuta } from "@/lib/ruta-datos";

/**
 * LOS NÚMEROS DEL NEGOCIO, contados por el propio dueño.
 *
 * Hasta hoy los números solo entraban por lo que la IA lograba pescar de la conversación, y por eso
 * la radiografía nunca se cerraba. Aquí el dueño los pone directo, y —lo que faltaba de verdad— los
 * pone POR MES: sin serie mensual no hay "cómo estuvo", no hay tendencia y no hay con qué comparar
 * después. Todo lo que entra por aquí es "contado" (lo dice de memoria), nunca "verificado".
 *
 * 13-10-2026: además de los nueve vitales se aceptan las claves reconocidas (hoy, los costos
 * variables del mes), tanto con número como declaradas «no lo sé». Sin ellas el dueño no tenía por
 * dónde dar el único dato que falta para su punto de equilibrio. Los costos variables también
 * pueden venir por mes, junto a la venta de ese mes: la razón solo existe con ambos del mismo mes.
 *
 * Qué clave entra y en qué periodo queda cada número lo decide `filasDeNumeros` (lib/metricas): es
 * la misma función que se prueba con el recorrido formulario → filas → derivados. Vitales y
 * reconocidas (CLAVES_VITALES y CLAVES_RECONOCIDAS) entran; cualquier otra clave se ignora.
 *
 * CIERRE Z1 (13-10-2026):
 *  - LO QUE EL DUEÑO ESCRIBE NO BORRA LO QUE DICE SU DOCUMENTO. Si para ese número y ese mes ya había
 *    una cifra extraída de un documento, lo que el dueño escribe queda como el número, y la del
 *    documento se conserva al lado (`cifra_desplazada`) para que el consultor vea las dos. Para eso la
 *    fila previa se lee ENTERA, y se comprueba que la lectura no falló.
 *  - UN NÚMERO YA VERIFICADO NO SE REEMPLAZA DESDE AQUÍ, Y SE DICE. Antes se saltaba y la respuesta
 *    era «guardado»: el dueño creía haberlo cambiado. Ahora la respuesta trae `no_guardados`, con qué
 *    número, de qué mes y por qué, y el mensaje lo dice en sus palabras.
 *  - Si hubiera dos filas para el mismo número y mes (la tabla no tiene restricción única), no se
 *    añade una tercera: se actualiza la más reciente.
 *  - «VERIFICADO» ES UNA CIFRA COMPROBADA, NO UNA FILA SIN CIFRA. Cuando el consultor acepta una lectura
 *    que no traía el número, la fila queda «sin dato» y conciliada: confirma que ESE documento no lo
 *    trae, no que el número esté verificado. Ahí el dueño sí puede dar su cifra (queda contada, y la
 *    fila deja de figurar como conciliada). Antes se le respondía «ya está verificado con un
 *    documento», que era falso; y si escribía 0, se daba por igual a «nada» y no se guardaba ni se decía.
 */
type NoGuardado = { clave: string; periodo: string; motivo: "verificado" | "error"; texto: string };

const nombreDe = (clave: string) => VITAL_POR_CLAVE.get(clave)?.nombre ?? RECONOCIDA_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");
/** «Ventas del mes» (Setiembre 2026); lo que no es de un mes va sin paréntesis. Al dueño se le habla de tú. */
function numeroEnPalabras(clave: string, periodo: string): string {
  const cuando = /^[0-9]{4}-[0-9]{2}$/.test(periodo) ? ` (${nombreDePeriodo(periodo)})` : periodo === "epoca_dorada" ? " (tu mejor época)" : "";
  return `«${nombreDe(clave)}»${cuando}`;
}

/** numeric de Postgres llega como texto. Lo que no es un número (null, cadena vacía) no es cero. */
function numeroDe(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const mes = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "el mes debe ser AAAA-MM");
const monto = z.number().finite().min(0).max(1_000_000_000);

const Cuerpo = z.object({
  /** Los vitales que no cambian mes a mes: caja, deudas, precio, costo, conversión. También las reconocidas sin mes. */
  vitales: z.record(z.string(), z.union([monto, z.null()])).optional(),
  /** La serie mensual: mes pasado, mejor mes y peor mes son tres puntos reales. Los costos variables van con el mes de su venta. */
  meses: z
    .array(
      z.object({
        periodo: mes,
        venta: monto.nullable(),
        ganancia: monto.nullable().optional(),
        gasto_fijo: monto.nullable().optional(),
        costo_variable: monto.nullable().optional(),
      })
    )
    .max(24)
    .optional(),
  /** El mejor mes de la historia, cuando fue hace más de un año y solo se recuerda el monto. */
  epoca_dorada: monto.nullable().optional(),
  /** En qué meses vende más y en cuáles menos. Cambia por completo cómo se lee una caída. */
  temporadas: z.object({ altas: z.array(z.string().max(20)).max(12), bajas: z.array(z.string().max(20)).max(12) }).optional(),
  /** Cuando el dueño dice que un número no lo sabe: eso es un hallazgo, no un vacío. */
  sin_dato: z.array(z.string().max(60)).max(12).optional(),
});

export const POST = protegido({}, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Todavía no tienes empresa.", 404);
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();

  // Qué entra y en qué periodo queda: una sola regla, la misma que se prueba sin base.
  const filas = filasDeNumeros(b);

  let guardados = 0;
  // NADA FALLA EN SILENCIO: antes un guardado que la base rechazaba se contaba igual como guardado
  // y la pantalla recargaba sin el número, sin decirle nada al dueño.
  const noGuardados: NoGuardado[] = [];
  /** El mensaje de la base, para el registro de errores: no va a la pantalla del dueño. */
  const tecnico: string[] = [];
  for (const f of filas) {
    const donde = `${f.clave}/${f.periodo}`;
    // La fila previa ENTERA y sin maybeSingle: con dos filas del mismo número la lectura fallaba, nadie
    // miraba el error y se insertaba una tercera. La más reciente primero.
    const { data: previas, error: errorLectura } = await sb
      .from("company_metricas")
      .select("*")
      .eq("company_id", companyId)
      .eq("clave", f.clave)
      .eq("periodo", f.periodo)
      .order("updated_at", { ascending: false });
    if (errorLectura) {
      noGuardados.push({ clave: f.clave, periodo: f.periodo, motivo: "error", texto: `${numeroEnPalabras(f.clave, f.periodo)} no se pudo guardar.` });
      tecnico.push(`${donde}: lectura: ${errorLectura.message}`);
      continue;
    }
    const existentes = (previas ?? []) as (MetricaGuardada & { id: string })[];
    // Un dato verificado o conciliado (salido de un documento y revisado) no lo pisa uno contado de
    // memoria, y se le dice al dueño. Pero el dueño SÍ puede corregir lo suyo: contado sobre contado
    // se reemplaza sin preguntar. (Lo que entra por aquí nunca es «verificado»: `filasDeNumeros` solo
    // produce contado o sin_dato.)
    // FIRME ES SOLO LO QUE TIENE CIFRA: una lectura aceptada «sin cifra» (sin dato y conciliada) no es
    // un número verificado, y no le cierra la puerta a la cifra del dueño.
    const firme = existentes.find((p) => numeroDe(p.valor) !== null && (p.estado === "verificado" || p.origen === "conciliado"));
    if (firme) {
      // Si escribió lo mismo que ya está verificado, no hay nada que decirle. Se compara número con
      // número: un valor ausente nunca es igual a 0.
      if (f.valor !== null && numeroDe(firme.valor) === f.valor) continue;
      noGuardados.push({
        clave: f.clave, periodo: f.periodo, motivo: "verificado",
        texto: `${numeroEnPalabras(f.clave, f.periodo)} ya está verificado con un documento y no se cambió por lo que escribiste.`,
      });
      continue;
    }
    const prev = existentes[0] ?? null;
    // «No lo sé» sobre un número que el consultor ya dejó sin cifra al revisar el documento: dicen lo
    // mismo. No se toca la fila, para no borrar la constancia de esa revisión.
    if (f.valor === null && existentes.some((p) => p.origen === "conciliado")) continue;
    // Lo que el dueño escribe aquí es DECLARADO: si reemplaza una cifra extraída de un documento, esa
    // cifra se conserva al lado, con su documento. Y la fila deja de atribuirse a la respuesta de
    // entrevista o al documento de los que salió el número anterior: esto lo escribió alguien en el
    // formulario, no consta quién. Sin esto, la revisión del documento mostraría la cifra del dueño
    // como si la hubiera leído del Excel, y al aceptarla quedaría «verificada» una cifra que el
    // documento no dice.
    const fila = conCifraDesplazada(
      {
        company_id: companyId, ...f, valor_texto: null, nota: null, updated_at: ahora,
        ...(prev?.response_id ? { response_id: null } : {}),
        ...(prev?.source_id ? { source_id: null } : {}),
        // Solo si la base tiene la columna (la fila previa la trae): no se nombra una columna que no existe.
        ...(prev && "origen" in prev && prev.origen !== "declarado" ? { origen: "declarado" } : {}),
      },
      prev,
      "declarado"
    );
    const { error } = prev
      ? await escribirConservando(fila, (x) => sb.from("company_metricas").update(x).eq("id", prev.id), donde)
      : await escribirConservando(fila, (x) => sb.from("company_metricas").insert(x), donde);
    if (error) {
      noGuardados.push({ clave: f.clave, periodo: f.periodo, motivo: "error", texto: `${numeroEnPalabras(f.clave, f.periodo)} no se pudo guardar.` });
      tecnico.push(`${donde}: ${error.message}`);
      continue;
    }
    guardados++;
  }

  if (b.temporadas) {
    const { data: empresa } = await sb.from("companies").select("ficha").eq("id", companyId).single();
    const ficha = {
      ...((empresa?.ficha ?? {}) as Record<string, unknown>),
      temporadas_altas: b.temporadas.altas,
      temporadas_bajas: b.temporadas.bajas,
    };
    await sb.from("companies").update({ ficha }).eq("id", companyId);
  }

  void registrar({
    companyId, actor: perfil, accion: "editar", entidad: "numeros",
    detalle: { guardados, no_guardados: noGuardados.length, meses: b.meses?.length ?? 0 }, ruta: "/api/portal/numeros", ip: ipDe(req),
  });
  const fallidos = noGuardados.filter((n) => n.motivo === "error");
  const verificados = noGuardados.filter((n) => n.motivo === "verificado");
  // Lo que viaja en la respuesta: qué números no se guardaron y por qué, sin el mensaje de la base.
  const no_guardados = noGuardados.map(({ clave, periodo, motivo, texto }) => ({ clave, periodo, motivo, texto }));
  if (fallidos.length > 0) {
    // El detalle técnico va al registro de errores; al dueño, una frase que pueda entender.
    void registrarError({
      ruta: "/api/portal/numeros", metodo: "POST", mensaje: `No se guardaron ${fallidos.length} número(s) del dueño`,
      detalle: tecnico.join(" | "), actorId: perfil.id, companyId,
    });
    const cuales = fallidos.map((n) => n.texto).join(" ");
    const mensaje =
      guardados > 0
        ? `No pudimos guardar ${fallidos.length} de tus números; los demás sí quedaron. ${cuales} Intenta de nuevo.`
        : `No pudimos guardar tus números. ${cuales} Intenta de nuevo.`;
    return NextResponse.json({ error: `${mensaje}${verificados.length ? ` ${verificados.map((n) => n.texto).join(" ")}` : ""}`, guardados, no_guardados }, { status: 500 });
  }
  if (verificados.length > 0) {
    // No es un fallo de la base, pero tampoco es «guardado»: el dueño tiene que saber que ese número
    // sigue como estaba. 409 para que la pantalla lo muestre en vez de recargar como si nada.
    const guardadosTexto = guardados === 0 ? "" : guardados === 1 ? "Guardamos 1 de tus números. " : `Guardamos ${guardados} de tus números. `;
    return NextResponse.json(
      { error: `${guardadosTexto}${verificados.map((n) => n.texto).join(" ")} Si ese dato cambió, cuéntaselo a tu consultor.`, guardados, no_guardados },
      { status: 409 }
    );
  }
  refrescarRuta(companyId, "ruta");
  return ok({ guardados, no_guardados });
});

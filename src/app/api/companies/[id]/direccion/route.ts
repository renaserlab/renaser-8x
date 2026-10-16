import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { porDefecto, type ConfigEmpresa } from "@/lib/formato";
import {
  borradorVigente, acordadaVigente, historial, prepararBorrador, actualizarBorrador, acordar, vistaCliente, formatoDeEmpresa,
  editarItem, agregarItem, darPorBueno, descartarItem, recuperarItem, anotarCifra, editarDimension, darPorBuenaDimension,
  BLOQUES_FICHA, TIPOS_ITEM, DIMENSIONES_DEPENDENCIA, ReglaDeFicha, BorradorCambio, type Ficha, type FichaGuardada,
} from "@/lib/ficha-direccion";

type Ctx = { params: Promise<{ id: string }> };

const bloque = z.enum(BLOQUES_FICHA);
const tipo = z.enum(TIPOS_ITEM);
const frase = z.string().trim().min(3).max(2000);
const item_id = z.string().trim().min(1).max(120);
const dimension = z.enum(DIMENSIONES_DEPENDENCIA);
const campo = z.string().trim().max(600).nullable().optional();

const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("preparar") }),
  z.object({ accion: z.literal("acordar"), ficha_id: uuid }),
  z.object({ accion: z.literal("editar"), ficha_id: uuid, bloque, item_id, texto: frase, tipo }),
  z.object({ accion: z.literal("agregar"), ficha_id: uuid, bloque, texto: frase, tipo }),
  z.object({ accion: z.literal("dar_por_bueno"), ficha_id: uuid, bloque, item_id }),
  z.object({ accion: z.literal("quitar"), ficha_id: uuid, bloque, item_id }),
  z.object({ accion: z.literal("recuperar"), ficha_id: uuid, bloque, item_id }),
  z.object({ accion: z.literal("anotar_numero"), ficha_id: uuid, clave: z.string().trim().min(1).max(40), momento: z.enum(["hoy", "deseado"]), valor: z.number().nonnegative().max(1e12) }),
  z.object({ accion: z.literal("dimension"), ficha_id: uuid, dimension, que_se_detiene: campo, podria_delegarse: campo, capacidad_falta: campo, aporta_valor: campo }),
  z.object({ accion: z.literal("dar_por_buena_dimension"), ficha_id: uuid, dimension }),
]);
type Peticion = z.infer<typeof Cuerpo>;

/**
 * LA FICHA DE DIRECCIÓN, PARA LEERLA. La consultora recibe el borrador, la versión acordada y el historial. El
 * dueño recibe SOLO la versión acordada y ya dicha en sus palabras (`vistaCliente`): ni el borrador, ni las notas
 * de trabajo, ni los identificadores de las fuentes viajan a su navegador.
 */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const acordada = await acordadaVigente(id, sb);
  if (perfil.rol !== "consultor") return ok({ acordada: acordada ? vistaCliente(acordada) : null });
  const [borrador, versiones] = await Promise.all([borradorVigente(id, sb), historial(id, sb)]);
  return ok({ borrador, acordada, historial: versiones });
});

/** Aplica una edición de la consultora sobre el borrador. Es pura: la ruta solo carga, llama y guarda. */
function aplicar(borrador: FichaGuardada, p: Exclude<Peticion, { accion: "preparar" | "acordar" }>, actorId: string, formato: ConfigEmpresa): Ficha {
  switch (p.accion) {
    case "editar":
      return editarItem(borrador, p.bloque, p.item_id, { texto: p.texto, tipo: p.tipo }, actorId);
    case "agregar":
      return agregarItem(borrador, p.bloque, { texto: p.texto, tipo: p.tipo, actorId });
    case "dar_por_bueno":
      return darPorBueno(borrador, p.bloque, p.item_id, actorId);
    case "quitar":
      return descartarItem(borrador, p.bloque, p.item_id, actorId);
    case "recuperar":
      return recuperarItem(borrador, p.bloque, p.item_id, actorId);
    case "anotar_numero":
      return anotarCifra(borrador, { clave: p.clave, momento: p.momento, valor: p.valor, actorId, formato });
    case "dimension":
      return editarDimension(
        borrador,
        p.dimension,
        { que_se_detiene: p.que_se_detiene, podria_delegarse: p.podria_delegarse, capacidad_falta: p.capacidad_falta, aporta_valor: p.aporta_valor },
        actorId
      );
    case "dar_por_buena_dimension":
      return darPorBuenaDimension(borrador, p.dimension, actorId);
  }
}

/**
 * LO QUE LA CONSULTORA HACE CON LA FICHA. «preparar» arma el borrador con lo que ya hay (nada se le vuelve a
 * preguntar al dueño). «acordar» exige la autoridad de aprobar y crea una versión nueva; la anterior queda como
 * «reemplazada». Proponer interpretaciones (lo único que llama al asistente) vive en ./interpretar, con su cupo.
 *
 * NINGUNA EDICIÓN PISA A OTRA. Cada edición se aplica sobre el borrador tal como está guardado en ese instante,
 * no sobre el que se pintó en la pantalla, y solo se guarda si la fila sigue en la revisión leída; si otro
 * guardado se adelantó (otra consultora, o el asistente dejando sus propuestas), se vuelve a leer y se aplica
 * encima (`actualizarBorrador`). Por eso se puede seguir corrigiendo frases mientras el asistente lee. Si el
 * borrador ya no es el de trabajo (se acordó, se abrió otro) o no dejó de cambiar, se responde 409 y no se guarda nada.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "ficha_direccion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const p = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();
  try {
    if (p.accion === "preparar") {
      const r = await prepararBorrador(id, sb, { creadaPor: perfil.id });
      return ok({ id: r.id, version: r.version, creada: r.creada });
    }

    const borrador = await borradorVigente(id, sb);
    if (!borrador || borrador.id !== p.ficha_id) return fallo("El borrador cambió mientras lo mirabas. Recarga la página antes de continuar.", 409);

    if (p.accion === "acordar") {
      const r = await acordar(borrador.id, perfil, sb);
      void registrar({
        companyId: id, actor: perfil, accion: "aprobar", entidad: "ficha_direccion", entidadId: r.id,
        detalle: { version: r.version, reemplaza: r.reemplazo_a }, ruta: "/api/companies/direccion", ip: ipDe(req),
      });
      return ok(r, 201);
    }

    // Un número se anota en la moneda de la empresa y con sus separadores: se lee su configuración, no se supone Perú.
    let formato: ConfigEmpresa = porDefecto;
    if (p.accion === "anotar_numero") {
      const { data: empresa, error } = await sb.from("companies").select("pais,moneda,idioma,zona_horaria").eq("id", id).maybeSingle();
      if (error) return fallo(`No se pudo leer la moneda de la empresa: ${error.message}`, 500);
      formato = formatoDeEmpresa(empresa);
    }
    await actualizarBorrador(id, borrador.id, sb, (actual) => aplicar(actual, p, perfil.id, formato));
    // Anotar, quitar o recuperar una frase puede mover un número, y un número movido cambia la distancia: se
    // vuelve a armar para que el cálculo use lo que hay ahora. Las demás ediciones no tocan ningún cálculo.
    if (p.accion === "anotar_numero" || p.accion === "quitar" || p.accion === "recuperar") await prepararBorrador(id, sb, { creadaPor: perfil.id });
    return ok({ id: borrador.id, version: borrador.version });
  } catch (e) {
    if (e instanceof ReglaDeFicha) return fallo(e.message, 400);
    if (e instanceof BorradorCambio) return fallo(e.message, 409);
    throw e;
  }
});

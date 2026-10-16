import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { desdeFila, ESTADOS_VALIDACION_VALOR } from "@/lib/kpis";
import { guardarValor, zonaDeEmpresa, horaCierreDeEmpresa, rastroDeValor } from "../../_registro";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; kid: string }> };

const Cuerpo = z.object({
  periodo: z.string().trim().min(4).max(20),
  /** null = este periodo no tiene dato. No se guarda cero ni se inventa nada. */
  valor: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).nullable(),
  fuente: texto(300).nullable().optional(),
  estado_validacion: z.enum(ESTADOS_VALIDACION_VALOR).nullable().optional(),
  nota: texto(400).nullable().optional(),
});

const RUTA = "/api/companies/kpis/valor";

/**
 * POST: registrar el valor de un periodo. Lo hace el dueño o la consultora: son los números de la
 * empresa. Todo pasa por `guardarValor` (el único camino, compartido con la ruta vieja), que aplica
 * `registrarValor`: el dueño registra siempre como «declarado»; conciliar o verificar lo hace la consultora
 * con documentos delante. Con `valor: null` no se inserta fila: el indicador queda «sin dato en <periodo>»
 * (salvo que el hueco sea de un periodo anterior al del valor actual) y el rastro lo dice. La falta de dato
 * nunca es cero. El periodo cierra en el reloj de la empresa, no en UTC.
 *
 * Un valor mensual queda además en «Tus números», igual que por la ruta vieja; si ahí ya hay un dato que no
 * se puede reemplazar, la respuesta trae `aviso`. Si el valor entró en la historia y algo de lo demás no
 * llegó a escribirse, primero se deja el rastro de lo guardado y después se responde el fallo, con una frase
 * para quien registra: el mensaje de la base va al registro de errores, no a la pantalla.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id, kid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Cuerpo);
  const sb = supabaseAdmin();

  const { data: fila } = await sb.from("indicadores").select("*").eq("id", kid).maybeSingle();
  if (!fila || fila.company_id !== id) return fallo("Ese indicador no es de esta empresa.", 404);
  const kpi = desdeFila(fila as Record<string, unknown>);

  const [zona, horaCierre] = await Promise.all([zonaDeEmpresa(sb, id), horaCierreDeEmpresa(sb, id)]);
  const r = await guardarValor(sb, kpi, b, perfil, { zona, horaCierre });
  if (!r.ok) {
    if (r.tecnico) void registrarError({ ruta: RUTA, metodo: "POST", mensaje: "No se guardó el valor de un indicador", detalle: r.tecnico, actorId: perfil.id, companyId: id });
    return fallo(r.motivo, r.status);
  }

  const rastro = { companyId: id, actor: perfil, entidad: "indicador_valor", entidadId: kid, ...rastroDeValor(kpi, r), ruta: RUTA, ip: ipDe(req) };
  if (r.sin_dato) {
    void registrar(rastro);
    refrescarRuta(id, "ruta");
    return ok({ sin_dato: true, texto: r.texto, es_periodo_anterior: r.es_periodo_anterior });
  }
  if (r.pendiente) {
    // El valor ya está en la historia: su rastro se escribe ANTES de responder que algo no terminó.
    await registrar(rastro);
    void registrarError({ ruta: RUTA, metodo: "POST", mensaje: `Valor de indicador guardado a medias: falta ${r.pendiente.que}`, detalle: r.pendiente.tecnico, actorId: perfil.id, companyId: id });
    return fallo(r.pendiente.motivo, 500);
  }

  void registrar(rastro);
  refrescarRuta(id, "ruta");
  return ok({ sin_dato: false, texto: r.texto, corregido: r.corregido, es_periodo_anterior: r.es_periodo_anterior, aviso: r.aviso }, r.corregido ? 200 : 201);
});

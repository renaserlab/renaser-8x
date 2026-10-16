import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { desdeFila, zonaDe } from "@/lib/kpis";
import { TusIndicadores, type IndicadorCliente, type UltimosValores } from "@/components/kpis/TusIndicadores";

export const dynamic = "force-dynamic";

/**
 * TUS INDICADORES — la pantalla del dueño. Qué mide cada uno, el último valor con su periodo y un botón
 * para registrar el de este periodo. Sin cero por defecto: un campo vacío es «sin dato». Sin jerga: aquí
 * no hay «KPI» ni «baseline». El nombre de quien lo cuenta no viaja; solo su puesto (frontera P0-03).
 */
export default async function KpisCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const sb = supabaseAdmin();
  const [{ data: filas }, { data: participantes }, { data: empresa }] = await Promise.all([
    sb.from("indicadores").select("*").eq("company_id", c.companyId).neq("estado", "archivado").order("created_at"),
    sb.from("participants").select("id,puesto,rol").eq("company_id", c.companyId),
    // Un periodo cierra en el reloj de la empresa. Si la columna no existe o viene vacía, America/Lima.
    sb.from("companies").select("zona_horaria").eq("id", c.companyId).maybeSingle(),
  ]);
  const zona = zonaDe((empresa as { zona_horaria?: unknown } | null)?.zona_horaria);
  const puestoDe = new Map((participantes ?? []).map((p) => [p.id as string, (p.puesto as string | null) ?? (p.rol as string | null) ?? null]));

  const indicadores: IndicadorCliente[] = ((filas ?? []) as Record<string, unknown>[]).map(desdeFila).map((k) => ({
    id: k.id,
    nombre: k.nombre,
    definicion: k.definicion,
    como_se_mide: k.como_se_mide,
    unidad: k.unidad,
    moneda: k.moneda,
    frecuencia: k.frecuencia,
    fuente: k.fuente,
    mejor_si: k.mejor_si,
    estado: k.estado,
    valor_actual: k.valor_actual,
    valor_actual_periodo: k.valor_actual_periodo,
    estado_validacion: k.estado_validacion,
    meta_valor: k.meta_valor,
    meta_texto: k.meta_texto,
    meta_plazo: k.meta_plazo,
    linea_base_valor: k.linea_base_valor,
    linea_base_periodo: k.linea_base_periodo,
    responsable_puesto: k.responsable_participant_id ? puestoDe.get(k.responsable_participant_id) ?? null : null,
  }));

  const ids = indicadores.map((i) => i.id);
  const { data: valoresRaw } = ids.length
    ? await sb.from("indicador_valores").select("indicador_id,periodo,valor").in("indicador_id", ids).order("periodo", { ascending: false }).limit(400)
    : { data: [] as { indicador_id: string; periodo: string; valor: number }[] };
  const valores: UltimosValores = ((valoresRaw ?? []) as Record<string, unknown>[]).map((v) => ({ indicador_id: String(v.indicador_id), periodo: String(v.periodo), valor: Number(v.valor) }));

  return (
    <>
      <p className="t-etiqueta">Los números que vigilas</p>
      <h1 className="t-titulo mt-2 mb-2">Tus indicadores</h1>
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Cada indicador dice qué mide, cada cuánto se anota y cuál fue el último valor. Si en un periodo no tienes el dato, se anota como sin dato, no como cero.
      </p>
      <TusIndicadores companyId={c.companyId} indicadores={indicadores} valores={valores} zona={zona} />
    </>
  );
}

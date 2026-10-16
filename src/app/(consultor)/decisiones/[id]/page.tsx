import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/base/Vacio";
import { verDecision } from "@/lib/decisiones";
import { TarjetaDecision } from "@/components/consultor/TarjetaDecision";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { derivados, type Metrica } from "@/lib/metricas";

export const dynamic = "force-dynamic";

export default async function UnaDecision({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await verDecision(id);
  if (!d) notFound();
  const sb = supabaseAdmin();
  // LOS NÚMEROS DE LA EMPRESA llegan a la tarjeta (D5): el equilibrio que se muestra es el de la
  // empresa, con su motivo cuando no existe. Sin esto la tarjeta aceptaba `numeros` y nadie los pasaba.
  const [{ data: e }, { data: metricasRaw, error: errorNumeros }] = await Promise.all([
    sb.from("companies").select("nombre").eq("id", d.decision.company_id).maybeSingle(),
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", d.decision.company_id).limit(300),
  ]);
  // SI LA LECTURA FALLA NO SE CALCULA SOBRE UNA LISTA VACÍA: eso diría «faltan tus ventas» de una
  // empresa que sí las tiene. Sin lectura no hay cifras, y la tarjeta lo dice.
  const numeros = errorNumeros ? null : derivados((metricasRaw ?? []) as Metrica[]);
  const avisoNumeros = errorNumeros
    ? "No se pudieron leer los números de esta empresa. No es que falten: recarga la página antes de decidir."
    : null;

  return (
    <>
      <Encabezado
        titulo="Decisión"
        sub={(e as { nombre: string } | null)?.nombre ?? undefined}
        acciones={<Link href="/decisiones" className="boton boton--secundario">Volver a la cola</Link>}
      />
      <TarjetaDecision decision={d.decision} historial={d.historial} falta={d.falta} numeros={numeros} avisoNumeros={avisoNumeros} />
    </>
  );
}

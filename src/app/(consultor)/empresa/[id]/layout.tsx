import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA } from "@/lib/textos";
import { TabsEmpresa, type Capa } from "@/components/consultor/TabsEmpresa";

/**
 * TRES CAPAS, EN EL ORDEN EN QUE SE LEE UNA EMPRESA (pedido de Dirección: «no quiero pantallas
 * desconectadas»; la consultora ve Resumen → Evidencia → Intervención).
 * — Resumen: cómo está la empresa y hacia dónde quiere ir.
 * — Evidencia: lo que la empresa dijo y mostró, y lo que de ahí se concluye.
 * — Intervención: lo que se propone, se acuerda, se mide y se entrega.
 * Toda carpeta con page.tsx bajo este directorio tiene que estar en una de las tres: lo vigila
 * tests/recorrido-conectado.test.ts. Una pantalla nueva sin pestaña hace fallar esa prueba.
 */
const CAPAS: Capa[] = [
  {
    rotulo: "Resumen",
    tabs: [
      ["", "Panorama"],
      ["/direccion", "Dirección empresarial"],
    ],
  },
  {
    rotulo: "Evidencia",
    tabs: [
      ["/fuentes", "Fuentes"],
      ["/afirmaciones", "Afirmaciones"],
      ["/realidad", "Realidad"],
      ["/entrevista", "Entrevista"],
      ["/dia", "El día"],
      ["/procesos", "Procesos"],
      ["/organigrama", "Organigrama"],
      ["/producto", "Producto"],
      ["/madurez", "Radiografía"],
      ["/diagnostico", "Diagnóstico"],
    ],
  },
  {
    rotulo: "Intervención",
    tabs: [
      ["/debe-ser", "Debe ser"],
      ["/plan-estrategico", "Plan estratégico"],
      ["/plan", "Plan"],
      ["/kpis", "Indicadores"],
      ["/revision", "Revisión semanal"],
      ["/excelencia", "Excelencia y aceleración"],
      ["/entrega", "Entrega"],
      ["/configuracion", "Configuración"],
    ],
  },
];

export default async function LayoutEmpresa({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = await supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision").eq("id", id).single();
  if (!c) notFound();
  return (
    <>
      <div className="no-imprimir mb-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <Link href={`/empresa/${id}`} className="t-seccion">{c.nombre}</Link>
          <span className="t-etiqueta">{ETAPA[c.etapa] ?? c.etapa}</span>
          {c.estado_admision !== "admitida" && <span className="t-etiqueta" style={{ color: "var(--caducado)" }}>{c.estado_admision}</span>}
        </div>
        <TabsEmpresa base={`/empresa/${id}`} capas={CAPAS} />
      </div>
      {children}
    </>
  );
}

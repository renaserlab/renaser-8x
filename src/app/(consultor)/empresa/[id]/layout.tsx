import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA } from "@/lib/textos";
import { TabsEmpresa, type Capa } from "@/components/consultor/TabsEmpresa";
import { BarraRuta } from "@/components/navegacion/BarraRuta";
import { avanceDeEmpresa } from "@/lib/ruta-datos";

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
      ["/producto", "Producto y rentabilidad"],
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
  // La empresa y su avance se leen a la vez. La barra informa: si su lectura falla, la empresa abre igual.
  const [{ data: c }, avance] = await Promise.all([
    supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision").eq("id", id).single(),
    avanceDeEmpresa(id).catch((e: unknown) => {
      console.error("[ruta] no se pudo leer el avance de la empresa", id, e);
      return "fallo" as const;
    }),
  ]);
  if (!c) notFound();
  return (
    <>
      {/* Arriba de todo, el avance de la empresa en su ruta (pedido de Kelin, 16-10-2026). No es navegación. */}
      <BarraRuta avance={avance === "fallo" ? null : avance} fallo={avance === "fallo"} para="consultora" enlace={`/empresa/${id}#ruta`} />
      <div className="no-imprimir mb-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <Link href={`/empresa/${id}`} className="t-seccion">{c.nombre}</Link>
          <span className="t-etiqueta">{ETAPA[c.etapa] ?? c.etapa}</span>
          {c.estado_admision !== "admitida" && <span className="t-etiqueta" style={{ color: "var(--caducado)" }}>{c.estado_admision}</span>}
        </div>
      </div>
      {/* En escritorio, las secciones de la empresa en una columna a la izquierda y la pantalla a la derecha;
          en celular, las capas en filas que se deslizan, encima de la pantalla. */}
      <div className="empresa-rejilla">
        <TabsEmpresa base={`/empresa/${id}`} capas={CAPAS} />
        <div className="empresa-pantalla">{children}</div>
      </div>
    </>
  );
}

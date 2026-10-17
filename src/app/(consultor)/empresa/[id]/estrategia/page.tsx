import { leerPantallaEstrategia } from "@/lib/estrategia/pantalla-datos";
import { PantallaEstrategia } from "@/components/estrategia/PantallaEstrategia";
import { DocumentoCompleto } from "@/components/estrategia/DocumentoCompleto";

export const dynamic = "force-dynamic";

/** «?v=3» → 3; lo que no es un número de versión, nada (se abre la de siempre). */
function numeroDe(v: string | string[] | undefined): number | null {
  const t = Array.isArray(v) ? v[0] : v;
  return t && /^[1-9]\d{0,5}$/.test(t) ? Number(t) : null;
}

/**
 * LA ESTRATEGIA DE LA EMPRESA (spec-estrategia-8x.md §8.1): la primera pantalla de la vista «Estrategia», en lugar de
 * la pestaña «Plan estratégico» (que redirige aquí). Sin estrategia, con qué se haría y un solo botón; generándose, en
 * qué va cada etapa; lista, la lectura y la gran apuesta arriba, los dos caminos lado a lado, elegir y aprobar viendo lo
 * que leerá el cliente, y lo demás plegado. `?v=N` abre otra versión; `?vista=documento`, la vista para imprimir.
 *
 * Lee con el servidor y filtra por la empresa en cada consulta (src/lib/estrategia/pantalla-datos.ts). Lo que se
 * escribe, se escribe por las rutas de src/app/api/companies/[id]/estrategia/**, con su sesión y su rastro.
 */
export default async function PaginaEstrategia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const d = await leerPantallaEstrategia(id, { v: numeroDe(q.v) });
  if (q.vista === "documento" && d.tipo === "estrategia") {
    return <DocumentoCompleto x={d.vista} empresa={d.empresa.nombre} volver={`/empresa/${id}/estrategia?v=${d.vista.v.version}`} />;
  }
  return <PantallaEstrategia d={d} />;
}

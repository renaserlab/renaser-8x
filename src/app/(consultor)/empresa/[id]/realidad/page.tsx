import { Encabezado } from "@/components/base/Vacio";
import { MatrizRealidad } from "@/components/realidad/MatrizRealidad";

/** EL ESPEJO: tres columnas. Las diferencias entre la segunda y la tercera son el momento espejo. Capítulo 13. */
export default async function Realidad({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ estado?: string; vista?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const vista = sp.vista === "tabla" ? "consultor" : "espejo";
  return (
    <>
      <Encabezado
        titulo="Matriz de Realidad"
        sub="Lo que dicen los documentos · lo que dijo el dueño · lo que dijo el equipo. Clic en una fila abre la fuente."
        acciones={
          <>
            <a href={`/empresa/${id}/realidad`} className={`boton ${vista === "espejo" ? "" : "boton--secundario"}`}>El Espejo</a>
            <a href={`/empresa/${id}/realidad?vista=tabla`} className={`boton ${vista === "consultor" ? "" : "boton--secundario"}`}>Tabla</a>
          </>
        }
      />
      <MatrizRealidad companyId={id} modo={vista} filtroInicial={{ estado: sp.estado }} />
    </>
  );
}

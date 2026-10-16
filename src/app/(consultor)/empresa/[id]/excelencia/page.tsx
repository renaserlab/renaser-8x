import { Encabezado, Vacio } from "@/components/base/Vacio";
import { TableroIniciativas } from "@/components/iniciativas/TableroIniciativas";
import { cargarTablero } from "@/app/api/companies/[id]/iniciativas/_datos";

export const dynamic = "force-dynamic";

/**
 * EXCELENCIA, SERVICIO Y ACELERACIÓN, vista de la consultora. El Nivel 2 no son más indicadores: son
 * apuestas. Cada una con su hipótesis, la evidencia o la fuente que la sustenta, los recursos que pide, su
 * plazo, cómo se sabrá si funcionó y qué tiene que verse para continuar, ajustar o detener.
 *
 * Todo lo que se calcula aquí es determinista (src/lib/iniciativas.ts) y se calcula al pedir la página,
 * con la fecha de la empresa: por eso «plazo cumplido» aparece solo con el paso de los días. Si la base
 * todavía no tiene las tablas, la página lo dice en vez de mostrar un tablero vacío.
 */
export default async function ExcelenciaPag({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tablero = await cargarTablero(id);

  return (
    <>
      <Encabezado
        titulo="Excelencia, servicio y aceleración"
        sub="Cada iniciativa es una apuesta: qué creemos que va a pasar, en qué nos apoyamos, qué pide, hasta cuándo se prueba, cómo sabremos si funcionó y qué tiene que verse para continuar, ajustar o detener. El dueño ve solo lo aprobado y lo que está en curso."
      />
      {tablero.disponible ? <TableroIniciativas companyId={id} tablero={tablero} /> : <Vacio texto={tablero.motivo} />}
    </>
  );
}

import { avanceDeEmpresa } from "@/lib/ruta-datos";
import { vistaDueno, type AvanceRuta } from "@/lib/ruta";
import { Tramos, lineaDia, textoPct } from "@/components/navegacion/BarraRuta";

/**
 * La barra de avance que ve el dueño, arriba de todo su portal (pedido de Kelin, 16-10-2026). Es la misma ruta
 * que ve la consultora, pasada por `vistaDueno`: las etapas con su nombre para el dueño y el % de la que está
 * en curso; sin criterios, sin notas, sin veredictos. Si la consultora todavía no eligió el tipo de trabajo, no
 * se pinta nada: al dueño no se le muestra una barra vacía ni un aviso que no le toca resolver.
 * Se lee una vez por petición (avanceDeEmpresa va en cache()) y de la caché por empresa de src/lib/ruta-datos.ts, en
 * paralelo con la página: un guardado del dueño no vuelve a leer las 15 tablas de la ruta.
 */
export async function BarraRutaCliente({ companyId }: { companyId: string }) {
  let avance: AvanceRuta | null;
  try {
    avance = await avanceDeEmpresa(companyId);
  } catch (e) {
    // La barra informa; no puede tumbar el portal. El error queda en el registro del servidor.
    console.error("[ruta] no se pudo leer el avance para el portal", companyId, e);
    return null;
  }
  if (!avance?.tipo) return null;

  const dueno = vistaDueno(avance);
  // Nombre para el dueño y días previstos de cada etapa, por su clave (el ancho del tramo dice cuánto dura).
  const deEtapa = new Map(avance.etapas.map((e) => [e.clave, { nombre: e.nombreDueno, dias: e.hastaDia - e.desdeDia + 1 }]));
  const actual = dueno.etapas.find((e) => e.clave === dueno.actual) ?? null;
  const nombreActual = actual ? (deEtapa.get(actual.clave)?.nombre ?? actual.nombre) : null;
  // Al dueño no se le dice lo que «prevé» la etapa: se lee como atraso y no es su palabra. Solo en qué día va.
  const linea = dueno.dia !== null && dueno.dia >= 1 ? `Día ${dueno.dia} de tu ruta` : lineaDia(dueno.dia, avance.inicio, null);

  return (
    <section className="barra-ruta barra-ruta--dueno no-imprimir" aria-label="Tu avance">
      <div className="barra-ruta__cabeza">
        <p className="barra-ruta__titulo">
          {actual ? (
            <>
              Vamos en <b>{nombreActual}</b> · {textoPct(actual.pct)}
            </>
          ) : (
            <b>Terminamos la ruta</b>
          )}
        </p>
        {linea && <p className="barra-ruta__dia">{linea}</p>}
      </div>
      <Tramos
        tramos={dueno.etapas.map((e) => ({
          clave: e.clave,
          nombre: deEtapa.get(e.clave)?.nombre ?? e.nombre,
          estado: e.estado,
          pct: e.pct,
          dias: deEtapa.get(e.clave)?.dias ?? 1,
        }))}
      />
    </section>
  );
}

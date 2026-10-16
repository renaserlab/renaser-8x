import { SECCION, type Seccion, type Solicitud } from "@/lib/secciones";
import { pedidosDelDueno, seccionDe, puedeLlenar, type QuienMira } from "./datos";
import { ListoParaConsultora } from "./ListoParaConsultora";

/**
 * LO QUE PIDIÓ LA CONSULTORA, ARRIBA DE LA PANTALLA QUE LO RESUELVE (16-10-2026).
 *
 * Kelin: «si hay cosas por corroborar, yo activarle esa vista y que lo llene; si le falta algo, yo activarlo y lo
 * llene». En las pantallas de confirmar y de subir que ya existían («Confirmar información», «Tus números», «Tus
 * documentos») la solicitud activa sale PRIMERO, con su nota; y al final de la pantalla, «Listo, ya lo llené». Sin
 * solicitud activa no se pinta nada arriba (abajo, si ya avisó, cuándo). Una sola lectura de lo pedido por pantalla.
 * SERVIDOR: lo usan las páginas.
 */
export type PedidoDeSecciones = {
  companyId: string;
  zona?: string;
  quien: { puede: boolean; comoConsultora: boolean };
  /** Por sección pedida: la solicitud activa (si la hay) y el último aviso de «listo». */
  porSeccion: { seccion: Seccion; activa: Solicitud | null; completada: Solicitud | null }[];
};

export async function pedidoDeSecciones(companyId: string, secciones: Seccion[], u: QuienMira, zona?: string): Promise<PedidoDeSecciones> {
  const [pedidos, quien] = await Promise.all([pedidosDelDueno(companyId), puedeLlenar(u, companyId)]);
  const lista = pedidos.ok ? pedidos.valor : null;
  return { companyId, zona, quien, porSeccion: secciones.map((s) => ({ seccion: s, ...seccionDe(lista, s) })) };
}

/** Arriba: lo pedido, con la nota de la consultora. Nada si no hay pedido activo. */
export function AvisoPedido({ p, que }: { p: PedidoDeSecciones; que?: string }) {
  const activas = p.porSeccion.filter((x) => x.activa);
  if (!activas.length) return null;
  return (
    <div className="flex flex-col gap-3 mb-8">
      {activas.map(({ seccion, activa }) => (
        <section key={seccion} className="panel p-5 medida" style={{ background: "var(--suave)" }} aria-label="Lo que te pidió tu consultora">
          <h2 className="t-seccion" style={{ fontSize: 18 }}>Tu consultora te pidió: {SECCION[seccion].paraDueno.toLowerCase()}</h2>
          {activa!.nota && <p className="t-cuerpo mt-2">«{activa!.nota}»</p>}
          <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>{que ?? "Está aquí abajo."} Cuando termines, avísale al final de esta pantalla.</p>
        </section>
      ))}
    </div>
  );
}

/** Abajo: «Listo, ya lo llené» por cada sección pedida (o cuándo se avisó). */
export function ListoPedido({ p }: { p: PedidoDeSecciones }) {
  const conAlgo = p.porSeccion.filter((x) => x.activa || x.completada);
  return (
    <>
      {conAlgo.map(({ seccion, activa, completada }) => (
        <ListoParaConsultora
          key={seccion}
          companyId={p.companyId}
          solicitudId={activa?.id ?? null}
          completadaAt={completada?.completada_at ?? null}
          puede={p.quien.puede}
          comoConsultora={p.quien.comoConsultora}
          zona={p.zona}
          que={conAlgo.length > 1 ? SECCION[seccion].paraDueno : undefined}
        />
      ))}
    </>
  );
}

"use client";
import { Canvas, type NodoDB, type EdgeDB } from "./Canvas";

/** Vista comparada: AS-IS y TO-BE lado a lado. Los remove tachados; los create resaltados. Capítulo 15.4. */
export function Comparada({ companyId, asis, tobe, paraCliente = false }: { companyId: string; asis: { id: string; nombre: string; nodos: NodoDB[]; edges: EdgeDB[] }; tobe: { id: string; nombre: string; nodos: NodoDB[]; edges: EdgeDB[] } | null; paraCliente?: boolean }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section>
        <h2 className="t-seccion mb-3">{paraCliente ? "Cómo funciona hoy" : "AS-IS"}</h2>
        <Canvas processId={asis.id} companyId={companyId} nombre={asis.nombre} nodos={asis.nodos} edges={asis.edges} soloLectura paraCliente={paraCliente} alto="56vh" />
      </section>
      <section>
        <h2 className="t-seccion mb-3">{paraCliente ? "Cómo debería funcionar" : "TO-BE"}</h2>
        {tobe ? (
          <Canvas processId={tobe.id} companyId={companyId} nombre={tobe.nombre} nodos={tobe.nodos} edges={tobe.edges} soloLectura paraCliente={paraCliente} alto="56vh" />
        ) : (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Todavía no hay rediseño de este proceso.</p>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { Encabezado } from "@/components/base/Vacio";
import { mapaConDatos, agentesFueraDelMapa, NODOS } from "@/lib/mapa-sistema";
import { MapaSistema } from "@/components/consultor/MapaSistema";

export const dynamic = "force-dynamic";

/** EL VISOR DEL SISTEMA (manual §7): qué agentes y automatizaciones existen y cómo se conectan. */
export default async function Mapa() {
  const { nodos, aristas, autoEncola } = await mapaConDatos();
  const fuera = agentesFueraDelMapa();
  const conEjecuciones = nodos.filter((n) => n.trabajos > 0).length;
  const soloManual = nodos.filter((n) => n.encola.filter((t) => t !== n.tipo).length === 0).length;

  return (
    <>
      <Encabezado
        titulo="El sistema, dibujado"
        sub="Cada caja es un tipo de trabajo; cada flecha, una llamada real a la cola dentro del código. Toca una caja para ver qué la dispara, qué entrega y el contrato de sus agentes."
        acciones={
          <>
            <Link href="/torre" className="boton boton--secundario">Sistema configurado</Link>
            <Link href="/torre?vista=ejecuciones" className="boton boton--secundario">Ejecución real</Link>
          </>
        }
      />

      <section className="fila-numeros" style={{ marginBottom: 18 }}>
        <div>
          <div className="t-etiqueta">Tipos de trabajo</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{NODOS.length}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>{conEjecuciones} con ejecuciones recuperables</div>
        </div>
        <div>
          <div className="t-etiqueta">Se encadenan solos</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{aristas.length}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>enlaces automáticos entre trabajos</div>
        </div>
        <div>
          <div className="t-etiqueta">Necesitan que alguien los dispare</div>
          <div className="t-dato" style={{ fontSize: 24, fontWeight: 600 }}>{soloManual}</div>
          <div className="t-dato" style={{ color: "var(--grafito)" }}>de {NODOS.length}: 8X encadena menos de lo que parece</div>
        </div>
      </section>

      <MapaSistema nodos={nodos} aristas={aristas} autoEncola={autoEncola} />

      {fuera.length > 0 && (
        <p className="t-dato" style={{ color: "var(--caducado)", marginTop: 12 }}>
          Agentes con contrato que no aparecen en ningún nodo del mapa: {fuera.join(", ")}. O se conectan, o sobra su contrato.
        </p>
      )}
    </>
  );
}

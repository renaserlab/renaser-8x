import Link from "next/link";
import { Icono } from "@/components/base/Icono";
import { Segmentos } from "@/components/tablero/Piezas";

/**
 * LO ÚNICO ARRIBA EN PROCESOS (vista Estructura, 16-10-2026): cuántos procesos están dibujados frente a los que la
 * empresa necesita por su tamaño y su tipo, en qué nivel medio están, y la misma barra del bloque «Procesos» del
 * Diagnóstico: medidos, escritos, dibujados sin escribir y, rayado, lo que falta dibujar.
 *
 * Presentacional: recibe la cuenta ya hecha (conteoProcesos de src/lib/diagnostico-tablero.ts sobre mapaDe). `null`
 * quiere decir que el mapa no se pudo leer, que no es lo mismo que «no hay procesos»: se dice distinto.
 */

/** Lo que se pinta de la cuenta de procesos. Es un subconjunto de BloqueProcesos: sirve tal cual lo da conteoProcesos. */
export type ConteoParaResumen = {
  esperados: number;
  dibujados: number;
  conResponsable: number;
  escritos: number;
  medidos: number;
  /** Nivel medio de 0 a 5 contando lo que falta dibujar; null si no hay con qué. */
  nivel: number | null;
  nombreNivel: string | null;
  lista: { nivel: number }[];
};

export type ParteSegmento = { n: number; texto: string; tipo: "s1" | "s2" | "s3" | "s4" };

/**
 * Los tramos de la barra, sacados del nivel de cada proceso dibujado: medidos (nivel 4 o más), escritos (nivel 3),
 * dibujados sin escribir (nivel 1 o 2) y por dibujar (rayado: esperados menos dibujados). Los tres primeros suman
 * los dibujados; nada se cuenta dos veces.
 */
export function partesProcesos(c: ConteoParaResumen): ParteSegmento[] {
  const medidos = c.lista.filter((p) => p.nivel >= 4).length;
  const escritos = c.lista.filter((p) => p.nivel === 3).length;
  const sinEscribir = Math.max(0, c.dibujados - medidos - escritos);
  return [
    { n: medidos, texto: "medidos", tipo: "s1" },
    { n: escritos, texto: "escritos", tipo: "s2" },
    { n: sinEscribir, texto: "dibujados sin escribir", tipo: "s4" },
    { n: Math.max(0, c.esperados - c.dibujados), texto: "por dibujar", tipo: "s3" },
  ];
}

const decimal = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

export function ResumenProcesos({ conteo, base }: { conteo: ConteoParaResumen | null; base: string }) {
  const vacio = conteo !== null && conteo.dibujados === 0 && conteo.esperados === 0;
  const partes = conteo ? partesProcesos(conteo) : [];
  return (
    <div className="tablero">
      <section className="tarjeta a-lo-ancho" aria-labelledby="t-resumen-procesos">
        <div className="cabeza">
          <div>
            <h2 id="t-resumen-procesos">Procesos de la empresa</h2>
            <p className="sub">Lo dibujado frente a lo que esta empresa necesita por su tamaño y su tipo</p>
          </div>
          <Link className="ir" href={`${base}/madurez`} aria-label="Ver la radiografía: qué pide cada nivel" title="Ver la radiografía">
            <Icono nombre="diagonal" />
          </Link>
        </div>
        {conteo === null ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>No se pudo leer el mapa de procesos: vuelve a cargar la página</p>
        ) : vacio ? (
          <p className="sin-dato" style={{ marginTop: 14 }}>Todavía no hay procesos dibujados</p>
        ) : (
          <>
            <div className="fila-cifra" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <span className="grande">
                {conteo.dibujados}
                <small>de {conteo.esperados} procesos dibujados</small>
              </span>
              {conteo.nivel === null ? (
                <span className="sin-dato">nivel medio: sin dato</span>
              ) : (
                <span className="nota">
                  · nivel medio {decimal(conteo.nivel)} de 5{conteo.nombreNivel ? ` (${conteo.nombreNivel})` : ""}
                </span>
              )}
            </div>
            <Segmentos
              etiqueta={partes.map((p) => `${p.n} ${p.texto}`).join(", ")}
              partes={partes}
            />
            <p className="nota" style={{ marginTop: 8 }}>
              Con responsable: {conteo.conResponsable} · escritos: {conteo.escritos} · medidos: {conteo.medidos}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

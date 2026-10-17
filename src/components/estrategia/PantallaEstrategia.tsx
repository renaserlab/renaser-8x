import Link from "next/link";
import type { DatosPantalla } from "@/lib/estrategia/pantalla-datos";
import { ESTADO_VERSION, esperaEnPalabras, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import type { ResumenVersion } from "@/lib/estrategia/datos";
import { PANTALLA } from "@/lib/estrategia/textos";
import { SelectorVersion, ActualizarNumeros } from "./Acciones";
import { Etapas } from "./Etapas";
import { Preparacion } from "./Preparacion";
import { LecturaYApuesta } from "./LecturaYApuesta";
import { DosCaminos } from "./DosCaminos";
import { PorResolver } from "./PorResolver";
import { Aprobacion } from "./Aprobacion";
import { RevisarPreguntas } from "./RevisarPreguntas";
import { QueCambio } from "./QueCambio";
import { PrimerosDias, Versiones, textoDeVersion } from "./Grupos";
import { Analisis } from "./Analisis";
import { ComoSeArmo } from "./ComoSeArmo";

/*
CONTRATO DE DIRECCIÓN — la estrategia de una empresa, para la consultora (spec-estrategia-8x.md §8.1)
THESIS: en diez segundos, dónde está la empresa y cuál es la gran apuesta; debajo, los dos caminos lado a lado para
  elegir; elegido uno, la página del dueño tal como la verá y «Aprobar». Lo demás, plegado en cuatro grupos.
OWN-WORLD: el tablero de Diagnóstico: cielo, tarjetas blancas, Manrope en las cifras, el chip de origen al lado de cada
  una. Una sola acción principal a la vista en cada momento.
FINISH: ninguna cifra la escribió el modelo: cada una sale de las cuentas del código, con su origen, y lo que falta va
  rayado y con su nombre, nunca como cero. Ningún id a la vista, tampoco para la consultora.
*/

function Cabecera({ d, version, documento }: { d: DatosPantalla; version: ResumenVersion | null; documento: boolean }) {
  const versiones = "versiones" in d ? d.versiones : [];
  return (
    <header className="a-lo-ancho estrategia-cabeza">
      <h1 className="estrategia-cabeza__titulo">{PANTALLA.titulo}</h1>
      <div className="estrategia-cabeza__version no-imprimir">
        {/* Con varias versiones, el selector («Versión 3 · 17/10/2026 · aprobada»); con una sola, su línea y su estado. */}
        {version && versiones.length > 1 && <SelectorVersion opciones={versiones.map((v) => ({ version: v.version, texto: textoDeVersion(v, d.empresa.zona) }))} actual={version.version} />}
        {version && versiones.length <= 1 && (
          <>
            <span className="t-dato selector-version--solo">{textoDeVersion(version, d.empresa.zona, false)}</span>
            <span className={`estado ${ESTADO_VERSION[version.estado].clase}`}>{ESTADO_VERSION[version.estado].texto}</span>
          </>
        )}
        {documento && version && (
          <Link href={`?v=${version.version}&vista=documento`} className="enlace-azul">
            {PANTALLA.para_imprimir}
          </Link>
        )}
      </div>
    </header>
  );
}

/** Las preguntas propuestas, con lo que destraba cada una dicho contra la versión que se ve. */
function preguntasParaRevisar(x: VistaEstrategia) {
  return x.preguntas.filter((p) => p.estado === "propuesta").map((p) => ({ id: p.id, texto: p.texto, por_que: p.por_que, esperan: esperaEnPalabras(p.espera, x.e, x.v.version) }));
}

function Estrategia({ d }: { d: Extract<DatosPantalla, { tipo: "estrategia" }> }) {
  const { vista: x, detalle, versiones, empresa } = d;
  const nuevas = detalle.respuestas_nuevas ?? 0;
  const hayEnCurso = !!d.enCurso;
  const propuestas = preguntasParaRevisar(x);
  const enviadas = x.preguntas.filter((p) => p.estado === "enviada").length;
  const resumen = versiones.find((v) => v.id === x.v.id) ?? null;
  return (
    <div className="tablero estrategia">
      <Cabecera d={d} version={resumen} documento />

      {d.enCurso && (
        <p className="franja-accion a-lo-ancho" role="status">
          <span>{PANTALLA.otra_en_curso(d.enCurso.version)}</span>
          <Link href={`?v=${d.enCurso.version}`} className="franja-accion__boton">
            {PANTALLA.ver_en_que_va}
          </Link>
        </p>
      )}
      {nuevas > 0 && !hayEnCurso && x.v.salida && (
        <div className="franja-accion franja-accion--fuerte a-lo-ancho" role="status">
          <span>{PANTALLA.respondio(nuevas)}</span>
          <ActualizarNumeros companyId={empresa.id} eid={x.v.id} />
        </div>
      )}
      <QueCambio x={x} detalle={detalle} versiones={versiones} puedeRegenerar={!hayEnCurso} />

      <LecturaYApuesta x={x} />
      <DosCaminos x={x} />
      <PorResolver x={x} />
      <Aprobacion x={x} />
      <div className="a-lo-ancho">
        <RevisarPreguntas companyId={empresa.id} estrategiaId={x.v.id} empresa={empresa.nombre} propuestas={propuestas} enviadas={enviadas} resumen={d.envio?.resumen ?? ""} />
      </div>

      <PrimerosDias x={x} />
      <Analisis x={x} />
      <ComoSeArmo x={x} />
      <Versiones x={x} versiones={versiones} zona={empresa.zona} companyId={empresa.id} hayEnCurso={hayEnCurso} />
    </div>
  );
}

export function PantallaEstrategia({ d }: { d: DatosPantalla }) {
  switch (d.tipo) {
    case "no_habilitada":
      return (
        <div className="tablero estrategia">
          <Cabecera d={d} version={null} documento={false} />
          <p className="tarjeta a-lo-ancho aviso-suave" role="status">
            {d.texto}
          </p>
        </div>
      );
    case "no_existe":
      return (
        <div className="tablero estrategia">
          <Cabecera d={d} version={null} documento={false} />
          <p className="tarjeta a-lo-ancho" role="status">
            {PANTALLA.no_existe(d.v)}{" "}
            <Link href={`/empresa/${d.empresa.id}/estrategia`} className="enlace-azul">
              {PANTALLA.ver_la_ultima}
            </Link>
          </p>
        </div>
      );
    case "preparacion":
      return (
        <div className="tablero estrategia">
          <Cabecera d={d} version={null} documento={false} />
          <Preparacion d={d} />
          {d.versiones.length > 0 && <Versiones x={null} versiones={d.versiones} zona={d.empresa.zona} companyId={d.empresa.id} hayEnCurso={false} acciones={false} />}
        </div>
      );
    case "generando":
      return (
        <div className="tablero estrategia">
          <Cabecera d={d} version={d.version} documento={false} />
          <section className="tarjeta a-lo-ancho generando" aria-labelledby="t-generando">
            <div className="cabeza">
              <div>
                <h2 id="t-generando">{PANTALLA.generando(d.version.version)}</h2>
                <p className="sub">{PANTALLA.generando_sub}</p>
              </div>
            </div>
            <Etapas companyId={d.empresa.id} eid={d.version.id} inicial={d.etapas} />
          </section>
          {d.versiones.length > 1 && <Versiones x={null} versiones={d.versiones} zona={d.empresa.zona} companyId={d.empresa.id} hayEnCurso />}
        </div>
      );
    case "descartada":
      return (
        <div className="tablero estrategia">
          <Cabecera d={d} version={d.version} documento={false} />
          <section className="tarjeta a-lo-ancho" aria-labelledby="t-descartada">
            <div className="cabeza">
              <div>
                <h2 id="t-descartada">{PANTALLA.descartada(d.version.version)}</h2>
                <p className="sub">{PANTALLA.descartada_sub}</p>
              </div>
            </div>
            {d.motivo && <p className="nota">{d.motivo}</p>}
          </section>
          <Versiones x={null} versiones={d.versiones} zona={d.empresa.zona} companyId={d.empresa.id} hayEnCurso={d.versiones.some((v) => v.estado === "en_curso")} />
        </div>
      );
    case "estrategia":
      return <Estrategia d={d} />;
  }
}

import Link from "next/link";
import { fechaCorta } from "@/lib/textos";
import { DibujarDesdeArchivo } from "./DibujarDesdeArchivo";
import { AbrirArchivo } from "./AbrirArchivo";
import { QUE_HACER_NO_SE_PUDO, estadoSubida, rotuloSubida, sePuedeDibujar, type FuenteSubida } from "./subidas";

type Props = {
  processId: string;
  /** Los archivos de este proceso, del más nuevo al más viejo. null = no se pudieron leer. */
  fuentes: FuenteSubida[] | null;
  /** ¿Tiene ya pasos dibujados? Entonces dibujar con un archivo es «volver a dibujarlo», y se confirma. */
  dibujado: boolean;
  modo: "dueno" | "consultora";
  /** Para la consultora: dónde ver el motivo de una lectura que falló. */
  enlaceFuentes?: string;
};

/**
 * EL ARCHIVO DE UN PROCESO Y SU DIBUJO (16-10-2026), en la ficha del proceso (la del dueño y la de la consultora).
 *
 * Sin dibujar: va ARRIBA del lienzo y dice qué hacer: con archivo, esperar a que se lea y pulsar «Dibujarlo con lo que
 * subiste»; sin archivo, subirle uno (en «Archivos de este proceso») o dibujarlo a mano. Ya dibujado: va plegado,
 * para quien quiera volver a dibujarlo con un archivo (se confirma, porque reemplaza lo dibujado).
 *
 * Cada archivo con su estado (subido y leyéndose, leído y listo para dibujar, no se pudo leer con qué hacer) y un
 * enlace para abrirlo. Componente de servidor: lo único que corre en el navegador son los dos botones.
 */
export function ArchivosDelProceso({ processId, fuentes, dibujado, modo, enlaceFuentes }: Props) {
  const dueno = modo === "dueno";
  const lista = fuentes ?? [];
  if (dibujado && !lista.some((f) => sePuedeDibujar(estadoSubida(f)))) return null;

  const filas = (
    <ul className="flex flex-col mt-3">
      {lista.map((f) => {
        const e = estadoSubida(f);
        const r = rotuloSubida(e, modo, "dibujar");
        return (
          <li key={f.id} className="py-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--linea)" }}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="t-cuerpo" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {f.nombre}
                <span className="t-dato" style={{ color: "var(--grafito)" }}> · {fechaCorta(f.created_at)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <span className={`estado ${r.clase}`}>{r.texto}</span>
                <AbrirArchivo sourceId={f.id} nombre={f.nombre} />
              </span>
            </div>
            {e === "subido" && (
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                Vuelve en un momento: cuando termine de leerse, aquí aparece el botón para dibujarlo.
              </p>
            )}
            {e === "no_se_pudo" && (
              <p className="t-dato" style={{ color: "var(--contradicho)" }}>
                {dueno ? QUE_HACER_NO_SE_PUDO.dueno : QUE_HACER_NO_SE_PUDO.consultora}
                {!dueno && enlaceFuentes && (
                  <>
                    {" "}
                    <Link href={enlaceFuentes} className="enlace-azul">Ir a Fuentes</Link>
                  </>
                )}
              </p>
            )}
            {sePuedeDibujar(e) && <DibujarDesdeArchivo processId={processId} sourceId={f.id} nombreArchivo={f.nombre} yaDibujado={dibujado} paraCliente={dueno} />}
          </li>
        );
      })}
    </ul>
  );

  if (dibujado) {
    return (
      <details className="panel p-5 mt-6">
        <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)", minHeight: 44, display: "flex", alignItems: "center" }}>
          ¿El dibujo no se parece a {dueno ? "tu archivo" : "su archivo"}? Volver a dibujarlo con un archivo
        </summary>
        <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>
          Lo dibujado se reemplaza por lo que leamos del archivo que elijas. Antes de hacerlo se te pide confirmar.
        </p>
        {filas}
      </details>
    );
  }

  return (
    <section className="panel p-5 mb-6">
      <h2 className="t-seccion" style={{ fontSize: 18 }}>{dueno ? "Este proceso todavía no está dibujado" : "Sin dibujar todavía"}</h2>
      <p className="t-cuerpo mt-1 medida" style={{ color: "var(--grafito)" }}>
        {fuentes === null
          ? "No pudimos leer los archivos de este proceso. Vuelve a cargar la página; lo subido no se perdió."
          : lista.some((f) => sePuedeDibujar(estadoSubida(f)))
            ? "El archivo ya se leyó: pulsa el botón y lo dibujamos con lo que dice. Después se corrige en el lienzo de abajo."
            : lista.some((f) => estadoSubida(f) === "subido")
              ? "Estamos leyendo el archivo. Cuando termine, aquí aparece el botón para dibujarlo con lo que dice."
              : lista.length
                ? dueno
                  ? "No pudimos leer lo que subiste. Súbelo otra vez en «Archivos de este proceso», más abajo, o dibújalo tú en el lienzo y guarda."
                  : "No se pudo leer ningún archivo de este proceso. El motivo está en Fuentes; o dibújalo en el lienzo."
                : dueno
              ? "Súbele su archivo en «Archivos de este proceso», más abajo, y lo dibujamos con lo que dice. O dibújalo tú en el lienzo y guarda."
              : "No tiene archivo. Súbeselo desde Procesos, en «Subir un proceso que la empresa ya tiene», con este mismo nombre (se le suma a este), o dibújalo en el lienzo."}
      </p>
      {lista.length > 0 && filas}
    </section>
  );
}

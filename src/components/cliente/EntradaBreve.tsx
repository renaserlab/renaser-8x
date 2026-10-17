"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { transcribirAudio } from "@/lib/transcribir-cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { BotonEscuchar } from "@/components/voz/BotonEscuchar";
import { Subir } from "@/components/Subir";
import type { EstadoEntrada, FraseSintesis, PreguntaAbierta } from "@/lib/entrada";

/**
 * LA ENTRADA BREVE DEL DUEÑO (R7.1): doce preguntas, una por pantalla.
 *
 * Cada pregunta se puede responder hablando, escribiendo, con un «no lo sé», marcándola como aproximada o
 * subiendo un documento en su lugar. Lo que ya sabíamos no se vuelve a preguntar: se muestra con su origen y
 * se confirma con un toque. Cada respuesta se guarda al enviarla, así que se puede cerrar y seguir otro día
 * donde quedó. Al terminar, el dueño revisa «lo que entendimos» frase por frase y lo confirma.
 *
 * La pantalla no decide nada: qué pregunta sigue, qué ya sabíamos y qué dice la síntesis lo decide el
 * servidor (src/lib/entrada.ts). Aquí solo se pinta el estado que llega y se mandan las acciones.
 */
type Props = {
  companyId: string;
  inicial: EstadoEntrada;
  puedeResponder: boolean;
  /** Por qué esta persona solo mira (consultor en modo «ver como», alguien que no es el dueño). */
  motivoSoloLectura?: string | null;
  transcriptor?: boolean;
};

type Respuesta = { modo: "texto" | "no_lo_se" | "confirma" | "documento"; texto?: string; aproximado?: boolean; audio?: Blob | null };

const GRIS = { color: "var(--grafito)" } as const;
const ROJO = { color: "var(--contradicho)" } as const;

/** «Pregunta 3 de 12» y una línea que se llena: cuánto falta se ve sin leer. */
function Avance({ respondidas, total, actual }: { respondidas: number; total: number; actual: number | null }) {
  const pct = total ? Math.round((respondidas / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 medida">
      <p className="t-dato" style={GRIS}>
        {actual ? `Pregunta ${actual} de ${total}` : `${respondidas} de ${total} respondidas`}
      </p>
      <div
        role="progressbar"
        aria-label="Avance de las preguntas"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={respondidas}
        className="avance-fino"
      >
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** La pregunta abierta con todas sus formas de responder. Se monta de nuevo en cada pregunta: nada se arrastra de la anterior. */
function Pregunta({
  companyId,
  pregunta,
  grupo,
  ocupado,
  transcriptor,
  alResponder,
}: {
  companyId: string;
  pregunta: PreguntaAbierta;
  grupo: string;
  ocupado: boolean;
  transcriptor: boolean;
  alResponder: (r: Respuesta) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [aproximado, setAproximado] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conDocumento, setConDocumento] = useState(false);

  const alAudio = async (grabado: Blob, segundos?: number) => {
    // El audio se pasa a texto para que la persona LEA lo que entendimos antes de guardarlo. Si eso tarda o
    // falla, lo hablado no se pierde: se guarda el audio y lo pasamos a texto nosotros.
    setTranscribiendo(true);
    setAviso(null);
    setAudio(grabado);
    try {
      setTexto(await transcribirAudio(grabado, segundos));
    } catch {
      setAviso("Tu audio quedó grabado, pero tardamos en pasarlo a texto. Guárdalo con el botón de abajo y nosotros lo escuchamos: no tienes que repetir nada.");
    } finally {
      setTranscribiendo(false);
    }
  };

  const hayTexto = texto.trim().length > 0;
  const soloAudio = !!audio && !hayTexto;

  if (conDocumento)
    return (
      <section className="flex flex-col gap-6 aparece">
        <div>
          <p className="t-etiqueta">{grupo}</p>
          <h2 className="t-seccion medida mt-2">{pregunta.pregunta}</h2>
        </div>
        <p className="t-cuerpo medida" style={GRIS}>
          Si la respuesta está en un archivo (un Excel de ventas, una lista de precios, una foto del cuaderno), súbelo aquí. Lo leemos y después te mostramos lo que sacamos para que lo confirmes.
        </p>
        <Subir companyId={companyId} paraCliente transcriptor={transcriptor} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="boton" disabled={ocupado} onClick={() => alResponder({ modo: "documento" })}>
            {ocupado ? "Guardando" : "Listo, ya lo subí"}
          </button>
          <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => setConDocumento(false)}>
            Mejor respondo con mis palabras
          </button>
        </div>
      </section>
    );

  return (
    <section className="flex flex-col gap-6 aparece">
      <div>
        <p className="t-etiqueta">{grupo}</p>
        <h2 className="t-hero medida mt-2">
          {pregunta.pregunta}
        </h2>
        {pregunta.sabida_por && (
          <p className="t-dato mt-3" style={GRIS}>
            Esto no te lo preguntamos de cero: lo vimos en {pregunta.sabida_por}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <BotonEscuchar texto={pregunta.pregunta} />
        {pregunta.basta_confirmar && (
          <button type="button" className="boton" disabled={ocupado} onClick={() => alResponder({ modo: "confirma" })}>
            Sí, es así
          </button>
        )}
      </div>

      <BotonGrabar alTexto={(t) => setTexto((previo) => (previo ? `${previo} ${t}` : t))} alAudio={transcriptor ? alAudio : undefined} />
      {transcribiendo && (
        <p className="t-cuerpo aparece" aria-live="polite" style={GRIS}>
          Pasando tu audio a texto…
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">{pregunta.basta_confirmar ? "Si no es así, cuéntanos cómo es" : "O escribe tu respuesta"}</span>
        <textarea
          className="campo"
          aria-label="Tu respuesta"
          value={texto}
          maxLength={4000}
          rows={Math.min(14, Math.max(4, Math.ceil(texto.length / 42)))}
          placeholder="Con tus palabras, como se lo contarías a alguien"
          onChange={(e) => setTexto(e.target.value)}
        />
        {/* BORRAR EN UN TOQUE: en el celular vaciar una caja larga es borrar letra por letra. Se va también
            el audio grabado, para que una grabación anterior no acompañe a una respuesta nueva. */}
        {(hayTexto || audio) && (
          <button
            type="button"
            className="boton-enlace boton-enlace--tenue"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              setTexto("");
              setAudio(null);
              setAviso(null);
            }}
          >
            Borrar y empezar de nuevo
          </button>
        )}
      </label>
      {hayTexto && audio && (
        <p className="t-dato" style={GRIS}>
          Esto entendimos de tu audio. Corrige lo que quieras y guarda.
        </p>
      )}
      {aviso && (
        <p className="t-cuerpo" role="status" style={GRIS}>
          {aviso}
        </p>
      )}

      {/* En una confirmación, «Es aproximado» solo tiene sentido cuando la persona está escribiendo cómo es de verdad. */}
      {pregunta.acepta_aproximado && (!pregunta.basta_confirmar || hayTexto) && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={aproximado ? "boton" : "boton boton--secundario"} aria-pressed={aproximado} onClick={() => setAproximado((a) => !a)}>
            Es aproximado
          </button>
          <span className="t-dato" style={GRIS}>
            {aproximado ? "Lo guardamos como un «más o menos»." : "Si no tienes el número exacto, un «más o menos» sirve: márcalo aquí."}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="boton"
          disabled={ocupado || transcribiendo || (!hayTexto && !audio)}
          onClick={() => alResponder({ modo: "texto", texto: texto.trim(), aproximado, audio })}
        >
          {ocupado ? "Guardando" : soloAudio ? "Guardar mi audio" : "Guardar y seguir"}
        </button>
        <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => alResponder({ modo: "no_lo_se" })}>
          No lo sé
        </button>
        <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => setConDocumento(true)}>
          Subir un documento en vez de responder
        </button>
      </div>
    </section>
  );
}

/** Una frase de «lo que entendimos», con su origen. Editable: «Está bien» o «No es así» y cómo es. */
function Frase({
  frase,
  editable,
  noEsAsi,
  correccion,
  alMarcar,
  alCorregir,
}: {
  frase: FraseSintesis;
  editable: boolean;
  noEsAsi: boolean;
  correccion: string;
  alMarcar: (noEsAsi: boolean) => void;
  alCorregir: (texto: string) => void;
}) {
  return (
    <article className="panel p-5 flex flex-col gap-2">
      <p className="t-etiqueta">{frase.asunto}</p>
      <p className="t-doc">{frase.texto}</p>
      <p className="t-dato" style={GRIS}>
        {frase.fuente}
      </p>
      {/* Lo que tomamos de su respuesta para los datos de la empresa se le dice aquí: si no es así, lo corrige. */}
      {frase.entendido && (
        <p className="t-dato">
          {frase.entendido}
          {editable && " Si no es así, márcalo abajo y dinos cuántas son."}
        </p>
      )}
      {editable ? (
        <>
          <div className="flex flex-wrap gap-3 mt-2">
            <button type="button" className={noEsAsi ? "boton boton--secundario" : "boton"} aria-pressed={!noEsAsi} onClick={() => alMarcar(false)}>
              Está bien
            </button>
            <button type="button" className={noEsAsi ? "boton" : "boton boton--secundario"} aria-pressed={noEsAsi} onClick={() => alMarcar(true)}>
              No es así
            </button>
          </div>
          {noEsAsi && (
            <label className="flex flex-col gap-2 mt-2">
              <span className="t-etiqueta">¿Cómo es?</span>
              <textarea className="campo" aria-label={`Corrección: ${frase.asunto}`} value={correccion} maxLength={4000} rows={3} onChange={(e) => alCorregir(e.target.value)} />
            </label>
          )}
        </>
      ) : frase.marca === "no_es_asi" ? (
        <p className="t-cuerpo mt-2">
          <strong>Lo corregiste:</strong> «{frase.correccion}»
        </p>
      ) : frase.marca === "esta_bien" ? (
        <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }}>
          Lo diste por bueno.
        </p>
      ) : null}
    </article>
  );
}

/** «Lo que entendimos»: el dueño lo revisa por grupos y lo confirma. Confirmado, queda a la vista y ya no se edita. */
function LoQueEntendimos({
  estado,
  puedeResponder,
  ocupado,
  alConfirmar,
}: {
  estado: EstadoEntrada;
  puedeResponder: boolean;
  ocupado: boolean;
  alConfirmar: (correcciones: { clave: string; texto: string }[]) => Promise<boolean>;
}) {
  const [noEsAsi, setNoEsAsi] = useState<Record<string, boolean>>({});
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({});
  const sintesis = estado.sintesis;
  if (!sintesis) return null;
  const confirmada = !!estado.sesion?.sintesis_confirmada_at;
  const editable = puedeResponder && !confirmada;
  const marcadas = Object.keys(noEsAsi).filter((k) => noEsAsi[k]);
  const sinTexto = marcadas.filter((k) => !(correcciones[k] ?? "").trim());

  return (
    <section className="flex flex-col gap-8 aparece">
      <div className="medida">
        <h2 className="t-seccion">Lo que entendimos</h2>
        <p className="t-cuerpo mt-2" style={GRIS}>
          {confirmada ? "Esto es lo que nos contaste y diste por bueno." : sintesis.rotulo}
        </p>
      </div>

      {sintesis.grupos
        .filter((g) => g.frases.length > 0)
        .map((g) => (
          <div key={g.grupo} className="flex flex-col gap-3">
            <h3 className="t-etiqueta">{g.nombre}</h3>
            {g.frases.map((f) => (
              <Frase
                key={f.clave}
                frase={f}
                editable={editable}
                noEsAsi={!!noEsAsi[f.clave]}
                correccion={correcciones[f.clave] ?? ""}
                alMarcar={(v) => setNoEsAsi((m) => ({ ...m, [f.clave]: v }))}
                alCorregir={(t) => setCorrecciones((c) => ({ ...c, [f.clave]: t }))}
              />
            ))}
          </div>
        ))}

      {editable && (
        <div className="flex flex-col gap-3 medida">
          {sinTexto.length > 0 && (
            <p className="t-dato" style={ROJO}>
              Escribe cómo es en lo que marcaste «No es así», o vuelve a marcarlo como «Está bien».
            </p>
          )}
          <button
            type="button"
            className="boton boton--grande"
            disabled={ocupado || sinTexto.length > 0}
            onClick={() => alConfirmar(marcadas.map((clave) => ({ clave, texto: correcciones[clave].trim() })))}
          >
            {ocupado ? "Guardando" : marcadas.length > 0 ? "Confirmo, con mis correcciones" : "Confirmo: así es"}
          </button>
        </div>
      )}

      {confirmada && (
        <div className="pozo medida">
          <p className="t-cuerpo" role="status">
            Listo. Con esto ya conocemos tu negocio lo suficiente para empezar a trabajar contigo.
          </p>
          <div className="flex flex-wrap items-center gap-5 mt-4">
            <Link href="/portal" className="boton">
              Ir al inicio
            </Link>
            <Link href="/portal/activos" className="t-dato enlace-texto enlace-texto--acero">
              Subir documentos de tu negocio
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

export function EntradaBreve({ companyId, inicial, puedeResponder, motivoSoloLectura = null, transcriptor = false }: Props) {
  const url = `/api/companies/${companyId}/entrada`;
  const [estado, setEstado] = useState<EstadoEntrada>(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mandar = useCallback(
    async (cuerpo: FormData | Record<string, unknown>): Promise<boolean> => {
      setOcupado(true);
      setError(null);
      try {
        const nuevo = cuerpo instanceof FormData ? await pedir<EstadoEntrada>(url, { method: "POST", body: cuerpo }) : await pedir<EstadoEntrada>(url, { json: cuerpo });
        setEstado(nuevo);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos guardar. Lo que escribiste sigue aquí: intenta de nuevo.");
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [url]
  );

  // Mientras un audio guardado se pasa a texto, la pantalla pregunta cada pocos segundos si ya está.
  useEffect(() => {
    if (!estado.pendienteTranscripcion) return;
    const t = setInterval(() => {
      pedir<EstadoEntrada>(url)
        .then(setEstado)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [estado.pendienteTranscripcion, url]);

  const abierta = estado.abierta;

  const responder = (r: Respuesta): Promise<boolean> => {
    if (!abierta) return Promise.resolve(false);
    if (r.modo === "texto" && r.audio) {
      // Con audio grabado se manda el archivo; el texto que la persona leyó y corrigió, si lo hay, va con él.
      const form = new FormData();
      form.set("response_id", abierta.id);
      form.set("texto", r.texto ?? "");
      form.set("aproximado", r.aproximado ? "1" : "0");
      form.set("audio", r.audio, "respuesta.webm");
      return mandar(form);
    }
    return mandar({ accion: "responder", response_id: abierta.id, modo: r.modo, texto: r.texto, aproximado: r.aproximado });
  };

  return (
    <div className="flex flex-col gap-8">
      <Avance respondidas={estado.progreso.respondidas} total={estado.progreso.total} actual={abierta && !estado.sintesis ? abierta.n : null} />

      {!puedeResponder && motivoSoloLectura && (
        <p className="t-dato pozo pozo--chico medida">
          {motivoSoloLectura}
        </p>
      )}
      {!estado.sesion && (
        <section className="flex flex-col gap-4 medida">
          <p className="t-cuerpo">
            Son {estado.progreso.total} preguntas sobre tu negocio: cómo es hoy, qué quieres para él y qué ya te funcionó. No hay respuestas malas, y puedes parar cuando quieras: lo que respondas queda guardado.
          </p>
          {puedeResponder && (
            <div>
              <button type="button" className="boton" disabled={ocupado} onClick={() => mandar({ accion: "iniciar" })}>
                {ocupado ? "Un momento" : "Empezar"}
              </button>
            </div>
          )}
        </section>
      )}

      {estado.sesion && !estado.sintesis && abierta && estado.pendienteTranscripcion && (
        <section className="flex flex-col gap-3 medida" aria-live="polite">
          <p className="t-etiqueta">{estado.grupos[abierta.grupo]}</p>
          <h2 className="t-seccion">{abierta.pregunta}</h2>
          <p className="t-cuerpo" style={GRIS}>
            Guardamos tu audio y lo estamos pasando a texto. En cuanto esté, aparece la siguiente pregunta. Si no se puede entender, esta misma pregunta se abre otra vez para que la escribas.
          </p>
        </section>
      )}

      {estado.sesion && !estado.sintesis && abierta && !estado.pendienteTranscripcion && puedeResponder && (
        <Pregunta key={abierta.id} companyId={companyId} pregunta={abierta} grupo={estado.grupos[abierta.grupo]} ocupado={ocupado} transcriptor={transcriptor} alResponder={responder} />
      )}

      {estado.sesion && !estado.sintesis && abierta && !estado.pendienteTranscripcion && !puedeResponder && (
        <section className="flex flex-col gap-2 medida">
          <p className="t-etiqueta">{estado.grupos[abierta.grupo]}</p>
          <h2 className="t-seccion">{abierta.pregunta}</h2>
          <p className="t-dato" style={GRIS}>
            Es la pregunta en la que va el dueño.
          </p>
        </section>
      )}

      {estado.sesion && !estado.sintesis && !abierta && (
        <section className="flex flex-col gap-4 medida">
          <p className="t-cuerpo">Tus respuestas están guardadas. Sigue donde te quedaste.</p>
          {puedeResponder && (
            <div>
              <button type="button" className="boton" disabled={ocupado} onClick={() => mandar({ accion: "iniciar" })}>
                {ocupado ? "Un momento" : "Continuar"}
              </button>
            </div>
          )}
        </section>
      )}

      {estado.sintesis && (
        <LoQueEntendimos estado={estado} puedeResponder={puedeResponder} ocupado={ocupado} alConfirmar={(correcciones) => mandar({ accion: "confirmar", correcciones })} />
      )}

      {/* El error va al final, junto a los botones que lo provocaron: arriba de la pregunta, en un celular no se ve. */}
      {error && (
        <p className="t-cuerpo medida" role="alert" style={ROJO}>
          {error}
        </p>
      )}
    </div>
  );
}

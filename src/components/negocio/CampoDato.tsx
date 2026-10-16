"use client";
import { useId, useState } from "react";
import { formaDe, rangoDe, textoRango, type DatoOral } from "@/lib/dato-oral";
import { cantidad, leerCaja, mismoDato, textoDeCaja, type Modo } from "./dato";
import { EstadoDato } from "./EstadoDato";

type Props = {
  /** La pregunta, una sola cosa y por el episodio («El mes pasado, ¿cuántos vendiste?»). Es la etiqueta de la caja. */
  etiqueta: string;
  valor: DatoOral | null | undefined;
  /** Se llama al salir de la caja (nunca por tecla), al pulsar «No lo sé» o al cambiar cómo se sabe. null = se vació. */
  alGuardar: (d: DatoOral | null) => void;
  modo: Modo;
  /** Cómo se lee el número entendido: dinero, unidades… Por defecto, una cantidad. */
  formato?: (n: number) => string;
  max?: number;
  soloExacto?: boolean;
  entero?: boolean;
  ayuda?: string | null;
  deshabilitado?: boolean;
  /** Para lo que no admite «no lo sé» (el nombre de algo, por ejemplo). */
  sinNoLoSe?: boolean;
  /** La pregunta como texto encima de la caja; sin ella, solo para el lector de pantalla. */
  conEtiqueta?: boolean;
};

const PISTA_EXACTO = "Escribe el número, aunque sea aproximado";
const PISTA_RANGO = "Un número, o de cuánto a cuánto";

/**
 * UNA CAJA QUE ACEPTA LO QUE SE DICE. «8 mil», «30 a 50», «entre 30 y 50», «unos 40» o el botón «No lo sé»; debajo,
 * lo que se entendió y cómo se sabe. Lo que no se entiende se avisa bajo la caja, sin guardar nada. La pista de la
 * caja no trae cifras: una pregunta nunca sugiere el número (una pregunta con cifra de ejemplo induce la respuesta).
 */
export function CampoDato({ etiqueta, valor, alGuardar, modo, formato = cantidad, max, soloExacto = false, entero = false, ayuda, deshabilitado = false, sinNoLoSe = false, conEtiqueta = true }: Props) {
  const id = useId();
  const [texto, setTexto] = useState(textoDeCaja(valor));
  const [previo, setPrevio] = useState<DatoOral | null | undefined>(valor);
  const [aviso, setAviso] = useState<string | null>(null);
  // Si el dato cambió por fuera (se guardó, se recargó), la caja muestra lo que quedó.
  if (!mismoDato(previo, valor)) {
    setPrevio(valor);
    setTexto(textoDeCaja(valor));
  }

  const noLoSe = valor?.estado === "no_lo_se";
  const rango = rangoDe(valor);
  const bloqueado = deshabilitado || (modo === "dueno" && valor?.estado === "comprobado");

  const salir = () => {
    const r = leerCaja(texto, valor, { max, soloExacto, entero });
    if (r.tipo === "aviso") {
      setAviso(r.aviso);
      return;
    }
    setAviso(null);
    if (r.tipo === "vacio") {
      // Vaciar la caja no es decir «no lo sé»: se queda sin dato. Si ya era «no lo sé», sigue así.
      if (!noLoSe && formaDe(valor) !== "vacio") alGuardar(null);
      return;
    }
    if (!mismoDato(r.dato, valor)) alGuardar(r.dato);
  };

  return (
    <div className="flex flex-col gap-2">
      {conEtiqueta && (
        <label htmlFor={id} className="t-dato" style={{ fontWeight: 600, color: "var(--tinta)" }}>
          {etiqueta}
        </label>
      )}
      {ayuda && <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 13.5 }}>{ayuda}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={etiqueta}
          id={id}
          className="campo"
          style={{ flex: "1 1 160px", minWidth: 0 }}
          inputMode="text"
          autoComplete="off"
          value={texto}
          placeholder={noLoSe ? "Dijiste que no lo sabes" : soloExacto ? PISTA_EXACTO : PISTA_RANGO}
          disabled={bloqueado}
          onChange={(e) => {
            setTexto(e.target.value);
            if (aviso) setAviso(null);
          }}
          onBlur={salir}
        />
        {!sinNoLoSe && (
          <button
            type="button"
            className="boton boton--secundario"
            style={{ flex: "none", padding: "0 16px", fontSize: 14 }}
            aria-pressed={noLoSe}
            disabled={bloqueado}
            onClick={() => {
              setTexto("");
              setAviso(null);
              if (!noLoSe) alGuardar({ estado: "no_lo_se" });
            }}
          >
            No lo sé
          </button>
        )}
      </div>
      {aviso && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>
          {aviso}
        </p>
      )}
      {rango && !aviso && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-dato" style={{ color: "var(--grafito)" }}>
            Entendimos: <b style={{ color: "var(--tinta)" }}>{textoRango(rango, formato)}</b>
          </span>
          {valor && valor.estado !== "no_lo_se" && (
            <EstadoDato estado={valor.estado} modo={modo} etiqueta={etiqueta} deshabilitado={bloqueado} alCambiar={(estado) => alGuardar({ ...valor, estado })} />
          )}
        </div>
      )}
      {modo === "dueno" && valor?.estado === "comprobado" && (
        <p className="t-dato" style={{ color: "var(--confirmado)" }}>Comprobado con un documento por tu consultora. Si cambió, díselo.</p>
      )}
    </div>
  );
}

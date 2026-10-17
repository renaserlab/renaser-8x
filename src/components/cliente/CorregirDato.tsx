"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Eleccion, Incongruencia } from "@/lib/incongruencias";
import { correccionDe, EsquemaCorreccion, SECCIONES_PARA_CORREGIR } from "@/lib/correccion-dato";
import { SECCION, TEXTO_SECCION_CERRADA, type Seccion } from "@/lib/secciones";

/**
 * «CORREGIR ESTE DATO», EN UN PASO (16-10-2026). Va debajo de las dos cifras que no cuadran, en «Tu diagnóstico».
 *
 * Kelin: «si hay alguna incongruencia, el dueño debe tener la forma de corregir datos» y «8X debe ser intuitivo, no debe
 * uno entrar y marearse». Por eso aquí no hay formulario: un toque guarda.
 *  - «Esta es la correcta» bajo cada lado que tiene una cifra sola (un rango no se puede elegir): guarda al tocar.
 *  - «Ninguna, es…»: abre un campo que entiende cómo habla el dueño (con números o en palabras) y «Guardar».
 *  - «No lo sé»: guarda al tocar. Es una respuesta, no un cero.
 *  - «¿Por qué? (si quieres)»: un motivo opcional, que viaja con lo que elija.
 * Lo que se corrige con un número va a /api/portal/numeros (`{ correccion }`); lo que vive en una sección, a su pantalla
 * (solo si está abierta); dos respuestas que se contradicen, a «Confirmar información».
 *
 * Sin la sección abierta (Confirmar lo que encontramos o Los números que faltan) se ven las cifras y no hay botones: lo
 * dice TEXTO_SECCION_CERRADA. La consultora que mira «como el empresario» ve la tarjeta igual, sin botones: corregir es
 * del dueño, desde su cuenta (la ruta lo exige).
 */
export type QuienCorrige = "dueno" | "consultora" | "otro";

/** El nombre corto de la pantalla donde se corrige, el mismo de la fila «En esta sección». */
const PANTALLA_DE: Partial<Record<Seccion, string>> = {
  productos: "Lo que vendes",
  costos: "Tus gastos del mes",
  historia: "Tu historia",
  moneda: "Cobros y mercadería",
  credito: "Cobros y mercadería",
  inventario: "Cobros y mercadería",
};

export function CorregirDato({ i, abiertas, quien = "dueno" }: { i: Incongruencia; abiertas: readonly Seccion[] | null; quien?: QuienCorrige }) {
  const router = useRouter();
  const id = useId();
  const [modo, setModo] = useState<"elegir" | "otra">("elegir");
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conMotivo, setConMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cajaCifra = useRef<HTMLInputElement | null>(null);

  // Al abrir «Ninguna, es otra cifra», el cursor ya está en la caja: un toque menos.
  useEffect(() => {
    if (modo === "otra") cajaCifra.current?.focus();
  }, [modo]);

  if (i.resuelta) return null;

  // ¿Puede corregir aquí y ahora? Con «Confirmar lo que encontramos» o «Los números que faltan» abierta; lo que vive en
  // una sección, con esa sección abierta. Si no se pudo leer qué está abierto, no se ofrece nada (no se promete).
  const abierta = !!abiertas && SECCIONES_PARA_CORREGIR.some((s) => abiertas.includes(s));
  const via = i.corrige.via;
  const seccionAbierta = via === "seccion" && !!abiertas && abiertas.includes(i.corrige.seccion);

  if (quien === "consultora")
    return <p className="nota">Así lo ve el empresario. Los botones para corregir solo salen en su cuenta.</p>;
  if (quien === "otro") return <p className="nota">Este dato lo corrige el dueño de la empresa.</p>;

  if (via === "validar")
    return abierta ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link href="/portal/validar" className="boton boton--secundario">Revisarlo</Link>
      </div>
    ) : (
      <p className="nota">{TEXTO_SECCION_CERRADA}</p>
    );

  if (via === "seccion")
    return seccionAbierta ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link href={i.corrige.href} className="boton boton--secundario">Corregirlo en «{PANTALLA_DE[i.corrige.seccion] ?? SECCION[i.corrige.seccion].paraDueno}»</Link>
      </div>
    ) : (
      <p className="nota">{TEXTO_SECCION_CERRADA}</p>
    );

  if (!abierta) return <p className="nota">{TEXTO_SECCION_CERRADA}</p>;

  const dosLados = !!i.derecha;

  async function guardar(eleccion: Eleccion) {
    setError(null);
    setAviso(null);
    const pedido = correccionDe(i, eleccion, { texto: eleccion === "otra" ? texto : undefined, motivo: conMotivo ? motivo : undefined });
    if (!pedido) {
      setError("Este dato no se corrige desde aquí. Escríbele a tu consultora.");
      return;
    }
    // La misma regla que la ruta: si lo escrito no es un número, se dice antes de mandar nada.
    const revisado = EsquemaCorreccion.safeParse(pedido);
    if (!revisado.success) {
      setError(revisado.error.issues[0]?.message ?? "Revisa lo que escribiste.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/portal/numeros", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correccion: revisado.data }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { error?: string; aviso?: string };
      if (!res.ok) {
        setError(cuerpo.error ?? "No pudimos guardar tu número. Intenta de nuevo.");
        return;
      }
      // Si el número quedó pero su rastro no, se dice ANTES de recargar: al recargar, esta diferencia puede desaparecer
      // de la pantalla y con ella el aviso. La recarga la pide el dueño con «Entendido».
      if (cuerpo.aviso) {
        setAviso(cuerpo.aviso);
        return;
      }
      router.refresh();
    } catch {
      setError("No pudimos guardar tu número: revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const ofrece = (e: Eleccion) => i.opciones.includes(e);
  const campo = `${id}-cifra`;
  const campoMotivo = `${id}-motivo`;
  const izquierda = ofrece("izquierda") && i.izquierda.valor != null;
  const derecha = ofrece("derecha") && i.derecha?.valor != null;

  // «Esta es la correcta» va debajo de su cifra: en una rejilla de dos columnas que se alinea con los dos lados de la
  // tarjeta y, en un celular (donde los lados se apilan), baja a una. Por eso cada botón dice además su cifra.
  const elegirLado = (lado: "izquierda" | "derecha") => {
    const texto = lado === "izquierda" ? i.izquierda.texto : i.derecha?.texto ?? "";
    return (
      <button type="button" className="boton boton--secundario" style={{ width: "100%" }} disabled={enviando} onClick={() => guardar(lado)}>
        {dosLados ? `Esta es la correcta: ${texto}` : `Sí, es ${texto}`}
      </button>
    );
  };
  const porQue = conMotivo ? null : (
    <button
      type="button"
      className="boton boton--terciario"
      onClick={() => setConMotivo(true)}
      disabled={enviando}
    >
      ¿Por qué? (si quieres)
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy={enviando || undefined}>
      {modo === "elegir" ? (
        <>
          {(izquierda || derecha) && (
            <div style={{ display: "grid", gridTemplateColumns: dosLados ? "repeat(auto-fit, minmax(max(45%, 220px), 1fr))" : "minmax(0, 1fr)", gap: "8px 14px" }}>
              {izquierda ? elegirLado("izquierda") : dosLados ? <span aria-hidden="true" /> : null}
              {derecha ? elegirLado("derecha") : null}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {ofrece("otra") && (
              <button type="button" className="boton boton--secundario" disabled={enviando} onClick={() => { setModo("otra"); setError(null); }}>
                {dosLados ? "Ninguna, es otra cifra" : "No, es otra cifra"}
              </button>
            )}
            {ofrece("no_lo_se") && (
              <button type="button" className="boton boton--secundario" disabled={enviando} onClick={() => guardar("no_lo_se")}>
                No lo sé
              </button>
            )}
            {porQue}
          </div>
        </>
      ) : (
        <form
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void guardar("otra");
          }}
        >
          <label htmlFor={campo} className="etiqueta-campo" style={{ flex: "1 1 220px" }}>
            La cifra que es
            <input
              id={campo}
              className="campo"
              type="text"
              inputMode="text"
              autoComplete="off"
              ref={cajaCifra}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={enviando}
            />
          </label>
          <button type="submit" className="boton" disabled={enviando || !texto.trim()}>Guardar</button>
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={() => { setModo("elegir"); setError(null); }}>
            Volver
          </button>
          {porQue}
        </form>
      )}

      {conMotivo && (
        <label htmlFor={campoMotivo} className="etiqueta-campo">
          ¿Por qué? (si quieres)
          <textarea
            id={campoMotivo}
            className="campo"
            style={{ minHeight: 72 }}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
          />
        </label>
      )}

      {enviando && <p className="nota" role="status">Guardando…</p>}
      {error && <p className="nota" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}
      {aviso && (
        <p className="nota" role="status" style={{ color: "var(--caducado)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
          {aviso}
          <button type="button" className="boton boton--secundario" onClick={() => router.refresh()}>Entendido</button>
        </p>
      )}
    </div>
  );
}

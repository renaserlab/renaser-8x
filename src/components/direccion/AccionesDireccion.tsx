"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";

/**
 * LO QUE SE PUEDE HACER CON LA FICHA DE DIRECCIÓN, EN EL NAVEGADOR. La ficha la pinta el servidor
 * (FichaDireccion.tsx y DireccionCliente.tsx); aquí viven solo los botones y los formularios, que reciben por
 * props los textos y las opciones ya resueltos. Así nada de la lógica de la ficha (ni la base, ni las reglas)
 * llega al navegador: una edición es una petición a /api/companies/[id]/direccion y un refresco de la página.
 */

const CHICO = { minHeight: 36, fontSize: 13.5, padding: "0 14px" } as const;

/** Una edición de la ficha: la manda, refresca la página al terminar y deja el error a la vista si lo hay. */
function useEdicion(companyId: string) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviar = async (json: Record<string, unknown>): Promise<boolean> => {
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/direccion`, { json });
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, error, enviar };
}

function Fallo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>
      {texto}
    </p>
  );
}

/**
 * LA BARRA DE LA FICHA: armarla con lo que ya hay, pedir interpretaciones al asistente y acordar la versión.
 * Acordar se apaga, diciendo por qué, cuando falta autoridad, cuando la ficha está vacía o cuando quedan
 * propuestas del asistente sin revisar.
 */
export function BarraFicha({ companyId, fichaId, hayAcordada, vacia, sinRevisar, puedeAcordar, jobEnCurso }: {
  companyId: string;
  /** El borrador vigente; null si todavía no hay ninguno. */
  fichaId: string | null;
  hayAcordada: boolean;
  vacia: boolean;
  sinRevisar: number;
  puedeAcordar: boolean;
  jobEnCurso: string | null;
}) {
  const router = useRouter();
  const { ocupado, error, enviar } = useEdicion(companyId);
  const [job, setJob] = useState<string | null>(jobEnCurso);
  const [errorJob, setErrorJob] = useState<string | null>(null);
  const [encolando, setEncolando] = useState(false);

  const proponer = async () => {
    setEncolando(true);
    setErrorJob(null);
    try {
      const r = await pedir<{ job_id: string }>(`/api/companies/${companyId}/direccion/interpretar`, { json: {} });
      setJob(r.job_id);
    } catch (e) {
      setErrorJob(e instanceof Error ? e.message : "No se pudo pedir.");
    } finally {
      setEncolando(false);
    }
  };

  const acordar = () => {
    if (!fichaId) return;
    if (!confirm("Vas a acordar esta versión. El dueño la verá en su portal tal como está, y este borrador quedará como reemplazado. ¿Continuar?")) return;
    void enviar({ accion: "acordar", ficha_id: fichaId });
  };

  const motivo = !fichaId
    ? null
    : !puedeAcordar
      ? "No tienes autoridad para acordar la ficha."
      : vacia
        ? "La ficha está vacía: no hay nada que acordar."
        : sinRevisar > 0
          ? `Antes de acordar, revisa ${sinRevisar === 1 ? "la propuesta del asistente que queda" : `las ${sinRevisar} propuestas del asistente que quedan`} sin revisar.`
          : null;

  return (
    <div className="no-imprimir mb-8">
      <div className="flex flex-wrap gap-3">
        <button className={`boton ${fichaId ? "boton--secundario" : ""}`} disabled={ocupado || !!job} onClick={() => void enviar({ accion: "preparar" })}>
          {fichaId ? "Actualizar con lo que hay hoy" : hayAcordada ? "Abrir un borrador nuevo" : "Armar con lo que ya hay"}
        </button>
        <button className="boton boton--secundario" disabled={encolando || !!job || ocupado} onClick={proponer}>
          {encolando ? "Pidiendo" : "Proponer interpretaciones"}
        </button>
        {fichaId && (
          <button className="boton" disabled={ocupado || !!job || !!motivo} onClick={acordar}>
            Acordar versión
          </button>
        )}
      </div>
      {motivo && (
        <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>
          {motivo}
        </p>
      )}
      <div className="mt-2">
        <Progreso
          jobId={job}
          alTerminar={() => {
            setJob(null);
            router.refresh();
          }}
        />
      </div>
      <Fallo texto={error ?? errorJob} />
    </div>
  );
}

/**
 * LO QUE SE HACE CON UNA FRASE: corregirla en su sitio (texto y clase), darla por buena si la propuso el
 * asistente, quitarla o recuperarla. Quitar no borra: la frase queda guardada como descartada.
 */
export function AccionesItem({ companyId, fichaId, bloque, nombreBloque, itemId, texto, tipo, tipos, sinRevisar, descartado, sePuedeCorregir }: {
  companyId: string;
  fichaId: string;
  bloque: string;
  nombreBloque: string;
  itemId: string;
  texto: string;
  tipo: string;
  /** Las clases que esta frase puede tener, con su etiqueta. «Dijo el dueño» no aparece si no lo dijo él. */
  tipos: [string, string][];
  sinRevisar: boolean;
  descartado: boolean;
  /** Falso para un número: no se corrige editando la frase, se quita y se anota de nuevo. */
  sePuedeCorregir: boolean;
}) {
  const { ocupado, error, enviar } = useEdicion(companyId);
  const [abierto, setAbierto] = useState(false);
  const [nuevoTexto, setNuevoTexto] = useState(texto);
  const [nuevoTipo, setNuevoTipo] = useState(tipo);
  const base = { ficha_id: fichaId, bloque, item_id: itemId };

  if (descartado)
    return (
      <div className="no-imprimir mt-2">
        <button className="boton boton--secundario" style={CHICO} disabled={ocupado} onClick={() => void enviar({ accion: "recuperar", ...base })}>
          Recuperar
        </button>
        <Fallo texto={error} />
      </div>
    );

  if (abierto)
    return (
      <form
        className="no-imprimir mt-3 flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await enviar({ accion: "editar", ...base, texto: nuevoTexto, tipo: nuevoTipo })) setAbierto(false);
        }}
      >
        <textarea className="campo w-full" rows={3} value={nuevoTexto} onChange={(e) => setNuevoTexto(e.target.value)} required minLength={3} maxLength={2000} aria-label={`Texto de la frase · ${nombreBloque}`} />
        <div className="flex flex-wrap items-center gap-3">
          <select className="campo" style={{ width: "auto" }} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} aria-label={`Clase de la frase · ${nombreBloque}`}>
            {tipos.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <button className="boton" style={CHICO} disabled={ocupado}>
            Guardar
          </button>
          <button
            type="button"
            className="boton boton--secundario"
            style={CHICO}
            disabled={ocupado}
            onClick={() => {
              setNuevoTexto(texto);
              setNuevoTipo(tipo);
              setAbierto(false);
            }}
          >
            Cancelar
          </button>
        </div>
        <Fallo texto={error} />
      </form>
    );

  return (
    <div className="no-imprimir mt-2">
      <div className="flex flex-wrap gap-2">
        {sinRevisar && (
          <button className="boton" style={CHICO} disabled={ocupado} onClick={() => void enviar({ accion: "dar_por_bueno", ...base })}>
            Dar por buena
          </button>
        )}
        {sePuedeCorregir && (
          <button
            className="boton boton--secundario"
            style={CHICO}
            disabled={ocupado}
            onClick={() => {
              // Se parte siempre de lo que hay ahora en la ficha, no de lo que había cuando se pintó el botón.
              setNuevoTexto(texto);
              setNuevoTipo(tipo);
              setAbierto(true);
            }}
          >
            Corregir
          </button>
        )}
        <button className="boton boton--secundario" style={CHICO} disabled={ocupado} onClick={() => void enviar({ accion: "quitar", ...base })}>
          Quitar
        </button>
      </div>
      <Fallo texto={error} />
    </div>
  );
}

/** Añadir una frase a un bloque, diciendo qué es: algo que dijo el dueño, una interpretación o un acuerdo. */
export function AgregarFrase({ companyId, fichaId, bloque, nombreBloque, tipos }: { companyId: string; fichaId: string; bloque: string; nombreBloque: string; tipos: [string, string][] }) {
  const { ocupado, error, enviar } = useEdicion(companyId);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("interpretacion");

  if (!abierto)
    return (
      <button className="boton boton--secundario no-imprimir" style={CHICO} onClick={() => setAbierto(true)}>
        Añadir una frase
      </button>
    );

  return (
    <form
      className="no-imprimir flex flex-col gap-2"
      style={{ flex: "1 1 100%" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await enviar({ accion: "agregar", ficha_id: fichaId, bloque, texto, tipo })) {
          setTexto("");
          setAbierto(false);
        }
      }}
    >
      <textarea className="campo w-full" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} required minLength={3} maxLength={2000} aria-label={`Frase nueva · ${nombreBloque}`} />
      <div className="flex flex-wrap items-center gap-3">
        <select className="campo" style={{ width: "auto" }} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label={`Clase de la frase nueva · ${nombreBloque}`}>
          {tipos.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <button className="boton" style={CHICO} disabled={ocupado}>
          Añadir
        </button>
        <button type="button" className="boton boton--secundario" style={CHICO} disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
      <Fallo texto={error} />
    </form>
  );
}

/**
 * Anotar un número de dirección que nadie más registra (la meta de ganancia, las horas que el dueño trabaja hoy
 * y las que quiere trabajar). Con «hoy» y «meta» del mismo número, la distancia se calcula sola.
 */
export function AnotarNumero({ companyId, fichaId, nombreBloque, cifras }: { companyId: string; fichaId: string; nombreBloque: string; cifras: [string, string][] }) {
  const { ocupado, error, enviar } = useEdicion(companyId);
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(cifras[0]?.[0] ?? "");
  const [momento, setMomento] = useState("deseado");
  const [valor, setValor] = useState("");

  if (!cifras.length) return null;
  if (!abierto)
    return (
      <button className="boton boton--secundario no-imprimir" style={CHICO} onClick={() => setAbierto(true)}>
        Anotar un número
      </button>
    );

  return (
    <form
      className="no-imprimir flex flex-col gap-2"
      style={{ flex: "1 1 100%" }}
      onSubmit={async (e) => {
        e.preventDefault();
        // Un campo vacío no es cero: sin número no se manda nada.
        if (valor.trim() === "" || !Number.isFinite(Number(valor))) return;
        if (await enviar({ accion: "anotar_numero", ficha_id: fichaId, clave, momento, valor: Number(valor) })) {
          setValor("");
          setAbierto(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <select className="campo" style={{ width: "auto" }} value={clave} onChange={(e) => setClave(e.target.value)} aria-label={`Qué número · ${nombreBloque}`}>
          {cifras.map(([valorCifra, etiqueta]) => (
            <option key={valorCifra} value={valorCifra}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select className="campo" style={{ width: "auto" }} value={momento} onChange={(e) => setMomento(e.target.value)} aria-label={`Hoy o meta · ${nombreBloque}`}>
          <option value="hoy">Hoy</option>
          <option value="deseado">Meta</option>
        </select>
        <input className="campo" style={{ width: 160 }} type="number" inputMode="decimal" min={0} step="any" value={valor} onChange={(e) => setValor(e.target.value)} required aria-label={`Valor del número · ${nombreBloque}`} />
        <button className="boton" style={CHICO} disabled={ocupado}>
          Anotar
        </button>
        <button type="button" className="boton boton--secundario" style={CHICO} disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
      <Fallo texto={error} />
    </form>
  );
}

/**
 * Describir una dimensión de la dependencia a mano, o corregir y dar por buena la que propuso el asistente.
 * Un campo vacío es «nada que decir»; no hay dónde poner un porcentaje.
 */
export function EditarDimension({ companyId, fichaId, dimension, nombre, campos, sinRevisar }: {
  companyId: string;
  fichaId: string;
  dimension: string;
  nombre: string;
  /** Los cuatro campos, en orden: clave, etiqueta y texto actual. */
  campos: { clave: string; etiqueta: string; texto: string }[];
  sinRevisar: boolean;
}) {
  const { ocupado, error, enviar } = useEdicion(companyId);
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(campos.map((c) => [c.clave, c.texto])));

  if (abierto)
    return (
      <form
        className="no-imprimir mt-3 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await enviar({ accion: "dimension", ficha_id: fichaId, dimension, ...Object.fromEntries(campos.map((c) => [c.clave, valores[c.clave]?.trim() || null])) })) setAbierto(false);
        }}
      >
        {campos.map((c) => (
          <label key={c.clave} className="t-etiqueta flex flex-col gap-1">
            {c.etiqueta}
            <textarea className="campo w-full" rows={2} maxLength={600} value={valores[c.clave] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))} aria-label={`${c.etiqueta} · ${nombre}`} />
          </label>
        ))}
        <div className="flex flex-wrap gap-3">
          <button className="boton" style={CHICO} disabled={ocupado}>
            Guardar
          </button>
          <button
            type="button"
            className="boton boton--secundario"
            style={CHICO}
            disabled={ocupado}
            onClick={() => {
              setValores(Object.fromEntries(campos.map((c) => [c.clave, c.texto])));
              setAbierto(false);
            }}
          >
            Cancelar
          </button>
        </div>
        <Fallo texto={error} />
      </form>
    );

  return (
    <div className="no-imprimir mt-3">
      <div className="flex flex-wrap gap-2">
        {sinRevisar && (
          <button className="boton" style={CHICO} disabled={ocupado} onClick={() => void enviar({ accion: "dar_por_buena_dimension", ficha_id: fichaId, dimension })}>
            Dar por buena
          </button>
        )}
        <button
          className="boton boton--secundario"
          style={CHICO}
          disabled={ocupado}
          onClick={() => {
            setValores(Object.fromEntries(campos.map((c) => [c.clave, c.texto])));
            setAbierto(true);
          }}
        >
          {campos.some((c) => c.texto) ? "Corregir" : "Describir"}
        </button>
      </div>
      <Fallo texto={error} />
    </div>
  );
}

/**
 * EL DUEÑO CONFIRMA SU FICHA. Queda guardado qué leyó, en qué versión y cuándo (un acta con el mismo contenido que
 * tiene delante), y después puede verla e imprimirla. Se le dice en una frase qué significa y qué no, antes de que pulse.
 */
export function ConfirmarDireccion({ companyId, fichaId, version }: { companyId: string; fichaId: string; version: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruta, setRuta] = useState<string | null>(null);

  const confirmar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = await pedir<{ ruta: string }>(`/api/companies/${companyId}/direccion/confirmar`, { json: { ficha_id: fichaId, version } });
      setRuta(r.ruta);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu confirmación.");
    } finally {
      setOcupado(false);
    }
  };

  if (ruta)
    return (
      <p className="t-dato" style={{ color: "var(--confirmado)" }}>
        Confirmado.{" "}
        <a href={ruta} style={{ textDecoration: "underline" }}>
          Ver mi constancia
        </a>
      </p>
    );

  return (
    <div>
      <button type="button" className="boton" disabled={ocupado} onClick={confirmar}>
        {ocupado ? "Guardando" : "Así es: lo confirmo"}
      </button>
      <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>
        Al confirmar queda guardado lo que leíste, en qué versión y cuándo. No es un contrato: es el registro de hacia dónde acordamos llevar tu empresa. Si algo no es así, díselo a tu consultora antes de confirmar.
      </p>
      <Fallo texto={error} />
    </div>
  );
}

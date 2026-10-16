"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/** Un acta ya clasificada y fechada en el servidor (PanelMediciones): de quién es y qué día, en hora de Lima. */
type ActaResumen = {
  id: string;
  aceptado_nombre: string | null;
  aceptado_rol: string | null;
  documento_path: string | null;
  clase: "dueno" | "consultora" | "otro";
  cuando: string;
};

const ROL: Record<string, string> = { socio: "socio" };

/**
 * LO QUE EL CONSULTOR PUEDE HACER SOBRE UNA MEDICIÓN: dejar constancia (copia literal con huella, ligada a
 * esta versión) y registrar un cambio de condiciones (temporada, local, precio) que afecte a la
 * comparación. Ninguna de las dos toca los valores congelados.
 *
 * CONSTANCIA NO ES ACEPTACIÓN. El acta que nace aquí la firma la consultora: deja escrito qué se le mostró
 * al dueño, pero no dice que él lo aceptó. La aceptación del dueño la da el dueño desde su portal, y esta
 * pantalla distingue las dos y dice cuándo falta la suya.
 */
export function AccionesMedicion({ companyId, medicionId, tipo, actas }: { companyId: string; medicionId: string; tipo: "linea_base" | "corte"; actas: ActaResumen[] }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<null | "acta" | "condicion">(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [queCambio, setQueCambio] = useState("");
  const [desde, setDesde] = useState("");
  const [efecto, setEfecto] = useState("");
  const [hecho, setHecho] = useState<string | null>(null);

  const generarActa = async () => {
    setTrabajando("acta");
    setError(null);
    try {
      const r = await pedir<{ ruta: string }>(`/api/companies/${companyId}/actas`, { json: { tipo, referencia_id: medicionId } });
      setHecho(`Constancia de la consultora guardada. Ábrela en ${r.ruta}. La aceptación del dueño la da él desde su portal.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la constancia.");
    } finally {
      setTrabajando(null);
    }
  };

  const registrarCambio = async () => {
    setTrabajando("condicion");
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/medicion/${medicionId}/condicion`, { json: { que_cambio: queCambio, desde, efecto_esperado: efecto } });
      setQueCambio("");
      setDesde("");
      setEfecto("");
      setAbierto(false);
      setHecho("Cambio de condiciones registrado.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el cambio.");
    } finally {
      setTrabajando(null);
    }
  };

  const aceptoElDueno = actas.some((a) => a.clase === "dueno");
  const hayConstancia = actas.some((a) => a.clase === "consultora");
  const sujeto = tipo === "corte" ? "este corte" : "esta versión del punto de partida";

  return (
    <div className="mt-2">
      <p className="t-dato mb-1" style={{ color: aceptoElDueno ? "var(--confirmado)" : "var(--caducado)", fontWeight: 600 }}>
        {aceptoElDueno
          ? `El dueño aceptó ${sujeto}.`
          : hayConstancia
            ? `Hay constancia de la consultora, pero el dueño todavía no aceptó ${sujeto}: la constancia no reemplaza su aceptación.`
            : `Sin aceptación del dueño ni constancia de la consultora sobre ${sujeto}.`}
      </p>
      {actas.length > 0 && (
        <ul className="flex flex-col gap-1 mb-2">
          {actas.map((a) => (
            <li key={a.id} className="t-dato" style={{ color: "var(--grafito)" }}>
              {a.clase === "dueno"
                ? `Aceptación del dueño: ${a.aceptado_nombre ?? "sin nombre"}`
                : a.clase === "consultora"
                  ? `Constancia de la consultora: ${a.aceptado_nombre ?? "sin nombre"}`
                  : `Acta de ${a.aceptado_nombre ?? "sin nombre"} (${ROL[a.aceptado_rol ?? ""] ?? a.aceptado_rol ?? "rol sin registrar"}); no cuenta como aceptación del dueño`}
              , el {a.cuando} ·{" "}
              <a href={a.documento_path ?? `/acta/${a.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Ver acta</a>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 13.5 }} disabled={trabajando !== null} onClick={generarActa}>
          {trabajando === "acta" ? "Guardando" : hayConstancia ? "Dejar otra constancia de la consultora" : "Dejar constancia de la consultora"}
        </button>
        <button type="button" className="boton boton--secundario" style={{ minHeight: 36, fontSize: 13.5 }} disabled={trabajando !== null} onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cancelar" : "Registrar cambio de condiciones"}
        </button>
      </div>
      {abierto && (
        <div className="flex flex-col gap-2 mt-3" style={{ maxWidth: 520 }}>
          <input className="campo" aria-label="Qué cambió" placeholder="Qué cambió (local nuevo, subió el precio, campaña escolar)" value={queCambio} onChange={(e) => setQueCambio(e.target.value)} />
          <input className="campo" aria-label="Desde cuándo rige el cambio" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input className="campo" aria-label="Efecto esperado sobre los números" placeholder="Qué efecto esperas sobre los números" value={efecto} onChange={(e) => setEfecto(e.target.value)} />
          <button type="button" className="boton" style={{ minHeight: 40, alignSelf: "flex-start" }} disabled={trabajando !== null || !queCambio.trim() || !desde || !efecto.trim()} onClick={registrarCambio}>
            {trabajando === "condicion" ? "Guardando" : "Guardar el cambio"}
          </button>
        </div>
      )}
      {hecho && <p className="t-dato mt-2" style={{ color: "var(--confirmado)" }}>{hecho}</p>}
      {error && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

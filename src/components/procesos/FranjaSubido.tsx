import Link from "next/link";
import { fechaCorta } from "@/lib/textos";
import { AbrirArchivo } from "./AbrirArchivo";
import { estadoSubida, rotuloSubida, QUE_HACER_NO_SE_PUDO, type FuenteSubida } from "./subidas";
import type { SubidoEnSeccion } from "./datos";

/** Lo que la empresa dijo de ese documento en «Tu información», en palabras de la consultora. */
const LO_QUE_DIJO: Record<string, string> = {
  lo_tengo: "Dijo que lo tiene",
  incompleto: "Dijo que tiene algo",
  no_lo_tengo: "Dijo que no está escrito",
  no_se: "Dijo que no sabe qué es",
  contado: "Lo contó con sus palabras",
  construyendo: "Se está armando el documento",
  borrador_generado: "Hay un borrador por confirmar",
  construido: "Documento armado y confirmado",
};

/** Cómo llegó el archivo: una foto, un documento, lo que contó escribiendo… */
const COMO_LLEGO: Record<string, string> = {
  documento: "documento",
  foto: "foto",
  audio: "nota de voz",
  dato: "tabla de datos",
  observacion: "lo contó escribiendo",
};

/** El pedido de esa sección, si la consultora lo hizo: cuándo y si ya avisaron que terminó. */
export type PedidoSeccion = { activa: { activada_at: string } | null; completada: { completada_at: string | null } | null } | null;

type Props = {
  titulo: string;
  /** El nombre del documento para la frase «todavía no subió…». */
  documento: string;
  lectura: SubidoEnSeccion;
  enlaceFuentes: string;
  pedido?: PedidoSeccion;
  /** Para escribir las fechas del pedido como las ve la empresa. */
  dia?: (iso: string | null | undefined) => string | null;
};

/**
 * «LO QUE SUBIÓ LA EMPRESA» (16-10-2026): una franja en la pestaña de la consultora (Organigrama) con el archivo que la
 * empresa subió en esa parte de «Tu información», con su fuente, su fecha y su estado de lectura (subido, por revisar,
 * listo, o no se pudo leer), el enlace para abrirlo y el de Fuentes. Si la consultora se lo pidió, cuándo y si ya avisó.
 * Si no se pudo leer, se dice; si no hay nada, se dice lo que la empresa marcó o que todavía no subió nada.
 */
export function FranjaSubido({ titulo, documento, lectura, enlaceFuentes, pedido, dia }: Props) {
  const fecha = (iso: string | null | undefined) => (dia ? dia(iso) : null) ?? fechaCorta(iso);
  return (
    <section className="panel p-5 mb-8" aria-label={titulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-seccion" style={{ fontSize: 18 }}>{titulo}</h2>
        <Link href={enlaceFuentes} className="enlace-azul">Todo en Fuentes</Link>
      </div>
      {pedido?.activa && (
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
          Se lo pediste el {fecha(pedido.activa.activada_at)}. Todavía no avisa que terminó.
        </p>
      )}
      {!pedido?.activa && pedido?.completada?.completada_at && (
        <p className="t-dato mt-1" style={{ color: "var(--confirmado)" }}>Avisó que terminó el {fecha(pedido.completada.completada_at)}.</p>
      )}

      {!lectura.ok ? (
        <p className="t-dato mt-3" role="alert" style={{ color: "var(--caducado)" }}>
          No pudimos leer lo que subió la empresa. Vuelve a cargar la página; mientras tanto, lo subido está en Fuentes.
        </p>
      ) : !lectura.fuente ? (
        <p className="t-cuerpo mt-3" style={{ color: "var(--grafito)" }}>
          {lectura.activo?.estado && LO_QUE_DIJO[lectura.activo.estado] ? `${LO_QUE_DIJO[lectura.activo.estado]}, pero no subió ningún archivo.` : `La empresa todavía no subió su ${documento}.`}
        </p>
      ) : (
        <ArchivoSubido fuente={lectura.fuente} loQueDijo={lectura.activo?.estado ? (LO_QUE_DIJO[lectura.activo.estado] ?? null) : null} />
      )}
    </section>
  );
}

/** Un archivo de esa parte, con su estado, cómo llegó, quién lo subió, y para abrirlo. */
function ArchivoSubido({ fuente: f, loQueDijo }: { fuente: FuenteSubida; loQueDijo: string | null }) {
  const e = estadoSubida(f);
  const r = rotuloSubida(e, "consultora", "documento");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1" style={{ borderTop: "1px solid var(--linea)", paddingTop: 10 }}>
        <span className="t-cuerpo" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          {f.nombre}
          <span className="t-dato" style={{ color: "var(--grafito)" }}>
            {" "}· {COMO_LLEGO[f.tipo ?? ""] ?? "archivo"} · {f.origen === "consultor" ? "lo subiste tú" : "lo subió la empresa"} · {fechaCorta(f.created_at)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className={`estado ${r.clase}`}>{r.texto}</span>
          <AbrirArchivo sourceId={f.id} nombre={f.nombre} />
        </span>
      </div>
      {e === "por_revisar" && <p className="t-dato" style={{ color: "var(--grafito)" }}>Lo que se leyó espera tu revisión en Fuentes antes de contar.</p>}
      {e === "no_se_pudo" && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{QUE_HACER_NO_SE_PUDO.consultora}</p>}
      {loQueDijo && (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>
          {loQueDijo}. Aquí se ve el último archivo de esta parte; si subió varios, los demás están en Fuentes.
        </p>
      )}
    </div>
  );
}

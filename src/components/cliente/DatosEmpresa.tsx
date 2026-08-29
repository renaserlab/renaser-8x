import Link from "next/link";
import { EditarMiEmpresa } from "@/components/cliente/EditarMiEmpresa";

type Bloque = { nombre: string; listos: number; total: number; href: string };

const CAMPOS: [string, string][] = [
  ["actividad", "A qué se dedica"],
  ["ciudad", "Ciudad"],
  ["personas", "Personas"],
  ["locales", "Locales o sedes"],
  ["antiguedad", "Años"],
  ["productos", "Lo principal que vende"],
  ["canales", "Por dónde llegan sus clientes"],
  ["whatsapp", "WhatsApp"],
];

/**
 * LOS DATOS DE TU EMPRESA, arriba de todo en Mi empresa, con su botón de editar AL LADO
 * (pedido de Kelin: corregir donde está la información, no en otra parte). Debajo, plegado,
 * lo que ya se levantó y lo que falta — sin repetir lo que vive en otras pantallas.
 */
export function DatosEmpresa({ nombre, ficha, bloques, faltaLevantar }: { nombre: string; ficha: Record<string, string>; bloques: Bloque[]; faltaLevantar: string[] }) {
  const puestos = CAMPOS.filter(([k]) => ficha[k]);
  const sinLlenar = CAMPOS.filter(([k]) => !ficha[k]);
  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div style={{ minWidth: 0 }}>
          <h2 className="t-seccion">{nombre}</h2>
          <p className="t-dato" style={{ color: "var(--grafito)" }}>{ficha.actividad ?? "Cuéntanos a qué se dedica"}{ficha.ciudad ? ` · ${ficha.ciudad}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap" style={{ flex: "none" }}>
          <Link href="/portal/informe" className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }}>Ver mi informe</Link>
          <EditarMiEmpresa nombre={nombre} ficha={ficha} />
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
        {puestos.map(([k, etiqueta]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <span className="t-dato" style={{ color: "var(--grafito)" }}>{etiqueta}</span>
            <span className="t-dato" style={{ fontWeight: 600, textAlign: "right", minWidth: 0 }}>{ficha[k]}</span>
          </div>
        ))}
      </div>
      {sinLlenar.length > 0 && (
        <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>
          Falta por llenar: {sinLlenar.map(([, e]) => e.toLowerCase()).join(", ")}.
        </p>
      )}

      <details className="mt-4">
        <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Lo que ya nos contaste</summary>
        <ul className="lista-editorial mt-2">
          {bloques.map((b) => (
            <li key={b.nombre} style={{ padding: "10px 0" }}>
              <div className="flex items-baseline justify-between gap-3">
                <Link href={b.href} className="t-dato" style={{ fontWeight: 550 }}>{b.nombre}</Link>
                <span className="t-dato" style={{ flex: "none", color: b.listos === b.total ? "var(--confirmado)" : "var(--grafito)" }}>
                  {b.listos} de {b.total}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {faltaLevantar.length > 0 && (
        <details className="mt-2">
          <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Lo que falta levantar ({faltaLevantar.length})</summary>
          <ul className="lista-editorial mt-2">
            {faltaLevantar.map((f) => (
              <li key={f} style={{ padding: "8px 0" }}>
                <span className="t-dato">{f}</span>
              </li>
            ))}
          </ul>
          <Link href="/portal/conversacion" className="boton boton--secundario mt-3" style={{ minHeight: 38, fontSize: 14, display: "inline-flex" }}>Seguir contando</Link>
        </details>
      )}
    </section>
  );
}

import Link from "next/link";
import { bandeja } from "@/lib/bandeja";
import { Vacio } from "@/components/base/Vacio";
import { Franja, Lectura } from "@/components/base/Franja";
import { ETAPA, VACIO } from "@/lib/textos";

export const dynamic = "force-dynamic";

/**
 * LA BANDEJA (inicio del consultor), en el idioma híbrido: instrumentos → la voz (lo más urgente,
 * en serif, con UNA acción) → el resto del día → todas las empresas. Con treinta empresas, esta
 * pantalla es el producto. Capítulo 33.
 */
export default async function Bandeja() {
  const { items, empresas } = await bandeja();
  const criticos = items.filter((i) => i.urgencia === 1).length;
  const primero = items[0] ?? null;
  const resto = items.slice(1);

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-5">
        <h1 className="t-titulo">Tu día</h1>
        <Link href="/empresas/nueva" className="boton">Nueva empresa</Link>
      </div>

      {/* INSTRUMENTOS del consultor */}
      <Franja columnas={3}>
        <Lectura divisor={false} valor={String(empresas.length)} etiqueta="empresas a tu cargo" />
        <Lectura valor={String(items.length)} etiqueta="pendientes hoy" color={items.length > 0 ? "var(--marca)" : "var(--confirmado)"} />
        <Lectura valor={String(criticos)} etiqueta="críticos" color={criticos > 0 ? "var(--contradicho)" : "var(--grafito)"} />
      </Franja>

      {/* LA VOZ: lo más urgente del día, con una sola acción */}
      {primero ? (
        <section className="mt-8 mb-10">
          <p className="t-hero" style={{ fontSize: "clamp(22px, 3.6vw, 30px)", maxWidth: "30ch" }}>
            {primero.empresa}: {primero.titulo.toLowerCase()}
          </p>
          {primero.detalle && <p className="t-cuerpo mt-2 medida" style={{ color: "var(--grafito)" }}>{primero.detalle}</p>}
          <div className="mt-4">
            <Link href={primero.href} className="boton boton--grande">Atenderlo ahora</Link>
          </div>
        </section>
      ) : (
        <div className="mt-8 mb-10">
          <Vacio texto={VACIO.bandeja} accion="Ver empresas" href="/empresas" />
        </div>
      )}

      {resto.length > 0 && (
        <>
          <h2 className="t-seccion mb-3">Lo demás de hoy</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Qué pasa</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {resto.map((it, i) => (
                <tr key={i}>
                  <td className="t-dato">
                    <Link href={`/empresa/${it.company_id}`}>{it.empresa}</Link>
                  </td>
                  <td>
                    <Link href={it.href} className="t-dato" style={{ color: it.urgencia === 1 ? "var(--contradicho)" : "var(--tinta)" }}>
                      {it.titulo}
                    </Link>
                  </td>
                  <td style={{ color: "var(--grafito)" }}>{it.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="t-seccion mt-12 mb-4">Todas las empresas</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Etapa</th>
            <th>Fuentes</th>
            <th>Definiciones</th>
            <th>Confirmadas</th>
            <th>Contradichas</th>
            <th>Por revisar</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => {
            const s = e.stats as Record<string, number> | null;
            return (
              <tr key={e.id}>
                <td className="t-dato">
                  <Link href={`/empresa/${e.id}`}>{e.nombre}</Link>
                </td>
                <td>{ETAPA[e.etapa] ?? e.etapa}</td>
                <td className="t-dato">{s?.fuentes ?? 0}</td>
                <td className="t-dato">{s?.afirmaciones ?? 0}</td>
                <td className="t-dato">{s?.confirmadas ?? 0}</td>
                <td className="t-dato">{s?.contradichas ?? 0}</td>
                <td className="t-dato">{s?.hallazgos_por_revisar ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

import Link from "next/link";
import { bandeja } from "@/lib/bandeja";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { ETAPA, VACIO } from "@/lib/textos";

export const dynamic = "force-dynamic";

/** La bandeja: qué requiere atención hoy. Con treinta empresas, esta pantalla es el producto. Capítulo 33. */
export default async function Bandeja() {
  const { items, empresas } = await bandeja();
  return (
    <>
      <Encabezado titulo="Qué requiere atención hoy" sub={`${empresas.length} empresas · ${items.length} pendientes`} acciones={<Link href="/empresas/nueva" className="boton">Nueva empresa</Link>} />
      {items.length === 0 ? (
        <Vacio texto={VACIO.bandeja} accion="Ver empresas" href="/empresas" />
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Qué pasa</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
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

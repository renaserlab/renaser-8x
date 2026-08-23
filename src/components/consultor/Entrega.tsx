"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { ENTREGABLE, fechaCorta } from "@/lib/textos";

export type Deliv = { id: string; tipo: string; version: number; publicado: boolean; publicado_at: string | null; created_at: string };

/** Armar y publicar el paquete. Nada se publica con hallazgos sin revisar. Capítulo 35. */
export function Entrega({ companyId, entregables, pendientes }: { companyId: string; entregables: Deliv[]; pendientes: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(entregables.filter((e) => !e.publicado).map((e) => e.id));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const publicar = async () => {
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/publish`, { json: { publicar: sel } });
      setOk("Publicado");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar.");
    }
  };
  const despublicar = async (id: string) => {
    await pedir(`/api/companies/${companyId}/publish`, { json: { despublicar: [id] } });
    router.refresh();
  };

  const porTipo = new Map<string, Deliv[]>();
  for (const e of entregables) porTipo.set(e.tipo, [...(porTipo.get(e.tipo) ?? []), e]);

  return (
    <div className="flex flex-col gap-6">
      {pendientes > 0 && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }}>Hay {pendientes} hallazgos sin revisar. No se puede publicar hasta revisarlos.</p>}
      <table className="tabla">
        <thead>
          <tr>
            <th></th>
            <th>Documento</th>
            <th>Versión</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(ENTREGABLE).map((tipo) => {
            const vs = (porTipo.get(tipo) ?? []).sort((a, b) => b.version - a.version);
            const ult = vs[0];
            return (
              <tr key={tipo}>
                <td>{ult && !ult.publicado && <input type="checkbox" checked={sel.includes(ult.id)} onChange={(e) => setSel(e.target.checked ? [...sel, ult.id] : sel.filter((x) => x !== ult.id))} aria-label={`Publicar ${ENTREGABLE[tipo]}`} />}</td>
                <td className="t-dato">{ult ? <Link href={`/empresa/${companyId}/entrega/${ult.id}`}>{ENTREGABLE[tipo]}</Link> : ENTREGABLE[tipo]}</td>
                <td className="t-dato">{ult ? `v${ult.version} · ${fechaCorta(ult.created_at)}` : "—"}</td>
                <td>{!ult ? <span style={{ color: "var(--grafito)" }}>sin generar</span> : ult.publicado ? <span style={{ color: "var(--confirmado)" }}>publicado {fechaCorta(ult.publicado_at)}</span> : "borrador"}</td>
                <td className="text-right">{ult?.publicado && <button className="boton boton--secundario" style={{ minHeight: 36 }} onClick={() => despublicar(ult.id)}>Retirar</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {ok && <p className="t-dato" style={{ color: "var(--confirmado)" }}>{ok}</p>}
      <div>
        <button className="boton" onClick={publicar} disabled={!sel.length || pendientes > 0}>Publicar {sel.length} documento(s) al cliente</button>
      </div>
    </div>
  );
}

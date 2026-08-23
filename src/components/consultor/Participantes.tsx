"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";

type P = { id: string; nombre: string; puesto: string | null; rol: string | null; token_expira_at: string | null; token_revocado_at: string | null; sesiones: { id: string; tipo: string; estado: string }[] };

const ROLES = [
  ["dueno", "Dueño"],
  ["socio", "Socio"],
  ["lider", "Líder de área"],
  ["empleado", "Primera línea"],
];

/**
 * Líderes y primera línea se entrevistan por separado, cada uno desde su celular con un enlace. Capítulo 7.4.
 * P0-04: el enlace se muestra una sola vez al generarse; el servidor nunca devuelve un token existente.
 */
export function Participantes({ companyId, participantes }: { companyId: string; participantes: P[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [rol, setRol] = useState("empleado");
  const [error, setError] = useState<string | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await pedir<{ participante: { id: string }; enlace: string }>("/api/participants", { json: { company_id: companyId, nombre, puesto, rol } });
      setEnlaces((l) => ({ ...l, [r.participante.id]: r.enlace }));
      setNombre("");
      setPuesto("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    }
  };
  const generar = async (p: P) => {
    const r = await pedir<{ enlace: string }>(`/api/participants/${p.id}/enlace`, { method: "POST", json: {} });
    setEnlaces((l) => ({ ...l, [p.id]: r.enlace }));
    router.refresh();
  };
  const revocar = async (p: P) => {
    await pedir(`/api/participants/${p.id}/enlace`, { method: "POST", json: { revocar: true } });
    setEnlaces((l) => { const c = { ...l }; delete c[p.id]; return c; });
    router.refresh();
  };
  const copiar = async (p: P) => {
    await navigator.clipboard.writeText(enlaces[p.id]);
    setCopiado(p.id);
    setTimeout(() => setCopiado(null), 1500);
  };
  const borrar = async (p: P) => {
    if (!confirm(`¿Eliminar a ${p.nombre} y sus respuestas?`)) return;
    await pedir("/api/participants", { method: "DELETE", json: { id: p.id } });
    router.refresh();
  };
  const estadoEnlace = (p: P) => {
    if (p.token_revocado_at) return "revocado";
    if (!p.token_expira_at) return "sin enlace";
    return new Date(p.token_expira_at) < new Date() ? "vencido" : `vigente hasta ${fechaCorta(p.token_expira_at)}`;
  };

  return (
    <section className="mb-8">
      <h2 className="t-seccion mb-4">Personas entrevistadas</h2>
      {participantes.length > 0 && (
        <table className="tabla mb-6">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Rol</th>
              <th>Sesiones</th>
              <th>Enlace</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {participantes.map((p) => (
              <tr key={p.id}>
                <td className="t-dato">{p.nombre}</td>
                <td>{p.puesto ?? "—"}</td>
                <td>{ROLES.find((r) => r[0] === p.rol)?.[1] ?? p.rol}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {p.sesiones.map((s) => (
                      <Link key={s.id} href={`/empresa/${companyId}/entrevista?sesion=${s.id}`} className="t-dato" style={{ color: s.estado === "completa" ? "var(--confirmado)" : s.estado === "en_curso" ? "var(--caducado)" : "var(--grafito)" }}>
                        {s.tipo} · {s.estado}
                      </Link>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="t-dato" style={{ color: "var(--grafito)" }}>{estadoEnlace(p)}</div>
                  {enlaces[p.id] && (
                    <div className="t-dato mt-1" style={{ wordBreak: "break-all" }}>
                      {enlaces[p.id]}
                      <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>Cópialo ahora: no se vuelve a mostrar.</div>
                    </div>
                  )}
                </td>
                <td>
                  <div className="flex gap-2 justify-end flex-wrap">
                    {enlaces[p.id] ? (
                      <button className="boton boton--secundario" style={{ minHeight: 36 }} onClick={() => copiar(p)}>{copiado === p.id ? "Copiado" : "Copiar enlace"}</button>
                    ) : (
                      <button className="boton boton--secundario" style={{ minHeight: 36 }} onClick={() => generar(p)}>Generar enlace nuevo</button>
                    )}
                    {!p.token_revocado_at && p.token_expira_at && <button className="boton boton--secundario" style={{ minHeight: 36 }} onClick={() => revocar(p)}>Revocar</button>}
                    <button className="boton boton--peligro" style={{ minHeight: 36 }} onClick={() => borrar(p)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={crear} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Nombre</span>
          <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: 200 }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Puesto</span>
          <input className="campo" value={puesto} onChange={(e) => setPuesto(e.target.value)} style={{ width: 200 }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Rol</span>
          <select className="campo" value={rol} onChange={(e) => setRol(e.target.value)} style={{ width: 180 }}>
            {ROLES.map(([v, n]) => (
              <option key={v} value={v}>{n}</option>
            ))}
          </select>
        </label>
        <button className="boton">Agregar y generar enlace</button>
        {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}
      </form>
    </section>
  );
}

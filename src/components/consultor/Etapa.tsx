"use client";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { ETAPA } from "@/lib/textos";

/** El ciclo avanza por condiciones; el consultor puede fijar la etapa a mano. */
export function Etapa({ companyId, etapa }: { companyId: string; etapa: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="t-etiqueta">Etapa</span>
      <select
        className="campo"
        style={{ width: "auto" }}
        value={etapa}
        onChange={async (e) => {
          await pedir(`/api/companies/${companyId}`, { method: "PATCH", json: { etapa: e.target.value } });
          router.refresh();
        }}
      >
        {Object.entries(ETAPA).map(([v, n]) => (
          <option key={v} value={v}>{n}</option>
        ))}
      </select>
    </label>
  );
}

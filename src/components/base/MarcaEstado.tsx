import { ESTADO_CLIENTE, ESTADO_CONSULTOR } from "@/lib/textos";

type Estado = "confirmado" | "caducado" | "contradicho" | "sin_verificar" | string;

const COLOR: Record<string, string> = {
  confirmado: "var(--confirmado)",
  caducado: "var(--caducado)",
  contradicho: "var(--contradicho)",
  sin_verificar: "var(--sin-verificar)",
};

/** El elemento firma: color + forma geométrica, siempre juntos. Capítulo 17.5.
 *  ● confirmado · ◐ caducado · ◍ contradicho · ○ sin verificar */
export function Marca({ estado, tamano = 14 }: { estado: Estado; tamano?: number }) {
  const c = COLOR[estado] ?? COLOR.sin_verificar;
  const r = tamano / 2;
  return (
    <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden="true">
      {estado === "confirmado" && <circle cx={r} cy={r} r={r - 1} fill={c} />}
      {estado === "caducado" && (
        <>
          <circle cx={r} cy={r} r={r - 1} fill="none" stroke={c} strokeWidth="1.5" />
          <path d={`M ${r} 1 A ${r - 1} ${r - 1} 0 0 1 ${r} ${tamano - 1} Z`} fill={c} />
        </>
      )}
      {estado === "contradicho" && (
        <>
          <circle cx={r} cy={r} r={r - 1} fill={c} />
          <line x1={2} y1={tamano - 2} x2={tamano - 2} y2={2} stroke="var(--papel)" strokeWidth="2" />
        </>
      )}
      {(estado === "sin_verificar" || !COLOR[estado]) && <circle cx={r} cy={r} r={r - 1} fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="2 2" />}
    </svg>
  );
}

export function MarcaEstado({ estado, paraCliente = false, tamano = 14 }: { estado: Estado; paraCliente?: boolean; tamano?: number }) {
  const texto = (paraCliente ? ESTADO_CLIENTE : ESTADO_CONSULTOR)[estado] ?? estado;
  return (
    <span className="marca-estado t-dato" style={{ color: COLOR[estado] ?? COLOR.sin_verificar }}>
      <Marca estado={estado} tamano={tamano} />
      {texto}
    </span>
  );
}

/** Leyenda de las tres formas: se aprende en un minuto. */
export function LeyendaEstados({ paraCliente = false }: { paraCliente?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {["confirmado", "caducado", "contradicho", "sin_verificar"].map((e) => (
        <MarcaEstado key={e} estado={e} paraCliente={paraCliente} />
      ))}
    </div>
  );
}

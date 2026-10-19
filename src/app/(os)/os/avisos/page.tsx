import Link from "next/link";
import { contextoOS } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { avisosDe, type Aviso } from "@/lib/os/datos";
import { Icono, type NombreIcono } from "@/components/base/Icono";
import { MarcarLeido, InterruptorRegla } from "@/components/os/equipo/Avisos";

export const dynamic = "force-dynamic";

type Regla = Aviso["regla"];

/** Las cinco revisiones que agenda pg_cron (supabase/migracion-renaser-os.sql), dichas para el dueño, en hora de Lima. */
const REGLAS: [Regla, string, string][] = [
  ["inactividad", "Inactividad del equipo", "Cada 5 minutos, de lunes a sábado de 8 a. m. a 7 p. m.: quien abrió el día y lleva una hora sin moverse, y los cronómetros que corren hace más de 10 horas."],
  ["bloqueos", "Tareas bloqueadas más de 30 minutos", "Cada 5 minutos: un aviso por bloqueo, con la causa y de quién depende."],
  ["plan", "Plan del día siguiente", "De lunes a viernes a las 5:30 p. m.: quién no tiene tareas para el próximo día hábil."],
  ["cierre_semanal", "Cierre semanal pendiente", "Viernes y sábado a las 6:00 p. m.: quién no cerró su semana."],
  ["diagnostico", "Diagnóstico diario de tareas", "De lunes a viernes a las 6:00 a. m.: tareas vencidas, sin fecha, muy prorrogadas y bloqueadas."],
];

const GRUPOS: [string, string, Regla[]][] = [
  ["todos", "Todos", ["inactividad", "bloqueos", "plan", "cierre_semanal", "diagnostico"]],
  ["equipo", "Equipo", ["inactividad"]],
  ["tareas", "Tareas", ["bloqueos", "diagnostico"]],
  ["rituales", "Rituales", ["plan", "cierre_semanal"]],
];

const ICONO: Record<Regla, NombreIcono> = { inactividad: "reloj", bloqueos: "aviso", plan: "plan", cierre_semanal: "hecho", diagnostico: "diagnostico" };
const ORIGEN: Record<Regla, string> = {
  inactividad: "inactividad, cada 5 min",
  bloqueos: "bloqueos de más de 30 min",
  plan: "plan del día siguiente, 5:30 p. m.",
  cierre_semanal: "cierre semanal, viernes y sábado",
  diagnostico: "diagnóstico diario, 6:00 a. m.",
};

/**
 * AVISOS (RENASER OS, 19-10-2026). Lo que la base genera sola con sus cinco revisiones, más los que la gestión deja a
 * alguien («Avisarle»). Cada uno ve los suyos; la gestión ve además los de la gestión y decide qué revisiones quedan
 * encendidas en su empresa. Un aviso de gestión lo marca leído cualquiera de la gestión: es uno para el equipo que dirige.
 */
export default async function Avisos({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const c = await contextoOS();
  const sp = await searchParams;
  const grupo = GRUPOS.find(([k]) => k === sp.filtro) ?? GRUPOS[0]!;
  const sb = supabaseAdmin();
  const todos = await avisosDe(c);
  const avisos = todos.filter((a) => grupo[2].includes(a.regla));
  const { data: reglas } = c.gestion ? await sb.from("os_reglas").select("regla,activa,ultima_corrida_at").eq("company_id", c.companyId) : { data: [] };
  const manuales = new Set(avisos.filter((a) => a.clave.startsWith("manual:")).map((a) => a.id));
  const estadoRegla = new Map(((reglas ?? []) as { regla: Regla; activa: boolean; ultima_corrida_at: string | null }[]).map((r) => [r.regla, r]));
  const sinLeer = todos.filter((a) => !a.leido_at).length;
  const ahora = new Date().getTime();
  const cuando = (iso: string) => {
    const min = Math.round((ahora - new Date(iso).getTime()) / 60000);
    if (min < 1) return "Ahora";
    if (min < 60) return `Hace ${min} min`;
    if (min < 12 * 60) return `Hace ${Math.round(min / 60)} h`;
    return new Intl.DateTimeFormat("es-PE", { timeZone: c.zona, weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  };

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">{c.gestion ? "Mi equipo" : "Mi día"} · {sinLeer ? `${sinLeer} sin leer` : "todo leído"}</p>
          <h1 className="t-titulo">Avisos</h1>
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Llegan solos: la base de datos revisa al equipo aunque nadie tenga 8X abierto.</p>
        </div>
        {sinLeer > 0 && <MarcarLeido todos />}
      </header>

      <div className="os-dos">
        <section className="flex flex-col gap-3" aria-label="Lista de avisos">
          <nav className="os-filtros" aria-label="Filtrar avisos">
            {GRUPOS.map(([k, nombre, rs]) => (
              <Link key={k} className="os-pildora" href={k === "todos" ? "/os/avisos" : `/os/avisos?filtro=${k}`} aria-current={grupo[0] === k ? "page" : undefined} scroll={false}>
                {nombre} · {todos.filter((a) => rs.includes(a.regla)).length}
              </Link>
            ))}
          </nav>
          {avisos.length === 0 ? (
            <div className="vacio">
              <p className="vacio__texto">{todos.length ? "No hay avisos de este tipo." : "Todavía no hay avisos. Cuando algo pida atención, aparece aquí y en el contador del menú."}</p>
            </div>
          ) : (
            avisos.map((a) => (
              <article key={a.id} className="os-aviso" data-nuevo={a.leido_at ? undefined : ""}>
                <span className={`os-aviso__icono os-aviso__icono--${a.regla}`} aria-hidden="true">
                  <Icono nombre={ICONO[a.regla]} />
                </span>
                <div className="os-aviso__cuerpo">
                  <div className="os-aviso__titulo">
                    <strong>{a.titulo}</strong>
                    <time dateTime={a.created_at}>{cuando(a.created_at)}</time>
                  </div>
                  {a.detalle && <span className="t-dato" style={{ lineHeight: 1.45 }}>{a.detalle}</span>}
                  <div className="os-aviso__pie">
                    <span className="os-origen">{manuales.has(a.id) ? "Te lo dejó tu equipo" : `Automático · ${ORIGEN[a.regla]}`}</span>
                    {a.enlace && <Link href={a.enlace} className="t-dato" style={{ fontWeight: 700 }}>Ir a verlo</Link>}
                    {!a.leido_at && <MarcarLeido id={a.id} titulo={a.titulo} />}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <aside>
          {c.gestion ? (
            <section className="os-tarjeta" aria-label="Revisiones automáticas">
              <h2 className="t-seccion">Revisiones automáticas</h2>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Hora de Lima. Tú decides cuáles quedan encendidas en tu empresa.</p>
              <div>
                {REGLAS.map(([k, nombre, que]) => {
                  const r = estadoRegla.get(k);
                  return (
                    <div key={k} className="os-regla">
                      <div className="os-regla__textos">
                        <strong>{nombre}</strong>
                        <span>{que}</span>
                        <span>{r?.activa === false ? "Apagada en tu empresa." : r?.ultima_corrida_at ? `Última revisión: ${cuando(r.ultima_corrida_at).toLowerCase()}.` : "Todavía no corrió."}</span>
                      </div>
                      <InterruptorRegla regla={k} nombre={nombre} activa={r?.activa !== false} />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="os-tarjeta">
              <h2 className="t-seccion">De dónde salen</h2>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Te avisamos si no tienes tareas para mañana (5:30 p. m.) y si falta tu cierre de la semana (viernes y sábado). Tu jefe también puede dejarte un aviso.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

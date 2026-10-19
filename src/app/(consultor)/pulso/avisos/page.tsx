import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { enlaceAEmpresa } from "@/lib/os/pulso";
import { ZONA_POR_DEFECTO, zonaValida } from "@/lib/revision-semanal";

export const dynamic = "force-dynamic";

/** Cómo se llama cada regla de la base al lado del aviso (la misma palabra que usa la pantalla de avisos de la empresa). */
const NOMBRE_REGLA: Record<string, string> = {
  inactividad: "Inactividad del equipo",
  bloqueos: "Tarea bloqueada",
  plan: "Plan del día siguiente",
  cierre_semanal: "Cierre semanal",
  diagnostico: "Diagnóstico diario",
};

type AvisoCliente = {
  id: string;
  company_id: string;
  regla: string;
  titulo: string;
  detalle: string | null;
  leido_at: string | null;
  created_at: string;
};

/** «19/10 · 10:02 a. m.» en el reloj de la empresa del aviso. */
function cuando(instante: string, zona: string): string {
  const d = new Date(instante);
  const dia = new Intl.DateTimeFormat("es-PE", { timeZone: zona, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("es-PE", { timeZone: zona, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${dia} · ${hora}`;
}

/**
 * AVISOS DE CLIENTES (RENASER OS multiempresa, 19-10-2026). Los avisos para la gestión que la base generó en todas las
 * empresas (inactividad, bloqueos, plan de mañana, cierre semanal, diagnóstico), del más nuevo al más viejo, con la
 * empresa arriba. Aquí la consultora solo mira: marcarlos como leídos es de la gestión de cada empresa, en su pantalla
 * de avisos, a la que lleva el enlace de cada uno.
 */
export default async function AvisosDeClientes({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: empresas, error: e1 }, { data: conAvisos, error: e2 }] = await Promise.all([
    sb.from("companies").select("id,nombre,zona_horaria").order("nombre"),
    sb.from("os_avisos").select("company_id").eq("para_gestion", true),
  ]);
  const filtro = (empresas ?? []).find((e) => e.id === sp.empresa) ?? null;
  let consulta = sb
    .from("os_avisos")
    .select("id,company_id,regla,titulo,detalle,leido_at,created_at")
    .eq("para_gestion", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtro) consulta = consulta.eq("company_id", filtro.id);
  const { data, error: e3 } = await consulta;
  const error = e1 ?? e2 ?? e3;
  const avisos = (data ?? []) as AvisoCliente[];
  const porId = new Map((empresas ?? []).map((e) => [e.id, e]));
  // Solo se ofrecen como filtro las empresas que tienen algún aviso: las demás darían una lista vacía.
  const conAlguno = new Set((conAvisos ?? []).map((a) => a.company_id));
  const opciones = (empresas ?? []).filter((e) => conAlguno.has(e.id));
  const sinLeer = avisos.filter((a) => !a.leido_at).length;

  return (
    <>
      <Encabezado
        titulo="Avisos de clientes"
        sub={filtro ? `${filtro.nombre} · ${sinLeer} sin leer de ${avisos.length}` : `Todas las empresas · ${sinLeer} sin leer de ${avisos.length}`}
        acciones={
          <Link href="/pulso" className="boton boton--secundario">
            Volver al pulso
          </Link>
        }
      />
      {error && (
        <p className="aviso aviso--pide mb-6" role="alert">
          No se pudieron leer todos los avisos ({error.message}). Lo que ves puede estar incompleto.
        </p>
      )}
      <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
        Llegan solos: la base revisa a cada equipo aunque nadie tenga 8X abierto. Marcarlos como leídos lo hace la gestión de cada empresa.
      </p>

      {opciones.length > 1 && (
        <nav className="os-filtro-empresas mb-6" aria-label="Filtrar por empresa">
          <Link href="/pulso/avisos" aria-current={!filtro ? "page" : undefined}>Todas</Link>
          {opciones.map((e) => (
            <Link key={e.id} href={`/pulso/avisos?empresa=${e.id}`} aria-current={filtro?.id === e.id ? "page" : undefined}>
              {e.nombre}
            </Link>
          ))}
        </nav>
      )}

      {avisos.length === 0 ? (
        <Vacio texto={filtro ? "Esta empresa todavía no tiene avisos para su gestión." : "Todavía no hay avisos de ninguna empresa."} accion="Ver el pulso" href="/pulso" />
      ) : (
        <ul className="os-avisos-clientes">
          {avisos.map((a) => {
            const empresa = porId.get(a.company_id);
            const zona = zonaValida(empresa?.zona_horaria) ? empresa!.zona_horaria! : ZONA_POR_DEFECTO;
            return (
              <li key={a.id} className="os-aviso-cliente" data-nuevo={a.leido_at ? undefined : ""}>
                <p className="t-etiqueta">{empresa?.nombre ?? "Empresa"}</p>
                <div className="os-aviso-cliente__cabeza">
                  <h2 className="os-aviso-cliente__titulo">{a.titulo}</h2>
                  <span className="t-dato os-tenue">{cuando(a.created_at, zona)}{a.leido_at ? " · leído" : ""}</span>
                </div>
                {a.detalle && <p className="t-dato" style={{ color: "var(--tinta-suave)" }}>{a.detalle}</p>}
                <div className="os-aviso-cliente__pie">
                  <span className="os-chip-regla">Automático · {NOMBRE_REGLA[a.regla] ?? a.regla}</span>
                  <a className="t-dato fuerte" href={enlaceAEmpresa(a.company_id, "/os/avisos")}>Abrir en su empresa</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

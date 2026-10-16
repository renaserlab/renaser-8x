import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Subir } from "@/components/Subir";
import { AccionesFuente, ReintentarJob } from "@/components/consultor/FuentesAcciones";
import { RevisarExtraccion, type ClaimPorRevisar, type MetricaPorRevisar } from "@/components/realidad/RevisarExtraccion";
// Valores compartidos con el componente de cliente: de un módulo "use client" un componente de servidor
// solo puede importar componentes y tipos; un objeto importado de ahí llega vacío (ver fidelidad.ts).
import { rotuloFidelidad, resumenLecturaEnParte, type FragmentoCitado } from "@/lib/documentos/fidelidad";
import { VACIO, fechaCorta } from "@/lib/textos";
import { hayTranscriptor } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Fuente = {
  id: string;
  tipo: string | null;
  nombre: string;
  fecha_origen: string | null;
  origen: string | null;
  estado: string | null;
  error: string | null;
  created_at: string;
  fidelidad_extraccion: string | null;
  fidelidad_nota: string | null;
  revision: string | null;
  claims: { count: number }[] | null;
};

/** Un trabajo de extracción vivo, reducido a la fuente que lee. La consulta ligera entrega `source_id`; la de respaldo, la fila con su `payload`. */
type TrabajoDeLectura = { source_id?: string | null; payload?: { source_id?: string | null } | null };

type Base = ReturnType<typeof supabaseAdmin>;

/**
 * QUÉ FUENTES DE LA EMPRESA SE ESTÁN LEYENDO AHORA MISMO: las que tienen un trabajo de extracción en cola o corriendo.
 * Va aparte de la lista de trabajos de la página (que corta en 30 y mezcla todas las clases de trabajo).
 *
 * Se pregunta de dos maneras, y la respuesta NUNCA se da por buena si la consulta falló:
 *  1. la ligera pide solo la fuente de cada trabajo (`payload->>source_id`), no el tramo de texto que lleva dentro;
 *  2. si la base no la acepta, se pide el `payload` entero, que es como ya lo leen la cola y la torre. Son solo los
 *     trabajos vivos de una empresa: pesa más, pero contesta.
 * Si fallan las dos devuelve el motivo y `ids: null`. Antes el error se ignoraba y la lista salía vacía: toda fuente
 * en lectura aparecía en rojo como «la lectura se cortó: vuelve a leerla» (y volver a leerla retira los trabajos que
 * la estaban leyendo), y una pendiente con un tramo reintentándose aparecía lista para consolidar.
 */
async function fuentesEnLectura(sb: Base, companyId: string): Promise<{ ids: Set<string>; error: null } | { ids: null; error: string }> {
  const vivos = (columnas: string): PromiseLike<{ data: unknown; error: { message: string } | null }> =>
    sb.from("jobs").select(columnas).eq("company_id", companyId).eq("tipo", "extraer").in("estado", ["pendiente", "corriendo"]).limit(1000);
  let { data, error } = await vivos("source_id:payload->>source_id");
  if (error) ({ data, error } = await vivos("payload"));
  if (error) return { ids: null, error: error.message };
  return { ids: new Set(((data ?? []) as TrabajoDeLectura[]).map((j) => j.source_id ?? j.payload?.source_id ?? "").filter(Boolean)), error: null };
}

/**
 * CÓMO VA LA LECTURA DE UNA FUENTE, que no es lo mismo que su `estado`:
 *  - «en_curso»: hay un trabajo de extracción en cola o corriendo para ella. Pasa con una fuente recién subida, con
 *    una que se mandó a leer otra vez (su estado sigue «leido» hasta que el trabajo arranca) y con una a la que se
 *    le está reintentando un tramo que falló;
 *  - «cortada»: empezó a leerse, no terminó y ya no hay ningún trabajo leyéndola (o la lectura terminó en error).
 *    Antes se quedaba «leyendo» para siempre, y una que falló decía que «se está leyendo»;
 *  - «terminada»: leída, sin nada en marcha. Solo esta se rotula «por revisar»;
 *  - «sin_leer»: lo demás (una observación guardada como texto, que no pasa por el lector): se muestra como está;
 *  - «sin_comprobar»: no se pudo mirar la cola de trabajos (`enLectura` es null), así que de una fuente «leyendo» no
 *    se sabe si sigue o se cortó, y de una que espera revisión no se sabe si se le está reintentando un tramo. Se
 *    dice eso, y no «se cortó» ni «por revisar»: afirmar cualquiera de las dos sería inventar. Una lectura que
 *    terminó en error sí se sabe cortada sin mirar la cola.
 */
type Lectura = "en_curso" | "cortada" | "terminada" | "sin_leer" | "sin_comprobar";
function lecturaDe(f: Fuente, enLectura: Set<string> | null): Lectura {
  if (enLectura?.has(f.id)) return "en_curso";
  if (f.estado === "error") return "cortada";
  if (!enLectura && (f.estado === "leyendo" || f.revision === "pendiente")) return "sin_comprobar";
  if (f.estado === "leido") return "terminada";
  return f.estado === "leyendo" ? "cortada" : "sin_leer";
}

export default async function Fuentes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: fuentesRaw }, { data: jobs, error: eJobs }, vivas] = await Promise.all([
    sb.from("sources").select("id,tipo,nombre,fecha_origen,origen,estado,error,created_at,fidelidad_extraccion,fidelidad_nota,revision, claims(count)").eq("company_id", id).order("created_at", { ascending: false }),
    sb.from("jobs").select("id,tipo,estado,progreso,error,created_at").eq("company_id", id).in("estado", ["pendiente", "corriendo", "fallido"]).order("created_at", { ascending: false }).limit(30),
    fuentesEnLectura(sb, id),
  ]);
  const fuentes = (fuentesRaw ?? []) as unknown as Fuente[];
  const fallidos = (jobs ?? []).filter((j) => j.estado === "fallido");
  const activos = (jobs ?? []).filter((j) => j.estado !== "fallido");
  /** null = no se pudo comprobar: no es lo mismo que «ninguna se está leyendo». */
  const enLectura = vivas.ids;

  // Lo extraído de documentos y datos espera la revisión del consultor (R10.2). Se trae solo para las
  // fuentes pendientes: afirmaciones con su fragmento citado y números con origen «extraido».
  const pendientes = fuentes.filter((f) => f.revision === "pendiente");
  // «Por revisar» es solo lo que TERMINÓ de leerse. Una fuente pendiente con la lectura en marcha o cortada se
  // muestra con su panel, pero dice que se está leyendo (o que se cortó) y no ofrece consolidar. Y si no se pudo
  // comprobar, tampoco se cuenta como lista: se dice que no se sabe.
  const listasParaRevisar = pendientes.filter((f) => lecturaDe(f, enLectura) === "terminada").length;
  const sinComprobar = pendientes.filter((f) => lecturaDe(f, enLectura) === "sin_comprobar").length;
  const sinTerminar = pendientes.length - listasParaRevisar - sinComprobar;
  const idsPendientes = pendientes.map((f) => f.id);
  const [{ data: claimsPend }, { data: metricasPend }] = idsPendientes.length
    ? await Promise.all([
        sb.from("claims").select("id,source_id,texto,tipo,pilar,estado,fragmento:source_fragments(texto,pagina,seccion,celda)").in("source_id", idsPendientes).order("created_at", { ascending: true }),
        sb.from("company_metricas").select("id,source_id,clave,periodo,valor,valor_texto,nota").in("source_id", idsPendientes).eq("origen", "extraido").order("clave", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];
  type ClaimFila = Omit<ClaimPorRevisar, "fragmento"> & { source_id: string; fragmento: FragmentoCitado | FragmentoCitado[] | null };
  const claimsPorFuente = new Map<string, ClaimPorRevisar[]>();
  for (const c of (claimsPend ?? []) as unknown as ClaimFila[]) {
    const fragmento = Array.isArray(c.fragmento) ? (c.fragmento[0] ?? null) : c.fragmento;
    claimsPorFuente.set(c.source_id, [...(claimsPorFuente.get(c.source_id) ?? []), { id: c.id, texto: c.texto, tipo: c.tipo, pilar: c.pilar, estado: c.estado, fragmento }]);
  }
  const metricasPorFuente = new Map<string, MetricaPorRevisar[]>();
  for (const m of (metricasPend ?? []) as unknown as (MetricaPorRevisar & { source_id: string })[]) {
    metricasPorFuente.set(m.source_id, [...(metricasPorFuente.get(m.source_id) ?? []), { id: m.id, clave: m.clave, periodo: m.periodo, valor: m.valor, valor_texto: m.valor_texto, nota: m.nota }]);
  }

  return (
    <>
      <Encabezado titulo="Fuentes" sub="Documentos, fotos, notas de voz y datos. Lo que subes aquí queda con origen: consultor." />

      {(vivas.error || eJobs) && (
        <section className="panel p-5 mb-8" role="alert" style={{ borderColor: "var(--caducado)" }}>
          <h2 className="t-seccion" style={{ color: "var(--caducado)" }}>No pudimos comprobar los trabajos de lectura</h2>
          {vivas.error && (
            <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
              No se pudo saber qué fuentes se están leyendo ahora mismo. Una fuente que figura «leyendo» puede seguir leyéndose o haberse cortado: no la vuelvas a leer solo por eso. Lo que espera revisión se puede revisar; al consolidar se comprueba otra vez y, si la lectura sigue en curso, no se cerrará. Recarga la página para volver a intentarlo.
            </p>
          )}
          {eJobs && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Tampoco se pudo leer la lista de trabajos en curso y fallidos: que abajo no aparezca ninguno no quiere decir que no los haya.</p>}
          <p className="t-etiqueta mt-2" style={{ textTransform: "none", letterSpacing: 0 }}>Motivo que dio la base: {vivas.error ?? eJobs?.message}</p>
        </section>
      )}

      {fallidos.length > 0 && (
        <section className="panel p-5 mb-8" style={{ borderColor: "var(--contradicho)" }}>
          <h2 className="t-seccion" style={{ color: "var(--contradicho)" }}>{fallidos.length} trabajo(s) fallido(s)</h2>
          <p className="t-dato mt-1 mb-4" style={{ color: "var(--grafito)" }}>Nunca desaparecen en silencio.</p>
          <table className="tabla">
            <tbody>
              {fallidos.map((j) => (
                <tr key={j.id}>
                  <td className="t-dato">{j.tipo}</td>
                  <td>{j.error}</td>
                  <td><ReintentarJob jobId={j.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activos.length > 0 && (
        <section className="mb-8">
          <h2 className="t-etiqueta mb-2">En curso</h2>
          <ul className="flex flex-col gap-1">
            {activos.map((j) => (
              <li key={j.id} className="t-dato" style={{ color: "var(--grafito)" }}>
                {j.tipo} · {j.progreso ?? j.estado}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendientes.length > 0 && (
        <section className="mb-8">
          <h2 className="t-seccion mb-1">Por revisar ({listasParaRevisar})</h2>
          <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>
            Leímos estos archivos. Lo que encontramos ya se ve en la empresa rotulado como «extraído, pendiente de conciliar»; aquí decides qué pasa a conciliado y qué se descarta.
            {sinTerminar > 0 && ` ${sinTerminar} fuente(s) más no ${sinTerminar === 1 ? "ha" : "han"} terminado de leerse: se revisa${sinTerminar === 1 ? "" : "n"} cuando la lectura termine.`}
            {sinComprobar > 0 && ` De ${sinComprobar} fuente(s) más no se pudo comprobar si todavía se ${sinComprobar === 1 ? "está" : "están"} leyendo: no se ${sinComprobar === 1 ? "cuenta" : "cuentan"} arriba.`}
          </p>
          {pendientes.map((f) => {
            const lectura = lecturaDe(f, enLectura);
            return (
              <RevisarExtraccion
                key={f.id}
                sourceId={f.id}
                nombre={f.nombre}
                fidelidad={f.fidelidad_extraccion}
                fidelidadNota={f.fidelidad_nota}
                claims={claimsPorFuente.get(f.id) ?? []}
                metricas={metricasPorFuente.get(f.id) ?? []}
                leyendo={lectura !== "terminada" && lectura !== "sin_comprobar"}
                lecturaCortada={lectura === "cortada"}
                lecturaSinComprobar={lectura === "sin_comprobar"}
              />
            );
          })}
        </section>
      )}

      <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="t-seccion mb-4">Subir</h2>
          <Subir companyId={id} transcriptor={hayTranscriptor()} />
        </div>
        <div>
          <h2 className="t-seccion mb-1">Cargadas</h2>
          {/* Lo que hace «Volver a leer», dicho antes de pulsarlo: la ruta lo responde con sus cuentas, pero el botón todavía no las muestra. */}
          <p className="t-dato mb-4" style={{ color: "var(--grafito)" }}>
            «Volver a leer» archiva lo que se leyó antes (afirmaciones y números) y saca la fuente de revisión hasta que termine la nueva lectura. Los números que ya conciliaste no se tocan: siguen como los dejaste.
          </p>
          {!fuentes.length ? (
            <Vacio texto={VACIO.fuentesConsultor} />
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Lectura</th>
                  <th>Definiciones</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fuentes.map((f) => {
                  const fid = rotuloFidelidad(f.fidelidad_extraccion);
                  const lectura = lecturaDe(f, enLectura);
                  const enParte = resumenLecturaEnParte(f.fidelidad_nota);
                  return (
                    <tr key={f.id}>
                      <td className="t-dato">
                        {f.nombre}
                        <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{f.origen}</div>
                      </td>
                      <td>{f.tipo}</td>
                      <td className="t-dato">{f.fecha_origen ? fechaCorta(f.fecha_origen) : <span style={{ color: "var(--caducado)" }}>sin fecha</span>}</td>
                      <td>
                        {f.estado === "error" ? (
                          <span style={{ color: "var(--contradicho)" }}>{f.error ?? "error"}</span>
                        ) : lectura === "en_curso" ? (
                          "leyendo"
                        ) : lectura === "cortada" ? (
                          <span style={{ color: "var(--contradicho)" }}>la lectura se cortó: vuelve a leerla</span>
                        ) : lectura === "sin_comprobar" ? (
                          <span style={{ color: "var(--caducado)" }}>{f.estado === "leyendo" ? "no se pudo comprobar si se está leyendo" : `${f.estado}; no se pudo comprobar si se está leyendo otra vez`}</span>
                        ) : (
                          f.estado
                        )}
                        {/* «Por revisar» solo cuando la lectura terminó: mientras se lee, lo que hay que revisar todavía no existe. */}
                        {f.revision === "pendiente" && lectura === "terminada" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0, color: "var(--marca)" }}>por revisar</div>}
                        {f.revision === "pendiente" && lectura === "sin_comprobar" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>espera revisión; al consolidar se comprueba si terminó de leerse</div>}
                        {f.revision === "pendiente" && lectura !== "terminada" && lectura !== "sin_comprobar" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>se revisa cuando termine de leerse</div>}
                        {f.revision === "consolidada" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>revisada</div>}
                      </td>
                      <td className="t-dato">
                        {fid ? <span style={{ color: fid.color }} title={f.fidelidad_nota ?? undefined}>{fid.texto}</span> : <span style={{ color: "var(--grafito)" }}>—</span>}
                        {/* Mientras se vuelve a leer no se pide «vuelve a leerla»: esa nota es de la lectura anterior y la nueva la reescribe al terminar. */}
                        {enParte && lectura !== "en_curso" && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0, maxWidth: 320, color: "var(--contradicho)" }}>{enParte}. Lo que traía esa parte no está en la lectura: vuelve a leerla.</div>}
                        {f.fidelidad_extraccion === "no_analizado" && f.fidelidad_nota && <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0, maxWidth: 320 }}>{f.fidelidad_nota}</div>}
                      </td>
                      <td className="t-dato">{f.claims?.[0]?.count ?? 0}</td>
                      <td><AccionesFuente sourceId={f.id} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

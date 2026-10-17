import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brechaMercado } from "@/lib/mercado";
import { cargarPlan } from "@/lib/plan-intervencion";
import { PlanCliente } from "@/components/cliente/PlanCliente";
import { CortesPlan, type Corte } from "@/components/plan/CortesPlan";
import { CaminoElegido } from "@/components/cliente/CaminoElegido";
import { puedeLlenar } from "@/components/negocio/datos";
import { configDeEmpresa } from "@/lib/producto";
import { SECCION } from "@/lib/secciones";
import { caminoAprobadoParaDueno, preguntasPendientes, type LecturaCamino, type PreguntasPendientes } from "@/lib/estrategia/portal";
import { PARA_DUENO, PORTAL } from "@/lib/estrategia/textos";
import type { ConfigEmpresa } from "@/lib/formato";

export const dynamic = "force-dynamic";

// «S/ 1,200», con espacio, como en el resto del portal (revisión del 16-10-2026: aquí era «S/1,200»).
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

/** Lo que falta trabajar y lo que costaría con consultoría tradicional — el valor del acompañamiento, en números. */
function BrechaAfuera({ personas, assets }: { personas: number | null; assets: { clave: string; estado: string | null }[] }) {
  const b = brechaMercado(personas, assets);
  if (!b.items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="t-seccion mb-1">Lo que le falta trabajar a tu empresa</h2>
      <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>
        Y lo que costaría hacerlo afuera, pieza por pieza, con una consultora tradicional.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {b.items.map((i) => (
          <div key={i.clave} className="panel p-4 flex items-start justify-between gap-3">
            <div style={{ minWidth: 0 }}>
              <p className="t-dato" style={{ fontWeight: 600 }}>{i.nombre}</p>
              <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 13 }}>{i.medio ? "a medio camino — ya empezaste" : "aún sin trabajar"}</p>
            </div>
            <div style={{ flex: "none", textAlign: "right" }}>
              <p className="t-dato" style={{ fontWeight: 700 }}>{soles(i.soles[0])}–{soles(i.soles[1])}</p>
              <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 12 }}>{i.semanas[0] === i.semanas[1] ? `${i.semanas[0]} sem` : `${i.semanas[0]}–${i.semanas[1]} sem`}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="panel p-5 mt-4" style={{ background: "var(--marca)", border: "none" }}>
        <p className="t-etiqueta mb-1" style={{ color: "color-mix(in srgb, var(--papel) 70%, transparent)" }}>Todo junto, afuera</p>
        <p className="num-grande" style={{ color: "var(--papel)", fontSize: 28 }}>{soles(b.totalSoles[0])} – {soles(b.totalSoles[1])}</p>
        <p className="t-dato" style={{ color: "color-mix(in srgb, var(--papel) 80%, transparent)" }}>
          y entre {b.totalSemanas[0]} y {b.totalSemanas[1]} semanas haciéndolo por partes. Aquí este trabajo está dentro de tu acompañamiento: se construye contigo, pieza por pieza, en <Link href="/portal/activos" style={{ color: "var(--papel)", textDecoration: "underline" }}>Tu información</Link>.
        </p>
      </div>
      <p className="t-dato mt-2" style={{ color: "var(--grafito)", fontSize: 12.5 }}>Rangos referenciales del mercado peruano de consultoría para pymes; el precio real varía por sector y alcance.</p>
    </section>
  );
}

/** Lo que el dueño ve: solo lo aprobado y lo que sigue de ahí. Lo propuesto, rechazado o pospuesto es conversación de la consultora. */
const VISIBLES = ["aprobado", "en_ejecucion", "reportado", "verificado", "bloqueado"];

/**
 * EL CAMINO QUE ELEGIMOS (spec-estrategia-8x.md §8.2): la estrategia que aprobó la consultora, arriba de todo. Solo para
 * quien dirige la empresa (dueño o líder) y para la consultora que mira «como el empresario»: dice lo que el negocio
 * dejaría de más al mes, y una persona del equipo no tiene por qué leerlo. A ella ni se le pide a la base.
 */
type DelCamino = { lectura: LecturaCamino; pendientes: PreguntasPendientes | null; config: ConfigEmpresa };
async function delCamino(companyId: string, u: Parameters<typeof puedeLlenar>[0]): Promise<DelCamino | null> {
  const quien = await puedeLlenar(u, companyId);
  if (!quien.puede) return null;
  const [lectura, pendientes, config] = await Promise.all([caminoAprobadoParaDueno(companyId), preguntasPendientes(companyId), configDeEmpresa(companyId)]);
  return { lectura, pendientes, config };
}

/** Lo que no se pudo mostrar del camino, dicho en una línea arriba de la página de siempre (nunca en silencio). */
function AvisoCamino({ lectura }: { lectura: LecturaCamino }) {
  if (lectura.estado !== "no_se_pudo" && lectura.estado !== "anterior") return null;
  return (
    <p className="t-dato medida mb-6" role="status" style={{ color: "var(--grafito)" }}>
      {lectura.estado === "anterior" ? PARA_DUENO.plan_anterior : PORTAL.no_se_pudo_camino}
    </p>
  );
}

/**
 * TU PLAN: las acciones aprobadas, con quién, para cuándo y qué se espera. «Ya lo hice» pide una prueba y la
 * deja en «Enviado para revisar»; la consultora la comprueba. Visible desde que la consultora aprueba la
 * primera acción: aprobar es lo que la hace pública para la empresa.
 */
export default async function PlanClientePag() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo">{c.queFalta}</p>;
  const sb = supabaseAdmin();
  const [plan, { data: empresa }, { data: assets }, { data: cortes }, camino] = await Promise.all([
    cargarPlan(c.companyId),
    sb.from("companies").select("ficha").eq("id", c.companyId).single(),
    sb.from("company_assets").select("clave,estado").eq("company_id", c.companyId),
    sb.from("checkpoints").select("*").eq("company_id", c.companyId).order("numero"),
    delCamino(c.companyId, c.u),
  ]);
  const personas = Number((empresa?.ficha as { personas?: string } | null)?.personas) || null;
  const visibles = plan.acciones.filter((a) => VISIBLES.includes(a.estado_canonico));
  const enMarcha = visibles.filter((a) => a.estado_canonico === "aprobado" || a.estado_canonico === "en_ejecucion" || a.estado_canonico === "bloqueado").length;
  const tituloAcciones = enMarcha ? `${enMarcha} ${enMarcha === 1 ? "acción en marcha" : "acciones en marcha"}` : "Todo lo acordado está enviado o comprobado";

  // CON UN CAMINO APROBADO: el camino arriba de todo (es el título de la página) y, debajo, el plan de cada semana.
  if (camino?.lectura.estado === "aprobado") {
    const aprobado = camino.lectura.camino;
    const p = camino.pendientes;
    // Solo se ofrece «Responder» donde de verdad se puede responder: con el pedido abierto (CaminoElegido lo mira).
    const preguntas = p ? { sin_responder: p.sin_responder, abierta: p.abierta, href: SECCION.preguntas_estrategia.href } : null;
    return (
      <>
        <CaminoElegido p={aprobado.para_dueno} desde={aprobado.aprobada_at} zona={camino.config.zona_horaria} preguntas={preguntas} />
        <section className="plan-semanas" aria-labelledby="t-semanas">
          {visibles.length ? (
            <>
              <h2 id="t-semanas" className="t-seccion mb-2">{tituloAcciones}</h2>
              <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>
                Cada acción dice quién la hace, para cuándo y qué se espera. Cuando la termines, pulsa «Ya lo hice» y sube una foto o una nota: la consultora la comprueba.
              </p>
              <PlanCliente companyId={c.companyId} acciones={visibles} />
              <CortesPlan companyId={c.companyId} cortes={(cortes ?? []) as Corte[]} puedeRegistrar={false} />
              <BrechaAfuera personas={personas} assets={assets ?? []} />
            </>
          ) : (
            <>
              <h2 id="t-semanas" className="t-seccion mb-2">{PORTAL.acciones_sin_empezar}</h2>
              <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>{PORTAL.sin_acciones}</p>
            </>
          )}
        </section>
      </>
    );
  }

  // SIN CAMINO APROBADO: la página de siempre (no aparece ningún hueco). Si el camino no se pudo leer, se dice arriba.
  const aviso = camino ? <AvisoCamino lectura={camino.lectura} /> : null;

  // SIN ACCIONES TODAVÍA: lo que viene y dónde está lo que encontramos. Sin la lista de precios de afuera (revisión del
  // 16-10-2026: un plan vacío con «Todo junto, afuera S/ 15,000 – S/ 42,500» se leía como una cotización).
  if (!visibles.length)
    return (
      <>
        {aviso}
        <p className="t-etiqueta">Tu plan</p>
        <h1 className="t-titulo mt-2 mb-6">Tu plan se está armando</h1>
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          Lo que encontramos en tu empresa ya está en <strong>Tu diagnóstico</strong>. Cuando lo convirtamos juntos en
          acciones con fechas y responsables, aparecen aquí para que marques lo que vas cerrando.
        </p>
        <Link href="/portal/diagnostico" className="boton">Ver tu diagnóstico</Link>
      </>
    );

  return (
    <>
      {aviso}
      <p className="t-etiqueta">Tu plan</p>
      <h1 className="t-titulo mt-2 mb-2">{tituloAcciones}</h1>
      <p className="t-cuerpo mb-8 medida" style={{ color: "var(--grafito)" }}>
        Cada acción dice quién la hace, para cuándo y qué se espera. Cuando la termines, pulsa «Ya lo hice» y sube una foto o una nota: la consultora la comprueba.
      </p>
      <PlanCliente companyId={c.companyId} acciones={visibles} />
      <CortesPlan companyId={c.companyId} cortes={(cortes ?? []) as Corte[]} puedeRegistrar={false} />
      <BrechaAfuera personas={personas} assets={assets ?? []} />
    </>
  );
}

import { contextoOS } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn, textoDiaRelativo } from "@/lib/os/calculos";
import { textoHora, textoTamano, MAX_MB_ENTREGABLE } from "@/lib/os/dia";
import { diaEnZona } from "@/lib/revision-semanal";
import { SubirEntregable, BorrarEntregable } from "@/components/os/dia/Entregables";
import { Vacio } from "@/components/base/Vacio";

export const dynamic = "force-dynamic";

/**
 * MIS ENTREGABLES: lo que cada persona entrega en archivo (una cotización, un informe, una foto del trabajo hecho).
 * Van al bucket privado os-d-entregables; se descargan con un enlace firmado de un minuto. Cada uno ve y borra los suyos.
 */
export default async function EntregablesPag() {
  const c = await contextoOS();
  if (!c.persona) return <>
      <h1 className="t-titulo mb-4">Mis entregables</h1>
      <Vacio texto="Los entregables son de cada persona del equipo." accion="Ver Equipo en vivo" href="/os/equipo" />
    </>;
  const sb = supabaseAdmin();
  const hoy = hoyEn(c.zona);
  const [{ data: entregables }, { data: tareas }] = await Promise.all([
    sb.from("os_entregables").select("id,titulo,tarea_id,mime,tamano,created_at").eq("company_id", c.companyId).eq("persona_id", c.persona.id).order("created_at", { ascending: false }),
    sb.from("os_tareas").select("id,titulo,estado").eq("company_id", c.companyId).eq("persona_id", c.persona.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const nombreTarea = new Map((tareas ?? []).map((t) => [t.id as string, t.titulo as string]));

  return (
    <>
      <header className="os-d-cabeza">
        <div className="os-d-cabeza__texto">
          <span className="t-rotulo">Mi día</span>
          <h1 className="t-titulo" style={{ margin: 0 }}>Mis entregables</h1>
          <p className="t-cuerpo os-d-tenue" style={{ margin: 0 }}>Lo que entregas queda guardado aquí, con su tarea. Tu jefe también lo puede abrir.</p>
        </div>
      </header>
      <div className="os-d-rejilla">
        <section className="os-d-rejilla__principal" aria-labelledby="titulo-lista">
          <h2 id="titulo-lista" className="t-seccion" style={{ margin: 0 }}>
            {entregables?.length ? `Tus entregables · ${entregables.length}` : "Tus entregables"}
          </h2>
          {entregables?.length ? (
            <div>
              {entregables.map((e) => (
                <div key={e.id} className="os-d-entregable">
                  <div className="os-d-entregable__texto">
                    <span style={{ fontWeight: 700 }}>{e.titulo}</span>
                    <span className="t-dato os-d-tenue">
                      {[e.tarea_id ? nombreTarea.get(e.tarea_id) : null, textoTamano(e.tamano), `${textoDiaRelativo(diaEnZona(e.created_at, c.zona), hoy)} · ${textoHora(e.created_at, c.zona)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <a className="boton boton--secundario boton--chico" href={`/api/os/entregables/${e.id}`}>Descargar</a>
                  <BorrarEntregable id={e.id} titulo={e.titulo} />
                </div>
              ))}
            </div>
          ) : (
            <p className="t-cuerpo os-d-tenue" style={{ margin: 0 }}>Todavía no entregaste nada. Sube tu primer archivo aquí al lado.</p>
          )}
        </section>
        <aside className="os-d-rejilla__lado">
          <SubirEntregable tareas={(tareas ?? []).map((t) => ({ id: t.id as string, titulo: t.titulo as string }))} maxMb={MAX_MB_ENTREGABLE} />
        </aside>
      </div>
    </>
  );
}

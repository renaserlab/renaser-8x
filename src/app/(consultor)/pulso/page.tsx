import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Franja, Lectura } from "@/components/base/Franja";
import { cargarPulso, enlaceAEmpresa, NOMBRE_ESTADO_PULSO, type FilaPulso, type Pulso } from "@/lib/os/pulso";

export const dynamic = "force-dynamic";

/**
 * PULSO DE EMPRESAS — RENASER OS MULTIEMPRESA (prototipo aprobado el 19-10-2026). La consultora ve, una fila por
 * empresa, cómo trabaja hoy cada equipo; la que pide atención va primero. Al elegir una fila (?empresa=…, sin
 * JavaScript: el enlace se puede compartir) aparece «Requiere tu atención» con los puntos concretos y el botón para
 * entrar a su equipo como lo ve la empresa. Las reglas del estado viven en src/lib/os/pulso.ts.
 */
export default async function PulsoDeEmpresas({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const sp = await searchParams;
  let pulso: Pulso;
  try {
    pulso = await cargarPulso(supabaseAdmin());
  } catch (e) {
    return (
      <>
        <Encabezado titulo="Pulso de empresas" />
        <section className="aviso aviso--pide" role="alert">
          <h2 className="mb-2">No se pudo leer el pulso</h2>
          <p className="t-dato">{e instanceof Error ? e.message : String(e)}. No se muestra nada antes que mostrar ceros que no son.</p>
        </section>
      </>
    );
  }
  const { filas, resumen: r } = pulso;
  const elegida = filas.find((f) => f.id === sp.empresa) ?? filas[0] ?? null;

  return (
    <>
      <Encabezado
        titulo="Pulso de empresas"
        sub={`Equipos en marcha en ${r.conOS} de ${r.empresas} ${r.empresas === 1 ? "empresa" : "empresas"} · cómo están trabajando hoy sus equipos`}
        acciones={
          <Link href="/pulso/avisos" className="boton boton--secundario">
            Avisos de clientes
          </Link>
        }
      />

      <Franja columnas={4}>
        <Lectura divisor={false} valor={`${r.conOS} de ${r.empresas}`} etiqueta="empresas con su equipo en 8X" />
        <Lectura valor={`${r.abrieron} de ${r.conCuenta}`} etiqueta="personas abrieron el día" color={r.conCuenta && r.abrieron < r.conCuenta ? "var(--caducado)" : undefined} />
        <Lectura valor={String(r.bloqueos)} etiqueta="bloqueos abiertos" color={r.bloqueos ? "var(--contradicho)" : "var(--grafito)"} />
        <Lectura valor={String(r.avisosSinLeer)} etiqueta="avisos de gestión sin leer" color={r.avisosSinLeer ? "var(--marca)" : "var(--grafito)"} />
      </Franja>

      {filas.length === 0 ? (
        <div className="mt-10">
          <Vacio texto="Todavía no hay empresas en la cartera." accion="Crear la primera" href="/empresas/nueva" />
        </div>
      ) : (
        <div className="os-pulso mt-10">
          <section className="os-pulso__tabla" aria-labelledby="pulso-empresas">
            <h2 id="pulso-empresas" className="t-seccion mb-3">Empresas</h2>
            <div className="envoltura-tabla">
              <table className="os-pulso__filas">
                <caption className="sr-only">Empresas y cómo trabaja hoy su equipo. Elige una para ver qué requiere tu atención.</caption>
                <thead>
                  <tr>
                    <th scope="col">Empresa</th>
                    <th scope="col">Abrieron hoy</th>
                    <th scope="col">Cumplimiento 7 días</th>
                    <th scope="col">Bloqueos</th>
                    <th scope="col">Cierre semanal</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <FilaEmpresa key={f.id} f={f} elegida={f.id === elegida?.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {elegida && <Atencion f={elegida} />}
        </div>
      )}
    </>
  );
}

function FilaEmpresa({ f, elegida }: { f: FilaPulso; elegida: boolean }) {
  const sinOS = f.estado === "sin_os";
  const pct = f.cumplimiento.pct;
  return (
    <tr data-elegida={elegida ? "" : undefined}>
      <th scope="row" className="os-pulso__empresa">
        {/* El enlace se estira sobre toda la fila (CSS): se elige tocando cualquier parte de ella. */}
        <Link href={`/pulso?empresa=${f.id}`} scroll={false} className="os-pulso__ir t-cuerpo fuerte" aria-current={elegida ? "true" : undefined}>
          {f.nombre}
        </Link>
        <span className="t-dato os-tenue">
          {sinOS ? "Sin equipo cargado" : `${f.personas} ${f.personas === 1 ? "persona" : "personas"}${f.sinCuenta ? ` · ${f.sinCuenta} sin cuenta` : ""}`}
        </span>
      </th>
      <td className="t-dato os-num" title={!sinOS && !f.conCuenta ? "Nadie del equipo entró todavía con su correo" : undefined}>
        {sinOS || !f.conCuenta ? "—" : `${f.abrieron} de ${f.conCuenta}`}
      </td>
      <td className="t-dato os-num fuerte" data-tono={sinOS || pct == null ? undefined : pct < 60 ? "rojo" : pct < 80 ? "ambar" : "verde"}>
        {sinOS || pct == null ? "—" : `${pct}%`}
      </td>
      <td className="t-dato os-num" data-tono={!sinOS && f.bloqueos ? "rojo" : undefined}>{sinOS ? "—" : f.bloqueos}</td>
      <td className="t-dato os-num" title={f.cierres == null && !sinOS ? "El cierre semanal se pide el viernes" : undefined}>
        {sinOS ? "—" : f.cierres == null ? "desde el vie" : `${f.cierres} de ${f.conCuenta}`}
      </td>
      <td>
        <span className="os-estado" data-estado={f.estado}>{NOMBRE_ESTADO_PULSO[f.estado]}</span>
      </td>
    </tr>
  );
}

function Atencion({ f }: { f: FilaPulso }) {
  const sinOS = f.estado === "sin_os";
  return (
    <aside className="os-pulso__atencion" aria-labelledby="pulso-atencion">
      <p className="t-etiqueta">Requiere tu atención</p>
      <h2 id="pulso-atencion" className="os-pulso__nombre">{f.nombre}</h2>
      <span className="os-estado" data-estado={f.estado}>{NOMBRE_ESTADO_PULSO[f.estado]}</span>
      <ul className="os-pulso__puntos">
        {f.puntos.map((p) => (
          <li key={p.texto} data-tono={p.tono}>{p.texto}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {sinOS ? (
          <a className="boton" href={enlaceAEmpresa(f.id, "/os/talento")}>Cargar su equipo</a>
        ) : (
          <>
            <a className="boton" href={enlaceAEmpresa(f.id, "/os/equipo")}>Ver su equipo en vivo</a>
            <a className="boton boton--secundario" href={enlaceAEmpresa(f.id, "/os/avisos")}>Sus avisos</a>
          </>
        )}
      </div>
      <p className="t-dato os-tenue">Entras como «ver como el empresario»: miras, no trabajas por su equipo.</p>
    </aside>
  );
}

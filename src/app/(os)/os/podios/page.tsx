import Link from "next/link";
import { contextoOS } from "@/lib/os/acceso";
import { hoyEn, iniciales, lunesDe, sumarDias, textoDuracion } from "@/lib/os/calculos";
import { aperturasEntre, personasDeLaEmpresa, registrosDesde, tareasDe } from "@/lib/os/datos";
import { armarPodio, fechaLarga } from "@/lib/os/dia";

export const dynamic = "force-dynamic";

/**
 * PODIOS: quién cumplió mejor la semana. Se ordena por cumplimiento (tareas terminadas a tiempo sobre las que vencían),
 * después por tareas completadas y por horas de foco. Al lado, los días que abrió antes de las 9:00. Sin nada que
 * medir, se dice; no se arma un podio de ceros. Lo ve todo el equipo: es reconocimiento, no vigilancia.
 */
export default async function PodiosPag({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const c = await contextoOS();
  const sp = await searchParams;
  const hoy = hoyEn(c.zona);
  const pasada = sp.semana === "pasada";
  const lunes = pasada ? sumarDias(lunesDe(hoy), -7) : lunesDe(hoy);
  const domingo = sumarDias(lunes, 6);
  const personas = await personasDeLaEmpresa(c.companyId);
  const ids = personas.map((p) => p.id);
  const [tareas, registros, aperturas] = await Promise.all([
    tareasDe(c.companyId, ids),
    registrosDesde(c.companyId, new Date(Date.parse(`${sumarDias(lunes, -1)}T00:00:00Z`)).toISOString(), ids),
    aperturasEntre(c.companyId, lunes, domingo),
  ]);
  const { filas, podio } = armarPodio({ personas, tareas, registros, aperturas, lunes, hoy, zona: c.zona });
  const orden = [podio[1], podio[0], podio[2]]; // el primero al centro

  return (
    <>
      <header className="os-d-cabeza">
        <div className="os-d-cabeza__texto">
          <span className="t-rotulo">Mi día · semana del {fechaLarga(lunes).toLowerCase()}</span>
          <h1 className="t-titulo" style={{ margin: 0 }}>Podios</h1>
          <p className="t-cuerpo os-d-tenue" style={{ margin: 0 }}>Quién cumplió mejor {pasada ? "la semana pasada" : "esta semana"}: tareas a tiempo, tareas completadas y horas de foco.</p>
        </div>
        <nav className="os-d-filtros" aria-label="Qué semana">
          <Link href="/os/podios" className={`boton boton--chico${pasada ? " boton--secundario" : ""}`} aria-current={!pasada ? "page" : undefined}>Esta semana</Link>
          <Link href="/os/podios?semana=pasada" className={`boton boton--chico${pasada ? "" : " boton--secundario"}`} aria-current={pasada ? "page" : undefined}>La semana pasada</Link>
        </nav>
      </header>

      {podio.length ? (
        <section aria-label="Podio" className="os-d-podio" style={{ maxWidth: 640, margin: "0 auto 32px" }}>
          {orden.map((f, i) =>
            f ? (
              <div key={f.persona_id} className="os-d-podio__puesto" data-lugar={podio.indexOf(f) + 1}>
                <span className="os-d-avatar">{iniciales(f.nombre)}</span>
                <span className="os-d-podio__nombre">{f.nombre}</span>
                <span className="t-dato os-d-tenue">{f.pct != null ? `${f.pct}% a tiempo` : `${f.completadas} ${f.completadas === 1 ? "completada" : "completadas"}`}</span>
                <div className="os-d-podio__escalon" aria-label={`Puesto ${podio.indexOf(f) + 1}`}>{podio.indexOf(f) + 1}</div>
              </div>
            ) : (
              <div key={`vacio-${i}`} aria-hidden="true" />
            )
          )}
        </section>
      ) : (
        <p className="aviso" style={{ marginBottom: 24 }}>
          {pasada ? "La semana pasada" : "Esta semana"} todavía nadie completó tareas ni registró tiempo de foco. El podio se arma solo cuando hay trabajo que contar.
        </p>
      )}

      <div className="envoltura-tabla" style={{ overflowX: "auto" }}>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Puesto</th>
              <th scope="col">Persona</th>
              <th scope="col">A tiempo</th>
              <th scope="col">Completadas</th>
              <th scope="col">Horas de foco</th>
              <th scope="col">Abrió antes de las 9</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.persona_id}>
                <td>{podio.includes(f) ? i + 1 : "—"}</td>
                <td>
                  <span style={{ fontWeight: 700 }}>{f.nombre}</span>
                  {f.puesto && <span className="os-d-tenue"> · {f.puesto}</span>}
                </td>
                <td>{f.pct != null ? `${f.pct}% (${f.a_tiempo})` : "Sin tareas que vencieran"}</td>
                <td>{f.completadas}</td>
                <td>{textoDuracion(f.minutos)}</td>
                <td>{f.abrio_a_tiempo} {f.abrio_a_tiempo === 1 ? "día" : "días"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

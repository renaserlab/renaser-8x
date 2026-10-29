import Link from "next/link";
import { Encabezado } from "@/components/base/Vacio";
import { usuarioActual } from "@/lib/auth";
import { esAdministradorDe8X } from "@/lib/autoridad";
import { modificacionesDeLaCasa, enUnaFrase, porDia, type Modificacion } from "@/lib/actividad";

export const dynamic = "force-dynamic";

/**
 * QUIÉN CAMBIÓ QUÉ, EN TODA LA CASA.
 *
 * Kelin, 18-10-2026: «ambos debemos ver los datos de los clientes por entornos separados, y si alguna
 * modificación, pues yo también verlo». Cada consultora trabaja su cartera; esta pantalla es la otra
 * mitad: quien administra 8X se entera de un cambio sin tener que saber de antemano en qué empresa
 * buscarlo.
 *
 * Solo entra lo que CAMBIA algo. Mirar no es modificar, y meter cada vista convertiría esto en ruido.
 * Los accesos denegados sí entran: de las dos noticias, es la que más importa.
 */
export default async function Actividad() {
  const perfil = await usuarioActual();

  // No es «no tienes permiso» a secas: se dice qué es esta pantalla y a quién le toca, porque quien
  // llega aquí sin autoridad normalmente es una consultora que no sabía que existía la distinción.
  if (!perfil || !esAdministradorDe8X(perfil)) {
    return (
      <>
        <Encabezado titulo="Modificaciones" sub="El registro de quién cambió qué en todas las empresas." />
        <section className="tarjeta a-lo-ancho">
          <p className="t-dato" style={{ margin: 0 }}>
            Esta pantalla es de quien administra 8X. Tú ves el rastro de cada empresa dentro de su propia vista, en{" "}
            <strong>Expediente</strong>. Si necesitas verlo todo, pídeselo a quien administra la casa.
          </p>
        </section>
      </>
    );
  }

  let modificaciones: Modificacion[] = [];
  let fallo: string | null = null;
  try {
    modificaciones = await modificacionesDeLaCasa({ limite: 120 });
  } catch (e) {
    fallo = (e as Error).message;
  }

  const empresas = new Set(modificaciones.filter((m) => m.empresa).map((m) => m.empresa));
  const personas = new Set(modificaciones.map((m) => m.quien));
  const denegados = modificaciones.filter((m) => m.accion === "denegado").length;

  const hora = (iso: string) =>
    new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <>
      <Encabezado
        titulo="Modificaciones"
        sub="Quién cambió qué, en todas las empresas. Solo lo que modifica algo: mirar no entra, y un acceso denegado sí."
      />

      {fallo ? (
        <section className="tarjeta a-lo-ancho" role="alert">
          <p className="t-dato" style={{ margin: 0, color: "var(--caducado)" }}>
            No se pudo leer el registro: {fallo}. No quiere decir que no haya habido modificaciones: quiere decir que no se
            pudieron leer.
          </p>
        </section>
      ) : !modificaciones.length ? (
        <section className="tarjeta a-lo-ancho">
          <p className="t-dato" style={{ margin: 0 }}>
            No hay modificaciones registradas todavía. Aquí van a aparecer los cambios que haga cualquier consultora en
            cualquier empresa, con su nombre y su hora.
          </p>
        </section>
      ) : (
        <>
          <section className="tarjeta a-lo-ancho" aria-label="Resumen">
            <p className="t-dato" style={{ margin: 0 }}>
              <strong>{modificaciones.length}</strong> modificaciones · <strong>{empresas.size}</strong>{" "}
              {empresas.size === 1 ? "empresa" : "empresas"} · <strong>{personas.size}</strong>{" "}
              {personas.size === 1 ? "persona" : "personas"}
              {denegados ? (
                <>
                  {" · "}
                  <span className="estado alto">
                    {denegados} {denegados === 1 ? "acceso denegado" : "accesos denegados"}
                  </span>
                </>
              ) : null}
            </p>
          </section>

          {porDia(modificaciones).map(({ dia, modificaciones: delDia }) => (
            <section key={dia} className="tarjeta a-lo-ancho" aria-label={`Modificaciones del ${dia}`}>
              <h2 className="t-seccion" style={{ marginTop: 0 }}>
                {dia}
                <span className="t-dato" style={{ color: "var(--grafito)", fontFamily: "var(--font-ui)", marginLeft: 10, fontWeight: 400 }}>
                  {delDia.length} {delDia.length === 1 ? "modificación" : "modificaciones"}
                </span>
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {delDia.map((m) => (
                  <li key={m.id} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span
                      className="t-dato"
                      style={{ color: "var(--grafito)", fontVariantNumeric: "tabular-nums", minWidth: 46 }}
                    >
                      {hora(m.cuando)}
                    </span>
                    <span className="t-dato" style={{ flex: "1 1 260px", minWidth: 0 }}>
                      {m.accion === "denegado" ? <span className="estado alto">denegado</span> : null} {enUnaFrase(m)}
                    </span>
                    {m.company_id ? (
                      <Link href={`/empresa/${m.company_id}`} className="enlace-azul" style={{ fontSize: 14 }}>
                        Ver la empresa
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="nota a-lo-ancho" style={{ padding: "0 4px", fontSize: 13.5 }}>
            Las últimas {modificaciones.length}. Lo que no quedó registrado se dice así —«no quedó dicho qué campos»— en
            vez de omitirse: un hueco que no se ve se lee como que no hay hueco.
          </p>
        </>
      )}
    </>
  );
}

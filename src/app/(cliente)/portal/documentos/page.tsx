import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Subir } from "@/components/Subir";
import { hayTranscriptor } from "@/lib/ai";
import { VACIO, fechaCorta } from "@/lib/textos";
import { fechaDia } from "@/lib/medicion";
import { documentosDe, porTipo } from "@/lib/documental";
import { ControlDocumental } from "@/components/cliente/ControlDocumental";
import { ESTADOS, loVeElCliente, type Estado } from "@/lib/expediente";

export const dynamic = "force-dynamic";

/*
POR QUÉ CAMBIÓ ESTA PANTALLA (queja de Kelin, 18-10-2026).
Textual: «los manuales deben de regir... debería de aparecer como documentación vigente, no lo veo en el
sistema». Y era verdad: esta pantalla leía `sources` con origen de cliente —la lista de archivos que ella
subió— y nunca tocaba `expediente_documental`. La dueña entraba a buscar sus manuales aprobados y encontraba
sus propios archivos subidos. El sistema no había perdido nada, pero la pantalla hacía creer que sí.

AHORA SE LEE DE ARRIBA ABAJO COMO SE PIENSA:
  1. Tu documentación vigente  — lo que MANDA hoy (expediente_documental, solo lo que el cliente puede ver).
  2. Lo que preparamos contigo — las versiones que produce RENASER y que ella aprueba (deliverables).
  3. Lo que nos entregaste     — su material recibido (sources). No se borra y no se esconde: deja de ser
                                 lo primero y deja de parecer su documentación oficial.
El bloque 2 ya existía y no se toca por fuera del encabezado: ahí vive la aprobación de versiones que salió
del hallazgo de auditoría del 29-08-2026.

APROBACIÓN NO ES VIGENCIA (src/lib/expediente.ts). Aquí solo se habla de vigencia: «rige desde». Quién
aprobó y cuándo es la decisión, y es otra cosa; no se mezclan en la misma frase.

LO QUE EL CLIENTE NO VE: la clave de la vara con la que medimos, el nombre del entregable del contrato, el
veredicto de la revisión y la nota de la consultora. No se pintan, y tampoco se le piden a la base: el
select trae solo las columnas que ella lee.
*/

/**
 * Los estados cuyo documento puede ver el cliente. Salen de ESTADOS con `loVeElCliente`, no de un
 * `estado = vigente` escrito a mano aquí: la regla vive en src/lib/expediente.ts y en un solo lugar.
 * Si mañana se decide que también ve otra cosa, se cambia la bandera allí y esta pantalla obedece sola.
 * Hoy la lista es exactamente ["vigente"].
 */
const ESTADOS_QUE_VE = (Object.keys(ESTADOS) as Estado[]).filter(loVeElCliente);

/**
 * La misma regla, aplicada a una fila ya leída. Es un cinturón sobre el filtro de la consulta: si algún día
 * la base guarda un estado que esta versión del código no conoce, la fila no se pinta, en vez de reventar la
 * pantalla o de colarse al navegador del cliente.
 */
const puedeVerlo = (estado: unknown): boolean =>
  typeof estado === "string" && estado in ESTADOS && loVeElCliente(estado as Estado);

/** Lo único que esta pantalla le pide al expediente. */
type DocVigente = { id: string; nombre: string; version: string | null; vigente_desde: string | null; estado: string };

type Fuente = { id: string; nombre: string; estado: string; created_at: string; claims?: { count: number }[] };

/** Cómo se llama, en su idioma, el estado de un archivo que ella nos entregó. */
const ESTADO_FUENTE: Record<string, string> = { subido: "Recibido", leyendo: "Leyendo", leido: "Leído", error: "No pudimos leerlo" };

export default async function Documentos() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sb = supabaseAdmin();

  const [expediente, entregado, preparados] = await Promise.all([
    // Ordenado por nombre: esta lista es un catálogo que ella busca («¿dónde está mi MOF?»), no una
    // bitácora de lo último que pasó. Desde cuándo rige va escrito en cada fila.
    sb
      .from("expediente_documental")
      .select("id,nombre,version,vigente_desde,estado")
      .eq("company_id", c.companyId)
      .in("estado", ESTADOS_QUE_VE)
      .order("nombre"),
    sb
      .from("sources")
      .select("id,nombre,tipo,estado,fecha_origen,created_at, claims(count)")
      .eq("company_id", c.companyId)
      .eq("origen", "cliente")
      .order("created_at", { ascending: false }),
    documentosDe(c.companyId),
  ]);

  // «Falló la consulta» y «no hay documentos» son dos cosas distintas, y confundirlas es exactamente lo que
  // hace que una dueña crea que le perdimos su manual. Por eso el error se guarda y se dice.
  const noSePudoLeerVigente = !!expediente.error;
  const noSePudoLeerEntregado = !!entregado.error;
  const rigen = ((expediente.data ?? []) as DocVigente[]).filter((d) => puedeVerlo(d.estado));
  const fuentes = (entregado.data ?? []) as Fuente[];
  // Agrupado por tipo: el vigente arriba y sus versiones anteriores debajo (src/lib/documental.ts).
  const grupos = porTipo(preparados);

  return (
    <>
      <p className="t-etiqueta">Tu documentación</p>
      <h1 className="t-titulo mt-2 mb-2">Lo que rige en tu empresa</h1>
      <p className="t-cuerpo medida mb-8" style={{ color: "var(--grafito)" }}>
        Arriba, los documentos que hoy mandan en tu forma de trabajar. Más abajo, lo que estamos preparando
        contigo y todo el material que nos entregaste.
      </p>

      <section aria-labelledby="vigente-titulo">
        <h2 id="vigente-titulo" className="t-seccion mb-1">Tu documentación vigente</h2>
        <p className="t-dato medida mb-3" style={{ color: "var(--grafito)" }}>
          Lo que está en esta lista es lo que manda hoy. Cada documento dice desde cuándo rige y qué versión es.
        </p>

        {noSePudoLeerVigente ? (
          <p className="aviso aviso--error medida" role="alert">
            No pudimos leer tu documentación vigente en este momento. Esto no significa que no haya ninguna:
            significa que la consulta a la base falló. Vuelve a cargar la página en un momento y, si sigue
            igual, avísanos.
          </p>
        ) : rigen.length === 0 ? (
          /* Un vacío que no explica por qué está vacío hace pensar que el sistema perdió algo. Este dice las
             tres cosas que la dueña necesita saber: que todavía no hay nada declarado vigente, que su
             material no se perdió, y quién declara la vigencia. */
          <div className="pozo medida">
            <p className="t-cuerpo">Todavía no hay ningún documento declarado vigente en tu empresa.</p>
            <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>
              No se perdió nada tuyo: lo que nos entregaste está más abajo, completo. Un documento pasa a
              regir cuando tu consultora lo declara vigente y le pone la fecha desde la que manda; hasta ese
              momento no aparece en esta lista.
            </p>
            <a href="#lo-que-entregaste" className="boton boton--secundario mt-4">Ver lo que nos entregaste</a>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rigen.map((d) => (
              <li key={d.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div style={{ minWidth: 0 }}>
                    <p className="t-cuerpo fuerte">{d.nombre}</p>
                    <p className="t-dato" style={{ color: "var(--grafito)" }}>
                      {/* `vigente_desde` es un día, no un instante: se formatea con fechaDia para que no se
                          corra un día al imprimirlo en la zona horaria del servidor. Y si no está, se dice
                          que no está: no se pone la fecha de hoy ni se deja el hueco en blanco. */}
                      {d.vigente_desde ? `Rige desde el ${fechaDia(d.vigente_desde)}` : "No está registrado desde cuándo rige"}
                      {" · "}
                      {d.version ? `Versión ${d.version}` : "Sin número de versión"}
                    </p>
                  </div>
                  <span className="estado ok" style={{ flex: "none" }}>{ESTADOS.vigente.nombre}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CONTROL DOCUMENTAL (ISO 9001 7.5): versión, quién aprobó, y las anteriores marcadas
          como reemplazadas en vez de borradas. Auditoría del 29-08-2026. */}
      <section aria-labelledby="preparamos-titulo">
        <h2 id="preparamos-titulo" className="t-seccion mt-10 mb-1">Lo que preparamos contigo</h2>
        <p className="t-dato medida mb-3" style={{ color: "var(--grafito)" }}>
          Los documentos que armamos para tu empresa, con su versión. Nada se pierde: al aprobar una versión
          nueva, la anterior queda guardada como reemplazada.
        </p>
        <ControlDocumental companyId={c.companyId} grupos={grupos} />
      </section>

      <section id="lo-que-entregaste" aria-labelledby="entregaste-titulo">
        <h2 id="entregaste-titulo" className="t-seccion mt-10 mb-1">Lo que nos entregaste</h2>
        <p className="t-dato medida mb-4" style={{ color: "var(--grafito)" }}>
          El material que recibimos de ti: documentos, fotos y notas de voz. Todavía no rige nada de esto —es
          la base con la que trabajamos— y no se borra nunca.
        </p>
        <Subir companyId={c.companyId} paraCliente transcriptor={hayTranscriptor()} />

        <div className="mt-6">
          {noSePudoLeerEntregado ? (
            <p className="aviso aviso--error medida" role="alert">
              No pudimos leer la lista de lo que nos entregaste en este momento. Tu material sigue guardado:
              lo que falló es la consulta. Vuelve a cargar la página en un momento.
            </p>
          ) : !fuentes.length ? (
            <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>{VACIO.fuentes}</p>
          ) : (
            <ul className="flex flex-col">
              {fuentes.map((f) => (
                <li key={f.id} className="py-3 flex flex-wrap justify-between gap-2" style={{ borderBottom: "1px solid var(--linea)" }}>
                  <span className="t-cuerpo">{f.nombre}</span>
                  <span className="t-dato" style={{ color: f.estado === "error" ? "var(--contradicho)" : "var(--grafito)" }}>
                    {ESTADO_FUENTE[f.estado] ?? f.estado} · {f.claims?.[0]?.count ?? 0} definiciones · {fechaCorta(f.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

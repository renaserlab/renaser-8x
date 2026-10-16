import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { usuarioActual } from "@/lib/auth";
import { exigirAutoridad } from "@/lib/autoridad";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { fechaCorta } from "@/lib/textos";
import { BarraFicha } from "@/components/direccion/AccionesDireccion";
import { FichaDireccion } from "@/components/direccion/FichaDireccion";
import {
  borradorVigente, acordadaVigente, versionDe, historial, describirFuentes, fuentesDe, pendientesDeRevision, tieneQueAcordar,
  NOMBRE_ESTADO, type FichaGuardada, type VersionResumida,
} from "@/lib/ficha-direccion";

export const dynamic = "force-dynamic";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Carga = {
  borrador: FichaGuardada | null;
  acordada: FichaGuardada | null;
  versiones: VersionResumida[];
  /** La versión del historial que se pidió leer, si existe y es de esta empresa. */
  elegida: FichaGuardada | null;
};

/** Lo que la página lee de la ficha. Si la tabla no existe todavía en esta base, devuelve el motivo en vez de tumbar la pantalla. */
async function cargar(companyId: string, pedida: string | undefined): Promise<{ carga: Carga | null; fallo: string | null }> {
  const sb = supabaseAdmin();
  try {
    const [borrador, acordada, versiones] = await Promise.all([borradorVigente(companyId, sb), acordadaVigente(companyId, sb), historial(companyId, sb)]);
    const elegida = pedida && ES_UUID.test(pedida) ? await versionDe(companyId, pedida, sb) : null;
    return { carga: { borrador, acordada, versiones, elegida }, fallo: null };
  } catch (e) {
    return { carga: null, fallo: e instanceof Error ? e.message : String(e) };
  }
}

function Historial({ companyId, versiones, nombres, viendo }: { companyId: string; versiones: VersionResumida[]; nombres: Map<string, string>; viendo: string | null }) {
  const numeroDe = new Map(versiones.map((v) => [v.id, v.version]));
  // Un borrador que se acordó no «se quedó sin acordar»: su contenido pasó a la versión que lo reemplaza.
  const acordadoComo = new Map(versiones.filter((v) => v.reemplaza_a).map((v) => [String(v.reemplaza_a), v.version]));
  return (
    <section className="mt-10" aria-labelledby="historial-ficha">
      <h2 id="historial-ficha" className="t-seccion mb-1">Historial de versiones</h2>
      <p className="t-dato mb-4 medida" style={{ color: "var(--grafito)" }}>
        Ninguna versión se borra. Al acordar nace una versión nueva y la anterior queda como reemplazada, para poder leer qué se acordó y cuándo.
      </p>
      <table className="tabla">
        <thead>
          <tr>
            <th>Versión</th>
            <th>Estado</th>
            <th>Creada</th>
            <th>Acordada</th>
            <th>Sale de</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {versiones.map((v) => (
            <tr key={v.id}>
              <td className="t-dato">Versión {v.version}</td>
              <td style={{ color: v.estado === "acordada" ? "var(--confirmado)" : v.estado === "reemplazada" ? "var(--grafito)" : "var(--tinta)" }}>{NOMBRE_ESTADO[v.estado]}</td>
              <td className="t-dato">
                {fechaCorta(v.created_at)}
                {v.creada_por && nombres.get(v.creada_por) ? ` · ${nombres.get(v.creada_por)}` : ""}
              </td>
              <td className="t-dato">
                {v.acordada_at ? (
                  `${fechaCorta(v.acordada_at)}${v.acordada_por && nombres.get(v.acordada_por) ? ` · ${nombres.get(v.acordada_por)}` : ""}`
                ) : (
                  <span style={{ color: "var(--grafito)" }}>{acordadoComo.has(v.id) ? `se acordó como versión ${acordadoComo.get(v.id)}` : v.estado === "borrador" ? "todavía no" : "no se acordó"}</span>
                )}
              </td>
              <td className="t-dato">{v.reemplaza_a && numeroDe.has(v.reemplaza_a) ? `el borrador versión ${numeroDe.get(v.reemplaza_a)}` : <span style={{ color: "var(--grafito)" }}>—</span>}</td>
              <td className="t-dato">
                {viendo === v.id ? (
                  <span style={{ color: "var(--grafito)" }}>la estás leyendo</span>
                ) : (
                  <Link href={`/empresa/${companyId}/direccion?version=${v.id}`} style={{ textDecoration: "underline" }}>
                    Leer
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * LA FICHA DE DIRECCIÓN EMPRESARIAL, DEL LADO DE LA CONSULTORA. Los diez bloques en una página, cada frase con
 * su etiqueta y su fuente; debajo, de quién depende la empresa, descrito y no puntuado; y al final el historial.
 * Se trabaja sobre un borrador: «Armar» lo llena con lo que el dueño ya contó, «Proponer interpretaciones»
 * encola al asistente y «Acordar versión» (con autoridad) lo vuelve la versión que el dueño ve en su portal.
 */
export default async function DireccionPag({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const { id } = await params;
  const { version: pedida } = await searchParams;
  const { carga, fallo } = await cargar(id, pedida);

  const encabezado = (
    <Encabezado
      titulo="Dirección"
      sub="Hacia dónde quiere llevar su empresa el dueño, con sus palabras. Cada frase dice qué es: algo que dijo él, algo que interpretamos o algo que acordamos."
    />
  );

  if (!carga)
    return (
      <>
        {encabezado}
        <Vacio texto="No se pudo leer la ficha de dirección en esta base. Si la tabla todavía no existe, falta aplicar supabase/migracion-entrada-y-direccion.sql.">
          <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>Detalle: {fallo}</p>
        </Vacio>
      </>
    );

  const sb = supabaseAdmin();
  const { borrador, acordada, versiones, elegida } = carga;
  const ficha = elegida ?? borrador ?? acordada;
  const editable = !!ficha && !!borrador && ficha.id === borrador.id;

  const idsPersonas = [...new Set(versiones.flatMap((v) => [v.creada_por, v.acordada_por]).filter((x): x is string => !!x))];
  const [perfil, { data: enCola }, { data: personas }, fuentes] = await Promise.all([
    usuarioActual(),
    sb.from("jobs").select("id").eq("company_id", id).eq("tipo", "ficha_direccion").in("estado", ["pendiente", "corriendo"]).order("created_at", { ascending: false }).limit(1),
    idsPersonas.length ? sb.from("users").select("id,nombre,email").in("id", idsPersonas) : Promise.resolve({ data: [] as { id: string; nombre: string | null; email: string | null }[] }),
    ficha ? describirFuentes(fuentesDe(ficha), sb) : Promise.resolve({} as Record<string, string>),
  ]);
  const puedeAcordar = perfil ? await exigirAutoridad(perfil, "aprobar_hallazgo").then(() => true, () => false) : false;
  const nombres = new Map((personas ?? []).map((p) => [String(p.id), (p.nombre as string | null) ?? (p.email as string | null) ?? "sin nombre"]));
  const vacia = !borrador || !tieneQueAcordar(borrador);
  const sinRevisar = borrador ? pendientesDeRevision(borrador).total : 0;

  return (
    <>
      {encabezado}

      {elegida ? (
        <p className="t-dato mb-6 medida no-imprimir" style={{ color: "var(--grafito)" }}>
          Estás leyendo la versión {elegida.version} ({NOMBRE_ESTADO[elegida.estado].toLowerCase()}). No se puede editar.{" "}
          <Link href={`/empresa/${id}/direccion`} style={{ textDecoration: "underline" }}>
            Volver a la versión de trabajo
          </Link>
        </p>
      ) : (
        <BarraFicha
          companyId={id}
          fichaId={borrador?.id ?? null}
          hayAcordada={!!acordada}
          vacia={vacia}
          sinRevisar={sinRevisar}
          puedeAcordar={puedeAcordar}
          jobEnCurso={enCola?.[0]?.id ?? null}
        />
      )}

      {!ficha ? (
        <Vacio texto="Todavía no hay ficha de dirección. «Armar con lo que ya hay» la llena con lo que el dueño contó en la entrada breve y en la entrevista, con sus números y con los procesos del mapa. No se le vuelve a preguntar nada." />
      ) : (
        <>
          <p className="t-dato mb-2" style={{ fontWeight: 600 }}>
            Versión {ficha.version} · {NOMBRE_ESTADO[ficha.estado]}
            {ficha.estado === "acordada" && ficha.acordada_at ? ` el ${fechaCorta(ficha.acordada_at)}` : ""}
          </p>
          <p className="t-dato mb-6 medida" style={{ color: "var(--grafito)" }}>
            {ficha.estado === "borrador"
              ? acordada
                ? `Es el borrador de trabajo. El dueño sigue viendo la versión ${acordada.version}, acordada el ${fechaCorta(acordada.acordada_at)}, hasta que acuerdes esta.`
                : "Es el borrador de trabajo. El dueño todavía no ve nada: verá la ficha cuando acuerdes una versión."
              : ficha.estado === "acordada"
                ? "Es la versión que el dueño ve en su portal. Para cambiarla se abre un borrador nuevo; esta queda en el historial."
                : "Esta versión fue reemplazada por una posterior. Queda como constancia."}
          </p>
          <FichaDireccion companyId={id} ficha={ficha} fuentes={fuentes} editable={editable} />
        </>
      )}

      {versiones.length > 0 && <Historial companyId={id} versiones={versiones} nombres={nombres} viendo={ficha?.id ?? null} />}
    </>
  );
}

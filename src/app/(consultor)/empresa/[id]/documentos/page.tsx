import { supabaseAdmin } from "@/lib/supabase/admin";
import { usuarioActual } from "@/lib/auth";
import { exigirAcceso } from "@/lib/api";
import { Encabezado } from "@/components/base/Vacio";
import { CLAVES_VARA } from "@/lib/metodo/varas";
import { ESTADOS, type Estado } from "@/lib/expediente";
import { Documentos, SubirDocumento, type DocumentoEnLista } from "@/components/expediente/Documentos";

export const dynamic = "force-dynamic";

/**
 * LOS DOCUMENTOS DE LA EMPRESA.
 *
 * Kelin, 22-10-2026: «los documentos desorganizados, no hay a dónde subir, no hay cómo verlos».
 * Tenía razón entera. La tabla `expediente_documental` se llenaba pegando SQL en el editor de
 * Supabase, y la única pantalla de todo el producto que la leía era el portal del dueño —y solo los
 * vigentes—. Veinticuatro documentos del primer cliente dentro, veintidós invisibles para quien
 * tiene que trabajarlos.
 *
 * Esta pantalla es ese lugar: se ven todos, se abren, se les asigna su vara, se mueven de estado y
 * se dan de alta los que falten.
 */
export default async function PantallaDocumentos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await usuarioActual();
  if (perfil) await exigirAcceso(perfil, id);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("expediente_documental")
    .select("id,nombre,estado,clave_vara,contenido,nota_consultora,revision_documental(count)")
    .eq("company_id", id)
    .order("nombre");

  // Si no se pudo leer, se dice. Una lista vacía por un fallo de lectura se lee como «no hay
  // documentos», y es la diferencia entre no tener nada y no haber podido mirar.
  if (error) {
    return (
      <>
        <Encabezado titulo="Documentos" sub="Lo que la empresa ya tiene, con la vara contra la que se mide." />
        <section className="tarjeta a-lo-ancho" role="alert">
          <p className="t-dato" style={{ margin: 0, color: "var(--caducado)" }}>
            No se pudieron leer los documentos: {error.message}. No quiere decir que no haya: quiere decir que no
            se pudieron leer.
          </p>
        </section>
      </>
    );
  }

  const docs: DocumentoEnLista[] = (data ?? []).map((d) => ({
    id: d.id as string,
    nombre: d.nombre as string,
    estado: d.estado as Estado,
    clave_vara: (d.clave_vara as string | null) ?? null,
    caracteres: ((d.contenido as string | null) ?? "").length,
    revisiones: ((d.revision_documental as unknown as { count: number }[] | null)?.[0]?.count ?? 0),
    nota: (d.nota_consultora as string | null) ?? null,
  }));

  const sinTexto = docs.filter((d) => !d.caracteres).length;
  const sinVara = docs.filter((d) => !d.clave_vara && d.estado !== "insumo").length;
  const sinMedir = docs.filter((d) => d.caracteres && d.clave_vara && !d.revisiones).length;
  const vigentes = docs.filter((d) => d.estado === "vigente").length;

  return (
    <>
      <Encabezado
        titulo="Documentos"
        sub="Lo que la empresa ya tiene: sus manuales, procedimientos y contratos, con la vara contra la que se mide cada uno."
        acciones={<SubirDocumento companyId={id} varas={CLAVES_VARA} />}
      />

      <section className="tarjeta a-lo-ancho" aria-label="Resumen">
        <p className="t-dato" style={{ margin: 0 }}>
          <strong>{docs.length}</strong> {docs.length === 1 ? "documento" : "documentos"} ·{" "}
          <strong>{vigentes}</strong> {vigentes === 1 ? "vigente" : "vigentes"}
          {sinMedir ? <> · <strong>{sinMedir}</strong> con vara y sin medir</> : null}
          {sinVara ? <> · <strong>{sinVara}</strong> sin vara asignada</> : null}
          {sinTexto ? <> · <strong>{sinTexto}</strong> sin texto</> : null}
        </p>
        {/* Lo vigente es lo único que el dueño ve en su portal. Decirlo aquí evita la sorpresa de
            creer que el cliente está viendo veinticuatro documentos cuando ve dos. */}
        <p className="nota" style={{ margin: "8px 0 0", fontSize: 13 }}>
          En el portal del dueño solo aparece lo <strong>vigente</strong>: hoy, {vigentes} de {docs.length}.
          {sinVara ? " Un documento sin vara no se puede medir, y sin medir no se puede mejorar." : ""}
        </p>
      </section>

      <section className="tarjeta a-lo-ancho" aria-label="Lista de documentos">
        <Documentos companyId={id} docs={docs} varas={CLAVES_VARA} />
      </section>

      <p className="nota a-lo-ancho" style={{ padding: "0 4px", fontSize: 13.5 }}>
        Los estados van en orden: {(Object.keys(ESTADOS) as Estado[])
          .filter((e) => e !== "insumo")
          .map((e) => ESTADOS[e].nombre)
          .join(" → ")}
        . Y aparte, fuera de ese camino, <strong>{ESTADOS.insumo.nombre}</strong>: {ESTADOS.insumo.que_significa}
      </p>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { usuarioActual } from "@/lib/auth";
import { exigirAcceso } from "@/lib/api";
import { Encabezado } from "@/components/base/Vacio";
import { ESTADOS, type Estado } from "@/lib/expediente";
import { VARAS } from "@/lib/metodo/varas";

export const dynamic = "force-dynamic";

/**
 * UN DOCUMENTO, ABIERTO.
 *
 * Lo que el expediente tenía era el texto guardado y ninguna forma de leerlo: para ver qué decía un
 * manual había que consultarlo en la base. Aquí se abre y se lee, con lo que ya se sabe de él
 * arriba —su estado, su vara y lo que la medición encontró— porque leer un documento sin saber qué
 * le falta es volver a empezar cada vez.
 */
export default async function VerDocumento({ params }: { params: Promise<{ id: string; d: string }> }) {
  const { id, d } = await params;
  const perfil = await usuarioActual();
  if (perfil) await exigirAcceso(perfil, id);

  const sb = supabaseAdmin();
  const { data: doc } = await sb
    .from("expediente_documental")
    .select("nombre,estado,clave_vara,contenido,nota_consultora,version,vigente_desde,aprobado_por,drive_id")
    .eq("company_id", id)
    .eq("id", d)
    .maybeSingle();
  if (!doc) notFound();

  const texto = (doc.contenido as string | null) ?? "";
  const estado = ESTADOS[doc.estado as Estado];
  const clave = doc.clave_vara as string | null;
  const vara = clave ? VARAS[clave] : null;
  const base = `/empresa/${id}`;

  return (
    <>
      <Encabezado
        titulo={doc.nombre as string}
        sub={
          <>
            <span className={doc.estado === "vigente" ? "estado ok" : "estado"}>{estado.nombre}</span> ·{" "}
            {estado.que_significa}
          </>
        }
        acciones={
          <Link href={`${base}/documentos`} className="boton-secundario">
            Volver a los documentos
          </Link>
        }
      />

      <section className="tarjeta a-lo-ancho" aria-label="Con qué se mide">
        {vara ? (
          <>
            <h2 className="t-seccion" style={{ marginTop: 0 }}>Se mide como {vara.tipo}</h2>
            <p className="t-dato" style={{ margin: 0 }}>{vara.para_que_sirve}</p>
            <p className="nota" style={{ marginBottom: 0 }}>
              {vara.exigencias.length} exigencias, {vara.exigencias.filter((e) => e.obligatoria).length} de ellas
              obligatorias. Sin las obligatorias el documento no se entrega.
            </p>
          </>
        ) : (
          <p className="t-dato" style={{ margin: 0 }}>
            {doc.estado === "insumo"
              ? "No se mide con ninguna vara, y está bien: es material que la empresa aportó, no un entregable. Se lee antes de escribir el documento que sí corresponde."
              : "Todavía no tiene vara asignada, así que no se puede medir. Se le asigna desde la lista de documentos."}
          </p>
        )}
      </section>

      {doc.nota_consultora ? (
        <section className="tarjeta a-lo-ancho" aria-label="Nota de la consultora">
          <h2 className="t-seccion" style={{ marginTop: 0 }}>Lo que se sabe de este documento</h2>
          <p className="t-dato" style={{ margin: 0 }}>{doc.nota_consultora as string}</p>
        </section>
      ) : null}

      <section className="tarjeta a-lo-ancho" aria-label="El documento">
        <h2 className="t-seccion" style={{ marginTop: 0 }}>
          El documento
          <span className="t-dato" style={{ color: "var(--grafito)", fontWeight: 400, marginLeft: 10 }}>
            {texto ? `${Math.max(1, Math.round(texto.length / 1024))} KB` : "sin texto"}
          </span>
        </h2>
        {texto ? (
          // Se muestra el texto tal como entró, sin interpretarlo: es la materia prima del cliente y
          // cualquier formato que le pongamos encima es una lectura nuestra, no la suya.
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              maxHeight: "60vh",
              overflow: "auto",
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            {texto}
          </pre>
        ) : (
          <p className="t-dato" style={{ margin: 0 }}>
            Está registrado pero su texto no se trajo, así que no se puede medir contra su vara.
            {doc.drive_id ? " Vive en el Drive del cliente." : ""}
          </p>
        )}
      </section>
    </>
  );
}

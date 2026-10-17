import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { LoQueEstamosProbando } from "@/components/iniciativas/LoQueEstamosProbando";
import { iniciativasDelCliente } from "@/app/api/companies/[id]/iniciativas/_datos";

export const dynamic = "force-dynamic";

/**
 * LO QUE ESTAMOS PROBANDO: la pantalla del dueño. Las apuestas que ya se aprobaron o están en curso, con
 * qué creemos que va a pasar, cómo sabremos si funcionó y hasta cuándo se prueban. Las propuestas no
 * llegan aquí: `iniciativasDelCliente` pide a la base solo lo aprobado y lo que está en curso, y de cada
 * fila entrega lo que al dueño le toca (del responsable solo el puesto, de las fuentes solo el nombre).
 */
export default async function IniciativasCliente() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const iniciativas = await iniciativasDelCliente(c.companyId);

  return (
    <>
      <p className="t-etiqueta">Las apuestas de tu empresa</p>
      <h1 className="t-titulo mt-2 mb-2">Lo que estamos probando</h1>
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Cada apuesta dice qué creemos que va a pasar, cómo sabremos si funcionó y hasta cuándo la probamos. Cuando llega la fecha se decide con lo que se vea: seguir, cambiar algo o parar.
      </p>
      {iniciativas.length === 0 ? (
        <div className="pozo medida">
          <p className="t-cuerpo">Todavía no hay ninguna apuesta aprobada. Cuando acordemos la primera aparece aquí, con su plazo y con cómo sabremos si funcionó.</p>
          <Link href="/portal/plan" className="boton boton--secundario mt-4">Ver tu plan</Link>
        </div>
      ) : (
        <LoQueEstamosProbando iniciativas={iniciativas} />
      )}
    </>
  );
}

import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generar, paraCliente, semanaEnCurso, zonaDeEmpresa, esLunes, sumarDias } from "@/lib/revision-semanal";
import { SemanaCliente } from "@/components/revision/SemanaCliente";

export const dynamic = "force-dynamic";

/**
 * «ESTA SEMANA» — la pantalla del dueño. Qué se esperaba de ti y de tu equipo, qué se hizo y qué falta, en
 * frases cortas y sin culpa. Se arma al abrir, con lo mismo que ve la consultora, dicho con las palabras del
 * dueño. Si la consultora ya escribió su explicación de la semana, aparece abajo.
 *
 * Aquí la semana por defecto es LA QUE ESTÁ CORRIENDO (el dueño mira lo que tiene por delante); la consultora,
 * en su revisión, abre la que terminó. En los dos casos la semana se cuenta con el reloj de la empresa: el lunes
 * empieza a la medianoche de la empresa, no a la de UTC.
 */
export default async function SemanaPag({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const ahora = new Date();
  const zona = await zonaDeEmpresa(c.companyId, sb);
  const estaSemana = semanaEnCurso(ahora, zona);
  const semana = esLunes(sp.semana) && sp.semana <= estaSemana ? sp.semana : estaSemana;
  const revision = await generar(c.companyId, semana, sb, ahora, zona);
  const datos = paraCliente(revision);
  const anterior = sumarDias(semana, -7);

  return (
    <>
      <p className="t-etiqueta">{datos.nombre}</p>
      <h1 className="t-titulo mt-2 mb-2">{semana === estaSemana ? "Esta semana" : "Esa semana"}</h1>
      <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
        Lo que tenía fecha, lo que se hizo y lo que falta. Lo que falta trae su siguiente paso; si no tienes un dato, se anota como sin dato, nunca como cero.
      </p>
      <SemanaCliente datos={datos} />
      <nav className="flex flex-wrap gap-3 mt-6 no-imprimir" aria-label="Otras semanas">
        <Link href={`/portal/semana?semana=${anterior}`} className="t-dato" style={{ color: "var(--grafito)", textDecoration: "underline" }}>Ver la semana anterior</Link>
        {semana !== estaSemana && <Link href="/portal/semana" className="t-dato" style={{ color: "var(--grafito)", textDecoration: "underline" }}>Volver a esta semana</Link>}
      </nav>
    </>
  );
}

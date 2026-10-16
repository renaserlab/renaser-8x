import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { RevisionSemanal } from "@/components/revision/RevisionSemanal";
import { fechaDia } from "@/lib/medicion";
import { generar, esLunes, semanaEnCurso, semanaPorDefecto, zonaDeEmpresa, diaEnZona } from "@/lib/revision-semanal";

export const dynamic = "force-dynamic";

/**
 * LA REVISIÓN SEMANAL DE LA CONSULTORA. Las siete preguntas de Dirección, en orden, armadas al abrir la página
 * con lo que hay en la base (determinista: con los mismos datos y la misma fecha sale lo mismo). Lo que la
 * consultora escribe (explicación, decisión, siguiente) se guarda por semana y no se pisa.
 *
 * Si no se pide otra, se abre LA SEMANA QUE TERMINÓ: la revisión se hace el lunes y mira la anterior. Los días se
 * cuentan con el reloj de la empresa (su zona horaria, o la de Lima), no con el del servidor.
 */
export default async function RevisionPag({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semana?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const ahora = new Date();
  const zona = await zonaDeEmpresa(id, sb);
  const porDefecto = semanaPorDefecto(ahora, zona);
  const semana = esLunes(sp.semana) ? sp.semana : porDefecto;
  const revision = await generar(id, semana, sb, ahora, zona);
  let revisadaPor: string | null = null;
  if (revision.revisada_por) {
    const { data } = await sb.from("users").select("nombre").eq("id", revision.revisada_por).maybeSingle();
    revisadaPor = (data?.nombre as string | null) ?? null;
  }
  const diaRevisada = diaEnZona(revision.revisada_at, zona);
  return (
    <>
      <Encabezado
        titulo="Revisión semanal"
        sub="Qué debía ocurrir, qué ocurrió, con qué evidencia, qué se desvió, por qué, qué decisión hace falta y qué sigue. Una tarea cumplida no es un resultado; la falta de dato no es cero."
      />
      {/* La clave es la semana: al cambiar de semana las cajas nacen de nuevo y lo escrito para una no viaja a otra. */}
      <RevisionSemanal
        key={revision.semana}
        companyId={id}
        revision={revision}
        revisadaPor={revisadaPor}
        revisadaEl={diaRevisada ? fechaDia(diaRevisada) : null}
        semanaQueTermino={porDefecto}
        semanaEnCurso={semanaEnCurso(ahora, zona)}
      />
    </>
  );
}

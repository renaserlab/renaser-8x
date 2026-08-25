import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Hallazgo, type HallazgoRow } from "@/components/diagnostico/Hallazgo";
import { BotonJob } from "@/components/consultor/BotonJob";
import { NuevoHallazgo } from "@/components/diagnostico/NuevoHallazgo";
import { PILAR, PILAR_PREGUNTA, ESTADO_PILAR, VACIO } from "@/lib/textos";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = { solido: "var(--confirmado)", mejorable: "var(--caducado)", critico: "var(--contradicho)", desconocido: "var(--grafito)" };

/** Diagnóstico 4P + revisión de hallazgos. Un hallazgo sin evidencia no se muestra: regla en la consulta. */
export default async function Diagnostico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pilar?: string; estado?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: diag }, { data: hallazgos }, { data: contradichas }] = await Promise.all([
    sb.from("diagnoses").select("*").eq("company_id", id),
    sb.from("findings").select("*, finding_evidence(claim_id, relacion, claims(id,texto,estado,fecha_afirmacion,source_id,fragment_id,sources(nombre,tipo,fecha_origen),participants(nombre,rol,puesto)))").eq("company_id", id).order("created_at", { ascending: false }),
    sb.from("claims").select("pilar").eq("company_id", id).eq("estado", "contradicho"),
  ]);
  const porPilar = Object.fromEntries((diag ?? []).map((d) => [d.pilar, d]));
  const abiertas: Record<string, number> = {};
  for (const c of contradichas ?? []) abiertas[c.pilar ?? "transversal"] = (abiertas[c.pilar ?? "transversal"] ?? 0) + 1;
  const lista = ((hallazgos ?? []) as HallazgoRow[])
    .filter((h) => h.finding_evidence?.some((e) => e.relacion === "sustenta"))
    .filter((h) => !sp.pilar || h.pilar === sp.pilar)
    .filter((h) => !sp.estado || h.estado_revision === sp.estado);
  const pendientes = lista.filter((h) => h.estado_revision === "pendiente");

  return (
    <>
      <Encabezado
        titulo="Diagnóstico 4P"
        sub="Corre por pilar, uno a la vez. Se bloquea si el pilar tiene contradicciones abiertas. DESCONOCIDO es un resultado honesto."
        acciones={<BotonJob url={`/api/companies/${id}/diagnose`} texto="Diagnosticar los 4 pilares" confirmar="Esto reemplaza los hallazgos pendientes generados por IA. Los ya revisados se conservan. ¿Continuar?" />}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        {["personas", "procesos", "producto", "marketing"].map((p) => {
          const d = porPilar[p];
          return (
            <div key={p} className="panel p-5 flex flex-col gap-3" style={{ borderTop: `3px solid ${d ? COLOR[d.estado] : "var(--linea)"}` }}>
              <Link href={`/empresa/${id}/diagnostico?pilar=${p}`} className="t-etiqueta">{PILAR[p]}</Link>
              <div className="t-seccion" style={{ color: d ? COLOR[d.estado] : "var(--grafito)" }}>{d ? ESTADO_PILAR[d.estado] : "Sin diagnosticar"}</div>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>{PILAR_PREGUNTA[p]}</p>
              {abiertas[p] ? (
                <p className="t-dato" style={{ color: "var(--contradicho)" }}>
                  {abiertas[p]} contradicción(es) abierta(s) —{" "}
                  <Link href={`/empresa/${id}/afirmaciones?estado=contradicho`} style={{ textDecoration: "underline" }}>resuélvelas aquí</Link>{" "}
                  (elige cuál versión vale hoy) o diagnostica igual
                </p>
              ) : null}
              <BotonJob url={`/api/companies/${id}/diagnose`} json={{ pilar: p, forzar: !!abiertas[p] }} texto={abiertas[p] ? "Diagnosticar igual" : "Diagnosticar"} secundario />
            </div>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h2 className="t-seccion">Hallazgos</h2>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{lista.length} · {pendientes.length} por revisar</span>
        <div className="ml-auto flex gap-2">
          <Link href={`/empresa/${id}/diagnostico`} className="boton boton--secundario" style={{ minHeight: 36 }}>Todos</Link>
          <Link href={`/empresa/${id}/diagnostico?estado=pendiente`} className="boton boton--secundario" style={{ minHeight: 36 }}>Pendientes</Link>
          <Link href={`/empresa/${id}/diagnostico?estado=aprobado`} className="boton boton--secundario" style={{ minHeight: 36 }}>Aprobados</Link>
        </div>
      </div>

      {lista.length === 0 ? <Vacio texto={VACIO.hallazgos} /> : <div className="flex flex-col gap-5">{lista.map((h) => <Hallazgo key={h.id} h={h} modo="consultor" />)}</div>}

      <section className="mt-12">
        <NuevoHallazgo companyId={id} />
      </section>
    </>
  );
}

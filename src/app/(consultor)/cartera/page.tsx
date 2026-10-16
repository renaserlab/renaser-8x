import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Franja, Lectura } from "@/components/base/Franja";
import { cargarCartera, filtrar, filtroDe, type FiltroCartera } from "@/lib/cartera";
import { fechaDia } from "@/lib/medicion";
import { CargaConsultores } from "@/components/cartera/CargaConsultores";
import { FiltrosCartera } from "@/components/cartera/FiltrosCartera";
import { TablaCartera } from "@/components/cartera/TablaCartera";
import { contar } from "@/components/cartera/Celda";

export const dynamic = "force-dynamic";

type Parametro = string | string[] | undefined;
const primero = (v: Parametro): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * LA CARTERA: LA VISTA DE DIRECCIÓN DE RENASER (R16.1). Arriba, cómo está repartido el trabajo entre consultores;
 * después, una empresa por fila con quién la lleva, qué se contrató, en qué fase del método está, qué prioridades
 * tiene abiertas, cuál es la próxima decisión, qué compromisos y entregas hay, qué está bloqueado y si ya hay un
 * resultado medido. Primero sale lo que exige una decisión o está bloqueado. No hay porcentajes de avance: todo
 * lo que se muestra es algo que se contó, y lo que no se pudo leer dice «sin dato» en vez de cero.
 */
export default async function Cartera({ searchParams }: { searchParams: Promise<{ consultor?: Parametro; fase?: Parametro }> }) {
  const sp = await searchParams;
  const cartera = await cargarCartera(supabaseAdmin());
  const pedido = filtroDe({ consultor: primero(sp.consultor), fase: primero(sp.fase) });
  // Un filtro que no vale no esconde empresas: se dice y se muestra la cartera entera.
  const filtro: FiltroCartera = pedido.ok ? pedido.filtro : {};
  const visibles = filtrar(cartera.filas, filtro);
  const r = cartera.resumen;

  return (
    <>
      <Encabezado titulo="Cartera" sub={`${contar(r.empresas, "empresa", "empresas")}, ${r.activas} ${r.activas === 1 ? "activa" : "activas"} · al ${fechaDia(cartera.hoy)}`} />

      {cartera.avisos.length > 0 && (
        <section className="panel p-4 mb-8" role="status" aria-label="Lo que no se pudo leer" style={{ borderColor: "var(--caducado)" }}>
          <h2 className="t-etiqueta mb-2" style={{ color: "var(--caducado)" }}>Lo que esta pantalla no pudo leer</h2>
          <ul className="flex flex-col gap-1">
            {cartera.avisos.map((a) => (
              <li key={a} className="t-dato">{a}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10" aria-labelledby="carga-titulo">
        <h2 id="carga-titulo" className="t-seccion mb-3">Carga por consultor</h2>
        <CargaConsultores carga={cartera.carga} elegido={filtro.consultor ?? null} />
      </section>

      <Franja columnas={4}>
        <Lectura divisor={false} valor={String(r.exigenDecision)} etiqueta="esperan decisión" color={r.exigenDecision > 0 ? "var(--marca)" : "var(--grafito)"} />
        <Lectura valor={String(r.conBloqueo)} etiqueta="con algo bloqueado" color={r.conBloqueo > 0 ? "var(--contradicho)" : "var(--grafito)"} />
        <Lectura valor={String(r.compromisosVencidos)} etiqueta="compromisos vencidos" color={r.compromisosVencidos > 0 ? "var(--contradicho)" : "var(--grafito)"} />
        <Lectura valor={String(r.sinConsultor)} etiqueta="sin consultor" color={r.sinConsultor > 0 ? "var(--caducado)" : "var(--grafito)"} />
      </Franja>
      <p className="t-dato mt-3 mb-10" style={{ color: "var(--grafito)" }}>
        Compromisos de RENASER que vencen en los próximos siete días: {r.compromisosQueVencenPronto} · Entregas pendientes de publicar: {r.entregasPendientes} · Fuentes atascadas: {r.fuentesAtascadas} · Trabajos fallidos: {r.trabajosFallidos}
      </p>

      <section aria-labelledby="empresas-titulo">
        <h2 id="empresas-titulo" className="t-seccion mb-3">Empresas</h2>
        <FiltrosCartera consultores={cartera.consultores} filtro={filtro} visibles={visibles.length} total={cartera.filas.length} />
        {!pedido.ok && (
          <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>{pedido.error} Se muestra la cartera completa.</p>
        )}
        <div className="mt-6">
          {cartera.filas.length === 0 ? (
            <Vacio texto="Todavía no hay empresas en la cartera." accion="Crear la primera" href="/empresas/nueva" />
          ) : visibles.length === 0 ? (
            <Vacio texto="Ninguna empresa coincide con ese filtro." accion="Quitar filtros" href="/cartera" />
          ) : (
            <TablaCartera filas={visibles} consultores={cartera.consultores} />
          )}
        </div>
      </section>
    </>
  );
}

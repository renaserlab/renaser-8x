import { protegido, ok } from "@/lib/api";
import { fallidosPorPausa, reencolarSeguro } from "@/lib/jobs/queue";

/**
 * LOS TRABAJOS QUE SE PERDIERON POR FALTA DE CRÉDITO, DE VUELTA A LA COLA. El 28-09-2026 fueron 81
 * (76 preguntas de entrevista ya pagadas). Uno por uno con el botón «Reintentar» eran 81 clics; esto
 * los reencola en lote, con la misma cabeza que el reintento individual: no repite lo que un trabajo
 * posterior ya hizo bien, no borra el original y no reencola dos veces el mismo.
 *
 * GET dice cuántos son (lo que la torre muestra antes de confirmar). POST los reencola. Solo consultor.
 */
export const GET = protegido({ consultor: true, cupo: "ninguno" }, async () => {
  const { filas, tope } = await fallidosPorPausa();
  return ok({ cuantos: filas.length, tope, trabajos: filas.map((f) => ({ id: f.id, tipo: f.tipo, company_id: f.company_id, created_at: f.created_at })) });
});

export const POST = protegido({ consultor: true, cupo: "ia" }, async () => {
  const { filas, tope } = await fallidosPorPausa();
  let reencolados = 0;
  const nuevos: string[] = [];
  const omitidos: { id: string; motivo: string | null }[] = [];
  // En serie, no en paralelo: cada reencolado consulta y escribe en la cola, y 81 a la vez contra la
  // base no ganan nada que no gane la paciencia de unos segundos.
  for (const f of filas) {
    const r = await reencolarSeguro(f.id);
    if (r.reencolado) {
      reencolados++;
      if (r.job_id) nuevos.push(r.job_id);
    } else {
      omitidos.push({ id: f.id, motivo: r.motivo });
    }
  }
  return ok({ candidatos: filas.length, reencolados, omitidos, nuevos, tope });
});

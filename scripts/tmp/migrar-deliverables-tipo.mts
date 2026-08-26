/** Repone el check de deliverables.tipo con la lista real + plan_estrategico. */
const q = async (query: string) => {
  const r = await fetch("https://api.supabase.com/v1/projects/otqfqafstrohugvgbkmd/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
};
console.log("tipos existentes:", JSON.stringify(await q("SELECT DISTINCT tipo FROM deliverables ORDER BY tipo")));
await q("ALTER TABLE deliverables ADD CONSTRAINT deliverables_tipo_check CHECK (tipo = ANY (ARRAY['informe_realidad','diagnostico_4p','mapa_as_is','mapa_to_be','manual_procesos','plan_90','mapa_automatizacion','plan_estrategico']::text[]))");
console.log("después:", JSON.stringify(await q("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname='deliverables_tipo_check'")));

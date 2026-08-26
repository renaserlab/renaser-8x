/** Migración: admitir 'plan_estrategico' en deliverables.tipo (el check actual lo rechaza). */
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
console.log("antes:", JSON.stringify(await q("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname='deliverables_tipo_check'")));
await q("ALTER TABLE deliverables DROP CONSTRAINT deliverables_tipo_check");
await q("ALTER TABLE deliverables ADD CONSTRAINT deliverables_tipo_check CHECK (tipo = ANY (ARRAY['diagnostico','plan','sop','informe','plan_estrategico']::text[]))");
console.log("después:", JSON.stringify(await q("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname='deliverables_tipo_check'")));

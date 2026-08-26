/** SOLO LECTURA: definición actual del check de deliverables.tipo. */
const r = await fetch("https://api.supabase.com/v1/projects/otqfqafstrohugvgbkmd/database/query", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify({ query: "SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'deliverables'::regclass AND contype = 'c'" }),
});
console.log(r.status, JSON.stringify(await r.json(), null, 1));

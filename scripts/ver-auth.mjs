const t = process.env.SUPABASE_ACCESS_TOKEN, p = process.env.SUPABASE_PROJECT_REF ?? "otqfqafstrohugvgbkmd";
const r = await fetch(`https://api.supabase.com/v1/projects/${p}/config/auth`, { headers: { Authorization: `Bearer ${t}` } });
const j = await r.json();
const claves = Object.keys(j).filter((k) => /rate_limit|password|otp_exp|refresh|reuse|security/i.test(k));
for (const k of claves) console.log(`${k} = ${j[k]}`);

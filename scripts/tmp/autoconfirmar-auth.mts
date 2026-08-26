/** Activa autoconfirmación de correo: el registro entra directo, sin correo de confirmación. */
const r = await fetch("https://api.supabase.com/v1/projects/otqfqafstrohugvgbkmd/config/auth", {
  method: "PATCH",
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify({ mailer_autoconfirm: true }),
});
const j = (await r.json()) as Record<string, unknown>;
console.log(r.status, JSON.stringify({ mailer_autoconfirm: j.mailer_autoconfirm }));

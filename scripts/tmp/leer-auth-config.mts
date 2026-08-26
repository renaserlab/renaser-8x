/** SOLO LECTURA: configuración de Auth del proyecto (¿confirmación de correo activada?). */
const r = await fetch("https://api.supabase.com/v1/projects/otqfqafstrohugvgbkmd/config/auth", {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
});
const j = (await r.json()) as Record<string, unknown>;
console.log(JSON.stringify({
  mailer_autoconfirm: j.mailer_autoconfirm,
  disable_signup: j.disable_signup,
  external_email_enabled: j.external_email_enabled,
  site_url: j.site_url,
}));

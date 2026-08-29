/**
 * ENDURECIMIENTO DE LA AUTENTICACIÓN — auditoría del 29-08-2026.
 * Antes: clave mínima de 6, sin comprobar claves filtradas, sin avisar al dueño si se la cambian.
 * ISO 27001 A.5.17 (información de autenticación).
 */
const t = process.env.SUPABASE_ACCESS_TOKEN, p = process.env.SUPABASE_PROJECT_REF ?? "otqfqafstrohugvgbkmd";
const cambios = {
  password_min_length: 8,                                  // 6 era demasiado corto
  password_hibp_enabled: true,                             // rechaza claves que ya se filtraron en otras webs
  mailer_notifications_password_changed_enabled: true,     // al dueño le llega aviso si le cambian la clave
  rate_limit_verify: 20,                                   // intentos de entrar por hora e IP: fuerza bruta
  rate_limit_anonymous_users: 20,
};
const r = await fetch(`https://api.supabase.com/v1/projects/${p}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
  body: JSON.stringify(cambios),
});
console.log(r.ok ? "OK autenticación endurecida" : `ERROR ${r.status}`);
const j = await r.json();
for (const k of Object.keys(cambios)) console.log(`  ${k} = ${j[k]}`);

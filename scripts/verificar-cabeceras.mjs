/** Comprueba en PRODUCCIÓN que las cabeceras de seguridad salen de verdad. */
const base = process.argv[2] ?? "https://8x-renaser-s-projects.vercel.app";
const EXIGIDAS = ["content-security-policy","strict-transport-security","x-frame-options","x-content-type-options","referrer-policy","permissions-policy"];

for (let i = 1; i <= 20; i++) {
  const r = await fetch(base + "/privacidad", { redirect: "manual" });
  const tiene = EXIGIDAS.filter((h) => r.headers.get(h));
  if (tiene.length === EXIGIDAS.length) {
    console.log(`DESPLEGADO (intento ${i}) — ${r.status}`);
    for (const h of EXIGIDAS) console.log(`  ${h}: ${(r.headers.get(h) ?? "").slice(0, 110)}`);
    console.log(`  x-powered-by oculto: ${!r.headers.get("x-powered-by")}`);
    const api = await fetch(base + "/api/portal/empresa", { method: "PATCH", redirect: "manual" });
    console.log(`  /api sin sesión → ${api.status} (debe ser 401)`);
    console.log(`  /api cache-control: ${api.headers.get("cache-control")}`);
    process.exit(0);
  }
  console.log(`esperando despliegue… (${i}/20, faltan ${EXIGIDAS.length - tiene.length} cabeceras)`);
  await new Promise((s) => setTimeout(s, 15000));
}
console.log("NO se desplegó a tiempo");
process.exit(1);

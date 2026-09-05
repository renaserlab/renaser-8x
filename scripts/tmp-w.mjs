const b = "https://8x-sage.vercel.app";
const antes = (await (await fetch(b + "/entrar")).text()).match(/data-dpl-id="([^"]+)"/)?.[1];
for (let i = 1; i <= 26; i++) {
  await new Promise((s) => setTimeout(s, 15000));
  const ahora = (await (await fetch(b + "/entrar")).text()).match(/data-dpl-id="([^"]+)"/)?.[1];
  if (ahora && ahora !== antes) { console.log(`DESPLEGADO (intento ${i})`); process.exit(0); }
}
console.log("no llego");
